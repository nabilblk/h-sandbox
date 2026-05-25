import type { FastifyInstance } from "fastify";
import type { RegistryCredentialResponse, RegistryCredentialsResponse } from "@harakiri/shared";
import { apiErrorResponse } from "@harakiri/shared";
import { query as defaultQuery } from "../db.js";
import {
  listRegistryCredentials,
  RegistryCredentialEncryptionError,
  revokeRegistryCredential,
  upsertRegistryCredential
} from "../services/registry-credentials.js";
import type { Query } from "../services/query.js";
import { registryCredentialSchema } from "./registry-credentials.schema.js";

type Audit = (
  organizationId: string,
  actorUserId: string,
  actorLabel: string,
  action: string,
  targetType: string,
  targetId?: string,
  metadata?: Record<string, unknown>
) => Promise<unknown>;

export type RegistryCredentialRouteDependencies = {
  query?: Query;
  recordAudit: Audit;
};

export const registerRegistryCredentialRoutes = async (app: FastifyInstance, dependencies: RegistryCredentialRouteDependencies) => {
  const query = dependencies.query ?? defaultQuery;
  const audit = dependencies.recordAudit;

  app.get("/v1/registry-credentials", async (request) => {
    const { includeRevoked } = request.query as { includeRevoked?: string };
    return {
      credentials: await listRegistryCredentials(
        { organizationId: request.auth.organizationId, includeRevoked: includeRevoked === "1" },
        query
      )
    } satisfies RegistryCredentialsResponse;
  });

  app.post("/v1/registry-credentials", async (request, reply) => {
    const body = registryCredentialSchema.parse(request.body ?? {});
    let credential;
    try {
      credential = await upsertRegistryCredential({ organizationId: request.auth.organizationId, credential: body }, { query });
    } catch (error) {
      if (error instanceof RegistryCredentialEncryptionError) {
        return reply.code(400).send(apiErrorResponse("registry_credential_encryption_unavailable", { message: error.message }));
      }
      throw error;
    }
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "template.registry_credential.upsert", "template_registry_credential", credential.id, {
      name: credential.name,
      registryHost: credential.registryHost,
      purpose: credential.purpose,
      repositoryPrefix: credential.repositoryPrefix,
      hasEncryptedSecret: credential.hasEncryptedSecret,
      secretRef: credential.secretRef,
      pullSecretRef: credential.pullSecretRef,
      pushSecretRef: credential.pushSecretRef
    });
    return reply.code(201).send({ credential } satisfies RegistryCredentialResponse);
  });

  app.delete("/v1/registry-credentials/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const credential = await revokeRegistryCredential({ organizationId: request.auth.organizationId, credentialId: id }, query);
    if (!credential) return reply.code(404).send(apiErrorResponse("registry_credential_not_found"));
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "template.registry_credential.revoke", "template_registry_credential", id);
    return { credential } satisfies RegistryCredentialResponse;
  });
};
