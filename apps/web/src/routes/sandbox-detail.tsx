import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  egressPresetCatalog,
  type EgressMode,
  type EgressPresetId,
  type SandboxCommandSummary,
  type SandboxEgressResponse,
  type SandboxFileEntry,
  type SandboxRouteAccessMode,
  type SandboxRouteSummary,
  type SandboxSummary,
  type TestSandboxEgressResponse
} from "@harakiri/shared";
import { api } from "../api";
import { Brand } from "../components/brand";
import { EgressModePicker, egressModeMeta } from "../components/egress-mode-picker";
import { Icon } from "../components/icon";
import { Chart, KPI } from "../components/ui";
import { formatBytes, formatDateTime } from "../format";
import type { GoToRoute } from "./types";

export const SandboxDetailRoute = ({ id, go }: { id: string; go: GoToRoute }) => {
  const [sandbox, setSandbox] = useState<SandboxSummary | null>(null);
  const [tab, setTab] = useState("terminal");
  useEffect(() => { api.sandbox(id).then((r) => setSandbox(r.sandbox)).catch(() => undefined); }, [id]);
  if (!sandbox) return <div className="dash-page">Loading...</div>;
  const refreshSandbox = () => api.sandbox(id).then((r) => setSandbox(r.sandbox));
  const isActive = sandbox.status === "running" || sandbox.status === "idle" || sandbox.status === "pending";
  return (
    <div className="detail">
      <aside className="dash-side" style={{ padding: "16px 0" }}>
        <div className="dash-side-brand" style={{ padding: "6px 20px 16px" }}><Brand /></div>
        <div style={{ padding: "0 12px 12px" }}>
          <button className="btn btn-sm" style={{ width: "100%" }} onClick={() => go("dashboard/sandboxes")}>
            <Icon name="chevron" size={11} style={{ transform: "rotate(180deg)" }} /> All sandboxes
          </button>
        </div>
      </aside>
      <main className="detail-main">
        <div className="detail-top">
          <div className="detail-title-wrap">
            <div className="detail-title-line">
              <span className="detail-name">{sandbox.name}</span>
              <span className="detail-id">{sandbox.id}</span>
              <span className={`pill ${sandbox.status === "running" ? "live" : ""}`}><span className="dot" /> {sandbox.status}</span>
              <span className="tag">{sandbox.template}</span>
            </div>
            <div className="detail-lifecycle-line">
              <span>TTL {sandbox.ttlSeconds}s</span>
              <span>expires {sandbox.expiresAt ? formatDateTime(sandbox.expiresAt) : "-"}</span>
              <span>created {formatDateTime(sandbox.createdAt)}</span>
            </div>
          </div>
          <div className="detail-actions">
            <button className="btn btn-sm" disabled={!isActive} onClick={() => api.renewSandbox(sandbox.id).then(refreshSandbox)}>
              <Icon name="refresh" size={12} /> Renew
            </button>
            <button className="btn btn-sm" style={{ color: "var(--err)" }} disabled={sandbox.status === "terminated"} onClick={() => api.killSandbox(sandbox.id).then(refreshSandbox)}>
              <Icon name="stop" size={11} /> Kill
            </button>
          </div>
        </div>
        <div className="detail-tabs">
          {[["terminal", "Terminal", "terminal"], ["files", "Filesystem", "file"], ["logs", "Logs", "logs"], ["metrics", "Metrics", "chart"], ["network", "Network", "globe"]].map(([k, label, icon]) => (
            <button key={k} className={`detail-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
              <Icon name={icon} size={12} /> {label}
            </button>
          ))}
        </div>
        <div className="detail-body">
          {tab === "terminal" ? <TerminalPane sandbox={sandbox} /> : null}
          {tab === "files" ? <FilesPane id={sandbox.id} /> : null}
          {tab === "logs" ? <LogsPane id={sandbox.id} /> : null}
          {tab === "metrics" ? <MetricsPane id={sandbox.id} /> : null}
          {tab === "network" ? <NetworkPane sandbox={sandbox} /> : null}
        </div>
      </main>
    </div>
  );
};

type TerminalLine = { kind: "cmd" | "stdout" | "stderr" | "muted" | "ok"; text: string };
type TerminalStatus = "connecting" | "attached" | "closed" | "error";

const stdinFramePrefix = 0x00;
const stdoutFramePrefix = 0x01;
const stderrFramePrefix = 0x02;
const replayFramePrefix = 0x03;

const stripAnsi = (value: string) => value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");

const terminalText = (bytes: Uint8Array, prefix: number) => {
  const offset = prefix === replayFramePrefix ? 9 : 1;
  return stripAnsi(new TextDecoder().decode(bytes.slice(offset)).replace(/\r/g, ""));
};

const commandIsRunning = (command: SandboxCommandSummary) => command.status === "running" || command.status === "queued";

const commandRuntime = (command: SandboxCommandSummary) => {
  const start = command.startedAt ?? command.createdAt;
  const end = command.finishedAt ?? command.updatedAt;
  const ms = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(ms) || ms < 0) return "pending";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
};

const commandOutcome = (command: SandboxCommandSummary) => {
  const runtime = commandRuntime(command);
  if (command.exitCode !== null) return `exit ${command.exitCode} - ${runtime}`;
  if (command.finishReason) return `${command.finishReason}${command.signal ? ` ${command.signal}` : ""} - ${runtime}`;
  return runtime;
};

const TerminalPane = ({ sandbox }: { sandbox: SandboxSummary }) => {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const runtime = sandbox.runtimeMetadata;
  const socketRef = useRef<WebSocket | null>(null);
  const [lines, setLines] = useState<TerminalLine[]>([
    { kind: "muted", text: "harakiri terminal - attaching to " + sandbox.id },
    { kind: "muted", text: "requesting short-lived attach ticket" }
  ]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<TerminalStatus>("connecting");
  const [reconnectKey, setReconnectKey] = useState(0);
  const [commands, setCommands] = useState<SandboxCommandSummary[]>([]);
  const [commandsError, setCommandsError] = useState("");
  const loadCommands = () =>
    api.commands(sandbox.id)
      .then((response) => {
        setCommands(response.commands.slice(0, 8));
        setCommandsError("");
      })
      .catch((error) => {
        setCommands([]);
        setCommandsError(error instanceof Error ? error.message : "Command history unavailable.");
      });
  useEffect(() => { void loadCommands(); }, [sandbox.id]);
  useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight });
  }, [lines]);
  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;
    const append = (kind: TerminalLine["kind"], text: string) => {
      if (!text) return;
      setLines((current) => [...current, ...text.split(/\n/).filter(Boolean).map((line) => ({ kind, text: line }))]);
    };
    const terminalSize = () => {
      const rect = terminalRef.current?.getBoundingClientRect();
      return {
        cols: Math.max(40, Math.floor((rect?.width ?? 960) / 8)),
        rows: Math.max(12, Math.floor((rect?.height ?? 520) / 21))
      };
    };
    const sendResize = () => {
      if (socket?.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "resize", ...terminalSize() }));
    };
    const handleFrame = async (event: MessageEvent) => {
      if (typeof event.data === "string") {
        try {
          const frame = JSON.parse(event.data) as { type?: string; error?: string; message?: string; code?: string; session_id?: string; mode?: string };
          if (frame.type === "connected") {
            setStatus("attached");
            append("ok", `connection sealed - ${frame.mode ?? "pty"} ${frame.session_id ?? ""}`.trim());
            sendResize();
            return;
          }
          if (frame.type === "error" || frame.error) {
            setStatus("error");
            append("stderr", `${frame.error ?? frame.code ?? "terminal_error"}${frame.message ? `: ${frame.message}` : ""}`);
            return;
          }
        } catch {
          append("stdout", event.data);
        }
        return;
      }
      const buffer = event.data instanceof Blob ? new Uint8Array(await event.data.arrayBuffer()) : new Uint8Array(event.data as ArrayBuffer);
      if (!buffer.length) return;
      if (buffer[0] === stdoutFramePrefix || buffer[0] === replayFramePrefix) append("stdout", terminalText(buffer, buffer[0]));
      else if (buffer[0] === stderrFramePrefix) append("stderr", terminalText(buffer, buffer[0]));
      else append("stdout", stripAnsi(new TextDecoder().decode(buffer).replace(/\r/g, "")));
    };
    setStatus("connecting");
    setLines([
      { kind: "muted", text: "harakiri terminal - attaching to " + sandbox.id },
      { kind: "muted", text: "requesting short-lived attach ticket" }
    ]);
    api.terminalAttachTicket(sandbox.id)
      .then((ticket) => {
        if (cancelled) return;
        socket = new WebSocket(ticket.attachUrl);
        socketRef.current = socket;
        socket.binaryType = "arraybuffer";
        socket.onopen = () => {
          setStatus("connecting");
          append("muted", `ticket expires ${new Date(ticket.expiresAt).toLocaleTimeString()}`);
          append("muted", "websocket open - waiting for provider terminal");
        };
        socket.onmessage = (event) => { void handleFrame(event); };
        socket.onerror = () => {
          setStatus("error");
          append("stderr", "terminal websocket error");
        };
        socket.onclose = (event) => {
          if (cancelled) return;
          setStatus(event.code === 1000 ? "closed" : "error");
          append(event.code === 1000 ? "muted" : "stderr", `connection closed (${event.code || "unknown"})${event.reason ? `: ${event.reason}` : ""}`);
        };
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus("error");
        append("stderr", error instanceof Error ? error.message : "terminal attach failed");
      });
    window.addEventListener("resize", sendResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", sendResize);
      socket?.close(1000, "terminal pane closed");
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [sandbox.id, reconnectKey]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const cmd = input.trim();
    setInput("");
    setLines((current) => [...current, { kind: "cmd", text: cmd }]);
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || status !== "attached") {
      setLines((current) => [...current, { kind: "stderr", text: "terminal is not attached" }]);
      return;
    }
    socket.send(new Uint8Array([stdinFramePrefix, ...new TextEncoder().encode(`${cmd}\n`)]));
  };
  const killCommand = async (commandId: string) => {
    await api.killCommand(sandbox.id, commandId);
    await loadCommands();
  };
  const sendInterrupt = () => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "signal", signal: "SIGINT" }));
    socket.send(new Uint8Array([stdinFramePrefix, 0x03]));
  };
  const closeTerminal = () => {
    socketRef.current?.close(1000, "closed from dashboard");
  };
  return <div className="term-pane"><div className="file-tree"><div className="ft-section">Terminal</div><div className="ft-row active"><Icon name="terminal" size={12} /><span className="ft-name">PTY attach</span></div><div className="ft-row"><Icon name="logs" size={12} /><span className="ft-name">stdout/stderr stream</span></div><div className="ft-section">Controls</div><button className="btn btn-sm terminal-side-action" onClick={() => setReconnectKey((value) => value + 1)}><Icon name="refresh" size={12} /> Reconnect</button><button className="btn btn-sm terminal-side-action" onClick={sendInterrupt} disabled={status !== "attached"}><Icon name="stop" size={11} /> Ctrl-C</button><button className="btn btn-sm terminal-side-action" onClick={closeTerminal} disabled={status === "closed"}>Close</button></div><div className="term" ref={terminalRef}>{lines.map((line, index) => <div key={index} className={`term-line ${line.kind}`}>{line.text}</div>)}<form className="term-input" onSubmit={submit}><input value={input} onChange={(e) => setInput(e.target.value)} autoFocus placeholder={status === "attached" ? "Run a shell command..." : "Waiting for terminal..."} disabled={status !== "attached"} /><span className="blink" style={{ color: "#e6e3da" }}>|</span></form></div><div className="detail-side"><div className="ds-section"><div className="ds-h">Connection</div><div className="ds-row"><span className="l">Status</span><span className={`pill terminal-status ${status}`}><span className="dot" /> {status}</span></div><div className="ds-row"><span className="l">Mode</span><span className="v">PTY</span></div><div className="ds-row"><span className="l">TTL</span><span className="v">{sandbox.ttlSeconds}s</span></div></div><div className="ds-section"><div className="ds-h">Runtime</div><div className="ds-row"><span className="l">Workdir</span><span className="v">{runtime?.workdir ?? "/"}</span></div><div className="ds-row"><span className="l">User</span><span className="v">{runtime?.user ?? "root"}</span></div><div className="ds-row"><span className="l">Shell</span><span className="v">{runtime?.shell ?? "/bin/sh"}</span></div><div className="ds-row"><span className="l">Ports</span><span className="v">{runtime?.ports.default.length ? runtime.ports.default.join(", ") : "none"}</span></div></div><div className="ds-section command-history"><div className="ds-h">Detached commands</div>{commands.map((command) => <div className="command-history-row" key={command.id}><div><div className="command-history-cmd">{command.command}</div><div className="command-history-meta"><span className={`build-badge ${command.status}`}>{command.status}</span><span>{command.detached ? "process" : "foreground"}</span><span>{commandOutcome(command)}</span></div></div>{commandIsRunning(command) ? <button className="btn btn-ghost btn-sm icon-only" onClick={() => void killCommand(command.id)} title="Interrupt command" aria-label="Interrupt command"><Icon name="stop" size={11} /></button> : null}</div>)}{commands.length ? null : <div className="empty-state compact">{commandsError || "Detached commands started through the SDK, CLI, or API appear here."}</div>}</div></div></div>;
};

const FilesPane = ({ id }: { id: string }) => {
  const [cwd, setCwd] = useState<string | undefined>();
  const [files, setFiles] = useState<SandboxFileEntry[]>([]);
  const [source, setSource] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const load = (path = cwd) => {
    setLoading(true);
    return api.files(id, path)
      .then((r) => { setCwd(r.cwd); setFiles(r.files); setSource(r.source ?? "provider"); setWarnings(r.warnings ?? []); setError(""); })
      .catch((err) => { setFiles([]); setSource(""); setWarnings([]); setError(err instanceof Error ? err.message : "Filesystem unavailable"); })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.files(id, cwd)
      .then((r) => {
        if (cancelled) return;
        setCwd(r.cwd);
        setFiles(r.files);
        setSource(r.source ?? "provider");
        setWarnings(r.warnings ?? []);
        setError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setFiles([]);
        setSource("");
        setWarnings([]);
        setError(err instanceof Error ? err.message : "Filesystem unavailable");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id, cwd]);
  const open = (file: SandboxFileEntry) => { if (file.type === "directory") setCwd(file.path); };
  const current = cwd ?? "/";
  const parent = current === "/" ? "/" : current.split("/").slice(0, -1).join("/") || "/";
  const visibleFiles = files.slice(0, 300);
  const hiddenCount = Math.max(0, files.length - visibleFiles.length);
  return <div className="files-pane"><div className="files-toolbar"><button className="btn btn-sm" onClick={() => setCwd(parent)} disabled={current === "/" || loading}><Icon name="chevron" size={11} style={{ transform: "rotate(180deg)" }} /> Up</button><code>{current}</code><span className="files-count num">{loading ? "loading" : `${files.length} entries`}</span>{source ? <span className="files-source tag">{source}</span> : null}<button className="btn btn-ghost btn-sm" onClick={() => void load()} disabled={loading}><Icon name="refresh" size={12} /> Refresh</button></div>{warnings.map((warning) => <div className="files-notice warning" key={warning}>{warning}</div>)}{hiddenCount ? <div className="files-notice">Showing first {visibleFiles.length} entries. Narrow the path before working with very large directories.</div> : null}<div className="files-table card"><div className="files-row files-head"><span>Name</span><span>Kind</span><span>Size</span><span>Modified</span><span>Path</span></div>{visibleFiles.map((f) => <button key={f.path} className={`files-row ${f.type === "directory" ? "clickable" : ""}`} onClick={() => open(f)} disabled={loading}><span className="files-name"><Icon name={f.type === "directory" ? "folder" : "file"} size={13} />{f.name}</span><span><span className="tag">{f.type}</span></span><span className="num">{formatBytes(f.size)}</span><span className="num muted">{formatDateTime(f.modifiedAt)}</span><span className="files-path">{f.path}</span></button>)}</div>{files.length ? null : <div className="empty-state">{loading ? "Loading files..." : error || "This directory is empty."}</div>}</div>;
};

type RuntimeLogRow = {
  lvl: string;
  msg: string;
  source?: string | null;
  ts: string;
};

const LogsPane = ({ id }: { id: string }) => {
  const [logs, setLogs] = useState<RuntimeLogRow[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api.logs(id)
      .then((r) => { setLogs(r.logs); setError(""); })
      .catch((cause) => {
        setLogs([]);
        setError(cause instanceof Error ? cause.message : "Logs are unavailable for this sandbox.");
      });
  }, [id]);
  return (
    <div className="logs-pane rich-logs">
      <div className="logs-row logs-head"><span>Time</span><span>Source</span><span>Level</span><span>Message</span></div>
      {logs.map((l, i) => <div key={i} className="logs-row"><span className="ts">{new Date(l.ts).toLocaleTimeString()}</span><span className="tag">{l.source ?? "control-plane"}</span><span className={`lvl ${l.lvl}`}>{String(l.lvl).toUpperCase()}</span><span className="log-msg">{l.msg}</span></div>)}
      {logs.length ? null : <div className="empty-state">{error || "No runtime or control-plane logs have been recorded yet."}</div>}
    </div>
  );
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
  const [error, setError] = useState("");
  useEffect(() => {
    api.metrics(id)
      .then((snapshot) => { setMetrics(snapshot); setError(""); })
      .catch((cause) => {
        setMetrics(null);
        setError(cause instanceof Error ? cause.message : "Metrics are unavailable for this sandbox.");
      });
  }, [id]);
  return (
    <div className="metrics-pane">
      {error ? <div className="network-warning">Metrics snapshot is unavailable.<span>{error}</span></div> : null}
      <div className="metrics-kpis"><KPI label="CPU" v={`${metrics?.current?.cpu ?? 0}%`} delta={`${metrics?.current?.cpuCount ?? 1} vCPU visible`} /><KPI label="Memory" v={`${metrics?.current?.mem ?? 0} MB`} delta={metrics?.current?.memTotal ? `of ${metrics.current.memTotal} MB node memory` : "live snapshot"} /><KPI label="Disk I/O" v={`${metrics?.current?.diskIo ?? 0} KB/s`} delta="provider snapshot pending" /><KPI label="Network out" v={`${metrics?.current?.networkOut ?? 0} KB/s`} delta="provider snapshot pending" /></div>
      <div className="card metrics-chart"><div className="card-h">CPU snapshot</div><Chart data={(metrics?.series ?? []).map((m) => m.cpu)} /></div>
    </div>
  );
};

const NetworkPane = ({ sandbox }: { sandbox: SandboxSummary }) => {
  const [routes, setRoutes] = useState<SandboxRouteSummary[]>([]);
  const [egress, setEgress] = useState<SandboxEgressResponse["egress"] | null>(null);
  const [port, setPort] = useState(3000);
  const [protocol, setProtocol] = useState<"http" | "https">("http");
  const [accessMode, setAccessMode] = useState<SandboxRouteAccessMode>("public");
  const [labelsText, setLabelsText] = useState("");
  const [routeToken, setRouteToken] = useState<{ routeKey: string; url: string; headerName: string; token: string } | null>(null);
  const [allowTarget, setAllowTarget] = useState("");
  const [testTarget, setTestTarget] = useState("");
  const [testResult, setTestResult] = useState<TestSandboxEgressResponse | null>(null);
  const [policyEvents, setPolicyEvents] = useState<RuntimeLogRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [egressBusy, setEgressBusy] = useState(false);
  const [error, setError] = useState("");
  const [egressError, setEgressError] = useState("");
  const load = () => api.routes(sandbox.id).then((r) => setRoutes(r.routes));
  const loadEgress = () => api.egress(sandbox.id).then((r) => { setEgress(r.egress); setEgressError(""); }).catch((err) => setEgressError(err instanceof Error ? err.message : "Outbound access unavailable"));
  const loadPolicyEvents = () => api.logs(sandbox.id).then((r) => {
    setPolicyEvents(r.logs.filter((entry) => entry.source === "control-plane" && String(entry.lvl).startsWith("egress.")).slice(-5).reverse());
  }).catch(() => setPolicyEvents([]));
  useEffect(() => { void load(); void loadEgress(); void loadPolicyEvents(); }, [sandbox.id]);
  const expose = async () => {
    setBusy(true);
    setError("");
    setRouteToken(null);
    try {
      const labels = labelsText.split(",").map((label) => label.trim()).filter(Boolean);
      const result = await api.exposeRoute(sandbox.id, { port, protocol, accessMode, labels: labels.length ? labels : undefined });
      setRoutes((current) => [...current.filter((route) => route.port !== result.route.port), result.route].sort((a, b) => a.port - b.port));
      if (result.accessToken && result.accessHeaderName) {
        setRouteToken({ routeKey: result.route.routeKey, url: result.route.url, headerName: result.accessHeaderName, token: result.accessToken });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to expose route");
    } finally {
      setBusy(false);
    }
  };
  const deleteRoute = async (route: SandboxRouteSummary) => {
    setBusy(true);
    setError("");
    try {
      await api.deleteRoute(sandbox.id, route.port);
      setRoutes((current) => current.filter((entry) => entry.port !== route.port));
      if (routeToken?.routeKey === route.routeKey) setRouteToken(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to delete route");
    } finally {
      setBusy(false);
    }
  };
  const updateEgress = async (patch: { mode?: EgressMode; presets?: EgressPresetId[]; allow?: string[]; deny?: string[] }) => {
    setEgressBusy(true);
    setEgressError("");
    try {
      const result = await api.updateEgress(sandbox.id, patch);
      setEgress(result.egress);
      void loadPolicyEvents();
    } catch (err) {
      setEgressError(err instanceof Error ? err.message : "failed to update outbound access");
    } finally {
      setEgressBusy(false);
    }
  };
  const addAllowTarget = async (event: FormEvent) => {
    event.preventDefault();
    if (!allowTarget.trim()) return;
    await updateEgress({ allow: [allowTarget.trim()] });
    setAllowTarget("");
  };
  const togglePreset = (presetId: EgressPresetId) => {
    const current = new Set(egress?.presets ?? []);
    if (current.has(presetId)) current.delete(presetId);
    else current.add(presetId);
    void updateEgress({ presets: [...current] });
  };
  const runEgressTest = async (event: FormEvent) => {
    event.preventDefault();
    if (!testTarget.trim()) return;
    setEgressBusy(true);
    setEgressError("");
    try {
      setTestResult(await api.testEgress(sandbox.id, { target: testTarget.trim() }));
      void loadPolicyEvents();
    } catch (err) {
      setEgressError(err instanceof Error ? err.message : "failed to test outbound access");
    } finally {
      setEgressBusy(false);
    }
  };
  const copy = async (value: string) => { await navigator.clipboard?.writeText(value); };
  const provider = egress?.providerStatus;
  const policyEnforced = provider?.available === true;
  const canEditEgress = policyEnforced && !egressBusy && sandbox.status !== "terminated";
  const canTestEgress = !egressBusy && sandbox.status === "running";
  const allowed = egress?.rules.filter((rule) => rule.action === "allow").length ?? 0;
  const denied = egress?.rules.filter((rule) => rule.action === "deny").length ?? 0;
  const currentMode = egress?.mode ? egressModeMeta[egress.mode] : null;
  const defaultPorts = sandbox.runtimeMetadata?.ports.default ?? [];
  return (
    <div className="network-pane">
      <section className="network-section card">
        <div className="network-section-head">
          <div>
            <div className="card-h">Inbound routes</div>
            <div className="network-sub">Expose HTTP services running inside this sandbox.{defaultPorts.length ? ` Template ports: ${defaultPorts.join(", ")}.` : ""}</div>
          </div>
          <div className="network-toolbar">
            <select className="input network-protocol" value={protocol} onChange={(e) => setProtocol(e.target.value as "http" | "https")}>
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
            </select>
            <input className="input mono network-port" type="number" min={1} max={65535} value={port} onChange={(e) => setPort(Number(e.target.value))} />
            <div className="route-access-picker" role="radiogroup" aria-label="Route access mode">
              {(["public", "token"] as const).map((mode) => (
                <button key={mode} type="button" role="radio" aria-checked={accessMode === mode} className={`filter-tab ${accessMode === mode ? "active" : ""}`} onClick={() => setAccessMode(mode)}>
                  {mode === "public" ? "Public" : "Token"}
                </button>
              ))}
            </div>
            <input className="input network-labels" value={labelsText} onChange={(event) => setLabelsText(event.target.value)} placeholder="labels: preview, vite" />
            <button className="btn btn-primary btn-sm" onClick={expose} disabled={busy || sandbox.status === "terminated"}><Icon name="globe" size={12} /> {busy ? "Exposing..." : "Expose port"}</button>
          </div>
        </div>
        {error ? <div className="network-error">{error}</div> : null}
        {routeToken ? (
          <div className="route-token-box">
            <div>
              <strong>Route token shown once.</strong>
              <span>Store this header if an external client needs to reuse the protected route.</span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => copy(`${routeToken.headerName}: ${routeToken.token}`)}><Icon name="copy" size={12} /> Header</button>
            <button className="btn btn-ghost btn-sm" onClick={() => copy(routeToken.url)}><Icon name="copy" size={12} /> URL</button>
          </div>
        ) : null}
        <div className="network-table route-table">
        <div className="network-row network-head"><span>Port</span><span>URL</span><span>Access</span><span>State</span><span /></div>
        {routes.map((route) => (
          <div key={`${route.port}-${route.host}`} className="network-row">
            <span className="num">{route.port}/{route.protocol}</span>
            <span className="network-url"><a href={route.url} target="_blank" rel="noreferrer">{route.url}</a><small>{route.targetUrl !== route.url ? `target ${route.targetUrl}` : route.host}</small></span>
            <span className="route-access-cell"><span className="tag">{route.accessMode}</span>{route.tokenHint ? <small>{route.tokenHint}</small> : null}{route.labels.length ? <small>{route.labels.join(", ")}</small> : null}</span>
            <span><span className={`pill ${route.state === "ready" ? "live" : route.state === "terminated" ? "" : "idle"}`}><span className="dot" /> {route.state}</span><small className="route-provider">{route.provider}</small></span>
            <span className="network-actions"><button className="btn btn-ghost btn-sm" onClick={() => copy(route.url)} title="Copy route URL"><Icon name="copy" size={12} /></button><button className="btn btn-ghost btn-sm" onClick={() => window.open(route.url, "_blank", "noopener,noreferrer")}>Open <Icon name="arrowR" size={11} /></button><button className="btn btn-ghost btn-sm route-delete" disabled={busy} onClick={() => void deleteRoute(route)} title="Delete route"><Icon name="x" size={12} /></button></span>
          </div>
        ))}
        {routes.length ? null : <div className="empty-state">No exposed ports yet. Start a server on 0.0.0.0 inside the sandbox, then expose the matching port.</div>}
        </div>
      </section>
      <section className="network-section card">
        <div className="network-section-head">
          <div>
            <div className="card-h">Outbound access</div>
            <div className="network-sub">Control what this sandbox can reach while it is running.</div>
          </div>
          <div className="egress-status-row">
            <span className={`pill ${egress?.mode === "restricted" ? "idle" : egress?.mode === "blocked" ? "" : "live"}`}><span className="dot" /> {currentMode?.label ?? "loading"}</span>
            <span className="tag">{allowed} allowed</span>
            <span className="tag">{denied} denied</span>
            <span className="tag">{provider?.available ? provider.enforcementMode ?? provider.mode ?? "enforcing" : "unavailable"}</span>
          </div>
        </div>
        {egressError ? <div className="network-error">{egressError}</div> : null}
        {egress && !policyEnforced ? (
          <div className="network-warning">
            Policy enforcement is unavailable for this sandbox. Access tests still run from inside the sandbox, but policy changes require the OpenSandbox egress endpoint to be available.
            {provider?.error ? <span>{provider.error}</span> : null}
          </div>
        ) : null}
        <div className="egress-grid">
          <div className="egress-controls">
            <EgressModePicker value={egress?.mode} disabled={!canEditEgress} onChange={(mode) => updateEgress({ mode })} />
            <div className="egress-presets">
              {Object.entries(egressPresetCatalog).map(([id, preset]) => {
                const presetId = id as EgressPresetId;
                const active = egress?.presets.includes(presetId);
                return <button key={id} className={`preset-chip ${active ? "active" : ""}`} disabled={!canEditEgress} onClick={() => togglePreset(presetId)}><span>{preset.label}</span><small>{preset.domains.length ? `${preset.domains.length} domains` : "broad access"}</small></button>;
              })}
            </div>
            <form className="egress-add" onSubmit={addAllowTarget}>
              <input className="input" value={allowTarget} onChange={(e) => setAllowTarget(e.target.value)} placeholder="api.github.com or *.pythonhosted.org" disabled={!canEditEgress} />
              <button className="btn btn-sm" disabled={!canEditEgress}><Icon name="plus" size={12} /> Add domain</button>
            </form>
            <form className="egress-test" onSubmit={runEgressTest}>
              <input className="input" value={testTarget} onChange={(e) => setTestTarget(e.target.value)} placeholder="https://pypi.org/simple" />
              <button className="btn btn-primary btn-sm" disabled={!canTestEgress}>Test access</button>
            </form>
            {testResult ? <div className={`egress-test-result ${testResult.ok ? "ok" : "blocked"}`}>{testResult.ok ? "Reachable" : "Blocked or unreachable"} <span>{testResult.normalizedTarget}</span></div> : null}
          </div>
          <div className="egress-rules">
            <div className="network-row egress-head"><span>Action</span><span>Domain</span><span>Source</span></div>
            {egress?.rules.map((rule) => (
              <div key={`${rule.action}-${rule.target}-${rule.presetId ?? rule.source}`} className="network-row egress-rule-row">
                <span><span className={`tag ${rule.action}`}>{rule.action}</span></span>
                <span className="network-url"><a>{rule.target}</a></span>
                <span className="tag">{rule.presetId ? egressPresetCatalog[rule.presetId].label : rule.source}</span>
              </div>
            ))}
            {egress?.rules.length ? null : <div className="empty-state">{!policyEnforced ? "The runtime is using its default outbound access." : egress?.mode === "open" ? "This sandbox can reach the public internet." : "No outbound domains are allowed."}</div>}
          </div>
        </div>
        <div className="policy-events">
          <div className="field-l">Recent policy events</div>
          {policyEvents.map((event) => (
            <div className="policy-event-row" key={`${event.ts}-${event.msg}`}>
              <span className="num muted">{new Date(event.ts).toLocaleTimeString()}</span>
              <span className="tag">{event.lvl}</span>
              <span>{event.msg}</span>
            </div>
          ))}
          {policyEvents.length ? null : <div className="empty-state compact">No outbound access events recorded yet.</div>}
        </div>
      </section>
    </div>
  );
};
