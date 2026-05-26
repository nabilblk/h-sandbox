import type { FastifyInstance } from "fastify";
import type {
  RunSandboxResponse,
  SandboxFilesResponse,
  SandboxEgressResponse,
  SandboxLogsResponse,
  SandboxMetricsResponse,
  SandboxRouteResponse,
  SandboxRoutesResponse,
  TestSandboxEgressResponse
} from "@harakiri/shared";
import { apiErrorResponse } from "@harakiri/shared";
import { query as defaultQuery } from "../db.js";
import { runtimeProvider as defaultRuntimeProvider, type RuntimeProvider } from "../providers/runtime/index.js";
import {
  createSandboxRoute,
  deleteSandboxRoute,
  getSandboxMetrics,
  getSandboxEgress,
  listSandboxFiles,
  listSandboxLogs,
  listSandboxRoutes,
  runSandboxCommand,
  testSandboxEgress,
  updateSandboxEgress,
  type Audit,
  type SandboxEventRecorder
} from "../services/sandbox-runtime.js";
import type { Query } from "../services/query.js";
import { egressPatchSchema, egressTestSchema, routeSchema, runSchema } from "./sandbox-runtime.schema.js";

export type SandboxRuntimeRouteDependencies = {
  query?: Query;
  runtimeProvider?: RuntimeProvider;
  recordAudit: Audit;
  recordSandboxEvent: SandboxEventRecorder;
};

