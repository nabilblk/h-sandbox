import assert from "node:assert/strict";
import test from "node:test";
import { processSandboxOperationQueue as processQueue } from "./services/sandbox-operation-worker.js";
import type { RuntimeProvider } from "./providers/runtime/provider.js";

import { capacityFixture } from "./test-support/capacity-fixture.js";
const processSandboxOperationQueue: typeof processQueue = (deps) => processQueue({ ...deps, ...capacityFixture(deps!.query!) });

const operationRow = (overrides: Record<string, unknown> = {}) => ({
  id: "op_worker",
  organizationId: "org_worker",
  sandboxId: "sbx_worker",
  kind: "route_expose",
  state: "running",
  idempotencyKey: null,
  request: {
    sandboxId: "sbx_worker",
    providerSandboxId: "provider_sbx",
    port: 3000,
    protocol: "http",
    accessMode: "public",
    labels: ["preview"],
    createdByUserId: "user_worker",
    createdByLabel: "worker@test.local"
  },
  result: {},
  error: null,
  attempts: 1,
  lockedAt: "2026-05-24T00:00:00.000Z",
  startedAt: "2026-05-24T00:00:00.000Z",
  completedAt: null,
  createdAt: "2026-05-24T00:00:00.000Z",
  updatedAt: "2026-05-24T00:00:00.000Z",
  ...overrides
});

const fakeRuntimeProvider = (
  options: {
    created?: Array<Record<string, unknown>>;
    deleted?: string[];
    renewed?: string[];
    listed?: Awaited<ReturnType<RuntimeProvider["list"]>>;
    failDelete?: boolean;
  } = {}
): RuntimeProvider => ({
  kind: "fake",
  capabilities: {
    terminal: true,
    filesystem: true,
    logs: true,
    metrics: true,
    routes: true
  },
  create: async (input) => {
    options.created?.push({ name: input.name, templateId: input.template.id, env: input.env, ...(input.snapshot ? { snapshot: input.snapshot } : {}) });
    return {
      provider: "fake",
      providerSandboxId: "provider_created",
      state: "running",
      expiresAt: "2026-05-24T00:05:00.000Z",
      runtimeRegistryCredentialId: null,
      runtimeImageAuthProvided: false
    };
  },
  list: async () => options.listed ?? [],
  get: async () => null,
  delete: async (ref) => {
    if (options.failDelete) throw new Error("delete unavailable");
    options.deleted?.push(ref.providerSandboxId);
  },
  renew: async (ref, _input) => {
    options.renewed?.push(ref.providerSandboxId);
  },
  run: async () => {
    throw new Error("not used");
  },
  files: async () => {
    throw new Error("not used");
  },
  logs: async () => [],
  metrics: async () => null,
  exposeRoute: async (input) => ({
    routeKey: `${input.providerSandboxId}-${input.port}`,
    host: `${input.providerSandboxId}-${input.port}.example.test`,
    url: `https://${input.providerSandboxId}-${input.port}.example.test`,
    targetUrl: `http://${input.providerSandboxId}:${input.port}`,
    provider: "fake",
    providerRouteId: "route_fake",
    state: "ready"
  })
});

test("processSandboxOperationQueue claims and completes a queued route exposure", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const report = await processSandboxOperationQueue({
    runtimeProvider: fakeRuntimeProvider(),
    limit: 1,
    query: async (text, params) => {
      calls.push({ text, params });
      if (text.includes("WITH candidate") && text.includes("state = 'queued'")) return { rowCount: 1, rows: [operationRow()] as never[] };
      if (text.includes("SELECT opensandbox_id, status FROM sandboxes")) {
        return { rowCount: 1, rows: [{ opensandbox_id: "provider_sbx", status: "running" }] as never[] };
      }
      if (text.includes("FROM sandbox_routes")) return { rowCount: 0, rows: [] as never[] };
      if (text.includes("UPDATE sandbox_operations") && text.includes("state = 'succeeded'")) {
        return { rowCount: 1, rows: [operationRow({ state: "succeeded" })] as never[] };
      }
      return { rowCount: 0, rows: [] as never[] };
    },
    recordEvent: async () => undefined
  });

  assert.deepEqual(report, {
    claimed: 1,
    succeeded: 1,
    awaitingConfirmation: 0,
    requeued: 0,
    failed: 0,
    staleRequeued: 0,
    staleFailed: 0,
    staleProvisionReconciled: 0,
    staleProvisionFailed: 0
  });
  assert(calls.some((call) => call.text.includes("FOR UPDATE SKIP LOCKED")));
  const insert = calls.find((call) => call.text.includes("INSERT INTO sandbox_routes"));
  assert.ok(insert);
  assert.deepEqual(insert.params?.slice(0, 6), ["sbx_worker", "org_worker", 3000, "http", "provider_sbx-3000", "provider_sbx-3000.example.test"]);
  assert.deepEqual(insert.params?.slice(11, 18), ["public", null, null, null, "user_worker", "worker@test.local", ["preview"]]);
  assert(calls.some((call) => call.text.includes("state = 'succeeded'")));
});

