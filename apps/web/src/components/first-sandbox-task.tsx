import { useEffect, useRef, useState } from "react";
import type { CurrentAccountResponse, Template } from "@harakiri/shared";
import { api } from "../api";
import { firstSandboxCommand, firstTaskTemplates, readFirstTask, runFirstTask, type FirstSandboxTask } from "../first-sandbox";
import { Icon } from "./icon";
import { Field } from "./ui";

export function FirstSandboxTaskPanel({ account, onError }: { account: CurrentAccountResponse; onError: (error: unknown) => void }) {
  const storageKey = `harakiri:first-task:${account.auth.organizationId}:${account.user.id}`;
  const [task, setTask] = useState<FirstSandboxTask | null>(() => {
    try { return readFirstTask(sessionStorage.getItem(storageKey)); } catch { return null; }
  });
  const taskRef = useRef(task);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState(task?.templateId ?? "");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const load = async (offset = 0) => {
    setLoading(true); setCatalogError("");
    try {
      const { templates: catalog, page } = await api.templates(`?status=ready&limit=100&offset=${offset}`);
      if (!mounted.current) return;
      const eligible = firstTaskTemplates(catalog);
      setTemplates((previous) => offset ? [...previous, ...eligible.filter((item) => !previous.some((saved) => saved.id === item.id))] : eligible);
      setSelected((value) => offset > 0 && value ? value : eligible.some((template) => template.id === value) ? value : eligible[0]?.id ?? "");
      setNextOffset(page && page.offset + page.limit < page.total ? page.offset + page.limit : null);
    } catch { if (mounted.current) setCatalogError("Unable to load templates."); }
    finally { if (mounted.current) setLoading(false); }
  };
  useEffect(() => {
    mounted.current = true; void load();
    return () => { mounted.current = false; active.current?.abort(); };
  }, []);
  const save = (value: FirstSandboxTask) => {
    taskRef.current = value;
    try { sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* The mounted task still retains its identity. */ }
    if (mounted.current) setTask(value);
  };
  const run = async () => {
    if (active.current) return;
    const template = templates.find((item) => item.id === selected);
    let current = taskRef.current;
    if (!current) {
      if (!template) return;
      current = { templateId: template.id, cwd: template.workdir, intent: crypto.randomUUID() };
      save(current);
    }
    const controller = new AbortController();
    active.current = controller;
    const timeout = AbortSignal.timeout(45_000);
    const signal = AbortSignal.any([controller.signal, timeout]);
    setBusy(true); setMessage("");
    try { await runFirstTask(current, { client: api, save, signal }); }
    catch (error) {
      if (!mounted.current) return;
      if (signal.aborted) setMessage("Waiting paused. The sandbox keeps its five-minute lifetime.");
      else { onError(error); setMessage(error instanceof Error ? error.message : "The first task could not be completed."); }
    } finally { active.current = null; if (mounted.current) setBusy(false); }
  };
  return <section aria-label="First sandbox task">
    {!task ? <div className="onb-section">
      {catalogError ? <p role="alert">{catalogError}</p> : null}
      {!loading && !catalogError && !templates.length ? <p role="status">{nextOffset !== null ? "No eligible templates on this page." : <>No ready templates are available. {account.capabilities.canManageSettings ? <a href="#docs/install-kubernetes">Set up the first template</a> : "Ask an administrator to add a template."}</>}</p> : null}
      {templates.length ? <Field label="Template"><select className="input" aria-label="First sandbox template" value={selected} disabled={busy} onChange={(event) => setSelected(event.target.value)}>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></Field> : null}
      <button type="button" className="btn btn-ghost btn-sm" disabled={loading || busy} onClick={() => void load()}><Icon name="refresh" />{loading ? "Loading templates" : "Refresh templates"}</button>
      {nextOffset !== null ? <button type="button" className="btn btn-sm" disabled={loading || busy} onClick={() => void load(nextOffset)}>More templates <Icon name="arrowR" /></button> : null}
    </div> : <p className="workspace-notice">Template <code>{task.templateId}</code>{task.sandboxId ? <> / Sandbox <code>{task.sandboxId}</code></> : null}</p>}
    <div className="hterm card" style={{ maxWidth: 780 }}><div className="hterm-bar"><span className="hterm-title">first-sandbox.sh</span></div><div className="hterm-body" style={{ minHeight: 160 }}><div className="hterm-line">{firstSandboxCommand}</div>{task?.output ? <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{task.output}</pre> : null}</div></div>
    {message ? <p role="status" className="workspace-notice">{message}</p> : null}
    {task?.complete ? <p role="status">First task completed.</p> : null}
    <div className="onb-foot">
      {!task?.complete ? <button type="button" className="btn btn-primary" disabled={busy || (!task && (loading || !selected))} onClick={() => void run()}><Icon name="play" size={11} />{busy ? "Waiting for the first task" : task ? "Check first task" : "Run first sandbox"}</button> : null}
      {busy ? <button type="button" className="btn" onClick={() => active.current?.abort()}>Stop waiting</button> : null}
      {task?.sandboxId ? <a className="btn" href={`#dashboard/sandboxes/${encodeURIComponent(task.sandboxId)}`}>Open sandbox <Icon name="arrowR" size={11} /></a> : null}
    </div>
  </section>;
}
