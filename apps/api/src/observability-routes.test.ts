import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { AuthContext } from "./auth-context.js";
import { registerRoutes } from "./routes.js";
import { registerApiErrorHandler } from "./api-error-handler.js";
import { createObservabilityServices } from "./services/observability/services.js";
import { createTelemetryIngestion, telemetryRequestLimit } from "./services/observability/ingestion.js";
import { readObservabilitySettings } from "./services/observability/settings.js";
import { defaultApiKeyScopes } from "@harakiri/shared";
import type { TelemetryQuery } from "./services/observability/model.js";

const token = `htg_${"a".repeat(43)}`;
const binding = { grantId: "83987a10-761c-436e-a3ad-b7e4fd700328", tenantId: 12, organizationId: "org_owned",
  runId: "run_owned", sandboxId: "sbx_owned", capture: "metadata" as const, expiresAt: Date.now() + 60_000 };
const settings = readObservabilitySettings({ OBSERVABILITY_ENABLED: "1", OBSERVABILITY_COLLECTOR_URL: "http://collector:4318",
  OBSERVABILITY_COLLECTOR_TOKEN: "private-collector-credential-00000000", OBSERVABILITY_LOGS_URL: "http://logs:9428",
  OBSERVABILITY_TRACES_URL: "http://traces:10428" })!;

test("observability installation is optional and requires valid private destinations when enabled", () => {
  assert.equal(readObservabilitySettings({}), null);
  assert.equal(readObservabilitySettings({ OBSERVABILITY_ENABLED: "0", OBSERVABILITY_COLLECTOR_URL: "not-used" }), null);
  assert.throws(() => readObservabilitySettings({ OBSERVABILITY_ENABLED: "true" }));
  assert.throws(() => readObservabilitySettings({ OBSERVABILITY_ENABLED: "1" }));
  assert.equal(settings.allowContent, false);
});

test("run HTTP policies preserve existing key privileges and never accept query-authored tenant identity", async () => {
  const app = Fastify(); registerApiErrorHandler(app);
  let actor: AuthContext = { authType: "keycloak", userId: "user", role: "member", organizationId: "org_owned", actorLabel: "test" };
  let reads = 0;
  const services = createObservabilityServices(async (work) => work(async (sql, params) => {
    if (sql.startsWith("SET")) return { rows: [] };
    assert.equal(params?.[0], actor.organizationId);
    if (sql.includes("FROM agent_runs r")) return { rows: [{ expired: false }] as never[] };
    if (sql.includes("FROM observability_policies")) return { rows: [{ tenant_id: 12, enabled: true, allow_content: false }] as never[] };
    throw new Error("Unexpected database access");
  }), settings)!;
  const queries: TelemetryQuery[] = [];
  services.store.spans = async (query) => {
    reads++; queries.push(query);
    return { records: [], window: { from: query.from, to: query.to }, consistency: "eventual", readAt: new Date().toISOString(),
      issues: [], partial: false, scannedRecords: 0, rejectedRecords: 0 };
  };
  await registerRoutes(app, { observability: services, requireAuth: async (request) => { request.auth = actor; } });
  const url = "/v1/agent-runs/run_owned/spans?from=2026-11-09T00:00:00Z&to=2026-11-09T01:00:00Z";
  try {
    const response = await app.inject(url);
    assert.equal(response.statusCode, 200); assert.equal(response.headers["cache-control"], "private, no-store");
    assert.equal(queries[0].tenantId, 12); assert.equal(queries[0].includeContent, false);
    for (const suffix of ["&tenantId=42", "&organizationId=foreign", "&query=*", "&includeContent=yes", "&limit=1001", "&spanId=ab".padEnd(24, "a")]) {
      assert.equal((await app.inject(url + suffix)).statusCode, 400);
    }
    assert.equal((await app.inject(url + "&includeContent=true")).statusCode, 403);
    assert.equal(reads, 1);
    actor = { authType: "api_key", userId: null, apiKeyId: "key", organizationId: "org_owned", actorLabel: "test", scopes: [...defaultApiKeyScopes] };
    assert.equal((await app.inject(url)).statusCode, 403);
    actor.scopes = ["runs:read"];
    assert.equal((await app.inject(url + "&includeContent=false")).statusCode, 200);
    assert.equal((await app.inject(url + "&includeContent=true")).statusCode, 403);
    assert.equal((await app.inject({ method: "PATCH", url: "/v1/observability/policy", payload: { enabled: true, allowContent: false } })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url: "/v1/agent-runs", payload: { name: "Not authorized", sandboxId: "sbx_owned" } })).statusCode, 403);
    assert.equal(reads, 2);
  } finally { await app.close(); }
});

