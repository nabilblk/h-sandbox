import { useEffect, useState, type FormEvent } from "react";
import type { SandboxFileEntry, SandboxRouteSummary, SandboxSummary } from "@harakiri/shared";
import { api } from "../api";
import { Brand } from "../components/brand";
import { Icon } from "../components/icon";
import { Chart, KPI } from "../components/ui";
import { formatBytes, formatDateTime } from "../format";
import type { GoToRoute } from "./types";

export const SandboxDetailRoute = ({ id, go }: { id: string; go: GoToRoute }) => {
  const [sandbox, setSandbox] = useState<SandboxSummary | null>(null);
  const [tab, setTab] = useState("terminal");
  useEffect(() => { api.sandbox(id).then((r) => setSandbox(r.sandbox)).catch(() => undefined); }, [id]);
  if (!sandbox) return <div className="dash-page">Loading...</div>;
  return <div className="detail"><aside className="dash-side" style={{ padding: "16px 0" }}><div className="dash-side-brand" style={{ padding: "6px 20px 16px" }}><Brand /></div><div style={{ padding: "0 12px 12px" }}><button className="btn btn-sm" style={{ width: "100%" }} onClick={() => go("dashboard/sandboxes")}><Icon name="chevron" size={11} style={{ transform: "rotate(180deg)" }} /> All sandboxes</button></div></aside><main className="detail-main"><div className="detail-top"><div style={{ display: "flex", alignItems: "baseline", gap: 10, flex: 1 }}><span className="detail-name">{sandbox.name}</span><span className="detail-id">{sandbox.id}</span><span className={`pill ${sandbox.status === "running" ? "live" : ""}`}><span className="dot" /> {sandbox.status}</span><span className="tag">{sandbox.template}</span></div><button className="btn btn-sm" style={{ color: "var(--err)" }} onClick={() => api.killSandbox(sandbox.id).then(() => api.sandbox(id).then((r) => setSandbox(r.sandbox)))}><Icon name="stop" size={11} /> Kill</button></div><div className="detail-tabs">{[["terminal", "Terminal", "terminal"], ["files", "Filesystem", "file"], ["logs", "Logs", "logs"], ["metrics", "Metrics", "chart"], ["network", "Network", "globe"]].map(([k, label, icon]) => <button key={k} className={`detail-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}><Icon name={icon} size={12} /> {label}</button>)}</div><div className="detail-body">{tab === "terminal" ? <TerminalPane sandbox={sandbox} /> : null}{tab === "files" ? <FilesPane id={sandbox.id} /> : null}{tab === "logs" ? <LogsPane id={sandbox.id} /> : null}{tab === "metrics" ? <MetricsPane id={sandbox.id} /> : null}{tab === "network" ? <NetworkPane sandbox={sandbox} /> : null}</div></main></div>;
};

type TerminalLine = { kind: "cmd" | "stdout" | "stderr" | "muted" | "ok"; text: string };

const splitOutput = (text: string, kind: TerminalLine["kind"]) =>
  text.split(/\r?\n/).filter(Boolean).map((line) => ({ kind, text: line }));

const TerminalPane = ({ sandbox }: { sandbox: SandboxSummary }) => {
  const [lines, setLines] = useState<TerminalLine[]>([
    { kind: "muted", text: "harakiri v0.41.2 - attaching to " + sandbox.id },
    { kind: "muted", text: "connection sealed - TTL " + sandbox.ttlSeconds + "s" }
  ]);
  const [input, setInput] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const cmd = input.trim();
    setInput("");
    setLines((current) => [...current, { kind: "cmd", text: cmd }]);
    try {
      const response = await api.run(sandbox.id, { command: cmd });
      const result = response.result;
      setLines((current) => [
        ...current,
        ...splitOutput(result.stdout, "stdout"),
        ...splitOutput(result.stderr, "stderr"),
        { kind: result.exitCode === 0 ? "ok" : "stderr", text: `exit=${result.exitCode} runtime=${(result.durationMs / 1000).toFixed(2)}s` }
      ]);
    } catch (error) {
      setLines((current) => [...current, { kind: "stderr", text: error instanceof Error ? error.message : "command failed" }]);
    }
  };
  return <div className="term-pane"><div className="file-tree"><div className="ft-section">Workspace</div><div className="ft-row active"><Icon name="terminal" size={12} /><span className="ft-name">live shell</span></div><div className="ft-row"><Icon name="file" size={12} /><span className="ft-name">stdout</span></div><div className="ft-row"><Icon name="logs" size={12} /><span className="ft-name">stderr</span></div></div><div className="term">{lines.map((line, index) => <div key={index} className={`term-line ${line.kind}`}>{line.text}</div>)}<form className="term-input" onSubmit={submit}><input value={input} onChange={(e) => setInput(e.target.value)} autoFocus placeholder="Run a command..." /><span className="blink" style={{ color: "#e6e3da" }}>|</span></form></div><div className="detail-side"><div className="ds-section"><div className="ds-h">Instance</div><div className="ds-row"><span className="l">vCPU</span><span className="v">1</span></div><div className="ds-row"><span className="l">Memory</span><span className="v">1 GiB</span></div><div className="ds-row"><span className="l">TTL</span><span className="v">{sandbox.ttlSeconds}s</span></div></div></div></div>;
};

const FilesPane = ({ id }: { id: string }) => {
  const [cwd, setCwd] = useState<string | undefined>();
  const [files, setFiles] = useState<SandboxFileEntry[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { api.files(id, cwd).then((r) => { setCwd(r.cwd); setFiles(r.files); setError(""); }).catch((err) => { setFiles([]); setError(err instanceof Error ? err.message : "Filesystem unavailable"); }); }, [id, cwd]);
  const open = (file: SandboxFileEntry) => { if (file.type === "directory") setCwd(file.path); };
  const current = cwd ?? "/";
  const parent = current === "/" ? "/" : current.split("/").slice(0, -1).join("/") || "/";
  const refresh = () => api.files(id, cwd).then((r) => { setCwd(r.cwd); setFiles(r.files); setError(""); }).catch((err) => { setFiles([]); setError(err instanceof Error ? err.message : "Filesystem unavailable"); });
  return <div className="files-pane"><div className="files-toolbar"><button className="btn btn-sm" onClick={() => setCwd(parent)} disabled={current === "/"}><Icon name="chevron" size={11} style={{ transform: "rotate(180deg)" }} /> Up</button><code>{current}</code><button className="btn btn-ghost btn-sm" onClick={refresh}><Icon name="refresh" size={12} /> Refresh</button></div><div className="files-table card"><div className="files-row files-head"><span>Name</span><span>Kind</span><span>Size</span><span>Modified</span><span>Path</span></div>{files.map((f) => <button key={f.path} className={`files-row ${f.type === "directory" ? "clickable" : ""}`} onClick={() => open(f)}><span className="files-name"><Icon name={f.type === "directory" ? "folder" : "file"} size={13} />{f.name}</span><span><span className="tag">{f.type}</span></span><span className="num">{formatBytes(f.size)}</span><span className="num muted">{formatDateTime(f.modifiedAt)}</span><span className="files-path">{f.path}</span></button>)}</div>{files.length ? null : <div className="empty-state">{error || "No files found at this path."}</div>}</div>;
};

type RuntimeLogRow = {
  lvl: string;
  msg: string;
  source?: string | null;
  ts: string;
};

const LogsPane = ({ id }: { id: string }) => {
  const [logs, setLogs] = useState<RuntimeLogRow[]>([]);
  useEffect(() => { api.logs(id).then((r) => setLogs(r.logs)).catch(() => setLogs([])); }, [id]);
  return <div className="logs-pane rich-logs"><div className="logs-row logs-head"><span>Time</span><span>Source</span><span>Level</span><span>Message</span></div>{logs.map((l, i) => <div key={i} className="logs-row"><span className="ts">{new Date(l.ts).toLocaleTimeString()}</span><span className="tag">{l.source ?? "control-plane"}</span><span className={`lvl ${l.lvl}`}>{String(l.lvl).toUpperCase()}</span><span className="log-msg">{l.msg}</span></div>)}</div>;
};

type MetricsSnapshot = {
  current?: {
    cpu?: number;
    cpuCount?: number;
    diskIo?: number;
    mem?: number;
    memTotal?: number;
    networkOut?: number;
  };
  series?: Array<{ cpu: number }>;
};

const MetricsPane = ({ id }: { id: string }) => {
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  useEffect(() => { api.metrics(id).then(setMetrics); }, [id]);
  return <div style={{ padding: 24, overflow: "auto", height: "100%" }}><div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}><KPI label="CPU" v={`${metrics?.current?.cpu ?? 0}%`} delta={`${metrics?.current?.cpuCount ?? 1} vCPU visible`} /><KPI label="Memory" v={`${metrics?.current?.mem ?? 0} MB`} delta={metrics?.current?.memTotal ? `of ${metrics.current.memTotal} MB node memory` : "live snapshot"} /><KPI label="Disk I/O" v={`${metrics?.current?.diskIo ?? 0} KB/s`} delta="not exposed by execd" /><KPI label="Network out" v={`${metrics?.current?.networkOut ?? 0} KB/s`} delta="not exposed by execd" /></div><div className="card" style={{ padding: 22 }}><div className="card-h">CPU snapshot</div><Chart data={(metrics?.series ?? []).map((m) => m.cpu)} /></div></div>;
};

const NetworkPane = ({ sandbox }: { sandbox: SandboxSummary }) => {
  const [routes, setRoutes] = useState<SandboxRouteSummary[]>([]);
  const [port, setPort] = useState(3000);
  const [protocol, setProtocol] = useState<"http" | "https">("http");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = () => api.routes(sandbox.id).then((r) => setRoutes(r.routes));
  useEffect(() => { void load(); }, [sandbox.id]);
  const expose = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api.exposeRoute(sandbox.id, { port, protocol });
      setRoutes((current) => [...current.filter((route) => route.port !== result.route.port), result.route].sort((a, b) => a.port - b.port));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to expose route");
    } finally {
      setBusy(false);
    }
  };
  const copy = async (value: string) => { await navigator.clipboard?.writeText(value); };
  return (
    <div className="network-pane">
      <div className="network-toolbar card">
        <div>
          <div className="card-h">Expose port</div>
          <div className="network-sub">Public while the sandbox is alive.</div>
        </div>
        <select className="input network-protocol" value={protocol} onChange={(e) => setProtocol(e.target.value as "http" | "https")}>
          <option value="http">HTTP</option>
          <option value="https">HTTPS</option>
        </select>
        <input className="input mono network-port" type="number" min={1} max={65535} value={port} onChange={(e) => setPort(Number(e.target.value))} />
        <button className="btn btn-primary btn-sm" onClick={expose} disabled={busy || sandbox.status === "terminated"}><Icon name="globe" size={12} /> {busy ? "Exposing..." : "Expose"}</button>
      </div>
      {error ? <div className="network-error">{error}</div> : null}
      <div className="network-table card">
        <div className="network-row network-head"><span>Port</span><span>URL</span><span>State</span><span>Provider</span><span /></div>
        {routes.map((route) => (
          <div key={`${route.port}-${route.host}`} className="network-row">
            <span className="num">{route.port}/{route.protocol}</span>
            <span className="network-url"><a href={route.url} target="_blank" rel="noreferrer">{route.url}</a><small>{route.targetUrl !== route.url ? `target ${route.targetUrl}` : route.host}</small></span>
            <span><span className={`pill ${route.state === "ready" ? "live" : route.state === "terminated" ? "" : "idle"}`}><span className="dot" /> {route.state}</span></span>
            <span className="tag">{route.provider}</span>
            <span className="network-actions"><button className="btn btn-ghost btn-sm" onClick={() => copy(route.url)}><Icon name="copy" size={12} /></button><button className="btn btn-ghost btn-sm" onClick={() => window.open(route.url, "_blank", "noopener,noreferrer")}>Open <Icon name="arrowR" size={11} /></button></span>
          </div>
        ))}
        {routes.length ? null : <div className="empty-state">No exposed ports yet.</div>}
      </div>
    </div>
  );
};
