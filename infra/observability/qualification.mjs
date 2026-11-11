import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { context, trace, SpanStatusCode } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { TracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace";
import { LoggerProvider, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { OTLPTraceExporter as JsonTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPTraceExporter as ProtoTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { OTLPLogExporter as JsonLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPLogExporter as ProtoLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { isolatedStack, until } from "./docker.mjs";
import { qualificationGateway } from "./gateway.mjs";
import { createVictoriaTelemetryStore } from "../../apps/api/src/services/observability/victoria.ts";
import { privatePostgres } from "./postgres-cluster.mjs";
import { frameworkSnapshotReady } from "./framework-signals.mjs";

const canary = "SECRET_CANARY_MUST_NOT_PERSIST";
const traceId = "1234567890abcdef1234567890abcdef";
const rootSpanId = "1234567890abcdef";

function headers(stack, tenant, capture = "metadata") {
  return {
    Authorization: `Bearer ${stack.gateway.issue(tenant, capture)}`,
    "x-harakiri-tenant": "999", "x-harakiri-org": "forged",
    "x-harakiri-run": "run_other", "x-harakiri-sandbox": "sbx_other", "x-harakiri-capture": "content"
  };
}

async function emit(stack, tenant, encoding, capture = "metadata", ageSeconds = 0, attributes = {}) {
  const resource = resourceFromAttributes({
    "service.name": "qualification", "secret": canary, "harakiri.org.id": "forged",
    "harakiri.run.id": "run_other", "harakiri.source": "control-plane"
  });
  const exporterOptions = { headers: headers(stack, tenant, capture), timeoutMillis: 3000 };
  const TraceExporter = encoding === "json" ? JsonTraceExporter : ProtoTraceExporter;
  const LogExporter = encoding === "json" ? JsonLogExporter : ProtoLogExporter;
  const provider = new TracerProvider({ resource,
    idGenerator: { generateTraceId: () => traceId, generateSpanId: () => "345678901abcdef2" },
    spanProcessors: [new SimpleSpanProcessor({
    exporter: new TraceExporter({ ...exporterOptions, url: `${stack.gateway.url}/v1/traces` })
  })] });
  const logger = new LoggerProvider({ resource, processors: [new SimpleLogRecordProcessor({
    exporter: new LogExporter({ ...exporterOptions, url: `${stack.gateway.url}/v1/logs` })
  })] });
  const parent = trace.setSpanContext(context.active(), { traceId, spanId: rootSpanId, traceFlags: 1 });
  try {
    const tracer = provider.getTracer("qualification", "1", { secret: canary });
    const started = Math.floor(Date.now() / 1000) - ageSeconds;
    const span = tracer.startSpan(`tool.${tenant}`, {
      startTime: [started, 123456789],
      attributes: { "gen_ai.operation.name": "execute_tool", "gen_ai.tool.name": "shell",
        "gen_ai.input.messages": canary, "gen_ai.system_instructions": canary, "gen_ai.tool.definitions": canary,
        "input.value": canary, "output.value": canary,
        "api_key": canary, "harakiri.command.id": "cmd_qualification", ...attributes },
      links: [{ context: { traceId, spanId: "234567890abcdef1", traceFlags: 1 }, attributes: { secret: canary } }]
    }, parent);
    assert.equal(span.isRecording(), true, "Official SDK must record the qualification span");
    span.addEvent("exception", { "exception.message": canary }, [started, 150000001]);
    span.setStatus({ code: SpanStatusCode.ERROR, message: canary });
    logger.getLogger("qualification").emit({
      context: trace.setSpan(parent, span), severityNumber: 17, severityText: "ERROR",
      timestamp: [started, 150000001],
      body: { message: canary, utf8: "caf\u00e9", "harakiri.run.id": "run_forbidden", trace_id: "spoofed" },
      attributes: { "api_key": canary, "harakiri.command.id": "cmd_qualification" }
    });
    span.end([started, 223456790]);
    await provider.forceFlush();
    await logger.forceFlush();
    return span.spanContext();
  } finally {
    await provider.shutdown();
    await logger.shutdown();
  }
}

async function query(stack, signal, tenant, filter = "*") {
  const url = new URL("/select/logsql/query", stack.url(signal));
  url.searchParams.set("query", `${filter} | limit 100`);
  const response = await fetch(url, {
    headers: { AccountID: String(tenant), ProjectID: "0" }, signal: AbortSignal.timeout(5000)
  });
  assert.equal(response.status, 200);
  return (await response.text()).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

async function contains(directory, secret) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory() ? await contains(file, secret) : (await readFile(file)).includes(secret)) return true;
  }
  return false;
}

const stack = await isolatedStack({ externalExport: true });
const evidence = [];
const startedAt = new Date().toISOString();
async function gate(name, action) {
  const started = Date.now();
  await action();
  evidence.push({ name, elapsedMs: Date.now() - started });
  console.log(`PASS ${name}`);
}

try {
  await stack.start();
  stack.gateway = await qualificationGateway(stack);
  console.log(`Qualification time: ${new Date().toISOString()}; storage: ${(await fetch(`${stack.url("traces")}/health`)).headers.get("date")}`);
  await gate("unauthenticated-ingress-rejected", async () => {
    const result = await fetch(`${stack.url("collector")}/v1/traces`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer invalid" }, body: "{}"
    });
    assert.equal(result.status, 401);
    const grant = stack.gateway.issue(100);
    const direct = await fetch(`${stack.url("collector")}/v1/traces`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${grant}` }, body: "{}"
    });
    assert.equal(direct.status, 401, "Workload grants cannot bypass the gateway");
    stack.gateway.revoke(grant);
    for (const invalid of [grant, "hk_live_test", "invalid"]) {
      const revoked = await fetch(`${stack.gateway.url}/v1/traces`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${invalid}` }, body: "{}"
      });
      assert.equal(revoked.status, 401);
    }
  });
  await gate("official-json-and-protobuf-exporters", async () => {
    await emit(stack, 101, "json");
    await emit(stack, 102, "protobuf");
    for (const tenant of [101, 102]) {
      for (const signal of ["traces", "logs"]) {
        const records = await until(`${signal} tenant ${tenant} visible`, async () => {
          const records = await query(stack, signal, tenant);
          return records.length ? records : false;
        });
        const serialized = JSON.stringify(records);
        assert.ok(!serialized.includes(canary));
        assert.ok(!serialized.includes("forged"));
        assert.ok(!serialized.includes("control-plane"));
        assert.ok(serialized.includes(`run_${tenant}`));
        assert.ok(!serialized.includes(`run_${tenant === 101 ? 102 : 101}`));
        for (const record of records) {
          assert.ok(!record._stream.includes("run_"), "Run IDs must not create log streams");
          assert.ok(!record._stream.includes("sbx_"), "Sandbox IDs must not create log streams");
        }
        if (signal === "traces") {
          assert.ok(serialized.includes(traceId));
          assert.ok(serialized.includes(rootSpanId));
          assert.ok(serialized.includes("100000001"), "Nanosecond duration must round-trip exactly");
        }
      }
    }
    assert.deepEqual(await query(stack, "traces", 0), []);
    assert.deepEqual(await query(stack, "logs", 0), []);
    assert.deepEqual(await query(stack, "traces", 999), []);
    assert.deepEqual(await query(stack, "logs", 999), []);
  });
  await gate("external-otlp-fanout-after-privacy", async () => {
    const file = path.join(stack.directory, "forward", "received.jsonl");
    const exported = await until("forwarded logs and traces", async () => {
      const body = await readFile(file, "utf8").catch(() => "");
      return body.includes("resourceSpans") && body.includes("resourceLogs") ? body : false;
    });
    assert.ok(exported.includes("run_101") && exported.includes("run_102"));
    assert.ok(!exported.includes(canary));
    assert.ok(!exported.includes("forged"));
    assert.ok(!exported.includes("htg_") && !exported.includes(stack.token));
  });
  await gate("privacy-before-durable-queue-and-crash-recovery", async () => {
    await stack.stop("logs");
    await stack.stop("traces");
    await emit(stack, 103, "protobuf");
    await emit(stack, 104, "json");
    await until("queue files created", async () => {
      try { return (await readdir(path.join(stack.directory, "collector", "queue"))).length >= 2; }
      catch { return false; }
    });
    // Wait beyond the configured batch flush before killing the process.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    assert.equal(await contains(path.join(stack.directory, "collector"), canary), false);
    assert.equal(await contains(path.join(stack.directory, "collector"), stack.token), false);
    assert.equal(await contains(path.join(stack.directory, "collector"), "htg_"), false);
    await stack.restart("collector", { crash: true });
    await stack.gateway.close();
    stack.gateway = await qualificationGateway(stack);
    await stack.restart("logs");
    await stack.restart("traces");
    for (const tenant of [103, 104]) {
      for (const signal of ["traces", "logs"]) {
        await until(`durable ${signal} tenant ${tenant}`, async () => {
          try { return (await query(stack, signal, tenant)).length > 0; } catch { return false; }
        });
      }
    }
    assert.deepEqual(await query(stack, "traces", 0), []);
    assert.deepEqual(await query(stack, "logs", 0), []);
  });
  await gate("explicit-content-capture", async () => {
    await emit(stack, 105, "protobuf", "content");
    const records = await until("opted-in content", async () => {
      const records = await query(stack, "traces", 105);
      return records.length ? records : false;
    });
    assert.ok(JSON.stringify(records).includes(canary));
    assert.equal(records[0]["span_attr:input.value"], canary);
    assert.equal(records[0]["span_attr:output.value"], canary);
    assert.ok(JSON.stringify(records).includes("234567890abcdef1"));
    const logs = await until("structured log content", async () => {
      const records = await query(stack, "logs", 105);
      return records.length ? records : false;
    });
    assert.ok(JSON.stringify(logs).includes("caf\u00e9"));
    for (const log of logs) {
      assert.equal(log["harakiri.run.id"], "run_105");
      assert.equal(log.trace_id, traceId);
      assert.equal(JSON.parse(log._msg)["harakiri.run.id"], "run_forbidden");
    }
  });
  await gate("llm-content-bound-and-generation-metadata", async () => {
    await emit(stack, 119, "protobuf", "content", 0, {
      "gen_ai.operation.name": "chat", "gen_ai.input.messages": "x".repeat(40_000),
      "input.value": "y".repeat(40_000), "output.value": "z".repeat(40_000),
      "gen_ai.request.temperature": 0, "gen_ai.response.finish_reasons": '["stop"]',
      "gen_ai.usage.cache_read.input_tokens": 0, "harakiri.llm.first_token_ms": 125.5
    });
    const records = await until("bounded LLM content", async () => {
      const records = await query(stack, "traces", 119);
      return records.length ? records : false;
    });
    assert.equal(records[0]["span_attr:gen_ai.input.messages"].length, 32768);
    assert.equal(records[0]["span_attr:input.value"].length, 32768);
    assert.equal(records[0]["span_attr:output.value"].length, 32768);
    assert.equal(String(records[0]["span_attr:harakiri.content.truncated"]), "true");
    assert.equal(String(records[0]["span_attr:gen_ai.usage.cache_read.input_tokens"]), "0");
    assert.equal(records[0]["span_attr:gen_ai.response.finish_reasons"], '["stop"]');
    assert.equal(Number(records[0]["span_attr:harakiri.llm.first_token_ms"]), 125.5);
  });
  await gate("official-python-protobuf-exporter", async () => {
    await promisify(execFile)("uv", ["run", "--locked", "--project", fileURLToPath(new URL(".", import.meta.url)),
      "python", fileURLToPath(new URL("./python_export.py", import.meta.url))], {
      timeout: 60_000, env: { ...process.env, HARAKIRI_QUALIFICATION_ENDPOINT: stack.gateway.url, HARAKIRI_QUALIFICATION_TOKEN: stack.gateway.issue(106) }
    });
    for (const signal of ["traces", "logs"]) {
      const records = await until(`Python ${signal}`, async () => {
        const records = await query(stack, signal, 106);
        return records.length ? records : false;
      });
      assert.equal(JSON.stringify(records).includes("PYTHON_CANARY"), false);
      assert.ok(JSON.stringify(records).includes("run_106"));
    }
  });
  await gate("tenant-scoped-asynchronous-deletion", async () => {
    for (const signal of ["traces", "logs"]) {
      const url = new URL("/delete/run_task", stack.url(signal));
      url.searchParams.set("filter", "*");
      const headers = { AccountID: "101", ProjectID: "0" };
      const response = await fetch(url, { method: "POST", headers });
      assert.equal(response.status, 200);
      const { task_id: taskId } = await response.json();
      assert.ok(taskId);
      await until(`${signal} deletion task completed`, async () => {
        const active = await (await fetch(`${stack.url(signal)}/delete/active_tasks`, { headers })).json();
        return !active.some((task) => task.task_id === taskId);
      });
      const remaining = JSON.stringify(await query(stack, signal, 101));
      assert.ok(!remaining.includes("run_101"));
      assert.ok(JSON.stringify(await query(stack, signal, 102)).includes("run_102"));
    }
  });
  await gate("retention-rejects-expired-data", async () => {
    await emit(stack, 107, "protobuf", "metadata", 3 * 86400);
    for (const signal of ["traces", "logs"]) {
      await until(`${signal} old timestamp rejected`, async () => {
        const metrics = await (await fetch(`${stack.url(signal)}/metrics`)).text();
        return /(?:vt|vl)_rows_dropped_total\{reason="too_small_timestamp"\} [1-9]/.test(metrics);
      });
      assert.deepEqual(await query(stack, signal, 107), []);
    }
  });
  await gate("duplicate-and-late-delivery-characterized", async () => {
    await emit(stack, 108, "protobuf", "metadata", 5);
    await emit(stack, 108, "protobuf", "metadata", 10);
    const records = await until("both duplicate IDs stored", async () => {
      const records = await query(stack, "traces", 108);
      return records.length >= 2 ? records : false;
    });
    assert.equal(new Set(records.map((span) => span.span_id)).size, 1);
    assert.equal(new Set(records.map((span) => span.trace_id)).size, 1);
    // Victoria stores repeated IDs, so the query adapter must deduplicate them
    // and report conflicting deliveries. This is not an exactly-once backend.
  });
  await gate("normalized-query-isolation-and-privacy", async () => {
    const store = createVictoriaTelemetryStore({ logsUrl: stack.url("logs"), tracesUrl: stack.url("traces") });
    const queryFor = (tenant) => ({ tenantId: tenant, organizationId: `org_${tenant}`, runId: `run_${tenant}`,
      from: new Date(Date.now() - 3_600_000).toISOString(), to: new Date().toISOString(), limit: 100, includeContent: false });
    const hidden = await store.spans(queryFor(105));
    assert.equal(hidden.records.length, 1);
    assert.equal(hidden.records[0].content.state, "hidden");
    assert.equal(JSON.stringify(hidden).includes(canary), false);
    assert.equal(hidden.records[0].durationNano, "100000001");
    assert.equal(hidden.records[0].parent, "missing");
    assert.equal(hidden.partial, true, "An absent parent is visible as partial evidence");
    const visible = await store.spans({ ...queryFor(105), includeContent: true });
    assert.ok(JSON.stringify(visible).includes(canary));
    assert.equal(visible.records[0].content.events[0].name, "exception");
    assert.equal(visible.records[0].content.links[0].spanId, "234567890abcdef1");
    const logs = await store.logs(queryFor(105));
    assert.equal(logs.records.length, 1);
    assert.equal(logs.records[0].content.body, null);
    const visibleLogs = await store.logs({ ...queryFor(105), includeContent: true });
    assert.equal(JSON.parse(visibleLogs.records[0].content.body)["harakiri.run.id"], "run_forbidden");
    assert.equal(visibleLogs.records[0].sandboxId, "sbx_105");
    const collision = await store.spans({ ...queryFor(102), runId: "run_105", organizationId: "org_105" });
    assert.equal(collision.records.length, 0);
    const duplicate = await store.spans(queryFor(108));
    assert.equal(duplicate.records.length, 1);
    assert.equal(duplicate.records[0].deliveries, 2);
    assert.ok(duplicate.issues.includes("conflicting_span"));
    const limited = await store.spans({ ...queryFor(108), limit: 1 });
    assert.ok(limited.issues.includes("record_limit"));
  });
  await gate("typescript-deepagents-scoped-instrumentation", async () => {
    await promisify(execFile)("pnpm", ["exec", "node", "--import", "tsx", "export.ts"], {
      cwd: fileURLToPath(new URL("./frameworks/", import.meta.url)), timeout: 60_000,
      env: { ...process.env, HARAKIRI_QUALIFICATION_ENDPOINT: stack.gateway.url,
        HARAKIRI_QUALIFICATION_TOKEN_A: stack.gateway.issue(112), HARAKIRI_QUALIFICATION_TOKEN_B: stack.gateway.issue(113) }
    });
    const store = createVictoriaTelemetryStore({ logsUrl: stack.url("logs"), tracesUrl: stack.url("traces") });
    for (const [index, tenant] of [112, 113].entries()) {
      const result = await until(`Deep Agents tenant ${tenant}`, async () => {
        const result = await store.spans({ tenantId: tenant, organizationId: `org_${tenant}`, runId: `run_${tenant}`,
          includeContent: false, limit: 1000, from: new Date(Date.now() - 60_000).toISOString(), to: new Date().toISOString() });
        return frameworkSnapshotReady(result, `qualification-tenant-${index}`) ? result : false;
      });
      assert.equal(result.partial, false);
      assert.ok(result.records.some((span) => span.attributes["openinference.span.kind"] === "LLM"));
      assert.ok(result.records.some((span) => span.attributes["openinference.span.kind"] === "TOOL"));
      assert.ok(result.records.some((span) => Number(span.attributes["llm.token_count.prompt"]) > 0));
      assert.equal(result.records.some((span) => span.name === `qualification-tenant-${index === 0 ? 1 : 0}` || span.name === "qualification-unrelated"), false);
      assert.equal(JSON.stringify(result).includes("FRAMEWORK_PRIVATE_CONTENT"), false);
    }
  });
  await gate("python-deepagents-scoped-instrumentation", async () => {
    await promisify(execFile)("uv", ["run", "--locked", "--project", fileURLToPath(new URL(".", import.meta.url)),
      "python", fileURLToPath(new URL("./python_framework.py", import.meta.url))], {
      timeout: 60_000, env: { ...process.env, HARAKIRI_QUALIFICATION_ENDPOINT: stack.gateway.url,
        HARAKIRI_QUALIFICATION_TOKEN_A: stack.gateway.issue(114), HARAKIRI_QUALIFICATION_TOKEN_B: stack.gateway.issue(115) }
    });
    const store = createVictoriaTelemetryStore({ logsUrl: stack.url("logs"), tracesUrl: stack.url("traces") });
    for (const [marker, tenant] of [["a", 114], ["b", 115]]) {
      const result = await until(`Python Deep Agents tenant ${tenant}`, async () => {
        const result = await store.spans({ tenantId: tenant, organizationId: `org_${tenant}`, runId: `run_${tenant}`,
          includeContent: false, limit: 1000, from: new Date(Date.now() - 60_000).toISOString(), to: new Date().toISOString() });
        return frameworkSnapshotReady(result, `qualification-python-${marker}`) ? result : false;
      });
      assert.equal(result.partial, false);
      assert.ok(result.records.some((span) => span.attributes["openinference.span.kind"] === "LLM"));
      assert.ok(result.records.some((span) => span.attributes["openinference.span.kind"] === "TOOL"));
      assert.equal(JSON.stringify(result).includes("PYTHON_FRAMEWORK_PRIVATE_CONTENT"), false);
    }
  });
  await gate("persisted-public-api-round-trip", async () => {
    const database = privatePostgres();
    try {
      // A private cwd prevents the application's normal .env loader from reading
      // developer configuration. Only these generated test settings are passed.
      await promisify(execFile)(process.execPath, ["--import", import.meta.resolve("tsx"), fileURLToPath(new URL("./application-qualification.mjs", import.meta.url))], {
        cwd: database.directory, timeout: 90_000,
        env: {
          PATH: process.env.PATH, HOME: process.env.HOME,
          DATABASE_URL: database.url, AUTH_DEV_ALLOW: "0", RUNTIME_PROVIDER: "dev",
          OBSERVABILITY_ENABLED: "1", OBSERVABILITY_ALLOW_CONTENT: "1", OBSERVABILITY_RETENTION_DAYS: "1",
          OBSERVABILITY_COLLECTOR_URL: stack.url("collector"), OBSERVABILITY_COLLECTOR_TOKEN: stack.token,
          OBSERVABILITY_LOGS_URL: stack.url("logs"), OBSERVABILITY_TRACES_URL: stack.url("traces")
        }
      });
    } finally { database.close(); }
  });
} catch (error) {
  for (const signal of ["traces", "logs"]) {
    try {
      const metrics = await (await fetch(`${stack.url(signal)}/metrics`)).text();
      console.error(`${signal}: ${metrics.split("\n").filter((line) => /^(vt|vl)_.*(insert|drop|row|parse|tenant)/.test(line)).join("\n")}`);
      for (const tenant of [0, 101, 102, 105, 999]) {
        const records = await query(stack, signal, tenant);
        console.error(`${signal} tenant ${tenant}: ${records.length} records; fields: ${Object.keys(records[0] ?? {}).join(",")}`);
      }
    } catch { /* Private disposable fixtures contain no real workload data. */ }
  }
  try {
    const metrics = await (await fetch(`${stack.containers.get("collector").metrics}/metrics`)).text();
    console.error(metrics.split("\n").filter((line) => /^otelcol_.*(accepted|refused|outgoing|incoming|failed|sent)/.test(line)).join("\n"));
  } catch { /* Diagnostics must not mask the qualification failure. */ }
  for (const name of stack.containers.keys()) {
    try { console.error(`${name}: ${await stack.logs(name)}`); } catch { /* Original failure is primary. */ }
  }
  throw error;
} finally {
  try { await stack.gateway?.close(); } finally { await stack.cleanup(); }
}
const receipt = {
  kind: "collector-qualification", status: "passed", startedAt, finishedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, architecture: process.arch },
  images: stack.images, evidence, ownedResourcesRemoved: true
};
if (process.env.HARAKIRI_QUALIFICATION_RECEIPT) {
  const file = path.resolve(process.env.HARAKIRI_QUALIFICATION_RECEIPT);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
}
console.log(JSON.stringify(receipt, null, 2));
