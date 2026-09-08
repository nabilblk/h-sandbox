import { credentialActor, type AuthContext } from "../auth-context.js";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  apiErrorResponse,
  type DynamicCredentialIssuerResponse,
  type DynamicCredentialIssuersResponse
} from "@harakiri/shared";
import { query as defaultQuery } from "../db.js";
import type { DynamicCredentialIssuerRegistry } from "../providers/credentials/provider.js";
import { runtimeProvider as defaultRuntimeProvider } from "../providers/runtime/index.js";
import type { RuntimeProvider } from "../providers/runtime/provider.js";
import {
  reinjectCredentialSourceAttachments,
  revokeCredentialSourceAttachments,
  type ReinjectSourceAttachmentsResult,
  type RevokeSourceAttachmentsResult
} from "../services/credential-source-lifecycle.js";
import {
  createDynamicCredentialIssuer,
  deleteDynamicCredentialIssuer,
  disableDynamicCredentialIssuer,
  enableDynamicCredentialIssuer,
  getDynamicCredentialIssuer,
  listDynamicCredentialIssuers,
  updateDynamicCredentialIssuer,
  validateDynamicCredentialIssuer,
  type DynamicCredentialIssuerFailureResult
} from "../services/dynamic-credential-issuers.js";
import type { Query } from "../services/query.js";
import { recordSandboxEvent } from "../services/sandbox-events.js";
import type { SandboxEventRecorder } from "../services/sandbox-runtime.js";
import {
  dynamicCredentialIssuerCreateSchema,
  dynamicCredentialIssuerListQuerySchema,
  dynamicCredentialIssuerUpdateSchema
} from "./dynamic-credential-issuers.schema.js";

type Audit = (
  organizationId: string,
  actorUserId: string | null,
  actorLabel: string,
  action: string,
  targetType: string,
  targetId?: string,
  metadata?: Record<string, unknown>
) => Promise<unknown>;

export type DynamicCredentialIssuerRouteDependencies = {
  query?: Query;
  recordAudit: Audit;
  issuers?: DynamicCredentialIssuerRegistry;
  runtimeProvider?: RuntimeProvider;
  recordEvent?: SandboxEventRecorder;
  reinjectSourceAttachments?: typeof reinjectCredentialSourceAttachments;
  revokeSourceAttachments?: typeof revokeCredentialSourceAttachments;
};

const sendRevocationError = (reply: FastifyReply, result: RevokeSourceAttachmentsResult) => {
  if (result.kind === "ok") return null;
  return reply.code(502).send(apiErrorResponse("credential_vault_provider_unavailable", {
    message: `The credential source is disabled, but ${result.message}. Retry or terminate the affected sandboxes.`
  }));
};

const sendReinjectionError = (reply: FastifyReply, result: ReinjectSourceAttachmentsResult) => {
  if (result.kind === "ok") return null;
  return reply.code(502).send(apiErrorResponse("credential_vault_provider_unavailable", {
    message: `The dynamic credential scope changed, but ${result.message}. Harakiri will keep retrying the affected sandboxes.`
  }));
};

const sendIssuerError = (reply: FastifyReply, result: DynamicCredentialIssuerFailureResult) => {
  if (result.kind === "forbidden") return reply.code(403).send(apiErrorResponse("dynamic_credential_issuer_forbidden"));
  if (result.kind === "not_found") return reply.code(404).send(apiErrorResponse("dynamic_credential_issuer_not_found"));
  if (result.kind === "duplicate") return reply.code(409).send(apiErrorResponse("dynamic_credential_issuer_duplicate"));
  if (result.kind === "disabled") return reply.code(409).send(apiErrorResponse("dynamic_credential_issuer_disabled"));
  if (result.kind === "invalid") {
    return reply.code(400).send(apiErrorResponse("dynamic_credential_issuer_invalid", { message: result.message }));
  }
  const exhaustive: never = result;
  throw new Error(`unhandled dynamic credential issuer result: ${String(exhaustive)}`);
};

const auditMetadata = (issuer: DynamicCredentialIssuerResponse["issuer"]) => ({
  name: issuer.name,
  issuerType: issuer.issuerType,
  sourceType: issuer.sourceType,
  status: issuer.status,
  usePolicy: issuer.usePolicy,
  validationState: issuer.validation.state,
  version: issuer.version,
  scope: issuer.scope
});

const auditIssuer = (
  request: { auth: AuthContext },
  audit: Audit,
  action: string,
  issuer: DynamicCredentialIssuerResponse["issuer"]
) => audit(
  request.auth.organizationId,
  request.auth.userId,
  request.auth.actorLabel,
  action,
  "dynamic_credential_issuer",
  issuer.id,
  auditMetadata(issuer)
);

