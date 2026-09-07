import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import pg, { type QueryResultRow } from "pg";
import Fastify from "fastify";
import type { Transaction } from "./db.js";
import type { Query } from "./services/query.js";
import { openSandboxRuntimeProvider } from "./providers/runtime/opensandbox-provider.js";
import type { RuntimeSandboxSummary } from "./providers/runtime/provider.js";
import { reconcileSandboxLease, renewSandboxLease, SandboxLeaseError } from "./services/sandbox-lease.js";
import { renewSandbox } from "./services/sandboxes.js";
import { claimSandboxOperationById, enqueueSandboxOperation, failSandboxOperation, requeueSandboxOperation } from "./services/sandbox-operations.js";
import { executeSandboxOperation } from "./services/sandbox-operation-worker.js";
import { pauseSandbox } from "./services/sandbox-lifecycle.js";
import { registerSandboxRoutes } from "./routes/sandboxes.js";

const gate = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
};

test("PostgreSQL coordinates sandbox renewal, activity and expiration", {
  skip: !process.env.SANDBOX_TEST_DATABASE_URL,
  timeout: 30_000
}, async (t) => {
  const pool = new pg.Pool({ connectionString: process.env.SANDBOX_TEST_DATABASE_URL });
  const query: Query = (text, params) => pool.query(text, params);
  const transaction: Transaction = async (fn) => {
    const client = await pool.connect();
    await client.query("BEGIN");
    try {
      const result = await fn((text, params) => client.query(text, params));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  };
  const organizationId = randomUUID();
  const template = `lease-test-${randomUUID()}`;
  const native = new Map<string, RuntimeSandboxSummary>();
  const deleted: string[] = [];
  const renewed: string[] = [];
  const runtimeProvider = {
    ...openSandboxRuntimeProvider,
    get: async (ref: { providerSandboxId: string }) => native.get(ref.providerSandboxId) ?? null,
    delete: async (ref: { providerSandboxId: string }) => { deleted.push(ref.providerSandboxId); native.delete(ref.providerSandboxId); },
    renew: async (ref: { providerSandboxId: string }, input: { expiresAt: string }) => {
      renewed.push(ref.providerSandboxId);
      native.get(ref.providerSandboxId)!.expiresAt = input.expiresAt;
    }
  };
  const dependencies = { query, transaction, runtimeProvider, recordEvent: async () => undefined };
  const create = async (offsetMs = -1000, status = "running") => {
    const sandboxId = `sbx_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + offsetMs).toISOString();
    await query(
      `INSERT INTO sandboxes (id, organization_id, template_id, name, owner_label, opensandbox_id, status, ttl_seconds, expires_at, provider_expires_at)
       VALUES ($1, $2, $3, $1, 'lease test', $1, $4, 60, $5, $5)`, [sandboxId, organizationId, template, status, expiresAt]
    );
    await query("INSERT INTO sandbox_schedules (sandbox_id, organization_id, kind, run_at) VALUES ($1, $2, 'idle_ttl', $3)", [sandboxId, organizationId, expiresAt]);
    native.set(sandboxId, { provider: "opensandbox", providerSandboxId: sandboxId, state: status, expiresAt });
    return { sandboxId, organizationId };
  };
  const read = async (sandboxId: string) => (await query<{ status: string; expires_at: Date; run_at: Date; completed_at: Date | null }>(
    `SELECT s.status, s.expires_at, ss.run_at, ss.completed_at FROM sandboxes s
     LEFT JOIN sandbox_schedules ss ON ss.sandbox_id = s.id WHERE s.id = $1`, [sandboxId]
  )).rows[0];
  try {
    await query("INSERT INTO organizations (id, name, slug) VALUES ($1::uuid, 'Lease test', $1::uuid::text)", [organizationId]);
    await query("INSERT INTO templates (id, name, description, image, icon) VALUES ($1, $1, 'lease test', 'python:3.12', 'box')", [template]);

    await t.test("renewal repairs stale/missing schedules and expired selections cannot kill it", async () => {
      const input = await create();
      await query("DELETE FROM sandbox_schedules WHERE sandbox_id = $1", [input.sandboxId]);
      await renewSandbox(input, dependencies);
      const row = await read(input.sandboxId);
      assert.equal(row.expires_at.toISOString(), native.get(input.sandboxId)!.expiresAt);
      assert.equal(row.expires_at.getTime(), row.run_at.getTime());
      await reconcileSandboxLease({ ...input, expire: true }, dependencies);
      assert.equal((await read(input.sandboxId)).status, "running");
      assert.ok(!deleted.includes(input.sandboxId));
    });

    await t.test("a renewal holding the lock wins against an already-selected expiration", async () => {
      const input = await create();
      const entered = gate(); const release = gate();
      const renewing = renewSandboxLease(input, { ...dependencies, runtimeProvider: {
        ...runtimeProvider,
        renew: async (ref, body) => { entered.release(); await release.promise; await runtimeProvider.renew(ref, body); }
      } });
      await entered.promise;
      let finished = false;
      const expiring = reconcileSandboxLease({ ...input, expire: true }, dependencies).finally(() => { finished = true; });
      try { await delay(30); assert.equal(finished, false); } finally { release.release(); }
      await Promise.all([renewing, expiring]);
      assert.ok(!deleted.includes(input.sandboxId));
      assert.equal((await read(input.sandboxId)).status, "running");
    });

    await t.test("expiration holding the lock wins and late renewal cannot resurrect it", async () => {
      const input = await create();
      const entered = gate(); const release = gate();
      const expiring = reconcileSandboxLease({ ...input, expire: true }, { ...dependencies, runtimeProvider: {
        ...runtimeProvider,
        delete: async (ref) => { entered.release(); await release.promise; await runtimeProvider.delete(ref); }
      } });
      await entered.promise;
      const renewing = assert.rejects(renewSandboxLease(input, dependencies), (error) => error instanceof SandboxLeaseError && error.code === "sandbox_not_running");
      release.release();
      await Promise.all([expiring, renewing]);
      assert.equal((await read(input.sandboxId)).status, "terminated");
      assert.ok(!renewed.includes(input.sandboxId));
    });

    await t.test("competing schedulers delete once and finish all duplicate schedules", async () => {
      const input = await create();
      await query("INSERT INTO sandbox_schedules (sandbox_id, organization_id, kind, run_at) VALUES ($1, $2, 'idle_ttl', now())", [input.sandboxId, organizationId]);
      await Promise.all([1, 2, 3].map(() => reconcileSandboxLease({ ...input, expire: true }, dependencies)));
      assert.equal(deleted.filter((id) => id === input.sandboxId).length, 1);
      assert.equal((await query("SELECT 1 FROM sandbox_schedules WHERE sandbox_id = $1 AND completed_at IS NULL", [input.sandboxId])).rows.length, 0);
      assert.equal((await query("SELECT 1 FROM sandbox_events WHERE sandbox_id = $1 AND type = 'ttl'", [input.sandboxId])).rows.length, 1);
    });

    await t.test("provider renewal failure never advances the reported deadline", async () => {
      const input = await create();
      const before = await read(input.sandboxId);
      await assert.rejects(renewSandboxLease(input, { ...dependencies, runtimeProvider: {
        ...runtimeProvider, renew: async () => { throw new Error("provider unavailable"); }
      } }), /provider unavailable/);
      assert.deepEqual(await read(input.sandboxId), before);
    });

    await t.test("native success plus database failure recovers without premature deletion", async () => {
      const input = await create();
      const before = await read(input.sandboxId);
      await assert.rejects(renewSandboxLease(input, { ...dependencies, transaction: (fn) => transaction((tx) => fn(async (text, params) => {
        if (text.includes("UPDATE sandboxes SET expires_at")) throw new Error("database write failed");
        return tx(text, params);
      })) }), /database write failed/);
      assert.deepEqual(await read(input.sandboxId), before);
      await reconcileSandboxLease({ ...input, expire: true }, dependencies);
      const after = await read(input.sandboxId);
      assert.equal(after.status, "running");
      assert.equal(after.run_at.toISOString(), native.get(input.sandboxId)!.expiresAt);
      assert.ok(!deleted.includes(input.sandboxId));
    });

    await t.test("unknown state, missing deadline and provider read errors are fail-closed", async () => {
      for (const override of [{ state: "Unknown" }, { expiresAt: null }]) {
        const input = await create();
        Object.assign(native.get(input.sandboxId)!, override);
        await reconcileSandboxLease({ ...input, expire: true }, dependencies);
        assert.ok(!deleted.includes(input.sandboxId));
      }
      const input = await create();
      await assert.rejects(reconcileSandboxLease({ ...input, expire: true }, { ...dependencies, runtimeProvider: {
        ...runtimeProvider, get: async () => { throw new Error("provider read failed"); }
      } }), /provider read failed/);
      assert.equal((await read(input.sandboxId)).status, "running");
    });

    await t.test("paused, transitioning, missing and cross-tenant runtimes cannot renew", async () => {
      for (const status of ["paused", "pausing", "resuming", "terminated", "pending", "error"]) {
        const input = await create(60_000, status);
        await assert.rejects(renewSandboxLease(input, dependencies), (error) => error instanceof SandboxLeaseError && error.code === "sandbox_not_running");
      }
      const input = await create();
      await assert.rejects(renewSandboxLease({ ...input, organizationId: randomUUID() }, dependencies), (error) => error instanceof SandboxLeaseError && error.code === "sandbox_not_found");
      native.delete(input.sandboxId);
      await assert.rejects(renewSandboxLease(input, dependencies), (error) => error instanceof SandboxLeaseError && error.code === "sandbox_not_running");
    });

    await t.test("idempotent and simultaneous renew requests execute at most once", async () => {
      const input = { ...await create(), idempotencyKey: randomUUID() };
      const results = await Promise.allSettled([renewSandbox(input, dependencies), renewSandbox(input, dependencies)]);
      assert.ok(results.some((result) => result.status === "fulfilled" && result.value === true));
      for (const result of results) if (result.status === "rejected") {
        assert.ok(result.reason instanceof SandboxLeaseError);
        assert.equal(result.reason.code, "renew_in_progress");
      }
      const before = await read(input.sandboxId);
      assert.equal(await renewSandbox(input, dependencies), true);
      assert.deepEqual(await read(input.sandboxId), before);
      assert.equal(renewed.filter((id) => id === input.sandboxId).length, 1);
      const other = await create();
      await assert.rejects(renewSandbox({ ...other, idempotencyKey: input.idempotencyKey }, dependencies), (error) => error instanceof SandboxLeaseError && error.code === "idempotency_conflict");
    });

    await t.test("concurrent renewals never shorten an existing native lease", async () => {
      const input = await create(180_000);
      const before = native.get(input.sandboxId)!.expiresAt;
      await Promise.all([1, 2, 3].map(() => renewSandboxLease(input, dependencies)));
      assert.equal(native.get(input.sandboxId)!.expiresAt, before);
      assert.equal((await read(input.sandboxId)).run_at.toISOString(), before);
    });

    await t.test("renewal HTTP errors distinguish inactive, missing and exhausted operations", async () => {
      const app = Fastify();
      app.addHook("preHandler", async (request) => {
        request.auth = { userId: "test", organizationId, actorLabel: "test", authType: "api_key" };
      });
      await registerSandboxRoutes(app, { ...dependencies, recordSandboxEvent: dependencies.recordEvent, recordAudit: async () => undefined });
      try {
        const paused = await create(60_000, "paused");
        const inactive = await app.inject({ method: "POST", url: `/v1/sandboxes/${paused.sandboxId}/renew` });
        assert.equal(inactive.statusCode, 409); assert.equal(inactive.json().error, "sandbox_not_running");
        const missing = await app.inject({ method: "POST", url: "/v1/sandboxes/sbx_missing/renew" });
        assert.equal(missing.statusCode, 404);
        const idle = await create(60_000, "idle");
        assert.equal((await app.inject({ method: "POST", url: `/v1/sandboxes/${idle.sandboxId}/renew` })).statusCode, 200);
        const { operation } = await enqueueSandboxOperation({ ...idle, kind: "renew", idempotencyKey: "exhausted" }, { query });
        await query("UPDATE sandbox_operations SET state='failed', attempts=3 WHERE id=$1", [operation.id]);
        const exhausted = await app.inject({ method: "POST", url: `/v1/sandboxes/${idle.sandboxId}/renew`, headers: { "idempotency-key": "exhausted" } });
        assert.equal(exhausted.statusCode, 409); assert.equal(exhausted.json().error, "renew_failed");
      } finally { await app.close(); }
    });

    await t.test("retry worker persists the same schedule and completed operation atomically", async () => {
      const input = await create();
      const { operation } = await enqueueSandboxOperation({ ...input, kind: "renew" }, { query });
      const claimed = await claimSandboxOperationById({ operationId: operation.id }, query);
      await executeSandboxOperation(claimed!, dependencies);
      const row = await read(input.sandboxId);
      assert.equal(row.run_at.getTime(), row.expires_at.getTime());
      assert.equal((await query<{ state: string }>("SELECT state FROM sandbox_operations WHERE id = $1", [operation.id])).rows[0].state, "succeeded");
      await executeSandboxOperation(claimed!, dependencies);
      assert.equal(renewed.filter((id) => id === input.sandboxId).length, 1);
      assert.equal(await failSandboxOperation({ operationId: operation.id, error: "late failure", expectedAttempts: claimed!.attempts }, query), null);
      assert.equal(await requeueSandboxOperation({ operationId: operation.id, error: "late retry", expectedAttempts: claimed!.attempts }, query), null);
      assert.equal((await query<{ state: string }>("SELECT state FROM sandbox_operations WHERE id = $1", [operation.id])).rows[0].state, "succeeded");
    });

    await t.test("a pause selected before expiration cannot revive a terminated sandbox", async () => {
      const input = await create();
      let providerPaused = false;
      const racingQuery: Query = async <T extends QueryResultRow>(text: string, params?: unknown[]) => {
        const result = await query<T>(text, params);
        if (text.includes('workspace_id AS "workspaceId"') && text.includes('AS "opensandboxId"')) {
          await reconcileSandboxLease({ ...input, expire: true }, dependencies);
        }
        return result;
      };
      const result = await pauseSandbox({ ...input, userId: "test", actorLabel: "test" }, {
        ...dependencies, query: racingQuery, recordAudit: async () => undefined,
        runtimeProvider: { ...runtimeProvider, pause: async () => { providerPaused = true; return native.get(input.sandboxId)!; } }
      });
      assert.equal(result.kind, "runtime_provider_failed");
      assert.equal(providerPaused, false);
      assert.equal((await read(input.sandboxId)).status, "terminated");
    });

    await t.test("a provider minimum create TTL does not extend a shorter Harakiri TTL", async () => {
      const input = await create();
      const nativeDeadline = new Date(Date.now() + 60_000).toISOString();
      native.get(input.sandboxId)!.expiresAt = nativeDeadline;
      await query("UPDATE sandboxes SET ttl_seconds = 10, provider_expires_at = $2 WHERE id = $1", [input.sandboxId, nativeDeadline]);
      await reconcileSandboxLease(input, dependencies);
      assert.ok((await read(input.sandboxId)).expires_at.getTime() < Date.now());
      await reconcileSandboxLease({ ...input, expire: true }, dependencies);
      assert.equal((await read(input.sandboxId)).status, "terminated");
      assert.ok(deleted.includes(input.sandboxId));
    });
  } finally {
    await query("DELETE FROM sandboxes WHERE organization_id = $1", [organizationId]);
    await query("DELETE FROM organizations WHERE id = $1", [organizationId]);
    await query("DELETE FROM templates WHERE id = $1", [template]);
    await pool.end();
  }
});
