import type { V1Job } from "@kubernetes/client-node";
import { config } from "./config.js";
import { query } from "./db.js";
import { kubernetes } from "./kubernetes.js";
import { recordAuditEvent } from "./audit.js";
import type { BlobStore } from "./storage/blob-store.js";
import type { BuildLogStore } from "./storage/build-log-store.js";
import { PostgresTemplateBuildContextBlobStore } from "./storage/postgres-blob-store.js";
import { buildLogStore } from "./build-logs.js";

type QueryResult<T = Record<string, unknown>> = {
  rowCount?: number | null;
  rows: T[];
};

type QueryRunner = {
  query: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<QueryResult<T>>;
};

type BatchApi = {
  listNamespacedJob: (input: { namespace: string; labelSelector?: string }) => Promise<{ items: V1Job[] }>;
  deleteNamespacedJob: (input: { namespace: string; name: string; propagationPolicy?: string }) => Promise<unknown>;
};

export type TemplateRetentionPolicy = {
  enabled: boolean;
  buildRetentionDays: number;
  buildLogRetentionDays: number;
  buildContextRetentionDays: number;
  versionRetentionDays: number;
  builderJobRetentionDays: number;
  deleteBuilderJobs: boolean;
};

export type TemplateRetentionReport = {
  logsDeleted: number;
  contextsDeleted: number;
  buildsDeleted: number;
  versionsRetired: number;
  builderJobsDeleted: number;
};

const terminalBuildStatuses = ["success", "failed", "canceled"];

const defaultDb: QueryRunner = {
  query: <T = Record<string, unknown>>(text: string, params: unknown[] = []) => query<T & Record<string, unknown>>(text, params) as Promise<QueryResult<T>>
};

const defaultBuildContextStore = new PostgresTemplateBuildContextBlobStore();

export const templateRetentionPolicy = (): TemplateRetentionPolicy => ({
  enabled: config.templateRetentionEnabled,
  buildRetentionDays: config.templateBuildRetentionDays,
  buildLogRetentionDays: config.templateBuildLogRetentionDays,
  buildContextRetentionDays: config.templateBuildContextRetentionDays,
  versionRetentionDays: config.templateVersionRetentionDays,
  builderJobRetentionDays: config.templateBuilderJobRetentionDays,
  deleteBuilderJobs: config.templateRetentionDeleteBuilderJobs
});

const enabledDays = (days: number) => Number.isFinite(days) && days > 0;

const count = (result: { rowCount?: number | null }) => result.rowCount ?? 0;

const parseDate = (value: unknown) => {
  if (value instanceof Date) return value;
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const jobFinishedAt = (job: V1Job) =>
  parseDate(job.status?.completionTime) ??
  parseDate(job.status?.conditions?.find((item) => item.type === "Complete" || item.type === "Failed")?.lastTransitionTime);

export const shouldDeleteTemplateBuilderJob = (job: V1Job, cutoff: Date) => {
  const name = job.metadata?.name;
  if (!name) return false;
  const finishedAt = jobFinishedAt(job);
  return Boolean(finishedAt && finishedAt.getTime() < cutoff.getTime());
};

export const cleanupTemplateBuilderJobs = async (
  policy: Pick<TemplateRetentionPolicy, "builderJobRetentionDays" | "deleteBuilderJobs">,
  options: { now?: Date; namespace?: string; batch?: BatchApi } = {}
) => {
  if (!policy.deleteBuilderJobs || !enabledDays(policy.builderJobRetentionDays)) return 0;
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - policy.builderJobRetentionDays * 24 * 60 * 60 * 1000);
  const namespace = options.namespace ?? config.templateBuilderNamespace;
  const batch = options.batch ?? kubernetes.batch();
  const jobs = await batch.listNamespacedJob({ namespace, labelSelector: "app=harakiri-template-build" });
  let deleted = 0;
  for (const job of jobs.items) {
    const name = job.metadata?.name;
    if (!name || !shouldDeleteTemplateBuilderJob(job, cutoff)) continue;
    await batch.deleteNamespacedJob({ namespace, name, propagationPolicy: "Background" });
    deleted += 1;
  }
  return deleted;
};

