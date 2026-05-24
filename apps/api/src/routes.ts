import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";
import { recordAuditEvent } from "./audit.js";
import { requireAuth } from "./auth.js";
import { decodeBuildContextUpload, dockerfileBaseImages, readTextFileFromTarGzipBuildContext } from "./build-context.js";
import { appendBuildLog } from "./build-logs.js";
import { config } from "./config.js";
import { createApiKey, makeId } from "./crypto.js";
import { query, withClient } from "./db.js";
import { openSandbox } from "./opensandbox.js";
import { redactRecord, redactText } from "./redaction.js";
import {
  activeTemplateBuildStatuses,
  buildConcurrencyLimitExceeded,
  templateImagePolicyViolation,
  templateResourceLimitViolations
} from "./template-policy.js";
import { archiveTemplate, averageTemplateBootMs, listTemplates, resolveTemplate } from "./templates.js";

const createSandboxSchema = z.object({
  template: z.string().default("python-3.12-data"),
  name: z.string().optional(),
  ttlSeconds: z.number().int().min(10).max(86400).default(300)
});

const runSchema = z.object({
  command: z.string().optional(),
  stdin: z.string().optional()
});

const routeSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535),
  protocol: z.enum(["http", "https"]).default("http")
});

const templateVisibilitySchema = z.enum(["public", "private", "internal"]);
const templateIconSchema = z.enum(["py", "node", "globe", "box", "file"]);

const templateCreateSchema = z.object({
  id: z.string().min(2).max(100).regex(/^[a-z0-9][a-z0-9._-]*$/).optional(),
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(500).default("Custom sandbox template."),
  image: z.string().min(1).default("ubuntu:24.04"),
  icon: templateIconSchema.default("file"),
  tags: z.array(z.string().min(1).max(40)).default([]),
  aliases: z.array(z.string().min(1).max(100)).default([]),
  visibility: templateVisibilitySchema.default("private"),
  defaultEntrypoint: z.array(z.string().min(1)).default(["sleep", "3600"]),
  cpuCount: z.number().int().min(1).max(64).default(2),
  memoryMb: z.number().int().min(128).max(262144).default(2048),
  workdir: z.string().min(1).default("/workspace"),
  defaultPorts: z.array(z.number().int().min(1).max(65535)).default([]),
  runtimeFamily: z.string().min(1).max(80).default("custom")
});

