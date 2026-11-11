import assert from "node:assert/strict";
import test from "node:test";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import type { ChatGeneration } from "@langchain/core/outputs";
import { createAgent, tool } from "langchain";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { TracerProvider, SimpleSpanProcessor, InMemorySpanExporter } from "@opentelemetry/sdk-trace";
import { LangChainTrace, chatMessage } from "./langchain-trace.js";

process.env.LANGSMITH_TRACING = "false";
process.env.LANGCHAIN_TRACING_V2 = "false";
process.env.LANGCHAIN_CALLBACKS_BACKGROUND = "false";
const privateText = "PRIVATE_PROMPT_AND_TOOL_RESULT";
const serialized = { lc: 1 as const, type: "not_implemented" as const, id: ["test-model"] };

function recording(captureContent: boolean) {
  const exporter = new InMemorySpanExporter();
  const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] });
  return { provider, exporter, callback: new LangChainTrace(provider.getTracer("recipe-test"), { provider: "test", model: "scripted", captureContent }) };
}

// Deterministic regression test only. Real inference is a separate opt-in qualification.
class ScriptedModel extends BaseChatModel {
  private index = 0;
  _llmType() { return "recipe-test"; }
  bindTools() { return this; }
  async _generate() {
    const message = this.index++ === 0
      ? new AIMessage({ content: "", tool_calls: [{ id: "call_1", name: "read", args: {}, type: "tool_call" }],
        response_metadata: { finish_reason: "tool_calls" }, usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } })
      : new AIMessage({ content: privateText, response_metadata: { finish_reason: "stop" },
        usage_metadata: { input_tokens: 20, output_tokens: 3, total_tokens: 23 } });
    return { generations: [{ message, text: "" }] };
  }
}

test("per-invocation callbacks capture real framework topology without globals or cross-run content", async () => {
  const globalProvider = trace.getTracerProvider();
  const content = recording(true), metadata = recording(false);
  try {
    await Promise.all([content, metadata].map(async ({ callback, provider }) => {
      const agent = createAgent({ model: new ScriptedModel({}), tools: [tool(async () => privateText, {
        name: "read", description: "Read synthetic data", schema: { type: "object", properties: {} }
      })] });
      await agent.invoke({ messages: [{ role: "user", content: privateText }] }, { callbacks: [callback], runName: "Controlled task" });
      callback.close(); await provider.forceFlush();
    }));
    for (const { exporter } of [content, metadata]) {
      const spans = exporter.getFinishedSpans();
      assert.equal(new Set(spans.map((span) => span.spanContext().traceId)).size, 1);
      assert.equal(spans.filter((span) => span.attributes["gen_ai.operation.name"] === "chat").length, 2);
      assert.equal(spans.filter((span) => span.attributes["gen_ai.tool.name"] === "read").length, 1);
      assert.ok(spans.every((span) => span.status.code === SpanStatusCode.OK));
    }
    const toolSpan = content.exporter.getFinishedSpans().find((span) => span.attributes["gen_ai.tool.name"] === "read")!;
    assert.equal(toolSpan.attributes["gen_ai.tool.call.id"], "call_1");
    assert.equal(toolSpan.attributes["gen_ai.tool.call.result"], privateText);
    assert.ok(JSON.stringify(content.exporter.getFinishedSpans().map((span) => span.attributes)).includes(privateText));
    assert.equal(JSON.stringify(metadata.exporter.getFinishedSpans().map((span) => span.attributes)).includes(privateText), false);
    assert.equal(trace.getTracerProvider(), globalProvider);
    assert.notEqual(content.callback.roots[0], metadata.callback.roots[0]);
  } finally { await content.provider.shutdown(); await metadata.provider.shutdown(); }
});

test("generation details retain zero and subsets, measure only observed text, and unwind unfinished callbacks", async () => {
  const { callback, provider, exporter } = recording(true);
  try {
    callback.handleChatModelStart(serialized, [[new HumanMessage("hello")]], "model", undefined, {
      invocation_params: { options: { temperature: 0, top_p: 0.9, num_predict: 512 }, tools: [{ name: "read" }] }
    });
    callback.handleLLMNewToken("", undefined, "model");
    callback.handleLLMNewToken("a", undefined, "model");
    const generation: ChatGeneration = { text: "a", message: new AIMessage({ content: "a",
      response_metadata: { done_reason: "stop", model: "actual-model" }, usage_metadata: {
        input_tokens: 10, output_tokens: 4, total_tokens: 14,
        input_token_details: { cache_read: 0, cache_creation: 2 }, output_token_details: { reasoning: 1 }
      } }) };
    callback.handleLLMEnd({ generations: [[generation]] }, "model");
    callback.handleToolStart(serialized, "{}", "unfinished");
    callback.close();
    callback.handleToolStart(serialized, "{}", "too-late");
    await provider.forceFlush();
    const spans = exporter.getFinishedSpans();
    assert.equal(spans.length, 2);
    assert.equal(spans[0].attributes["gen_ai.request.temperature"], 0);
    assert.equal(spans[0].attributes["gen_ai.usage.cache_read.input_tokens"], 0);
    assert.equal(spans[0].attributes["gen_ai.usage.reasoning.output_tokens"], 1);
    assert.equal(spans[0].attributes["gen_ai.response.finish_reasons"], '["stop"]');
    assert.equal(spans[0].attributes["gen_ai.response.model"], "actual-model");
    assert.ok(Number(spans[0].attributes["harakiri.llm.first_token_ms"]) >= 0);
    assert.equal(spans[1].attributes["error.type"], "incomplete_callback_lifecycle");
    assert.equal(spans[1].status.code, SpanStatusCode.ERROR);
    assert.equal(chatMessage(new ToolMessage({ content: "result", tool_call_id: "call_1" })).tool_call_id, "call_1");
  } finally { await provider.shutdown(); }
});

test("actual tool errors are inspectable only with content capture", async () => {
  for (const capture of [true, false]) {
    const { callback, provider, exporter } = recording(capture);
    try {
      callback.handleToolStart(serialized, "{}", "tool");
      callback.handleToolError(new Error(privateText), "tool");
      await provider.forceFlush();
      const [span] = exporter.getFinishedSpans();
      assert.equal(span.status.code, SpanStatusCode.ERROR);
      assert.equal(span.attributes["error.type"], "Error");
      assert.equal(span.status.message, capture ? privateText : undefined);
    } finally { callback.close(); await provider.shutdown(); }
  }
});
