import type { FastifyInstance } from "fastify";
import type { ApiKeysResponse, CreateApiKeyResponse, OkResponse } from "@harakiri/shared";
import { query as defaultQuery } from "../db.js";
import { createApiKeyRecord, listApiKeys, revokeApiKey } from "../services/api-keys.js";
import type { Query } from "../services/query.js";
import { apiKeySchema } from "./api-keys.schema.js";

type Audit = (
  organizationId: string,
  actorUserId: string,
  actorLabel: string,
  action: string,
  targetType: string,
  targetId?: string,
  metadata?: Record<string, unknown>
) => Promise<unknown>;

export type ApiKeyRouteDependencies = {
  query?: Query;
  recordAudit: Audit;
};

export const registerApiKeyRoutes = async (app: FastifyInstance, dependencies: ApiKeyRouteDependencies) => {
  const query = dependencies.query ?? defaultQuery;
  const audit = dependencies.recordAudit;

  app.get("/v1/api-keys", async (request) => ({
    keys: await listApiKeys({ organizationId: request.auth.organizationId }, query)
  }) satisfies ApiKeysResponse);

  app.post("/v1/api-keys", async (request, reply) => {
    const body = apiKeySchema.parse(request.body ?? {});
    const result = await createApiKeyRecord(
      { organizationId: request.auth.organizationId, name: body.name },
      { query }
    );
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "api_key.create", "api_key", result.key.id);
    return reply.code(201).send(result satisfies CreateApiKeyResponse);
  });

  app.delete("/v1/api-keys/:id", async (request) => {
    const { id } = request.params as { id: string };
    await revokeApiKey({ organizationId: request.auth.organizationId, apiKeyId: id }, query);
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "api_key.revoke", "api_key", id);
    return { ok: true } satisfies OkResponse;
  });
};
