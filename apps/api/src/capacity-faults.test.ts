import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import pg, { type QueryResultRow } from "pg";
import Fastify from "fastify";
import { config } from "./config.js";
import { closeDb, pool as catalogPool, type Transaction } from "./db.js";
import type { Query } from "./services/query.js";
import type { RuntimeTemplate } from "./templates.js";
import { InMemoryRuntimeProvider } from "./providers/runtime/dev-provider.js";
import { createSandbox } from "./services/sandboxes.js";
import { readOrganizationCapacity } from "./services/organization-capacity.js";
import { reconcileSandboxCapacity } from "./services/sandbox-capacity-reconciler.js";
import { requestSandboxTermination, runtimeIsAbsent } from "./services/sandbox-termination.js";
import { claimSandboxOperationById } from "./services/sandbox-operations.js";
import { createCredentialSecret } from "./services/workspace-credential-secrets.js";
import { registerSandboxRoutes } from "./routes/sandboxes.js";
import { registerApiErrorHandler } from "./api-error-handler.js";

const databaseUrl = process.env.SANDBOX_TEST_DATABASE_URL;
if (process.env.CAPACITY_TEST_REQUIRED === "1" && !databaseUrl) throw new Error("Capacity fault acceptance requires a disposable PostgreSQL database");

const gate = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
};

class CountingRuntime extends InMemoryRuntimeProvider {
  override capabilities = { ...new InMemoryRuntimeProvider().capabilities, persistentWorkspaces: true };
  creates = 0;
  injections = 0;
  failure: "none" | "create-response" | "credential-response" = "none";
  override async create(input: Parameters<InMemoryRuntimeProvider["create"]>[0]) {
    this.creates++;
    const result = await super.create(input);
    if (this.failure === "create-response") throw new Error("injected provider response loss");
    return result;
  }
  override async applyCredentialVault(input: Parameters<InMemoryRuntimeProvider["applyCredentialVault"]>[0]) {
    this.injections++;
    const result = await super.applyCredentialVault(input);
    if (this.failure === "credential-response") throw new Error("injected credential response loss");
    return result;
  }
}

// Inject after PostgreSQL executes each write, including lost COMMIT acknowledgements.
// The same trace comes from a successful run, so newly added writes join the matrix.
const faultBoundary = (query: Query, transaction: Transaction, failAt = -1) => {
  const trace: string[] = [];
  let injected = false;
  const checkpoint = (label: string) => {
    trace.push(label);
    if (!injected && trace.length - 1 === failAt) {
      injected = true;
      throw new Error(`injected persistence failure at ${label}`);
    }
  };
  const wrap = (q: Query): Query => async <T extends QueryResultRow>(sql: string, params?: unknown[]) => {
    const result = await q<T>(sql, params);
    if (/^\s*(INSERT|UPDATE|DELETE|WITH)\b/i.test(sql)) checkpoint(sql.replace(/\s+/g, " ").trim());
    return result;
  };
  const wrappedTransaction: Transaction = async (work) => {
    const result = await transaction((q) => work(wrap(q)));
    checkpoint("COMMIT");
    return result;
  };
  return { query: wrap(query), transaction: wrappedTransaction, trace, wasInjected: () => injected };
};

