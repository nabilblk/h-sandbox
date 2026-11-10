import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLogs, normalizeSpans, type StorageRecord } from "./services/observability/normalize.js";
import type { TelemetryQuery } from "./services/observability/model.js";
import { createVictoriaTelemetryStore } from "./services/observability/victoria.js";

const query: TelemetryQuery = {
  tenantId: 13, organizationId: "org_a", runId: "run_a", includeContent: false, limit: 100,
  from: "2026-11-09T10:00:00.000Z", to: "2026-11-09T11:00:00.000Z"
};
const traceId = "1234567890abcdef1234567890abcdef";
const spanId = "1234567890abcdef";
const binding = {
  "harakiri.org.id": "org_a", "harakiri.run.id": "run_a", "harakiri.sandbox.id": "sbx_a",
  "harakiri.capture": "content", "harakiri.source": "workload", "harakiri.schema.version": "1"
};
const row = (overrides: StorageRecord = {}): StorageRecord => ({
  ...Object.fromEntries(Object.entries(binding).map(([key, value]) => [`resource_attr:${key}`, value])),
  _time: "2026-11-09T10:00:00.123456789Z", trace_id: traceId, span_id: spanId,
  start_time_unix_nano: "1794218400123456789", end_time_unix_nano: "1794218400223456790",
  name: "Model", kind: "3", status_code: "1", duration: "9999999999999999999",
  "span_attr:gen_ai.usage.input_tokens": "32", "span_attr:gen_ai.input.messages": "SECRET",
  "event:event_name:0": "exception", "event:event_attr:exception.message:0": "SECRET",
  "event:event_time_unix_nano:0": "1794218400123456789",
  "link:link_trace_id:0": traceId, "link:link_span_id:0": "234567890abcdef1", "link:link_attr:secret:0": "SECRET",
  status_message: "SECRET", "span_attr:unrecognized": "SECRET", ...overrides
});
const log = (overrides: StorageRecord = {}): StorageRecord => ({
  ...binding, _time: "2026-11-09T10:00:00.123456789Z", trace_id: traceId, span_id: spanId,
  _msg: "SECRET", severity_text: "ERROR", severity_number: "17", ...overrides
});

test("span normalization preserves exact IDs and nanoseconds without trusting derived duration", () => {
  const result = normalizeSpans([row()], query);
  assert.equal(result.rejectedRecords, 0);
  assert.deepEqual(result.issues, []);
  const [span] = result.records;
  assert.equal(span.startTimeUnixNano, "1794218400123456789");
  assert.equal(span.durationNano, "100000001");
  assert.equal(span.id, `${traceId}:${spanId}`);
  assert.equal(span.parent, "root");
  assert.equal(span.content.state, "hidden");
  assert.equal(JSON.stringify(result).includes("SECRET"), false);
  assert.deepEqual(span.attributes, { "gen_ai.usage.input_tokens": "32" });
});

test("content requires both recorded opt-in and reader permission, including events and links", () => {
  const allowed = normalizeSpans([row()], { ...query, includeContent: true }).records[0];
  assert.equal(allowed.content.state, "available");
  assert.equal(allowed.content.events[0].attributes["exception.message"], "SECRET");
  assert.equal(allowed.content.links[0].spanId, "234567890abcdef1");
  assert.equal(allowed.attributes.unrecognized, undefined);
  const metadata = normalizeSpans([row({ "resource_attr:harakiri.capture": "metadata" })], { ...query, includeContent: true });
  assert.equal(JSON.stringify(metadata).includes("SECRET"), false);
  assert.equal(metadata.records[0].content.state, "not_captured");
});

test("scope, schema, identity and timestamp mismatches never become usable spans", () => {
  const malformed = [
    row({ "resource_attr:harakiri.org.id": "org_b" }), row({ "resource_attr:harakiri.run.id": "run_b" }),
    row({ "resource_attr:harakiri.source": "control-plane" }), row({ "resource_attr:harakiri.schema.version": "2" }),
    row({ span_id: "0".repeat(16) }), row({ trace_id: "invalid" }), row({ start_time_unix_nano: "1794218400.123" })
  ];
  const result = normalizeSpans(malformed, query);
  assert.equal(result.rejectedRecords, malformed.length);
  assert.deepEqual(result.records, []);
  assert.ok(result.issues.includes("unsupported_schema"));
});

