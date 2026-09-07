import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { SandboxCommandSummary, SandboxSummary } from "@harakiri/shared";
import { api } from "../api";
import { Dialog } from "../components/dialog";
import { Icon } from "../components/icon";

const outputLimit = 200_000;
export const boundedCommandOutput = (current: string, next: string) => (current + next).slice(-outputLimit);
const running = (command?: SandboxCommandSummary) => command?.status === "running" || command?.status === "queued";

export function SandboxCommandsPane({ sandbox }: { sandbox: SandboxSummary }) {
  const [commands, setCommands] = useState<SandboxCommandSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [output, setOutput] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [commandText, setCommandText] = useState("");
  const [cwd, setCwd] = useState("/workspace");
  const [busy, setBusy] = useState(false);
  const [confirmKill, setConfirmKill] = useState(false);
  const cursor = useRef<string | undefined>(undefined);
  const outputLength = useRef(0);
  const outputRef = useRef<HTMLPreElement>(null);
  const stickToBottom = useRef(true);
  const selected = commands.find((command) => command.id === selectedId);
  const refresh = useCallback(async () => {
    try { setCommands((await api.commands(sandbox.id)).commands); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load commands."); }
    finally { setLoading(false); }
  }, [sandbox.id]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!following || !selectedId) return;
    const controller = new AbortController();
    setError("");
    void (async () => {
      try {
        for await (const event of api.streamCommand(sandbox.id, selectedId, { cursor: cursor.current, signal: controller.signal })) {
          if (controller.signal.aborted) return;
          cursor.current = event.cursor;
          if (event.type === "output") {
            const text = event.stdout + event.stderr;
            outputLength.current += text.length;
            setTruncated(outputLength.current > outputLimit);
            setOutput((current) => boundedCommandOutput(current, text));
          }
          if (event.type === "status" || event.type === "complete") {
            setCommands((current) => current.map((command) => command.id === selectedId ? { ...command, status: event.status, exitCode: event.exitCode } : command));
          }
        }
        if (!controller.signal.aborted) { setFollowing(false); await refresh(); }
      } catch (cause) {
        if (!controller.signal.aborted) { setFollowing(false); setError(cause instanceof Error ? cause.message : "Command output disconnected."); }
      }
    })();
    return () => controller.abort();
  }, [following, selectedId, sandbox.id, refresh]);
  useEffect(() => { if (stickToBottom.current && outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight; }, [output]);
  const selectCommand = (command: SandboxCommandSummary) => {
    if (command.id === selectedId) return;
    cursor.current = undefined; outputLength.current = 0; stickToBottom.current = true;
    setOutput(""); setTruncated(false); setError(""); setSelectedId(command.id); setFollowing(true);
  };
  const start = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await api.startCommand(sandbox.id, commandText, cwd);
      setCommands((current) => [result.command, ...current]); selectCommand(result.command); setCommandText("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to start command."); }
    finally { setBusy(false); }
  };
  const kill = async () => {
    setBusy(true); setError("");
    try { await api.killCommand(sandbox.id, selectedId); setConfirmKill(false); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to terminate command."); }
    finally { setBusy(false); }
  };
  return <section className="commands-pane" aria-label="Tracked commands">
    <form className="command-start" onSubmit={(event) => void start(event)}>
      <label>Command<input className="input mono" required value={commandText} onChange={(event) => setCommandText(event.target.value)} placeholder="python -u train.py" /></label>
      <label>Working directory<input className="input mono" required value={cwd} onChange={(event) => setCwd(event.target.value)} /></label>
      <button className="btn btn-primary" disabled={busy || !commandText.trim() || !["running", "idle"].includes(sandbox.status)}><Icon name="play" /> {busy ? "Starting..." : "Run"}</button>
    </form>
    {error ? <div role="alert" className="build-inline-alert">{error}</div> : null}
    <div className="command-workspace">
      <aside className="command-list"><div className="command-list-heading"><strong>Commands</strong><button className="btn btn-sm btn-ghost" title="Refresh commands" aria-label="Refresh commands" onClick={() => void refresh()}><Icon name="refresh" /></button></div>
        {!commands.length ? <p className="muted">{loading ? "Loading..." : "No commands yet."}</p> : null}
        {commands.map((command) => <button key={command.id} className={`command-list-item ${selectedId === command.id ? "selected" : ""}`} aria-pressed={selectedId === command.id} onClick={() => selectCommand(command)}>
          <span className="mono">{command.command}</span><small><span>{command.status}</span><span>{command.exitCode === null ? "" : `exit ${command.exitCode}`}</span></small>
        </button>)}
      </aside>
      <div className="command-output-area"><header className="command-output-toolbar"><div><strong>{selected ? "Output" : "No command selected"}</strong>{selected ? <small className="mono muted">{selected.id}</small> : null}</div>
        {selected ? <div className="workspace-actions"><span className="tag">{following ? "Following" : selected.status}{selected.exitCode !== null ? ` / exit ${selected.exitCode}` : ""}</span>
          <button className="btn btn-sm" onClick={() => setFollowing(!following)}><Icon name={following ? "pause" : "play"} /> {following ? "Stop viewing" : "Follow output"}</button>
          {running(selected) ? <button className="btn btn-sm" onClick={() => setConfirmKill(true)}><Icon name="stop" /> Terminate</button> : null}
        </div> : null}
      </header>
      {truncated ? <p className="workspace-notice" role="status">Showing the latest 200,000 characters. Earlier output is available through command logs while retained by the runtime.</p> : null}
      <pre className="command-live-output" ref={outputRef} tabIndex={0} aria-label="Command output" onScroll={(event) => { const el = event.currentTarget; stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>{output || (selected && running(selected) ? "Waiting for output..." : "No output.")}</pre>
      </div>
    </div>
    {confirmKill ? <Dialog title="Terminate command?" onClose={() => { if (!busy) setConfirmKill(false); }}><div className="modal-body"><p>The command will be stopped. Files already written to the workspace will remain.</p></div><div className="modal-foot"><button className="btn" disabled={busy} onClick={() => setConfirmKill(false)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={() => void kill()}>Terminate command</button></div></Dialog> : null}
  </section>;
}
