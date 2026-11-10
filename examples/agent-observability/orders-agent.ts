import assert from "node:assert/strict";
import * as CallbackManager from "@langchain/core/callbacks/manager";
import { isAIMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { isPatched, LangChainInstrumentation } from "@arizeai/openinference-instrumentation-langchain";
import { createAgent, tool } from "langchain";
import type { RunTelemetry } from "@h-sandbox/sdk/telemetry";

export type OrderReport = { paid_orders: number; revenue_cents: number; refunded_orders: number };
export const expectedReport: OrderReport = { paid_orders: 2, revenue_cents: 3500, refunded_orders: 1 };
export const orders = [
  { id: "A-101", amount_cents: 1500, status: "paid" },
  { id: "A-102", amount_cents: 2000, status: "paid" },
  { id: "A-103", amount_cents: 700, status: "refunded" }
];

type Options = {
  model: BaseChatModel;
  telemetry: RunTelemetry;
  readOrders: () => Promise<string>;
  submitReport: (report: OrderReport) => Promise<string>;
};

/** One agent invocation per process: upstream manual ESM instrumentation is process-wide. */
export async function runOrdersAgent(options: Options) {
  if (process.env.LANGCHAIN_CALLBACKS_BACKGROUND !== "false") {
    throw new Error("Set LANGCHAIN_CALLBACKS_BACKGROUND=false before starting this recipe.");
  }
  if (isPatched()) throw new Error("LangChain is already instrumented. Reuse its existing tracing setup instead.");
  const hide = options.telemetry.capture !== "content";
  const instrumentation = new LangChainInstrumentation({
    tracerProvider: options.telemetry.tracerProvider,
    instrumentationConfig: { enabled: false },
    traceConfig: { hideInputs: hide, hideOutputs: hide, hideInputMessages: hide, hideOutputMessages: hide,
      hideInputText: hide, hideOutputText: hide, hideInputImages: true, hideLLMTools: hide, hidePrompts: hide }
  });
  instrumentation.manuallyInstrument(CallbackManager);
  const calls: string[] = [];
  let verified: OrderReport | undefined;
  const readOrders = tool(async () => {
    calls.push("read_orders");
    return options.readOrders();
  }, { name: "read_orders", description: "Read the actual synthetic order ledger before calculating a report.",
    schema: { type: "object", properties: {}, additionalProperties: false } });
  const submitReport = tool(async (report: OrderReport) => {
    calls.push("submit_report");
    const result = await options.submitReport(report);
    assert.deepEqual(report, expectedReport, "The agent's report must match independent calculation.");
    verified = report;
    return result;
  }, { name: "submit_report", description: "Persist the report and run independent validation against the source ledger.",
    schema: { type: "object", properties: { paid_orders: { type: "integer" }, revenue_cents: { type: "integer" },
      refunded_orders: { type: "integer" } }, required: ["paid_orders", "revenue_cents", "refunded_orders"], additionalProperties: false } });
  try {
    const agent = createAgent({ model: options.model, tools: [readOrders, submitReport],
      systemPrompt: "Reconcile the order ledger. First call read_orders. Calculate counts and revenue from its records, counting only paid orders in revenue. Then call submit_report. Finish with a short summary only after the report is verified." });
    const result = await agent.invoke({ messages: [["user", "Read the ledger and verify paid_orders, revenue_cents and refunded_orders."]] },
      { runName: "Reconcile orders", recursionLimit: 10, signal: AbortSignal.timeout(300_000) });
    const generations = result.messages.filter(isAIMessage);
    assert.ok(verified && calls.includes("read_orders") && calls.includes("submit_report"), "Both actual tools must execute.");
    assert.ok(generations.length >= 2 && generations.some((message) => message.tool_calls?.length), "Real inference must request tools.");
    for (const message of generations) {
      assert.ok(Number.isSafeInteger(message.usage_metadata?.input_tokens), "The model must report input tokens.");
      assert.ok(Number.isSafeInteger(message.usage_metadata?.output_tokens), "The model must report output tokens.");
    }
    return { verified: true, report: verified, calls, generations: generations.length,
      inputTokens: generations.reduce((sum, message) => sum + message.usage_metadata!.input_tokens, 0),
      outputTokens: generations.reduce((sum, message) => sum + message.usage_metadata!.output_tokens, 0) };
  } finally {
    // disable() does not undo upstream manual ESM patching. Exit this dedicated job process.
    instrumentation.disable();
  }
}