test("PostgreSQL capacity survives persistence faults and real HTTP disconnects", { skip: !databaseUrl, timeout: 120_000 }, async (t) => {
  const schema = `capacity_faults_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString: databaseUrl });
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10, options: `-c search_path=${schema},public` });
  // Catalog helpers use the application pool: point it only at this disposable schema.
  catalogPool.options.connectionString = databaseUrl;
  catalogPool.options.options = `-c search_path=${schema},public`;
  const query: Query = (sql, params) => pool.query(sql, params);
  const transaction: Transaction = async (work) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work((sql, params) => client.query(sql, params));
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  };
  const previous = { controlPlaneSecretKey: config.controlPlaneSecretKey, credentialVaultKey: config.credentialVaultKey,
    credentialVaultKeyringFile: config.credentialVaultKeyringFile, persistentWorkspacesEnabled: config.persistentWorkspacesEnabled };
  config.controlPlaneSecretKey = randomBytes(32).toString("hex");
  config.credentialVaultKey = randomBytes(32).toString("hex");
  config.credentialVaultKeyringFile = "";
  config.persistentWorkspacesEnabled = true;
  const template: RuntimeTemplate = { id: "capacity-fault-template", templateVersionId: null, name: "Fault test", description: "", image: `test@sha256:${"a".repeat(64)}`,
    imageDigest: `sha256:${"a".repeat(64)}`, icon: "box", tags: [], aliases: [], bootMs: 0, status: "ready", visibility: "public",
    cpuCount: 1, memoryMb: 128, workdir: "/workspace", defaultEntrypoint: ["sleep", "600"], defaultPorts: [], runtimeFamily: "linux" };
  const dependencies = (runtimeProvider: CountingRuntime) => ({ query, transaction, runtimeProvider,
    recordEvent: async () => undefined, recordAudit: async () => undefined,
    resolveTemplateFn: async () => template, ensureTemplateImageDigestFn: async () => template, templateCanCreateSandboxFn: () => true });
  const fixture = async (withCredential = false) => {
    const organizationId = randomUUID();
    const userId = randomUUID();
    const workspaceId = `wsp_${randomUUID()}`;
    const secretValue = `fixture-${randomBytes(24).toString("hex")}`;
    await query("INSERT INTO organizations(id,name,slug,max_concurrency) VALUES ($1::uuid,'Fault test',$1::text,1)", [organizationId]);
    await query("INSERT INTO users(id,email,full_name) VALUES ($1,$2,'Fault test')", [userId, `${userId}@example.invalid`]);
    await query("INSERT INTO memberships(user_id,organization_id,role) VALUES ($1,$2,'admin')", [userId, organizationId]);
    if (withCredential) await query("INSERT INTO persistent_workspaces(id,organization_id,name,provider,provider_volume_name,size_gib,quota_slot) VALUES ($1,$2,'fault-test','dev',$1,1,1)", [workspaceId, organizationId]);
    const env: Record<string, string> = withCredential ? { PRIVATE_INPUT: `env-${randomBytes(24).toString("hex")}` } : {};
    const input = { organizationId, userId, actorLabel: "fault-test", templateRef: template.id, ttlSeconds: 300, idempotencyKey: randomUUID(), env,
      ...(withCredential ? { workspaceId, credentials: [{ sourceType: "inline_ephemeral" as const, value: secretValue,
        fakeEnv: { TEST_API_KEY: "fake-test-key" }, binding: { match: { hosts: ["api.example.test"] }, auth: { type: "bearer" as const } } }] } : {}) };
    return { input, provider: new CountingRuntime(), secretValue };
  };
  const recover = async (organizationId: string, provider: CountingRuntime) => {
    await query("UPDATE sandbox_capacity_reservations SET next_check_at=now() WHERE organization_id=$1", [organizationId]);
    const report = await reconcileSandboxCapacity({ ...dependencies(provider), organizationId, staleAfterMs: 0 });
    assert.equal(report.failed, 0, JSON.stringify(report));
  };
  const invariant = async (organizationId: string, provider: CountingRuntime) => {
    const capacity = await readOrganizationCapacity(organizationId, query);
    const runtimes = (await provider.list()).filter((runtime) => !runtimeIsAbsent(provider, runtime));
    assert.equal(capacity.state, "enforced");
    assert.ok(capacity.inUse !== null && capacity.inUse <= 1);
    assert.ok(runtimes.length <= capacity.inUse, "execution must never outlive its capacity hold");
    assert.ok(provider.creates <= 1, "a persisted intent must not dispatch twice");
  };
  const completeUncertainDeletion = async (organizationId: string, provider: CountingRuntime) => {
    await recover(organizationId, provider);
    assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 1);
    const effects = await query<{ provider_id: string }>("SELECT provider_id FROM sandbox_runtime_effects WHERE organization_id=$1 AND kind='delete' AND dispatched_at IS NOT NULL AND settled_at IS NULL", [organizationId]);
    assert.equal(effects.rowCount, 1);
    // Uncertain deletion is not automatic retry acceptance: an operator finishes
    // this exact known identity, then reconciliation must prove it no longer runs.
    await provider.delete({ provider: provider.kind, providerSandboxId: effects.rows[0].provider_id });
  };
  const cleanup = async (organizationId: string, provider: CountingRuntime) => {
    await recover(organizationId, provider);
    const held = await query<{ sandbox_id: string }>("SELECT sandbox_id FROM sandbox_capacity_reservations WHERE organization_id=$1 AND released_at IS NULL", [organizationId]);
    for (const row of held.rows) await requestSandboxTermination({ organizationId, sandboxId: row.sandbox_id }, dependencies(provider));
    await recover(organizationId, provider);
    assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 0);
    assert.ok((await provider.list()).every((runtime) => runtimeIsAbsent(provider, runtime)));
    assert.equal((await query("SELECT id FROM sandbox_runtime_effects WHERE organization_id=$1 AND settled_at IS NULL", [organizationId])).rowCount, 0);
  };
  try {
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`SET search_path TO ${schema},public`);
    const migrations = new URL("../../../db/migrations/", import.meta.url);
    for (const file of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) await admin.query(await readFile(new URL(file, migrations), "utf8"));
    await query("INSERT INTO templates(id,name,description,image,image_digest,icon,status) VALUES ($1,'Fault test','',$2,$3,'box','ready')", [template.id, template.image, template.imageDigest]);
    const versionId = `tplv_${randomUUID()}`;
    await query("INSERT INTO template_versions(id,template_id,image_uri,image_digest) VALUES ($1,$2,$3,$4)", [versionId, template.id, template.image, template.imageDigest]);
    await query("UPDATE templates SET latest_version_id=$2 WHERE id=$1", [template.id, versionId]);

    const scenarios = [
      { name: "plain", withCredential: false, failure: "none", result: "created" },
      { name: "credential/workspace", withCredential: true, failure: "none", result: "created" },
      { name: "lost provider reply", withCredential: false, failure: "create-response", result: "sandbox_provision_failed" },
      { name: "failed credential injection", withCredential: true, failure: "credential-response", result: "credential_vault_provider_unavailable" }
    ] as const;
    for (const scenario of scenarios) {
      const { withCredential } = scenario;
      const baseline = await fixture(withCredential);
      baseline.provider.failure = scenario.failure;
      const trace = faultBoundary(query, transaction);
      const success = await createSandbox(baseline.input, { ...dependencies(baseline.provider), ...trace });
      assert.equal(success.kind, scenario.result, JSON.stringify(success));
      if (withCredential) assert.equal(baseline.provider.injections, 1);
      await cleanup(baseline.input.organizationId, baseline.provider);
      for (const [index, boundary] of trace.trace.entries()) await t.test(`${scenario.name} create write ${index + 1}: ${boundary.slice(0, 100)}`, async () => {
        const { input, provider, secretValue } = await fixture(withCredential);
        provider.failure = scenario.failure;
        const fault = faultBoundary(query, transaction, index);
        await createSandbox(input, { ...dependencies(provider), ...fault }).catch(() => undefined);
        assert.equal(fault.wasInjected(), true, "the requested failure boundary must be exercised");
        assert.equal(fault.trace[index], boundary);
        await invariant(input.organizationId, provider);
        await recover(input.organizationId, provider);
        await invariant(input.organizationId, provider);
        const accepted = await query("SELECT id FROM sandboxes WHERE organization_id=$1", [input.organizationId]);
        if (!accepted.rowCount) {
          for (const table of ["sandbox_operations", "sandbox_capacity_reservations", "sandbox_runtime_effects"]) {
            assert.equal((await query(`SELECT * FROM ${table} WHERE organization_id=$1`, [input.organizationId])).rowCount, 0);
          }
          if (input.workspaceId) assert.equal((await query("SELECT attached_sandbox_id FROM persistent_workspaces WHERE id=$1", [input.workspaceId])).rows[0].attached_sandbox_id, null);
        }
        const dispatches = provider.creates;
        await createSandbox(input, dependencies(provider));
        if (accepted.rowCount) assert.equal(provider.creates, dispatches, "retry of an accepted intent must not create again");
        await invariant(input.organizationId, provider);
        const operations = await query("SELECT request,result,error FROM sandbox_operations WHERE organization_id=$1", [input.organizationId]);
        assert.equal(JSON.stringify(operations.rows).includes(secretValue), false);
        if (scenario.failure === "credential-response" && provider.creates === 1 && boundary.startsWith("UPDATE sandbox_runtime_effects SET dispatched_at=")) {
          await completeUncertainDeletion(input.organizationId, provider);
        }
        await cleanup(input.organizationId, provider);
      });
      t.diagnostic(`${scenario.name} create: ${trace.trace.length} write/commit boundaries`);
    }

    const deletion = await fixture(true);
    const created = await createSandbox(deletion.input, dependencies(deletion.provider));
    assert.ok(created.kind === "created");
    const deletionTrace = faultBoundary(query, transaction);
    await requestSandboxTermination({ organizationId: deletion.input.organizationId, sandboxId: created.sandbox.id }, { ...dependencies(deletion.provider), ...deletionTrace });
    for (const [index, boundary] of deletionTrace.trace.entries()) await t.test(`delete write ${index + 1}: ${boundary.slice(0, 100)}`, async () => {
      const { input, provider } = await fixture(true);
      const result = await createSandbox(input, dependencies(provider));
      assert.ok(result.kind === "created");
      const fault = faultBoundary(query, transaction, index);
      await requestSandboxTermination({ organizationId: input.organizationId, sandboxId: result.sandbox.id }, { ...dependencies(provider), ...fault }).catch(() => undefined);
      assert.equal(fault.wasInjected(), true);
      assert.equal(fault.trace[index], boundary);
      await invariant(input.organizationId, provider);
      if (boundary.startsWith("UPDATE sandbox_runtime_effects SET dispatched_at=")) {
        await completeUncertainDeletion(input.organizationId, provider);
      }
      await cleanup(input.organizationId, provider);
    });

    for (const cancel of [false, true]) await t.test(`HTTP disconnect during stored credential preparation: ${cancel ? "explicit cancellation fences late preparation" : "accepted request finishes once"}`, { timeout: 15_000 }, async () => {
      const { input, provider } = await fixture();
      const stored = await createCredentialSecret({ organizationId: input.organizationId, actorUserId: input.userId, actorLabel: input.actorLabel,
        body: { name: "http-fixture", providerPresetId: "openai", value: randomBytes(24).toString("hex") } }, { query });
      assert.ok(stored.kind === "ok", JSON.stringify(stored));
      const entered = gate(); const release = gate(); const completed = gate(); const disconnected = gate();
      let blocked = false;
      const blockedQuery: Query = async (sql, params) => {
        if (!blocked && sql.includes("FROM workspace_credential_secrets")) { blocked = true; entered.release(); await release.promise; }
        return query(sql, params);
      };
      const app = Fastify();
      registerApiErrorHandler(app);
      app.addHook("onRoute", (route) => {
        if (route.url !== "/v1/sandboxes" || route.method !== "POST") return;
        const handler = route.handler;
        route.handler = async function (request, reply) {
          try { return await handler.call(this, request, reply); }
          finally { completed.release(); }
        };
      });
      app.addHook("preHandler", async (request, reply) => {
        request.auth = { userId: input.userId, organizationId: input.organizationId, actorLabel: input.actorLabel, authType: "keycloak" };
        reply.raw.once("close", () => disconnected.release());
      });
      await registerSandboxRoutes(app, { query: blockedQuery, transaction, runtimeProvider: provider, recordAudit: async () => undefined, recordSandboxEvent: async () => undefined });
      const url = await app.listen({ host: "127.0.0.1", port: 0 });
      const body = JSON.stringify({ template: template.id, ttlSeconds: 300, idempotencyKey: input.idempotencyKey, credentials: [{ sourceType: "harakiri_encrypted", secretId: stored.secret.id }] });
      const request = httpRequest(`${url}/v1/sandboxes`, { method: "POST", agent: false, headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } });
      request.on("error", () => undefined);
      request.end(body);
      try {
        await Promise.race([entered.promise, completed.promise.then(() => { throw new Error("HTTP create finished before the credential preparation gate"); })]);
        const socketClosed = new Promise<void>((resolve) => request.once("close", resolve));
        request.destroy();
        await socketClosed;
        await disconnected.promise;
        assert.equal((await readOrganizationCapacity(input.organizationId, query)).inUse, 1);
        assert.equal(provider.creates, 0);
        const operation = (await query<{ id: string; sandbox_id: string }>("SELECT id,sandbox_id FROM sandbox_operations WHERE organization_id=$1", [input.organizationId])).rows[0];
        assert.equal(await claimSandboxOperationById({ operationId: operation.id }, query), null, "workers must not dispatch partially prepared credentials");
        if (cancel) {
          await requestSandboxTermination({ organizationId: input.organizationId, sandboxId: operation.sandbox_id }, dependencies(provider));
          assert.equal((await readOrganizationCapacity(input.organizationId, query)).inUse, 0);
        }
        release.release();
        await completed.promise;
        assert.equal(provider.creates, cancel ? 0 : 1);
        assert.equal(provider.injections, cancel ? 0 : 1);
        const replay = await fetch(`${url}/v1/sandboxes`, { method: "POST", headers: { "content-type": "application/json" }, body });
        assert.equal(replay.status, cancel ? 502 : 201, await replay.text());
        assert.equal(provider.creates, cancel ? 0 : 1);
        await cleanup(input.organizationId, provider);
      } finally {
        release.release();
        request.destroy();
        await app.close();
      }
    });
  } finally {
    Object.assign(config, previous);
    await closeDb();
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
