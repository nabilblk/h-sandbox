import { recordAuditEvent } from "../audit.js";
import { query as defaultQuery } from "../db.js";
import { runtimeProvider as defaultRuntimeProvider } from "../providers/runtime/index.js";
import type { RuntimeProvider } from "../providers/runtime/provider.js";
import {
  inspectSandboxCredentials,
  refreshSandboxCredential,
  rehydrateSandboxCredentials
} from "./credential-vault.js";
import type { Query } from "./query.js";
import { recordSandboxEvent } from "./sandbox-events.js";
import type { Audit, SandboxEventRecorder } from "./sandbox-runtime.js";

const reconciliationBatchSize = 20;
const dynamicRefreshLeadSeconds = 5 * 60;
const reconciliationRetrySeconds = 60;
const inspectionIntervalSeconds = 5 * 60;
const systemActorLabel = "harakiri-scheduler";

type CredentialReconciliationWork = {
  organizationId: string;
  sandboxId: string;
  attachmentId: string;
  status: "injected" | "requires_reinjection";
};

type CredentialInspectionWork = {
  organizationId: string;
  sandboxId: string;
};

export type CredentialVaultReconciliationReport = {
  claimed: number;
  inspectionClaimed: number;
  inspected: number;
  refreshed: number;
  rehydrated: number;
  skipped: number;
  failed: number;
  errors: string[];
};

type CredentialVaultReconciliationDependencies = {
  query?: Query;
  runtimeProvider?: RuntimeProvider;
  recordEvent?: SandboxEventRecorder;
  recordAudit?: Audit;
  refresh?: typeof refreshSandboxCredential;
  rehydrate?: typeof rehydrateSandboxCredentials;
  inspect?: typeof inspectSandboxCredentials;
};

export const claimCredentialInspectionWork = async (
  query: Query,
  limit = reconciliationBatchSize
): Promise<CredentialInspectionWork[]> => {
  const result = await query<CredentialInspectionWork>(
    `WITH candidates AS (
       SELECT sandbox.id AS sandbox_id, sandbox.organization_id
       FROM sandboxes sandbox
       WHERE sandbox.status IN ('running', 'idle')
         AND EXISTS (
           SELECT 1
           FROM sandbox_credential_attachments attachment
           WHERE attachment.sandbox_id = sandbox.id
             AND attachment.organization_id = sandbox.organization_id
             AND attachment.detached_at IS NULL
             AND (
               attachment.provider_checked_at IS NULL
               OR attachment.provider_checked_at <= now() - ($2 * interval '1 second')
             )
         )
       ORDER BY sandbox.updated_at ASC
       LIMIT $1
       FOR UPDATE OF sandbox SKIP LOCKED
     ), leased AS (
       UPDATE sandbox_credential_attachments attachment
       SET provider_checked_at = now(), updated_at = now()
       FROM candidates
       WHERE attachment.sandbox_id = candidates.sandbox_id
         AND attachment.organization_id = candidates.organization_id
         AND attachment.detached_at IS NULL
       RETURNING attachment.sandbox_id
     )
     SELECT candidates.organization_id::text AS "organizationId",
            candidates.sandbox_id AS "sandboxId"
     FROM candidates
     WHERE EXISTS (SELECT 1 FROM leased WHERE leased.sandbox_id = candidates.sandbox_id)`,
    [limit, inspectionIntervalSeconds]
  );
  return result.rows;
};

export const claimCredentialReconciliationWork = async (
  query: Query,
  limit = reconciliationBatchSize
): Promise<CredentialReconciliationWork[]> => {
  const result = await query<CredentialReconciliationWork>(
    `WITH candidates AS (
       SELECT attachment.id
       FROM sandbox_credential_attachments attachment
       JOIN sandboxes sandbox ON sandbox.id = attachment.sandbox_id
       WHERE attachment.detached_at IS NULL
         AND attachment.source_type IN ('harakiri_encrypted', 'external_ref', 'dynamic')
         AND sandbox.status IN ('running', 'idle')
         AND (
           attachment.status = 'requires_reinjection'
           OR (
             attachment.source_type = 'dynamic'
             AND attachment.status = 'injected'
             AND attachment.expires_at <= now() + ($2 * interval '1 second')
           )
         )
         AND (
           attachment.refresh_attempted_at IS NULL
           OR attachment.refresh_attempted_at <= now() - ($3 * interval '1 second')
         )
       ORDER BY attachment.expires_at ASC NULLS LAST, attachment.updated_at ASC
       LIMIT $1
       FOR UPDATE OF attachment SKIP LOCKED
     )
     UPDATE sandbox_credential_attachments attachment
     SET refresh_attempted_at = now(), updated_at = now()
     FROM candidates
     WHERE attachment.id = candidates.id
     RETURNING attachment.organization_id::text AS "organizationId",
               attachment.sandbox_id AS "sandboxId",
               attachment.id AS "attachmentId",
               attachment.status`,
    [limit, dynamicRefreshLeadSeconds, reconciliationRetrySeconds]
  );
  return result.rows;
};

