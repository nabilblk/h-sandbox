import type { FastifyInstance } from "fastify";
import type {
  CreateSandboxResponse,
  OkResponse,
  SandboxResponse,
  SandboxSnapshotResponse,
  SandboxSnapshotsResponse,
  SandboxSourceResponse,
  SandboxesResponse
} from "@harakiri/shared";
import { apiErrorResponse } from "@harakiri/shared";
import { query as defaultQuery, type Transaction } from "../db.js";
import { SandboxLeaseError } from "../services/sandbox-lease.js";
import { runtimeProvider as defaultRuntimeProvider, type RuntimeProvider } from "../providers/runtime/index.js";
import type { ExternalSecretResolverRegistry } from "../providers/secrets/provider.js";
import type { DynamicCredentialIssuerRegistry } from "../providers/credentials/provider.js";
import {
  createSandbox,
  deleteSandbox,
  getSandbox,
  listSandboxes,
  renewSandbox,
  summarizeSandboxOperation,
  updateSandboxSource,
  type Audit,
  type SandboxEventRecorder
} from "../services/sandboxes.js";
import {
  createSandboxSnapshot,
  deleteSandboxSnapshot,
  getSandboxSnapshot,
  listSandboxSnapshots,
  pauseSandbox,
  resumeSandbox
} from "../services/sandbox-lifecycle.js";
import type { Query } from "../services/query.js";
import { createSandboxSchema, createSandboxSnapshotSchema, patchSandboxSourceSchema } from "./sandboxes.schema.js";

export type SandboxRouteDependencies = {
  query?: Query;
  transaction?: Transaction;
  runtimeProvider?: RuntimeProvider;
  recordAudit: Audit;
  recordSandboxEvent: SandboxEventRecorder;
  externalSecretResolvers?: ExternalSecretResolverRegistry;
  dynamicCredentialIssuers?: DynamicCredentialIssuerRegistry;
};