test("LLM details survive normalization while message/tool definitions remain permission-gated", () => {
  const messages = JSON.stringify([{ role: "user", content: "PRIVATE".repeat(1000) }]);
  const data = row({ "span_attr:gen_ai.input.messages": messages, "span_attr:gen_ai.tool.definitions": "PRIVATE TOOLS",
    "span_attr:gen_ai.system_instructions": "PRIVATE SYSTEM", "span_attr:gen_ai.response.finish_reasons": '["stop"]',
    "span_attr:gen_ai.usage.cache_read.input_tokens": "0", "span_attr:gen_ai.usage.reasoning.output_tokens": "8",
    "span_attr:gen_ai.request.temperature": "0", "span_attr:harakiri.llm.first_token_ms": "142.5", "span_attr:gen_ai.tool.call.id": "call_a" });
  const hidden = normalizeSpans([data], query);
  assert.equal(JSON.stringify(hidden).includes("PRIVATE"), false);
  assert.equal(hidden.records[0].attributes["gen_ai.response.finish_reasons"], '["stop"]');
  assert.equal(hidden.records[0].attributes["gen_ai.usage.cache_read.input_tokens"], "0");
  assert.equal(hidden.records[0].attributes["harakiri.llm.first_token_ms"], "142.5");
  const shown = normalizeSpans([data], { ...query, includeContent: true });
  assert.equal(shown.records[0].content.attributes["gen_ai.input.messages"], messages);
  assert.deepEqual(shown.issues, []);
  const clipped = normalizeSpans([row({ "span_attr:gen_ai.input.messages": "x".repeat(32768), "span_attr:harakiri.content.truncated": "true" })], { ...query, includeContent: true });
  assert.ok(clipped.records[0].issues.includes("truncated_record"));
  assert.ok(clipped.issues.includes("truncated_record"));
  assert.equal(JSON.stringify(normalizeSpans([{ ...data, "resource_attr:harakiri.capture": "metadata" }], { ...query, includeContent: true })).includes("PRIVATE"), false);
});

test("duplicate delivery and conflicting IDs are deterministic across order", () => {
  const first = row(), second = row({ name: "Retry" });
  const a = normalizeSpans([first, second, first], query);
  const b = normalizeSpans([second, first, first], query);
  assert.deepEqual(a, b);
  assert.equal(a.records[0].deliveries, 3);
  assert.ok(a.issues.includes("conflicting_span"));
  const repeated = normalizeSpans([first, { ...first, "span_attr:gen_ai.input.messages": "OTHER HIDDEN CONTENT" }], query);
  assert.equal(repeated.issues.includes("conflicting_span"), false, "Hidden content must not influence reader-visible conflict information");
});

test("OpenInference input/output stay bounded and require both capture and read permission", () => {
  const raw = row({ "span_attr:input.value": "PRIVATE input", "span_attr:output.value": "PRIVATE output" });
  assert.equal(JSON.stringify(normalizeSpans([raw], query)).includes("PRIVATE"), false);
  assert.equal(JSON.stringify(normalizeSpans([{ ...raw, "resource_attr:harakiri.capture": "metadata" }],
    { ...query, includeContent: true })).includes("PRIVATE"), false);
  const shown = normalizeSpans([raw], { ...query, includeContent: true }).records[0];
  assert.equal(shown.content.attributes["input.value"], "PRIVATE input");
  assert.equal(shown.content.attributes["output.value"], "PRIVATE output");
  assert.equal(shown.attributes["input.value"], undefined);
  const large = normalizeSpans([row({ "span_attr:input.value": "x".repeat(40000) })], { ...query, includeContent: true });
  assert.equal(large.records[0].content.attributes["input.value"].length, 32768);
  assert.ok(large.issues.includes("truncated_record"));
});

test("missing parents and cyclic input cannot hang tree construction", () => {
  const second = "234567890abcdef1", third = "34567890abcdef12";
  const result = normalizeSpans([
    row({ parent_span_id: second }), row({ span_id: second, parent_span_id: spanId }),
    row({ span_id: third, parent_span_id: "4567890abcdef123" }),
    row({ trace_id: "2234567890abcdef1234567890abcdef", parent_span_id: third })
  ], query);
  assert.equal(result.records.filter((span) => span.parent === "cycle").length, 2);
  assert.equal(result.records.filter((span) => span.parent === "missing").length, 2);
  assert.ok(result.issues.includes("cyclic_parent"));
});

test("oversized content, missing ends and invalid timing stay visible as partial evidence", () => {
  const result = normalizeSpans([row({ name: "x".repeat(300), end_time_unix_nano: "1", "event:event_name:200": "over limit" })], { ...query, includeContent: true });
  assert.equal(result.records[0].name.length, 256);
  assert.equal(result.records[0].durationNano, null);
  assert.ok(result.issues.includes("truncated_record"));
  assert.ok(result.issues.includes("invalid_timing"));
});

