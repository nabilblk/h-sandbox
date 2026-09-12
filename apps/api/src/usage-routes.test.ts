import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { AuthContext } from "./auth-context.js";
import { registerRoutes } from "./routes.js";
import { registerApiErrorHandler } from "./api-error-handler.js";
import { buildServer } from "./server.js";
import { config } from "./config.js";

test("history is private, bounded and scoped to the authenticated organization", async () => {
  const app = Fastify(); registerApiErrorHandler(app);
  let principal: AuthContext | null = { authType: "keycloak", userId: "user", organizationId: "org-1", role: "member", actorLabel: "test", subject: "sub" };
  const organizations: unknown[] = [];
  await registerRoutes(app, {
    requireAuth: async (request, reply) => { if (!principal) { reply.code(401).send({ error: "unauthorized" }); return; } request.auth = principal; },
    transaction: async (work) => work(async (sql, params) => {
      assert.doesNotMatch(sql, /FOR UPDATE|INSERT|DELETE|UPDATE sandbox/);
      if (sql.includes("CROSS JOIN organizations")) {
        organizations.push(params?.[0]);
        return { rows: [{ available_from: new Date("2026-09-12T00:00:00Z"), last_observed_at: null, now: new Date("2026-09-12T12:00:00Z") }] as never[] };
      }
      if (sql.includes("FROM sandbox_capacity_reservations") || sql.includes("FROM sandbox_operations")) assert.equal(params?.[0], principal?.organizationId);
      return { rows: [] };
    })
  });
  const path = "/v1/usage/history?from=2026-09-12T00:00:00Z&to=2026-09-12T12:00:00Z&resolution=1h";
  try {
    const response = await app.inject(path);
    assert.equal(response.statusCode, 200); assert.equal(response.headers["cache-control"], "private, no-store");
    assert.equal(response.json().summary.heldSlotSeconds, null);
    assert.deepEqual(organizations, ["org-1"]);
    assert.equal((await app.inject(`${path}&organizationId=org-other`)).statusCode, 400);
    principal = { authType: "api_key", userId: null, apiKeyId: "key", organizationId: "org-2", actorLabel: "key", scopes: ["sandboxes:read"] };
    assert.equal((await app.inject(path)).statusCode, 403); assert.equal(organizations.length, 1);
    principal.scopes = ["org:read"];
    assert.equal((await app.inject(path)).statusCode, 200); assert.equal(organizations.at(-1), "org-2");
    principal = null;
    assert.equal((await app.inject(path)).statusCode, 401); assert.equal(organizations.length, 2);
  } finally { await app.close(); }
});

test("browser create preflight permits the idempotency header without authenticating OPTIONS", async () => {
  const previous = { autoMigrate: config.autoMigrate, seedOnBoot: config.seedOnBoot };
  config.autoMigrate = false; config.seedOnBoot = false;
  const app = await buildServer();
  try {
    const response = await app.inject({ method: "OPTIONS", url: "/v1/sandboxes", headers: {
      origin: "https://dashboard.example.test", "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type,idempotency-key"
    } });
    assert.equal(response.statusCode, 204);
    assert.match(String(response.headers["access-control-allow-headers"]), /idempotency-key/i);
  } finally { await app.close(); Object.assign(config, previous); }
});
