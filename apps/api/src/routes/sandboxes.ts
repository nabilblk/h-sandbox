import type { FastifyInstance } from "fastify";
import type { CreateSandboxResponse, OkResponse, SandboxResponse, SandboxSourceResponse, SandboxesResponse } from "@harakiri/shared";
import { apiErrorResponse } from "@harakiri/shared";
import { query as defaultQuery } from "../db.js";
import { runtimeProvider as defaultRuntimeProvider, type RuntimeProvider } from "../providers/runtime/index.js";
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
import type { Query } from "../services/query.js";
import { createSandboxSchema, patchSandboxSourceSchema } from "./sandboxes.schema.js";

export type SandboxRouteDependencies = {
  query?: Query;
  runtimeProvider?: RuntimeProvider;
  recordAudit: Audit;
  recordSandboxEvent: SandboxEventRecorder;
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
      }, query)
    } satisfies SandboxesResponse;
    return response;
  });

  app.post("/v1/sandboxes", async (request, reply) => {
    const body = createSandboxSchema.parse(request.body ?? {});
    const result = await createSandbox(
      {
        organizationId: request.auth.organizationId,
        userId: request.auth.userId,
        actorLabel: request.auth.actorLabel,
        templateRef: body.template,
        name: body.name,
        ttlSeconds: body.ttlSeconds,
        env: body.env,
        egress: body.egress,
        source: body.source,
        idempotencyKey: body.idempotencyKey ?? idempotencyKey(request.headers),
        wait: body.wait ?? !preferRespondAsync(request.headers),
        waitTimeoutMs: body.waitTimeoutMs
      },
      { query, runtimeProvider, recordAudit, recordEvent }
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
    const response = { sandbox: result.sandbox } satisfies CreateSandboxResponse;
    return reply.code(201).send(response);
  });

  app.get("/v1/sandboxes/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const sandbox = await getSandbox({ organizationId: request.auth.organizationId, sandboxId: id }, query);
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
      { query, recordEvent, recordAudit }
    );
    if (!sandbox) return reply.code(404).send(apiErrorResponse("sandbox_not_found", { id }));
    return { sandbox } satisfies SandboxSourceResponse;
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
      { query, runtimeProvider, recordAudit, recordEvent }
    );
    if (!deleted) return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    return { ok: true } satisfies OkResponse;
  });

  app.post("/v1/sandboxes/:id/renew", async (request, reply) => {
    const { id } = request.params as { id: string };
    const renewed = await renewSandbox(
      { organizationId: request.auth.organizationId, sandboxId: id, idempotencyKey: idempotencyKey(request.headers) },
      { query, runtimeProvider, recordEvent }
    );
    if (!renewed) return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    return { ok: true } satisfies OkResponse;
  });
};
