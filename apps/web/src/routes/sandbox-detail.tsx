import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import {
  egressPresetCatalog,
  type EgressMode,
  type EgressPresetId,
  type SandboxEgressResponse,
  type SandboxLogEntry,
  type RuntimeCapabilityName,
  type SandboxRouteAccessMode,
  type SandboxRouteSummary,
  type SandboxSnapshotSummary,
  type SandboxSummary,
  type TestSandboxEgressResponse
} from "@harakiri/shared";
import { api } from "../api";
import { CapacitySummary, useIntentKeys, useOrganizationCapacity } from "../capacity";
import { EgressModePicker, egressModeMeta } from "../components/egress-mode-picker";
import { Icon } from "../components/icon";
import { formatDateTime } from "../format";
import type { GoToRoute } from "./types";
import { SandboxVaultPane } from "./sandbox-vault";
import { SandboxCommandsPane } from "./sandbox-commands";
import { SandboxSidebar } from "./sandbox-sidebar";
import { SandboxFilesPane } from "./sandbox-files";
import { SandboxLogsPane } from "./sandbox-logs";
import { SandboxMetricsPane } from "./sandbox-metrics";
import { SandboxOverviewPane } from "./sandbox-overview";
import { workbenchLocation, workbenchRoute, type WorkbenchTab } from "../workbench";

const SandboxTerminalPane = lazy(() => import("./sandbox-terminal"));

const capabilityState = (sandbox: SandboxSummary, name: RuntimeCapabilityName) =>
  sandbox.runtimeMetadata?.provider.capabilities.find((capability) => capability.name === name)?.state;

const hasCapability = (sandbox: SandboxSummary, name: RuntimeCapabilityName) =>
  capabilityState(sandbox, name) === "available";

const lifecycleActionError = (error: unknown) =>
  error instanceof Error ? error.message : "Lifecycle action failed.";

type SandboxDetailProps = { id: string; route?: string; go: GoToRoute; openSandbox?: (id: string) => void };

export const SandboxDetailRoute = ({ id, route = "", go, openSandbox }: SandboxDetailProps) => {
  const location = workbenchLocation(route);
  const [lastTab, setTab] = useState<WorkbenchTab>("overview");
  const tab = location?.tab ?? lastTab;
  useEffect(() => { if (location?.tab) setTab(location.tab); }, [location?.tab]);
  const [selectedSandbox, setSelectedSandbox] = useState<SandboxSummary | null>(null);
  return (
    <div className="detail">
      <SandboxSidebar selectedId={id} selectedSandbox={selectedSandbox?.id === id ? selectedSandbox : null} go={go} />
      <SandboxDetailContent key={id} id={id} go={go} openSandbox={openSandbox} tab={tab} commandId={location?.command} onTabChange={(next) => { setTab(next); go(workbenchRoute(id, next)); }} onSandboxChange={setSelectedSandbox} />
    </div>
  );
};