export const registerSandboxRoutes = async (app: FastifyInstance, dependencies: SandboxRouteDependencies) => {
  const query = dependencies.query ?? defaultQuery;
  const runtimeProvider = dependencies.runtimeProvider ?? defaultRuntimeProvider;
  const recordAudit = dependencies.recordAudit;
  const recordEvent = dependencies.recordSandboxEvent;
  const idempotencyKey = (headers: Record<string, unknown>) => {
    const value = headers["idempotency-key"];
    return Array.isArray(value) ? value[0] : typeof value === "string" ? value : undefined;
  };
  const preferRespondAsync = (headers: Record<string, unknown>) => {
    const value = headers.prefer;
    const text = Array.isArray(value) ? value.join(",") : typeof value === "string" ? value : "";
    return text.toLowerCase().split(",").map((item) => item.trim()).includes("respond-async");
  };

  app.get("/v1/sandboxes", async (request) => {
    const { status, q, template, templateVersionId, limit: rawLimit } = request.query as {
      status?: string;
      q?: string;
      template?: string;
      templateVersionId?: string;
      limit?: string;
    };
    const response = {
      sandboxes: await listSandboxes({
        organizationId: request.auth.organizationId,
        filters: {
          status,
          q,
          template,
          templateVersionId,
          limit: rawLimit
        }
      }, { query, runtimeProvider })
    } satisfies SandboxesResponse;
    return response;
  });

  app.post("/v1/sandboxes", async (request, reply) => {
    const body = createSandboxSchema.parse(request.body ?? {});
    const result = await createSandbox(
      {
        organizationId: request.auth.organizationId,
        userId: request.auth.userId,
        apiKeyId: request.auth.apiKeyId,
        actorLabel: request.auth.actorLabel,
        templateRef: body.template,
        snapshotId: body.snapshotId,
        workspaceId: body.workspaceId,
        name: body.name,
        ttlSeconds: body.ttlSeconds,
        env: body.env,
        egress: body.egress,
        source: body.source,
        credentials: body.credentials,
        credentialMappings: body.credentialMappings,
        idempotencyKey: body.idempotencyKey ?? idempotencyKey(request.headers),
        wait: body.wait ?? !preferRespondAsync(request.headers),
        waitTimeoutMs: body.waitTimeoutMs
      },
      {
        query,
        transaction: dependencies.transaction,
        runtimeProvider,
        recordAudit,
        recordEvent,
        externalSecretResolvers: dependencies.externalSecretResolvers,
        dynamicCredentialIssuers: dependencies.dynamicCredentialIssuers
      }
    );
    if (result.kind === "template_not_found") {
      return reply.code(404).send(apiErrorResponse("template_not_found", { template: result.template }));
    }
    if (result.kind === "template_not_ready") {
      return reply.code(409).send(apiErrorResponse("template_not_ready", {
        template: result.template,
        status: result.status,
        message: "template must have a ready digest-pinned version before it can create sandboxes"
      }));
    }
    if (result.kind === "template_image_digest_unresolved") {
      return reply.code(409).send(apiErrorResponse("template_image_digest_unresolved", {
        template: result.template,
        message: result.message
      }));
    }
    if (result.kind === "snapshot_not_found") {
      return reply.code(404).send(apiErrorResponse("snapshot_not_found", { snapshotId: result.snapshotId }));
    }
    if (result.kind === "snapshot_not_ready") {
      return reply.code(409).send(apiErrorResponse("snapshot_not_ready", {
        snapshotId: result.snapshotId,
        status: result.status,
        message: "snapshot must be ready before it can create sandboxes"
      }));
    }
    if (result.kind === "snapshot_provider_mismatch") {
      return reply.code(409).send(apiErrorResponse("snapshot_provider_mismatch", {
        snapshotId: result.snapshotId,
        provider: result.provider,
        runtimeProvider: result.runtimeProvider,
        message: "snapshot belongs to a different runtime provider"
      }));
    }
    if (result.kind === "egress_policy_invalid") {
      return reply.code(400).send(apiErrorResponse("egress_policy_invalid", { message: result.message }));
    }
    if (result.kind === "egress_preset_not_allowed") {
      return reply.code(403).send(apiErrorResponse("egress_preset_not_allowed", { preset: result.preset }));
    }
    if (result.kind === "egress_custom_domains_disabled") {
      return reply.code(403).send(apiErrorResponse("egress_custom_domains_disabled"));
    }
    if (result.kind === "egress_rule_limit_exceeded") {
      return reply.code(429).send(apiErrorResponse("egress_rule_limit_exceeded", { limit: result.limit }));
    }
    if (result.kind === "sandbox_env_not_replayable") {
      return reply.code(400).send(apiErrorResponse("sandbox_env_not_replayable", {
        message: result.message
      }));
    }
    if (result.kind === "credential_vault_create_requires_sync") {
      return reply.code(400).send(apiErrorResponse("credential_vault_create_requires_sync", { message: result.message }));
    }
    if (result.kind === "credential_vault_unsupported") {
      return reply.code(501).send(apiErrorResponse("credential_vault_unsupported", { message: result.message }));
    }
    if (result.kind === "credential_vault_secret_required") {
      return reply.code(400).send(apiErrorResponse("credential_vault_secret_required", { message: result.message }));
    }
    if (result.kind === "credential_secret_forbidden") {
      return reply.code(403).send(apiErrorResponse("credential_secret_forbidden"));
    }
    if (result.kind === "credential_secret_not_found") {
      return reply.code(404).send(apiErrorResponse("credential_secret_not_found"));
    }
    if (result.kind === "credential_secret_disabled") {
      return reply.code(409).send(apiErrorResponse("credential_secret_disabled"));
    }
    if (result.kind === "credential_secret_decryption_unavailable") {
      return reply.code(500).send(apiErrorResponse("credential_secret_decryption_unavailable", { message: result.message }));
    }
    if (result.kind === "external_secret_reference_forbidden") {
      return reply.code(403).send(apiErrorResponse("external_secret_reference_forbidden"));
    }
    if (result.kind === "external_secret_reference_not_found") {
      return reply.code(404).send(apiErrorResponse("external_secret_reference_not_found"));
    }
    if (result.kind === "external_secret_reference_disabled") {
      return reply.code(409).send(apiErrorResponse("external_secret_reference_disabled"));
    }
    if (result.kind === "external_secret_resolution_not_found") {
      return reply.code(424).send(apiErrorResponse("external_secret_resolution_not_found", { message: result.message }));
    }
    if (result.kind === "external_secret_resolution_forbidden") {
      return reply.code(403).send(apiErrorResponse("external_secret_resolution_forbidden", { message: result.message }));
    }
    if (result.kind === "external_secret_resolution_invalid") {
      return reply.code(422).send(apiErrorResponse("external_secret_resolution_invalid", { message: result.message }));
    }
    if (result.kind === "external_secret_resolver_unavailable") {
      return reply.code(503).send(apiErrorResponse("external_secret_resolver_unavailable", { message: result.message }));
    }
    if (result.kind === "dynamic_credential_issuer_forbidden") {
      return reply.code(403).send(apiErrorResponse("dynamic_credential_issuer_forbidden"));
    }
    if (result.kind === "dynamic_credential_issuer_not_found") {
      return reply.code(404).send(apiErrorResponse("dynamic_credential_issuer_not_found"));
    }
    if (result.kind === "dynamic_credential_issuer_disabled") {
      return reply.code(409).send(apiErrorResponse("dynamic_credential_issuer_disabled"));
    }
    if (result.kind === "dynamic_credential_issue_not_found") {
      return reply.code(424).send(apiErrorResponse("dynamic_credential_issue_not_found", { message: result.message }));
    }
    if (result.kind === "dynamic_credential_issue_forbidden") {
      return reply.code(403).send(apiErrorResponse("dynamic_credential_issue_forbidden", { message: result.message }));
    }
    if (result.kind === "dynamic_credential_issue_invalid") {
      return reply.code(422).send(apiErrorResponse("dynamic_credential_issue_invalid", { message: result.message }));
    }
    if (result.kind === "dynamic_credential_issuer_unavailable") {
      return reply.code(503).send(apiErrorResponse("dynamic_credential_issuer_unavailable", { message: result.message }));
    }
    if (result.kind === "credential_vault_invalid_binding") {
      return reply.code(400).send(apiErrorResponse("credential_vault_invalid_binding", { message: result.message }));
    }
    if (result.kind === "credential_vault_required_slot_missing") {
      return reply.code(400).send(apiErrorResponse("credential_vault_required_slot_missing", {
        message: result.message,
        missingSlots: result.missingSlots
      }));
    }
    if (result.kind === "credential_vault_provider_unavailable") {
      return reply.code(502).send(apiErrorResponse("credential_vault_provider_unavailable", {
        message: result.message,
        sandbox: result.sandbox,
        attachment: result.attachment
      }));
    }
    if (result.kind === "sandbox_provision_failed") {
      return reply.code(502).send(apiErrorResponse("sandbox_provision_failed", {
        sandbox: result.sandbox,
        operation: { id: result.operation.id, state: result.operation.state },
        message: result.message
      }));
    }
    if (result.kind === "pending") {
      const response = {
        sandbox: result.sandbox,
        operation: summarizeSandboxOperation(result.operation),
        status: "pending",
        message: result.message
      } satisfies CreateSandboxResponse;
      return reply
        .code(202)
        .header("location", `/v1/sandboxes/${encodeURIComponent(result.sandbox.id)}`)
        .header("retry-after", "1")
        .send(response);
    }
    const response = {
      sandbox: result.sandbox,
      credentialAttachments: result.credentialAttachments
    } satisfies CreateSandboxResponse;
    return reply.code(201).send(response);
  });

  app.get("/v1/sandboxes/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const sandbox = await getSandbox({ organizationId: request.auth.organizationId, sandboxId: id }, { query, runtimeProvider });
    if (!sandbox) return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    return { sandbox } satisfies SandboxResponse;
  });

  app.patch("/v1/sandboxes/:id/source", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = patchSandboxSourceSchema.parse(request.body ?? {});
    const sandbox = await updateSandboxSource(
      {
        organizationId: request.auth.organizationId,
        userId: request.auth.userId,
        actorLabel: request.auth.actorLabel,
        sandboxId: id,
        source: body.source
      },
      { query, runtimeProvider, recordEvent, recordAudit }
    );
    if (!sandbox) return reply.code(404).send(apiErrorResponse("sandbox_not_found", { id }));
    return { sandbox } satisfies SandboxSourceResponse;
  });

  app.post("/v1/sandboxes/:id/pause", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await pauseSandbox(
      {
        organizationId: request.auth.organizationId,
        userId: request.auth.userId,
        actorLabel: request.auth.actorLabel,
        sandboxId: id,
        idempotencyKey: idempotencyKey(request.headers)
      },
      { query, transaction: dependencies.transaction, runtimeProvider, recordAudit, recordEvent }
    );
    if (result.kind === "sandbox_not_found") return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    if (result.kind === "sandbox_invalid_state") {
      return reply.code(409).send(apiErrorResponse("sandbox_invalid_state", {
        state: result.state,
        allowed: result.allowed,
        message: `sandbox must be ${result.allowed.join(" or ")} before it can be paused`
      }));
    }
    if (result.kind === "runtime_lifecycle_unsupported") {
      return reply.code(501).send(apiErrorResponse("runtime_lifecycle_unsupported", {
        capability: result.capability,
        message: "runtime provider does not expose this lifecycle operation"
      }));
    }
    if (result.kind === "runtime_provider_failed") {
      return reply.code(502).send(apiErrorResponse("runtime_provider_failed", { message: result.message }));
    }
    return { sandbox: result.sandbox } satisfies SandboxResponse;
  });

  app.post("/v1/sandboxes/:id/resume", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await resumeSandbox(
      {
        organizationId: request.auth.organizationId,
        userId: request.auth.userId,
        actorLabel: request.auth.actorLabel,
        sandboxId: id,
        idempotencyKey: idempotencyKey(request.headers)
      },
      {
        query,
        transaction: dependencies.transaction,
        runtimeProvider,
        recordAudit,
        recordEvent,
        externalSecretResolvers: dependencies.externalSecretResolvers,
        dynamicCredentialIssuers: dependencies.dynamicCredentialIssuers
      }
    );
    if (result.kind === "sandbox_not_found") return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    if (result.kind === "sandbox_invalid_state") {
      return reply.code(409).send(apiErrorResponse("sandbox_invalid_state", {
        state: result.state,
        allowed: result.allowed,
        message: `sandbox must be ${result.allowed.join(" or ")} before it can be resumed`
      }));
    }
    if (result.kind === "runtime_lifecycle_unsupported") {
      return reply.code(501).send(apiErrorResponse("runtime_lifecycle_unsupported", {
        capability: result.capability,
        message: "runtime provider does not expose this lifecycle operation"
      }));
    }
    if (result.kind === "runtime_provider_failed") {
      return reply.code(502).send(apiErrorResponse("runtime_provider_failed", { message: result.message }));
    }
    return { sandbox: result.sandbox } satisfies SandboxResponse;
  });

  app.post("/v1/sandboxes/:id/snapshots", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = createSandboxSnapshotSchema.parse(request.body ?? {});
    const result = await createSandboxSnapshot(
      {
        organizationId: request.auth.organizationId,
        userId: request.auth.userId,
        actorLabel: request.auth.actorLabel,
        sandboxId: id,
        name: body.name,
        metadata: body.metadata,
        expiresAt: body.expiresAt,
        idempotencyKey: body.idempotencyKey ?? idempotencyKey(request.headers),
        wait: body.wait,
        waitTimeoutMs: body.waitTimeoutMs
      },
      { query, runtimeProvider, recordAudit, recordEvent }
    );
    if (result.kind === "sandbox_not_found") return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    if (result.kind === "sandbox_invalid_state") {
      return reply.code(409).send(apiErrorResponse("sandbox_invalid_state", {
        state: result.state,
        allowed: result.allowed,
        message: `sandbox must be ${result.allowed.join(" or ")} before it can be snapshotted`
      }));
    }
    if (result.kind === "runtime_lifecycle_unsupported") {
      return reply.code(501).send(apiErrorResponse("runtime_lifecycle_unsupported", {
        capability: result.capability,
        message: "runtime provider does not expose this lifecycle operation"
      }));
    }
    if (result.kind === "runtime_provider_failed") {
      return reply.code(502).send(apiErrorResponse("runtime_provider_failed", {
        snapshot: result.snapshot,
        operation: { id: result.operation.id, state: result.operation.state },
        message: result.message
      }));
    }
    const response = {
      snapshot: result.snapshot,
      operation: summarizeSandboxOperation(result.operation),
      status: result.kind === "pending" ? "pending" : "created",
      message: result.kind === "pending" ? result.message : undefined
    } satisfies SandboxSnapshotResponse;
    return reply
      .code(result.kind === "pending" ? 202 : 201)
      .header("location", `/v1/snapshots/${encodeURIComponent(result.snapshot.id)}`)
      .send(response);
  });

  app.get("/v1/snapshots", async (request) => {
    const { status, sandboxId, limit, offset, includeDeleted } = request.query as {
      status?: string;
      sandboxId?: string;
      limit?: string;
      offset?: string;
      includeDeleted?: string;
    };
    const result = await listSandboxSnapshots({
      organizationId: request.auth.organizationId,
      status,
      sourceSandboxId: sandboxId,
      limit,
      offset,
      includeDeleted: includeDeleted === "true"
    }, query);
    return result satisfies SandboxSnapshotsResponse;
  });

  app.get("/v1/snapshots/:snapshotId", async (request, reply) => {
    const { snapshotId } = request.params as { snapshotId: string };
    const snapshot = await getSandboxSnapshot({ organizationId: request.auth.organizationId, snapshotId }, query);
    if (!snapshot) return reply.code(404).send(apiErrorResponse("snapshot_not_found"));
    return { snapshot } satisfies SandboxSnapshotResponse;
  });

  app.delete("/v1/snapshots/:snapshotId", async (request, reply) => {
    const { snapshotId } = request.params as { snapshotId: string };
    const result = await deleteSandboxSnapshot(
      {
        organizationId: request.auth.organizationId,
        userId: request.auth.userId,
        actorLabel: request.auth.actorLabel,
        snapshotId,
        idempotencyKey: idempotencyKey(request.headers)
      },
      { query, runtimeProvider, recordAudit, recordEvent }
    );
    if (result.kind === "snapshot_not_found") return reply.code(404).send(apiErrorResponse("snapshot_not_found"));
    if (result.kind === "runtime_lifecycle_unsupported") {
      return reply.code(501).send(apiErrorResponse("runtime_lifecycle_unsupported", {
        capability: result.capability,
        message: "runtime provider does not expose this lifecycle operation"
      }));
    }
    if (result.kind === "runtime_provider_failed") {
      return reply.code(502).send(apiErrorResponse("runtime_provider_failed", { message: result.message }));
    }
    return { ok: true } satisfies OkResponse;
  });

  app.delete("/v1/sandboxes/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await deleteSandbox(
      {
        organizationId: request.auth.organizationId,
        userId: request.auth.userId,
        actorLabel: request.auth.actorLabel,
        sandboxId: id,
        idempotencyKey: idempotencyKey(request.headers)
      },
      { query, transaction: dependencies.transaction, runtimeProvider, recordAudit, recordEvent }
    );
    if (!deleted) return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    return { ok: true } satisfies OkResponse;
  });

  app.post("/v1/sandboxes/:id/renew", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const renewed = await renewSandbox(
        { organizationId: request.auth.organizationId, sandboxId: id, idempotencyKey: idempotencyKey(request.headers) },
        { query, runtimeProvider, recordEvent, transaction: dependencies.transaction }
      );
      if (!renewed) return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
      return { ok: true } satisfies OkResponse;
    } catch (error) {
      if (error instanceof SandboxLeaseError) return reply.code(error.code === "sandbox_not_found" ? 404 : 409).send(apiErrorResponse(error.code));
      throw error;
    }
  });
};
