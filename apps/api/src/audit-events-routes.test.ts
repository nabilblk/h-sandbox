import assert from "node:assert/strict";
import test from "node:test";
import Fastify, { type FastifyRequest } from "fastify";
import { registerAuditEventRoutes } from "./routes/audit-events.js";
import type { Query } from "./services/query.js";

const authenticate = async (request: FastifyRequest) => {
  request.auth = {
    userId: "user_1",
    organizationId: "org_1",
    actorLabel: "admin@example.com",
    authType: "dev"
  };
};

test("audit event route returns filtered sanitized events to admins", async () => {
  const app = Fastify();
  const query: Query = async (text) => {
    if (text.includes("SELECT role FROM memberships")) return { rows: [{ role: "admin" }] as never[] };
    if (text.includes("COUNT(*)::text AS total")) return { rows: [{ total: "1" }] as never[] };
    if (text.includes("FROM audit_events")) {
      return { rows: [{
        id: "audit_1",
        actorUserId: "user_1",
        actorLabel: "admin@example.com",
        action: "sandbox_credential.attached",
        targetType: "sandbox",
        targetId: "sbx_1",
        metadata: { token: "must-not-leak", sourceType: "harakiri_encrypted" },
        createdAt: new Date("2026-09-04T10:00:00.000Z")
      }] as never[] };
    }
    throw new Error(`unexpected query: ${text}`);
  };
  app.addHook("preHandler", authenticate);
  await registerAuditEventRoutes(app, { query });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1/audit-events?targetType=sandbox&targetId=sbx_1&actionPrefix=sandbox_credential.&limit=10&offset=0"
    });
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.events[0].metadata.token, "[redacted]");
    assert.deepEqual(body.page, { total: 1, limit: 10, offset: 0 });
  } finally {
    await app.close();
  }
});

test("audit event route returns a typed forbidden response to members", async () => {
  const app = Fastify();
  const query: Query = async (text) => {
    assert.match(text, /SELECT role FROM memberships/);
    return { rows: [{ role: "member" }] as never[] };
  };
  app.addHook("preHandler", authenticate);
  await registerAuditEventRoutes(app, { query });

  try {
    const response = await app.inject({ method: "GET", url: "/v1/audit-events" });
    assert.equal(response.statusCode, 403);
    assert.equal(JSON.parse(response.body).error, "audit_event_forbidden");
  } finally {
    await app.close();
  }
});