const SandboxDetailContent = ({ id, go, openSandbox, tab, commandId, onTabChange, onSandboxChange }: SandboxDetailProps & {
  tab: WorkbenchTab;
  commandId?: string;
  onTabChange: (tab: WorkbenchTab) => void;
  onSandboxChange: (sandbox: SandboxSummary) => void;
}) => {
  const capacity = useOrganizationCapacity();
  const resumeKeys = useIntentKeys();
  const [sandbox, setSandbox] = useState<SandboxSummary | null>(null);
  const [canViewCredentialAudit, setCanViewCredentialAudit] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [actionBusy, setActionBusy] = useState<"pause" | "resume" | "renew" | "kill" | null>(null);
  const [actionError, setActionError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setLoadError("");
    api.sandbox(id)
      .then((response) => { if (!cancelled) setSandbox(response.sandbox); })
      .catch((error) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load this sandbox."); });
    return () => { cancelled = true; };
  }, [id, retryKey]);
  useEffect(() => { if (sandbox) onSandboxChange(sandbox); }, [sandbox, onSandboxChange]);
  useEffect(() => {
    if (!sandbox || (!["pending", "pausing", "resuming"].includes(sandbox.status) && !["releasing", "uncertain"].includes(sandbox.capacityPhase ?? ""))) return;
    const timer = window.setInterval(() => { void api.sandbox(id).then((r) => setSandbox(r.sandbox)).catch(() => undefined); }, 3_000);
    return () => window.clearInterval(timer);
  }, [id, sandbox?.status, sandbox?.capacityPhase]);
  useEffect(() => {
    api.me().then((account) => setCanViewCredentialAudit(account.capabilities.canManageCredentialSecrets)).catch(() => undefined);
  }, []);
  if (!sandbox) return (
    <main className="detail-main">
      <div className="dash-page">
        {loadError ? <>
          <p role="alert">{loadError}</p>
          <button className="btn btn-sm" onClick={() => setRetryKey((key) => key + 1)}>Retry sandbox</button>
        </> : <p role="status">Loading sandbox...</p>}
      </div>
    </main>
  );
  const refreshSandbox = () => api.sandbox(id).then((r) => setSandbox(r.sandbox));
  const runLifecycleAction = async (kind: "pause" | "resume" | "renew" | "kill", action: () => Promise<void>) => {
    setActionBusy(kind);
    setActionError("");
    try {
      await action();
    } catch (error) {
      capacity.acceptError(error);
      setActionError(lifecycleActionError(error));
    } finally {
      setActionBusy(null);
    }
  };
  const isActive = sandbox.status === "running" || sandbox.status === "idle" || sandbox.status === "pending";
  const canPause = hasCapability(sandbox, "lifecyclePause") && (sandbox.status === "running" || sandbox.status === "idle");
  const canResume = hasCapability(sandbox, "lifecycleResume") && sandbox.status === "paused";
  const settling = sandbox.capacityPhase === "releasing" || sandbox.capacityPhase === "uncertain";
  return (
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
              {sandbox.workspaceId ? <a href="#dashboard/workspaces" onClick={(event) => { event.preventDefault(); go("dashboard/workspaces"); }}>Workspace: {sandbox.workspaceId}</a> : null}
            </div>
          </div>
          <div className="detail-actions">
            {sandbox.status === "paused" ? (
              <button className="btn btn-sm" disabled={!canResume || (capacity.blocked && sandbox.capacityPhase !== "active") || settling || actionBusy !== null} onClick={() => void runLifecycleAction("resume", async () => { const result = await api.resumeSandbox(sandbox.id, resumeKeys.forIntent({ sandboxId: sandbox.id })); setSandbox(result.sandbox); resumeKeys.clear(); })}>
                <Icon name="play" size={12} /> {actionBusy === "resume" ? "Resuming" : "Resume"}
              </button>
            ) : (
              <button className="btn btn-sm" disabled={!canPause || settling || actionBusy !== null} title={canPause ? "Pause sandbox" : "Pause is unavailable for this runtime state or provider"} onClick={() => void runLifecycleAction("pause", async () => { const result = await api.pauseSandbox(sandbox.id); setSandbox(result.sandbox); })}>
                <Icon name="pause" size={12} /> {actionBusy === "pause" ? "Pausing" : "Pause"}
              </button>
            )}
            <button className="btn btn-sm" disabled={!isActive || settling || actionBusy !== null} onClick={() => void runLifecycleAction("renew", async () => { await api.renewSandbox(sandbox.id); await refreshSandbox(); })}>
              <Icon name="refresh" size={12} /> {actionBusy === "renew" ? "Renewing" : "Renew"}
            </button>
            <button className="btn btn-sm" style={{ color: "var(--err)" }} disabled={sandbox.status === "terminated" || settling || actionBusy !== null} onClick={() => void runLifecycleAction("kill", async () => { await api.killSandbox(sandbox.id); await refreshSandbox(); })}>
              <Icon name="stop" size={11} /> {actionBusy === "kill" || sandbox.capacityPhase === "releasing" ? "Stopping" : "Stop"}
            </button>
          </div>
        </div>
        {actionError ? <div role="alert" className="detail-action-error">{actionError}</div> : null}
        {settling ? <div role="status" className="workspace-notice">{sandbox.capacityPhase === "releasing" ? "Stop requested. Waiting for the runtime to disappear." : "The runtime outcome is being verified. Capacity remains accounted for."}</div> : null}
        <CapacitySummary state={capacity} />
        <div className="detail-tabs">
          {([["overview", "Overview", "box"], ["terminal", "Terminal", "terminal"], ["commands", "Commands", "play"], ["files", "Filesystem", "file"], ["logs", "Logs", "logs"], ["metrics", "Metrics", "chart"], ["network", "Network", "globe"], ["vault", "Vault", "lock"], ["snapshots", "Snapshots", "snapshot"]] as const).map(([k, label, icon]) => (
            <button key={k} className={`detail-tab ${tab === k ? "active" : ""}`} onClick={() => onTabChange(k)}>
              <Icon name={icon} size={12} /> {label}
            </button>
          ))}
        </div>
        <div className="detail-body">
          {tab === "overview" ? <SandboxOverviewPane sandbox={sandbox} go={go} selectTab={onTabChange} onSandboxChange={setSandbox} /> : null}
          {tab === "terminal" ? <Suspense fallback={<p role="status" className="workbench-notice">Loading terminal...</p>}><SandboxTerminalPane sandbox={sandbox} /></Suspense> : null}
          {tab === "commands" ? <SandboxCommandsPane key={`${sandbox.id}:${commandId ?? ""}`} sandbox={sandbox} initialCommandId={commandId} /> : null}
          {tab === "files" ? <SandboxFilesPane sandbox={sandbox} /> : null}
          {tab === "logs" ? <SandboxLogsPane id={sandbox.id} /> : null}
          {tab === "metrics" ? <SandboxMetricsPane id={sandbox.id} /> : null}
          {tab === "network" ? <NetworkPane sandbox={sandbox} /> : null}
          {tab === "vault" ? <SandboxVaultPane sandbox={sandbox} canViewAudit={canViewCredentialAudit} /> : null}
          {tab === "snapshots" ? <SnapshotsPane sandbox={sandbox} go={go} openSandbox={openSandbox} /> : null}
        </div>
      </main>
  );
};