export const registerSandboxRuntimeRoutes = async (app: FastifyInstance, dependencies: SandboxRuntimeRouteDependencies) => {
  const query = dependencies.query ?? defaultQuery;
  const runtimeProvider = dependencies.runtimeProvider ?? defaultRuntimeProvider;
  const recordEvent = dependencies.recordSandboxEvent;
  const recordAudit = dependencies.recordAudit;
  const idempotencyKey = (headers: Record<string, unknown>) => {
    const value = headers["idempotency-key"];
    return Array.isArray(value) ? value[0] : typeof value === "string" ? value : undefined;
  };

  app.post("/v1/sandboxes/:id/run", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = runSchema.parse(request.body ?? {});
    const result = await runSandboxCommand(
      { organizationId: request.auth.organizationId, sandboxId: id, command: body.command, stdin: body.stdin },
      { query, runtimeProvider, recordEvent }
    );
    if (!result) return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    return { result } satisfies RunSandboxResponse;
  });

  app.get("/v1/sandboxes/:id/logs", async (request, reply) => {
    const { id } = request.params as { id: string };
    const logs = await listSandboxLogs({ organizationId: request.auth.organizationId, sandboxId: id }, { query, runtimeProvider });
    if (!logs) return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    return { logs } satisfies SandboxLogsResponse;
  });

  app.get("/v1/sandboxes/:id/files", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { path } = request.query as { path?: string };
    const result = await listSandboxFiles({ organizationId: request.auth.organizationId, sandboxId: id, path }, { query, runtimeProvider });
    if (result.kind === "not_found") return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    if (result.kind === "unavailable") return reply.code(502).send(result.files);
    return { cwd: result.cwd, files: result.files } satisfies SandboxFilesResponse;
  });

  app.get("/v1/sandboxes/:id/metrics", async (request, reply) => {
    const { id } = request.params as { id: string };
    const metrics = await getSandboxMetrics({ organizationId: request.auth.organizationId, sandboxId: id }, { query, runtimeProvider });
    if (!metrics) return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    return metrics satisfies SandboxMetricsResponse;
  });

  app.get("/v1/sandboxes/:id/egress", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await getSandboxEgress({ organizationId: request.auth.organizationId, sandboxId: id }, { query, runtimeProvider });
    if (result.kind === "not_found") return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    return { egress: result.egress } satisfies SandboxEgressResponse;
  });

  app.patch("/v1/sandboxes/:id/egress", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = egressPatchSchema.parse(request.body ?? {});
    const result = await updateSandboxEgress(
      {
        organizationId: request.auth.organizationId,
        actorUserId: request.auth.userId,
        actorLabel: request.auth.actorLabel,
        sandboxId: id,
        patch: body
      },
      { query, runtimeProvider, recordEvent, recordAudit }
    );
    if (result.kind === "not_found") return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    if (result.kind === "sandbox_terminated") return reply.code(409).send(apiErrorResponse("sandbox_terminated"));
    if (result.kind === "invalid_policy") return reply.code(400).send(apiErrorResponse("egress_policy_invalid", { message: result.message }));
    if (result.kind === "preset_not_allowed") return reply.code(403).send(apiErrorResponse("egress_preset_not_allowed", { preset: result.preset }));
    if (result.kind === "custom_domains_disabled") return reply.code(403).send(apiErrorResponse("egress_custom_domains_disabled"));
    if (result.kind === "rule_limit_exceeded") return reply.code(429).send(apiErrorResponse("egress_rule_limit_exceeded", { limit: result.limit }));
    if (result.kind === "provider_unavailable") return reply.code(502).send(apiErrorResponse("egress_provider_unavailable", { message: result.message }));
    return { egress: result.egress } satisfies SandboxEgressResponse;
  });

  app.post("/v1/sandboxes/:id/egress/test", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = egressTestSchema.parse(request.body ?? {});
    const result = await testSandboxEgress(
      { organizationId: request.auth.organizationId, sandboxId: id, target: body.target },
      {
        query,
        runtimeProvider,
        recordEvent,
        recordAudit,
        actorUserId: request.auth.userId,
        actorLabel: request.auth.actorLabel
      }
    );
    if (result.kind === "not_found") return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    if (result.kind === "sandbox_not_running") return reply.code(409).send(result.response satisfies TestSandboxEgressResponse);
    return result.response satisfies TestSandboxEgressResponse;
  });

  app.get("/v1/sandboxes/:id/routes", async (request, reply) => {
    const { id } = request.params as { id: string };
    const routes = await listSandboxRoutes({ organizationId: request.auth.organizationId, sandboxId: id }, query);
    if (!routes) return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    return { routes } satisfies SandboxRoutesResponse;
  });

  app.post("/v1/sandboxes/:id/routes", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = routeSchema.parse(request.body ?? {});
    const result = await createSandboxRoute(
      {
        organizationId: request.auth.organizationId,
        actorUserId: request.auth.userId,
        actorLabel: request.auth.actorLabel,
        sandboxId: id,
        port: body.port,
        protocol: body.protocol,
        idempotencyKey: idempotencyKey(request.headers)
      },
      { query, runtimeProvider, recordEvent, recordAudit }
    );
    if (result.kind === "sandbox_not_found") return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    if (result.kind === "sandbox_terminated") return reply.code(409).send(apiErrorResponse("sandbox_terminated"));
    if (result.kind === "sandbox_route_limit_exceeded") {
      return reply.code(429).send(apiErrorResponse("sandbox_route_limit_exceeded", { limit: result.limit }));
    }
    if (result.kind === "organization_route_limit_exceeded") {
      return reply.code(429).send(apiErrorResponse("organization_route_limit_exceeded", { limit: result.limit }));
    }
    if (result.kind === "existing") return { route: result.route } satisfies SandboxRouteResponse;
    return reply.code(201).send({ route: result.route } satisfies SandboxRouteResponse);
  });

  app.delete("/v1/sandboxes/:id/routes/:port", async (request, reply) => {
    const { id, port } = request.params as { id: string; port: string };
    const parsed = routeSchema.pick({ port: true }).parse({ port });
    const route = await deleteSandboxRoute(
      {
        organizationId: request.auth.organizationId,
        actorUserId: request.auth.userId,
        actorLabel: request.auth.actorLabel,
        sandboxId: id,
        port: parsed.port
      },
      { query, recordEvent, recordAudit }
    );
    if (!route) return reply.code(404).send(apiErrorResponse("route_not_found"));
    return { route } satisfies SandboxRouteResponse;
  });
};
