import { createHash } from "node:crypto";
import type { TelemetryContentState, TelemetryIssue, TelemetryLog, TelemetryQueryScope, TelemetrySpan } from "./model.js";

export type StorageRecord = Record<string, string>;
const metadataKeys = [
  "gen_ai.operation.name", "gen_ai.provider.name", "gen_ai.system", "gen_ai.request.model",
  "gen_ai.response.model", "gen_ai.usage.input_tokens", "gen_ai.usage.output_tokens",
  "gen_ai.request.temperature", "gen_ai.request.top_p", "gen_ai.request.max_tokens",
  "gen_ai.response.finish_reasons", "gen_ai.response.id", "gen_ai.tool.call.id",
  "gen_ai.usage.cache_read.input_tokens", "gen_ai.usage.cache_creation.input_tokens",
  "gen_ai.usage.reasoning.output_tokens",
  "harakiri.llm.first_token_ms",
  "gen_ai.tool.name", "error.type", "harakiri.command.id", "harakiri.step.kind", "harakiri.attempt",
  "openinference.span.kind", "llm.model_name", "llm.token_count.prompt", "llm.token_count.completion", "tool.name"
];
const contentKeys = ["gen_ai.input.messages", "gen_ai.output.messages", "gen_ai.tool.call.arguments", "gen_ai.tool.call.result", "gen_ai.system_instructions", "gen_ai.tool.definitions"];
const validId = (value: string | undefined, length: number) => !!value && new RegExp(`^[0-9a-f]{${length}}$`).test(value) && !/^0+$/.test(value);
const nano = (value: string | undefined) => value && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9_223_372_036_854_775_807n ? value : null;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value, (_key, item: unknown) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item)).digest("hex");

function reader(record: StorageRecord, issues: Set<TelemetryIssue>) {
  return (key: string, limit = 4096): string | null => {
    const value = record[key];
    if (value === undefined || value === "") return null;
    if (value.length > limit) issues.add("truncated_record");
    return value.slice(0, limit);
  };
}

function attributes(read: ReturnType<typeof reader>, prefix: string, keys: string[], limit = 4096) {
  return Object.fromEntries(keys.flatMap((key) => {
    const value = read(`${prefix}${key}`, limit);
    return value === null ? [] : [[key, value]];
  }));
}

function binding(record: StorageRecord, prefix: string, scope: TelemetryQueryScope) {
  return record[`${prefix}harakiri.org.id`] === scope.organizationId
    && record[`${prefix}harakiri.run.id`] === scope.runId
    && /^sbx_[A-Za-z0-9_-]{1,64}$/.test(record[`${prefix}harakiri.sandbox.id`] ?? "")
    && record[`${prefix}harakiri.source`] === "workload"
    && ["metadata", "content"].includes(record[`${prefix}harakiri.capture`]);
}

function contentState(record: StorageRecord, prefix: string, scope: TelemetryQueryScope): TelemetryContentState {
  return record[`${prefix}harakiri.capture`] !== "content" ? "not_captured" : scope.includeContent ? "available" : "hidden";
}

function children(record: StorageRecord, prefix: "event" | "link", issues: Set<TelemetryIssue>) {
  const groups = new Map<number, StorageRecord>();
  for (const [key, value] of Object.entries(record)) {
    const match = new RegExp(`^${prefix}:(.+):([0-9]{1,6})$`).exec(key);
    if (!match) continue;
    const index = Number(match[2]);
    if (index >= 128) { issues.add("truncated_record"); continue; }
    let fields = groups.get(index);
    if (!fields) { fields = Object.create(null) as StorageRecord; groups.set(index, fields); }
    if (Object.keys(fields).length >= 32) { issues.add("truncated_record"); continue; }
    fields[match[1]] = value;
  }
  return [...groups].sort(([a], [b]) => a - b).map(([, fields]) => fields);
}

function childAttributes(record: StorageRecord, prefix: string, issues: Set<TelemetryIssue>) {
  const read = reader(record, issues);
  return attributes(read, prefix, Object.keys(record).filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length)));
}