const snapshotIsReady = (snapshot: SandboxSnapshotSummary) => snapshot.status === "ready";

const SnapshotsPane = ({ sandbox, go, openSandbox }: { sandbox: SandboxSummary; go: GoToRoute; openSandbox?: (id: string) => void }) => {
  const capacity = useOrganizationCapacity();
  const restoreKeys = useIntentKeys();
  const [snapshots, setSnapshots] = useState<SandboxSnapshotSummary[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"load" | "create" | "restore" | "delete" | null>("load");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const canSnapshot = !sandbox.workspaceId && hasCapability(sandbox, "lifecycleSnapshot") && ["running", "idle", "paused"].includes(sandbox.status);
  const canRestore = hasCapability(sandbox, "createFromSnapshot");
  const canDelete = hasCapability(sandbox, "snapshotDelete");
  const load = () => {
    setBusy("load");
    return api.snapshots(`?sandboxId=${encodeURIComponent(sandbox.id)}`)
      .then((response) => {
        setSnapshots(response.snapshots);
        setError("");
      })
      .catch((cause) => {
        setSnapshots([]);
        setError(cause instanceof Error ? cause.message : "Snapshots are unavailable for this sandbox.");
      })
      .finally(() => setBusy(null));
  };
  useEffect(() => { void load(); }, [sandbox.id]);
  const createSnapshot = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSnapshot) return;
    setBusy("create");
    setMessage("");
    setError("");
    try {
      const result = await api.createSnapshot(sandbox.id, {
        name: name.trim() || undefined,
        wait: true,
        waitTimeoutMs: 60_000
      });
      setName("");
      setMessage(result.status === "pending" ? "Snapshot creation is still pending." : `Snapshot ${result.snapshot.id} is ready.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Snapshot creation failed.");
    } finally {
      setBusy(null);
    }
  };
  const restoreSnapshot = async (snapshot: SandboxSnapshotSummary) => {
    if (!snapshotIsReady(snapshot) || !canRestore || capacity.blocked) return;
    setBusy("restore");
    setMessage("");
    setError("");
    try {
      const result = await api.createSandbox({
        snapshotId: snapshot.id,
        idempotencyKey: restoreKeys.forIntent({ snapshotId: snapshot.id, name: snapshot.name || sandbox.name, ttlSeconds: sandbox.ttlSeconds }),
        name: `${snapshot.name || sandbox.name}-restore`,
        ttlSeconds: sandbox.ttlSeconds,
        wait: true
      });
      setMessage(`Restored as ${result.sandbox.id}.`);
      if (openSandbox) openSandbox(result.sandbox.id);
      else go("dashboard/sandboxes");
    } catch (cause) {
      capacity.acceptError(cause);
      setError(cause instanceof Error ? cause.message : "Snapshot restore failed.");
    } finally {
      setBusy(null);
    }
  };
  const deleteSnapshot = async (snapshot: SandboxSnapshotSummary) => {
    if (!canDelete) return;
    setBusy("delete");
    setMessage("");
    setError("");
    try {
      await api.deleteSnapshot(snapshot.id);
      setMessage(`Deleted ${snapshot.id}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Snapshot delete failed.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="snapshots-pane">
      <section className="snapshot-toolbar card">
        <div>
          <div className="card-h">Snapshots</div>
          <div className="network-sub">Persist a checkpoint and restore it as a new sandbox.</div>
        </div>
        <form className="snapshot-create" onSubmit={createSnapshot}>
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="checkpoint name" disabled={!canSnapshot || busy !== null} />
          <button className="btn btn-primary btn-sm" disabled={!canSnapshot || busy !== null}>
            <Icon name="snapshot" size={12} /> {busy === "create" ? "Creating" : "Create snapshot"}
          </button>
        </form>
      </section>
      {!canSnapshot ? <div className="network-warning">{sandbox.workspaceId ? "Workspace files require a separate storage backup. Snapshots of workspace-backed sandboxes are not supported." : "Snapshot creation is unavailable for this runtime state or provider."}</div> : null}
      {error ? <div className="network-error">{error}</div> : null}
      {message ? <div className="snapshot-message">{message}</div> : null}
      <div className="snapshot-table card">
        <div className="snapshot-row snapshot-head"><span>Name</span><span>Status</span><span>Template</span><span>Created</span><span>Expires</span><span /></div>
        {snapshots.map((snapshot) => (
          <div key={snapshot.id} className="snapshot-row">
            <span className="snapshot-name"><b>{snapshot.name || "unnamed snapshot"}</b><small className="num">{snapshot.id}</small></span>
            <span><span className={`pill snapshot-status ${snapshot.status === "ready" ? "live" : snapshot.status === "failed" ? "err" : "idle"}`}><span className="dot" /> {snapshot.status}</span>{snapshot.statusMessage ? <small className="snapshot-note">{snapshot.statusMessage}</small> : null}</span>
            <span><span className="tag">{snapshot.template ?? sandbox.template}</span></span>
            <span className="num muted">{formatDateTime(snapshot.createdAt)}</span>
            <span className="num muted">{snapshot.expiresAt ? formatDateTime(snapshot.expiresAt) : "-"}</span>
            <span className="snapshot-actions">
              <button className="btn btn-ghost btn-sm" disabled={!snapshotIsReady(snapshot) || !canRestore || capacity.blocked || busy !== null} onClick={() => void restoreSnapshot(snapshot)}>Restore</button>
              <button className="btn btn-ghost btn-sm route-delete" disabled={!canDelete || busy !== null} onClick={() => void deleteSnapshot(snapshot)} title="Delete snapshot"><Icon name="x" size={12} /></button>
            </span>
          </div>
        ))}
        {snapshots.length ? null : <div className="empty-state">{busy === "load" ? "Loading snapshots..." : "No snapshots recorded for this sandbox."}</div>}
      </div>
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
  const [policyEvents, setPolicyEvents] = useState<SandboxLogEntry[]>([]);
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
