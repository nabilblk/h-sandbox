import assert from "node:assert/strict";
import test from "node:test";
import { trace } from "@opentelemetry/api";
import { TracerProvider, SimpleSpanProcessor, InMemorySpanExporter } from "@opentelemetry/sdk-trace";
import { ScopedTracerProvider } from "./scoped-provider.js";
import { instrumentDeepAgents } from "./instrumentation.js";
import { canary, invoke } from "./deepagents-fixture.js";

// No external model or LangSmith request: this qualifies the real framework's
// callback/export behavior with deterministic model decisions, not inference.
process.env.LANGSMITH_TRACING = "false";
process.env.LANGCHAIN_TRACING_V2 = "false";
process.env.LANGCHAIN_CALLBACKS_BACKGROUND = "false";

test("maintained instrumentation scopes concurrent Deep Agents invocations without replacing globals", async () => {
  const originalProvider = trace.getTracerProvider();
  const instrumentation = instrumentDeepAgents();
  assert.throws(() => instrumentDeepAgents(), /already has OpenInference/);
  const { router } = instrumentation;
  const a = new InMemorySpanExporter(), b = new InMemorySpanExporter();
  const providerA = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter: a })] });
  const providerB = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter: b })] });
  try {
    await invoke("unrelated-before");
    assert.equal(a.getFinishedSpans().length + b.getFinishedSpans().length, 0);
    await Promise.all([router.run(providerA, () => invoke("a")), router.run(providerB, () => invoke("b"))]);
    await providerA.forceFlush();
    await providerB.forceFlush();
    for (const [own, other, exporter] of [["a", "b", a], ["b", "a", b]] as const) {
      const spans = exporter.getFinishedSpans();
      assert.ok(spans.some((span) => span.name === `qualification-${own}`), "The root agent invocation is traced");
      assert.ok(!spans.some((span) => span.name === `qualification-${other}`), "Concurrent runs stay separate");
      assert.ok(spans.some((span) => span.attributes["openinference.span.kind"] === "LLM"), "Model calls are traced");
      assert.ok(spans.some((span) => span.attributes["openinference.span.kind"] === "TOOL"), "Framework tools are traced");
      assert.ok(spans.some((span) => Number(span.attributes["llm.token_count.prompt"]) > 0), "Reported model usage is retained");
      assert.equal(new Set(spans.map((span) => span.spanContext().traceId)).size, 1, "Parent/child topology survives without global context setup");
      assert.equal(new Set(spans.map((span) => span.spanContext().spanId)).size, spans.length);
      assert.equal(JSON.stringify(spans.map((span) => ({ name: span.name, attributes: span.attributes, events: span.events }))).includes(canary), false);
    }
    const count = a.getFinishedSpans().length + b.getFinishedSpans().length;
    await invoke("unrelated-after");
    assert.equal(a.getFinishedSpans().length + b.getFinishedSpans().length, count);
    assert.equal(trace.getTracerProvider(), originalProvider);
  } finally {
    await instrumentation.shutdown();
    assert.throws(() => router.run(providerA, () => invoke("closed")), /closed/);
    await providerA.shutdown();
    await providerB.shutdown();
  }
});

test("unsafe callback scheduling is rejected rather than risking cross-run export", async () => {
  const provider = new TracerProvider();
  const router = new ScopedTracerProvider();
  process.env.LANGCHAIN_CALLBACKS_BACKGROUND = "true";
  try {
    assert.throws(() => instrumentDeepAgents(), /LANGCHAIN_CALLBACKS_BACKGROUND=false/);
    assert.throws(() => router.run(provider, () => assert.fail("Must not invoke the agent")), /LANGCHAIN_CALLBACKS_BACKGROUND=false/);
  } finally {
    process.env.LANGCHAIN_CALLBACKS_BACKGROUND = "false";
    await router.shutdown();
    await provider.shutdown();
  }
});
