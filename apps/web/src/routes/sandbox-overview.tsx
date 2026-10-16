import { useCallback, useEffect, useState } from "react";
import type { SandboxSummary } from "@harakiri/shared";
import { api } from "../api";
import { Icon } from "../components/icon";
import { formatDateTime } from "../format";
import { useWorkbenchQuery } from "../use-workbench-query";
import { workbenchRoute, type WorkbenchTab } from "../workbench";
import type { GoToRoute } from "./types";

const readinessMessage = {
  ready: "Ready for commands", starting: "Runtime is starting", unavailable: "Runtime cannot be reached",
  not_running: "Runtime is not running", unsupported: "Readiness checks are unsupported"
};

export function SandboxOverviewPane({ sandbox, go, selectTab, onSandboxChange }: {
  sandbox: SandboxSummary; go: GoToRoute; selectTab: (tab: WorkbenchTab) => void; onSandboxChange: (sandbox: SandboxSummary) => void;
}) {
  const loadReadiness = useCallback((signal: AbortSignal) => api.sandboxReadiness(sandbox.id, signal), [sandbox.id]);
  const loadCommands = useCallback((signal: AbortSignal) => api.commands(sandbox.id, signal), [sandbox.id]);
  const readiness = useWorkbenchQuery(loadReadiness, 5000);
  const commands = useWorkbenchQuery(loadCommands, 5000);
  const [copied, setCopied] = useState("");
  useEffect(() => { if (readiness.data) onSandboxChange(readiness.data.sandbox); }, [readiness.data, onSandboxChange]);
  const runtime = sandbox.runtimeMetadata;
  const state = readiness.error ? "unavailable" : readiness.data?.readiness.status;
  const copy = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(`${label} copied.`); }
    catch { setCopied("Copy failed. Select and copy the text instead."); }
  };
  const attach = `harakiri attach '${sandbox.id.replaceAll("'", "'\\''")}'`;
  return <section className="workbench-overview" aria-label="Sandbox overview">
    <header className="workbench-toolbar"><strong>{state ? readinessMessage[state] : "Checking readiness"}</strong><span className="workbench-path">{readiness.data ? formatDateTime(readiness.data.readiness.checkedAt) : ""}</span><button className="btn btn-sm" disabled={readiness.loading} onClick={readiness.refresh} title="Check readiness" aria-label="Check readiness"><Icon name="refresh" /></button></header>
    {readiness.error ? <p className="workbench-notice" role="alert">{readiness.error}</p> : null}
    {state === "unavailable" || state === "starting" ? <p className="workbench-notice">{state === "starting" ? "Waiting for the execution endpoint." : "The control plane cannot confirm execution readiness."} <button className="btn btn-sm" onClick={() => selectTab("logs")}>View logs</button></p> : null}
    <dl className="workbench-facts">
      <div><dt>Expires</dt><dd>{sandbox.expiresAt ? formatDateTime(sandbox.expiresAt) : "Not reported"}</dd></div>
      <div><dt>Execution slot</dt><dd>{sandbox.capacityPhase ?? "Not reported"}</dd></div>
      <div><dt>Template</dt><dd>{sandbox.template}</dd></div>
      <div><dt>Working directory</dt><dd><code>{runtime?.workdir ?? "Not reported"}</code></dd></div>
      <div><dt>Workspace</dt><dd>{sandbox.workspaceId ? <a href="#dashboard/workspaces" onClick={(event) => { event.preventDefault(); go("dashboard/workspaces"); }}>{sandbox.workspaceId}</a> : "Ephemeral filesystem"}</dd></div>
      <div><dt>Outbound access</dt><dd><button className="btn btn-sm" onClick={() => selectTab("network")}>{runtime?.egress?.mode ?? "Inspect policy"}<Icon name="arrowR" /></button></dd></div>
      <div><dt>Runtime provider</dt><dd>{runtime?.provider.kind ?? "Not reported"}</dd></div>
      <div><dt>Credentials</dt><dd><button className="btn btn-sm" onClick={() => selectTab("vault")}>View attachments<Icon name="arrowR" /></button></dd></div>
    </dl>
    <div className="workbench-section-heading"><h2>Connect</h2><button className="btn btn-sm" onClick={() => void copy(new URL(`#${workbenchRoute(sandbox.id, "overview")}`, location.href).href, "Workbench link")}><Icon name="copy" /> Copy link</button></div>
    <div className="workbench-connect"><code>{attach}</code><button className="btn btn-sm" title="Copy attach command" aria-label="Copy attach command" onClick={() => void copy(attach, "Attach command")}><Icon name="copy" /></button><button className="btn btn-sm" disabled={state !== "ready"} onClick={() => selectTab("terminal")}><Icon name="terminal" /> Open terminal</button></div>
    {copied ? <p role="status" className="workbench-notice">{copied}</p> : null}
    <div className="workbench-section-heading"><h2>Recent commands</h2><button className="btn btn-sm" onClick={() => selectTab("commands")}>All commands<Icon name="arrowR" /></button></div>
    {commands.error ? <p className="workbench-notice" role="alert">{commands.error}</p> : null}
    <div className="workbench-command-summary">{commands.data?.commands.slice(0, 5).map((command) => <a key={command.id} href={`#${workbenchRoute(sandbox.id, "commands", command.id)}`} onClick={(event) => { event.preventDefault(); go(workbenchRoute(sandbox.id, "commands", command.id)); }}><code>{command.command}</code><span>{command.status}{command.exitCode !== null ? ` / exit ${command.exitCode}` : command.finishReason ? ` / ${command.finishReason}` : ""}</span></a>)}</div>
    {!commands.data?.commands.length && !commands.error ? <p className="workbench-notice">{commands.loading ? "Loading commands..." : "No tracked commands."}</p> : null}
    <details className="workbench-capabilities"><summary>Runtime capabilities</summary><dl className="workbench-facts">{runtime?.provider.capabilities.map((capability) => <div key={capability.name}><dt>{capability.name}</dt><dd>{capability.state}{capability.reason ? <small>{capability.reason}</small> : null}</dd></div>)}</dl></details>
  </section>;
}
