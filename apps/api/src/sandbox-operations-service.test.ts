import assert from "node:assert/strict";
import test from "node:test";
import {
  claimNextSandboxOperation,
  claimSandboxOperationById,
  claimStaleRunningSandboxOperation,
  cleanupStaleSandboxOperations,
  completeSandboxOperation,
  enqueueSandboxOperation,
  failSandboxOperation,
  listQueuedSandboxOperations,
  readSandboxOperationSecret,
  requeueSandboxOperation,
  storeSandboxOperationSecret
} from "./services/sandbox-operations.js";

const operationRow = (overrides: Record<string, unknown> = {}) => ({
  id: "op_test",
  organizationId: "org_ops",
  sandboxId: "sbx_ops",
  kind: "provision",
  state: "queued",
  idempotencyKey: null,
  request: {},
  result: {},
  error: null,
  attempts: 0,
  lockedAt: null,
  startedAt: null,
  completedAt: null,
  createdAt: "2026-05-24T00:00:00.000Z",
  updatedAt: "2026-05-24T00:00:00.000Z",
  ...overrides
});

test("enqueueSandboxOperation reuses an idempotent operation when present", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const result = await enqueueSandboxOperation(
    {
      organizationId: "org_ops",
      sandboxId: "sbx_ops",
      kind: "provision",
      idempotencyKey: "idem-1",
      request: { templateId: "python-3.12" }
    },
    {
      query: async (text, params) => {
        calls.push({ text, params });
        return { rowCount: 1, rows: [operationRow({ idempotencyKey: "idem-1" })] as never[] };
      }
    }
  );

  assert.equal(result.reused, true);
  assert.equal(result.operation.id, "op_test");
  assert(calls[0].text.includes("idempotency_key"));
  assert(!calls.some((call) => call.text.includes("INSERT INTO sandbox_operations")));
});

test("enqueue/claim/complete/fail sandbox operations use stable state updates", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const query = async (text: string, params?: unknown[]) => {
    calls.push({ text, params });
    if (text.includes("INSERT INTO sandbox_operations")) {
      return { rowCount: 1, rows: [operationRow({ id: "op_created" })] as never[] };
    }
    if (text.includes("SET state = 'running'")) return { rowCount: 1, rows: [operationRow({ state: "running", attempts: 1 })] as never[] };
    if (text.includes("state = 'succeeded'")) return { rowCount: 1, rows: [operationRow({ state: "succeeded" })] as never[] };
    if (text.includes("state = 'failed'")) return { rowCount: 1, rows: [operationRow({ state: "failed", error: "failed" })] as never[] };
    return { rowCount: 0, rows: [] as never[] };
  };

  const enqueued = await enqueueSandboxOperation(
    { organizationId: "org_ops", sandboxId: "sbx_ops", kind: "delete" },
    { query, idFactory: () => "op_created" }
  );
  const started = await claimSandboxOperationById({ operationId: "op_created", kinds: ["delete"], maxAttempts: 3 }, query);
  const completed = await completeSandboxOperation({ operationId: "op_created", result: { ok: true } }, query);
  const failed = await failSandboxOperation({ operationId: "op_created", error: "failed" }, query);

  assert.equal(enqueued.operation.id, "op_created");
  assert.equal(started?.state, "running");
  assert.equal(completed?.state, "succeeded");
  assert.equal(failed?.state, "failed");
  assert(calls.some((call) => call.text.includes("attempts = attempts + 1")));
  assert(calls.some((call) => call.text.includes("state IN ('queued', 'failed')")));
});

test("listQueuedSandboxOperations can scope worker fetches by kind", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const operations = await listQueuedSandboxOperations(
    { kinds: ["provision"], limit: 5 },
    async (text, params) => {
      calls.push({ text, params });
      return { rowCount: 1, rows: [operationRow()] as never[] };
    }
  );

  assert.equal(operations.length, 1);
  assert.match(calls[0].text, /kind = ANY/);
  assert.deepEqual(calls[0].params, [["provision"], 5]);
});