const defaultAudit = (query: Query): Audit =>
  (organizationId, actorUserId, actorLabel, action, targetType, targetId, metadata) =>
    recordAuditEvent(
      { organizationId, actorUserId, actorLabel, action, targetType, targetId, metadata },
      { query }
    );

const emptyReport = (claimed: number, inspectionClaimed: number): CredentialVaultReconciliationReport => ({
  claimed,
  inspectionClaimed,
  inspected: 0,
  refreshed: 0,
  rehydrated: 0,
  skipped: 0,
  failed: 0,
  errors: []
});

const errorMessage = (work: CredentialReconciliationWork) =>
  `${work.attachmentId}: credential reconciliation failed`;

const inspectionErrorMessage = (work: CredentialInspectionWork) =>
  `${work.sandboxId}: credential inspection failed`;

export const reconcileCredentialVault = async (
  dependencies: CredentialVaultReconciliationDependencies = {}
): Promise<CredentialVaultReconciliationReport> => {
  const query = dependencies.query ?? defaultQuery;
  const runtimeProvider = dependencies.runtimeProvider ?? defaultRuntimeProvider;
  const recordEvent = dependencies.recordEvent ?? recordSandboxEvent(query);
  const recordAudit = dependencies.recordAudit ?? defaultAudit(query);
  const refresh = dependencies.refresh ?? refreshSandboxCredential;
  const rehydrate = dependencies.rehydrate ?? rehydrateSandboxCredentials;
  const inspect = dependencies.inspect ?? inspectSandboxCredentials;
  const inspections = runtimeProvider.getCredentialVault
    ? await claimCredentialInspectionWork(query)
    : [];

  const inspectionReport = emptyReport(0, inspections.length);
  for (const item of inspections) {
    try {
      const result = await inspect(item, { query, runtimeProvider });
      if (result.kind === "ok") inspectionReport.inspected += 1;
      else if (result.kind === "provider_unavailable") {
        inspectionReport.failed += 1;
        inspectionReport.errors.push(inspectionErrorMessage(item));
      } else inspectionReport.skipped += 1;
    } catch {
      inspectionReport.failed += 1;
      inspectionReport.errors.push(inspectionErrorMessage(item));
    }
  }

  const work = await claimCredentialReconciliationWork(query);
  const report = { ...inspectionReport, claimed: work.length };
  const rehydratedSandboxes = new Set<string>();

  for (const item of work) {
    try {
      if (item.status === "requires_reinjection") {
        if (rehydratedSandboxes.has(item.sandboxId)) continue;
        rehydratedSandboxes.add(item.sandboxId);
        const result = await rehydrate(
          { ...item, actorUserId: null, actorLabel: systemActorLabel },
          { query, runtimeProvider, recordEvent, recordAudit }
        );
        if (result.kind !== "ok") {
          report.failed += 1;
          report.errors.push(`${item.attachmentId}: ${result.kind}`);
          continue;
        }
        report.rehydrated += result.rehydrated;
        report.skipped += result.skipped;
        report.failed += result.failed;
        continue;
      }

      const result = await refresh(
        { ...item, actorUserId: null, actorLabel: systemActorLabel },
        { query, runtimeProvider, recordEvent, recordAudit }
      );
      if (result.kind === "ok") report.refreshed += 1;
      else {
        report.failed += 1;
        report.errors.push(`${item.attachmentId}: ${result.kind}`);
      }
    } catch {
      report.failed += 1;
      report.errors.push(errorMessage(item));
    }
  }

  return report;
};
