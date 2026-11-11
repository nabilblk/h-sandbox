import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { context, propagation, trace } from "@opentelemetry/api";
import { HarakiriClient, HarakiriTelemetryGrant } from "./index.js";
import { withAgentRun, createRunTracerProvider, createRunTelemetry, observeRecordedProcess } from "./telemetry.js";
import type { SandboxCommandSummary } from "./protocol.js";

function fixture(fail?: string) {
  const calls: string[] = [];
  const outcomes: string[] = [];
  const client = new HarakiriClient({ apiUrl: "https://sandbox.test", apiKey: "fixture", fetch: async (url, init) => {
    const pathname = new URL(String(url)).pathname;
    const operation = init?.method === "DELETE" ? "revoke" : pathname.split("/").at(-1)!;
    calls.push(operation);
    if (operation === fail) return Response.json({ error: "unavailable" }, { status: 503 });
    if (operation === "close") outcomes.push(JSON.parse(String(init?.body)).outcome);
    if (operation === "grants") return Response.json({ id: "grant_test", token: "htg_PRIVATE", capture: "metadata", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    return Response.json({ run: { id: "run_test", capture: "metadata" } });
  } });
  const runtime = {
    async forceFlush() { calls.push("flush"); },
    async shutdown() { calls.push("shutdown"); }
  };
  return { client, calls, outcomes, runtime };
}

test("owned run lifecycle flushes before close/revoke and never operates on the sandbox", async () => {
  const { client, runtime, calls, outcomes } = fixture();
  const result = await withAgentRun(client, { name: "Agent", sandboxId: "sbx_test", runtime: () => runtime, ownership: "owned" }, async ({ run }) => {
    assert.equal(run.id, "run_test"); calls.push("work"); return 42;
  });
  assert.equal(result, 42);
  assert.deepEqual(calls, ["agent-runs", "grants", "work", "flush", "shutdown", "close", "revoke"]);
  assert.deepEqual(outcomes, ["succeeded"]);
});

test("borrowed runtime is not shut down; an original command recovery error survives every cleanup failure", async () => {
  const { client, calls, outcomes } = fixture("revoke");
  const original = Object.assign(new Error("Observation interrupted"), { reference: { sandboxId: "sbx_test", commandId: "cmd_test" } });
  const diagnostics: string[] = [];
  await assert.rejects(withAgentRun(client, {
    name: "Agent", sandboxId: "sbx_test",
    runtime: () => ({ async forceFlush() { throw new Error("PRIVATE exporter error"); }, async shutdown() { assert.fail("borrowed"); } }),
    onDiagnostic: ({ code }) => { diagnostics.push(code); throw new Error("observer failure"); }
  }, async () => { throw original; }), (error: unknown) => error === original);
  assert.deepEqual(outcomes, ["failed"]);
  assert.deepEqual(diagnostics, ["flush_failed", "revoke_failed"]);
  assert.ok(calls.includes("close"));
});

test("abort preserves its reason and uses fresh cleanup requests", async () => {
  const { client, runtime, calls, outcomes } = fixture();
  const controller = new AbortController();
  const reason = new Error("interrupted");
  await assert.rejects(withAgentRun(client, { name: "Agent", sandboxId: "sbx_test", signal: controller.signal,
    runtime: () => runtime }, async () => { controller.abort(reason); throw reason; }), (error: unknown) => error === reason);
  assert.deepEqual(outcomes, ["cancelled"]);
  assert.deepEqual(calls.slice(-3), ["flush", "close", "revoke"]);
});

test("failed setup closes the created run, revokes acquired grants and does not invoke work", async () => {
  for (const fail of ["grants", "factory"]) {
    const { client, calls, outcomes } = fixture(fail);
    await assert.rejects(withAgentRun(client, { name: "Agent", sandboxId: "sbx_test",
      runtime: () => { throw new Error("factory"); } }, async () => assert.fail("work must not start")));
    assert.deepEqual(outcomes, ["failed"]);
    assert.equal(calls.includes("revoke"), fail === "factory");
  }
});

test("hung cleanup is bounded, all later stages still run, and success is not replaced", async () => {
  const { client, calls } = fixture();
  const diagnostics: string[] = [];
  const start = Date.now();
  assert.equal(await withAgentRun(client, { name: "Agent", sandboxId: "sbx_test", ownership: "owned", cleanupTimeoutMs: 10,
    runtime: () => ({ forceFlush: () => new Promise(() => {}), shutdown: () => new Promise(() => {}) }),
    onDiagnostic: ({ code }) => diagnostics.push(code)
  }, async () => "done"), "done");
  assert.ok(Date.now() - start < 1_000);
  assert.deepEqual(diagnostics, ["flush_failed", "shutdown_failed"]);
  assert.deepEqual(calls.slice(-2), ["close", "revoke"]);
});

test("invalid budgets and already aborted work create no run", async () => {
  const { client, calls, runtime } = fixture();
  for (const cleanupTimeoutMs of [0, -1, NaN, 30_001]) {
    await assert.rejects(withAgentRun(client, { name: "Agent", sandboxId: "sbx_test", cleanupTimeoutMs, runtime: () => runtime }, async () => {}), RangeError);
  }
  await assert.rejects(withAgentRun(client, { name: "Agent", sandboxId: "sbx_test", signal: AbortSignal.abort(), runtime: () => runtime }, async () => {}));
  assert.equal(calls.length, 0);
});

test("official exporter emits only explicit provider spans without changing global tracing", async () => {
  const payloads: Buffer[] = [];
  const server = createServer(async (request, response) => {
    assert.equal(request.url, "/v1/telemetry/traces");
    assert.equal(request.headers.authorization, "Bearer htg_PRIVATE");
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    payloads.push(Buffer.concat(chunks)); response.setHeader("Content-Type", "application/x-protobuf"); response.end();
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address === "object");
  const grant = new HarakiriTelemetryGrant({ id: "grant_test", token: "htg_PRIVATE", capture: "metadata",
    expiresAt: new Date(Date.now() + 60_000).toISOString() }, `http://127.0.0.1:${address.port}`);
  const previous = trace.getTracerProvider(); const previousContext = context.active(); const fields = propagation.fields();
  const provider = createRunTracerProvider(grant, "test-service");
  try {
    const span = provider.getTracer("test").startSpan("explicit-work", { attributes: {
      "gen_ai.usage.input_tokens": 23, "gen_ai.input.messages": "PRIVATE_PROMPT", "api.key": "PRIVATE_KEY"
    } });
    span.setStatus({ code: 2, message: "PRIVATE_EXCEPTION" });
    span.addEvent("PRIVATE_EVENT");
    span.end();
    trace.getTracer("unrelated").startSpan("unrelated-work").end();
    await provider.forceFlush();
    assert.equal(payloads.length, 1);
    assert.ok(payloads[0].includes(Buffer.from("explicit-work")));
    assert.ok(!payloads[0].includes(Buffer.from("unrelated-work")));
    assert.ok(!payloads[0].includes(Buffer.from("htg_PRIVATE")));
    for (const secret of ["PRIVATE_PROMPT", "PRIVATE_KEY", "PRIVATE_EXCEPTION", "PRIVATE_EVENT"]) {
      assert.ok(!payloads[0].includes(Buffer.from(secret)), secret);
    }
    assert.ok(payloads[0].includes(Buffer.from("gen_ai.usage.input_tokens")));
    assert.equal(trace.getTracerProvider(), previous);
    assert.equal(context.active(), previousContext);
    assert.deepEqual(propagation.fields(), fields);
  } finally { await provider.shutdown(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("command observation correlates retained output, respects capture and preserves recovery failures", async () => {
  for (const capture of ["metadata", "content"] as const) {
    const payloads: { path: string; body: Buffer }[] = [];
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      payloads.push({ path: request.url!, body: Buffer.concat(chunks) });
      response.setHeader("Content-Type", "application/x-protobuf"); response.end();
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); assert.ok(address && typeof address === "object");
    const grant = new HarakiriTelemetryGrant({ id: "grant_test", token: "htg_PRIVATE", capture,
      expiresAt: new Date(Date.now() + 60_000).toISOString() }, `http://127.0.0.1:${address.port}`);
    const telemetry = createRunTelemetry(grant);
    const reference = { sandboxId: "sbx_test", commandId: "cmd_test" };
    const interrupted = Object.assign(new Error("PRIVATE exception"), { reference });
    let reads = 0;
    const process = { id: reference.commandId,
      wait: async (): Promise<SandboxCommandSummary> => { throw interrupted; },
      logs: async () => { reads++; return { commandId: reference.commandId, stdout: "PRIVATE output", stderr: "", stdoutTruncated: true }; }
    };
    try {
      await assert.rejects(observeRecordedProcess(process, telemetry, { includeOutput: true }), (error: unknown) => error === interrupted);
      telemetry.logger.emit({ body: "PRIVATE manual log", attributes: { "api.key": "PRIVATE_KEY" } });
      await telemetry.forceFlush();
      assert.equal(reads, capture === "content" ? 1 : 0);
      const spans = payloads.filter((item) => item.path.endsWith("traces"));
      const logs = payloads.filter((item) => item.path.endsWith("logs"));
      assert.equal(spans.length, 1);
      assert.ok(spans[0].body.includes(Buffer.from("cmd_test")));
      assert.ok(!spans[0].body.includes(Buffer.from("PRIVATE exception")));
      assert.equal(logs.length, 1);
      assert.equal(logs[0].body.includes(Buffer.from("PRIVATE output")), capture === "content");
      assert.equal(logs[0].body.includes(Buffer.from("[output truncated]")), capture === "content");
      assert.equal(logs[0].body.includes(Buffer.from("PRIVATE manual log")), capture === "content");
      assert.ok(!logs[0].body.includes(Buffer.from("PRIVATE_KEY")));
    } finally { await telemetry.shutdown(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  }
});

test("large model messages are clipped before batching and normal multi-call exports fit the ingress limit", async () => {
  const payloads: Buffer[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    payloads.push(Buffer.concat(chunks));
    response.setHeader("Content-Type", "application/x-protobuf"); response.end();
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address === "object");
  const grant = new HarakiriTelemetryGrant({ id: "grant_test", token: "htg_PRIVATE", capture: "content",
    expiresAt: new Date(Date.now() + 60_000).toISOString() }, `http://127.0.0.1:${address.port}`);
  const provider = createRunTracerProvider(grant);
  try {
    for (let i = 0; i < 32; i++) provider.getTracer("test").startSpan("Model call", { attributes: {
      "gen_ai.input.messages": "a".repeat(20_000), "gen_ai.output.messages": "b".repeat(20_000)
    } }).end();
    await provider.forceFlush();
    assert.ok(payloads.length >= 4);
    assert.ok(payloads.every((body) => body.length < 1024 * 1024));
    assert.ok(payloads.every((body) => !body.includes(Buffer.from("a".repeat(8193)))));
  } finally { await provider.shutdown(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("final flush waits for an already exporting batch before the run can revoke its grant", async () => {
  let received = 0;
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* drain the request */ }
    await new Promise((resolve) => setTimeout(resolve, 80));
    received++;
    response.setHeader("Content-Type", "application/x-protobuf"); response.end();
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address === "object");
  const grant = new HarakiriTelemetryGrant({ id: "grant_test", token: "htg_PRIVATE", capture: "metadata",
    expiresAt: new Date(Date.now() + 60_000).toISOString() }, `http://127.0.0.1:${address.port}`);
  const runtime = createRunTelemetry(grant);
  try {
    for (let i = 0; i < 8; i++) {
      runtime.tracer.startSpan("work").end();
      runtime.logger.emit({ body: "PRIVATE", severityText: "INFO", severityNumber: 9 });
    }
    await runtime.forceFlush();
    assert.equal(received, 2);
  } finally { await runtime.shutdown(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});
