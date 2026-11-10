import type { TelemetrySpan } from "@harakiri/shared";

type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject => value !== null && typeof value === "object" && !Array.isArray(value);
const string = (value: unknown) => typeof value === "string" ? value : undefined;
export type MessagePart = { type: "text"; text: string } | { type: "call" | "result"; name?: string; id?: string; value: unknown };
export type TraceMessage = { role: string; name?: string; callId?: string; parts: MessagePart[] };

/** Supported text/tool shapes only; retain the raw payload for everything else. */
export function traceMessages(value: string): TraceMessage[] | null {
  let data: unknown;
  try { data = JSON.parse(value); } catch { return null; }
  if (!Array.isArray(data) || data.length > 128) return null;
  const messages: TraceMessage[] = [];
  for (const item of data) {
    if (!object(item) || typeof item.role !== "string") return null;
    const parts: MessagePart[] = [];
    const content = item.parts ?? item.content;
    if (typeof content === "string") { if (content) parts.push({ type: "text", text: content }); }
    else if (Array.isArray(content)) {
      if (content.length > 128) return null;
      for (const part of content) {
        if (!object(part)) return null;
        if (part.type === "text" && typeof (part.text ?? part.content) === "string") parts.push({ type: "text", text: (part.text ?? part.content) as string });
        else if (part.type === "tool_call") parts.push({ type: "call", name: string(part.name), id: string(part.id), value: part.arguments });
        else if (part.type === "tool_call_response") parts.push({ type: "result", id: string(part.id), value: part.result });
        else return null;
      }
    } else if (content !== undefined && content !== null) return null;
    if (item.tool_calls !== undefined) {
      if (!Array.isArray(item.tool_calls) || item.tool_calls.length > 128) return null;
      for (const call of item.tool_calls) {
        if (!object(call)) return null;
        const fn = object(call.function) ? call.function : call;
        parts.push({ type: "call", name: string(fn.name), id: string(call.id), value: fn.arguments ?? fn.args });
      }
    }
    messages.push({ role: item.role, name: string(item.name), callId: string(item.tool_call_id), parts });
  }
  return messages;
}

export function reportedTokens(value: string | undefined): bigint | null {
  return value !== undefined && /^\d{1,15}$/.test(value) ? BigInt(value) : null;
}
export function generationFacts(span: Pick<TelemetrySpan, "attributes">) {
  const a = span.attributes;
  const input = reportedTokens(a["gen_ai.usage.input_tokens"] ?? a["llm.token_count.prompt"]);
  const output = reportedTokens(a["gen_ai.usage.output_tokens"] ?? a["llm.token_count.completion"]);
  const cached = reportedTokens(a["gen_ai.usage.cache_read.input_tokens"]);
  const created = reportedTokens(a["gen_ai.usage.cache_creation.input_tokens"]);
  const reasoning = reportedTokens(a["gen_ai.usage.reasoning.output_tokens"]);
  const rawTiming = a["harakiri.llm.first_token_ms"];
  const timing = rawTiming !== undefined && /^\d+(?:\.\d+)?$/.test(rawTiming) ? Number(rawTiming) : NaN;
  let finish = a["gen_ai.response.finish_reasons"];
  if (finish) { try { const parsed: unknown = JSON.parse(finish); if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) finish = parsed.join(", "); } catch { /* Keep reported text visible. */ } }
  return { input, output, cached, created, reasoning,
    total: input !== null && output !== null ? input + output : null,
    inconsistent: (input !== null && (cached ?? 0n) + (created ?? 0n) > input)
      || (output !== null && reasoning !== null && reasoning > output),
    firstTokenMs: Number.isFinite(timing) && timing >= 0 ? timing : null,
    model: a["gen_ai.response.model"] ?? a["gen_ai.request.model"] ?? a["llm.model_name"],
    provider: a["gen_ai.provider.name"] ?? a["gen_ai.system"], finish };
}
