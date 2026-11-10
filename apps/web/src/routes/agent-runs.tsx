import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AgentOutcome, ObservabilityPolicy, TelemetryWindow } from "@harakiri/shared";
import { observabilityApi } from "../api-client/observability";
import { Icon } from "../components/icon";
import { agentRunRoute, captureEvidence } from "../observability";
import { AgentRunDetail } from "./agent-run-detail";
import { useWorkbenchQuery } from "../use-workbench-query";
import type { GoToRoute } from "./types";

function CaptureSettings({ policy, onSaved }: { policy: ObservabilityPolicy; onSaved: () => void }) {
  const [enabled, setEnabled] = useState(policy.enabled);
  const [content, setContent] = useState(policy.allowContent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await observabilityApi.configure({ enabled, allowContent: content }); onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Capture policy could not be saved."); }
    finally { setBusy(false); }
  };
  if (!policy.canConfigure || !policy.available) return null;
  return <details className="runs-settings"><summary><Icon name="settings" /> Capture policy</summary>
    <form onSubmit={(event) => void save(event)}>
      <label className="workbench-toggle"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Accept agent telemetry</label>
      <label className="workbench-toggle"><input type="checkbox" disabled={!policy.operatorAllowsContent} checked={content} onChange={(event) => setContent(event.target.checked)} /> Allow sensitive content</label>
      <p>{policy.operatorAllowsContent ? "Content requires per-run opt-in. Prompts, outputs and log bodies may contain secrets." : "Content capture is disabled by the operator."}</p>
      <p>{policy.retentionDays}-day read window. Disabling capture revokes grants; previously accepted data is retained.</p>
      {error ? <p role="alert">{error}</p> : null}
      <button type="submit" className="btn btn-primary" disabled={busy || (enabled === policy.enabled && content === policy.allowContent)}>{busy ? "Saving..." : "Save policy"}</button>
    </form>
  </details>;
}

export type RunsProps = { sandboxId?: string; runId?: string; stepId?: string; readWindow?: TelemetryWindow; go: GoToRoute };

export function AgentRunsRoute(props: RunsProps) {
  return props.runId ? <AgentRunDetail key={props.runId} {...props} runId={props.runId} /> : <AgentRunList sandboxId={props.sandboxId} go={props.go} />;
}

function AgentRunList({ sandboxId, go }: Pick<RunsProps, "sandboxId" | "go">) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<AgentOutcome | "">("");
  const [pages, setPages] = useState<Array<string | undefined>>([undefined]);
  const cursor = pages.at(-1);
  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPages([undefined]); }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const key = `${sandboxId ?? ""}:${query}:${outcome}:${cursor ?? ""}`;
  const load = useCallback(async (signal: AbortSignal) => {
    const policy = await observabilityApi.policy(signal);
    const page = policy.available ? await observabilityApi.runs({ sandboxId, search: query, outcome: outcome || undefined, cursor, limit: 50 }, signal)
      : { runs: [], nextCursor: null };
    return { policy, page, key };
  }, [key]);
  const state = useWorkbenchQuery(load);
  const data = !state.error && state.data?.key === key ? state.data : undefined;
  return <section className="runs-page" aria-label="Agent runs">
    <header className="runs-heading"><div><h1>Agent runs</h1><span className="runs-muted">{sandboxId ?? "All observed runs"}</span></div>
      <div className="runs-heading-actions"><a className="btn btn-ghost" href="#docs/agent-observability"><Icon name="book" />Documentation</a>
        <button className="btn runs-icon" title="Refresh runs" aria-label="Refresh runs" onClick={state.refresh} disabled={state.loading}><Icon name="refresh" /></button></div>
    </header>
    {state.error ? <p role="alert" className="runs-notice">{state.error}</p> : null}
    {data && !data.policy.available ? <div className="runs-empty"><h2>Agent observability is not installed</h2><a href="#docs/agent-observability">Installation requirements</a></div> : <>
      {data ? <div className="runs-policy-line"><span className={`runs-status ${data.policy.enabled ? "recording" : ""}`}>{data.policy.enabled ? "Capture enabled" : "Capture disabled"}</span>
        <span>{data.policy.retentionDays}-day read window</span><CaptureSettings key={`${data.policy.enabled}:${data.policy.allowContent}`} policy={data.policy} onSaved={state.refresh} /></div> : null}
      <div className="runs-tools"><label className="runs-search"><Icon name="search" /><input type="search" aria-label="Search runs" placeholder="Search name or run ID" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <select className="input" aria-label="Reported outcome" value={outcome} onChange={(event) => { setOutcome(event.target.value as AgentOutcome | ""); setPages([undefined]); }}>
          <option value="">All outcomes</option><option value="succeeded">Succeeded</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option><option value="unknown">Unknown</option>
        </select></div>
      <div className="runs-table-wrap" role="region" aria-label="Run list" tabIndex={0} aria-busy={state.loading}>
        <table className="runs-table"><thead><tr><th>Run</th><th>Reported outcome</th><th>Capture</th><th>Ingestion evidence</th><th>Started</th></tr></thead>
          <tbody>{data?.page.runs.map((run) => <tr key={run.id}>
            <td><a className="runs-name" href={`#${agentRunRoute(run.id, undefined, sandboxId)}`} onClick={(event) => { if (!event.metaKey && !event.ctrlKey) { event.preventDefault(); go(agentRunRoute(run.id, undefined, sandboxId)); } }}>
              <strong><Icon name="chart" size={14} />{run.name}</strong><code title={run.id}>{run.id}</code></a></td>
            <td><span className={`runs-status ${run.reportedOutcome}`}>{run.reportedOutcome}</span>{run.recording ? <small className="runs-recording">Recording open</small> : null}</td>
            <td><span className="runs-capture"><Icon name={run.capture === "metadata" ? "lock" : "file"} size={12} />{run.capture === "metadata" ? "Metadata only" : "Content enabled"}</span></td><td><span className="runs-ingestion">{captureEvidence(run)}</span></td>
            <td><time dateTime={run.createdAt}>{new Date(run.createdAt).toLocaleString()}</time></td>
          </tr>)}</tbody></table>
        {!data?.page.runs.length && !state.error ? <p className="runs-empty" role="status">{state.loading ? "Loading runs..." : query || outcome ? "No runs match these filters." : "No agent runs recorded."}</p> : null}
      </div>
      <footer className="runs-pagination"><span>{data?.page.runs.length ?? 0} runs on this page</span><button className="btn btn-sm" disabled={pages.length === 1 || state.loading} onClick={() => setPages((previous) => previous.slice(0, -1))}>Previous</button>
        <button className="btn btn-sm" disabled={!data?.page.nextCursor || state.loading} onClick={() => { if (data?.page.nextCursor) setPages((previous) => [...previous, data.page.nextCursor!]); }}>Next</button></footer>
    </>}
  </section>;
}