export const cleanupTemplateRetention = async (
  options: { policy?: TemplateRetentionPolicy; now?: Date; db?: QueryRunner; batch?: BatchApi; buildLogStore?: BuildLogStore; buildContextStore?: BlobStore } = {}
): Promise<TemplateRetentionReport> => {
  const policy = options.policy ?? templateRetentionPolicy();
  const report: TemplateRetentionReport = {
    logsDeleted: 0,
    contextsDeleted: 0,
    buildsDeleted: 0,
    versionsRetired: 0,
    builderJobsDeleted: 0
  };
  if (!policy.enabled) return report;

  const now = options.now ?? new Date();
  const db = options.db ?? defaultDb;
  const logs = options.buildLogStore ?? buildLogStore;
  const contexts = options.buildContextStore ?? defaultBuildContextStore;

  if (enabledDays(policy.buildLogRetentionDays)) {
    const result = await db.query<{ id: string }>(
      `SELECT b.id
       FROM template_builds b
       WHERE b.status = ANY($1::text[])
         AND b.completed_at IS NOT NULL
         AND b.completed_at < ($2::timestamptz - make_interval(days => $3::int))`,
      [terminalBuildStatuses, now, policy.buildLogRetentionDays]
    );
    for (const row of result.rows) report.logsDeleted += await logs.delete(row.id);
  }

  if (enabledDays(policy.buildContextRetentionDays)) {
    const result = await db.query<{ id: string }>(
      `SELECT b.id
       FROM template_builds b
       WHERE b.status = ANY($1::text[])
         AND b.completed_at IS NOT NULL
         AND b.completed_at < ($2::timestamptz - make_interval(days => $3::int))`,
      [terminalBuildStatuses, now, policy.buildContextRetentionDays]
    );
    for (const row of result.rows) report.contextsDeleted += await contexts.delete({ store: contexts.kind, key: row.id });
  }

  if (enabledDays(policy.buildRetentionDays)) {
    const result = await db.query(
      `DELETE FROM template_builds b
       WHERE b.status = ANY($1::text[])
         AND COALESCE(b.completed_at, b.updated_at, b.created_at) < ($2::timestamptz - make_interval(days => $3::int))
         AND NOT EXISTS (
           SELECT 1 FROM template_versions v WHERE v.build_id = b.id
         )`,
      [terminalBuildStatuses, now, policy.buildRetentionDays]
    );
    report.buildsDeleted = count(result);
  }

  if (enabledDays(policy.versionRetentionDays)) {
    const retired = await db.query(
      `WITH candidates AS (
         SELECT v.id, v.organization_id
         FROM template_versions v
         JOIN templates t ON t.id = v.template_id
         WHERE v.status = 'ready'
           AND v.created_at < ($1::timestamptz - make_interval(days => $2::int))
           AND (t.latest_version_id IS NULL OR t.latest_version_id <> v.id)
           AND NOT (v.aliases && ARRAY['latest', 'stable']::text[])
           AND NOT EXISTS (
             SELECT 1 FROM sandboxes s
             WHERE s.template_version_id = v.id
               AND s.status IN ('pending', 'running', 'idle')
           )
       )
       UPDATE template_versions v
       SET status = 'retired',
           promoted_at = NULL,
           metadata = v.metadata || jsonb_build_object(
             'retiredBy', 'template-retention',
             'retiredAt', $3::text,
             'retentionDays', $2::int
           )
       FROM candidates c
       WHERE v.id = c.id
       RETURNING v.id, v.organization_id`,
      [now, policy.versionRetentionDays, now.toISOString()]
    ) as QueryResult<{ id: string; organization_id: string | null }>;
    report.versionsRetired = count(retired);
    for (const row of retired.rows) {
      if (!row.organization_id) continue;
      await recordAuditEvent(
        {
          organizationId: row.organization_id,
          actorUserId: null,
          actorLabel: "harakiri-scheduler",
          action: "template.version.retired",
          targetType: "template_version",
          targetId: row.id,
          metadata: { reason: "retention", retentionDays: policy.versionRetentionDays }
        },
        db
      );
    }
  }

  report.builderJobsDeleted = await cleanupTemplateBuilderJobs(policy, { now, batch: options.batch });
  return report;
};