test("processSandboxOperationQueue provisions a queued snapshot restore with replayable input", async () => {
  const created: Array<Record<string, unknown>> = [];
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const report = await processSandboxOperationQueue({
    runtimeProvider: fakeRuntimeProvider({ created }),
    limit: 1,
    query: async (text, params) => {
      calls.push({ text, params });
      if (text.includes("WITH candidate") && text.includes("state = 'queued'")) {
        return {
          rowCount: 1,
          rows: [
            operationRow({
              kind: "provision",
              request: { sandboxId: "sbx_worker", envKeys: [], envReplayable: true, capacityProtocol: 1, dispatchReady: true, providerSnapshotId: "provider_snapshot" }
            })
          ] as never[]
        };
      }
      if (text.includes("FROM sandboxes s") && text.includes("JOIN templates t")) {
        return {
          rowCount: 1,
          rows: [
            {
              id: "sbx_worker",
              opensandboxId: null,
              status: "pending",
              sandboxName: "queued-worker",
              ttlSeconds: 300,
              templateId: "python-3.12",
              templateName: "python-3.12",
              description: "Python",
              image: "python:3.12",
              imageDigest: "sha256:abc",
              icon: "terminal",
              tags: ["python"],
              aliases: [],
              bootMs: 150,
              visibility: "public",
              ownerScope: "platform",
              defaultEntrypoint: ["sleep", "3600"],
              cpuCount: 2,
              memoryMb: 2048,
              workdir: "/workspace",
              defaultPorts: [],
              runtimeFamily: "python",
              templateVersionId: "tplv_python"
            }
          ] as never[]
        };
      }
      if (text.includes("UPDATE sandbox_operations") && text.includes("state = 'succeeded'")) {
        return { rowCount: 1, rows: [operationRow({ state: "succeeded" })] as never[] };
      }
      return { rowCount: 0, rows: [] as never[] };
    },
    recordEvent: async () => undefined
  });

  assert.equal(report.succeeded, 1);
  assert.deepEqual(created, [{ name: "queued-worker", templateId: "python-3.12", env: {}, snapshot: { provider: "fake", providerSnapshotId: "provider_snapshot" } }]);
  assert(calls.some((call) => call.text.includes("UPDATE sandboxes") && call.params?.[1] === "provider_created"));
  assert(calls.some((call) => call.text.includes("INSERT INTO sandbox_schedules")));
});

test("processSandboxOperationQueue does not adopt a legacy runtime using incomplete provider metadata", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const report = await processSandboxOperationQueue({
    runtimeProvider: fakeRuntimeProvider({
      listed: [
        {
          provider: "fake",
          providerSandboxId: "provider_recovered",
          state: "Running",
          expiresAt: "2026-05-24T00:05:00.000Z",
          metadata: {
            "harakiri.sandbox": "sbx_worker",
            "harakiri.organization": "org_worker"
          }
        }
      ]
    }),
    limit: 1,
    query: async (text, params) => {
      calls.push({ text, params });
      if (text.includes("WITH candidate") && text.includes("state = 'running'")) {
        return {
          rowCount: 1,
          rows: [operationRow({ kind: "provision", state: "running", request: { sandboxId: "sbx_worker" } })] as never[]
        };
      }
      if (text.includes("SELECT opensandbox_id, status, ttl_seconds FROM sandboxes")) {
        return { rowCount: 1, rows: [{ opensandbox_id: null, status: "pending", ttl_seconds: 300 }] as never[] };
      }
      if (text.includes("WITH candidate") && text.includes("state = 'queued'")) {
        return { rowCount: 0, rows: [] as never[] };
      }
      if (text.includes("UPDATE sandbox_operations") && text.includes("state = 'succeeded'")) {
        return { rowCount: 1, rows: [operationRow({ state: "succeeded" })] as never[] };
      }
      return { rowCount: 0, rows: [] as never[] };
    },
    recordEvent: async () => undefined
  });

  assert.equal(report.staleProvisionReconciled, 0);
  assert.equal(report.staleProvisionFailed, 1);
  assert(!calls.some((call) => call.text.includes("UPDATE sandboxes") && call.params?.[1] === "provider_recovered"));
  assert(!calls.some((call) => call.text.includes("INSERT INTO sandbox_schedules")));
});

