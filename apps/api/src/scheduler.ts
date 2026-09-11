import type { QueryResultRow } from "pg";
import { closeDb, query as defaultQuery, type Transaction } from "./db.js";
import { runtimeProvider as defaultRuntimeProvider } from "./providers/runtime/index.js";
import type { RuntimeProvider } from "./providers/runtime/provider.js";
import { config, logDeprecatedConfigWarnings } from "./config.js";
import { processSandboxOperationQueue, type ProcessSandboxOperationQueueReport } from "./services/sandbox-operation-worker.js";
import {
  reconcileCredentialVault,
  type CredentialVaultReconciliationReport
} from "./services/credential-vault-reconciler.js";
import { cleanupTemplateRetention, type TemplateRetentionReport } from "./template-retention.js";
import { reconcileWorkspaces } from "./services/persistent-workspaces.js";
import { normalizeRuntimeState, reconcileSandboxLease } from "./services/sandbox-lease.js";
import { reconcileSandboxCapacity } from "./services/sandbox-capacity-reconciler.js";

export const normalizeState = normalizeRuntimeState;

export const shouldRunTemplateRetention = (lastRunAtMs: number, nowMs: number, intervalMs: number) =>
  intervalMs > 0 && nowMs - lastRunAtMs >= intervalMs;

let lastTemplateRetentionAtMs = 0;

const reportTotal = (report: TemplateRetentionReport) =>
  report.logsDeleted + report.contextsDeleted + report.buildsDeleted + report.versionsRetired + report.builderJobsDeleted;

type SchedulerQuery = <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;

export type SchedulerDependencies = {
  query?: SchedulerQuery;
  transaction?: Transaction;
  runtimeProvider?: RuntimeProvider;
  processSandboxOperationQueue?: (dependencies: {
    query: SchedulerQuery;
    runtimeProvider: RuntimeProvider;
    transaction?: Transaction;
  }) => Promise<ProcessSandboxOperationQueueReport>;
  reconcileCredentialVault?: (dependencies: {
    query: SchedulerQuery;
    runtimeProvider: RuntimeProvider;
  }) => Promise<CredentialVaultReconciliationReport>;
  runTemplateRetentionIfDue?: () => Promise<TemplateRetentionReport | null>;
};

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
  return reconcileSandboxCapacity({ query, runtimeProvider, transaction: dependencies.transaction });
};

export const tick = async (dependencies: SchedulerDependencies = {}) => {
  const query = dependencies.query ?? defaultQuery;
  const runtimeProvider = dependencies.runtimeProvider ?? defaultRuntimeProvider;
  await reconcile(dependencies);
  await (dependencies.processSandboxOperationQueue ?? processSandboxOperationQueue)({ query, runtimeProvider, transaction: dependencies.transaction });
  const vaultReport = await (dependencies.reconcileCredentialVault ?? reconcileCredentialVault)({ query, runtimeProvider });
  if (vaultReport.failed > 0) console.error("credential vault reconciliation failed", vaultReport);
  const due = await query<{
    sandbox_id: string;
    organization_id: string;
  }>(
    `SELECT id AS sandbox_id, organization_id FROM sandboxes
     WHERE expires_at <= clock_timestamp()
       AND status IN ('running', 'idle', 'pending') AND opensandbox_id IS NOT NULL
     ORDER BY expires_at
     LIMIT 20`
  );
  for (const item of due.rows) {
    try {
      await reconcileSandboxLease({ sandboxId: item.sandbox_id, organizationId: item.organization_id, expire: true }, {
        query, runtimeProvider, transaction: dependencies.transaction
      });
    } catch (error) {
      console.error("sandbox expiration failed", item.sandbox_id, error);
    }
  }
  await (dependencies.runTemplateRetentionIfDue ?? runTemplateRetentionIfDue)();
  await reconcileWorkspaces(query, runtimeProvider);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  logDeprecatedConfigWarnings();
  console.log("harakiri scheduler started");
  let activeTick: Promise<void> | undefined;
  const runTick = () => {
    if (!activeTick) activeTick = tick().catch((error) => console.error(error)).finally(() => { activeTick = undefined; });
  };
  const timer = setInterval(runTick, 10_000);
  runTick();
  const shutdown = async () => {
    clearInterval(timer);
    await activeTick;
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