function span(record: StorageRecord, scope: TelemetryQueryScope): TelemetrySpan | null {
  const prefix = "resource_attr:";
  if (!binding(record, prefix, scope) || !validId(record.trace_id, 32) || !validId(record.span_id, 16)) return null;
  const start = nano(record.start_time_unix_nano);
  if (!start) return null;
  const issues = new Set<TelemetryIssue>();
  const read = reader(record, issues);
  const end = nano(record.end_time_unix_nano);
  const duration = end && BigInt(end) >= BigInt(start) ? String(BigInt(end) - BigInt(start)) : null;
  if (duration === null) issues.add("invalid_timing");
  const parentSpanId = validId(record.parent_span_id, 16) ? record.parent_span_id : null;
  if (record.parent_span_id && !parentSpanId && !/^0+$/.test(record.parent_span_id)) issues.add("invalid_record");
  const state = contentState(record, prefix, scope);
  const events = state !== "available" ? [] : children(record, "event", issues).map((event) => ({
    name: reader(event, issues)("event_name", 256) ?? "Unnamed event",
    timeUnixNano: nano(event.event_time_unix_nano), attributes: childAttributes(event, "event_attr:", issues)
  }));
  const links = state !== "available" ? [] : children(record, "link", issues).flatMap((link) => {
    if (!validId(link.link_trace_id, 32) || !validId(link.link_span_id, 16)) { issues.add("invalid_record"); return []; }
    return [{ traceId: link.link_trace_id, spanId: link.link_span_id, attributes: childAttributes(link, "link_attr:", issues) }];
  });
  const result: TelemetrySpan = {
    id: `${record.trace_id}:${record.span_id}`, traceId: record.trace_id, spanId: record.span_id,
    parentSpanId, parent: parentSpanId ? "missing" : "root", sandboxId: record[`${prefix}harakiri.sandbox.id`],
    name: read("name", 256) ?? "Unnamed span", kind: /^[0-5]$/.test(record.kind) ? Number(record.kind) : 0,
    status: ({ "0": "unset", "1": "ok", "2": "error" } as const)[record.status_code as "0" | "1" | "2"] ?? "unknown",
    startTimeUnixNano: start, endTimeUnixNano: end, durationNano: duration,
    serviceName: read(`${prefix}service.name`, 128), scopeName: read("scope_name", 128), scopeVersion: read("scope_version", 128),
    source: "workload", attributes: attributes(read, "span_attr:", metadataKeys),
    content: { state, attributes: state === "available" ? attributes(read, "span_attr:", contentKeys, 32768) : {},
      statusMessage: state === "available" ? read("status_message") : null, events, links },
    deliveries: 1, issues: []
  };
  if (["dropped_attributes_count", "dropped_events_count", "dropped_links_count"].some((key) => Number(record[key]) > 0)) issues.add("truncated_record");
  if (record["span_attr:harakiri.content.truncated"] === "true") issues.add("truncated_record");
  result.issues = [...issues];
  return result;
}

