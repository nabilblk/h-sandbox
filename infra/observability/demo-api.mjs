import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { createAuthHandler } from "../../apps/api/src/auth.ts";
import { authorizeRequest, routePermission } from "../../apps/api/src/authorization.ts";
import { registerApiErrorHandler } from "../../apps/api/src/api-error-handler.ts";
import { registerAgentRunRoutes } from "../../apps/api/src/routes/agent-runs.ts";
import { registerTelemetryIngestionRoutes } from "../../apps/api/src/routes/telemetry-ingestion.ts";
import { getCurrentAccount } from "../../apps/api/src/services/account.ts";
import { createApiKeyRecord } from "../../apps/api/src/services/api-keys.ts";
import { createObservabilityServices } from "../../apps/api/src/services/observability/services.ts";
import { readObservabilitySettings } from "../../apps/api/src/services/observability/settings.ts";

const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Fastify = require("fastify"), cors = require("@fastify/cors"), { Pool } = require("pg");
const database = new URL(process.env.DATABASE_URL);
assert.equal(realpathSync(database.searchParams.get("host")), realpathSync(`${process.cwd()}/socket`));
assert.equal(process.env.AUTH_DEV_ALLOW, "0");
const pool = new Pool({ connectionString: database.href, max: 5 });
const query = (sql, params) => pool.query(sql, params);
const transaction = async (action) => {
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    const result = await action((sql, params) => connection.query(sql, params));
    await connection.query("COMMIT");
    return result;
  } catch (error) { await connection.query("ROLLBACK"); throw error; }
  finally { connection.release(); }
};
const app = Fastify({ logger: false });
const services = createObservabilityServices(transaction, readObservabilitySettings());
assert.ok(services);
let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  try { await app.close(); } finally { await pool.end(); }
  process.disconnect?.();
};
process.once("SIGTERM", () => void close());
process.once("SIGINT", () => void close());
process.once("disconnect", () => void close());

try {
  const migrations = new URL("../../db/migrations/", import.meta.url);
  for (const name of (await readdir(migrations)).filter((file) => file.endsWith(".sql")).sort()) {
    await transaction((query) => readFile(new URL(name, migrations), "utf8").then((sql) => query(sql)));
  }
  const organizationId = randomUUID(), userId = randomUUID(), sandboxId = "sbx_telemetry_demo_binding";
  await query("INSERT INTO organizations(id,name,slug) VALUES ($1,'Observability local lab','observability-local-lab')", [organizationId]);
  await query("INSERT INTO users(id,email,full_name,keycloak_subject,onboarding_completed_at) VALUES ($1,'observer@localhost.test','Local observer',$2,clock_timestamp())", [userId, process.env.DEMO_KEYCLOAK_SUBJECT]);
  await query("INSERT INTO memberships(user_id,organization_id,role) VALUES ($1,$2,'admin')", [userId, organizationId]);
  await query("INSERT INTO templates(id,name,description,image,icon) VALUES ('telemetry-demo','Metadata binding only','No sandbox runtime','unused:1','box')");
  await query("INSERT INTO sandboxes(id,organization_id,template_id,name,status,owner_label) VALUES ($1,$2,'telemetry-demo','Metadata binding only - no runtime','running','local demo')", [sandboxId, organizationId]);
  await services.control.configure({ authType: "keycloak", role: "admin", userId, organizationId, actorLabel: "local demo" }, { enabled: true, allowContent: true });
  const { token } = await createApiKeyRecord({ organizationId, actorUserId: userId, name: "Owned local telemetry producer",
    scopes: ["runs:read", "runs:write", "runs:content", "sandboxes:write"], expiresAt: new Date(Date.now() + 4 * 3600_000).toISOString()
  }, { query });
  registerApiErrorHandler(app);
  await app.register(cors, { origin: process.env.DEMO_WEB_URL, allowedHeaders: ["authorization", "content-type", "x-api-key"], methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"] });
  const authenticate = createAuthHandler({ query, devAllowed: () => false });
  app.addHook("onRequest", async (request, reply) => {
    if (request.method === "OPTIONS" || request.url === "/health") return;
    if (routePermission(request.method, request.routeOptions.url)?.credential === "telemetry") return;
    await authenticate(request, reply);
    if (!reply.sent) await authorizeRequest(request, reply);
  });
  app.get("/health", async () => ({ status: "ok", owner: process.env.DEMO_OWNER, scope: "local telemetry lab; no sandbox runtime" }));
  app.get("/v1/me", (request) => getCurrentAccount({ auth: request.auth }, query));
  await registerAgentRunRoutes(app, services);
  await registerTelemetryIngestionRoutes(app, services);
  const apiUrl = await app.listen({ host: "127.0.0.1", port: 0 });
  process.send?.({ apiUrl, apiKey: token, sandboxId });
} catch (error) {
  console.error("Local telemetry API failed:", error instanceof Error ? error.message : "unknown error");
  await close();
  process.exitCode = 1;
}
