import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Icon } from "../components/icon";
import { boundedLogs, filterLogs } from "../workbench";
import { useWorkbenchQuery } from "../use-workbench-query";

export function SandboxLogsPane({ id }: { id: string }) {
  const [following, follow] = useState(false);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [level, setLevel] = useState("");
  const rows = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const load = useCallback(async (signal: AbortSignal) => boundedLogs((await api.logs(id, signal)).logs), [id]);
  const snapshot = useWorkbenchQuery(load, following ? 3000 : 0);
  const logs = snapshot.data?.logs ?? [];
  const sources = [...new Set(logs.map((log) => log.source ?? "control-plane"))].sort();
  const levels = [...new Set(logs.map((log) => log.lvl))].sort();
  const visible = filterLogs(logs, search, source, level);
  useEffect(() => {
    if (following && stickToBottom.current && rows.current) rows.current.scrollTop = rows.current.scrollHeight;
  }, [following, snapshot.data]);
  return <section className="workbench-logs" aria-label="Log viewer">
    <div className="workbench-toolbar">
      <input type="search" className="input" aria-label="Search logs" placeholder="Search logs" value={search} onChange={(event) => setSearch(event.target.value)} />
      <select className="input" aria-label="Log source" value={source} onChange={(event) => setSource(event.target.value)}><option value="">All sources</option>{sources.map((value) => <option key={value}>{value}</option>)}</select>
      <select className="input" aria-label="Log level or event" value={level} onChange={(event) => setLevel(event.target.value)}><option value="">All levels / events</option>{levels.map((value) => <option key={value}>{value}</option>)}</select>
      <label className="workbench-toggle"><input type="checkbox" checked={following} onChange={(event) => { stickToBottom.current = true; follow(event.target.checked); }} /> Follow</label>
      <button className="btn btn-sm" disabled={snapshot.loading} onClick={snapshot.refresh} title="Refresh logs" aria-label="Refresh logs"><Icon name="refresh" /></button>
    </div>
    <div className="workbench-file-status"><span>{visible.length} / {logs.length} entries</span><span>{snapshot.observedAt ? `Snapshot ${new Date(snapshot.observedAt).toLocaleTimeString()}` : "No snapshot yet"}</span>{following ? <span>Refreshing every 3s</span> : null}</div>
    <div ref={rows} className="logs-pane rich-logs workbench-log-rows" role="region" aria-label="Sandbox logs" aria-busy={snapshot.loading} onScroll={(event) => { const node = event.currentTarget; stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 40; }}>
      {snapshot.error ? <p className="workbench-notice" role="alert">{snapshot.error}{logs.length ? " Displaying the last successful snapshot." : ""}</p> : null}
      {snapshot.data?.omitted ? <p className="workbench-notice" role="status">{snapshot.data.omitted} entries omitted by the display limit.</p> : null}
      <div className="logs-row logs-head"><span>Time</span><span>Source</span><span>Level / Event</span><span>Message</span></div>
      {visible.map((log, index) => <div key={index} className="logs-row">
        <span className="ts" title={log.ts}>{new Date(log.ts).toLocaleTimeString()}</span><span className="tag">{log.source ?? "control-plane"}</span>
        <span className={`lvl ${["info", "warn", "error"].includes(log.lvl.toLowerCase()) ? log.lvl.toLowerCase() : ""}`}>{log.lvl.toUpperCase().split(".").map((part, index, parts) => <Fragment key={index}>{part}{index < parts.length - 1 ? <>.<wbr /></> : null}</Fragment>)}</span>
        <span className="log-msg">{log.msg}</span>
      </div>)}
      {!visible.length && !snapshot.error ? <div className="empty-state" role="status">{snapshot.loading && !snapshot.data ? "Loading logs..." : logs.length ? "No matching logs." : "No runtime or control-plane logs have been recorded yet."}</div> : null}
    </div>
  </section>;
}
