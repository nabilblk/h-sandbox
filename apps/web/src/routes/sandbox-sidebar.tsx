import { useEffect, useState } from "react";
import type { SandboxSummary } from "@harakiri/shared";
import { api } from "../api";
import { Brand } from "../components/brand";
import { Icon } from "../components/icon";
import type { GoToRoute } from "./types";

const recentLimit = 200;

export function SandboxSidebar({
  selectedId,
  selectedSandbox,
  go
}: {
  selectedId: string;
  selectedSandbox: SandboxSummary | null;
  go: GoToRoute;
}) {
  const [sandboxes, setSandboxes] = useState<SandboxSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      setLoading(true);
      try {
        const response = await api.sandboxes(`?limit=${recentLimit}`);
        if (!cancelled) {
          setSandboxes(response.sandboxes);
          setError("");
        }
      } catch {
        if (!cancelled) setError("Could not refresh sandboxes.");
      } finally {
        pending = false;
        if (!cancelled) setLoading(false);
      }
    };
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    void load();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [selectedId, refreshKey]);

  const rows = selectedSandbox
    ? [selectedSandbox, ...sandboxes.filter((sandbox) => sandbox.id !== selectedSandbox.id)]
    : sandboxes;
  const search = query.trim().toLowerCase();
  const matches = rows.filter((sandbox) =>
    [sandbox.name, sandbox.id, sandbox.template].some((value) => value.toLowerCase().includes(search))
  );
  const groups = [
    { label: "Current", rows: matches.filter((sandbox) => sandbox.id === selectedId) },
    { label: "Active", rows: matches.filter((sandbox) => sandbox.id !== selectedId && sandbox.status !== "terminated") },
    { label: "History", rows: matches.filter((sandbox) => sandbox.id !== selectedId && sandbox.status === "terminated") }
  ];

  return (
    <aside className="dash-side sandbox-sidebar" aria-label="Sandbox navigation">
      <div className="dash-side-brand"><Brand /></div>
      <button className="btn btn-sm sandbox-back" onClick={() => go("dashboard/sandboxes")}>
        <Icon name="chevron" size={11} style={{ transform: "rotate(180deg)" }} /> All sandboxes
      </button>
      <div className="sandbox-switcher-head">
        <span>Recent sandboxes</span>
        <button className="btn btn-ghost btn-sm" title="Refresh sandboxes" aria-label="Refresh sandboxes" disabled={loading} onClick={() => setRefreshKey((key) => key + 1)}>
          <Icon name="refresh" size={13} />
        </button>
      </div>
      <div className="search-input sandbox-switcher-search">
        <Icon name="search" size={12} />
        <input type="search" aria-label="Search recent sandboxes" placeholder="Search sandboxes..." value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <label className="sandbox-switcher-mobile">
        <span>Switch sandbox</span>
        <select className="input" value={selectedId} onChange={(event) => go(`dashboard/sandboxes/${encodeURIComponent(event.target.value)}`)}>
          {!rows.some((sandbox) => sandbox.id === selectedId) ? <option value={selectedId}>{selectedId}</option> : null}
          {rows.map((sandbox) => <option key={sandbox.id} value={sandbox.id}>{sandbox.name} ({sandbox.status}) - {sandbox.id}</option>)}
        </select>
      </label>
      {error ? <div className="sandbox-switcher-notice" role="alert">{error} <button className="btn btn-sm" disabled={loading} onClick={() => setRefreshKey((key) => key + 1)}>Retry</button></div> : null}
      <nav className="detail-sbx-list" aria-label="Recent sandboxes" aria-busy={loading}>
        {groups.filter((group) => group.rows.length).map((group) => (
          <section key={group.label} aria-label={group.label}>
            <div className="sandbox-switcher-group">{group.label} <span>{group.rows.length}</span></div>
            {group.rows.map((sandbox) => (
              <a
                key={sandbox.id}
                className={`detail-sbx-item ${sandbox.id === selectedId ? "active" : ""}`}
                href={`#dashboard/sandboxes/${encodeURIComponent(sandbox.id)}`}
                aria-current={sandbox.id === selectedId ? "page" : undefined}
                title={`${sandbox.name}\n${sandbox.id}\n${sandbox.status} - ${sandbox.template}`}
                onClick={(event) => {
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  go(`dashboard/sandboxes/${encodeURIComponent(sandbox.id)}`);
                }}
              >
                <span className="name">{sandbox.name}</span>
                <span className="id">{sandbox.id}</span>
                <span className="sandbox-switcher-meta"><span className={`sandbox-switcher-status ${sandbox.status}`}>{sandbox.status}</span><span className="sandbox-switcher-template">{sandbox.template}</span></span>
              </a>
            ))}
          </section>
        ))}
        {!matches.length ? <p className="sandbox-switcher-notice" role="status">{loading ? "Loading sandboxes..." : error ? "Sandbox list unavailable." : search ? "No matching sandboxes." : "No recent sandboxes."}</p> : null}
        {sandboxes.length === recentLimit ? <p className="sandbox-switcher-notice">Showing the {recentLimit} most recent sandboxes.</p> : null}
      </nav>
    </aside>
  );
}
