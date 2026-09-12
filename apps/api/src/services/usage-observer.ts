import { randomUUID } from "node:crypto";
import pg from "pg";
import { z } from "zod";
import { transaction as defaultTransaction, query as defaultQuery, type Transaction } from "../db.js";
import { config } from "../config.js";
import type { RuntimeProvider } from "../providers/runtime/provider.js";
import type { Query } from "./query.js";
import { getSandboxReadiness } from "./sandbox-readiness.js";
import { readRuntimeFence } from "./sandbox-runtime-effects.js";
import { usageObserverIntervalMs } from "./usage-history.js";

type Observation = { operation_id: string; organization_id: string; sandbox_id: string; accepted_at: Date; claim_token: string };
export type UsageObserverReport = { discovered: number; checked: number; ready: number; censored: number; unsupported: number; failed: number; pending: number; oldestPendingAtSeconds: number };
type Dependencies = { runtimeProvider: RuntimeProvider; query?: Query; transaction?: Transaction; retentionDays?: number; signal?: AbortSignal; onProbe?: (status: string, seconds: number) => void };

const recordHeartbeat = async (query: Query) => {
  // Read the clock after acquiring this observer-only lock, not before waiting.
  const { rows } = await query<{ last_observed_at: Date | null; available_from: Date }>("SELECT last_observed_at,available_from FROM usage_collection_state FOR UPDATE");
  if (!rows[0]) throw new Error("Usage collection is not initialized");
  const { rows: clock } = await query<{ now: Date }>("SELECT clock_timestamp() AS now");
  const now = clock[0].now, last = rows[0].last_observed_at;
  if (last && now.getTime() >= last.getTime() && now.getTime() - last.getTime() <= 30_000) {
    await query("UPDATE usage_observer_windows SET observed_through=$1 WHERE id=(SELECT max(id) FROM usage_observer_windows)", [now]);
  } else await query("INSERT INTO usage_observer_windows(started_at,observed_through) VALUES ($1,$1)", [now]);
  await query("UPDATE usage_collection_state SET last_observed_at=$1", [now]);
  return { now, availableFrom: rows[0].available_from };
};

