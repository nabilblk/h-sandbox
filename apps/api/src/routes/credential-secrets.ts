import type { FastifyInstance, FastifyReply } from "fastify";
import type { CredentialSecretResponse, CredentialSecretsResponse } from "@harakiri/shared";
import { apiErrorResponse } from "@harakiri/shared";
import { query as defaultQuery } from "../db.js";
import { runtimeProvider as defaultRuntimeProvider } from "../providers/runtime/index.js";
import type { RuntimeProvider } from "../providers/runtime/provider.js";
import {
  reinjectCredentialSourceAttachments,
  revokeCredentialSourceAttachments,
  type ReinjectSourceAttachmentsResult,
  type RevokeSourceAttachmentsResult
} from "../services/credential-source-lifecycle.js";
import { recordSandboxEvent } from "../services/sandbox-events.js";
import type { SandboxEventRecorder } from "../services/sandbox-runtime.js";
import {
  createCredentialSecret,
  deleteCredentialSecret,
  disableCredentialSecret,
  enableCredentialSecret,
  getCredentialSecret,
  listCredentialSecrets,
  rotateCredentialSecret,
  updateCredentialSecret,
  type CredentialSecretFailureResult
} from "../services/workspace-credential-secrets.js";
import type { Query } from "../services/query.js";
import {
  credentialSecretCreateSchema,
  credentialSecretListQuerySchema,
  credentialSecretRotateSchema,
  credentialSecretUpdateSchema
} from "./credential-secrets.schema.js";

type Audit = (
  organizationId: string,
  actorUserId: string | null,
  actorLabel: string,
  action: string,
  targetType: string,
  targetId?: string,
  metadata?: Record<string, unknown>
) => Promise<unknown>;

export type CredentialSecretRouteDependencies = {
  query?: Query;
  recordAudit: Audit;
  runtimeProvider?: RuntimeProvider;
  recordEvent?: SandboxEventRecorder;
  reinjectSourceAttachments?: typeof reinjectCredentialSourceAttachments;
  revokeSourceAttachments?: typeof revokeCredentialSourceAttachments;
};

const adminMessage = "Workspace credential secrets require organization admin role.";

const sendRevocationError = (reply: FastifyReply, result: RevokeSourceAttachmentsResult) => {
  if (result.kind === "ok") return null;
  return reply.code(502).send(apiErrorResponse("credential_vault_provider_unavailable", {
    message: `The credential source is disabled, but ${result.message}. Retry or terminate the affected sandboxes.`
  }));
};

const sendReinjectionError = (reply: FastifyReply, result: ReinjectSourceAttachmentsResult) => {
  if (result.kind === "ok") return null;
  return reply.code(502).send(apiErrorResponse("credential_vault_provider_unavailable", {
    message: `The credential source was rotated, but ${result.message}. Harakiri will keep retrying the affected sandboxes.`
  }));
};

const sendSecretError = (reply: FastifyReply, result: CredentialSecretFailureResult) => {
  if (result.kind === "forbidden") {
    return reply.code(403).send(apiErrorResponse("credential_secret_forbidden", { message: adminMessage }));
  }
  if (result.kind === "not_found") return reply.code(404).send(apiErrorResponse("credential_secret_not_found"));
  if (result.kind === "duplicate") return reply.code(409).send(apiErrorResponse("credential_secret_duplicate"));
  if (result.kind === "disabled") return reply.code(409).send(apiErrorResponse("credential_secret_disabled"));
  if (result.kind === "encryption_unavailable") {
    return reply.code(400).send(apiErrorResponse("credential_secret_encryption_unavailable", { message: result.message }));
  }
  if (result.kind === "decryption_unavailable") {
    return reply.code(500).send(apiErrorResponse("credential_secret_decryption_unavailable", { message: result.message }));
  }
  if (result.kind === "value_required") {
    return reply.code(400).send(apiErrorResponse("credential_secret_value_required", { message: result.message }));
  }
  if (result.kind === "invalid") return reply.code(400).send(apiErrorResponse("credential_secret_invalid", { message: result.message }));
  const exhaustive: never = result;
  throw new Error(`unhandled credential secret result: ${String(exhaustive)}`);
};

const auditMetadata = (secret: CredentialSecretResponse["secret"]) => ({
  name: secret.name,
  providerPresetId: secret.providerPresetId,
  sourceType: secret.sourceType,
  status: secret.status,
  version: secret.version,
  usePolicy: secret.usePolicy,
  hasEncryptedSecret: secret.hasEncryptedSecret
});

