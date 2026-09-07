import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { WorkspacesResponse, WorkspaceSummary } from "@harakiri/shared";
import { api } from "../api";
import { Dialog } from "../components/dialog";
import { Icon } from "../components/icon";
import { formatDateTime } from "../format";
import { CreateModal } from "./sandboxes";

export const workspaceStatusLabel = (status: WorkspaceSummary["status"]) => ({
  available: "Available", attached: "Attached", releasing: "Releasing", recovery_required: "Needs attention", archived: "Archived"
})[status];

export function WorkspacesRoute({ openSandbox }: { openSandbox: (id: string) => void }) {
  const [data, setData] = useState<WorkspacesResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [create, setCreate] = useState(false);
  const [archive, setArchive] = useState<WorkspaceSummary | null>(null);
  const [launch, setLaunch] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [formError, setFormError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setData(await api.workspaces()); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load workspaces."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const rows = (data?.workspaces ?? []).filter((row) => (filter === "all" || (filter === "archived" ? row.status === "archived" : row.status !== "archived")) && `${row.name} ${row.id}`.toLowerCase().includes(search.toLowerCase()));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setFormError("");
    try {
      if (archive) { await api.archiveWorkspace(archive.id); setArchive(null); }
      else { await api.createWorkspace({ name: name.trim() }); setCreate(false); setName(""); }
      await refresh();
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : "Unable to save workspace."); }
    finally { setBusy(false); }
  };
  return <div className="dash-page persistent-workspaces">
    <header className="workspace-heading"><div><h1>Workspaces</h1><p className="muted">Persistent project storage</p></div><div className="workspace-actions">
      <button className="btn btn-sm" title="Refresh workspaces" aria-label="Refresh workspaces" disabled={loading} onClick={() => void refresh()}><Icon name="refresh" /></button>
      <button className="btn btn-primary" disabled={!data?.policy.available || loading || data.workspaces.length >= data.policy.maxPerOrganization} onClick={() => { setFormError(""); setCreate(true); }}><Icon name="plus" /> New workspace</button>
    </div></header>
    {error ? <div role="alert" className="build-inline-alert">{error}</div> : null}
    {data && !data.policy.available ? <div role="status" className="workspace-notice">{data.policy.reason}</div> : null}
    <div className="workspace-toolbar"><label className="workspace-search"><Icon name="search" /><input className="input" type="search" aria-label="Search workspaces" placeholder="Search by name or ID" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <select className="input" aria-label="Workspace status" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All workspaces</option></select>
      {data ? <span className="muted workspace-allocation">{data.workspaces.length} / {data.policy.maxPerOrganization} allocated</span> : null}
    </div>
    <div className="workspace-table" role="table" aria-label="Persistent workspaces" aria-busy={loading}>
      <div className="workspace-row workspace-table-head" role="row"><span role="columnheader">Name</span><span role="columnheader">Storage</span><span role="columnheader">Status</span><span role="columnheader">Created</span><span role="columnheader">Actions</span></div>
      {rows.map((row) => <div className="workspace-row" role="row" key={row.id}>
        <div role="cell"><strong>{row.name}</strong><small className="mono muted">{row.id}</small></div>
        <div role="cell"><span>{row.sizeGiB} GiB</span><small className="mono muted">{row.mountPath}</small></div>
        <div role="cell"><span className={`workspace-state ${row.status}`}>{workspaceStatusLabel(row.status)}</span>{row.status === "recovery_required" ? <small className="muted">Contact your operator</small> : null}</div>
        <div role="cell" className="muted">{formatDateTime(row.createdAt)}</div>
        <div role="cell" className="workspace-actions">
          {row.status === "available" && data?.policy.available ? <button className="btn btn-sm" onClick={() => setLaunch(row.id)}><Icon name="plus" /> Create sandbox</button> : null}
          {row.attachedSandboxId ? <button className="btn btn-sm" onClick={() => openSandbox(row.attachedSandboxId!)}>Sandbox <Icon name="arrowR" /></button> : null}
          {row.status === "available" ? <button className="btn btn-sm btn-ghost" onClick={() => { setArchive(row); setFormError(""); }}>Archive</button> : null}
          {row.status === "archived" ? <span className="muted">Storage retained</span> : null}
        </div>
      </div>)}
      {!rows.length ? <div className="workspace-empty" role="status">{loading ? "Loading workspaces..." : data?.workspaces.length ? "No matching workspaces." : "No workspaces yet."}</div> : null}
    </div>
    {create || archive ? <Dialog title={archive ? `Archive ${archive.name}?` : "New workspace"} onClose={() => { if (!busy) { setCreate(false); setArchive(null); } }}>
      <form onSubmit={(event) => void submit(event)}><div className="modal-body">
        {archive ? <p>Files will be retained, and this workspace will continue to count toward your storage allocation. Physical deletion requires your operator.</p> : <>
          <label className="field">Name<input autoFocus className="input" maxLength={80} required value={name} onChange={(event) => setName(event.target.value)} placeholder="agent-project" /></label>
          <div className="workspace-notice">{data?.policy.sizeGiB} GiB at <code>/workspace</code>. Files remain after sandbox termination.</div>
        </>}
        {formError ? <div role="alert" className="build-inline-alert">{formError}</div> : null}
      </div><div className="modal-foot"><button type="button" className="btn" disabled={busy} onClick={() => { setArchive(null); setCreate(false); }}>Cancel</button><button className="btn btn-primary" disabled={busy || (!archive && !name.trim())}>{busy ? "Saving..." : archive ? "Archive and retain files" : "Create workspace"}</button></div></form>
    </Dialog> : null}
    {launch ? <CreateModal initialWorkspaceId={launch} onClose={() => setLaunch(null)} onCreate={openSandbox} /> : null}
  </div>;
}
