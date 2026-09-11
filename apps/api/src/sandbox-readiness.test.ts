import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { InMemoryRuntimeProvider } from "./providers/runtime/dev-provider.js";
import type { RuntimeProvider } from "./providers/runtime/provider.js";
import type { Query } from "./services/query.js";
import { getSandboxReadiness, waitForSandboxReadiness } from "./services/sandbox-readiness.js";
import { registerSandboxRoutes } from "./routes/sandboxes.js";
import { authorizeRequest } from "./authorization.js";
import { createIntentFingerprint } from "./services/sandbox-admission.js";

const fixture = () => {
  const state = { status: "running", providerId: "runtime-test", version: "1", busy: false, probes: 0, ready: false };
  const query: Query = async (sql, params) => {
    assert.match(sql.trim(), /^SELECT/, "readiness may never write lifecycle or capacity");
    if (sql.includes("FROM sandboxes s")) {
      assert.match(sql, /s\.organization_id = \$2/);
      if (params?.[0] !== "sbx_test" || params?.[1] !== "org_test") return { rows: [], rowCount: 0 };
      return { rows: [{ id: "sbx_test", opensandboxId: state.providerId, name: "cold-start", template: "python-3.12", status: state.status, ttlSeconds: 300 }] as never[], rowCount: 1 };
    }
    assert.match(sql, /FROM sandbox_runtime_effects/);
    return { rows: [{ version: state.version, busy: state.busy }] as never[], rowCount: 1 };
  };
  const runtimeProvider: RuntimeProvider = new InMemoryRuntimeProvider();
  runtimeProvider.isReady = async (ref, signal) => {
    assert.equal(ref.providerSandboxId, state.providerId);
    assert.ok(signal);
    state.probes++;
    return state.ready;
  };
  return { state, query, runtimeProvider };
};
const input = { organizationId: "org_test", sandboxId: "sbx_test" };

test("running is not ready until execution health succeeds, without any mutations", async () => {
  const f = fixture();
  let result = await getSandboxReadiness(input, f);
  assert.equal(result?.sandbox.status, "running");
  assert.equal(result?.readiness.status, "starting");
  f.state.ready = true;
  result = await getSandboxReadiness(input, f);
  assert.equal(result?.readiness.status, "ready");
  assert.ok(Number.isFinite(Date.parse(result!.readiness.checkedAt)));
  assert.equal(f.state.probes, 2);
});

test("tenant ownership is checked before contacting the runtime", async () => {
  const f = fixture();
  assert.equal(await getSandboxReadiness({ ...input, organizationId: "other" }, f), null);
  assert.equal(f.state.probes, 0);
});

test("pending, paused, absent provider ID and unsettled effects cannot report ready", async () => {
  for (const change of [{ status: "pending" }, { status: "paused" }, { status: "terminated" }, { status: "error" }, { busy: true }, { providerId: "" }]) {
    const f = fixture();
    Object.assign(f.state, change, { ready: true });
    assert.notEqual((await getSandboxReadiness(input, f))?.readiness.status, "ready");
    assert.equal(f.state.probes, 0);
  }
});

test("a concurrent pause, deletion, new effect or replacement fences a successful probe", async () => {
  for (const change of [{ status: "paused" }, { status: "terminated" }, { version: "2" }, { busy: true }, { providerId: "replacement" }]) {
    const f = fixture();
    f.runtimeProvider.isReady = async () => { Object.assign(f.state, change); return true; };
    assert.notEqual((await getSandboxReadiness(input, f))?.readiness.status, "ready");
  }
});

test("provider failures are sanitized, unsupported providers never default to ready", async () => {
  const f = fixture();
  f.runtimeProvider.isReady = async () => { throw new Error("connection refused: secret-token@10.0.0.1"); };
  const result = await getSandboxReadiness(input, f);
  assert.equal(result?.readiness.status, "unavailable");
  assert.doesNotMatch(JSON.stringify(result), /secret-token|10\.0\.0\.1/);
  f.runtimeProvider.isReady = undefined;
  assert.equal((await getSandboxReadiness(input, f))?.readiness.status, "unsupported");
});

test("bounded waiting probes only until ready", async () => {
  const f = fixture();
  f.runtimeProvider.isReady = async () => ++f.state.probes === 3;
  const result = await waitForSandboxReadiness({ ...input, timeoutMs: 100, intervalMs: 1 }, f);
  assert.equal(result?.readiness.status, "ready");
  assert.equal(f.state.probes, 3);
});

