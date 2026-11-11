import assert from "node:assert/strict";
import test from "node:test";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage } from "@langchain/core/messages";
import { trace } from "@opentelemetry/api";
import { TracerProvider, SimpleSpanProcessor, InMemorySpanExporter } from "@opentelemetry/sdk-trace";
import { LoggerProvider } from "@opentelemetry/sdk-logs";
import type { RunTelemetry } from "@h-sandbox/sdk/telemetry";
import { expectedReport, orders, runOrdersAgent } from "./orders-agent.js";
import { traceMessages } from "./trace-messages.js";

class ScriptedModel extends BaseChatModel {
  constructor(private readonly decisions: AIMessage[]) { super({}); }
  _llmType() { return "deterministic-recipe-test"; }
  bindTools() { return this; }
  async _generate() {
    const message = this.decisions.shift();
    assert.ok(message, "Unexpected extra model call");
    return { generations: [{ text: "", message }] };
  }
}

test("installed public recipe traces actual framework callbacks without replacing global OTel", async () => {
  const original = trace.getTracerProvider();
  const exporter = new InMemorySpanExporter();
  const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] });
  const logs = new LoggerProvider();
  const telemetry: RunTelemetry = { capture: "content", tracerProvider: provider, tracer: provider.getTracer("test"),
    logger: logs.getLogger("test"), forceFlush: () => provider.forceFlush(), shutdown: () => provider.shutdown() };
  const usage = { input_tokens: 12, output_tokens: 8, total_tokens: 20 };
  const model = new ScriptedModel([
    new AIMessage({ content: "", tool_calls: [{ name: "read_orders", args: {}, id: "read", type: "tool_call" }], usage_metadata: usage }),
    new AIMessage({ content: "", tool_calls: [{ name: "submit_report", args: expectedReport, id: "report", type: "tool_call" }], usage_metadata: usage }),
    new AIMessage({ content: "Verified", usage_metadata: usage })
  ]);
  let saved;
  try {
    const result = await runOrdersAgent({ model, telemetry, readOrders: async () => JSON.stringify(orders),
      submitReport: async report => { saved = report; return JSON.stringify({ verified: true }); } });
    assert.deepEqual(saved, expectedReport);
    assert.equal(result.inputTokens, 36);
    assert.equal(result.outputTokens, 24);
    assert.equal(trace.getTracerProvider(), original);
    const spans = exporter.getFinishedSpans();
    assert.equal(spans.filter(span => span.attributes["openinference.span.kind"] === "LLM").length, 3);
    assert.equal(spans.filter(span => span.attributes["openinference.span.kind"] === "TOOL").length, 2);
    const models = spans.filter(span => span.attributes["openinference.span.kind"] === "LLM");
    for (const span of models) {
      const input = traceMessages(String(span.attributes["input.value"]), "langchain-input");
      const output = traceMessages(String(span.attributes["output.value"]), "langchain-output");
      assert.ok(input?.some(message => message.role === "user"), "Actual instrumentor input must render as messages");
      assert.ok(output?.some(message => message.role === "assistant"), "Actual instrumentor output must render as messages");
    }
    assert.equal(new Set(spans.map(span => span.spanContext().traceId)).size, 1);
    await assert.rejects(runOrdersAgent({ model, telemetry, readOrders: async () => "", submitReport: async () => "" }), /already instrumented/);
  } finally { await provider.shutdown(); await logs.shutdown(); }
});
