import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { context, trace, SpanStatusCode } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { TracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace";
import { LoggerProvider, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { HarakiriClient, HarakiriApiError } from "../../packages/sdk/dist/index.js";
import { withAgentRun, createRunTelemetry } from "../../packages/sdk/dist/telemetry.js";
import { createAuthHandler } from "../../apps/api/src/auth.ts";
import { registerRoutes } from "../../apps/api/src/routes.ts";
import { registerApiErrorHandler } from "../../apps/api/src/api-error-handler.ts";
import { createApiKeyRecord } from "../../apps/api/src/services/api-keys.ts";
import { createObservabilityServices } from "../../apps/api/src/services/observability/services.ts";
import { readObservabilitySettings } from "../../apps/api/src/services/observability/settings.ts";
import { until } from "./docker.mjs";

// Run only in the owned PostgreSQL directory, with an explicit environment.
// Resolving application dependencies does not add them to a public SDK.
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Fastify = require("fastify");
const { Pool } = require("pg");
const database = new URL(process.env.DATABASE_URL);
assert.equal(realpathSync(database.searchParams.get("host")), realpathSync(`${process.cwd()}/socket`), "Only the owned PostgreSQL socket may be used");
const pool = new Pool({ connectionString: database.href, max: 5 });
const query = (sql, params) => pool.query(sql, params);
const transaction = async (action) => {
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    const result = await action((sql, params) => connection.query(sql, params));
    await connection.query("COMMIT");
    return result;
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally { connection.release(); }
};
const services = createObservabilityServices(transaction, readObservabilitySettings());
assert.ok(services);
const app = Fastify({ logger: false });
registerApiErrorHandler(app);
const canary = "APPLICATION_CAPTURE_CANARY";
const traceId = "eeddbbcc00112233eeddbbcc00112233";
const spanId = "0011223344556677";
const window = () => ({ from: new Date(Date.now() - 60_000).toISOString(), to: new Date().toISOString(), limit: 100 });

async function seedTenant(name, allowContent) {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const sandboxId = `sbx_${name}`;
  await query("INSERT INTO organizations(id,name,slug) VALUES ($1,$2,$2)", [organizationId, name]);
  await query("INSERT INTO users(id,email,full_name) VALUES ($1,$2,$3)", [userId, `${name}@test.invalid`, name]);
  await query("INSERT INTO memberships(user_id,organization_id,role) VALUES ($1,$2,'admin')", [userId, organizationId]);
  await query("INSERT INTO sandboxes(id,organization_id,template_id,name,status,owner_label) VALUES ($1,$2,'otel',$1,'running','test')", [sandboxId, organizationId]);
  await services.control.configure({ authType: "keycloak", userId, organizationId, actorLabel: name, role: "admin" }, { enabled: true, allowContent });
  const { key, token } = await createApiKeyRecord({ organizationId, actorUserId: userId, name: "Telemetry qualification",
    scopes: ["runs:read", "runs:write", "sandboxes:write", ...(allowContent ? ["runs:content"] : [])] }, { query });
  return { organizationId, sandboxId, keyId: key.id, token };
}

async function emit(grant) {
  const resource = resourceFromAttributes({ "service.name": "application-qualification", "harakiri.run.id": "run_forged" });
  const provider = new TracerProvider({ resource,
    idGenerator: { generateTraceId: () => traceId, generateSpanId: () => spanId },
    spanProcessors: [new SimpleSpanProcessor({ exporter: new OTLPTraceExporter({ ...grant.exporterOptions("traces"), timeoutMillis: 3000 }) })]
  });
  const logger = new LoggerProvider({ resource, processors: [new SimpleLogRecordProcessor({
    exporter: new OTLPLogExporter({ ...grant.exporterOptions("logs"), timeoutMillis: 3000 })
  })] });
  try {
    const span = provider.getTracer("harakiri.qualification").startSpan("Tool attempt", {
      attributes: { "gen_ai.operation.name": "execute_tool", "gen_ai.tool.name": "test", "gen_ai.input.messages": canary }
    });
    span.setStatus({ code: SpanStatusCode.ERROR });
    logger.getLogger("harakiri.qualification").emit({ context: trace.setSpan(context.active(), span), severityText: "ERROR", severityNumber: 17, body: canary });
    span.end();
    await provider.forceFlush();
    await logger.forceFlush();
  } finally {
    try { await provider.shutdown(); } finally { await logger.shutdown(); }
  }
}

try {
  const migrations = new URL("../../db/migrations/", import.meta.url);
  for (const name of (await readdir(migrations)).filter((file) => file.endsWith(".sql")).sort()) {
    const sql = await readFile(new URL(name, migrations), "utf8");
    await transaction((query) => query(sql));
  }
  await query("INSERT INTO templates(id,name,description,image,icon) VALUES ('otel','qualification','','unused:1','box')");
  const a = await seedTenant("tenant_a", true);
  const b = await seedTenant("tenant_b", false);
  await registerRoutes(app, { query, transaction, observability: services, requireAuth: createAuthHandler({ query, devAllowed: () => false }) });
  const apiUrl = await app.listen({ host: "127.0.0.1", port: 0 });
  const first = new HarakiriClient({ apiUrl, apiKey: a.token });
  const second = new HarakiriClient({ apiUrl, apiKey: b.token });
  const { run: runA } = await first.agentRuns.create({ name: "Content run", sandboxId: a.sandboxId, capture: "content" });
  const { run: runB } = await second.agentRuns.create({ name: "Metadata run", sandboxId: b.sandboxId });
  const grantA = await first.agentRuns.grant(runA.id, a.sandboxId);
  const grantB = await second.agentRuns.grant(runB.id, b.sandboxId);
  await Promise.all([emit(grantA), emit(grantB)]);
  for (const [client, run] of [[first, runA], [second, runB]]) {
    await until("public span query", async () => (await client.agentRuns.spans(run.id, window())).records.length === 1);
    await until("public log query", async () => (await client.agentRuns.logs(run.id, window())).records.length === 1);
    const snapshot = await client.agentRuns.spans(run.id, window());
    assert.equal(snapshot.partial, false);
    assert.equal(snapshot.records[0].traceId, traceId);
    assert.equal(snapshot.records[0].sandboxId, run.sandboxIds[0]);
    assert.equal(JSON.stringify(snapshot).includes(canary), false);
    assert.equal(JSON.stringify(snapshot).includes("run_forged"), false);
    assert.ok((await client.agentRuns.get(run.id)).run.lastAcceptedAt);
  }
  const permitted = await first.agentRuns.spans(runA.id, { ...window(), includeContent: true });
  assert.ok(JSON.stringify(permitted).includes(canary));
  const logs = await first.agentRuns.logs(runA.id, { ...window(), traceId, spanId, includeContent: true });
  assert.equal(logs.records[0].content.body, canary);
  const denied = (status) => (error) => error instanceof HarakiriApiError && error.status === status;
  await assert.rejects(second.agentRuns.spans(runA.id, window()), denied(404));
  await assert.rejects(second.agentRuns.spans(runB.id, { ...window(), includeContent: true }), denied(403));
  assert.equal((await second.agentRuns.list()).runs.length, 1);
  let helperRunId;
  const helperDiagnostics = [];
  await withAgentRun(first, {
    name: "Public telemetry helper", sandboxId: a.sandboxId, capture: "content",
    runtime: createRunTelemetry, ownership: "owned", onDiagnostic: (diagnostic) => helperDiagnostics.push(diagnostic.code)
  }, async ({ run, runtime }) => {
    helperRunId = run.id;
    const span = runtime.tracer.startSpan("Public helper step", { attributes: {
      "harakiri.command.id": "cmd_fixture", "gen_ai.input.messages": "x".repeat(20_000)
    } });
    runtime.logger.emit({ context: trace.setSpan(context.active(), span), body: "PUBLIC_HELPER_OUTPUT", severityText: "INFO", severityNumber: 9 });
    span.end();
  });
  assert.ok(helperRunId);
  assert.deepEqual(helperDiagnostics, []);
  await until("public helper retained spans", async () => (await first.agentRuns.spans(helperRunId, window())).records.length === 1);
  const helperSpans = await first.agentRuns.spans(helperRunId, { ...window(), includeContent: true });
  assert.ok(helperSpans.records[0].issues.includes("truncated_record"));
  assert.equal(helperSpans.records[0].content.attributes["gen_ai.input.messages"].length, 8192);
  const helperLogs = await until("public helper retained logs", async () => {
    const result = await first.agentRuns.logs(helperRunId, { ...window(), includeContent: true });
    return result.records.length ? result.records : false;
  });
  assert.equal(helperLogs[0].content.body, "PUBLIC_HELPER_OUTPUT");
  assert.equal((await first.agentRuns.get(helperRunId)).run.reportedOutcome, "succeeded");
  await first.agentRuns.close(runA.id, "failed");
  await query("UPDATE sandboxes SET status='terminated',updated_at=clock_timestamp() WHERE id=$1", [a.sandboxId]);
  assert.equal((await first.agentRuns.spans(runA.id, window())).records.length, 1);
  await first.agentRuns.revokeGrant(runA.id, grantA.id);
  const revoked = await fetch(grantA.exporterOptions("traces").url, { method: "POST", headers: { ...grantA.exporterOptions("traces").headers, "Content-Type": "application/json" }, body: "{}" });
  assert.equal(revoked.status, 401);
  await query("UPDATE api_keys SET revoked_at=clock_timestamp() WHERE id=$1", [b.keyId]);
  const removedIssuer = await fetch(grantB.exporterOptions("logs").url, { method: "POST", headers: { ...grantB.exporterOptions("logs").headers, "Content-Type": "application/json" }, body: "{}" });
  assert.equal(removedIssuer.status, 401);
  await assert.rejects(second.agentRuns.get(runB.id), denied(401));
  await query("UPDATE agent_runs SET created_at=clock_timestamp()-interval '3 days',retained_until=clock_timestamp()-interval '1 day' WHERE id=$1", [runA.id]);
  await assert.rejects(first.agentRuns.spans(runA.id, window()), denied(410));
  const stored = JSON.stringify((await query("SELECT * FROM telemetry_grants")).rows);
  for (const grant of [grantA, grantB]) assert.equal(stored.includes(grant.exporterOptions("traces").headers.Authorization.slice(7)), false);
  console.log("Public SDK -> API authentication -> persisted grants -> Collector -> Victoria -> authorized queries: passed.");
} finally {
  try { await app.close(); } finally { await pool.end(); }
}