test("processSandboxOperationQueue fails unmatched stale provision operations without blind replay", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const report = await processSandboxOperationQueue({
    runtimeProvider: fakeRuntimeProvider({ listed: [] }),
    limit: 1,
    query: async (text, params) => {
      calls.push({ text, params });
      if (text.includes("WITH candidate") && text.includes("state = 'running'")) {
        return {
          rowCount: 1,
          rows: [operationRow({ kind: "provision", state: "running", request: { sandboxId: "sbx_worker" } })] as never[]
        };
      }
      if (text.includes("SELECT opensandbox_id, status, ttl_seconds FROM sandboxes")) {
        return { rowCount: 1, rows: [{ opensandbox_id: null, status: "pending", ttl_seconds: 300 }] as never[] };
      }
      if (text.includes("SET state = 'failed'")) return { rowCount: 1, rows: [operationRow({ state: "failed" })] as never[] };
      return { rowCount: 0, rows: [] as never[] };
    },
    recordEvent: async () => undefined
  });

  assert.equal(report.staleProvisionReconciled, 0);
  assert.equal(report.staleProvisionFailed, 1);
  assert(!calls.some((call) => call.text.includes("UPDATE sandboxes SET status")));
  assert(calls.some((call) => call.params?.[1] === "Runtime outcome needs capacity inventory reconciliation; no create was replayed."));
});

test("processSandboxOperationQueue retains uncertain deletion without blind worker retry", async () => {
  const deleted: string[] = [];
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const report = await processSandboxOperationQueue({
    runtimeProvider: fakeRuntimeProvider({ deleted, failDelete: true }),
    limit: 1,
    maxAttempts: 2,
    query: async (text, params) => {
      calls.push({ text, params });
      if (text.includes("WITH candidate") && text.includes("state = 'queued'")) {
        return {
          rowCount: 1,
          rows: [
            operationRow({
              kind: "delete",
              request: { sandboxId: "sbx_worker", providerSandboxId: "provider_sbx" },
              attempts: 1
            })
          ] as never[]
        };
      }
      if (text.includes("SELECT opensandbox_id FROM sandboxes")) {
        return { rowCount: 1, rows: [{ opensandbox_id: "provider_sbx" }] as never[] };
      }
      if (text.includes("SET state = 'queued'")) {
        return { rowCount: 1, rows: [operationRow({ state: "queued" })] as never[] };
      }
      return { rowCount: 0, rows: [] as never[] };
    },
    recordEvent: async () => undefined
  });

  assert.equal(report.requeued, 0);
  assert.equal(report.failed, 1);
  assert.deepEqual(deleted, []);
  assert(calls.some((call) => call.text.includes("SET state = 'failed'") && String(call.params?.[1]).includes("could not be confirmed")));
});

test("processSandboxOperationQueue does not count a delete acknowledgement as completion", async () => {
  const deleted: string[] = [];
  const calls: string[] = [];
  const report = await processSandboxOperationQueue({
    runtimeProvider: fakeRuntimeProvider({ deleted }), limit: 1,
    query: async (text) => {
      calls.push(text);
      if (text.includes("WITH candidate") && text.includes("state = 'queued'")) return { rowCount: 1, rows: [operationRow({ kind: "delete" })] as never[] };
      return { rowCount: 0, rows: [] as never[] };
    },
    recordEvent: async () => undefined
  });
  assert.deepEqual(deleted, ["provider_sbx"]);
  assert.equal(report.succeeded, 0);
  assert.equal(report.awaitingConfirmation, 1);
  assert.equal(calls.some((sql) => sql.includes("state = 'succeeded'")), false);
});