export function normalizeSpans(records: StorageRecord[], scope: TelemetryQueryScope) {
  const issues = new Set<TelemetryIssue>();
  const unique = new Map<string, { value: TelemetrySpan; fingerprint: string }>();
  let rejectedRecords = 0;
  for (const record of records) {
    const schema = record["resource_attr:harakiri.schema.version"];
    const value = schema === "1" ? span(record, scope) : null;
    if (!value) { rejectedRecords++; issues.add(schema === "1" ? "invalid_record" : "unsupported_schema"); continue; }
    // Hash normalized, authorized data, not sensitive content withheld from this reader.
    // Ignore delivery order; conflicting IDs pick the same representative every time.
    const fingerprint = hash(value);
    const previous = unique.get(value.id);
    if (previous) {
      value.deliveries = previous.value.deliveries + 1;
      const conflict = fingerprint !== previous.fingerprint || previous.value.issues.includes("conflicting_span");
      if (fingerprint < previous.fingerprint) {
        previous.value.deliveries = value.deliveries;
        if (conflict && !previous.value.issues.includes("conflicting_span")) previous.value.issues.push("conflicting_span");
        continue;
      }
      if (conflict) value.issues.push("conflicting_span");
    }
    unique.set(value.id, { value, fingerprint });
  }
  const spans = [...unique.values()].map(({ value }) => value);
  const visited = new Set<string>();
  for (const value of spans) {
    const path = new Map<string, TelemetrySpan>();
    let current: TelemetrySpan | undefined = value;
    while (current && !visited.has(current.id)) {
      if (path.has(current.id)) {
        let cycle = false;
        for (const [id, member] of path) {
          cycle ||= id === current.id;
          if (cycle) { member.parent = "cycle"; member.issues.push("cyclic_parent"); }
        }
        break;
      }
      path.set(current.id, current);
      const parent: TelemetrySpan | undefined = current.parentSpanId ? unique.get(`${current.traceId}:${current.parentSpanId}`)?.value : undefined;
      current.parent = !current.parentSpanId ? "root" : parent ? "present" : "missing";
      if (current.parent === "missing") current.issues.push("missing_parent");
      current = parent;
    }
    for (const id of path.keys()) visited.add(id);
  }
  for (const value of spans) for (const issue of value.issues) issues.add(issue);
  spans.sort((a, b) => BigInt(a.startTimeUnixNano) < BigInt(b.startTimeUnixNano) ? -1
    : BigInt(a.startTimeUnixNano) > BigInt(b.startTimeUnixNano) ? 1 : a.id.localeCompare(b.id));
  return { records: spans, rejectedRecords, issues: [...issues] };
}

export function normalizeLogs(records: StorageRecord[], scope: TelemetryQueryScope) {
  const issues = new Set<TelemetryIssue>();
  const logs: TelemetryLog[] = [];
  let rejectedRecords = 0;
  const occurrences = new Map<string, number>();
  for (const record of records) {
    if (record["harakiri.schema.version"] !== "1" || !binding(record, "", scope)
      || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(record._time) || !Number.isFinite(Date.parse(record._time))) {
      rejectedRecords++; issues.add(record["harakiri.schema.version"] !== "1" ? "unsupported_schema" : "invalid_record"); continue;
    }
    const localIssues = new Set<TelemetryIssue>();
    const read = reader(record, localIssues);
    const state = contentState(record, "", scope);
    const log: TelemetryLog = {
      id: "", time: record._time, observedTimeUnixNano: nano(record.observed_time_unix_nano),
      sandboxId: record["harakiri.sandbox.id"], traceId: validId(record.trace_id, 32) ? record.trace_id : null,
      spanId: validId(record.span_id, 16) ? record.span_id : null,
      severity: read("severity_text", 32) ?? "UNKNOWN",
      severityNumber: /^(?:[0-9]|1[0-9]|2[0-4])$/.test(record.severity_number) ? Number(record.severity_number) : null,
      serviceName: read("service.name", 128), source: "workload", attributes: attributes(read, "", metadataKeys),
      content: { state, body: state === "available" ? read("_msg", 16_384) : null,
        attributes: state === "available" ? attributes(read, "", contentKeys, 32768) : {} }, issues: []
    };
    if (record["harakiri.content.truncated"] === "true") localIssues.add("truncated_record");
    log.issues = [...localIssues];
    const fingerprint = hash(log);
    const occurrence = (occurrences.get(fingerprint) ?? 0) + 1;
    occurrences.set(fingerprint, occurrence);
    log.id = `${fingerprint}:${occurrence}`;
    logs.push(log);
    for (const issue of localIssues) issues.add(issue);
  }
  // Logs lack OTLP record IDs. Identical lines may be real repeats, not retries;
  // never silently deduplicate them or infer exact delivery counts.
  return { records: logs, rejectedRecords, issues: [...issues] };
}
