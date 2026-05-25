import type { PoolClient } from "pg";
import type { TemplateBuildContextSummary as SharedTemplateBuildContextSummary, TemplateBuildSummary } from "@harakiri/shared";
import { appendBuildLog, buildLogStore as defaultBuildLogStore } from "../build-logs.js";
import { dockerfileBaseImages, readTextFileFromTarGzipBuildContext, type DecodedBuildContextUpload } from "../build-context.js";
import { config } from "../config.js";
import { makeId } from "../crypto.js";
import { query as defaultQuery, withClient } from "../db.js";
import { redactRecord, redactText } from "../redaction.js";
import type { BuildLogStore } from "../storage/build-log-store.js";
import { PostgresTemplateBuildContextBlobStore } from "../storage/postgres-blob-store.js";
import { activeTemplateBuildStatuses, buildConcurrencyLimitExceeded, canUploadTemplateBuildContext } from "../template-policy.js";
import { templateImagePolicyPayload } from "./template-policies.js";
import type { Query } from "./query.js";
export type { Query } from "./query.js";

export type TemplateBuildRow = {
  id: string;
  organizationId: string;
  templateId: string;
  status: string;
  sourceType: string;
  contextHash: string | null;
  dockerfilePath: string | null;
  buildArgs: Record<string, unknown>;
  imageDestination: string | null;
  imageDigest: string | null;
  resultVersionId?: string | null;
  logRef?: string | null;
  error?: string | null;
  metadata: Record<string, unknown>;
  context?: (Omit<SharedTemplateBuildContextSummary, "uploadedAt"> & { uploadedAt: Date | string; metadata?: Record<string, unknown> }) | null;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type TemplateBuildSourceRow = {
  template_id: string;
  source_type: string;
  context_hash: string | null;
  dockerfile_path: string | null;
  build_args: Record<string, unknown>;
  image_destination: string | null;
  metadata: Record<string, unknown>;
};

export type EnqueueTemplateBuildInput = {
  organizationId: string;
  templateId: string;
  sourceType: string;
  contextHash?: string | null;
  dockerfilePath: string | null;
  buildArgs: Record<string, unknown>;
  imageDestination?: string | null;
  metadata: Record<string, unknown>;
};

export type EnqueueTemplateBuildResult =
  | { ok: true; buildId: string }
  | { ok: false; error: "template_build_concurrency_limit_exceeded"; limit: number; activeBuilds: number };

export const templateBuildSelect = `
  SELECT id, organization_id AS "organizationId", template_id AS "templateId",
         status, source_type AS "sourceType", context_hash AS "contextHash",
         dockerfile_path AS "dockerfilePath", build_args AS "buildArgs",
         image_destination AS "imageDestination", image_digest AS "imageDigest",
         (SELECT tv.id FROM template_versions tv WHERE tv.build_id = template_builds.id ORDER BY tv.created_at DESC LIMIT 1) AS "resultVersionId",
         log_ref AS "logRef", error, metadata,
         (SELECT jsonb_build_object(
            'buildId', c.build_id,
            'sha256', c.sha256,
            'sizeBytes', c.size_bytes,
            'format', c.format,
            'fileCount', c.file_count,
            'metadata', c.metadata,
            'uploadedAt', c.updated_at
          )
          FROM template_build_contexts c
          WHERE c.build_id = template_builds.id
          ORDER BY c.updated_at DESC
          LIMIT 1) AS context,
         started_at AS "startedAt", completed_at AS "completedAt",
         created_at AS "createdAt", updated_at AS "updatedAt"
  FROM template_builds
`;

export const redactTemplateBuildRow = <T extends { buildArgs?: Record<string, unknown>; metadata?: Record<string, unknown>; error?: string | null; context?: { metadata?: Record<string, unknown> } | null }>(row: T) => ({
  ...row,
  buildArgs: redactRecord(row.buildArgs ?? {}),
  metadata: redactRecord(row.metadata ?? {}),
  context: row.context ? { ...row.context, metadata: redactRecord(row.context.metadata ?? {}) } : row.context,
  error: row.error ? redactText(row.error) : row.error
});

const toIso = (value: Date | string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const toIsoOrNull = (value: Date | string | null | undefined) => value ? toIso(value) : null;

const mapTemplateBuildRow = (row: TemplateBuildRow): TemplateBuildSummary => {
  const redacted = redactTemplateBuildRow(row);
  return {
    ...redacted,
    status: redacted.status,
    sourceType: redacted.sourceType,
    logRef: redacted.logRef ?? null,
    error: redacted.error ?? null,
    context: redacted.context
      ? {
          ...redacted.context,
          uploadedAt: toIso(redacted.context.uploadedAt)
        }
      : null,
    startedAt: toIsoOrNull(redacted.startedAt),
    completedAt: toIsoOrNull(redacted.completedAt),
    createdAt: toIso(redacted.createdAt),
    updatedAt: toIso(redacted.updatedAt)
  };
};

const withTemplateBuildSlot = async <T>(
  organizationId: string,
  insertBuild: (client: PoolClient) => Promise<T>,
  options: { withClientFn?: typeof withClient; maxActivePerOrg?: number } = {}
) =>
  (options.withClientFn ?? withClient)(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`template-builds:${organizationId}`]);
      const active = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM template_builds
         WHERE organization_id = $1 AND status = ANY($2::text[])`,
        [organizationId, activeTemplateBuildStatuses]
      );
      const activeCount = Number(active.rows[0]?.count ?? 0);
      const limit = options.maxActivePerOrg ?? config.templateBuildMaxActivePerOrg;
      if (buildConcurrencyLimitExceeded(activeCount, limit)) {
        await client.query("ROLLBACK");
        return {
          ok: false as const,
          activeCount,
          limit
        };
      }

      const value = await insertBuild(client);
      await client.query("COMMIT");
      return { ok: true as const, value };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

export const enqueueTemplateBuild = async (
  input: EnqueueTemplateBuildInput,
  options: { withClientFn?: typeof withClient; idFactory?: typeof makeId; maxActivePerOrg?: number } = {}
): Promise<EnqueueTemplateBuildResult> => {
  const buildId = (options.idFactory ?? makeId)("bld", 12);
  const buildArgs = redactRecord(input.buildArgs);
  const metadata = redactRecord(input.metadata);
  const slot = await withTemplateBuildSlot(
    input.organizationId,
    (client) =>
      client.query(
        `INSERT INTO template_builds
         (id, organization_id, template_id, status, source_type, context_hash,
          dockerfile_path, build_args, image_destination, metadata)
         VALUES ($1, $2, $3, 'queued', $4, $5, $6, $7, $8, $9)`,
        [
          buildId,
          input.organizationId,
          input.templateId,
          input.sourceType,
          input.contextHash ?? null,
          input.dockerfilePath,
          buildArgs,
          input.imageDestination ?? null,
          metadata
        ]
      ),
    options
  );
  if (!slot.ok) {
    return {
      ok: false,
      error: "template_build_concurrency_limit_exceeded",
      limit: slot.limit,
      activeBuilds: slot.activeCount
    };
  }
  return { ok: true, buildId };
};

export const listTemplateBuilds = async (
  input: { organizationId: string; status?: string; q?: string; template?: string; limit?: string | number },
  query: Query = defaultQuery
) => {
  const params: unknown[] = [input.organizationId];
  let where = "WHERE organization_id = $1";
  const limit = Math.min(Math.max(Number(input.limit ?? 100) || 100, 1), 200);
  if (input.status && input.status !== "all") {
    params.push(input.status);
    where += ` AND status = $${params.length}`;
  }
  if (input.template) {
    params.push(input.template);
    where += ` AND template_id = $${params.length}`;
  }
  if (input.q) {
    params.push(`%${input.q}%`);
    where += ` AND (id ILIKE $${params.length} OR template_id ILIKE $${params.length})`;
  }
  params.push(limit);
  const result = await query<TemplateBuildRow>(`${templateBuildSelect} ${where} ORDER BY created_at DESC LIMIT $${params.length}`, params);
  return result.rows.map(mapTemplateBuildRow);
};

export const getTemplateBuild = async (input: { organizationId: string; buildId: string }, query: Query = defaultQuery) => {
  const result = await query<TemplateBuildRow>(`${templateBuildSelect} WHERE id = $1 AND organization_id = $2`, [input.buildId, input.organizationId]);
  return result.rowCount ? mapTemplateBuildRow(result.rows[0]) : null;
};

export const getTemplateBuildLogs = async (
  input: { organizationId: string; buildId: string },
  options: { query?: Query; buildLogStore?: BuildLogStore } = {}
) => {
  const query = options.query ?? defaultQuery;
  const build = await query("SELECT id FROM template_builds WHERE id = $1 AND organization_id = $2", [input.buildId, input.organizationId]);
  if (!build.rowCount) return null;
  return (options.buildLogStore ?? defaultBuildLogStore).list(input.buildId);
};

export const getTemplateBuildSource = async (input: { organizationId: string; buildId: string }, query: Query = defaultQuery) => {
  const existing = await query<TemplateBuildSourceRow>("SELECT * FROM template_builds WHERE id = $1 AND organization_id = $2", [input.buildId, input.organizationId]);
  return existing.rowCount ? existing.rows[0] : null;
};

export const cancelTemplateBuild = async (input: { organizationId: string; buildId: string }, query: Query = defaultQuery) => {
  const result = await query(
    `UPDATE template_builds
     SET status = CASE WHEN status IN ('queued', 'building') THEN 'canceled' ELSE status END,
         completed_at = CASE WHEN status IN ('queued', 'building') THEN now() ELSE completed_at END,
         error = CASE WHEN status IN ('queued', 'building') THEN 'canceled by user' ELSE error END,
         updated_at = now()
     WHERE id = $1 AND organization_id = $2
     RETURNING *`,
    [input.buildId, input.organizationId]
  );
  if (!result.rowCount) return null;
  return getTemplateBuild(input, query);
};

export const storeTemplateBuildContext = async (input: {
  client: PoolClient;
  buildId: string;
  organizationId: string;
  context: DecodedBuildContextUpload;
}) => {
  await new PostgresTemplateBuildContextBlobStore(input.client).put({
    key: input.buildId,
    body: input.context.archive,
    sha256: input.context.sha256,
    contentType: "application/gzip",
    metadata: {
      organizationId: input.organizationId,
      format: input.context.format,
      fileCount: input.context.fileCount ?? undefined,
      metadata: redactRecord(input.context.metadata)
    }
  });
  const summary = {
    buildId: input.buildId,
    sha256: input.context.sha256,
    sizeBytes: input.context.sizeBytes,
    format: input.context.format,
    fileCount: input.context.fileCount,
    uploadedAt: new Date().toISOString()
  };
  await input.client.query(
    `UPDATE template_builds
     SET context_hash = $2,
         metadata = metadata || $3::jsonb,
         updated_at = now()
     WHERE id = $1`,
    [input.buildId, input.context.sha256, JSON.stringify(redactRecord({ context: summary }))]
  );
  await appendBuildLog(input.client, input.buildId, "stdout", `received build context ${input.context.sha256} (${input.context.sizeBytes} bytes, ${input.context.fileCount ?? 0} files)`);
  return summary;
};

export type TemplateBuildContextSummary = Awaited<ReturnType<typeof storeTemplateBuildContext>>;

export type UploadTemplateBuildContextResult =
  | { kind: "stored"; context: TemplateBuildContextSummary }
  | { kind: "template_build_not_found" }
  | { kind: "build_context_not_supported"; message: string }
  | { kind: "build_context_closed"; message: string }
  | { kind: "invalid_build_context"; message: string }
  | { kind: "image_policy"; payload: NonNullable<ReturnType<typeof templateImagePolicyPayload>> };

export const uploadTemplateBuildContext = async (
  input: {
    buildId: string;
    organizationId: string;
    context: DecodedBuildContextUpload;
  },
  options: { withClientFn?: typeof withClient } = {}
): Promise<UploadTemplateBuildContextResult> =>
  (options.withClientFn ?? withClient)(async (client) => {
    await client.query("BEGIN");
    try {
      const build = await client.query<{ id: string; source_type: string; status: string; dockerfile_path: string | null }>(
        `SELECT id, source_type, status, dockerfile_path
         FROM template_builds
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [input.buildId, input.organizationId]
      );
      const row = build.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return { kind: "template_build_not_found" };
      }
      if (row.source_type === "image") {
        await client.query("ROLLBACK");
        return { kind: "build_context_not_supported", message: "image imports do not accept uploaded build contexts" };
      }
      if (!canUploadTemplateBuildContext(row.status)) {
        await client.query("ROLLBACK");
        return { kind: "build_context_closed", message: "build context can only be uploaded while a build is queued" };
      }
      if (row.source_type === "dockerfile") {
        let dockerfile;
        try {
          dockerfile = readTextFileFromTarGzipBuildContext(input.context.archive, row.dockerfile_path ?? "Dockerfile");
        } catch (error) {
          await client.query("ROLLBACK");
          const message = error instanceof Error ? error.message : String(error);
          return { kind: "invalid_build_context", message };
        }
        const imagePolicy = templateImagePolicyPayload(
          dockerfileBaseImages(dockerfile).map((base) => ({ image: base.image, dynamic: base.dynamic, line: base.line }))
        );
        if (imagePolicy) {
          await client.query("ROLLBACK");
          return { kind: "image_policy", payload: imagePolicy };
        }
      }

      const context = await storeTemplateBuildContext({
        client,
        buildId: input.buildId,
        organizationId: input.organizationId,
        context: input.context
      });
      await client.query("COMMIT");
      return { kind: "stored", context };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