test("processSandboxOperationQueue renews queued sandboxes", async () => {
  const renewed: string[] = [];
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const query = async (text: string, params?: unknown[]) => {
      calls.push({ text, params });
      if (text.includes("WITH candidate") && text.includes("state = 'queued'")) {
        return {
          rowCount: 1,
          rows: [
            operationRow({
              kind: "renew",
              request: { sandboxId: "sbx_worker", providerSandboxId: "provider_sbx" },
              attempts: 1
            })
          ] as never[]
        };
      }
      if (text.includes("SELECT opensandbox_id, ttl_seconds")) {
        return { rowCount: 1, rows: [{ opensandbox_id: "provider_sbx", ttl_seconds: 300, status: "running", expires_at: null }] as never[] };
      }
      if (text.includes("SELECT clock_timestamp")) return { rows: [{ now: new Date() }] as never[] };
      if (text.includes("FROM sandbox_operations") && text.includes("FOR UPDATE")) return { rows: [operationRow({ kind: "renew" })] as never[] };
      if (text.includes("UPDATE sandbox_operations") && text.includes("state = 'succeeded'")) {
        return { rowCount: 1, rows: [operationRow({ state: "succeeded" })] as never[] };
      }
      return { rowCount: 0, rows: [] as never[] };
    };
  const runtimeProvider = fakeRuntimeProvider({ renewed });
  runtimeProvider.get = async () => ({ provider: "fake", providerSandboxId: "provider_sbx", state: "running", expiresAt: null });
  const report = await processSandboxOperationQueue({
    runtimeProvider,
    limit: 1,
    query,
    transaction: (fn) => fn(query),
    recordEvent: async () => undefined
  });

  assert.equal(report.succeeded, 1);
  assert.deepEqual(renewed, ["provider_sbx"]);
  assert(calls.some((call) => call.text.includes("UPDATE sandboxes SET expires_at")));
});

test("processSandboxOperationQueue fails exhausted retryable operations", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const report = await processSandboxOperationQueue({
    runtimeProvider: fakeRuntimeProvider({ failDelete: true }),
    limit: 1,
    maxAttempts: 2,
    query: async (text, params) => {
      calls.push({ text, params });
      if (text.includes("WITH candidate") && text.includes("state = 'queued'")) {
        return {
          rowCount: 1,
          rows: [
            operationRow({
              kind: "delete",
              request: { sandboxId: "sbx_worker", providerSandboxId: "provider_sbx" },
              attempts: 2
            })
          ] as never[]
        };
      }
      if (text.includes("SELECT opensandbox_id FROM sandboxes")) {
        return { rowCount: 1, rows: [{ opensandbox_id: "provider_sbx" }] as never[] };
      }
      if (text.includes("SET state = 'failed'")) {
        return { rowCount: 1, rows: [operationRow({ state: "failed" })] as never[] };
      }
      return { rowCount: 0, rows: [] as never[] };
    },
    recordEvent: async () => undefined
  });

  assert.equal(report.failed, 1);
  assert.equal(report.requeued, 0);
  assert(calls.some((call) => call.text.includes("SET state = 'failed'") && String(call.params?.[1]).includes("could not be confirmed")));
});

test("processSandboxOperationQueue fails non-retryable malformed operations", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const report = await processSandboxOperationQueue({
    runtimeProvider: fakeRuntimeProvider(),
    limit: 1,
    query: async (text, params) => {
      calls.push({ text, params });
      if (text.includes("WITH candidate") && text.includes("state = 'queued'")) {
        return {
          rowCount: 1,
          rows: [operationRow({ kind: "route_expose", request: { sandboxId: "sbx_worker" } })] as never[]
        };
      }
      if (text.includes("SET state = 'failed'")) return { rowCount: 1, rows: [operationRow({ state: "failed" })] as never[] };
      return { rowCount: 0, rows: [] as never[] };
    },
    recordEvent: async () => undefined
  });

  assert.equal(report.failed, 1);
  assert(calls.some((call) => call.text.includes("SET state = 'failed'") && call.params?.[1] === "route operation is missing port"));
});