const templateBuildSchema = z.object({
  sourceType: z.enum(["dockerfile", "git", "image"]).default("dockerfile"),
  contextHash: z.string().optional(),
  dockerfilePath: z.string().default("Dockerfile"),
  buildArgs: z.record(z.string(), z.unknown()).default({}),
  imageDestination: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

const templateBuildContextUploadSchema = z.object({
  archiveBase64: z.string().min(1),
  sha256: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  format: z.literal("tar+gzip").default("tar+gzip"),
  fileCount: z.number().int().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

const templatePromoteSchema = z.object({
  versionId: z.string().min(1),
  alias: z.string().min(1).max(80).default("stable")
});

const apiKeySchema = z.object({
  name: z.string().min(1).default("cli")
});

const settingsSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  idleTtlSeconds: z.number().int().min(10).max(86400).optional(),
  maxConcurrency: z.number().int().min(1).max(10000).optional(),
  defaultTemplateId: z.string().optional()
});

const sandboxSelect = `
  SELECT s.id, s.opensandbox_id AS "opensandboxId", s.name, s.template_id AS template,
         s.status, s.cpu_pct AS cpu, s.memory_mb AS mem,
         COALESCE(to_char(now() - s.started_at, 'HH24"h "MI"m"'), '-') AS started,
         s.owner_label AS owner, s.cost_usd::float AS cost, s.ttl_seconds AS "ttlSeconds",
         s.expires_at AS "expiresAt", s.public_url AS "publicUrl",
         s.template_version_id AS "templateVersionId", s.template_image_digest AS "templateImageDigest",
         s.created_at AS "createdAt"
  FROM sandboxes s
`;

const routeSelect = `
  SELECT port, protocol, route_key AS "routeKey", host,
         COALESCE(url, target_url) AS url,
         target_url AS "targetUrl",
         state, provider, provider_route_id AS "providerRouteId",
         created_at AS "createdAt",
         last_checked_at AS "lastCheckedAt",
         terminated_at AS "terminatedAt"
  FROM sandbox_routes
`;

const templateVersionSelect = `
  SELECT id, template_id AS "templateId", build_id AS "buildId",
         version_number AS "versionNumber", aliases, image_uri AS "imageUri",
         image_digest AS "imageDigest", status, default_entrypoint AS "defaultEntrypoint",
         cpu_count AS "cpuCount", memory_mb AS "memoryMb", workdir,
         default_ports AS "defaultPorts", env_schema AS "envSchema", metadata,
         sbom_ref AS "sbomRef", provenance, scan_status AS "scanStatus",
         scan_summary AS "scanSummary",
         created_at AS "createdAt", promoted_at AS "promotedAt"
  FROM template_versions
`;

const templateBuildSelect = `
  SELECT id, organization_id AS "organizationId", template_id AS "templateId",
         status, source_type AS "sourceType", context_hash AS "contextHash",
         dockerfile_path AS "dockerfilePath", build_args AS "buildArgs",
         image_destination AS "imageDestination", image_digest AS "imageDigest",
         log_ref AS "logRef", error, metadata,
         started_at AS "startedAt", completed_at AS "completedAt",
         created_at AS "createdAt", updated_at AS "updatedAt"
  FROM template_builds
`;

const redactTemplateBuildRow = <T extends { buildArgs?: Record<string, unknown>; metadata?: Record<string, unknown>; error?: string | null }>(row: T) => ({
  ...row,
  buildArgs: redactRecord(row.buildArgs ?? {}),
  metadata: redactRecord(row.metadata ?? {}),
  error: row.error ? redactText(row.error) : row.error
});

const templateResourceLimits = () => ({
  maxCpuCount: config.templateMaxCpuCount,
  maxMemoryMb: config.templateMaxMemoryMb,
  maxDefaultPorts: config.templateMaxDefaultPorts
});

const templateResourceLimitPayload = (resources: { cpuCount: number; memoryMb: number; defaultPorts?: number[] }) => {
  const violations = templateResourceLimitViolations(resources, templateResourceLimits());
  if (!violations.length) return null;
  return { error: "template_resource_limit_exceeded", violations };
};

const templateImagePolicy = () => ({
  allowRegistries: config.templateImageAllowRegistries,
  denyRegistries: config.templateImageDenyRegistries,
  allowPrefixes: config.templateImageAllowPrefixes,
  denyPrefixes: config.templateImageDenyPrefixes
});

const templateImagePolicyPayload = (images: Array<{ image: string; dynamic?: boolean; line?: number }>) => {
  const policy = templateImagePolicy();
  const violations = images
    .map(({ image, dynamic, line }) => {
      const violation = templateImagePolicyViolation(image, policy, { dynamic });
      return violation ? { ...violation, ...(line ? { line } : {}) } : null;
    })
    .filter(Boolean);
  if (!violations.length) return null;
  return { error: "template_image_policy_violation", violations };
};

const withTemplateBuildSlot = async <T>(organizationId: string, insertBuild: (client: PoolClient) => Promise<T>) =>
  withClient(async (client) => {
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
      if (buildConcurrencyLimitExceeded(activeCount, config.templateBuildMaxActivePerOrg)) {
        await client.query("ROLLBACK");
        return {
          ok: false as const,
          activeCount,
          limit: config.templateBuildMaxActivePerOrg
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

const audit = async (organizationId: string, actorUserId: string, actorLabel: string, action: string, targetType: string, targetId?: string, metadata = {}) =>
  recordAuditEvent({ organizationId, actorUserId, actorLabel, action, targetType, targetId, metadata });

const event = async (organizationId: string, sandboxId: string, type: string, message: string, metadata = {}) => {
  await query(
    `INSERT INTO sandbox_events (sandbox_id, organization_id, type, message, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [sandboxId, organizationId, type, message, metadata]
  );
};

const routePolicySummary = () => ({
  mode: config.sandboxRouteMode,
  baseDomain: config.sandboxRouteBaseDomain,
  publicScheme: config.sandboxRoutePublicScheme,
  maxRoutesPerSandbox: config.sandboxMaxRoutesPerSandbox,
  maxRoutesPerOrg: config.sandboxMaxRoutesPerOrg
});

const sandboxTemplateMetadata = (template: Awaited<ReturnType<typeof resolveTemplate>>) => ({
  templateId: template?.id ?? null,
  templateVersionId: template?.templateVersionId ?? null,
  imageDigest: template?.imageDigest ?? null,
  routePolicy: routePolicySummary()
});

const slugFor = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || makeId("tpl", 8);

export const registerRoutes = async (app: FastifyInstance) => {
  app.get("/health", async () => ({ status: "ok" }));

  app.get("/v1/bootstrap", async () => ({
    apiUrl: config.publicApiUrl,
    keycloak: {
      url: process.env.PUBLIC_KEYCLOAK_URL ?? "http://127.0.0.1:8081",
      realm: process.env.PUBLIC_KEYCLOAK_REALM ?? "harakiri",
      clientId: process.env.PUBLIC_KEYCLOAK_CLIENT_ID ?? "harakiri-web"
    }
  }));

  app.addHook("preHandler", async (request, reply) => {
    if (request.url === "/health" || request.url === "/v1/bootstrap") return;
    return requireAuth(request, reply);
  });

  app.get("/v1/me", async (request) => {
    const org = await query(
      `SELECT o.id, o.name, o.slug, o.default_template_id AS "defaultTemplateId",
              o.idle_ttl_seconds AS "idleTtlSeconds", o.max_concurrency AS "maxConcurrency"
       FROM organizations o WHERE o.id = $1`,
      [request.auth.organizationId]
    );
    const user = await query(
      `SELECT id, email, full_name AS "fullName", onboarding_completed_at AS "onboardingCompletedAt"
       FROM users WHERE id = $1`,
      [request.auth.userId]
    );
    return { auth: request.auth, user: user.rows[0], organization: org.rows[0] };
  });

  app.post("/v1/me/onboarding/complete", async (request) => {
    const result = await query(
      `UPDATE users
       SET onboarding_completed_at = COALESCE(onboarding_completed_at, now()), updated_at = now()
       WHERE id = $1
       RETURNING id, email, full_name AS "fullName", onboarding_completed_at AS "onboardingCompletedAt"`,
      [request.auth.userId]
    );
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "onboarding.complete", "user", request.auth.userId);
    return { user: result.rows[0] };
  });

  app.get("/v1/templates", async (request) => {
    const { q, visibility, status, limit, offset } = request.query as {
      q?: string;
      visibility?: string;
      status?: string;
      limit?: string;
      offset?: string;
    };
    return listTemplates(request.auth.organizationId, {
      q,
      visibility,
      status,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined
    });
  });

  app.post("/v1/templates", async (request, reply) => {
    const body = templateCreateSchema.parse(request.body ?? {});
    const resourceLimit = templateResourceLimitPayload(body);
    if (resourceLimit) return reply.code(422).send(resourceLimit);
    const imagePolicy = templateImagePolicyPayload([{ image: body.image }]);
    if (imagePolicy) return reply.code(422).send(imagePolicy);
    const id = body.id ?? slugFor(body.name);
    const exists = await query("SELECT id FROM templates WHERE id = $1", [id]);
    if (exists.rowCount) return reply.code(409).send({ error: "template_exists", template: id });

    await query(
      `INSERT INTO templates
       (id, organization_id, name, description, image, icon, tags, aliases, boot_ms,
        visibility, default_entrypoint, cpu_count, memory_mb, workdir, default_ports,
        runtime_family, status, source_kind)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 220, $9, $10, $11, $12, $13, $14, $15, 'ready', 'custom')`,
      [
        id,
        request.auth.organizationId,
        body.name,
        body.description,
        body.image,
        body.icon,
        body.tags,
        body.aliases,
        body.visibility,
        body.defaultEntrypoint,
        body.cpuCount,
        body.memoryMb,
        body.workdir,
        body.defaultPorts,
        body.runtimeFamily
      ]
    );

    const versionId = makeId("tplv", 12);
    const provenance = {
      source: "template.create",
      templateId: id,
      imageUri: body.image,
      imageDigest: null,
      builder: "api"
    };
    await query(
      `INSERT INTO template_versions
       (id, template_id, organization_id, version_number, aliases, image_uri, status,
        default_entrypoint, cpu_count, memory_mb, workdir, default_ports, metadata,
        provenance, scan_status, scan_summary, promoted_at)
       VALUES ($1, $2, $3, 1, ARRAY['latest', 'stable'], $4, 'ready', $5, $6, $7, $8, $9, $10, $11, 'not_scanned', $12, now())`,
      [
        versionId,
        id,
        request.auth.organizationId,
        body.image,
        body.defaultEntrypoint,
        body.cpuCount,
        body.memoryMb,
        body.workdir,
        body.defaultPorts,
        { source: "template.create" },
        redactRecord(provenance),
        { status: "not_scanned", reason: "scanner_not_configured" }
      ]
    );
    await query("UPDATE templates SET latest_version_id = $2, updated_at = now() WHERE id = $1", [id, versionId]);
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "template.create", "template", id, {
      versionId
    });
    const template = await resolveTemplate(id, request.auth.organizationId);
    return reply.code(201).send({ template });
  });

  app.get("/v1/templates/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const template = await resolveTemplate(id, request.auth.organizationId);
    if (!template) return reply.code(404).send({ error: "template_not_found" });
    return { template };
  });

  app.get("/v1/templates/:id/versions", async (request, reply) => {
    const { id } = request.params as { id: string };
    const template = await resolveTemplate(id, request.auth.organizationId);
    if (!template) return reply.code(404).send({ error: "template_not_found" });
    const result = await query(
      `${templateVersionSelect}
       WHERE template_id = $1 AND (organization_id IS NULL OR organization_id = $2)
       ORDER BY created_at DESC`,
      [template.id, request.auth.organizationId]
    );
    return { versions: result.rows };
  });

  app.post("/v1/templates/:id/builds", async (request, reply) => {
    const { id } = request.params as { id: string };
    const template = await resolveTemplate(id, request.auth.organizationId);
    if (!template) return reply.code(404).send({ error: "template_not_found" });
    const body = templateBuildSchema.parse(request.body ?? {});
    const resourceLimit = templateResourceLimitPayload(template);
    if (resourceLimit) return reply.code(422).send(resourceLimit);
    if (body.sourceType === "image") {
      const imagePolicy = templateImagePolicyPayload([{ image: body.imageDestination ?? template.image }]);
      if (imagePolicy) return reply.code(422).send(imagePolicy);
    }
    const buildArgs = redactRecord(body.buildArgs);
    const metadata = redactRecord(body.metadata);
    const buildId = makeId("bld", 12);
    const slot = await withTemplateBuildSlot(request.auth.organizationId, (client) =>
      client.query(
        `INSERT INTO template_builds
         (id, organization_id, template_id, status, source_type, context_hash,
          dockerfile_path, build_args, image_destination, metadata)
         VALUES ($1, $2, $3, 'queued', $4, $5, $6, $7, $8, $9)`,
        [
          buildId,
          request.auth.organizationId,
          template.id,
          body.sourceType,
          body.contextHash ?? null,
          body.dockerfilePath,
          buildArgs,
          body.imageDestination ?? null,
          metadata
        ]
      )
    );
    if (!slot.ok) {
      return reply.code(429).send({
        error: "template_build_concurrency_limit_exceeded",
        limit: slot.limit,
        activeBuilds: slot.activeCount
      });
    }
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "template.build.create", "template", template.id, {
      buildId
    });
    const result = await query(`${templateBuildSelect} WHERE id = $1 AND organization_id = $2`, [buildId, request.auth.organizationId]);
    return reply.code(201).send({ build: redactTemplateBuildRow(result.rows[0]) });
  });

  app.get("/v1/template-builds", async (request) => {
    const { status, q } = request.query as { status?: string; q?: string };
    const params: unknown[] = [request.auth.organizationId];
    let where = "WHERE organization_id = $1";
    if (status && status !== "all") {
      params.push(status);
      where += ` AND status = $${params.length}`;
    }
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (id ILIKE $${params.length} OR template_id ILIKE $${params.length})`;
    }
    const result = await query(`${templateBuildSelect} ${where} ORDER BY created_at DESC LIMIT 100`, params);
    return { builds: result.rows.map(redactTemplateBuildRow) };
  });

  app.get("/v1/template-builds/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await query(`${templateBuildSelect} WHERE id = $1 AND organization_id = $2`, [id, request.auth.organizationId]);
    if (!result.rowCount) return reply.code(404).send({ error: "template_build_not_found" });
    return { build: redactTemplateBuildRow(result.rows[0]) };
  });

  app.get("/v1/template-builds/:id/logs", async (request, reply) => {
    const { id } = request.params as { id: string };
    const build = await query("SELECT id FROM template_builds WHERE id = $1 AND organization_id = $2", [id, request.auth.organizationId]);
    if (!build.rowCount) return reply.code(404).send({ error: "template_build_not_found" });
    const logs = await query(
      `SELECT line_no AS "lineNo", stream, message, created_at AS "createdAt"
       FROM template_build_logs WHERE build_id = $1 ORDER BY line_no ASC`,
      [id]
    );
    return { logs: logs.rows.map((line) => ({ ...line, message: redactText(String(line.message)) })) };
  });

  app.post("/v1/template-builds/:id/context", async (request, reply) => {
    const { id } = request.params as { id: string };
    let context;
    try {
      context = decodeBuildContextUpload(templateBuildContextUploadSchema.parse(request.body ?? {}), config.templateBuildContextMaxBytes);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(400).send({ error: "invalid_build_context", message });
    }

    return withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const build = await client.query<{ id: string; source_type: string; status: string; dockerfile_path: string | null }>(
          `SELECT id, source_type, status, dockerfile_path
           FROM template_builds
           WHERE id = $1 AND organization_id = $2
           FOR UPDATE`,
          [id, request.auth.organizationId]
        );
        const row = build.rows[0];
        if (!row) {
          await client.query("ROLLBACK");
          return reply.code(404).send({ error: "template_build_not_found" });
        }
        if (row.source_type === "image") {
          await client.query("ROLLBACK");
          return reply.code(409).send({ error: "build_context_not_supported", message: "image imports do not accept uploaded build contexts" });
        }
        if (row.status !== "queued") {
          await client.query("ROLLBACK");
          return reply.code(409).send({ error: "build_context_closed", message: "build context can only be uploaded while a build is queued" });
        }
        if (row.source_type === "dockerfile") {
          let dockerfile;
          try {
            dockerfile = readTextFileFromTarGzipBuildContext(context.archive, row.dockerfile_path ?? "Dockerfile");
          } catch (error) {
            await client.query("ROLLBACK");
            const message = error instanceof Error ? error.message : String(error);
            return reply.code(400).send({ error: "invalid_build_context", message });
          }
          const imagePolicy = templateImagePolicyPayload(
            dockerfileBaseImages(dockerfile).map((base) => ({ image: base.image, dynamic: base.dynamic, line: base.line }))
          );
          if (imagePolicy) {
            await client.query("ROLLBACK");
            return reply.code(422).send(imagePolicy);
          }
        }

        await client.query(
          `INSERT INTO template_build_contexts
           (build_id, organization_id, format, sha256, size_bytes, file_count, archive, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (build_id) DO UPDATE
             SET format = EXCLUDED.format,
                 sha256 = EXCLUDED.sha256,
                 size_bytes = EXCLUDED.size_bytes,
                 file_count = EXCLUDED.file_count,
                 archive = EXCLUDED.archive,
                 metadata = EXCLUDED.metadata,
                 updated_at = now()`,
          [
            id,
            request.auth.organizationId,
            context.format,
            context.sha256,
            context.sizeBytes,
            context.fileCount,
            context.archive,
            redactRecord(context.metadata)
          ]
        );
        const summary = {
          sha256: context.sha256,
          sizeBytes: context.sizeBytes,
          format: context.format,
          fileCount: context.fileCount,
          uploadedAt: new Date().toISOString()
        };
        await client.query(
          `UPDATE template_builds
           SET context_hash = $2,
               metadata = metadata || $3::jsonb,
               updated_at = now()
           WHERE id = $1`,
          [id, context.sha256, JSON.stringify(redactRecord({ context: summary }))]
        );
        await appendBuildLog(client, id, "stdout", `received build context ${context.sha256} (${context.sizeBytes} bytes, ${context.fileCount ?? 0} files)`);
        await client.query("COMMIT");
        return { context: { buildId: id, ...summary } };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  });

  app.post("/v1/template-builds/:id/cancel", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await query(
      `UPDATE template_builds
       SET status = CASE WHEN status IN ('queued', 'building') THEN 'canceled' ELSE status END,
           completed_at = CASE WHEN status IN ('queued', 'building') THEN now() ELSE completed_at END,
           error = CASE WHEN status IN ('queued', 'building') THEN 'canceled by user' ELSE error END,
           updated_at = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [id, request.auth.organizationId]
    );
    if (!result.rowCount) return reply.code(404).send({ error: "template_build_not_found" });
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "template.build.cancel", "template_build", id);
    const build = await query(`${templateBuildSelect} WHERE id = $1 AND organization_id = $2`, [id, request.auth.organizationId]);
    return { build: redactTemplateBuildRow(build.rows[0]) };
  });

  app.post("/v1/template-builds/:id/retry", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await query<{
      template_id: string;
      source_type: string;
      context_hash: string | null;
      dockerfile_path: string | null;
      build_args: Record<string, unknown>;
      image_destination: string | null;
      metadata: Record<string, unknown>;
    }>("SELECT * FROM template_builds WHERE id = $1 AND organization_id = $2", [id, request.auth.organizationId]);
    if (!existing.rowCount) return reply.code(404).send({ error: "template_build_not_found" });
    const row = existing.rows[0];
    const template = await resolveTemplate(row.template_id, request.auth.organizationId);
    if (!template) return reply.code(404).send({ error: "template_not_found" });
    const resourceLimit = templateResourceLimitPayload(template);
    if (resourceLimit) return reply.code(422).send(resourceLimit);
    if (row.source_type === "image") {
      const imagePolicy = templateImagePolicyPayload([{ image: row.image_destination ?? template.image }]);
      if (imagePolicy) return reply.code(422).send(imagePolicy);
    }
    const buildId = makeId("bld", 12);
    const slot = await withTemplateBuildSlot(request.auth.organizationId, (client) =>
      client.query(
        `INSERT INTO template_builds
         (id, organization_id, template_id, status, source_type, context_hash,
          dockerfile_path, build_args, image_destination, metadata)
         VALUES ($1, $2, $3, 'queued', $4, $5, $6, $7, $8, $9)`,
        [
          buildId,
          request.auth.organizationId,
          row.template_id,
          row.source_type,
          row.context_hash,
          row.dockerfile_path,
          row.build_args,
          row.image_destination,
          redactRecord({ ...row.metadata, retryOf: id })
        ]
      )
    );
    if (!slot.ok) {
      return reply.code(429).send({
        error: "template_build_concurrency_limit_exceeded",
        limit: slot.limit,
        activeBuilds: slot.activeCount
      });
    }
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "template.build.retry", "template_build", id, {
      buildId
    });
    const build = await query(`${templateBuildSelect} WHERE id = $1 AND organization_id = $2`, [buildId, request.auth.organizationId]);
    return reply.code(201).send({ build: redactTemplateBuildRow(build.rows[0]) });
  });

  app.post("/v1/templates/:id/promote", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = templatePromoteSchema.parse(request.body ?? {});
    const template = await resolveTemplate(id, request.auth.organizationId);
    if (!template) return reply.code(404).send({ error: "template_not_found" });
    const version = await query(
      `${templateVersionSelect}
       WHERE id = $1 AND template_id = $2 AND status = 'ready'
         AND (organization_id IS NULL OR organization_id = $3)`,
      [body.versionId, template.id, request.auth.organizationId]
    );
    if (!version.rowCount) return reply.code(404).send({ error: "template_version_not_found" });
    await query(
      `UPDATE template_versions
       SET aliases = CASE
             WHEN $2 = ANY(aliases) THEN aliases
             ELSE array_append(aliases, $2)
           END,
           promoted_at = now()
       WHERE id = $1`,
      [body.versionId, body.alias]
    );
    await query("UPDATE templates SET latest_version_id = $2, updated_at = now() WHERE id = $1", [template.id, body.versionId]);
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "template.promote", "template", template.id, {
      versionId: body.versionId,
      alias: body.alias
    });
    const promoted = await resolveTemplate(body.versionId, request.auth.organizationId);
    return { template: promoted };
  });

  app.post("/v1/templates/:id/archive", async (request, reply) => {
    const { id } = request.params as { id: string };
    const archived = await archiveTemplate(id, request.auth.organizationId);
    if (!archived) return reply.code(404).send({ error: "template_not_found" });
    const canceled = await query<{ id: string }>(
      `UPDATE template_builds
       SET status = 'canceled',
           completed_at = COALESCE(completed_at, now()),
           error = COALESCE(error, 'canceled by template archive'),
           updated_at = now()
       WHERE organization_id = $1
         AND template_id = $2
         AND status = ANY($3::text[])
       RETURNING id`,
      [request.auth.organizationId, archived.id, activeTemplateBuildStatuses]
    );
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "template.archive", "template", archived.id, {
      latestVersionId: archived.latestVersionId,
      canceledBuildIds: canceled.rows.map((row) => row.id)
    });
    return { template: archived };
  });

  app.get("/v1/sandboxes", async (request) => {
    const { status, q } = request.query as { status?: string; q?: string };
    const params: unknown[] = [request.auth.organizationId];
    let where = "WHERE s.organization_id = $1";
    if (status && status !== "all") {
      params.push(status);
      where += ` AND s.status = $${params.length}`;
    }
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (s.id ILIKE $${params.length} OR s.name ILIKE $${params.length})`;
    }
    const result = await query(`${sandboxSelect} ${where} ORDER BY s.created_at DESC`, params);
    return { sandboxes: result.rows };
  });

  app.post("/v1/sandboxes", async (request, reply) => {
    const body = createSandboxSchema.parse(request.body ?? {});
    const template = await resolveTemplate(body.template, request.auth.organizationId);
    if (!template) return reply.code(404).send({ error: "template_not_found", template: body.template });
    const id = makeId("sbx", 10);
    const name = body.name?.trim() || `${template.id}-runner`;
    const provider = await openSandbox.create({
      template,
      ttlSeconds: body.ttlSeconds,
      name,
      metadata: {
        "harakiri.id": id,
        "harakiri.sandbox": id,
        "harakiri.org": request.auth.organizationId,
        "harakiri.organization": request.auth.organizationId
      }
    });
    const publicUrl = `${id}.sandbox.harakiri.local`;
    await query(
      `INSERT INTO sandboxes
       (id, opensandbox_id, organization_id, template_id, name, status, cpu_pct, memory_mb,
        owner_id, owner_label, ttl_seconds, started_at, last_active_at, expires_at, public_url,
        template_version_id, template_image_digest)
       VALUES ($1, $2, $3, $4, $5, 'running', 3, 128, $6, $7, $8, now(), now(), now() + make_interval(secs => $8::int), $9, $10, $11)`,
      [
        id,
        provider.id,
        request.auth.organizationId,
        template.id,
        name,
        request.auth.userId,
        request.auth.actorLabel,
        body.ttlSeconds,
        publicUrl,
        template.templateVersionId,
        template.imageDigest
      ]
    );
    await query(
      `INSERT INTO sandbox_schedules (sandbox_id, organization_id, kind, run_at)
       VALUES ($1, $2, 'idle_ttl', now() + make_interval(secs => $3::int))`,
      [id, request.auth.organizationId, body.ttlSeconds]
    );
    const metadata = {
      opensandboxId: provider.id,
      provider: provider.provider,
      ...sandboxTemplateMetadata(template)
    };
    await event(request.auth.organizationId, id, "created", `created through ${provider.provider}`, metadata);
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "sandbox.create", "sandbox", id, metadata);
    const result = await query(`${sandboxSelect} WHERE s.id = $1 AND s.organization_id = $2`, [id, request.auth.organizationId]);
    return reply.code(201).send({ sandbox: result.rows[0] });
  });

  app.get("/v1/sandboxes/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await query(`${sandboxSelect} WHERE s.id = $1 AND s.organization_id = $2`, [id, request.auth.organizationId]);
    if (!result.rowCount) return reply.code(404).send({ error: "sandbox_not_found" });
    return { sandbox: result.rows[0] };
  });

  app.delete("/v1/sandboxes/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await query<{ opensandbox_id: string | null }>(
      "SELECT opensandbox_id FROM sandboxes WHERE id = $1 AND organization_id = $2",
      [id, request.auth.organizationId]
    );
    if (!result.rowCount) return reply.code(404).send({ error: "sandbox_not_found" });
    if (result.rows[0].opensandbox_id) await openSandbox.delete(result.rows[0].opensandbox_id);
    await query("UPDATE sandboxes SET status = 'terminated', updated_at = now() WHERE id = $1", [id]);
    await query("UPDATE sandbox_routes SET state = 'terminated', terminated_at = COALESCE(terminated_at, now()), updated_at = now() WHERE sandbox_id = $1", [id]);
    await event(request.auth.organizationId, id, "terminated", "sandbox terminated - disk zeroed");
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "sandbox.kill", "sandbox", id);
    return { ok: true };
  });

  app.post("/v1/sandboxes/:id/renew", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await query<{ opensandbox_id: string | null; ttl_seconds: number }>(
      "SELECT opensandbox_id, ttl_seconds FROM sandboxes WHERE id = $1 AND organization_id = $2",
      [id, request.auth.organizationId]
    );
    if (!result.rowCount) return reply.code(404).send({ error: "sandbox_not_found" });
    if (result.rows[0].opensandbox_id) await openSandbox.renew(result.rows[0].opensandbox_id);
    await query("UPDATE sandboxes SET expires_at = now() + (ttl_seconds || ' seconds')::interval, last_active_at = now() WHERE id = $1", [id]);
    await event(request.auth.organizationId, id, "renewed", "ttl reset");
    return { ok: true };
  });

  app.post("/v1/sandboxes/:id/run", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = runSchema.parse(request.body ?? {});
    const sandbox = await query<{ id: string; opensandbox_id: string | null }>("SELECT id, opensandbox_id FROM sandboxes WHERE id = $1 AND organization_id = $2", [id, request.auth.organizationId]);
    if (!sandbox.rowCount) return reply.code(404).send({ error: "sandbox_not_found" });
    const command = body.command ?? (body.stdin ? "python agent.py" : "ls");
    const result = await openSandbox.run({ sandboxId: id, opensandboxId: sandbox.rows[0].opensandbox_id, command, stdin: body.stdin });
    await query("UPDATE sandboxes SET last_active_at = now(), expires_at = now() + (ttl_seconds || ' seconds')::interval WHERE id = $1", [id]);
    await event(request.auth.organizationId, id, "run", `command: ${command}`, { exitCode: result.exitCode, durationMs: result.durationMs });
    return { result };
  });

  app.get("/v1/sandboxes/:id/logs", async (request, reply) => {
    const { id } = request.params as { id: string };
    const sandbox = await query<{ opensandbox_id: string | null }>(
      "SELECT opensandbox_id FROM sandboxes WHERE id = $1 AND organization_id = $2",
      [id, request.auth.organizationId]
    );
    if (!sandbox.rowCount) return reply.code(404).send({ error: "sandbox_not_found" });
    const controlPlaneLogs = await query<{ ts: Date; lvl: string; msg: string }>(
      `SELECT created_at AS ts, type AS lvl, message AS msg
       FROM sandbox_events WHERE sandbox_id = $1 AND organization_id = $2 ORDER BY created_at ASC LIMIT 200`,
      [id, request.auth.organizationId]
    );
    const runtimeLogs = await openSandbox.logs(sandbox.rows[0].opensandbox_id).catch(() => []);
    const logs: Array<{ ts: string; lvl: string; msg: string; source: string }> = [
      ...controlPlaneLogs.rows.map((row) => ({ ...row, ts: new Date(row.ts).toISOString(), source: "control-plane" })),
      ...runtimeLogs
    ].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    return { logs };
  });

  app.get("/v1/sandboxes/:id/files", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { path } = request.query as { path?: string };
    const sandbox = await query<{ opensandbox_id: string | null }>(
      "SELECT opensandbox_id FROM sandboxes WHERE id = $1 AND organization_id = $2",
      [id, request.auth.organizationId]
    );
    if (!sandbox.rowCount) return reply.code(404).send({ error: "sandbox_not_found" });
    return openSandbox.files(sandbox.rows[0].opensandbox_id, path ?? "/");
  });

  app.get("/v1/sandboxes/:id/metrics", async (request, reply) => {
    const { id } = request.params as { id: string };
    const sandbox = await query<{ opensandbox_id: string | null; cpu_pct: number; memory_mb: number }>(
      "SELECT opensandbox_id, cpu_pct, memory_mb FROM sandboxes WHERE id = $1 AND organization_id = $2",
      [id, request.auth.organizationId]
    );
    if (!sandbox.rowCount) return reply.code(404).send({ error: "sandbox_not_found" });
    const liveMetrics = await openSandbox.metrics(sandbox.rows[0].opensandbox_id).catch(() => null);
    if (liveMetrics) {
      await query("UPDATE sandboxes SET cpu_pct = $1, memory_mb = $2, updated_at = now() WHERE id = $3", [
        liveMetrics.current.cpu,
        liveMetrics.current.mem,
        id
      ]);
      return liveMetrics;
    }
    const ts = new Date().toISOString();
    return {
      current: { cpu: sandbox.rows[0].cpu_pct, mem: sandbox.rows[0].memory_mb, diskIo: 0, networkOut: 0 },
      series: [{ ts, cpu: sandbox.rows[0].cpu_pct, mem: sandbox.rows[0].memory_mb }]
    };
  });

  app.get("/v1/sandboxes/:id/routes", async (request, reply) => {
    const { id } = request.params as { id: string };
    const sandbox = await query<{ opensandbox_id: string | null }>(
      "SELECT opensandbox_id FROM sandboxes WHERE id = $1 AND organization_id = $2",
      [id, request.auth.organizationId]
    );
    if (!sandbox.rowCount) return reply.code(404).send({ error: "sandbox_not_found" });
    const existing = await query(`${routeSelect} WHERE sandbox_id = $1 AND organization_id = $2 ORDER BY port ASC`, [id, request.auth.organizationId]);
    return { routes: existing.rows };
  });

  app.post("/v1/sandboxes/:id/routes", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = routeSchema.parse(request.body ?? {});
    const sandbox = await query<{ id: string; opensandbox_id: string | null; status: string }>(
      "SELECT id, opensandbox_id, status FROM sandboxes WHERE id = $1 AND organization_id = $2",
      [id, request.auth.organizationId]
    );
    if (!sandbox.rowCount) return reply.code(404).send({ error: "sandbox_not_found" });
    if (sandbox.rows[0].status === "terminated") return reply.code(409).send({ error: "sandbox_terminated" });

    const existing = await query(`${routeSelect} WHERE sandbox_id = $1 AND organization_id = $2 AND port = $3`, [
      id,
      request.auth.organizationId,
      body.port
    ]);
    if (existing.rowCount) return { route: existing.rows[0] };

    const [sandboxRouteCount, orgRouteCount] = await Promise.all([
      query<{ count: string }>("SELECT count(*) FROM sandbox_routes WHERE sandbox_id = $1 AND state <> 'terminated'", [id]),
      query<{ count: string }>("SELECT count(*) FROM sandbox_routes WHERE organization_id = $1 AND state <> 'terminated'", [request.auth.organizationId])
    ]);
    if (Number(sandboxRouteCount.rows[0]?.count ?? 0) >= config.sandboxMaxRoutesPerSandbox) {
      return reply.code(429).send({ error: "sandbox_route_limit_exceeded", limit: config.sandboxMaxRoutesPerSandbox });
    }
    if (Number(orgRouteCount.rows[0]?.count ?? 0) >= config.sandboxMaxRoutesPerOrg) {
      return reply.code(429).send({ error: "organization_route_limit_exceeded", limit: config.sandboxMaxRoutesPerOrg });
    }

    const providerRoute = sandbox.rows[0].opensandbox_id
      ? await openSandbox.ensureRoute(sandbox.rows[0].opensandbox_id, body.port)
      : {
          routeKey: `${id.replace(/[^A-Za-z0-9-]+/g, "-")}-${body.port}`,
          host: `${id.replace(/[^A-Za-z0-9-]+/g, "-")}-${body.port}.sandbox.localhost`,
          url: `http://${id.replace(/[^A-Za-z0-9-]+/g, "-")}-${body.port}.sandbox.localhost:${body.port}`,
          targetUrl: `http://${id.replace(/[^A-Za-z0-9-]+/g, "-")}-${body.port}.sandbox.localhost:${body.port}`,
          provider: "fallback-local",
          providerRouteId: null,
          state: "ready" as const
        };

    await query(
      `INSERT INTO sandbox_routes
       (sandbox_id, organization_id, port, protocol, route_key, host, url, target_url, state, provider, provider_route_id, last_checked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
       ON CONFLICT (sandbox_id, port) DO NOTHING`,
      [
        id,
        request.auth.organizationId,
        body.port,
        body.protocol,
        providerRoute.routeKey,
        providerRoute.host,
        providerRoute.url,
        providerRoute.targetUrl,
        providerRoute.state,
        providerRoute.provider,
        providerRoute.providerRouteId
      ]
    );
    await event(request.auth.organizationId, id, "route.created", `exposed ${body.protocol} port ${body.port}`, {
      port: body.port,
      routeKey: providerRoute.routeKey,
      provider: providerRoute.provider
    });
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "sandbox.route.create", "sandbox", id, {
      port: body.port,
      routeKey: providerRoute.routeKey
    });
    const created = await query(`${routeSelect} WHERE sandbox_id = $1 AND organization_id = $2 AND port = $3`, [
      id,
      request.auth.organizationId,
      body.port
    ]);
    return reply.code(201).send({ route: created.rows[0] });
  });

  app.delete("/v1/sandboxes/:id/routes/:port", async (request, reply) => {
    const { id, port } = request.params as { id: string; port: string };
    const parsed = routeSchema.pick({ port: true }).parse({ port });
    const result = await query(
      `${routeSelect}
       WHERE sandbox_id = $1 AND organization_id = $2 AND port = $3`,
      [id, request.auth.organizationId, parsed.port]
    );
    if (!result.rowCount) return reply.code(404).send({ error: "route_not_found" });
    await query(
      `UPDATE sandbox_routes
       SET state = 'terminated', terminated_at = COALESCE(terminated_at, now()), updated_at = now()
       WHERE sandbox_id = $1 AND organization_id = $2 AND port = $3`,
      [id, request.auth.organizationId, parsed.port]
    );
    await event(request.auth.organizationId, id, "route.terminated", `route for port ${parsed.port} disabled`, { port: parsed.port });
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "sandbox.route.delete", "sandbox", id, { port: parsed.port });
    const updated = await query(`${routeSelect} WHERE sandbox_id = $1 AND organization_id = $2 AND port = $3`, [
      id,
      request.auth.organizationId,
      parsed.port
    ]);
    return { route: updated.rows[0] };
  });

  app.get("/v1/api-keys", async (request) => {
    const result = await query(
      `SELECT id, name, prefix, last_four AS "lastFour", created_at AS "createdAt",
              last_used_at AS "lastUsedAt", revoked_at AS "revokedAt"
       FROM api_keys WHERE organization_id = $1 ORDER BY created_at DESC`,
      [request.auth.organizationId]
    );
    return { keys: result.rows };
  });

  app.post("/v1/api-keys", async (request, reply) => {
    const body = apiKeySchema.parse(request.body ?? {});
    const key = createApiKey("live");
    const result = await query(
      `INSERT INTO api_keys (organization_id, name, key_hash, prefix, last_four)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, prefix, last_four AS "lastFour", created_at AS "createdAt"`,
      [request.auth.organizationId, body.name, key.hash, key.prefix, key.lastFour]
    );
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "api_key.create", "api_key", result.rows[0].id);
    return reply.code(201).send({ key: result.rows[0], token: key.token });
  });

  app.delete("/v1/api-keys/:id", async (request) => {
    const { id } = request.params as { id: string };
    await query("UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND organization_id = $2", [id, request.auth.organizationId]);
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "api_key.revoke", "api_key", id);
    return { ok: true };
  });

  app.get("/v1/usage", async (request) => {
    const counts = await query<{ status: string; count: string }>(
      "SELECT status, count(*) FROM sandboxes WHERE organization_id = $1 GROUP BY status",
      [request.auth.organizationId]
    );
    const topTemplates = await query<{ label: string; value: string }>(
      `SELECT template_id AS label, count(*)::text AS value
       FROM sandboxes
       WHERE organization_id = $1
       GROUP BY template_id
       ORDER BY count(*) DESC, template_id ASC
       LIMIT 5`,
      [request.auth.organizationId]
    );
    const runtime = await query<{ compute_hours: string | null; avg_runtime_seconds: string | null }>(
      `SELECT
         COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(last_active_at, updated_at, now()) - started_at))) / 3600, 0)::numeric(10,2) AS compute_hours,
         COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(last_active_at, updated_at, now()) - started_at))), 0)::numeric(10,2) AS avg_runtime_seconds
       FROM sandboxes
       WHERE organization_id = $1 AND started_at IS NOT NULL`,
      [request.auth.organizationId]
    );
    const total = counts.rows.reduce((sum, row) => sum + Number(row.count), 0);
    const concurrentNow = Number(counts.rows.find((row) => row.status === "running")?.count ?? 0);
    const avgColdStartMs = total ? await averageTemplateBootMs(request.auth.organizationId) : 0;
    return {
      sandboxesSpawned: total,
      computeHours: Number(runtime.rows[0]?.compute_hours ?? 0),
      avgColdStartMs,
      avgRuntimeSeconds: Number(runtime.rows[0]?.avg_runtime_seconds ?? 0),
      concurrentNow,
      concurrentPeak: concurrentNow,
      series: Array.from({ length: 14 * 24 }, () => concurrentNow),
      topTemplates: topTemplates.rows.map((row) => ({ label: row.label, value: Number(row.value) })),
      statusBreakdown: counts.rows.map((row) => ({ label: row.status, value: Number(row.count) }))
    };
  });

  app.get("/v1/org/settings", async (request) => {
    const result = await query(
      `SELECT id, name, slug, default_template_id AS "defaultTemplateId",
              idle_ttl_seconds AS "idleTtlSeconds", max_concurrency AS "maxConcurrency"
       FROM organizations WHERE id = $1`,
      [request.auth.organizationId]
    );
    return { organization: result.rows[0] };
  });

  app.patch("/v1/org/settings", async (request) => {
    const body = settingsSchema.parse(request.body ?? {});
    const current = await query<{
      name: string;
      slug: string;
      default_template_id: string;
      idle_ttl_seconds: number;
      max_concurrency: number;
    }>("SELECT * FROM organizations WHERE id = $1", [request.auth.organizationId]);
    const next = {
      name: body.name ?? current.rows[0].name,
      slug: body.slug ?? current.rows[0].slug,
      defaultTemplateId: body.defaultTemplateId ?? current.rows[0].default_template_id,
      idleTtlSeconds: body.idleTtlSeconds ?? current.rows[0].idle_ttl_seconds,
      maxConcurrency: body.maxConcurrency ?? current.rows[0].max_concurrency
    };
    const result = await query(
      `UPDATE organizations
       SET name = $2, slug = $3, default_template_id = $4,
           idle_ttl_seconds = $5, max_concurrency = $6, updated_at = now()
       WHERE id = $1
       RETURNING id, name, slug, default_template_id AS "defaultTemplateId",
                 idle_ttl_seconds AS "idleTtlSeconds", max_concurrency AS "maxConcurrency"`,
      [request.auth.organizationId, next.name, next.slug, next.defaultTemplateId, next.idleTtlSeconds, next.maxConcurrency]
    );
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "org.update", "organization", request.auth.organizationId, body);
    return { organization: result.rows[0] };
  });
};
