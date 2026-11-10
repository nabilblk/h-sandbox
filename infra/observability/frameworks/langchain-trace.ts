import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { isAIMessage, isToolMessage, type BaseMessage } from "@langchain/core/messages";
import type { Serialized } from "@langchain/core/load/serializable";
import type { LLMResult } from "@langchain/core/outputs";
import { ROOT_CONTEXT, SpanStatusCode, trace, type Attributes, type Span, type Tracer } from "@opentelemetry/api";

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
const text = (value: unknown) => typeof value === "string" ? value : undefined;
const encode = (value: unknown) => typeof value === "string" ? value : JSON.stringify(value);

export function chatMessage(message: BaseMessage) {
  const role = ({ human: "user", ai: "assistant" } as Record<string, string>)[message.type] ?? message.type;
  return { role, content: message.content,
    ...(isAIMessage(message) && message.tool_calls?.length ? { tool_calls: message.tool_calls.map((call) => ({ id: call.id, name: call.name, arguments: call.args })) } : {}),
    ...(isToolMessage(message) ? { tool_call_id: message.tool_call_id, name: message.name } : {}) };
}

/** Per-invocation qualification recipe. No globals, monkey patches or model calls. */
export class LangChainTrace extends BaseCallbackHandler {
  name = "harakiri-qualification-trace";
  private readonly active = new Map<string, { span: Span; started: number; firstToken: boolean }>();
  private created = 0;
  private closed = false;
  readonly roots: string[] = [];
  get spanCount() { return this.created; }
  constructor(private readonly tracer: Tracer, private readonly options: { provider: string; model: string; captureContent?: boolean }) {
    super({ _awaitHandler: true, raiseError: false });
  }

  private start(id: string, parent: string | undefined, name: string, attributes: Attributes) {
    if (this.closed || this.active.has(id) || this.created >= 1000) return;
    const ancestor = parent ? this.active.get(parent)?.span : undefined;
    const span = this.tracer.startSpan(name.slice(0, 256), { attributes }, ancestor ? trace.setSpan(ROOT_CONTEXT, ancestor) : ROOT_CONTEXT);
    this.active.set(id, { span, started: performance.now(), firstToken: false }); this.created++;
    if (!ancestor) this.roots.push(span.spanContext().traceId);
    return span;
  }
  private content(span: Span | undefined, key: string, value: unknown) {
    if (!span || !this.options.captureContent || value === undefined) return;
    try {
      const serialized = encode(value);
      if (serialized !== undefined) span.setAttribute(key, serialized);
    } catch { span.addEvent("content_serialization_failed"); }
  }
  private end(id: string, failed = false, message?: string) {
    const entry = this.active.get(id);
    if (!entry) return;
    entry.span.setStatus({ code: failed ? SpanStatusCode.ERROR : SpanStatusCode.OK,
      ...(this.options.captureContent && message ? { message: message.slice(0, 4096) } : {}) });
    entry.span.end(); this.active.delete(id);
  }
  private fail(id: string, error: unknown) {
    this.active.get(id)?.span.setAttribute("error.type", error instanceof Error ? error.name.slice(0, 256) : "Error");
    this.end(id, true, error instanceof Error ? error.message : undefined);
  }

  // Core 1.2.12's dispatcher passes parent fourth and name eighth, unlike its declaration.
  // Keep the pinned framework integration test: trusting the declaration splits the trace.
  handleChainStart(chain: Serialized, _inputs: unknown, id: string, parent?: string, _tags?: string[], _metadata?: Record<string, unknown>, _type?: string, name?: string) {
    this.start(id, parent, name ?? chain.id.at(-1) ?? "Agent operation", { "openinference.span.kind": parent ? "CHAIN" : "AGENT" });
  }
  handleChainEnd(_outputs: unknown, id: string) { this.end(id); }
  handleChainError(error: unknown, id: string) { this.fail(id, error); }

  handleChatModelStart(_llm: Serialized, messages: BaseMessage[][], id: string, parent?: string, extra?: Record<string, unknown>) {
    const span = this.start(id, parent, `Generate / ${this.options.model}`, {
      "openinference.span.kind": "LLM", "gen_ai.operation.name": "chat",
      "gen_ai.provider.name": this.options.provider, "gen_ai.request.model": this.options.model
    });
    const params = object(extra?.invocation_params), options = object(params.options);
    for (const [key, value] of Object.entries({
      "gen_ai.request.temperature": params.temperature ?? options.temperature,
      "gen_ai.request.top_p": params.top_p ?? options.top_p,
      "gen_ai.request.max_tokens": params.max_tokens ?? options.num_predict
    })) if (typeof value === "number" && Number.isFinite(value)) span?.setAttribute(key, value);
    this.content(span, "gen_ai.input.messages", messages[0]?.map(chatMessage));
    this.content(span, "gen_ai.tool.definitions", params.tools);
  }
  handleLLMNewToken(token: string, _indices: unknown, id: string) {
    const entry = this.active.get(id);
    if (!entry || entry.firstToken || !token) return;
    entry.firstToken = true;
    entry.span.setAttribute("harakiri.llm.first_token_ms", performance.now() - entry.started);
  }
  handleLLMEnd(result: LLMResult, id: string) {
    const span = this.active.get(id)?.span;
    const generations = result.generations[0] ?? [];
    const messages = generations.flatMap((generation) => "message" in generation ? [generation.message as BaseMessage] : []);
    this.content(span, "gen_ai.output.messages", messages.map(chatMessage));
    const first = messages[0];
    if (first && isAIMessage(first)) {
      const usage = first.usage_metadata, metadata = first.response_metadata;
      const finish = text(metadata.finish_reason ?? metadata.stop_reason ?? metadata.done_reason ?? generations[0]?.generationInfo?.finish_reason);
      if (finish) span?.setAttribute("gen_ai.response.finish_reasons", JSON.stringify([finish]));
      const model = text(metadata.model ?? metadata.model_name);
      if (model) span?.setAttribute("gen_ai.response.model", model);
      for (const [key, value] of Object.entries({
        "gen_ai.usage.input_tokens": usage?.input_tokens,
        "gen_ai.usage.output_tokens": usage?.output_tokens,
        "gen_ai.usage.cache_read.input_tokens": usage?.input_token_details?.cache_read,
        "gen_ai.usage.cache_creation.input_tokens": usage?.input_token_details?.cache_creation,
        "gen_ai.usage.reasoning.output_tokens": usage?.output_token_details?.reasoning
      })) { const valid = count(value); if (valid !== undefined) span?.setAttribute(key, valid); }
    }
    this.end(id);
  }
  handleLLMError(error: unknown, id: string) { this.fail(id, error); }
  handleToolStart(tool: Serialized, input: string, id: string, parent?: string, _tags?: string[], _metadata?: Record<string, unknown>, name?: string, callId?: string) {
    const toolName = name ?? tool.id.at(-1) ?? "Tool";
    const span = this.start(id, parent, toolName, { "openinference.span.kind": "TOOL", "gen_ai.tool.name": toolName,
      ...(callId ? { "gen_ai.tool.call.id": callId } : {}) });
    this.content(span, "gen_ai.tool.call.arguments", input);
  }
  handleToolEnd(output: unknown, id: string) {
    this.content(this.active.get(id)?.span, "gen_ai.tool.call.result", object(output).content ?? output);
    this.end(id, object(output).status === "error");
  }
  handleToolError(error: unknown, id: string) { this.fail(id, error); }
  close() {
    this.closed = true;
    for (const [id, { span }] of this.active) {
      span.setAttribute("error.type", "incomplete_callback_lifecycle");
      this.end(id, true);
    }
  }
}
