import type { QueryResultRow } from "pg";
import { closeDb, query as defaultQuery } from "./db.js";
import { runtimeProvider as defaultRuntimeProvider } from "./providers/runtime/index.js";
import type { RuntimeProvider, RuntimeSandboxRef } from "./providers/runtime/provider.js";
import { config, logDeprecatedConfigWarnings } from "./config.js";
import { processSandboxOperationQueue, type ProcessSandboxOperationQueueReport } from "./services/sandbox-operation-worker.js";
import { cleanupTemplateRetention, type TemplateRetentionReport } from "./template-retention.js";

export const normalizeState = (state?: string | null) => {
  const value = String(state ?? "").toLowerCase();
  if (value.includes("running") || value.includes("ready")) return "running";
  if (value.includes("pending") || value.includes("creating")) return "pending";
  if (value.includes("fail") || value.includes("error")) return "error";
  if (value.includes("delete") || value.includes("terminat") || value.includes("stopped")) return "terminated";
  return "running";
};

export const shouldRunTemplateRetention = (lastRunAtMs: number, nowMs: number, intervalMs: number) =>
  intervalMs > 0 && nowMs - lastRunAtMs >= intervalMs;

let lastTemplateRetentionAtMs = 0;

const reportTotal = (report: TemplateRetentionReport) =>
  report.logsDeleted + report.contextsDeleted + report.buildsDeleted + report.versionsRetired + report.builderJobsDeleted;

type SchedulerQuery = <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;

export type SchedulerDependencies = {
  query?: SchedulerQuery;
  runtimeProvider?: RuntimeProvider;
  processSandboxOperationQueue?: (dependencies: {
    query: SchedulerQuery;
    runtimeProvider: RuntimeProvider;
  }) => Promise<ProcessSandboxOperationQueueReport>;
  runTemplateRetentionIfDue?: () => Promise<TemplateRetentionReport | null>;
};

const runtimeRef = (provider: RuntimeProvider, providerSandboxId: string | null | undefined): RuntimeSandboxRef => ({
  provider: provider.kind,
  providerSandboxId: providerSandboxId ?? ""
});

export const runTemplateRetentionIfDue = async (nowMs = Date.now()) => {
  if (!config.templateRetentionEnabled) return null;
  if (!shouldRunTemplateRetention(lastTemplateRetentionAtMs, nowMs, config.templateRetentionIntervalMs)) return null;
  lastTemplateRetentionAtMs = nowMs;
  try {
    const report = await cleanupTemplateRetention();
    if (reportTotal(report) > 0) console.log("template retention cleanup", report);
    return report;
  } catch (error) {
    console.error("template retention cleanup failed", error);
    return null;
  }
};

export const reconcile = async (dependencies: SchedulerDependencies = {}) => {
  const query = dependencies.query ?? defaultQuery;
  const runtimeProvider = dependencies.runtimeProvider ?? defaultRuntimeProvider;
  const rows = await query<{ id: string; opensandbox_id: string }>(
    `SELECT id, opensandbox_id FROM sandboxes
     WHERE opensandbox_id IS NOT NULL AND status IN ('running', 'pending', 'idle')
     LIMIT 100`
  );
  for (const row of rows.rows) {
    const provider = await runtimeProvider.get(runtimeRef(runtimeProvider, row.opensandbox_id));
    if (!provider) {
      await query("UPDATE sandboxes SET status = 'terminated', updated_at = now() WHERE id = $1", [row.id]);
      await query(
        `UPDATE sandbox_routes
         SET state = 'terminated', terminated_at = COALESCE(terminated_at, now()), updated_at = now()
         WHERE sandbox_id = $1 AND state <> 'terminated'`,
        [row.id]
      );
      continue;
    }
    const status = normalizeState(provider.state);
    await query(
      `UPDATE sandboxes
       SET status = $2, expires_at = COALESCE($3::timestamptz, expires_at), updated_at = now()
       WHERE id = $1 AND status IS DISTINCT FROM $2`,
      [row.id, status, provider.expiresAt ?? null]
    );
    if (status === "terminated") {
      await query(
        `UPDATE sandbox_routes
         SET state = 'terminated', terminated_at = COALESCE(terminated_at, now()), updated_at = now()
         WHERE sandbox_id = $1 AND state <> 'terminated'`,
        [row.id]
      );
    }
  }
};

export const tick = async (dependencies: SchedulerDependencies = {}) => {
  const query = dependencies.query ?? defaultQuery;
  const runtimeProvider = dependencies.runtimeProvider ?? defaultRuntimeProvider;
  await reconcile(dependencies);
  await (dependencies.processSandboxOperationQueue ?? processSandboxOperationQueue)({ query, runtimeProvider });
  const due = await query<{
    schedule_id: string;
    sandbox_id: string;
    organization_id: string;
    opensandbox_id: string | null;
  }>(
    `SELECT ss.id AS schedule_id, ss.sandbox_id, ss.organization_id, s.opensandbox_id
     FROM sandbox_schedules ss
     JOIN sandboxes s ON s.id = ss.sandbox_id
     WHERE ss.completed_at IS NULL
       AND ss.run_at <= now()
       AND ss.kind = 'idle_ttl'
       AND s.status IN ('running', 'idle', 'pending')
     LIMIT 20`
  );
  for (const item of due.rows) {
    if (item.opensandbox_id) await runtimeProvider.delete(runtimeRef(runtimeProvider, item.opensandbox_id));
    await query("UPDATE sandboxes SET status = 'terminated', updated_at = now() WHERE id = $1", [item.sandbox_id]);
    await query(
      `UPDATE sandbox_routes
       SET state = 'terminated', terminated_at = COALESCE(terminated_at, now()), updated_at = now()
       WHERE sandbox_id = $1`,
      [item.sandbox_id]
    );
    await query("UPDATE sandbox_schedules SET completed_at = now() WHERE id = $1", [item.schedule_id]);
    await query(
      `INSERT INTO sandbox_events (sandbox_id, organization_id, type, message)
       VALUES ($1, $2, 'ttl', 'idle ttl exceeded - sandbox terminated - disk zeroed')`,
      [item.sandbox_id, item.organization_id]
    );
  }
  await (dependencies.runTemplateRetentionIfDue ?? runTemplateRetentionIfDue)();
};

if (import.meta.url === `file://${process.argv[1]}`) {
  logDeprecatedConfigWarnings();
  console.log("harakiri scheduler started");
  const timer = setInterval(() => {
    tick().catch((error) => console.error(error));
  }, 10_000);
  tick().catch((error) => console.error(error));
  const shutdown = async () => {
    clearInterval(timer);
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
