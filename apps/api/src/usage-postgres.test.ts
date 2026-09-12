import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import type { Query } from "./services/query.js";
import type { Transaction } from "./db.js";
import { getUsageHistory } from "./services/usage-history.js";
import { observeUsage } from "./services/usage-observer.js";
import { InMemoryRuntimeProvider } from "./providers/runtime/dev-provider.js";
import type { RuntimeProvider } from "./providers/runtime/provider.js";
import { enqueueSandboxOperation } from "./services/sandbox-operations.js";
import { lockOrganizationCapacity, readOrganizationCapacity, reserveSandboxCapacity, releaseSandboxCapacity } from "./services/organization-capacity.js";

const databaseUrl = process.env.USAGE_TEST_DATABASE_URL;
if (process.env.USAGE_TEST_REQUIRED === "1" && !databaseUrl) throw new Error("USAGE_TEST_DATABASE_URL must point to the disposable CI database");
if (databaseUrl && process.env.GITHUB_ACTIONS !== "true") throw new Error("Usage database acceptance is restricted to disposable GitHub runners, never the local lab");

test("PostgreSQL usage observations, concurrency, retention and bounded queries", { skip: !databaseUrl, timeout: 180_000 }, async (t) => {
  const schema = `usage_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString: databaseUrl });
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 8, options: `-c search_path=${schema},public` });
  const observerPool = new pg.Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema},public`,
    connectionTimeoutMillis: 1000, statement_timeout: 2000, query_timeout: 3000, idle_in_transaction_session_timeout: 3000 });
  const query: Query = (sql, params) => pool.query(sql, params);
  const inTransaction = (storage: pg.Pool): Transaction => async (work) => {
    const client = await storage.connect();
    try {
      await client.query("BEGIN");
      const value = await work((sql, params) => client.query(sql, params));
      await client.query("COMMIT"); return value;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  };
  const transaction = inTransaction(pool);
  const observerQuery: Query = (sql, params) => observerPool.query(sql, params);
  const runtimeProvider = new InMemoryRuntimeProvider();
  runtimeProvider.isReady = async () => true;
  const deps = { query: observerQuery, transaction: inTransaction(observerPool), runtimeProvider };
  const org = async (limit = 200) => {
    const id = randomUUID();
    await query("INSERT INTO organizations(id,name,slug,max_concurrency,created_at) VALUES ($1,'Usage test',$1::text,$2,now()-interval '31 days')", [id, limit]);
    return id;
  };
  const admit = (organizationId: string, key = randomUUID()) => transaction(async (q) => {
    await lockOrganizationCapacity(organizationId, q);
    const old = await q<{ id: string; sandbox_id: string }>("SELECT id,sandbox_id FROM sandbox_operations WHERE organization_id=$1 AND kind='provision' AND idempotency_key=$2", [organizationId, key]);
    if (old.rows[0]) return { sandboxId: old.rows[0].sandbox_id, operationId: old.rows[0].id };
    const sandboxId = `sbx_${randomUUID()}`;
    await q("INSERT INTO sandboxes(id,organization_id,template_id,name,status,owner_label,opensandbox_id) VALUES ($1,$2,'usage-template','test','running','fixture',$1)", [sandboxId, organizationId]);
    const { operation } = await enqueueSandboxOperation({ organizationId, sandboxId, kind: "provision", idempotencyKey: key }, { query: q });
    await reserveSandboxCapacity({ organizationId, sandboxId, operationId: operation.id }, q);
    return { sandboxId, operationId: operation.id };
  });
  const observation = async (operationId: string) => (await query<{ state: string; first_ready_at: Date | null; claim_token: string | null }>("SELECT state,first_ready_at,claim_token FROM usage_readiness_observations WHERE operation_id=$1", [operationId])).rows[0];
  const readyCycle = async () => {
    const organizationId = await org();
    return { organizationId, ...await admit(organizationId) };
  };
  try {
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    const migrations = new URL("../../../db/migrations/", import.meta.url);
    for (const name of (await readdir(migrations)).filter((file) => file.endsWith(".sql")).sort()) {
      const sql = await readFile(new URL(name, migrations), "utf8");
      await transaction((q) => q(sql));
    }
    await query("INSERT INTO templates(id,name,description,image,icon) VALUES ('usage-template','Usage test','','fixture:1','box')");
    await query("UPDATE usage_collection_state SET available_from=now()-interval '31 days'");
    await observeUsage(deps);

    await t.test("two collectors and repeated admission persist one ready result per accepted intent", async () => {
      const organizationId = await org(1), key = randomUUID();
      const cycles = await Promise.all(Array.from({ length: 20 }, () => admit(organizationId, key)));
      assert.equal(new Set(cycles.map((cycle) => cycle.operationId)).size, 1);
      await Promise.all([observeUsage(deps), observeUsage(deps)]);
      const before = await observation(cycles[0].operationId);
      assert.equal(before.state, "ready"); assert.ok(before.first_ready_at);
      await observeUsage(deps);
      assert.equal((await observation(cycles[0].operationId)).first_ready_at!.getTime(), before.first_ready_at.getTime());
      assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 1);
    });

    await t.test("abandoned claims are reclaimed; in-flight claims are not stolen", async () => {
      const cycle = await readyCycle();
      await query("INSERT INTO usage_readiness_observations(operation_id,organization_id,sandbox_id,accepted_at,claim_token,claim_until) SELECT id,organization_id,sandbox_id,created_at,$2,now()+interval '1 minute' FROM sandbox_operations WHERE id=$1", [cycle.operationId, randomUUID()]);
      await observeUsage(deps); assert.equal((await observation(cycle.operationId)).state, "pending");
      await query("UPDATE usage_readiness_observations SET claim_until=now()-interval '1 second' WHERE operation_id=$1", [cycle.operationId]);
      await observeUsage(deps); assert.equal((await observation(cycle.operationId)).state, "ready");
    });

    await t.test("retained-slot resume gets a distinct readiness observation without another hold", async () => {
      const cycle = await readyCycle();
      const next = await transaction(async (q) => {
        await lockOrganizationCapacity(cycle.organizationId, q);
        const { operation } = await enqueueSandboxOperation({ ...cycle, kind: "resume" }, { query: q });
        await q("UPDATE sandbox_capacity_reservations SET operation_id=$2 WHERE sandbox_id=$1", [cycle.sandboxId, operation.id]);
        return operation.id;
      });
      await observeUsage(deps);
      assert.equal((await observation(cycle.operationId)).state, "censored");
      assert.equal((await observation(next)).state, "ready");
      assert.equal((await query("SELECT generation FROM sandbox_capacity_reservations WHERE sandbox_id=$1", [cycle.sandboxId])).rows.length, 1);
    });

    await t.test("released-slot resume creates a new generation and preserves the earlier ready observation", async () => {
      const cycle = await readyCycle();
      await observeUsage(deps);
      const first = (await observation(cycle.operationId)).first_ready_at!.getTime();
      const resumed = await transaction(async (q) => {
        await lockOrganizationCapacity(cycle.organizationId, q);
        await releaseSandboxCapacity({ ...cycle, generation: 1, reason: "provider_suspended" }, q);
        const { operation } = await enqueueSandboxOperation({ ...cycle, kind: "resume" }, { query: q });
        await reserveSandboxCapacity({ ...cycle, operationId: operation.id }, q);
        return operation.id;
      });
      await observeUsage(deps);
      assert.equal((await observation(resumed)).state, "ready");
      assert.equal((await observation(cycle.operationId)).first_ready_at!.getTime(), first);
      const holds = await query("SELECT generation,released_at FROM sandbox_capacity_reservations WHERE sandbox_id=$1 ORDER BY generation", [cycle.sandboxId]);
      assert.deepEqual(holds.rows.map(row => row.generation), [1, 2]);
      assert.ok(holds.rows[0].released_at); assert.equal(holds.rows[1].released_at, null);
    });

    await t.test("restore is counted separately without disclosing the operation request", async () => {
      const cycle = await readyCycle();
      await query("UPDATE sandbox_operations SET request=$2 WHERE id=$1", [cycle.operationId, JSON.stringify({ restoreSnapshotId: "snap_private", env: { PRIVATE_VALUE: "not-for-usage" } })]);
      await observeUsage(deps);
      const history = await getUsageHistory(cycle.organizationId, { from: new Date(Date.now() - 300_000).toISOString(), to: new Date().toISOString(), resolution: "1m" }, { transaction });
      assert.deepEqual(history.summary.acceptedOperations, { create: 0, restore: 1, resume: 0 });
      assert.doesNotMatch(JSON.stringify(history), /snap_private|PRIVATE_VALUE|not-for-usage/);
    });

    await t.test("a provider identity change during a probe cannot save a ready result", async () => {
      const cycle = await readyCycle();
      runtimeProvider.isReady = async () => { await query("UPDATE sandboxes SET opensandbox_id='replacement' WHERE id=$1", [cycle.sandboxId]); return true; };
      await observeUsage(deps);
      assert.equal((await observation(cycle.operationId)).state, "pending");
      assert.equal((await observation(cycle.operationId)).first_ready_at, null);
      runtimeProvider.isReady = async () => true;
      await query("UPDATE usage_readiness_observations SET next_check_at=now() WHERE operation_id=$1", [cycle.operationId]);
      await observeUsage(deps); assert.equal((await observation(cycle.operationId)).state, "ready");
    });

    await t.test("expired probe leases cannot commit stale results", async () => {
      const cycle = await readyCycle();
      runtimeProvider.isReady = async () => { await query("UPDATE usage_readiness_observations SET claim_until=now()-interval '1 second' WHERE operation_id=$1", [cycle.operationId]); return true; };
      await observeUsage(deps); assert.equal((await observation(cycle.operationId)).state, "pending");
      runtimeProvider.isReady = async () => true;
      await observeUsage(deps); assert.equal((await observation(cycle.operationId)).state, "ready");
    });

    await t.test("failed probes never free capacity; completed short cycles remain discoverable", async () => {
      const cycle = await readyCycle();
      runtimeProvider.isReady = async () => { throw new Error("provider unavailable, sensitive detail"); };
      await observeUsage(deps);
      assert.equal((await observation(cycle.operationId)).state, "pending");
      assert.equal((await readOrganizationCapacity(cycle.organizationId, query)).inUse, 1);
      await transaction((q) => releaseSandboxCapacity({ ...cycle, generation: 1, reason: "provider_absent" }, q));
      await query("UPDATE usage_readiness_observations SET next_check_at=now() WHERE operation_id=$1", [cycle.operationId]);
      await observeUsage(deps); assert.equal((await observation(cycle.operationId)).state, "censored");
      runtimeProvider.isReady = async () => true;
      const short = await readyCycle();
      await transaction((q) => releaseSandboxCapacity({ ...short, generation: 1, reason: "provider_absent" }, q));
      await query("UPDATE sandbox_operations SET state='succeeded',completed_at=clock_timestamp() WHERE id=$1", [short.operationId]);
      await observeUsage(deps); assert.equal((await observation(short.operationId)).state, "censored");
    });

    await t.test("rollback and late commits do not create phantom operations or skip discovery", async () => {
      const cycle = await readyCycle();
      const client = await pool.connect();
      const id = `op_${randomUUID()}`;
      const rolledBack = `op_${randomUUID()}`;
      try {
        await client.query("BEGIN");
        await client.query("INSERT INTO sandbox_operations(id,organization_id,sandbox_id,kind) VALUES ($1,$2,$3,'resume')", [rolledBack, cycle.organizationId, cycle.sandboxId]);
        await client.query("ROLLBACK");
        await observeUsage(deps); assert.equal(await observation(rolledBack), undefined);
        await client.query("BEGIN");
        await client.query("INSERT INTO sandbox_operations(id,organization_id,sandbox_id,kind) VALUES ($1,$2,$3,'resume')", [id, cycle.organizationId, cycle.sandboxId]);
        await observeUsage(deps); assert.equal(await observation(id), undefined);
        await client.query("COMMIT");
        await observeUsage(deps); assert.equal((await observation(id)).state, "censored");
      } finally { await client.query("ROLLBACK"); client.release(); }
    });

    await t.test("unsupported readiness remains unavailable without releasing its slot", async () => {
      const cycle = await readyCycle();
      const unsupported: RuntimeProvider = Object.assign(Object.create(runtimeProvider), { isReady: undefined });
      await observeUsage({ ...deps, runtimeProvider: unsupported });
      assert.equal((await observation(cycle.operationId)).state, "unsupported");
      assert.equal((await observation(cycle.operationId)).first_ready_at, null);
      assert.equal((await readOrganizationCapacity(cycle.organizationId, query)).inUse, 1);
    });

    await t.test("restart gaps are explicit and old open holds survive retention", async () => {
      const cycle = await readyCycle();
      await query("UPDATE sandbox_capacity_reservations SET created_at=now()-interval '31 days' WHERE sandbox_id=$1", [cycle.sandboxId]);
      await query("UPDATE usage_collection_state SET last_observed_at=now()-interval '2 minutes'");
      await query("UPDATE usage_observer_windows SET started_at=LEAST(started_at,now()-interval '3 minutes'),observed_through=now()-interval '2 minutes' WHERE id=(SELECT max(id) FROM usage_observer_windows)");
      await observeUsage(deps);
      assert.ok((await query("SELECT id FROM usage_observer_windows")).rows.length >= 2);
      assert.equal((await readOrganizationCapacity(cycle.organizationId, query)).inUse, 1);
      const to = new Date(), from = new Date(to.getTime() - 240_000);
      const history = await getUsageHistory(cycle.organizationId, { from: from.toISOString(), to: to.toISOString(), resolution: "1m" }, { transaction });
      assert.equal(history.coverage.status, "partial");
      assert.ok(history.coverage.gaps.some((gap) => Date.parse(gap.to) - Date.parse(gap.from) > 60_000));
      assert.equal(history.summary.peakHeldSlots, 1);
      assert.ok(history.summary.heldSlotSeconds! > 0);
      assert.ok(history.summary.readiness.sampleCount + history.summary.readiness.unobservedCount <= 1);
    });

    await t.test("read queries are tenant-scoped and do not wait for the admission lock", async () => {
      const cycle = await readyCycle();
      await observeUsage(deps);
      const locked = await pool.connect();
      try {
        await locked.query("BEGIN");
        await locked.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [cycle.organizationId]);
        const options = { from: new Date(Date.now() - 300_000).toISOString(), to: new Date().toISOString(), resolution: "1m" as const };
        const result = await getUsageHistory(cycle.organizationId, options, { transaction });
        assert.equal(result.summary.acceptedOperations?.create, 1);
        const empty = await getUsageHistory(await org(), options, { transaction });
        assert.equal(empty.summary.acceptedOperations?.create, 0);
        assert.equal(empty.summary.peakHeldSlots, 0);
      } finally { await locked.query("ROLLBACK"); locked.release(); }
    });

    await t.test("three matched trials bound admission and confirmed-cleanup overhead during collection", async () => {
      const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
      const baseline = { admission: [] as number[], cleanup: [] as number[] };
      const observed = { admission: [] as number[], cleanup: [] as number[] };
      let successfulPasses = 0;
      const measure = async (collect: boolean) => {
        const organizationId = await org(1), admission: number[] = [], cleanup: number[] = [];
        let collecting: Promise<unknown> | undefined;
        let collectionError: unknown;
        const startPass = () => {
          if (!collecting) collecting = observeUsage(deps).then(() => { successfulPasses++; }).catch(error => { collectionError = error; }).finally(() => { collecting = undefined; });
          return collecting;
        };
        const pending: Promise<unknown>[] = [];
        const timer = collect ? setInterval(() => { pending.push(startPass()); }, 10_000) : undefined;
        try {
          if (collect) pending.push(startPass());
          for (let i = 0; i < 75; i++) {
            const began = performance.now();
            const cycle = await admit(organizationId);
            admission.push(performance.now() - began);
            const beforeCleanup = performance.now();
            await transaction((q) => releaseSandboxCapacity({ ...cycle, organizationId, generation: 1, reason: "provider_absent" }, q));
            cleanup.push(performance.now() - beforeCleanup);
            await delay(150);
          }
          assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 0);
          return { admission: median(admission.slice(5)), cleanup: median(cleanup.slice(5)) };
        } finally {
          clearInterval(timer);
          await Promise.all(pending);
          if (collectionError) throw collectionError;
        }
      };
      for (let trial = 0; trial < 3; trial++) {
        // Alternate order to limit warm-cache or background runner drift bias.
        for (const collect of trial % 2 ? [true, false] : [false, true]) {
          const result = await measure(collect), target = collect ? observed : baseline;
          target.admission.push(result.admission); target.cleanup.push(result.cleanup);
        }
      }
      assert.ok(successfulPasses >= 6);
      t.diagnostic(JSON.stringify({ matchedTrials: 3, cyclesPerTrial: 75, successfulPasses, baseline, observed }));
      for (const kind of ["admission", "cleanup"] as const) {
        assert.ok(median(observed[kind]) <= median(baseline[kind]) * 1.15, `${kind} median exceeds the 15% reference regression budget`);
      }
    });

    await t.test("50,000 operations / 200 open slots stay within the query budget", async () => {
      const organizationId = await org(), prefix = randomUUID();
      const end = new Date(), start = new Date(end.getTime() - 30 * 86_400_000);
      await query("INSERT INTO sandboxes(id,organization_id,template_id,name,status,owner_label) SELECT $2||i,$1,'usage-template','scale','running','fixture' FROM generate_series(1,200) i", [organizationId, prefix]);
      await query(`INSERT INTO sandbox_operations(id,organization_id,sandbox_id,kind,state,created_at,completed_at)
        SELECT $2||'op'||i,$1,$2||((i%200)+1),CASE WHEN i%3=0 THEN 'resume' ELSE 'provision' END,'succeeded',
        $3::timestamptz+(i * interval '45 seconds'),$3::timestamptz+(i * interval '45 seconds')+interval '2 seconds' FROM generate_series(1,50000) i`, [organizationId, prefix, start]);
      await query(`INSERT INTO usage_readiness_observations(operation_id,organization_id,sandbox_id,accepted_at,state,first_ready_at,finished_at,last_probe_status)
        SELECT id,organization_id,sandbox_id,created_at,'ready',created_at+interval '3 seconds',created_at+interval '3 seconds','ready'
        FROM sandbox_operations WHERE organization_id=$1`, [organizationId]);
      await query("INSERT INTO sandbox_capacity_reservations(organization_id,sandbox_id,generation,phase,created_at) SELECT $1,$2||i,1,'active',$3 FROM generate_series(1,200) i", [organizationId, prefix, start]);
      await query("INSERT INTO usage_observer_windows(started_at,observed_through) VALUES ($1,$2)", [start, end]);
      await query("ANALYZE sandbox_operations"); await query("ANALYZE sandbox_capacity_reservations"); await query("ANALYZE usage_readiness_observations");
      const options = { from: start.toISOString(), to: end.toISOString(), resolution: "1h" as const };
      const timings: number[] = [];
      for (let i = 0; i < 12; i++) {
        const began = performance.now();
        const result = await getUsageHistory(organizationId, options, { transaction });
        if (i >= 2) timings.push(performance.now() - began);
        const counts = result.summary.acceptedOperations!;
        assert.equal(counts.create + counts.restore + counts.resume, 50_000);
        assert.equal(result.summary.peakHeldSlots, 200);
        assert.equal(result.summary.readiness.sampleCount, 50_000);
        assert.equal(result.summary.readiness.p95Ms, 3_000);
        assert.equal(result.buckets.length <= 1500, true);
      }
      timings.sort((a, b) => a - b);
      const p95 = timings[Math.ceil(timings.length * .95) - 1];
      const { rows: sizes } = await query<{ observations: string; operations: string; holds: string }>(`SELECT pg_total_relation_size('usage_readiness_observations')::text AS observations,
        pg_total_relation_size('sandbox_operations')::text AS operations,pg_total_relation_size('sandbox_capacity_reservations')::text AS holds`);
      t.diagnostic(JSON.stringify({ fixtureOperations: 50_000, fixtureDays: 30, heldSlots: 200, historyP95Ms: Math.round(p95), trials: timings.length, bytesIncludingIndexes: sizes[0] }));
      assert.ok(p95 < 1_000, `history p95 ${p95}ms exceeds the reference acceptance target`);
    });
  } finally {
    await observerPool.end();
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
