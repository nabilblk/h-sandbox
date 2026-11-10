import type { TelemetryIssue, TelemetryQuery, TelemetrySnapshot, TelemetryStore } from "./model.js";
import { normalizeLogs, normalizeSpans, type StorageRecord } from "./normalize.js";

export class TelemetryQueryError extends Error {
  constructor(readonly statusCode: number, readonly code: "telemetry_query_invalid" | "telemetry_query_unavailable" | "telemetry_query_limit_exceeded") {
    super(code);
    this.name = "TelemetryQueryError";
  }
}

const responseLimit = 16 * 1024 * 1024;
const recordLimit = 1024 * 1024;
const invalid = () => new TelemetryQueryError(400, "telemetry_query_invalid");
const unavailable = () => new TelemetryQueryError(503, "telemetry_query_unavailable");
const tooLarge = () => new TelemetryQueryError(422, "telemetry_query_limit_exceeded");

function destination(input: string) {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Telemetry storage URL must be an operator-configured HTTP(S) origin");
  }
  return new URL("/select/logsql/query", url);
}

function validate(query: TelemetryQuery) {
  if (!Number.isInteger(query.tenantId) || query.tenantId < 1 || query.tenantId > 999_999_999
    || !/^[A-Za-z0-9_-]{1,128}$/.test(query.organizationId) || !/^run_[A-Za-z0-9_-]{1,64}$/.test(query.runId)
    || !Number.isInteger(query.limit) || query.limit < 1 || query.limit > 1000 || typeof query.includeContent !== "boolean") throw invalid();
  for (const date of [query.from, query.to]) {
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString() !== date) throw invalid();
  }
  const range = Date.parse(query.to) - Date.parse(query.from);
  if (range <= 0 || range > 31 * 86_400_000) throw invalid();
  if (query.traceId !== undefined && !/^(?!0{32}$)[0-9a-f]{32}$/.test(query.traceId)) throw invalid();
  if (query.spanId !== undefined && (!query.traceId || !/^(?!0{16}$)[0-9a-f]{16}$/.test(query.spanId))) throw invalid();
}

function expression(query: TelemetryQuery, signal: "traces" | "logs") {
  const prefix = signal === "traces" ? "resource_attr:" : "";
  const exact = (field: string, value: string) => `${JSON.stringify(field)}:=${JSON.stringify(value)}`;
  const filters = [
    `_time:[${query.from},${query.to})`,
    exact(`${prefix}harakiri.org.id`, query.organizationId), exact(`${prefix}harakiri.run.id`, query.runId)
  ];
  if (query.traceId) filters.push(exact("trace_id", query.traceId));
  if (query.spanId) filters.push(exact("span_id", query.spanId));
  // A bounded top-k sort, not an unbounded sort followed by a client-side slice.
  return `${filters.join(" AND ")} | sort by (_time, trace_id, span_id) limit ${query.limit + 1}`;
}

async function readRecords(response: Response, maximum: number): Promise<StorageRecord[]> {
  if (!response.body) throw unavailable();
  const records: StorageRecord[] = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, pending = "";
  const parse = (line: string) => {
    if (!line.trim()) return;
    if (Buffer.byteLength(line) > recordLimit || records.length >= maximum) throw tooLarge();
    const value: unknown = JSON.parse(line);
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.values(value).some((item) => typeof item !== "string")) throw unavailable();
    records.push(value as StorageRecord);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) { pending += decoder.decode(); parse(pending); return records; }
      bytes += value.byteLength;
      if (bytes > responseLimit) throw tooLarge();
      pending += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = pending.indexOf("\n")) !== -1) { parse(pending.slice(0, end)); pending = pending.slice(end + 1); }
      if (Buffer.byteLength(pending) > recordLimit) throw tooLarge();
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Storage-only adapter. Callers must first authorize the run and content scope. */
export function createVictoriaTelemetryStore(options: {
  logsUrl: string; tracesUrl: string; fetch?: typeof globalThis.fetch; now?: () => number;
}): TelemetryStore {
  const destinations = { logs: destination(options.logsUrl), traces: destination(options.tracesUrl) };
  const fetch = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  async function read<T>(signal: "traces" | "logs", query: TelemetryQuery,
    normalize: (records: StorageRecord[], query: TelemetryQuery) => { records: T[]; rejectedRecords: number; issues: TelemetryIssue[] }
  ): Promise<TelemetrySnapshot<T>> {
    validate(query);
    const readAt = new Date(now()).toISOString();
    try {
      const response = await fetch(destinations[signal], {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
        headers: { AccountID: String(query.tenantId), ProjectID: "0", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ query: expression(query, signal), timeout: "4s", allow_partial_response: "0" })
      });
      if (response.status !== 200) { await response.body?.cancel(); throw unavailable(); }
      if (response.headers.get("AccountID") !== String(query.tenantId) || response.headers.get("ProjectID") !== "0") {
        await response.body?.cancel(); throw unavailable();
      }
      const records = await readRecords(response, query.limit + 1);
      const result = normalize(records.slice(0, query.limit), query);
      if (records.length > query.limit) result.issues.push("record_limit");
      return { ...result, window: { from: query.from, to: query.to }, readAt,
        consistency: "eventual", scannedRecords: Math.min(records.length, query.limit), partial: result.issues.length > 0 };
    } catch (error) {
      if (error instanceof TelemetryQueryError) throw error;
      // Backend diagnostics can include rejected content, queries or internal URLs.
      throw unavailable();
    }
  }
  return { spans: (query) => read("traces", query, normalizeSpans), logs: (query) => read("logs", query, normalizeLogs) };
}
