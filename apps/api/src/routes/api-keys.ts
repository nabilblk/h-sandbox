import type { FastifyInstance } from "fastify";
import type { ApiKeysResponse, CreateApiKeyResponse, OkResponse } from "@harakiri/shared";
import { allowedApiKeyScopes, apiErrorResponse } from "@harakiri/shared";
import { query as defaultQuery } from "../db.js";
import { createApiKeyRecord, listApiKeys, revokeApiKey } from "../services/api-keys.js";
import type { Query } from "../services/query.js";
import { apiKeySchema } from "./api-keys.schema.js";

type Audit = (
  organizationId: string,
  actorUserId: string | null,
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
    keys: await listApiKeys({ organizationId: request.auth.organizationId, actorUserId: request.auth.userId }, query),
    allowedScopes: allowedApiKeyScopes(request.auth.role ?? ""),
    canManageAll: request.auth.role === "admin"
  }) satisfies ApiKeysResponse);

  app.post("/v1/api-keys", async (request, reply) => {
    const body = apiKeySchema.parse(request.body ?? {});
    const result = await createApiKeyRecord(
      { organizationId: request.auth.organizationId, actorUserId: request.auth.userId, ...body },
      { query }
    );
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "api_key.create", "api_key", result.key.id, { scopes: result.key.scopes, expiresAt: result.key.expiresAt });
    return reply.code(201).send(result satisfies CreateApiKeyResponse);
  });

  app.delete("/v1/api-keys/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const revoked = await revokeApiKey({ organizationId: request.auth.organizationId, actorUserId: request.auth.userId, apiKeyId: id }, query);
    if (!revoked) return reply.code(404).send(apiErrorResponse("not_found"));
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "api_key.revoke", "api_key", id);
    return { ok: true } satisfies OkResponse;
  });
};
