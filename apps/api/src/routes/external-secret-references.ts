import { credentialActor, type AuthContext } from "../auth-context.js";
import type { FastifyInstance, FastifyReply } from "fastify";
import type {
  ExternalSecretReferenceResponse,
  ExternalSecretReferencesResponse
} from "@harakiri/shared";
import { apiErrorResponse } from "@harakiri/shared";
import { query as defaultQuery } from "../db.js";
import { runtimeProvider as defaultRuntimeProvider } from "../providers/runtime/index.js";
import type { RuntimeProvider } from "../providers/runtime/provider.js";
import type { ExternalSecretResolverRegistry } from "../providers/secrets/provider.js";
import {
  reinjectCredentialSourceAttachments,
  revokeCredentialSourceAttachments,
  type ReinjectSourceAttachmentsResult,
  type RevokeSourceAttachmentsResult
} from "../services/credential-source-lifecycle.js";
import {
  createExternalSecretReference,
  deleteExternalSecretReference,
  disableExternalSecretReference,
  enableExternalSecretReference,
  getExternalSecretReference,
  listExternalSecretReferences,
  updateExternalSecretReference,
  validateExternalSecretReference,
  type ExternalSecretReferenceFailureResult
} from "../services/external-secret-references.js";
import type { Query } from "../services/query.js";
import { recordSandboxEvent } from "../services/sandbox-events.js";
import type { SandboxEventRecorder } from "../services/sandbox-runtime.js";
import {
  externalSecretReferenceCreateSchema,
  externalSecretReferenceListQuerySchema,
  externalSecretReferenceUpdateSchema
} from "./external-secret-references.schema.js";

type Audit = (
  organizationId: string,
  actorUserId: string | null,
  actorLabel: string,
  action: string,
  targetType: string,
  targetId?: string,
  metadata?: Record<string, unknown>
) => Promise<unknown>;

export type ExternalSecretReferenceRouteDependencies = {
  query?: Query;
  recordAudit: Audit;
  resolvers?: ExternalSecretResolverRegistry;
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
    message: `The external reference changed, but ${result.message}. Harakiri will keep retrying the affected sandboxes.`
  }));
};

const sendReferenceError = (reply: FastifyReply, result: ExternalSecretReferenceFailureResult) => {
  if (result.kind === "forbidden") {
    return reply.code(403).send(apiErrorResponse("external_secret_reference_forbidden"));
  }
  if (result.kind === "not_found") {
    return reply.code(404).send(apiErrorResponse("external_secret_reference_not_found"));
  }
  if (result.kind === "duplicate") {
    return reply.code(409).send(apiErrorResponse("external_secret_reference_duplicate"));
  }
  if (result.kind === "disabled") {
    return reply.code(409).send(apiErrorResponse("external_secret_reference_disabled"));
  }
  if (result.kind === "invalid") {
    return reply.code(400).send(apiErrorResponse("external_secret_reference_invalid", { message: result.message }));
  }
  const exhaustive: never = result;
  throw new Error(`unhandled external secret reference result: ${String(exhaustive)}`);
};

const auditMetadata = (result: ExternalSecretReferenceResponse["reference"]) => ({
  name: result.name,
  providerPresetId: result.providerPresetId,
  sourceType: result.sourceType,
  resolverType: result.resolverType,
  status: result.status,
  usePolicy: result.usePolicy,
  validationState: result.validation.state,
  version: result.version
});

const auditReference = async (
  request: { auth: AuthContext },
  audit: Audit,
  action: string,
  reference: ExternalSecretReferenceResponse["reference"]
) => audit(
  request.auth.organizationId,
  request.auth.userId,
  request.auth.actorLabel,
  action,
  "external_secret_reference",
  reference.id,
  auditMetadata(reference)
);

