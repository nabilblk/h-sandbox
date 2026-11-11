import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import test from "node:test";
import { createTelemetryIngestion, TelemetryIngestionError, telemetryRequestLimit, type TelemetryBinding } from "./services/observability/ingestion.js";

const token = `htg_${"a".repeat(43)}`;
const binding: TelemetryBinding = { grantId: "grant_a", tenantId: 101, organizationId: "org_a", runId: "run_a", sandboxId: "sbx_a", capture: "metadata", expiresAt: 2000 };
const request = { signal: "traces" as const, contentType: "application/json", body: Buffer.from("{}") };
const errorCode = (status: number, code: string) => (error: unknown) => {
  assert.ok(error instanceof TelemetryIngestionError);
  assert.equal(error.statusCode, status);
  assert.equal(error.code, code);
  return true;
};
const setup = (overrides: Partial<Parameters<typeof createTelemetryIngestion>[0]> = {}) => createTelemetryIngestion({
  authorizeGrant: async (value) => value === token ? binding : null,
  collectorUrl: "http://collector:4318", collectorToken: "internal-secret", now: () => 1000,
  fetch: async () => new Response("{}", { headers: { "Content-Type": "application/json" } }), ...overrides
});

test("only a live scoped grant authenticates ingestion; API credentials do not", async () => {
  const ingress = setup();
  for (const header of [undefined, "Bearer hk_live_example", "Bearer jwt", `Bearer ${token}\n`, `Bearer htg_${"b".repeat(43)}`]) {
    await assert.rejects(ingress.authorize(header), errorCode(401, "telemetry_grant_invalid"));
  }
  const authorized = await ingress.authorize(`Bearer ${token}`);
  assert.deepEqual(authorized, binding);
  assert.ok(Object.isFrozen(authorized));
  for (const invalid of [{ expiresAt: 1000 }, { tenantId: 0 }, { capture: "all" }, { runId: "../other" }]) {
    await assert.rejects(setup({ authorizeGrant: async () => ({ ...binding, ...invalid } as TelemetryBinding) }).authorize(`Bearer ${token}`), errorCode(401, "telemetry_grant_invalid"));
  }
});

test("forwarding derives routing from the grant and never forwards its token", async () => {
  let called = false;
  const ingress = setup({ fetch: async (url, options) => {
    called = true;
    assert.equal(String(url), "http://collector:4318/v1/traces");
    assert.equal(options?.redirect, "error");
    assert.deepEqual(options?.headers, {
      Authorization: "Bearer internal-secret", "Content-Type": "application/json",
      "x-harakiri-tenant": "101", "x-harakiri-org": "org_a", "x-harakiri-run": "run_a",
      "x-harakiri-sandbox": "sbx_a", "x-harakiri-capture": "metadata"
    });
    assert.equal(JSON.stringify(options).includes(token), false);
    return new Response('{"partialSuccess":{"rejectedSpans":1}}', { headers: { "Content-Type": "application/json" } });
  } });
  const result = await ingress.forward(binding, request);
  assert.ok(called);
  assert.equal(result.body.toString(), '{"partialSuccess":{"rejectedSpans":1}}');
});

test("compressed and decompressed limits are enforced before forwarding", async () => {
  let called = 0;
  const ingress = setup({ fetch: async () => { called++; return new Response("{}", { headers: { "Content-Type": "application/json" } }); } });
  const tooLarge = Buffer.alloc(telemetryRequestLimit + 1, 65);
  await assert.rejects(ingress.forward(binding, { ...request, body: tooLarge }), errorCode(413, "telemetry_payload_too_large"));
  await assert.rejects(ingress.forward(binding, { ...request, contentEncoding: "gzip", body: gzipSync(tooLarge) }), errorCode(413, "telemetry_payload_too_large"));
  await assert.rejects(ingress.forward(binding, { ...request, contentEncoding: "gzip" }), errorCode(400, "telemetry_payload_invalid"));
  assert.equal(called, 0);
  await ingress.forward(binding, { ...request, contentEncoding: "gzip", body: gzipSync(request.body) });
  assert.equal(called, 1);
});

test("expiry is rechecked after admission and unknown formats are rejected", async () => {
  let current = 1000;
  const ingress = setup({ now: () => current });
  const grant = await ingress.authorize(`Bearer ${token}`);
  current = 2000;
  await assert.rejects(ingress.forward(grant, request), errorCode(401, "telemetry_grant_invalid"));
  await assert.rejects(setup().forward(binding, { ...request, contentType: "text/plain" }), errorCode(415, "telemetry_format_unsupported"));
  await assert.rejects(setup().forward(binding, { ...request, contentEncoding: "br" }), errorCode(415, "telemetry_encoding_unsupported"));
});

test("transport, upstream authentication and oversized response failures are sanitized", async () => {
  for (const fetch of [
    async () => { throw new Error("sensitive backend diagnostics"); },
    async () => new Response("sensitive backend diagnostics", { status: 401 }),
    async () => new Response("sensitive backend diagnostics", { headers: { "Content-Type": "text/html" } }),
    async () => new Response("x".repeat(65537), { headers: { "Content-Type": "application/json" } })
  ]) {
    await assert.rejects(setup({ fetch }).forward(binding, request), errorCode(503, "telemetry_unavailable"));
  }
  for (const status of [400, 413, 429]) {
    await assert.rejects(setup({ fetch: async () => new Response("secret", { status }) }).forward(binding, request), errorCode(status, "telemetry_rejected"));
  }
});

test("operator destinations cannot add URL credentials, queries or paths", () => {
  for (const collectorUrl of ["file:///tmp", "http://user:secret@collector", "http://collector/?token=secret", "http://collector/other"]) {
    assert.throws(() => setup({ collectorUrl }));
  }
  assert.throws(() => setup({ collectorToken: "" }));
});

test("admission charges decoded bytes, can restrict capture and cannot change identity", async () => {
  let charged = 0, called = 0;
  const ingress = setup({ admit: async (value, bytes) => { charged = bytes; return { ...value, capture: "metadata" }; },
    fetch: async (_url, init) => { called++; assert.equal(new Headers(init?.headers).get("x-harakiri-capture"), "metadata"); return new Response("{}", { headers: { "Content-Type": "application/json" } }); } });
  await ingress.forward({ ...binding, capture: "content" }, { ...request, contentEncoding: "gzip", body: gzipSync(request.body) });
  assert.equal(charged, request.body.byteLength);
  assert.equal(called, 1);
  for (const patch of [{ organizationId: "org_b" }, { grantId: "other" }, { capture: "content" }, { expiresAt: 1 }]) {
    await assert.rejects(setup({ admit: async () => ({ ...binding, ...patch } as TelemetryBinding) }).forward(binding, request), errorCode(401, "telemetry_grant_invalid"));
  }
  await assert.rejects(setup({ admit: async () => { throw new TelemetryIngestionError(429, "telemetry_rate_limited"); } }).forward(binding, request), errorCode(429, "telemetry_rate_limited"));
});
