import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { InMemoryRuntimeProvider } from "./providers/runtime/dev-provider.js";
import { parseDisabledRuntimeFeatures, restrictRuntimeProvider, RuntimeFeatureUnavailableError } from "./providers/runtime/deployment-policy.js";
import { getRuntimeCapabilities, updateSandboxEgress } from "./services/sandbox-runtime.js";
import { createSandbox, type CreateSandboxInput } from "./services/sandboxes.js";
import { createSandboxSnapshot, pauseSandbox, resumeSandbox } from "./services/sandbox-lifecycle.js";
import { registerApiErrorHandler } from "./api-error-handler.js";
import type { RuntimeTemplate } from "./templates.js";
import { provisionSandboxRuntime } from "./services/sandbox-provision.js";
import type { SandboxOperation } from "./services/sandbox-operations.js";
import type { Query } from "./services/query.js";
import type { RuntimeCreateSandboxInput } from "./providers/runtime/provider.js";

const template: RuntimeTemplate = {
  id: "restricted-test", name: "Restricted test", description: "", image: "example.test/python@sha256:abc",
  imageDigest: "sha256:abc", icon: "py", tags: [], aliases: [], bootMs: 0, visibility: "private", status: "ready",
  defaultEntrypoint: ["sleep", "3600"], cpuCount: 1, memoryMb: 512, workdir: "/workspace", defaultPorts: [], runtimeFamily: "python", templateVersionId: null
};
const disabled = parseDisabledRuntimeFeatures("egress,snapshots,pause-resume");
const restricted = () => restrictRuntimeProvider(new InMemoryRuntimeProvider(), disabled);
const noEffect = async (): Promise<never> => { throw new Error("Unexpected database, audit or provider effect"); };
const dependencies = () => ({ runtimeProvider: restricted(), query: noEffect, transaction: noEffect, recordEvent: noEffect, recordAudit: noEffect });
const identity = { organizationId: "org_test", userId: null, actorLabel: "test", sandboxId: "sbx_test" };

test("deployment feature parsing rejects typos and disables dependent injection", () => {
  assert.deepEqual(parseDisabledRuntimeFeatures(), []);
  assert.deepEqual(parseDisabledRuntimeFeatures(" egress,egress , "), ["egress", "credential-vault"]);
  assert.throws(() => parseDisabledRuntimeFeatures("snapshot"), /RUNTIME_DISABLED_FEATURES/);
});

