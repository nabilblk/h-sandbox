import type { AgentRunRecord, TelemetryLog, TelemetrySpan, TelemetryWindow } from "@harakiri/shared";
import type { Route } from "./routes/types";

export const validRunId = (value: string) => /^run_[A-Za-z0-9_-]{1,64}$/.test(value);
export const validStepId = (value: string) => /^[0-9a-f]{32}:[0-9a-f]{16}$/.test(value);
export function validTelemetryWindow(from: string, to: string): boolean {
  const start = Date.parse(from), end = Date.parse(to);
  return [from, to].every((value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value)
    && end > start && end - start <= 31 * 86_400_000;
}
export function telemetryWindowFromParams(params: URLSearchParams): TelemetryWindow | undefined | null {
  const from = params.get("from"), to = params.get("to");
  if (from === null && to === null) return undefined;
  if (!from || !to || params.getAll("from").length !== 1 || params.getAll("to").length !== 1
    || !params.get("run") || !validTelemetryWindow(from, to)) return null;
  return { from, to };
}
export type TelemetryRange = "run" | "15m" | "1h";
export function defaultTelemetryWindow(createdAt: string, range: TelemetryRange, now = Date.now()): TelemetryWindow {
  const created = Date.parse(createdAt);
  const end = range === "run" ? Math.min(now + 1000, created + 86_700_000) : now + 1000;
  const start = range === "run" ? created - 300_000 : end - (range === "15m" ? 900_000 : 3_600_000);
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString() };
}
export function runLocation(route: string) {
  const [path, query = "", extra] = route.split("?");
  if (path !== "dashboard/runs" || extra !== undefined) return null;
  const params = new URLSearchParams(query);
  const run = params.get("run"), step = params.get("step");
  const window = telemetryWindowFromParams(params);
  if (window === null || [...params.keys()].some((key) => !["run", "step", "from", "to"].includes(key))
    || params.getAll("run").length > 1 || params.getAll("step").length > 1
    || (run !== null && !validRunId(run)) || (step !== null && (!run || !validStepId(step)))) return null;
  return { run: run ?? undefined, step: step ?? undefined, window };
}
export function agentRunRoute(run?: string, step?: string, sandboxId?: string, window?: TelemetryWindow): Route {
  const params = new URLSearchParams(sandboxId ? { tab: "runs" } : {});
  if (run) params.set("run", run);
  if (run && step) params.set("step", step);
  if (run && window) { params.set("from", window.from); params.set("to", window.to); }
  return `${sandboxId ? `dashboard/sandboxes/${encodeURIComponent(sandboxId)}` : "dashboard/runs"}${params.size ? `?${params}` : ""}` as Route;
}

export function captureEvidence(run: AgentRunRecord, now = Date.now()) {
  if (run.expired) return "Expired";
  if (run.lastRejectedAt && (!run.lastAcceptedAt || run.lastRejectedAt >= run.lastAcceptedAt)) return "Ingestion rejected";
  if (!run.lastAcceptedAt) return "Awaiting telemetry";
  if (run.recording && now - Date.parse(run.lastAcceptedAt) > 120_000) return "No recent telemetry";
  return "Collector acknowledged";
}
export function stepKind(span: TelemetrySpan) {
  const inference = span.attributes["openinference.span.kind"]?.toLowerCase();
  if (inference === "llm" || span.attributes["gen_ai.operation.name"] === "chat") return "model";
  if (inference === "tool" || span.attributes["gen_ai.tool.name"] || span.attributes["tool.name"]) return "tool";
  if (span.attributes["harakiri.command.id"]) return "command";
  return "agent";
}

/** Use innermost model calls, never both an aggregate parent and its children. */
export function observedUsage(spans: TelemetrySpan[], partialRead = false) {
  const byId = new Map(spans.map((span) => [span.id, span]));
  const models = spans.filter((span) => stepKind(span) === "model");
  const aggregates = new Set<string>();
  for (const model of models) {
    let parent = model.parent === "present" ? model.parentSpanId : null;
    const visited = new Set<string>([model.id]);
    while (parent) {
      const ancestor = byId.get(`${model.traceId}:${parent}`);
      if (!ancestor || visited.has(ancestor.id)) break;
      visited.add(ancestor.id);
      if (stepKind(ancestor) === "model") aggregates.add(ancestor.id);
      parent = ancestor.parent === "present" ? ancestor.parentSpanId : null;
    }
  }
  const calls = models.filter((model) => !aggregates.has(model.id));
  const tokens = (standard: string, legacy: string) => {
    const values = calls.map((span) => span.attributes[standard] ?? span.attributes[legacy]);
    const known = values.filter((value): value is string => typeof value === "string" && /^\d{1,15}$/.test(value));
    return { total: known.length ? known.reduce((total, value) => total + BigInt(value), 0n) : null, missing: known.length < values.length };
  };
  const input = tokens("gen_ai.usage.input_tokens", "llm.token_count.prompt");
  const output = tokens("gen_ai.usage.output_tokens", "llm.token_count.completion");
  const names = [...new Set(calls.flatMap((span) => {
    const model = span.attributes["gen_ai.response.model"] ?? span.attributes["gen_ai.request.model"] ?? span.attributes["llm.model_name"];
    return model ? [model] : [];
  }))];
  return { calls: calls.length, names, input: input.total, output: output.total,
    partial: partialRead || input.missing || output.missing };
}
export function durationLabel(nanos: string | null) {
  if (nanos === null) return "Unknown";
  const ms = Number(BigInt(nanos) / 1000n) / 1000;
  return ms < 1000 ? `${ms.toFixed(ms < 10 ? 2 : 0)} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(2)} s` : `${(ms / 60_000).toFixed(1)} min`;
}

