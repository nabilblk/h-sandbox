import { useCallback, useMemo, useRef, useState } from "react";
import { observabilityApi } from "../api-client/observability";
import { Icon } from "../components/icon";
import { TraceTree } from "../components/trace-tree";
import { TraceInspector, type InspectorTab } from "../components/trace-inspector";
import { CopyTelemetry } from "../components/telemetry-value";
import { TelemetryWindowPicker } from "../components/telemetry-window";
import { agentRunRoute, captureEvidence, defaultTelemetryWindow, durationLabel, nextErrorSpan, observedUsage, stepKind, traceRange, traceRows, type TelemetryRange } from "../observability";
import { useWorkbenchQuery } from "../use-workbench-query";
import type { RunsProps } from "./agent-runs";

const tabs: InspectorTab[] = ["overview", "logs", "data"];

export function AgentRunDetail({ runId, stepId, sandboxId, readWindow, go }: RunsProps & { runId: string }) {
  const [content, setContent] = useState(false);
  const [following, setFollowing] = useState(false);
  const [range, setRange] = useState<TelemetryRange>("run");
  const [editingWindow, setEditingWindow] = useState(false);
  const [tab, setTab] = useState<InspectorTab>("overview");
  const [split, setSplit] = useState(46);
  const [message, setMessage] = useState("");
  const layout = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const key = `${sandboxId ?? ""}:${runId}:${range}:${content}:${readWindow?.from ?? ""}:${readWindow?.to ?? ""}`;
  const load = useCallback(async (signal: AbortSignal) => {
    const [{ run }, policy] = await Promise.all([observabilityApi.run(runId, signal), observabilityApi.policy(signal)]);
    if (sandboxId && !run.sandboxIds.includes(sandboxId)) throw new Error("This run is not associated with the selected sandbox.");
    const window = readWindow ?? defaultTelemetryWindow(run.createdAt, range);
    const spans = run.expired ? undefined : await observabilityApi.spans(runId, { ...window, includeContent: content, limit: 1000 }, signal);
    return { run, policy, spans, window, key };
  }, [key]);
  const state = useWorkbenchQuery(load, following ? 5000 : 0);
  const data = !state.error && state.data?.key === key ? state.data : undefined;
  const spans = useMemo(() => data?.spans?.records ?? [], [data?.spans]);
  const ordered = useMemo(() => traceRows(spans, new Set()).map(({ span }) => span), [spans]);
  const selected = stepId ? spans.find((span) => span.id === stepId) : ordered[0];
  const selectedIndex = ordered.findIndex((span) => span.id === selected?.id);
  const timeline = useMemo(() => traceRange(spans), [spans]);
  const usage = useMemo(() => observedUsage(spans, data?.spans?.partial), [spans, data?.spans?.partial]);
  const errors = spans.filter((span) => span.status === "error");
  const selectStep = (id: string) => {
    setMessage("");
    const top = window.scrollY;
    go(agentRunRoute(runId, id, sandboxId, readWindow));
    window.scrollTo(0, top);
  };
  const jumpError = () => {
    const next = nextErrorSpan(spans, selected?.id);
    if (next) {
      selectStep(next.id);
      setTab(next.attributes["error.type"] && !next.attributes["harakiri.command.id"] ? "overview" : "logs");
    }
  };
  const copy = async () => {
    const url = new URL(window.location.href);
    url.hash = agentRunRoute(runId, stepId, sandboxId, data?.window ?? readWindow);
    try { await navigator.clipboard.writeText(url.href); setMessage("Run link copied."); }
    catch { setMessage("Clipboard unavailable."); }
  };
  const exportRead = () => {
    if (!data?.spans) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ run: data.run, ...data.spans }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `${runId}-spans.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="runs-page runs-detail" aria-label="Agent run detail">
    <header className="runs-heading">
      <div className="runs-title"><a href={`#${agentRunRoute(undefined, undefined, sandboxId)}`} onClick={(event) => { if (!event.metaKey && !event.ctrlKey) { event.preventDefault(); go(agentRunRoute(undefined, undefined, sandboxId)); } }}><span className="icon-reverse"><Icon name="arrowR" size={12} /></span>All runs</a>
        <h1>{data?.run.name ?? runId}</h1>
        <div className="run-id"><code title={runId}>{runId}</code><CopyTelemetry label="run ID" value={runId} /></div>
      </div>
      <div className="runs-heading-actions"><button className="btn runs-icon" aria-label="Copy run link" title="Copy run link" onClick={() => void copy()}><Icon name="copy" /></button>
        <button className="btn" disabled={!data?.spans} onClick={exportRead}><Icon name="file" />Export JSON</button><button className="btn runs-icon" title="Refresh run" aria-label="Refresh run" onClick={state.refresh} disabled={state.loading}><Icon name="refresh" /></button></div>
    </header>
    {message ? <p role="status" className="runs-notice">{message}</p> : null}
    {state.error ? <div role="alert" className="runs-notice">{state.error}<button className="btn btn-sm" onClick={state.refresh}>Retry</button></div> : null}
    <div className="run-summary" aria-label="Run summary">
      <span className={`runs-status ${data?.run.reportedOutcome ?? "unknown"}`} title="Outcome reported by the workload"><i />{data?.run.reportedOutcome ?? "Unknown"}</span>
      <span><strong>{timeline.observedDuration === null ? "Unknown" : `${timeline.partial ? "At least " : ""}${durationLabel(timeline.observedDuration.toString())}`}</strong><small>observed duration</small></span>
      <span><strong>{spans.length}</strong><small>observed steps</small></span>
      {errors.length ? <button className="run-error-jump" onClick={jumpError} aria-label={`Review errors (${errors.length})`}><span>{errors.length} {errors.length === 1 ? "error" : "errors"}</span><Icon name="arrowR" size={13} /></button> : null}
      {usage.calls > 0 ? <span><strong title={usage.names.join(", ")}>{usage.names[0] ?? "Unknown model"}{usage.names.length > 1 ? ` +${usage.names.length - 1}` : ""}</strong><small>{usage.input?.toLocaleString() ?? "Unknown"} in / {usage.output?.toLocaleString() ?? "Unknown"} out{usage.partial ? " / partial" : ""}</small></span> : null}
      <details className="run-evidence"><summary><Icon name="lock" size={12} />{data?.run.capture === "content" ? "Content enabled" : data?.run.capture === "metadata" ? "Metadata only" : "Capture unknown"}<Icon name="chevDown" size={11} /></summary>
        <div><h3>Capture evidence</h3><p>{data ? captureEvidence(data.run) : "Unknown"}</p><dl><dt>Started</dt><dd>{data ? new Date(data.run.createdAt).toLocaleString() : "Unknown"}</dd><dt>Models</dt><dd>{usage.names.join(", ") || "Unknown / not reported"}</dd><dt>Retention</dt><dd>{data ? `${data.policy.retentionDays}-day read window` : "Unknown"}</dd></dl><p>Workload-reported evidence. Acknowledgement does not attest complete capture or durable storage.</p></div>
      </details>
    </div>
    <div className="runs-tools run-toolbar"><select aria-label="Trace time window" className="input" value={editingWindow || readWindow ? "custom" : range} onChange={(event) => {
      if (event.target.value === "custom") { setEditingWindow(true); return; }
      setEditingWindow(false); setRange(event.target.value as TelemetryRange); go(agentRunRoute(runId, stepId, sandboxId));
    }}><option value="run">Run window</option><option value="15m">Last 15 minutes</option><option value="1h">Last hour</option><option value="custom">Custom range</option></select>
      {readWindow && !editingWindow ? <button className="btn btn-sm" onClick={() => setEditingWindow(true)}>Edit range</button> : null}
      <label className="workbench-toggle"><input type="checkbox" checked={following} onChange={(event) => setFollowing(event.target.checked)} /> Follow</label>
      <label className="workbench-toggle"><input type="checkbox" checked={content} disabled={!data?.policy.canReadContent && !content} onChange={(event) => setContent(event.target.checked)} /> Sensitive content</label>
      <span className="runs-read-status"><i className={following ? "is-following" : ""} />{state.loading ? "Reading..." : data?.spans ? `Updated ${new Date(data.spans.readAt).toLocaleTimeString()}` : "No read"}</span>
    </div>
    {editingWindow && (data?.window || readWindow) ? <TelemetryWindowPicker value={data?.window ?? readWindow!} onApply={(window) => {
      setEditingWindow(false); go(agentRunRoute(runId, stepId, sandboxId, window));
    }} /> : null}
    {data?.spans?.partial ? <p role="status" className="runs-notice">Partial read: {data.spans.issues.join(", ")}. {data.spans.issues.includes("record_limit") ? "The record limit was reached." : "Some records or relationships are incomplete."}</p> : null}
    {data?.run.expired ? <p className="runs-empty">The telemetry read window has expired. Run metadata is retained.</p> : <div className="trace-layout" ref={layout}>
      <div className="trace-browser" style={{ flexBasis: `${split}%` }}><TraceTree spans={spans} selected={selected?.id} onSelect={selectStep} /></div>
      <div className="trace-divider" role="separator" tabIndex={0} aria-label="Resize trace navigation" aria-orientation="vertical" aria-valuemin={35} aria-valuemax={65} aria-valuenow={split}
        onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); setSplit((previous) => event.key === "Home" ? 35 : event.key === "End" ? 65 : Math.min(65, Math.max(35, previous + (event.key === "ArrowRight" ? 2 : -2)))); } }}
        onPointerDown={(event) => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={(event) => { if (dragging.current && layout.current) { const rect = layout.current.getBoundingClientRect(); setSplit(Math.min(65, Math.max(35, (event.clientX - rect.left) / rect.width * 100))); } }}
        onPointerUp={(event) => { dragging.current = false; event.currentTarget.releasePointerCapture(event.pointerId); }} onLostPointerCapture={() => { dragging.current = false; }} />
      <aside className="trace-inspector" aria-label="Step inspector">
        <header className="trace-selection"><div><span className={`trace-type trace-${selected ? stepKind(selected) : "agent"}`}>{selected ? stepKind(selected) : "Step"}</span><h2>{selected?.name ?? "Select a step"}</h2><span className="runs-muted">{selected ? durationLabel(selected.durationNano) : ""}</span></div>
          <div className="trace-step-controls"><button className="btn btn-ghost runs-icon icon-reverse" aria-label="Previous step" title="Previous step" disabled={selectedIndex <= 0} onClick={() => selectStep(ordered[selectedIndex - 1].id)}><Icon name="arrowR" /></button>
            <button className="btn btn-ghost runs-icon" aria-label="Next step" title="Next step" disabled={selectedIndex < 0 || selectedIndex >= ordered.length - 1} onClick={() => selectStep(ordered[selectedIndex + 1].id)}><Icon name="arrowR" /></button></div>
        </header>
        <div className="trace-inspector-tabs" role="tablist" aria-label="Step details">{tabs.map((value, index) => <button key={value} id={`trace-tab-${value}`} role="tab" aria-selected={tab === value} aria-controls="trace-panel" tabIndex={tab === value ? 0 : -1} className={tab === value ? "active" : ""} onClick={() => setTab(value)}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
            setTab(tabs[next]); document.getElementById(`trace-tab-${tabs[next]}`)?.focus();
          }}>{value === "data" ? "Content" : value === "logs" ? "Logs" : "Overview"}</button>)}</div>
        <div id="trace-panel" role="tabpanel" aria-labelledby={`trace-tab-${tab}`} tabIndex={0}>
          {stepId && !selected ? <p className="runs-notice">The selected step is not present in this read window.</p> : null}
          {data?.spans ? <TraceInspector span={selected} spans={spans} tab={tab} runId={runId} window={data.window} includeContent={content} following={following} onSelect={selectStep} canReveal={data.policy.canReadContent} onReveal={() => setContent(true)} /> : <p className="runs-empty">{state.loading ? "Reading trace..." : "Telemetry is unavailable."}</p>}
        </div>
      </aside>
    </div>}
    <footer className="runs-footnote"><span>{data?.spans ? "Workload-reported / eventually consistent" : "No telemetry evidence available"}</span><span>Bounded snapshot{data?.spans?.partial ? " / partial" : ""}</span></footer>
  </section>;
}