test("claimNextSandboxOperation uses an atomic skip-locked lease", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const operation = await claimNextSandboxOperation(
    { kinds: ["delete", "renew"], maxAttempts: 4, staleAfterMs: 12_000 },
    async (text, params) => {
      calls.push({ text, params });
      return { rowCount: 1, rows: [operationRow({ state: "running", attempts: 2 })] as never[] };
    }
  );

  assert.equal(operation?.state, "running");
  assert.match(calls[0].text, /FOR UPDATE SKIP LOCKED/);
  assert.match(calls[0].text, /attempts < \$1/);
  assert.deepEqual(calls[0].params, [4, 12_000, ["delete", "renew"]]);
});

test("claimStaleRunningSandboxOperation refreshes stale running leases atomically", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const operation = await claimStaleRunningSandboxOperation(
    { kinds: ["provision"], staleAfterMs: 60_000 },
    async (text, params) => {
      calls.push({ text, params });
      return { rowCount: 1, rows: [operationRow({ kind: "provision", state: "running" })] as never[] };
    }
  );

  assert.equal(operation?.kind, "provision");
  assert.equal(operation?.state, "running");
  assert.match(calls[0].text, /FOR UPDATE SKIP LOCKED/);
  assert.match(calls[0].text, /state = 'running'/);
  assert.deepEqual(calls[0].params, [60_000, ["provision"]]);
});

test("requeueSandboxOperation and cleanupStaleSandboxOperations reset retryable leases", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const query = async (text: string, params?: unknown[]) => {
    calls.push({ text, params });
    if (text.includes("SET state = 'queued'")) return { rowCount: 2, rows: [operationRow({ state: "queued" })] as never[] };
    if (text.includes("SET state = 'failed'")) return { rowCount: 1, rows: [] as never[] };
    return { rowCount: 0, rows: [] as never[] };
  };

  const requeued = await requeueSandboxOperation({ operationId: "op_test", error: "retry" }, query);
  const stale = await cleanupStaleSandboxOperations({ kinds: ["route_expose"], maxAttempts: 3, staleAfterMs: 5000 }, query);

  assert.equal(requeued?.state, "queued");
  assert.deepEqual(stale, { requeued: 2, failed: 1 });
  assert(calls.some((call) => call.text.includes("locked_at = NULL")));
  assert(calls.some((call) => call.text.includes("kind = ANY")));
});

test("sandbox operation secrets are encrypted outside the operation request", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const query = async (text: string, params?: unknown[]) => {
    calls.push({ text, params });
    if (text.includes("INSERT INTO sandbox_operation_secrets")) {
      return {
        rowCount: 1,
        rows: [
          {
            operationId: params?.[0],
            name: params?.[1],
            secretCiphertext: params?.[2],
            secretIv: params?.[3],
            secretTag: params?.[4],
            createdAt: "2026-05-24T00:00:00.000Z",
            updatedAt: "2026-05-24T00:00:00.000Z"
          }
        ] as never[]
      };
    }
    if (text.includes("FROM sandbox_operation_secrets")) {
      return {
        rowCount: 1,
        rows: [
          {
            operationId: "op_1",
            name: "provision_env",
            secretCiphertext: "cipher",
            secretIv: "iv",
            secretTag: "tag",
            createdAt: "2026-05-24T00:00:00.000Z",
            updatedAt: "2026-05-24T00:00:00.000Z"
          }
        ] as never[]
      };
    }
    return { rowCount: 0, rows: [] as never[] };
  };

  const stored = await storeSandboxOperationSecret(
    { operationId: "op_1", name: "provision_env", value: "{\"TOKEN\":\"secret\"}" },
    { query, encryptSecret: () => ({ secretCiphertext: "cipher", secretIv: "iv", secretTag: "tag" }) }
  );
  const read = await readSandboxOperationSecret(
    { operationId: "op_1", name: "provision_env" },
    { query, decryptSecret: () => "{\"TOKEN\":\"secret\"}" }
  );

  assert.equal(stored?.secretCiphertext, "cipher");
  assert.equal(read, "{\"TOKEN\":\"secret\"}");
  assert(!calls.some((call) => JSON.stringify(call.params).includes("secret")));
});
