import type { FastifyInstance } from "fastify";
import type { TemplateBuildContextResponse, TemplateBuildLogsResponse, TemplateBuildResponse, TemplateBuildsResponse } from "@harakiri/shared";
import { apiErrorResponse } from "@harakiri/shared";
import { decodeBuildContextUpload } from "../build-context.js";
import { config } from "../config.js";
import { query as defaultQuery } from "../db.js";
import { canMutateTemplate, resolveTemplate } from "../templates.js";
import {
  cancelTemplateBuild,
  enqueueTemplateBuild,
  getTemplateBuild,
  getTemplateBuildLogs,
  getTemplateBuildSource,
  listTemplateBuilds,
  uploadTemplateBuildContext,
  type Query
} from "../services/template-builds.js";
import { templateImagePolicyPayload, templateMutationForbidden, templateResourceLimitPayload } from "./template-shared.js";
import { templateBuildContextUploadSchema, templateBuildSchema } from "./template-builds.schema.js";

type Audit = (organizationId: string, actorUserId: string, actorLabel: string, action: string, targetType: string, targetId?: string, metadata?: Record<string, unknown>) => Promise<unknown>;

export type TemplateBuildRouteDependencies = {
  query?: Query;
  recordAudit: Audit;
};

export const registerTemplateBuildRoutes = async (app: FastifyInstance, dependencies: TemplateBuildRouteDependencies) => {
  const query = dependencies.query ?? defaultQuery;
  const audit = dependencies.recordAudit;

  app.post("/v1/templates/:id/builds", async (request, reply) => {
    const { id } = request.params as { id: string };
    const template = await resolveTemplate(id, request.auth.organizationId);
    if (!template) return reply.code(404).send(apiErrorResponse("template_not_found"));
    if (!canMutateTemplate(template)) return reply.code(403).send(templateMutationForbidden);
    const body = templateBuildSchema.parse(request.body ?? {});
    const resourceLimit = templateResourceLimitPayload(template);
    if (resourceLimit) return reply.code(422).send(resourceLimit);
    if (body.sourceType === "image") {
      const imagePolicy = templateImagePolicyPayload([{ image: body.imageDestination ?? template.image }]);
      if (imagePolicy) return reply.code(422).send(imagePolicy);
    }
    const queued = await enqueueTemplateBuild({
      organizationId: request.auth.organizationId,
      templateId: template.id,
      sourceType: body.sourceType,
      contextHash: body.contextHash ?? null,
      dockerfilePath: body.dockerfilePath,
      buildArgs: body.buildArgs,
      imageDestination: body.imageDestination ?? null,
      metadata: body.metadata
    });
    if (!queued.ok) {
      return reply.code(429).send(apiErrorResponse(queued.error, {
        limit: queued.limit,
        activeBuilds: queued.activeBuilds
      }));
    }
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "template.build.create", "template", template.id, {
      buildId: queued.buildId
    });
    const build = await getTemplateBuild({ buildId: queued.buildId, organizationId: request.auth.organizationId }, query);
    if (!build) throw new Error("template build read after enqueue failed");
    return reply.code(201).send({ build } satisfies TemplateBuildResponse);
  });

  app.get("/v1/template-builds", async (request) => {
    const { status, q, template, limit: rawLimit } = request.query as { status?: string; q?: string; template?: string; limit?: string };
    return { builds: await listTemplateBuilds({ organizationId: request.auth.organizationId, status, q, template, limit: rawLimit }, query) } satisfies TemplateBuildsResponse;
  });

  app.get("/v1/template-builds/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const build = await getTemplateBuild({ buildId: id, organizationId: request.auth.organizationId }, query);
    if (!build) return reply.code(404).send(apiErrorResponse("template_build_not_found"));
    return { build } satisfies TemplateBuildResponse;
  });

  app.get("/v1/template-builds/:id/logs", async (request, reply) => {
    const { id } = request.params as { id: string };
    const logs = await getTemplateBuildLogs({ buildId: id, organizationId: request.auth.organizationId }, { query });
    if (!logs) return reply.code(404).send(apiErrorResponse("template_build_not_found"));
    return { logs } satisfies TemplateBuildLogsResponse;
  });

  app.post("/v1/template-builds/:id/context", async (request, reply) => {
    const { id } = request.params as { id: string };
    let context;
    try {
      context = decodeBuildContextUpload(templateBuildContextUploadSchema.parse(request.body ?? {}), config.templateBuildContextMaxBytes);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(400).send(apiErrorResponse("invalid_build_context", { message }));
    }

    const result = await uploadTemplateBuildContext({ buildId: id, organizationId: request.auth.organizationId, context });
    if (result.kind === "template_build_not_found") return reply.code(404).send(apiErrorResponse("template_build_not_found"));
    if (result.kind === "build_context_not_supported") return reply.code(409).send(apiErrorResponse(result.kind, { message: result.message }));
    if (result.kind === "build_context_closed") return reply.code(409).send(apiErrorResponse(result.kind, { message: result.message }));
    if (result.kind === "invalid_build_context") return reply.code(400).send(apiErrorResponse(result.kind, { message: result.message }));
    if (result.kind === "image_policy") return reply.code(422).send(result.payload);
    return { context: result.context } satisfies TemplateBuildContextResponse;
  });

  app.post("/v1/template-builds/:id/cancel", async (request, reply) => {
    const { id } = request.params as { id: string };
    const build = await cancelTemplateBuild({ buildId: id, organizationId: request.auth.organizationId }, query);
    if (!build) return reply.code(404).send(apiErrorResponse("template_build_not_found"));
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "template.build.cancel", "template_build", id);
    return { build } satisfies TemplateBuildResponse;
  });

  app.post("/v1/template-builds/:id/retry", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await getTemplateBuildSource({ buildId: id, organizationId: request.auth.organizationId }, query);
    if (!row) return reply.code(404).send(apiErrorResponse("template_build_not_found"));
    const template = await resolveTemplate(row.template_id, request.auth.organizationId);
    if (!template) return reply.code(404).send(apiErrorResponse("template_not_found"));
    const resourceLimit = templateResourceLimitPayload(template);
    if (resourceLimit) return reply.code(422).send(resourceLimit);
    if (row.source_type === "image") {
      const imagePolicy = templateImagePolicyPayload([{ image: row.image_destination ?? template.image }]);
      if (imagePolicy) return reply.code(422).send(imagePolicy);
    }
    const queued = await enqueueTemplateBuild({
      organizationId: request.auth.organizationId,
      templateId: row.template_id,
      sourceType: row.source_type,
      contextHash: row.context_hash,
      dockerfilePath: row.dockerfile_path,
      buildArgs: row.build_args,
      imageDestination: row.image_destination,
      metadata: { ...row.metadata, retryOf: id }
    });
    if (!queued.ok) {
      return reply.code(429).send(apiErrorResponse(queued.error, {
        limit: queued.limit,
        activeBuilds: queued.activeBuilds
      }));
    }
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "template.build.retry", "template_build", id, {
      buildId: queued.buildId
    });
    const build = await getTemplateBuild({ buildId: queued.buildId, organizationId: request.auth.organizationId }, query);
    if (!build) throw new Error("template build read after retry failed");
    return reply.code(201).send({ build } satisfies TemplateBuildResponse);
  });
};