export type TraceRow = { span: TelemetrySpan; depth: number; hasChildren: boolean };
export function traceRows(spans: TelemetrySpan[], collapsed: ReadonlySet<string>, search = "", errorsOnly = false, kind?: ReturnType<typeof stepKind>): TraceRow[] {
  const byId = new Map(spans.map((span) => [span.id, span]));
  const children = new Map<string, TelemetrySpan[]>();
  const roots: TelemetrySpan[] = [];
  const matching = new Set<string>();
  const filtering = Boolean(search.trim() || errorsOnly || kind);
  for (const span of spans) {
    const parent = span.parent === "present" && span.parentSpanId ? `${span.traceId}:${span.parentSpanId}` : "";
    if (parent && byId.has(parent)) { const group = children.get(parent) ?? []; group.push(span); children.set(parent, group); }
    else roots.push(span);
    if ((!kind || stepKind(span) === kind) && (!errorsOnly || span.status === "error") && (!search.trim() || `${span.name} ${stepKind(span)}`.toLowerCase().includes(search.trim().toLowerCase()))) {
      let current: TelemetrySpan | undefined = span;
      const visited = new Set<string>();
      while (current && !visited.has(current.id)) {
        visited.add(current.id); matching.add(current.id);
        current = current.parent === "present" && current.parentSpanId ? byId.get(`${current.traceId}:${current.parentSpanId}`) : undefined;
      }
    }
  }
  const order = (a: TelemetrySpan, b: TelemetrySpan) => a.startTimeUnixNano === b.startTimeUnixNano ? a.id.localeCompare(b.id) : BigInt(a.startTimeUnixNano) < BigInt(b.startTimeUnixNano) ? -1 : 1;
  roots.sort(order); for (const group of children.values()) group.sort(order);
  const queue = roots.slice().reverse().map((span) => ({ span, depth: 0 }));
  const result: TraceRow[] = [], visited = new Set<string>();
  while (queue.length) {
    const row = queue.pop()!;
    if (visited.has(row.span.id)) continue;
    visited.add(row.span.id);
    if (filtering && !matching.has(row.span.id)) continue;
    const nested = children.get(row.span.id) ?? [];
    result.push({ ...row, hasChildren: nested.length > 0 });
    if (filtering || !collapsed.has(row.span.id)) for (const span of [...nested].reverse()) queue.push({ span, depth: row.depth + 1 });
  }
  return result;
}

export function traceRange(spans: TelemetrySpan[]) {
  if (!spans.length) return { start: 0n, duration: 1n, observedDuration: null, partial: false };
  let start = BigInt(spans[0].startTimeUnixNano), end = start;
  let hasEnd = false, partial = false;
  for (const span of spans) {
    const from = BigInt(span.startTimeUnixNano), to = BigInt(span.endTimeUnixNano ?? span.startTimeUnixNano);
    if (from < start) start = from;
    if (to > end) end = to;
    hasEnd ||= span.endTimeUnixNano !== null;
    partial ||= span.endTimeUnixNano === null;
  }
  // A nonzero drawing scale must not turn missing timing into a zero-duration claim.
  return { start, duration: end > start ? end - start : 1n, observedDuration: hasEnd ? end - start : null, partial };
}
export function timelineBar(span: TelemetrySpan, range: ReturnType<typeof traceRange>) {
  const percent = (value: bigint) => Number(value * 10_000n / range.duration) / 100;
  const left = Math.max(0, Math.min(100, percent(BigInt(span.startTimeUnixNano) - range.start)));
  const width = span.durationNano === null ? 0 : Math.min(100 - left, Math.max(0, percent(BigInt(span.durationNano))));
  return { left, width };
}

export function nextErrorSpan(spans: TelemetrySpan[], selectedId?: string) {
  const errors = traceRows(spans, new Set()).filter(({ span }) => span.status === "error");
  if (!errors.length) return undefined;
  const index = errors.findIndex(({ span }) => span.id === selectedId);
  return errors[(index + 1) % errors.length].span;
}

export type LogLevel = "error" | "warning" | "info" | "debug" | "other";
export function logLevel(log: Pick<TelemetryLog, "severity" | "severityNumber">): LogLevel {
  const text = log.severity.toUpperCase();
  if (/^(ERROR|FATAL)/.test(text)) return "error";
  if (/^WARN/.test(text)) return "warning";
  if (/^INFO/.test(text)) return "info";
  if (/^(DEBUG|TRACE)/.test(text)) return "debug";
  const number = log.severityNumber;
  if (number === null || number < 1 || number > 24) return "other";
  return number >= 17 ? "error" : number >= 13 ? "warning" : number >= 9 ? "info" : "debug";
}

export function matchesLog(log: TelemetryLog, search: string, level: LogLevel | "all", includeContent: boolean) {
  if (level !== "all" && logLevel(log) !== level) return false;
  const body = includeContent && log.content.state === "available" ? log.content.body : "";
  return `${log.severity} ${log.serviceName ?? ""} ${log.traceId ?? ""} ${log.spanId ?? ""} ${body ?? ""}`
    .toLowerCase().includes(search.trim().toLowerCase());
}

export function formatTelemetryValue(value: string): { text: string; language: "json" | "text" } {
  try {
    const parsed: unknown = JSON.parse(value);
    // Keep scalars as supplied; pretty-print only structured payloads.
    if (parsed !== null && typeof parsed === "object") return { text: JSON.stringify(parsed, null, 2), language: "json" };
  } catch { /* Plain text and incomplete payloads remain inspectable. */ }
  return { text: value, language: "text" };
}
