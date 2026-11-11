import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { ChatOllama } from "@langchain/ollama";
import { createAgent, tool } from "langchain";
import { isAIMessage } from "@langchain/core/messages";
import { TracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { LangChainTrace } from "./langchain-trace.js";

// This private recipe uses real inference but no arbitrary shell or project data.
process.env.LANGSMITH_TRACING = "false";
process.env.LANGCHAIN_TRACING_V2 = "false";
process.env.LANGCHAIN_CALLBACKS_BACKGROUND = "false";
const file = process.argv[2];
assert.ok(file, "Pass the private workload configuration path");
const config = JSON.parse(await readFile(file, "utf8")) as {
  modelUrl: string; model: string; endpoint: string; token: string; captureContent: boolean; resultPath: string;
};
for (const url of [config.modelUrl, config.endpoint]) assert.equal(new URL(url).hostname, "127.0.0.1", "Qualification is loopback only");
assert.match(config.token, /^htg_[A-Za-z0-9_-]{43}$/);
const provider = new TracerProvider({ resource: resourceFromAttributes({ "service.name": "local-llm-orders-agent" }),
  spanProcessors: [new BatchSpanProcessor({ exporter: new OTLPTraceExporter({
    url: config.endpoint, headers: { Authorization: `Bearer ${config.token}` }, timeoutMillis: 3000
  }), maxQueueSize: 256, maxExportBatchSize: 64, exportTimeoutMillis: 5000 })] });
const recording = new LangChainTrace(provider.getTracer("harakiri.langchain-recipe", "1"), {
  provider: "ollama", model: config.model, captureContent: config.captureContent
});
const orders = [
  { id: "A-101", amount_cents: 1500, status: "paid" },
  { id: "A-102", amount_cents: 2000, status: "paid" },
  { id: "A-103", amount_cents: 700, status: "refunded" }
];
const calls: string[] = [];
let report: unknown;
const readOrders = tool(async () => { calls.push("read_orders"); return JSON.stringify(orders); }, {
  name: "read_orders", description: "Read all synthetic order records, with integer amount_cents and paid/refunded status.",
  schema: { type: "object", properties: {}, additionalProperties: false }
});
const submitReport = tool(async (input: unknown) => {
  calls.push("submit_report");
  const expected = { paid_orders: orders.filter((order) => order.status === "paid").length,
    revenue_cents: orders.filter((order) => order.status === "paid").reduce((sum, order) => sum + order.amount_cents, 0),
    refunded_orders: orders.filter((order) => order.status === "refunded").length };
  assert.deepEqual(input, expected, "Report must match independent calculation over source records");
  report = input;
  return JSON.stringify({ verified: true, report });
}, {
  name: "submit_report", description: "Submit the calculated report for independent verification. Counts and revenue must match the actual records.",
  schema: { type: "object", properties: { paid_orders: { type: "integer" }, revenue_cents: { type: "integer" }, refunded_orders: { type: "integer" } },
    required: ["paid_orders", "revenue_cents", "refunded_orders"], additionalProperties: false }
});
try {
  const model = new ChatOllama({ baseUrl: config.modelUrl, model: config.model, temperature: 0,
    numCtx: 4096, numPredict: 512, numThread: 3, think: false, maxRetries: 0, keepAlive: "1m", streaming: true });
  assert.equal(model.invocationParams().think, false);
  const agent = createAgent({ model, tools: [readOrders, submitReport],
    systemPrompt: "You are an order reconciliation agent. Use read_orders before calculating. Use submit_report to verify your report. Only count paid orders in revenue. Do not invent records. Finish with a short summary after verification." });
  const result = await agent.invoke({ messages: [{ role: "user", content: "Reconcile the synthetic order ledger. Report paid_orders, revenue_cents and refunded_orders. Verify the report with the provided tool." }] },
    { callbacks: [recording], runName: "Reconcile orders with a real local LLM", recursionLimit: 10, signal: AbortSignal.timeout(240_000) });
  const generations = result.messages.filter(isAIMessage);
  assert.ok(generations.length >= 2 && generations.some((message) => message.tool_calls?.length), "Real model must request tools");
  assert.ok(calls.includes("read_orders") && calls.includes("submit_report") && report, "Both real tools must execute");
  assert.equal(typeof result.messages.at(-1)?.content, "string");
  for (const message of generations) {
    assert.ok(Number.isSafeInteger(message.usage_metadata?.input_tokens), "Provider must report input usage for this qualification");
    assert.ok(Number.isSafeInteger(message.usage_metadata?.output_tokens), "Provider must report output usage for this qualification");
  }
  await writeFile(config.resultPath, JSON.stringify({ verified: true, report, calls, model: config.model,
    generations: generations.length, inputTokens: generations.reduce((sum, message) => sum + message.usage_metadata!.input_tokens, 0),
    outputTokens: generations.reduce((sum, message) => sum + message.usage_metadata!.output_tokens, 0),
    expectedSpans: recording.spanCount, traceIds: [...new Set(recording.roots)] }, null, 2), { mode: 0o600 });
} finally {
  recording.close();
  try { await provider.forceFlush(); } finally { await provider.shutdown(); }
}
