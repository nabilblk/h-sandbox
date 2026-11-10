import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ObservabilityPolicy } from "@harakiri/shared";
import { hasScope } from "../authorization.js";
import type { AuthContext } from "../auth-context.js";
import { ObservabilityControlError } from "../services/observability/control-model.js";
import type { ObservabilityServices } from "../services/observability/services.js";
import { agentRunIdSchema, agentOutcomeSchema, agentRunsQuerySchema, createAgentRunSchema,
  observabilityPolicySchema, telemetryReadSchema, telemetrySandboxIdSchema } from "../services/observability/schemas.js";

const runParams = z.object({ runId: agentRunIdSchema }).strict();

export async function registerAgentRunRoutes(app: FastifyInstance, services: ObservabilityServices | null) {
  await app.register(async (scoped) => {
    scoped.addHook("onRequest", async (_request, reply) => { reply.header("Cache-Control", "private, no-store"); });
    const available = () => {
      if (!services) throw new ObservabilityControlError(503, "observability_disabled");
      return services;
    };
    const permissions = (actor: AuthContext) => ({
      canConfigure: actor.authType !== "api_key" && actor.role === "admin",
      canReadContent: hasScope(actor, "runs:content"),
      operatorAllowsContent: services?.operatorAllowsContent ?? false
    });
    scoped.get("/v1/observability/policy", async (request): Promise<ObservabilityPolicy> => ({
      ...(services ? await services.control.policy(request.auth) : { enabled: false, allowContent: false, retentionDays: 0 }),
      available: services !== null, ...permissions(request.auth)
    }));
    scoped.patch("/v1/observability/policy", { bodyLimit: 1024 }, async (request): Promise<ObservabilityPolicy> => ({
      ...await available().control.configure(request.auth, observabilityPolicySchema.parse(request.body)),
      available: true, ...permissions(request.auth)
    }));
    scoped.get("/v1/agent-runs", async (request) => available().control.list(request.auth, agentRunsQuerySchema.parse(request.query)));
    scoped.post("/v1/agent-runs", { bodyLimit: 4096 }, async (request, reply) => {
      const run = await available().control.create(request.auth, createAgentRunSchema.parse(request.body));
      return reply.code(201).send({ run });
    });
    scoped.get("/v1/agent-runs/:runId", async (request) => ({
      run: await available().control.get(request.auth, runParams.parse(request.params).runId)
    }));
    scoped.post("/v1/agent-runs/:runId/close", { bodyLimit: 1024 }, async (request) => ({
      run: await available().control.close(request.auth, runParams.parse(request.params).runId,
        z.object({ outcome: agentOutcomeSchema }).strict().parse(request.body).outcome)
    }));
    scoped.post("/v1/agent-runs/:runId/grants", { bodyLimit: 1024 }, async (request, reply) => {
      const grant = await available().control.issueGrant(request.auth, runParams.parse(request.params).runId,
        z.object({ sandboxId: telemetrySandboxIdSchema }).strict().parse(request.body).sandboxId);
      return reply.code(201).send(grant);
    });
    scoped.delete("/v1/agent-runs/:runId/grants/:grantId", async (request) => {
      const { runId, grantId } = runParams.extend({ grantId: z.uuid() }).parse(request.params);
      await available().control.revokeGrant(request.auth, runId, grantId);
      return { ok: true };
    });

    // Bound simultaneous storage reads per API process. Database authorization
    // and backend deadlines provide separate bounds; no query text is accepted.
    let readers = 0;
    for (const signal of ["spans", "logs"] as const) {
      scoped.get(`/v1/agent-runs/:runId/${signal}`, async (request, reply) => {
        if (readers >= 16) {
          reply.header("Retry-After", "1");
          throw new ObservabilityControlError(429, "telemetry_query_busy");
        }
        readers++;
        try {
          const service = available();
          const runId = runParams.parse(request.params).runId;
          const options = telemetryReadSchema.parse(request.query);
          const scope = await service.control.queryScope(request.auth, runId, options.includeContent);
          return await service.store[signal]({ ...options, ...scope });
        } finally { readers--; }
      });
    }
  });
}
