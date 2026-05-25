import type { FastifyInstance } from "fastify";
import type { TemplateResponse, TemplatesResponse, TemplateVersionsResponse } from "@harakiri/shared";
import { apiErrorResponse } from "@harakiri/shared";
import {
  archiveTemplateForOrganization,
  createTemplate,
  getTemplate,
  listTemplateVersions,
  listTemplatesForOrganization,
  promoteTemplate,
  type Audit,
  type Query
} from "../services/templates.js";
import { templateMutationForbidden } from "../services/template-policies.js";
import { query as defaultQuery } from "../db.js";
import { templateCreateSchema, templatePromoteSchema } from "./templates.schema.js";

export type TemplateRouteDependencies = {
  query?: Query;
  recordAudit: Audit;
};

export const registerTemplateRoutes = async (app: FastifyInstance, dependencies: TemplateRouteDependencies) => {
  const query = dependencies.query ?? defaultQuery;
  const audit = dependencies.recordAudit;

  app.get("/v1/templates", async (request) => {
    const { q, visibility, owner, runtimeFamily, status, limit, offset } = request.query as {
      q?: string;
      visibility?: string;
      owner?: string;
      runtimeFamily?: string;
      status?: string;
      limit?: string;
      offset?: string;
    };
    const response = await listTemplatesForOrganization({
      organizationId: request.auth.organizationId,
      filters: {
        q,
        visibility,
        owner,
        runtimeFamily,
        status,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined
      }
    }) satisfies TemplatesResponse;
    return response;
  });

  app.post("/v1/templates", async (request, reply) => {
    const result = await createTemplate(
      {
        organizationId: request.auth.organizationId,
        userId: request.auth.userId,
        actorLabel: request.auth.actorLabel,
        template: templateCreateSchema.parse(request.body ?? {})
      },
      { query, recordAudit: audit }
    );
    if (result.kind === "resource_limit" || result.kind === "image_policy") return reply.code(422).send(result.payload);
    if (result.kind === "template_exists") return reply.code(409).send(apiErrorResponse("template_exists", { template: result.template }));
    if (!result.template) throw new Error("template read after create failed");
    return reply.code(201).send({ template: result.template } satisfies TemplateResponse);
  });

  app.get("/v1/templates/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const template = await getTemplate({ organizationId: request.auth.organizationId, templateId: id });
    if (!template) return reply.code(404).send(apiErrorResponse("template_not_found"));
    return { template } satisfies TemplateResponse;
  });

  app.get("/v1/templates/:id/versions", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await listTemplateVersions({ organizationId: request.auth.organizationId, templateId: id }, { query });
    if (result.kind === "template_not_found") return reply.code(404).send(apiErrorResponse("template_not_found"));
    return { versions: result.versions } satisfies TemplateVersionsResponse;
  });

  app.post("/v1/templates/:id/promote", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = templatePromoteSchema.parse(request.body ?? {});
    const result = await promoteTemplate(
      {
        organizationId: request.auth.organizationId,
        userId: request.auth.userId,
        actorLabel: request.auth.actorLabel,
        templateId: id,
        versionId: body.versionId,
        alias: body.alias
      },
      { query, recordAudit: audit }
    );
    if (result.kind === "template_not_found") return reply.code(404).send(apiErrorResponse("template_not_found"));
    if (result.kind === "template_not_mutable") return reply.code(403).send(templateMutationForbidden);
    if (result.kind === "template_version_not_found") return reply.code(404).send(apiErrorResponse("template_version_not_found"));
    if (!result.template) throw new Error("template read after promote failed");
    return { template: result.template } satisfies TemplateResponse;
  });

  app.post("/v1/templates/:id/archive", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await archiveTemplateForOrganization(
      {
        organizationId: request.auth.organizationId,
        userId: request.auth.userId,
        actorLabel: request.auth.actorLabel,
        templateId: id
      },
      { query, recordAudit: audit }
    );
    if (result.kind === "template_not_found") return reply.code(404).send(apiErrorResponse("template_not_found"));
    return { template: result.template } satisfies TemplateResponse;
  });
};