test("unrestricted providers retain identity; restricted adapters preserve receivers and cleanup", async () => {
  class Provider extends InMemoryRuntimeProvider {
    #calls = 0;
    override async create(input: RuntimeCreateSandboxInput) {
      assert.equal(input.egressPolicy, undefined, "disabled egress must not request a no-op enforcement sidecar");
      return super.create(input);
    }
    override async list() { this.#calls += 1; return super.list(); }
    get calls() { return this.#calls; }
  }
  const provider = new Provider();
  assert.equal(restrictRuntimeProvider(provider, []), provider);
  const runtime = restrictRuntimeProvider(provider, disabled);
  assert.equal(runtime.pause, undefined);
  assert.equal(runtime.createSnapshot, undefined);
  assert.equal(runtime.applyCredentialVault, undefined);
  assert.equal(typeof runtime.deleteSnapshot, "function");
  assert.equal(typeof runtime.deleteCredentialVaultEntries, "function");
  assert.equal(provider.capabilities.snapshots, true);
  const sandbox = await runtime.create({ template, name: "test", ttlSeconds: 60, egressPolicy: { defaultAction: "allow", egress: [] } });
  assert.equal((await runtime.list()).length, 1);
  assert.equal(provider.calls, 1);
  await runtime.delete(sandbox);
  assert.equal((await runtime.get(sandbox))?.state, "terminated");
});

test("discovery reports operator-disabled features without removing normal execution", () => {
  const capabilities = getRuntimeCapabilities(restricted()).capabilities;
  for (const name of ["egressPolicy", "credentialVault", "credentialVaultPatch", "lifecycleSnapshot", "createFromSnapshot", "lifecyclePause", "lifecycleResume"]) {
    const capability = capabilities.find((item) => item.name === name);
    assert.equal(capability?.state, "unavailable", name);
    assert.equal(capability?.contract, "unavailable", name);
    assert.match(capability?.reason ?? "", /operator has disabled/);
  }
  assert.equal(capabilities.find((item) => item.name === "commandRun")?.state, "available");
});

test("provider boundary rejects snapshot and network-policy creation before dispatch", async () => {
  const runtime = restricted();
  const create = { template, name: "test", ttlSeconds: 60 };
  await assert.rejects(runtime.create({ ...create, snapshot: { provider: "dev", providerSnapshotId: "snap_test" } }), RuntimeFeatureUnavailableError);
  for (const policy of [{ defaultAction: "deny" as const, egress: [] }, { defaultAction: "allow" as const, egress: [{ action: "deny" as const, target: "example.com" }] }]) {
    await assert.rejects(runtime.create({ ...create, egressPolicy: policy }), RuntimeFeatureUnavailableError);
  }
  assert.equal((await runtime.list()).length, 0);
});

test("create, lifecycle and egress denial do not query, reserve or emit effects", async () => {
  const input: CreateSandboxInput = { ...identity, ttlSeconds: 60, env: {} };
  const requests: Partial<CreateSandboxInput>[] = [{ snapshotId: "snap_test" }, { egress: { mode: "blocked" } }, { credentialMappings: [{ slotId: "api", source: { sourceType: "inline_ephemeral", value: "test" } }] }];
  for (const addition of requests) {
    await assert.rejects(createSandbox({ ...input, ...addition }, dependencies()), RuntimeFeatureUnavailableError);
  }
  assert.deepEqual(await pauseSandbox(identity, dependencies()), { kind: "runtime_lifecycle_unsupported", capability: "pause" });
  assert.deepEqual(await resumeSandbox(identity, dependencies()), { kind: "runtime_lifecycle_unsupported", capability: "resume" });
  assert.deepEqual(await createSandboxSnapshot(identity, dependencies()), { kind: "runtime_lifecycle_unsupported", capability: "snapshot" });
  await assert.rejects(updateSandboxEgress({ ...identity, actorUserId: null, patch: { mode: "blocked" } }, dependencies()), RuntimeFeatureUnavailableError);
});

test("policy failures have a stable non-retryable HTTP error contract", async () => {
  const app = Fastify({ logger: false });
  registerApiErrorHandler(app);
  app.post("/create", async () => { throw new RuntimeFeatureUnavailableError("snapshots"); });
  try {
    const response = await app.inject({ method: "POST", url: "/create" });
    assert.equal(response.statusCode, 501);
    assert.equal(response.json().error, "runtime_feature_unavailable");
    assert.equal(response.json().feature, "snapshots");
  } finally { await app.close(); }
});

test("queued provisioning rechecks policy before dispatch and releases its owned reservation", async () => {
  const operation: SandboxOperation = {
    ...identity, id: "op_test", kind: "provision", state: "running", attempts: 1,
    idempotencyKey: null, request: {}, result: {}, error: null, lockedAt: null,
    startedAt: null, completedAt: null, createdAt: "2026-11-05", updatedAt: "2026-11-05"
  };
  const calls: string[] = [];
  const query: Query = async <T>(sql: string, params?: unknown[]) => {
    calls.push(sql);
    let rows: unknown[] = [];
    if (sql.includes("SELECT capacity_state")) rows = [{ capacity_state: "enforced" }];
    else if (sql.includes("SELECT opensandbox_id, status")) rows = [{ opensandbox_id: null, status: "pending" }];
    else if (sql.includes("FROM sandbox_operations")) rows = [operation];
    else if (sql.startsWith("SELECT * FROM sandbox_capacity_reservations")) rows = [{ generation: 1, phase: "reserved", operation_id: operation.id }];
    else if (sql.includes("INSERT INTO sandbox_runtime_effects")) rows = [{ id: params?.[0], organization_id: identity.organizationId, sandbox_id: identity.sandboxId, generation: 1 }];
    else if (sql.includes("SET phase = 'released'")) assert.equal(params?.[3], "canceled_before_dispatch");
    else if (!sql.startsWith("SET LOCAL") && !sql.includes("SELECT id FROM sandbox_runtime_effects") && !sql.includes("SET settled_at")) {
      throw new Error(`Unexpected provisioning query: ${sql}`);
    }
    return { rows: rows as T[], rowCount: 1 };
  };
  await assert.rejects(provisionSandboxRuntime(operation, async () => ({
    template, name: "queued-before-policy-change", ttlSeconds: 60, egressPolicy: { defaultAction: "deny", egress: [] }
  }), { query, transaction: (work) => work(query), runtimeProvider: restricted() }), RuntimeFeatureUnavailableError);
  assert.ok(calls.some((sql) => sql.includes("SET settled_at")));
  assert.ok(calls.some((sql) => sql.includes("SET phase = 'released'")));
  assert.ok(calls.every((sql) => !sql.includes("SET dispatched_at") && !sql.includes("SET uncertain_at")));
});