test("OTLP authenticates before parsing, uses only grants, bounds raw requests and strips sensitive errors", async () => {
  const entries: string[] = [];
  const app = Fastify({ logger: { stream: { write: (line: string) => entries.push(line) } } });
  registerApiErrorHandler(app);
  const services = createObservabilityServices(async () => { throw new Error("Database unavailable"); }, settings)!;
  let forwards = 0, admissions = 0, watermarks = 0;
  let reject = false;
  services.ingestion = createTelemetryIngestion({
    authorizeGrant: async (value) => value === token ? binding : null,
    admit: async (resolved) => { admissions++; return resolved; },
    collectorUrl: settings.collectorUrl, collectorToken: settings.collectorToken,
    fetch: async (_url, init) => {
      forwards++;
      assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${settings.collectorToken}`);
      assert.equal(new Headers(init?.headers).get("x-harakiri-tenant"), "12");
      if (reject) throw new Error(`synthetic-private-content ${token}`);
      return new Response('{"partialSuccess":{"rejectedSpans":"2"}}', { headers: { "content-type": "application/json" } });
    }
  });
  services.control.recordIngestion = async () => { watermarks++; };
  await registerRoutes(app, { observability: services, requireAuth: async () => { throw new Error("OTLP must not use application authentication"); } });
  const url = "/v1/telemetry/traces";
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json", "x-harakiri-tenant": "999" };
  try {
    for (const authorization of ["Bearer jwt", "Bearer hk_live_key", "Bearer htg_invalid"]) {
      assert.equal((await app.inject({ method: "POST", url, headers: { ...headers, authorization }, payload: "{" })).statusCode, 401);
    }
    assert.equal((await app.inject({ method: "POST", url: `${url}?token=${token}`, headers, payload: "{}" })).statusCode, 401);
    const accepted = await app.inject({ method: "POST", url, headers, payload: "{}" });
    assert.equal(accepted.statusCode, 200); assert.equal(accepted.json().partialSuccess.rejectedSpans, "2");
    assert.equal(accepted.headers["cache-control"], "private, no-store");
    assert.equal(admissions, 1); assert.equal(forwards, 1); assert.equal(watermarks, 1);
    assert.equal((await app.inject({ method: "POST", url, headers, payload: "x".repeat(telemetryRequestLimit + 1) })).statusCode, 413);
    assert.equal(forwards, 1);
    reject = true;
    const failed = await app.inject({ method: "POST", url, headers, payload: "{}" });
    assert.equal(failed.statusCode, 503); assert.equal(failed.headers["retry-after"], "1");
    assert.deepEqual(failed.json(), { error: "telemetry_unavailable" });
    assert.equal(entries.join("").includes(token), false);
    assert.equal(entries.join("").includes("synthetic-private-content"), false);
  } finally { await app.close(); }
});

test("disabled observability is explicit without querying or enabling capture", async () => {
  const app = Fastify(); registerApiErrorHandler(app);
  await registerRoutes(app, { observability: null, requireAuth: async (request) => {
    request.auth = { authType: "keycloak", userId: "user", organizationId: "org", role: "admin", actorLabel: "test" };
  } });
  try {
    const policy = await app.inject("/v1/observability/policy");
    assert.equal(policy.statusCode, 200); assert.equal(policy.json().available, false);
    assert.equal(policy.json().enabled, false);
    assert.equal((await app.inject("/v1/agent-runs")).statusCode, 503);
    assert.equal((await app.inject({ method: "POST", url: "/v1/telemetry/logs", payload: "{}" })).statusCode, 503);
  } finally { await app.close(); }
});
