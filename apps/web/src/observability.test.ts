import assert from "node:assert/strict";
import test from "node:test";
import { agentRunRoute, captureEvidence, defaultTelemetryWindow, durationLabel, formatTelemetryValue, logLevel, matchesLog, nextErrorSpan, observedUsage, runLocation, timelineBar, traceRange, traceRows, validTelemetryWindow } from "./observability.js";
import { routeFromHash } from "./routing.js";
import { workbenchLocation } from "./workbench.js";
import type { AgentRunRecord, TelemetryLog, TelemetrySpan } from "@harakiri/shared";

const span = (id: string, parent: string | null, start = "1794225600000000001"): TelemetrySpan => ({
  id: `${"a".repeat(32)}:${id}`, traceId: "a".repeat(32), spanId: id, parentSpanId: parent,
  parent: parent ? "present" : "root", sandboxId: "sbx_test", name: id, kind: 1, status: "ok",
  startTimeUnixNano: start, endTimeUnixNano: (BigInt(start) + 100_000_001n).toString(), durationNano: "100000001",
  serviceName: null, scopeName: null, scopeVersion: null, source: "workload", attributes: {}, deliveries: 1, issues: [],
  content: { state: "not_captured", attributes: {}, statusMessage: null, events: [], links: [] }
});

test("run deep links are strict and cannot carry tokens or ambiguous selection", () => {
  const step = `${"a".repeat(32)}:${"b".repeat(16)}`;
  for (const sandboxId of [undefined, "sbx_test"]) {
    const route = agentRunRoute("run_test", step, sandboxId);
    assert.equal(routeFromHash(`#${route}`), route);
    const parsed = sandboxId ? workbenchLocation(route) : runLocation(route);
    assert.equal(parsed?.run, "run_test"); assert.equal(parsed?.step, step);
  }
  for (const query of ["run=../test", "run=run_test&token=secret", "step=abc", "run=run_a&run=run_b", "run=run_a?step=b"]) {
    assert.equal(runLocation(`dashboard/runs?${query}`), null);
  }
  assert.equal(workbenchLocation("dashboard/sandboxes/sbx_test?tab=logs&run=run_test"), null);
});

test("tree hierarchy survives reordered deliveries, collapses branches and retains matching ancestors", () => {
  const a = span("0000000000000001", null), b = span("0000000000000002", a.spanId), c = span("0000000000000003", b.spanId);
  c.name = "failed test"; c.status = "error";
  assert.deepEqual(traceRows([c, b, a], new Set()).map((row) => row.depth), [0, 1, 2]);
  assert.equal(traceRows([c, b, a], new Set([a.id])).length, 1);
  assert.equal(traceRows([c, b, a], new Set([a.id]), "failed", true).length, 3);
  b.parent = "cycle"; c.parent = "missing";
  assert.equal(traceRows([c, b, a], new Set()).length, 3);
});

test("error navigation follows hierarchy order, wraps and handles no errors", () => {
  const root = span("0000000000000001", null), first = span("0000000000000002", root.spanId), last = span("0000000000000003", root.spanId);
  first.status = "error"; last.status = "error";
  const reordered = [last, first, root];
  assert.equal(traceRows(reordered, new Set())[0].span.id, root.id);
  assert.equal(nextErrorSpan(reordered)?.id, first.id);
  assert.equal(nextErrorSpan(reordered, first.id)?.id, last.id);
  assert.equal(nextErrorSpan(reordered, last.id)?.id, first.id);
  assert.equal(nextErrorSpan([root]), undefined);
});

test("log levels accept textual severity and fall back to OTel numeric severity", () => {
  for (const [severity, severityNumber, expected] of [
    ["ERROR", 9, "error"], ["fatal", null, "error"], ["WARNING", 9, "warning"],
    ["INFO", null, "info"], ["TRACE", null, "debug"], ["", 20, "error"],
    ["", 16, "warning"], ["", 12, "info"], ["", 1, "debug"],
    ["", 0, "other"], ["", 25, "other"], ["custom", null, "other"]
  ] as const) assert.equal(logLevel({ severity, severityNumber }), expected);
});

test("log filters search only authorized content and preserve metadata-only discovery", () => {
  const log: TelemetryLog = { id: "log_test", time: "2026-11-09T12:00:00Z", observedTimeUnixNano: null,
    sandboxId: "sbx_test", traceId: "a".repeat(32), spanId: "1".repeat(16), severity: "ERROR", severityNumber: 17,
    serviceName: "validation", source: "workload", attributes: {}, issues: [],
    content: { state: "available", body: "Private assertion detail", attributes: {} } };
  assert.equal(matchesLog(log, " ASSERTION ", "error", true), true);
  assert.equal(matchesLog(log, "assertion", "all", false), false);
  assert.equal(matchesLog(log, "validation", "all", false), true);
  assert.equal(matchesLog(log, "validation", "warning", true), false);
  log.content.state = "hidden";
  assert.equal(matchesLog(log, "assertion", "all", true), false);
});