export const registerCredentialSecretRoutes = async (
  app: FastifyInstance,
  dependencies: CredentialSecretRouteDependencies
) => {
  const query = dependencies.query ?? defaultQuery;
  const audit = dependencies.recordAudit;
  const runtimeProvider = dependencies.runtimeProvider ?? defaultRuntimeProvider;
  const event = dependencies.recordEvent ?? recordSandboxEvent(query);
  const reinjectSourceAttachments = dependencies.reinjectSourceAttachments ?? reinjectCredentialSourceAttachments;
  const revokeSourceAttachments = dependencies.revokeSourceAttachments ?? revokeCredentialSourceAttachments;

  const reinjectSecretAttachments = (request: {
    auth: { organizationId: string; userId: string; actorLabel: string };
  }, secretId: string) => reinjectSourceAttachments({
    organizationId: request.auth.organizationId,
    sourceType: "harakiri_encrypted",
    sourceRef: secretId,
    actorUserId: request.auth.userId,
    actorLabel: request.auth.actorLabel
  }, { query, runtimeProvider, recordEvent: event, recordAudit: audit });

  const revokeSecretAttachments = (request: {
    auth: { organizationId: string; userId: string; actorLabel: string };
  }, secretId: string, reason: "source_disabled" | "source_deleted") => revokeSourceAttachments({
    organizationId: request.auth.organizationId,
    sourceType: "harakiri_encrypted",
    sourceRef: secretId,
    actorUserId: request.auth.userId,
    actorLabel: request.auth.actorLabel,
    reason
  }, { query, runtimeProvider, recordEvent: event, recordAudit: audit });

  app.get("/v1/credential-secrets", async (request, reply) => {
    const listQuery = credentialSecretListQuerySchema.parse(request.query ?? {});
    const result = await listCredentialSecrets({
      organizationId: request.auth.organizationId,
      actorUserId: request.auth.userId,
      includeDeleted: listQuery.includeDeleted
    }, query);
    if (result.kind !== "ok") return sendSecretError(reply, result);
    return { secrets: result.secrets } satisfies CredentialSecretsResponse;
  });

  app.get("/v1/credential-secrets/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await getCredentialSecret({ organizationId: request.auth.organizationId, actorUserId: request.auth.userId, secretId: id }, query);
    if (result.kind !== "ok") return sendSecretError(reply, result);
    return { secret: result.secret } satisfies CredentialSecretResponse;
  });

  app.patch("/v1/credential-secrets/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = credentialSecretUpdateSchema.parse(request.body ?? {});
    const result = await updateCredentialSecret({
      organizationId: request.auth.organizationId,
      actorUserId: request.auth.userId,
      secretId: id,
      body
    }, query);
    if (result.kind !== "ok") return sendSecretError(reply, result);
    await audit(
      request.auth.organizationId,
      request.auth.userId,
      request.auth.actorLabel,
      "credential_secret.access.update",
      "credential_secret",
      id,
      auditMetadata(result.secret)
    );
    return { secret: result.secret } satisfies CredentialSecretResponse;
  });

  app.post("/v1/credential-secrets", async (request, reply) => {
    const body = credentialSecretCreateSchema.parse(request.body ?? {});
    const result = await createCredentialSecret({
      organizationId: request.auth.organizationId,
      actorUserId: request.auth.userId,
      actorLabel: request.auth.actorLabel,
      body
    }, { query });
    if (result.kind !== "ok") return sendSecretError(reply, result);
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "credential_secret.create", "credential_secret", result.secret.id, auditMetadata(result.secret));
    return reply.code(201).send({ secret: result.secret } satisfies CredentialSecretResponse);
  });

  app.post("/v1/credential-secrets/:id/rotate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = credentialSecretRotateSchema.parse(request.body ?? {});
    const result = await rotateCredentialSecret({ organizationId: request.auth.organizationId, actorUserId: request.auth.userId, secretId: id, body }, { query });
    if (result.kind !== "ok") return sendSecretError(reply, result);
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "credential_secret.rotate", "credential_secret", id, auditMetadata(result.secret));
    const reinjected = await reinjectSecretAttachments(request, id);
    if (reinjected.kind !== "ok") return sendReinjectionError(reply, reinjected);
    return { secret: result.secret } satisfies CredentialSecretResponse;
  });

  app.post("/v1/credential-secrets/:id/disable", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await disableCredentialSecret({ organizationId: request.auth.organizationId, actorUserId: request.auth.userId, secretId: id }, query);
    if (result.kind !== "ok") return sendSecretError(reply, result);
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "credential_secret.disable", "credential_secret", id, auditMetadata(result.secret));
    const revoked = await revokeSecretAttachments(request, id, "source_disabled");
    if (revoked.kind !== "ok") return sendRevocationError(reply, revoked);
    return { secret: result.secret } satisfies CredentialSecretResponse;
  });

  app.post("/v1/credential-secrets/:id/enable", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await enableCredentialSecret({ organizationId: request.auth.organizationId, actorUserId: request.auth.userId, secretId: id }, query);
    if (result.kind !== "ok") return sendSecretError(reply, result);
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "credential_secret.enable", "credential_secret", id, auditMetadata(result.secret));
    return { secret: result.secret } satisfies CredentialSecretResponse;
  });

  app.delete("/v1/credential-secrets/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const disabled = await disableCredentialSecret({
      organizationId: request.auth.organizationId,
      actorUserId: request.auth.userId,
      secretId: id
    }, query);
    if (disabled.kind !== "ok") return sendSecretError(reply, disabled);
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "credential_secret.disable", "credential_secret", id, auditMetadata(disabled.secret));
    const revoked = await revokeSecretAttachments(request, id, "source_deleted");
    if (revoked.kind !== "ok") return sendRevocationError(reply, revoked);
    const result = await deleteCredentialSecret({ organizationId: request.auth.organizationId, actorUserId: request.auth.userId, secretId: id }, query);
    if (result.kind !== "ok") return sendSecretError(reply, result);
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "credential_secret.delete", "credential_secret", id, auditMetadata(result.secret));
    return { secret: result.secret } satisfies CredentialSecretResponse;
  });
};
