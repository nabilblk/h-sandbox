import { memo, useCallback, useMemo, useState } from "react";
import type { TelemetryLog, TelemetrySpan, TelemetryWindow } from "@harakiri/shared";
import { observabilityApi } from "../api-client/observability";
import { logLevel, matchesLog, type LogLevel } from "../observability";
import { useWorkbenchQuery } from "../use-workbench-query";
import { Icon } from "./icon";
import { CopyTelemetry } from "./telemetry-value";

const logTime = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 });
const LogRecord = memo(function LogRecord({ log, includeContent, onSelect }: {
  log: TelemetryLog; includeContent: boolean; onSelect: (id: string) => void;
}) {
  const body = includeContent && log.content.state === "available" ? log.content.body : null;
  return <article className={`trace-log log-${logLevel(log)}`}>
    <header><strong className="log-level">{log.severity || "Unspecified"}</strong><time dateTime={log.time} title={log.time}>{logTime.format(new Date(log.time))}</time>
      <span className="log-service" title={log.serviceName ?? undefined}>{log.serviceName}</span>
      {log.traceId && log.spanId ? <button type="button" className="btn btn-ghost runs-icon" title="Open correlated step" aria-label="Open correlated step" onClick={() => onSelect(`${log.traceId}:${log.spanId}`)}><Icon name="arrowR" size={13} /></button> : null}
      {body !== null ? <CopyTelemetry value={body} label="log body" /> : null}
    </header>
    {body !== null ? <pre tabIndex={0}>{body}</pre> : <p className="log-hidden"><Icon name="lock" size={12} />{log.content.state === "not_captured" ? "Body not captured" : "Content hidden"}</p>}
    {log.issues.length ? <small>{log.issues.join(", ")}</small> : null}
  </article>;
});

export function RunLogs({ runId, span, window, includeContent, following, onSelect }: {
  runId: string; span?: TelemetrySpan; window: TelemetryWindow; includeContent: boolean; following: boolean; onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<LogLevel | "all">("all");
  const key = `${runId}:${span?.id ?? ""}:${includeContent}:${window.from}:${window.to}`;
  const load = useCallback(async (signal: AbortSignal) => ({ key, snapshot: await observabilityApi.logs(runId, {
    ...window, includeContent, traceId: span?.traceId, spanId: span?.spanId, limit: 500
  }, signal) }), [key]);
  const state = useWorkbenchQuery(load, following ? 5000 : 0);
  const snapshot = !state.error && state.data?.key === key ? state.data.snapshot : undefined;
  const records = useMemo(() => snapshot?.records.filter((log) => matchesLog(log, search, level, includeContent)) ?? [], [snapshot, search, level, includeContent]);
  return <div className="trace-log-view" aria-label="Retained agent logs" aria-busy={state.loading}>
    <div className="log-filters">
      <label className="runs-search"><Icon name="search" /><input type="search" aria-label="Search loaded logs" placeholder="Search loaded logs" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <select className="input" aria-label="Log severity" value={level} onChange={(event) => setLevel(event.target.value as LogLevel | "all")}>
        <option value="all">All levels</option><option value="error">Error</option><option value="warning">Warning</option><option value="info">Info</option><option value="debug">Debug / trace</option><option value="other">Other</option>
      </select>
      <span className="log-read-count">{records.length} / {snapshot?.records.length ?? 0} loaded records</span>
    </div>
    {state.error ? <div className="runs-notice" role="alert">{state.error}<button className="btn btn-sm" onClick={state.refresh}>Retry</button></div> : null}
    {snapshot?.partial ? <p role="status" className="runs-notice">Partial read: {snapshot.issues.join(", ")}. Filters apply to loaded records. Narrow the time window.</p> : null}
    {records.map((log) => <LogRecord key={log.id} log={log} includeContent={includeContent} onSelect={onSelect} />)}
    {!records.length && !state.error ? <div className="runs-empty" role="status"><Icon name="logs" size={22} /><h3>{state.loading ? "Reading logs..." : search || level !== "all" ? "No matching logs" : "No correlated logs"}</h3>
      <p>{search || level !== "all" ? "No loaded records match these filters." : "No log records were observed for this selection and time window."}</p>
      {search || level !== "all" ? <button className="btn btn-sm" onClick={() => { setSearch(""); setLevel("all"); }}>Clear filters</button> : null}</div> : null}
  </div>;
}
