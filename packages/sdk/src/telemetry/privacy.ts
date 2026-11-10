import type { Context } from "@opentelemetry/api";
import type { ReadableSpan, Span, SpanProcessor } from "@opentelemetry/sdk-trace";
import type { AgentCapture } from "../observability-types.js";

export const metadataAttributes = new Set([
  "gen_ai.operation.name", "gen_ai.provider.name", "gen_ai.system", "gen_ai.request.model",
  "gen_ai.response.model", "gen_ai.usage.input_tokens", "gen_ai.usage.output_tokens",
  "gen_ai.tool.name", "error.type", "gen_ai.request.temperature", "gen_ai.request.top_p",
  "gen_ai.request.max_tokens", "gen_ai.response.finish_reasons", "gen_ai.response.id",
  "gen_ai.tool.call.id", "gen_ai.usage.cache_read.input_tokens", "gen_ai.usage.cache_creation.input_tokens",
  "gen_ai.usage.reasoning.output_tokens", "harakiri.llm.first_token_ms", "harakiri.command.id",
  "harakiri.step.kind", "harakiri.attempt", "openinference.span.kind", "llm.model_name",
  "llm.token_count.prompt", "llm.token_count.completion", "tool.name"
]);
const contentAttributes = new Set([
  "gen_ai.input.messages", "gen_ai.output.messages", "gen_ai.tool.call.arguments",
  "gen_ai.tool.call.result", "gen_ai.system_instructions", "gen_ai.tool.definitions"
]);

/** Minimize before the batch queue, without mutating another processor's span. */
export class CaptureSpanProcessor implements SpanProcessor {
  constructor(private readonly next: SpanProcessor, private readonly capture: AgentCapture,
    private readonly drain?: () => Promise<void>) {}
  onStart(span: Span, parent: Context) { this.next.onStart(span, parent); }
  onEnd(span: ReadableSpan) {
    const content = this.capture === "content";
    const attributes = Object.fromEntries(Object.entries(span.attributes).filter(([key]) =>
      metadataAttributes.has(key) || (content && contentAttributes.has(key))));
    let clipped = false;
    for (const [key, value] of Object.entries(attributes)) {
      if (typeof value === "string" && value.length > 8192) {
        attributes[key] = value.slice(0, 8192);
        clipped = true;
      }
    }
    if (clipped) attributes["harakiri.content.truncated"] = true;
    this.next.onEnd({
      name: span.name, kind: span.kind, spanContext: () => ({ ...span.spanContext(), traceState: undefined }),
      parentSpanContext: span.parentSpanContext && { ...span.parentSpanContext, traceState: undefined },
      startTime: span.startTime, endTime: span.endTime, duration: span.duration, ended: span.ended,
      status: content ? span.status : { code: span.status.code },
      attributes,
      events: content ? span.events : [], links: content ? span.links : [],
      resource: span.resource, instrumentationScope: span.instrumentationScope,
      droppedAttributesCount: span.droppedAttributesCount,
      droppedEventsCount: span.droppedEventsCount, droppedLinksCount: span.droppedLinksCount
    });
  }
  async forceFlush() {
    try { await this.next.forceFlush(); } finally { await this.drain?.(); }
  }
  shutdown() { return this.next.shutdown(); }
}