test("wait expiry aborts an in-flight health request, retaining the accepted runtime", async () => {
  const f = fixture();
  let aborted = false;
  f.runtimeProvider.isReady = (_ref, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => { aborted = true; reject(signal.reason); }, { once: true });
  });
  // Keep the test alive while AbortSignal's unref'd deadline fires.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    assert.equal(await waitForSandboxReadiness({ ...input, timeoutMs: 15 }, f), null);
    assert.equal(aborted, true);
    assert.equal(f.state.providerId, "runtime-test");
  } finally { clearTimeout(keepAlive); }
});

test("caller cancellation and zero wait do not contact the provider", async () => {
  const f = fixture();
  const controller = new AbortController();
  controller.abort(new Error("caller canceled"));
  await assert.rejects(getSandboxReadiness({ ...input, signal: controller.signal }, f), /caller canceled/);
  assert.equal(await waitForSandboxReadiness({ ...input, timeoutMs: 0 }, f), null);
  assert.equal(f.state.probes, 0);
});

test("readiness HTTP endpoint enforces scopes, tenant 404 and no-store", async () => {
  const f = fixture();
  const app = Fastify();
  app.addHook("preHandler", async (request, reply) => {
    request.auth = { authType: "api_key", userId: null, apiKeyId: "key", organizationId: request.headers["x-test-org"] === "other" ? "other" : "org_test", actorLabel: "test", scopes: request.headers["x-test-scope"] === "write" ? ["sandboxes:write"] : ["sandboxes:read"] };
    return authorizeRequest(request, reply);
  });
  await registerSandboxRoutes(app, { ...f, recordAudit: async () => {}, recordSandboxEvent: async () => {} });
  try {
    assert.equal((await app.inject({ url: "/v1/sandboxes/sbx_test/readiness", headers: { "x-test-scope": "write" } })).statusCode, 403);
    assert.equal((await app.inject({ url: "/v1/sandboxes/sbx_test/readiness", headers: { "x-test-org": "other" } })).statusCode, 404);
    assert.equal(f.state.probes, 0);
    const response = await app.inject({ url: "/v1/sandboxes/sbx_test/readiness" });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.json().readiness.status, "starting");
  } finally { await app.close(); }
});

test("replaying accepted creation requires fresh execution health without dispatching another create", async () => {
  for (const scenario of ["ready", "cold", "async", "unsupported"] as const) {
    const f = fixture();
    f.state.ready = scenario === "ready";
    if (scenario === "unsupported") f.runtimeProvider.isReady = undefined;
    f.runtimeProvider.create = async () => { throw new Error("Never recreate an accepted sandbox"); };
    const payload = { template: "python-3.12", ttlSeconds: 300, idempotencyKey: "accepted", wait: scenario !== "async", waitTimeoutMs: scenario === "cold" ? 20 : 100 };
    const operation = { id: "op_test", sandboxId: "sbx_test", organizationId: "org_test", kind: "provision", state: "succeeded", request: {
      intentFingerprint: createIntentFingerprint({ organizationId: "org_test", userId: null, actorLabel: "test", templateRef: payload.template, ttlSeconds: 300, env: {} })
    } };
    const app = Fastify();
    app.addHook("preHandler", async request => {
      request.auth = { authType: "api_key", userId: null, apiKeyId: "key", organizationId: "org_test", actorLabel: "test", scopes: ["sandboxes:write"] };
    });
    await registerSandboxRoutes(app, { ...f, query: async (sql, params) => sql.includes("FROM sandbox_operations")
      ? { rows: [operation] as never[], rowCount: 1 } : f.query(sql, params), recordAudit: async () => {}, recordSandboxEvent: async () => {} });
    try {
      const response = await app.inject({ method: "POST", url: "/v1/sandboxes", payload });
      assert.equal(response.statusCode, scenario === "ready" || scenario === "async" ? 201 : 202, response.body);
      assert.equal(response.json().sandbox.id, "sbx_test");
      if (scenario === "async") assert.equal(f.state.probes, 0);
      if (scenario === "ready") assert.equal(response.json().readiness.status, "ready");
      if (scenario === "cold") { assert.equal(response.json().status, "pending"); assert.equal(response.json().sandbox.status, "running"); }
      if (scenario === "unsupported") assert.equal(response.json().readiness.status, "unsupported");
    } finally { await app.close(); }
  }
});
