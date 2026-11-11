import type { TelemetrySpan } from "@harakiri/shared";
export { traceMessages, type MessageFormat, type MessagePart, type TraceMessage } from "./trace-messages";

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
