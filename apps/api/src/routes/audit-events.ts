import type { FastifyInstance } from "fastify";
import { credentialActor } from "../auth-context.js";
import type { AuditEventsResponse } from "@harakiri/shared";
import { apiErrorResponse } from "@harakiri/shared";
import { query as defaultQuery } from "../db.js";
import { listAuditEvents } from "../services/audit-events.js";
import type { Query } from "../services/query.js";
import { auditEventListQuerySchema } from "./audit-events.schema.js";

export const registerAuditEventRoutes = async (
  app: FastifyInstance,
  dependencies: { query?: Query } = {}
) => {
  const query = dependencies.query ?? defaultQuery;
  app.get("/v1/audit-events", async (request, reply) => {
    const filters = auditEventListQuerySchema.parse(request.query ?? {});
    const result = await listAuditEvents({
      organizationId: request.auth.organizationId,
      ...credentialActor(request.auth),
      filters
    }, query);
    if (result.kind === "forbidden") {
      return reply.code(403).send(apiErrorResponse("audit_event_forbidden"));
    }
    return {
      events: result.events,
      page: result.page
    } satisfies AuditEventsResponse;
  });
};