export const observeUsage = async (dependencies: Dependencies): Promise<UsageObserverReport> => {
  const query = dependencies.query ?? defaultQuery;
  const transaction = dependencies.transaction ?? defaultTransaction;
  const retentionDays = z.number().int().min(1).max(30).parse(dependencies.retentionDays ?? config.usageRetentionDays);
  const report: UsageObserverReport = { discovered: 0, checked: 0, ready: 0, censored: 0, unsupported: 0, failed: 0, pending: 0, oldestPendingAtSeconds: 0 };
  const token = randomUUID();
  const work = await transaction(async (q) => {
    await q("SET LOCAL statement_timeout = '2s'");
    await q("SET LOCAL lock_timeout = '1s'");
    const heartbeat = await recordHeartbeat(q);
    const cutoff = new Date(Math.max(heartbeat.availableFrom.getTime(), heartbeat.now.getTime() - retentionDays * 86_400_000));
    const discovered = await q(`INSERT INTO usage_readiness_observations(operation_id,organization_id,sandbox_id,accepted_at)
      SELECT o.id,o.organization_id,o.sandbox_id,o.created_at FROM sandbox_operations o
      WHERE o.kind IN ('provision','resume') AND o.sandbox_id IS NOT NULL
        AND o.created_at >= $1::timestamptz
        AND NOT EXISTS (SELECT 1 FROM usage_readiness_observations r WHERE r.operation_id=o.id)
      ORDER BY o.created_at,o.id LIMIT 200 ON CONFLICT DO NOTHING`, [cutoff]);
    report.discovered = discovered.rowCount ?? 0;
    return (await q<Observation>(`WITH due AS (
      SELECT operation_id FROM usage_readiness_observations WHERE state='pending' AND next_check_at<=clock_timestamp()
        AND (claim_until IS NULL OR claim_until<=clock_timestamp())
      ORDER BY next_check_at,operation_id LIMIT 8 FOR UPDATE SKIP LOCKED
    ) UPDATE usage_readiness_observations r SET claim_token=$1::uuid,claim_until=clock_timestamp()+interval '30 seconds'
      FROM due WHERE r.operation_id=due.operation_id RETURNING r.*`, [token])).rows;
  });
  const deadline = AbortSignal.timeout(12_000);
  const signal = dependencies.signal ? AbortSignal.any([dependencies.signal, deadline]) : deadline;
  let next = 0;
  const consume = async () => {
    while (next < work.length && !signal.aborted) {
      const row = work[next++];
      report.checked++;
      const finish = async (state: "censored" | "unsupported", reason: string) => {
        const updated = await query(`UPDATE usage_readiness_observations SET state=$3,last_probe_status=$4,finished_at=clock_timestamp(),claim_token=NULL,claim_until=NULL
          WHERE operation_id=$1 AND claim_token=$2::uuid AND claim_until>clock_timestamp() AND state='pending'`, [row.operation_id, token, state, reason]);
        if (updated.rowCount) report[state]++;
      };
      try {
        const { rows: current } = await query<{ operation_id: string | null; generation: number | null; opensandbox_id: string | null; elapsed: boolean }>(
          `SELECT r.operation_id,r.generation,s.opensandbox_id,clock_timestamp()>$3::timestamptz+interval '10 minutes' AS elapsed
           FROM sandboxes s LEFT JOIN sandbox_capacity_reservations r ON r.sandbox_id=s.id AND r.released_at IS NULL
           WHERE s.id=$1 AND s.organization_id=$2`, [row.sandbox_id, row.organization_id, row.accepted_at]);
        if (!current[0] || current[0].operation_id !== row.operation_id) { await finish("censored", "cycle_finished_or_replaced"); continue; }
        if (current[0].elapsed) { await finish("censored", "observation_window_elapsed"); continue; }
        const fence = await readRuntimeFence(row.sandbox_id, query);
        const began = performance.now();
        const observation = await getSandboxReadiness({ organizationId: row.organization_id, sandboxId: row.sandbox_id, signal }, { query, runtimeProvider: dependencies.runtimeProvider });
        dependencies.onProbe?.(observation?.readiness.status ?? "not_running", (performance.now() - began) / 1_000);
        if (!observation || observation.readiness.status === "not_running") { await finish("censored", "not_running"); continue; }
        if (observation.readiness.status === "unsupported") { await finish("unsupported", "unsupported"); continue; }
        if (observation.readiness.status === "ready" && fence && !fence.busy) {
          // Validate the accepted cycle again in the result statement. This writes
          // observations only; a concurrent lifecycle transition never loses its slot.
          const updated = await query(`UPDATE usage_readiness_observations o SET state='ready',first_ready_at=clock_timestamp(),finished_at=clock_timestamp(),
              last_probe_status='ready',claim_token=NULL,claim_until=NULL
            WHERE o.operation_id=$1 AND o.claim_token=$2::uuid AND o.claim_until>clock_timestamp() AND o.state='pending' AND clock_timestamp()>=o.accepted_at
              AND EXISTS (SELECT 1 FROM sandbox_capacity_reservations r JOIN sandboxes s ON s.id=r.sandbox_id
                WHERE r.sandbox_id=o.sandbox_id AND r.organization_id=o.organization_id AND r.operation_id=o.operation_id
                  AND r.generation=$3 AND r.released_at IS NULL AND s.status IN ('running','idle') AND s.opensandbox_id=$4)
              AND (SELECT count(*) FROM sandbox_runtime_effects e WHERE e.sandbox_id=o.sandbox_id)=$5::bigint
              AND NOT EXISTS (SELECT 1 FROM sandbox_runtime_effects e WHERE e.sandbox_id=o.sandbox_id AND e.settled_at IS NULL)`,
            [row.operation_id, token, current[0].generation, current[0].opensandbox_id, fence.version]);
          if (updated.rowCount) { report.ready++; continue; }
        }
        await query(`UPDATE usage_readiness_observations SET last_probe_status=$3,next_check_at=clock_timestamp()+interval '10 seconds',claim_token=NULL,claim_until=NULL
          WHERE operation_id=$1 AND claim_token=$2::uuid AND claim_until>clock_timestamp() AND state='pending'`, [row.operation_id, token, observation.readiness.status]);
      } catch { report.failed++; }
    }
  };
  await Promise.all([consume(), consume()]);
  await transaction(async (q) => {
    await q("SET LOCAL statement_timeout = '2s'");
    await q("SET LOCAL lock_timeout = '1s'");
    const { now } = await recordHeartbeat(q);
    const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
    await q(`DELETE FROM usage_readiness_observations WHERE operation_id IN (SELECT operation_id FROM usage_readiness_observations
      WHERE accepted_at<$1::timestamptz ORDER BY accepted_at LIMIT 500)`, [cutoff]);
    await q(`DELETE FROM usage_observer_windows WHERE id IN (SELECT id FROM usage_observer_windows
      WHERE observed_through<$1::timestamptz ORDER BY observed_through LIMIT 500)`, [cutoff]);
    const { rows: pending } = await q<{ count: string; oldest: string }>("SELECT count(*)::text AS count, COALESCE(extract(epoch FROM min(accepted_at)),0)::text AS oldest FROM usage_readiness_observations WHERE state='pending'");
    report.pending = Number(pending[0].count); report.oldestPendingAtSeconds = Number(pending[0].oldest);
  });
  return report;
};

export const startUsageObserver = (dependencies: Dependencies & { onReport?: (report: UsageObserverReport) => void; onError?: () => void }) => {
  // Dedicated connections prevent observation queries from consuming the pool
  // used by admission, lease expiry and cleanup. No connection spans a probe.
  const storage = new pg.Pool({ connectionString: config.databaseUrl, max: 2,
    connectionTimeoutMillis: 1_000, statement_timeout: 2_000, query_timeout: 3_000, idle_in_transaction_session_timeout: 3_000 });
  storage.on("error", () => dependencies.onError?.());
  const query: Query = (sql, params) => storage.query(sql, params);
  const transaction: Transaction = async (work) => {
    const client = await storage.connect();
    try {
      await client.query("BEGIN");
      const result = await work((sql, params) => client.query(sql, params));
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  };
  const controller = new AbortController();
  let active: Promise<void> | undefined;
  const run = () => {
    if (!active) active = observeUsage({ query, transaction, ...dependencies, signal: controller.signal })
      .then((report) => dependencies.onReport?.(report)).catch(() => dependencies.onError?.()).finally(() => { active = undefined; });
  };
  const timer = setInterval(run, usageObserverIntervalMs);
  run();
  return async () => { clearInterval(timer); controller.abort(); await active; await storage.end(); };
};