export const registerDynamicCredentialIssuerRoutes = async (
  app: FastifyInstance,
  dependencies: DynamicCredentialIssuerRouteDependencies
) => {
  const query = dependencies.query ?? defaultQuery;
  const runtimeProvider = dependencies.runtimeProvider ?? defaultRuntimeProvider;
  const event = dependencies.recordEvent ?? recordSandboxEvent(query);
  const reinjectSourceAttachments = dependencies.reinjectSourceAttachments ?? reinjectCredentialSourceAttachments;
  const revokeSourceAttachments = dependencies.revokeSourceAttachments ?? revokeCredentialSourceAttachments;

  const reinjectIssuerAttachments = (request: {
    auth: AuthContext;
  }, issuerId: string) => reinjectSourceAttachments({
    organizationId: request.auth.organizationId,
    sourceType: "dynamic",
    sourceRef: issuerId,
    ...credentialActor(request.auth),
    actorLabel: request.auth.actorLabel
  }, { query, runtimeProvider, recordEvent: event, recordAudit: dependencies.recordAudit });

  const revokeIssuerAttachments = (request: {
    auth: AuthContext;
  }, issuerId: string, reason: "source_disabled" | "source_deleted") => revokeSourceAttachments({
    organizationId: request.auth.organizationId,
    sourceType: "dynamic",
    sourceRef: issuerId,
    ...credentialActor(request.auth),
    actorLabel: request.auth.actorLabel,
    reason
  }, { query, runtimeProvider, recordEvent: event, recordAudit: dependencies.recordAudit });

  app.get("/v1/dynamic-credential-issuers", async (request, reply) => {
    const filters = dynamicCredentialIssuerListQuerySchema.parse(request.query ?? {});
    const result = await listDynamicCredentialIssuers({
      organizationId: request.auth.organizationId,
      ...credentialActor(request.auth),
      includeDeleted: filters.includeDeleted
    }, query);
    if (result.kind !== "ok") return sendIssuerError(reply, result);
    return { issuers: result.issuers } satisfies DynamicCredentialIssuersResponse;
  });

  app.get("/v1/dynamic-credential-issuers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await getDynamicCredentialIssuer({
      organizationId: request.auth.organizationId,
      ...credentialActor(request.auth),
      issuerId: id
    }, query);
    if (result.kind !== "ok") return sendIssuerError(reply, result);
    return { issuer: result.issuer } satisfies DynamicCredentialIssuerResponse;
  });

  app.post("/v1/dynamic-credential-issuers", async (request, reply) => {
    const body = dynamicCredentialIssuerCreateSchema.parse(request.body ?? {});
    const result = await createDynamicCredentialIssuer({
      organizationId: request.auth.organizationId,
      ...credentialActor(request.auth),
      actorLabel: request.auth.actorLabel,
      body
    }, { query });
    if (result.kind !== "ok") return sendIssuerError(reply, result);
    await auditIssuer(request, dependencies.recordAudit, "dynamic_credential_issuer.create", result.issuer);
    return reply.code(201).send({ issuer: result.issuer } satisfies DynamicCredentialIssuerResponse);
  });

  app.patch("/v1/dynamic-credential-issuers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = dynamicCredentialIssuerUpdateSchema.parse(request.body ?? {});
    const result = await updateDynamicCredentialIssuer({
      organizationId: request.auth.organizationId,
      ...credentialActor(request.auth),
      issuerId: id,
      body
    }, query);
    if (result.kind !== "ok") return sendIssuerError(reply, result);
    await auditIssuer(request, dependencies.recordAudit, "dynamic_credential_issuer.update", result.issuer);
    if (body.scope) {
      const reinjected = await reinjectIssuerAttachments(request, id);
      if (reinjected.kind !== "ok") return sendReinjectionError(reply, reinjected);
    }
    return { issuer: result.issuer } satisfies DynamicCredentialIssuerResponse;
  });

  app.post("/v1/dynamic-credential-issuers/:id/validate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await validateDynamicCredentialIssuer({
      organizationId: request.auth.organizationId,
      ...credentialActor(request.auth),
      issuerId: id
    }, { query, issuers: dependencies.issuers });
    if (result.kind !== "ok") return sendIssuerError(reply, result);
    await auditIssuer(request, dependencies.recordAudit, "dynamic_credential_issuer.validate", result.issuer);
    return { issuer: result.issuer } satisfies DynamicCredentialIssuerResponse;
  });

  for (const action of ["disable", "enable"] as const) {
    app.post(`/v1/dynamic-credential-issuers/:id/${action}`, async (request, reply) => {
      const { id } = request.params as { id: string };
      const operation = action === "disable" ? disableDynamicCredentialIssuer : enableDynamicCredentialIssuer;
      const result = await operation({
        organizationId: request.auth.organizationId,
        ...credentialActor(request.auth),
        issuerId: id
      }, query);
      if (result.kind !== "ok") return sendIssuerError(reply, result);
      await auditIssuer(request, dependencies.recordAudit, `dynamic_credential_issuer.${action}`, result.issuer);
      if (action === "disable") {
        const revoked = await revokeIssuerAttachments(request, id, "source_disabled");
        if (revoked.kind !== "ok") return sendRevocationError(reply, revoked);
      }
      return { issuer: result.issuer } satisfies DynamicCredentialIssuerResponse;
    });
  }

  app.delete("/v1/dynamic-credential-issuers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const disabled = await disableDynamicCredentialIssuer({
      organizationId: request.auth.organizationId,
      ...credentialActor(request.auth),
      issuerId: id
    }, query);
    if (disabled.kind !== "ok") return sendIssuerError(reply, disabled);
    await auditIssuer(request, dependencies.recordAudit, "dynamic_credential_issuer.disable", disabled.issuer);
    const revoked = await revokeIssuerAttachments(request, id, "source_deleted");
    if (revoked.kind !== "ok") return sendRevocationError(reply, revoked);
    const result = await deleteDynamicCredentialIssuer({
      organizationId: request.auth.organizationId,
      ...credentialActor(request.auth),
      issuerId: id
    }, query);
    if (result.kind !== "ok") return sendIssuerError(reply, result);
    await auditIssuer(request, dependencies.recordAudit, "dynamic_credential_issuer.delete", result.issuer);
    return { issuer: result.issuer } satisfies DynamicCredentialIssuerResponse;
  });
};