export const registerExternalSecretReferenceRoutes = async (
  app: FastifyInstance,
  dependencies: ExternalSecretReferenceRouteDependencies
) => {
  const query = dependencies.query ?? defaultQuery;
  const runtimeProvider = dependencies.runtimeProvider ?? defaultRuntimeProvider;
  const event = dependencies.recordEvent ?? recordSandboxEvent(query);
  const reinjectSourceAttachments = dependencies.reinjectSourceAttachments ?? reinjectCredentialSourceAttachments;
  const revokeSourceAttachments = dependencies.revokeSourceAttachments ?? revokeCredentialSourceAttachments;

  const reinjectReferenceAttachments = (request: {
    auth: AuthContext;
  }, referenceId: string) => reinjectSourceAttachments({
    organizationId: request.auth.organizationId,
    sourceType: "external_ref",
    sourceRef: referenceId,
    ...credentialActor(request.auth),
    actorLabel: request.auth.actorLabel
  }, { query, runtimeProvider, recordEvent: event, recordAudit: dependencies.recordAudit });

  const revokeReferenceAttachments = (request: {
    auth: AuthContext;
  }, referenceId: string, reason: "source_disabled" | "source_deleted") => revokeSourceAttachments({
    organizationId: request.auth.organizationId,
    sourceType: "external_ref",
    sourceRef: referenceId,
    ...credentialActor(request.auth),
    actorLabel: request.auth.actorLabel,
    reason
  }, { query, runtimeProvider, recordEvent: event, recordAudit: dependencies.recordAudit });

  app.get("/v1/external-secret-references", async (request, reply) => {
    const filters = externalSecretReferenceListQuerySchema.parse(request.query ?? {});
    const result = await listExternalSecretReferences({
      organizationId: request.auth.organizationId,
      ...credentialActor(request.auth),
      includeDeleted: filters.includeDeleted
    }, query);
    if (result.kind !== "ok") return sendReferenceError(reply, result);
    return { references: result.references } satisfies ExternalSecretReferencesResponse;
  });

  app.get("/v1/external-secret-references/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await getExternalSecretReference({
      organizationId: request.auth.organizationId,
      ...credentialActor(request.auth),
      referenceId: id
    }, query);
    if (result.kind !== "ok") return sendReferenceError(reply, result);
    return { reference: result.reference } satisfies ExternalSecretReferenceResponse;
  });

  app.post("/v1/external-secret-references", async (request, reply) => {
    const body = externalSecretReferenceCreateSchema.parse(request.body ?? {});
    const result = await createExternalSecretReference({
      organizationId: request.auth.organizationId,
      ...credentialActor(request.auth),
      actorLabel: request.auth.actorLabel,
      body
    }, { query });
    if (result.kind !== "ok") return sendReferenceError(reply, result);
    await auditReference(request, dependencies.recordAudit, "external_secret_reference.create", result.reference);
    return reply.code(201).send({ reference: result.reference } satisfies ExternalSecretReferenceResponse);
  });

  app.patch("/v1/external-secret-references/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = externalSecretReferenceUpdateSchema.parse(request.body ?? {});
    const result = await updateExternalSecretReference({
      organizationId: request.auth.organizationId,
      ...credentialActor(request.auth),
      referenceId: id,
      body
    }, query);
    if (result.kind !== "ok") return sendReferenceError(reply, result);
    await auditReference(request, dependencies.recordAudit, "external_secret_reference.update", result.reference);
    if (body.reference || body.providerPresetId || body.customProfile) {
      const reinjected = await reinjectReferenceAttachments(request, id);
      if (reinjected.kind !== "ok") return sendReinjectionError(reply, reinjected);
    }
    return { reference: result.reference } satisfies ExternalSecretReferenceResponse;
  });

  app.post("/v1/external-secret-references/:id/validate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await validateExternalSecretReference({
      organizationId: request.auth.organizationId,
      ...credentialActor(request.auth),
      referenceId: id
    }, { query, resolvers: dependencies.resolvers });
    if (result.kind !== "ok") return sendReferenceError(reply, result);
    await auditReference(request, dependencies.recordAudit, "external_secret_reference.validate", result.reference);
    const reinjected = await reinjectReferenceAttachments(request, id);
    if (reinjected.kind !== "ok") return sendReinjectionError(reply, reinjected);
    return { reference: result.reference } satisfies ExternalSecretReferenceResponse;
  });

  for (const action of ["disable", "enable"] as const) {
    app.post(`/v1/external-secret-references/:id/${action}`, async (request, reply) => {
      const { id } = request.params as { id: string };
      const operation = action === "disable" ? disableExternalSecretReference : enableExternalSecretReference;
      const result = await operation({
        organizationId: request.auth.organizationId,
        ...credentialActor(request.auth),
        referenceId: id
      }, query);
      if (result.kind !== "ok") return sendReferenceError(reply, result);
      await auditReference(request, dependencies.recordAudit, `external_secret_reference.${action}`, result.reference);
      if (action === "disable") {
        const revoked = await revokeReferenceAttachments(request, id, "source_disabled");
        if (revoked.kind !== "ok") return sendRevocationError(reply, revoked);
      }
      return { reference: result.reference } satisfies ExternalSecretReferenceResponse;
    });
  }

  app.delete("/v1/external-secret-references/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const disabled = await disableExternalSecretReference({
      organizationId: request.auth.organizationId,
      ...credentialActor(request.auth),
      referenceId: id
    }, query);
    if (disabled.kind !== "ok") return sendReferenceError(reply, disabled);
    await auditReference(request, dependencies.recordAudit, "external_secret_reference.disable", disabled.reference);
    const revoked = await revokeReferenceAttachments(request, id, "source_deleted");
    if (revoked.kind !== "ok") return sendRevocationError(reply, revoked);
    const result = await deleteExternalSecretReference({
      organizationId: request.auth.organizationId,
      ...credentialActor(request.auth),
      referenceId: id
    }, query);
    if (result.kind !== "ok") return sendReferenceError(reply, result);
    await auditReference(request, dependencies.recordAudit, "external_secret_reference.delete", result.reference);
    return { reference: result.reference } satisfies ExternalSecretReferenceResponse;
  });
};