test("logs preserve repeated lines and exact timestamps, and hide bodies without permission", () => {
  const hidden = normalizeLogs([log(), log()], query);
  assert.equal(hidden.records.length, 2);
  assert.notEqual(hidden.records[0].id, hidden.records[1].id);
  assert.equal(hidden.records[0].time, "2026-11-09T10:00:00.123456789Z");
  assert.equal(JSON.stringify(hidden).includes("SECRET"), false);
  const visible = normalizeLogs([log({ _msg: "x".repeat(20_000) })], { ...query, includeContent: true });
  assert.equal(visible.records[0].content.body?.length, 16_384);
  assert.ok(visible.issues.includes("truncated_record"));
  assert.equal(normalizeLogs([log({ "harakiri.org.id": "org_b" }), log({ _time: "tomorrow" })], query).rejectedRecords, 2);
});

const response = (records: unknown[]) => new Response(records.map((value) => JSON.stringify(value)).join("\n"), {
  headers: { AccountID: "13", ProjectID: "0" }
});
const store = (fetch: typeof globalThis.fetch) => createVictoriaTelemetryStore({ logsUrl: "http://logs:9428", tracesUrl: "http://traces:10428", fetch });

test("query adapter derives exact tenant/run filters and exposes limit and consistency", async () => {
  const adapter = store(async (url, init) => {
    assert.equal(String(url), "http://traces:10428/select/logsql/query");
    assert.equal(init?.redirect, "error");
    assert.deepEqual(init?.headers, { AccountID: "13", ProjectID: "0", "Content-Type": "application/x-www-form-urlencoded" });
    const body = init?.body as URLSearchParams;
    assert.match(body.get("query")!, /"resource_attr:harakiri.org.id":="org_a" AND "resource_attr:harakiri.run.id":="run_a"/);
    assert.match(body.get("query")!, /sort by \(_time, trace_id, span_id\) limit 2$/);
    assert.equal(body.get("allow_partial_response"), "0");
    return response([row(), row()]);
  });
  const snapshot = await adapter.spans({ ...query, limit: 1 });
  assert.equal(snapshot.partial, true);
  assert.ok(snapshot.issues.includes("record_limit"));
  assert.equal(snapshot.scannedRecords, 1);
  assert.equal(snapshot.consistency, "eventual");
});

test("invalid query bounds and injectable identifiers are rejected before I/O", async () => {
  const adapter = store(async () => { assert.fail("No request expected"); });
  for (const overrides of [{ tenantId: 0 }, { runId: 'run_a" OR *' }, { organizationId: "x\n*" },
    { limit: 1001 }, { limit: 0 }, { from: "now-1h" }, { to: query.from }, { spanId }, { traceId: "bad" }, { includeContent: undefined }]) {
    await assert.rejects(adapter.spans({ ...query, ...overrides } as TelemetryQuery), { code: "telemetry_query_invalid" });
  }
});

test("storage failures, partial JSON and tenant response mismatches fail closed without diagnostic leakage", async () => {
  for (const fetch of [
    async () => new Response("SECRET", { status: 502 }),
    async () => new Response("{}", { headers: { AccountID: "99", ProjectID: "0" } }),
    async () => new Response('{"secret":', { headers: { AccountID: "13", ProjectID: "0" } }),
    async () => response([{ value: { secret: "SECRET" } }]),
    async () => { throw new Error("SECRET connection data"); }
  ]) {
    await assert.rejects(store(fetch).spans(query), (error: Error) => error.message === "telemetry_query_unavailable");
  }
});

test("query adapter bounds both lines and rows and cancels oversized responses", async () => {
  await assert.rejects(store(async () => response([row({ name: "x".repeat(1024 * 1024) })])).spans(query), { code: "telemetry_query_limit_exceeded" });
  await assert.rejects(store(async () => response([row(), row(), row()])).spans({ ...query, limit: 1 }), { code: "telemetry_query_limit_exceeded" });
});

test("query configuration refuses credentials, paths and non-HTTP storage destinations", () => {
  for (const url of ["file:///tmp/data", "https://user:password@storage", "https://storage/query", "https://storage/?token=secret"]) {
    assert.throws(() => createVictoriaTelemetryStore({ logsUrl: url, tracesUrl: "http://traces" }));
  }
});