test("structured content is formatted without losing plain, incomplete or hostile text", () => {
  assert.deepEqual(formatTelemetryValue('{"answer":42}'), { language: "json", text: '{\n  "answer": 42\n}' });
  assert.deepEqual(formatTelemetryValue('[1,2]'), { language: "json", text: '[\n  1,\n  2\n]' });
  for (const value of ["null", '"hello"', "42", '{"partial":', '<script>alert(1)</script>']) {
    assert.deepEqual(formatTelemetryValue(value), { language: "text", text: value });
  }
});

test("custom investigation windows survive both routes and reject ambiguous or invalid dates", () => {
  const window = { from: "2026-11-09T12:00:00.000Z", to: "2026-11-09T12:05:00.000Z" };
  for (const sandboxId of [undefined, "sbx_test"]) {
    const route = agentRunRoute("run_test", undefined, sandboxId, window);
    assert.equal(routeFromHash(`#${route}`), route);
    assert.deepEqual((sandboxId ? workbenchLocation(route) : runLocation(route))?.window, window);
    assert.equal(runLocation(`dashboard/runs?run=run_test&from=${window.from}`), null);
  }
  for (const [from, to] of [[window.to, window.from], [window.from, window.from],
    ["2026-02-31T12:00:00.000Z", window.to], [window.from, "2027-01-01T12:00:00.000Z"]]) {
    assert.equal(validTelemetryWindow(from, to), false);
  }
  assert.equal(runLocation(`dashboard/runs?from=${window.from}&to=${window.to}`), null);
  assert.equal(runLocation(`dashboard/runs?run=run_test&from=${window.from}&from=${window.from}&to=${window.to}`), null);
});

test("timeline uses relative integer nanoseconds and unknown timing is never zero", () => {
  const a = span("1", null), b = span("2", null, "1794225600100000002");
  const range = traceRange([a, b]);
  assert.equal(range.duration, 200_000_002n);
  assert.deepEqual(timelineBar(a, range), { left: 0, width: 50 });
  assert.equal(durationLabel(null), "Unknown");
  assert.equal(durationLabel("0"), "0.00 ms");
  assert.equal(range.observedDuration, 200_000_002n);
  assert.equal(range.partial, false);
  assert.equal(traceRange([]).observedDuration, null);
  b.endTimeUnixNano = null; b.durationNano = null;
  assert.equal(traceRange([b]).observedDuration, null);
  assert.equal(traceRange([a, b]).partial, true);
  a.endTimeUnixNano = a.startTimeUnixNano; a.durationNano = "0";
  assert.equal(traceRange([a]).observedDuration, 0n);
  assert.equal(traceRange([a]).duration, 1n);
});

test("relative windows refer to now while a retained run window stays bounded to recording", () => {
  const created = "2026-11-01T12:00:00.000Z", now = Date.parse("2026-11-09T12:00:00.000Z");
  assert.deepEqual(defaultTelemetryWindow(created, "run", now), {
    from: "2026-11-01T11:55:00.000Z", to: "2026-11-02T12:05:00.000Z"
  });
  assert.deepEqual(defaultTelemetryWindow(created, "15m", now), {
    from: "2026-11-09T11:45:01.000Z", to: "2026-11-09T12:00:01.000Z"
  });
  assert.equal(defaultTelemetryWindow(created, "1h", now).from, "2026-11-09T11:00:01.000Z");
});

test("acknowledgement and stale evidence never imply instrumentation completeness", () => {
  const run = { expired: false, recording: true, lastAcceptedAt: null, lastRejectedAt: null } as AgentRunRecord;
  assert.equal(captureEvidence(run), "Awaiting telemetry");
  run.lastAcceptedAt = "2026-11-09T12:00:00Z";
  assert.equal(captureEvidence(run, Date.parse("2026-11-09T12:00:01Z")), "Collector acknowledged");
  assert.equal(captureEvidence(run, Date.parse("2026-11-09T12:03:00Z")), "No recent telemetry");
  run.expired = true;
  assert.equal(captureEvidence(run), "Expired");
});

test("usage counts leaf model calls once and distinguishes absent, zero and partial counters", () => {
  const outer = span("1", null), tool = span("2", "1"), inner = span("3", "2"), retry = span("4", null);
  outer.attributes = { "openinference.span.kind": "LLM", "llm.token_count.prompt": "1000", "llm.token_count.completion": "1000" };
  tool.attributes = { "openinference.span.kind": "TOOL" };
  inner.attributes = { "gen_ai.operation.name": "chat", "gen_ai.request.model": "fixture", "gen_ai.usage.input_tokens": "12", "gen_ai.usage.output_tokens": "0", "llm.token_count.prompt": "12" };
  retry.attributes = { "openinference.span.kind": "LLM", "llm.token_count.prompt": "8" };
  inner.deliveries = 2;
  const usage = observedUsage([outer, tool, inner, retry]);
  assert.deepEqual(usage, { calls: 2, names: ["fixture"], input: 20n, output: 0n, partial: true });
  assert.equal(observedUsage([]).input, null);
  assert.equal(observedUsage([inner], true).partial, true);
  inner.attributes["gen_ai.usage.input_tokens"] = "-1";
  assert.equal(observedUsage([inner]).input, null);
});
