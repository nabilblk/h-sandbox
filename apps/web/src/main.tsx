import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { TEMPLATES, type SandboxRouteSummary, type SandboxSummary, type Template, type TemplateBuildLogEntry, type TemplateBuildSummary, type UsageSummary } from "@harakiri/shared";
import { api } from "./api";
import { auth, type UserProfile } from "./auth";
import "./styles.css";
import "./styles-landing.css";
import "./styles-app.css";

type Route = "landing" | "onboarding" | "dashboard/sandboxes" | "dashboard/templates" | "dashboard/metrics" | "dashboard/keys" | "dashboard/settings" | "detail" | "docs";
type OrganizationSummary = { name: string; slug: string; idleTtlSeconds: number; maxConcurrency: number; defaultTemplateId?: string };

const brandAssets = {
  markCrimson: "/brand/mark-crimson.svg",
  markWhite: "/brand/mark-white.svg",
  lockupCrimsonInk: "/brand/lockup-crimson-ink.svg"
};

const defaultWorkspace = (profile?: UserProfile | null) => {
  const emailLocal = profile?.email?.split("@")[0] || "workspace";
  const firstName = profile?.name?.split(/\s+/)[0] || emailLocal;
  const slugBase = emailLocal.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
  return { name: `${firstName} Labs`, slug: `${slugBase}-labs`, idleTtlSeconds: 300, maxConcurrency: 200 };
};

const BrandMark = ({ size = 16, variant = "crimson", className = "" }: { size?: number; variant?: "crimson" | "white"; className?: string }) => (
  <img
    className={`brand-mark ${className}`.trim()}
    src={variant === "white" ? brandAssets.markWhite : brandAssets.markCrimson}
    alt=""
    width={size}
    height={size}
    aria-hidden="true"
    style={{ width: size, height: size }}
  />
);

const Brand = ({ size = 16 }) => (
  <span className="brand" style={{ fontSize: size }}>
    <BrandMark size={Math.max(22, Math.round(size * 1.45))} />
    <span className="brand-name">
      <b>harakiri</b>
    </span>
  </span>
);

const Icon = ({ name, size = 14, style }: { name: string; size?: number; style?: React.CSSProperties }) => {
  const common = { width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", style } as const;
  const paths: Record<string, React.ReactNode> = {
    box: <><path d="M2.5 4.5 8 1.5l5.5 3v7L8 14.5l-5.5-3v-7Z" /><path d="M2.5 4.5 8 7.5l5.5-3" /><path d="M8 7.5v7" /></>,
    plus: <><path d="M8 3v10M3 8h10" /></>,
    search: <><circle cx="7" cy="7" r="4" /><path d="m10 10 3 3" /></>,
    chevron: <><path d="m6 4 4 4-4 4" /></>,
    chevDown: <><path d="m4 6 4 4 4-4" /></>,
    arrowR: <><path d="M3 8h10M9 4l4 4-4 4" /></>,
    terminal: <><rect x="1.5" y="2.5" width="13" height="11" rx="1" /><path d="m4 6 2 2-2 2M8 10h4" /></>,
    file: <><path d="M4 1.5h5L13 5v9.5H4z" /><path d="M9 1.5V5h4" /></>,
    folder: <><path d="M1.5 4a1 1 0 0 1 1-1H6l1.5 1.5h6a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V4Z" /></>,
    logs: <><path d="M2.5 3h11M2.5 6h11M2.5 9h7M2.5 12h11" /></>,
    chart: <><path d="M2 13h12M4 11V7M7 11V4M10 11V8M13 11V5" /></>,
    bell: <><path d="M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3L4 11Z" /><path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" /></>,
    key: <><circle cx="5" cy="11" r="2.5" /><path d="m7 9 5-5M11 5l1.5 1.5M9.5 6.5 11 8" /></>,
    book: <><path d="M2.5 2.5h4a2 2 0 0 1 2 2v9a1.5 1.5 0 0 0-1.5-1.5H2.5v-9.5Z" /><path d="M13.5 2.5h-4a2 2 0 0 0-2 2v9a1.5 1.5 0 0 1 1.5-1.5h4.5v-9.5Z" /></>,
    settings: <><circle cx="8" cy="8" r="2" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5 13 13M3 13l1.5-1.5M11.5 4.5 13 3" /></>,
    user: <><circle cx="8" cy="6" r="2.5" /><path d="M3 13.5c.5-2 2.5-3.5 5-3.5s4.5 1.5 5 3.5" /></>,
    copy: <><rect x="5" y="5" width="9" height="9" rx="1" /><path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" /></>,
    check: <><path d="m3 8 3.5 3.5L13 5" /></>,
    x: <><path d="m4 4 8 8M12 4l-8 8" /></>,
    refresh: <><path d="M13.5 8a5.5 5.5 0 0 1-9.4 3.9M2.5 8a5.5 5.5 0 0 1 9.4-3.9" /><path d="M13.5 2.5v3h-3M2.5 13.5v-3h3" /></>,
    py: <><path d="M3 8h7a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2V8Z" /><path d="M13 8H6a2 2 0 0 0-2 2v2.5a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V8Z" /></>,
    node: <><path d="M8 1.5 2.5 4.5v7L8 14.5l5.5-3v-7L8 1.5Z" /></>,
    lock: <><rect x="3" y="7" width="10" height="7" rx="1" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></>,
    bolt: <><path d="M9 1.5 3 9h4l-1 5.5L13 7H9l1-5.5h-1Z" /></>,
    globe: <><circle cx="8" cy="8" r="6.5" /><path d="M1.5 8h13M8 1.5c2 2 2 11 0 13M8 1.5c-2 2-2 11 0 13" /></>,
    stop: <><rect x="3.5" y="3.5" width="9" height="9" rx="1" /></>,
    play: <><path d="M4 3v10l9-5-9-5Z" /></>
  };
  return <svg {...common}>{paths[name] ?? <circle cx="8" cy="8" r="1.5" fill="currentColor" />}</svg>;
};

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div className="field">
    <div className="field-l">{label}</div>
    {children}
    {hint ? <div className="field-h">{hint}</div> : null}
  </div>
);

const Chart = ({ data }: { data: number[] }) => {
  const w = 880;
  const h = 200;
  const pad = 8;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => [pad + (i / Math.max(data.length - 1, 1)) * (w - pad * 2), h - pad - (v / max) * (h - pad * 2)]);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]} ${p[1]}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 200, display: "block" }}>
      {[0.25, 0.5, 0.75].map((t) => <line key={t} x1={pad} x2={w - pad} y1={h * t} y2={h * t} stroke="var(--border)" strokeDasharray="2 4" />)}
      <path d={`${path} L ${w - pad} ${h - pad} L ${pad} ${h - pad} Z`} fill="oklch(0.15 0.01 90 / 0.05)" />
      <path d={path} fill="none" stroke="var(--ink)" strokeWidth="1.5" />
    </svg>
  );
};

const TopNav = ({ go, profile, onSignIn, onSignOut }: { go: (route: Route) => void; profile?: UserProfile | null; onSignIn?: () => void; onSignOut?: () => void }) => (
  <div className="topnav">
    <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
      <button className="btn btn-ghost" onClick={() => go("landing")} style={{ padding: 0, height: "auto" }}><Brand /></button>
      <div className="links" style={{ marginLeft: 8 }}>
        <a className="active">Product</a>
        <a>Customers</a>
        <a onClick={() => go("docs")}>Docs</a>
        <a>Changelog</a>
      </div>
    </div>
    <div className="right">
      {profile ? <button className="btn btn-ghost btn-sm" onClick={onSignOut}>{profile.email ?? "Sign out"}</button> : <button className="btn btn-ghost btn-sm" onClick={onSignIn}>Sign in</button>}
      <button className="btn btn-primary btn-sm" onClick={() => go("onboarding")}>Get started <Icon name="arrowR" size={12} /></button>
    </div>
  </div>
);

const Landing = ({ go, profile, onSignIn, onSignOut }: { go: (route: Route) => void; profile?: UserProfile | null; onSignIn: () => void; onSignOut: () => void }) => (
  <div className="landing">
    <TopNav go={go} profile={profile} onSignIn={onSignIn} onSignOut={onSignOut} />
    <section className="hero">
      <div className="hero-inner">
        <div className="hero-eyebrow"><BrandMark size={12} /><span>OpenSandbox control plane for agent runtimes</span><Icon name="arrowR" size={11} /></div>
        <h1 className="hero-h1">Disposable VMs<br />for code your agents<br /><span className="ink-red">should not be trusted</span> with.</h1>
        <p className="hero-sub">Harakiri provisions sealed sandboxes, tracks every route and schedule in PostgreSQL, and gives teams an E2B-like developer surface on top of OpenSandbox.</p>
        <div className="hero-cta">
          <button className="btn btn-primary btn-lg" onClick={() => go("onboarding")}>Start building -&gt;</button>
          <button className="btn btn-lg" onClick={() => go("docs")}>Read the docs <Icon name="arrowR" size={12} /></button>
        </div>
        <div className="hero-meta">
          <span><Icon name="check" size={12} /> Keycloak auth</span>
          <span><Icon name="check" size={12} /> PostgreSQL control plane</span>
          <span><Icon name="check" size={12} /> k0s deployable</span>
        </div>
      </div>
      <HeroTerminal />
    </section>
    <section className="section">
      <div className="feat-grid">
        <Feature icon="bolt" title="Fast lifecycle" body="Create, run, renew, route, and kill sandboxes through one control-plane API." />
        <Feature icon="lock" title="Tenant scoped" body="Every API key and Keycloak session is tied to an organization boundary." />
        <Feature icon="terminal" title="CLI first" body="The same API powers the dashboard and the harakiri command-line workflow." />
        <Feature icon="chart" title="Usage aware" body="Lifecycle events, metrics, and schedules are persisted for inspection." />
        <Feature icon="globe" title="Routing records" body="Exposed ports are tracked and visible in the network tab." />
        <Feature icon="box" title="OpenSandbox wrapper" body="Provider integration stays behind a small adapter for runtime portability." />
      </div>
    </section>
    <section className="cta"><div className="cta-inner"><h2 className="cta-h">Your agent ships a bug. The sandbox dies.</h2><button className="btn btn-primary btn-lg" onClick={() => go("onboarding")}>Start building <Icon name="arrowR" size={12} /></button></div></section>
  </div>
);

const HeroTerminal = () => (
  <div className="hero-canvas">
    <div className="hterm hterm-brand card">
      <div className="hterm-bar"><span className="terminal-key">E</span><span className="hterm-title">TERMINAL BANNER</span><span className="pill live" style={{ marginLeft: "auto" }}><span className="dot" /> running</span></div>
      <div className="hterm-body">
        <div className="terminal-brand-banner"><BrandMark size={68} /></div>
        <div className="hterm-line">$ <em>harakiri</em> init</div>
        <div className="hterm-line muted">-&gt; ok. sealed. ready.</div>
        <div className="hterm-line">$ <span className="blink">|</span></div>
        <div className="terminal-sep" />
        <div className="hterm-line">$ <em>harakiri</em> create --template python-3.12-data</div>
        <div className="hterm-line muted">-&gt; provisioning microVM... <span className="num">137ms</span></div>
        <div className="hterm-line muted">-&gt; sealed. id=<b>sbx_jt29kf01x4</b></div>
        <div className="hterm-line">$ <em>harakiri</em> run --stdin agent.py</div>
        <div className="hterm-line muted">&gt;&gt;&gt; reading market_data.csv (412kb)</div>
        <div className="hterm-line muted">&gt;&gt;&gt; fitting model on 18,402 rows</div>
        <div className="hterm-line"><span className="ok">ok</span> rmse=<span className="num">0.0418</span> - runtime=<span className="num">3.41s</span></div>
        <div className="hterm-line muted">-&gt; sandbox terminated. disk zeroed.</div>
        <div className="hterm-line">$ <span className="blink">|</span></div>
      </div>
    </div>
  </div>
);

const Feature = ({ icon, title, body }: { icon: string; title: string; body: string }) => (
  <div className="feat"><span className="feat-ico"><Icon name={icon} size={16} /></span><div className="feat-t">{title}</div><div className="feat-b">{body}</div></div>
);

const DashboardShell = ({ route, go, openSandbox, profile, onSignOut }: { route: Route; go: (route: Route) => void; openSandbox: (id: string) => void; profile?: UserProfile | null; onSignOut: () => void }) => {
  const sub = route.split("/")[1] ?? "sandboxes";
  const [organization, setOrganization] = useState<OrganizationSummary | null>(null);
  useEffect(() => { api.me().then((r) => setOrganization(r.organization)).catch(() => undefined); }, []);
  const org = organization ?? defaultWorkspace(profile);
  const orgInitial = (org.name || profile?.email || "H").slice(0, 1).toUpperCase();
  return (
    <div className="dash">
      <aside className="dash-side">
        <div className="dash-side-brand"><button className="btn btn-ghost" onClick={() => go("landing")} style={{ padding: 0, height: "auto" }}><Brand /></button></div>
        <div className="org-switcher"><div className="org-ava">{orgInitial}</div><div style={{ flex: 1 }}><div className="org-name">{org.slug}</div><div className="org-plan">Team - 4 seats</div></div><Icon name="chevDown" size={12} /></div>
        <nav className="side-nav">
          {[
            ["dashboard/sandboxes", "Sandboxes", "box"],
            ["dashboard/templates", "Templates", "folder"],
            ["dashboard/metrics", "Usage", "chart"],
            ["dashboard/keys", "API keys", "key"],
            ["dashboard/settings", "Settings", "settings"]
          ].map(([key, label, icon]) => (
            <a key={key} className={`side-link ${route === key ? "active" : ""}`} onClick={() => go(key as Route)}><Icon name={icon} size={14} /><span>{label}</span></a>
          ))}
        </nav>
        <div className="side-foot"><div className="usage-mini"><div className="usage-mini-h"><span>Status</span><span className="num" style={{ color: "var(--ok)" }}>operational</span></div><div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>v0.41.2 - all systems</div></div></div>
      </aside>
      <main className="dash-main">
        <div className="dash-top"><div className="dash-crumbs"><span style={{ color: "var(--muted)" }}>{org.slug}</span><Icon name="chevron" size={11} /><span style={{ textTransform: "capitalize" }}>{sub}</span></div><div className="dash-top-r"><button className="btn btn-ghost btn-sm"><Icon name="search" size={13} /><span className="kbd">CmdK</span></button><button className="btn btn-ghost btn-sm" onClick={() => go("docs")}><Icon name="book" size={13} /></button><button className="btn btn-ghost btn-sm"><Icon name="bell" size={13} /></button><button className="ava-sm" onClick={onSignOut} title={profile?.email ?? "Sign out"}>{orgInitial}</button></div></div>
        {sub === "sandboxes" ? <Sandboxes openSandbox={openSandbox} /> : null}
        {sub === "templates" ? <Templates openSandbox={openSandbox} /> : null}
        {sub === "metrics" ? <Usage /> : null}
        {sub === "keys" ? <Keys /> : null}
        {sub === "settings" ? <Settings /> : null}
      </main>
    </div>
  );
};

const Sandboxes = ({ openSandbox }: { openSandbox: (id: string) => void }) => {
  const [rows, setRows] = useState<SandboxSummary[]>([]);
  const [filter, setFilter] = useState("running");
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const load = () => api.sandboxes().then((r) => setRows(r.sandboxes));
  useEffect(() => { void load(); }, []);
  const matchesFilter = (sandbox: SandboxSummary) => {
    if (filter === "all") return true;
    if (filter === "history") return sandbox.status === "terminated";
    return sandbox.status === filter;
  };
  const query = q.trim().toLowerCase();
  const filtered = rows
    .filter((s) => matchesFilter(s) && (!query || s.name.toLowerCase().includes(query) || s.id.toLowerCase().includes(query)))
    .sort((a, b) => {
      const order = { running: 0, idle: 1, error: 2, terminated: 3 } as Record<string, number>;
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });
  const counts = {
    running: rows.filter((s) => s.status === "running").length,
    idle: rows.filter((s) => s.status === "idle").length,
    error: rows.filter((s) => s.status === "error").length,
    history: rows.filter((s) => s.status === "terminated").length
  };
  const tabs = [
    ["running", "Running", counts.running],
    ["idle", "Idle", counts.idle],
    ["error", "Error", counts.error],
    ["history", "History", counts.history],
    ["all", "All", rows.length]
  ] as const;
  const emptyCopy = filter === "running" ? "No running sandboxes." : filter === "history" ? "No terminated sandboxes in history." : `No ${filter} sandboxes.`;
  return (
    <div className="dash-page">
      <div className="page-head"><div><h1 className="page-h">Sandboxes</h1><div className="page-sub"><span><span className="dot live" /> <b className="num">{counts.running}</b> running</span><span><span className="dot idle" /> <b className="num">{counts.idle}</b> idle</span><span><span className="dot err" /> <b className="num">{counts.error}</b> errored</span></div></div><div style={{ display: "flex", gap: 8 }}><button className="btn btn-sm" onClick={load}><Icon name="refresh" size={12} /> Refresh</button><button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}><Icon name="plus" size={12} /> New sandbox</button></div></div>
      <div className="filter-bar"><div className="filter-tabs">{tabs.map(([key, label, count]) => <button key={key} className={`filter-tab ${filter === key ? "active" : ""}`} onClick={() => setFilter(key)}>{label} <span className="filter-count">{count}</span></button>)}</div><div className="filter-right"><div className="search-input"><Icon name="search" size={12} /><input placeholder="Filter by name or id..." value={q} onChange={(e) => setQ(e.target.value)} /></div><button className="btn btn-ghost btn-sm">Owner <Icon name="chevDown" size={11} /></button><button className="btn btn-ghost btn-sm">Template <Icon name="chevDown" size={11} /></button></div></div>
      <div className="sbx-table card"><div className="sbx-tr sbx-head"><div>Name</div><div>Status</div><div>Template</div><div>CPU</div><div>Mem</div><div>Started</div><div /></div>{filtered.map((s) => <div key={s.id} className="sbx-tr" onClick={() => openSandbox(s.id)}><div><div className="sbx-name">{s.name}</div><div className="sbx-id num">{s.id}</div></div><div><span className={`pill ${s.status === "running" ? "live" : s.status === "idle" ? "idle" : s.status === "error" ? "err" : ""}`}><span className="dot" /> {s.status}</span></div><div><span className="tag">{s.template}</span></div><div className="num"><span className="meter"><span className="meter-fill" style={{ width: `${s.cpu}%`, background: s.cpu > 50 ? "var(--warn)" : "var(--ok)" }} /></span>{s.cpu}%</div><div className="num">{s.mem} MB</div><div className="num" style={{ color: "var(--muted)" }}>{s.started}</div><div className="ta-r"><button className="btn btn-ghost btn-sm">Open <Icon name="arrowR" size={11} /></button></div></div>)}{filtered.length ? null : <div className="sbx-empty"><div className="sbx-empty-title">{emptyCopy}</div><div className="sbx-empty-sub">{filter === "running" ? "Create a sandbox to start working, or open History to review terminated runs." : "Try another status filter or clear the search field."}</div><div className="sbx-empty-actions"><button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}><Icon name="plus" size={12} /> New sandbox</button>{filter === "running" ? <button className="btn btn-sm" onClick={() => setFilter("history")}>View history</button> : null}</div></div>}</div>
      <div className="dash-foot-tip">Tip: kill all idle sandboxes with <code>harakiri kill --idle</code>. Or set TTL per template.</div>
      {showCreate ? <CreateModal onClose={() => setShowCreate(false)} onCreate={(id) => { setShowCreate(false); void load(); openSandbox(id); }} /> : null}
    </div>
  );
};

const CreateModal = ({ onClose, onCreate }: { onClose: () => void; onCreate: (id: string) => void }) => {
  const [template, setTemplate] = useState("python-3.12-data");
  const [name, setName] = useState("");
  const [ttlSeconds, setTtlSeconds] = useState(300);
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setLoading(true);
    const result = await api.createSandbox({ template, name, ttlSeconds });
    onCreate(result.sandbox.id);
  };
  return (
    <div className="modal-wrap" onClick={onClose}><div className="modal card" onClick={(e) => e.stopPropagation()}><div className="modal-head"><h3>New sandbox</h3><button className="btn btn-ghost btn-sm" onClick={onClose}><Icon name="x" size={12} /></button></div><div className="modal-body"><Field label="Template"><div className="tmpl-pick">{TEMPLATES.slice(0, 4).map((t) => <button key={t.id} className={`tmpl-pick-c ${template === t.id ? "active" : ""}`} onClick={() => setTemplate(t.id)}><Icon name={t.icon} size={14} /><span>{t.name}</span></button>)}</div></Field><Field label="Name (optional)" hint="A label for your own reference"><input className="input" placeholder="agent-eval-runner" value={name} onChange={(e) => setName(e.target.value)} /></Field><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><Field label="Idle TTL"><input className="input mono" type="number" value={ttlSeconds} onChange={(e) => setTtlSeconds(Number(e.target.value))} /></Field><Field label="Resources"><select className="input"><option>2 vCPU - 2 GiB</option><option>4 vCPU - 4 GiB</option></select></Field></div><div className="cost-est"><span style={{ color: "var(--muted)" }}>Cold start</span><span className="num">~142ms - idle TTL {ttlSeconds}s</span></div></div><div className="modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={loading}>{loading ? <><span className="spinner" /> Provisioning...</> : <>Create sandbox <Icon name="arrowR" size={11} /></>}</button></div></div></div>
  );
};

const shortDigest = (value?: string | null) => value ? value.replace(/^sha256:/, "").slice(0, 12) : "-";
const buildDuration = (build: TemplateBuildSummary) => {
  const start = build.startedAt ?? build.createdAt;
  const end = build.completedAt ?? null;
  if (!start || !end) return "-";
  const ms = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(ms) || ms < 0) return "-";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
};

const Templates = ({ openSandbox }: { openSandbox: (id: string) => void }) => {
  const [tab, setTab] = useState<"list" | "builds">("list");
  const [templates, setTemplates] = useState<Template[]>(TEMPLATES);
  const [templateTotal, setTemplateTotal] = useState(TEMPLATES.length);
  const [builds, setBuilds] = useState<TemplateBuildSummary[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [q, setQ] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [buildQ, setBuildQ] = useState("");
  const [buildStatus, setBuildStatus] = useState("all");
  const [selectedBuild, setSelectedBuild] = useState<TemplateBuildSummary | null>(null);
  const [buildLogs, setBuildLogs] = useState<TemplateBuildLogEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const loadTemplates = async () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (visibility !== "all") params.set("visibility", visibility);
    params.set("limit", "100");
    try {
      const result = await api.templates(`?${params.toString()}`);
      setTemplates(result.templates);
      setTemplateTotal(result.page?.total ?? result.templates.length);
    } catch {
      // Keep the bootstrap catalog visible if the API is temporarily unavailable.
    }
  };
  const loadBuilds = async () => {
    const params = new URLSearchParams();
    if (buildQ.trim()) params.set("q", buildQ.trim());
    if (buildStatus !== "all") params.set("status", buildStatus);
    const query = params.toString();
    try {
      const result = await api.templateBuilds(query ? `?${query}` : "");
      setBuilds(result.builds);
    } catch {
      setBuilds([]);
    }
  };
  useEffect(() => { void loadTemplates(); }, [q, visibility]);
  useEffect(() => { void loadBuilds(); }, [buildQ, buildStatus]);
  useEffect(() => { api.usage().then(setUsage).catch(() => undefined); }, []);
  useEffect(() => {
    if (!selectedBuild) { setBuildLogs([]); return; }
    api.templateBuildLogs(selectedBuild.id).then((r) => setBuildLogs(r.logs)).catch(() => setBuildLogs([]));
  }, [selectedBuild]);

  const buildCounts = useMemo(() => ({
    all: builds.length,
    queued: builds.filter((build) => build.status === "queued").length,
    building: builds.filter((build) => build.status === "building").length,
    success: builds.filter((build) => build.status === "success").length,
    failed: builds.filter((build) => build.status === "failed").length,
    canceled: builds.filter((build) => build.status === "canceled").length
  }), [builds]);

  const createFromTemplate = async (templateId: string) => {
    setBusy(`use:${templateId}`);
    try {
      const result = await api.createSandbox({ template: templateId, ttlSeconds: 300, name: `${templateId}-runner` });
      openSandbox(result.sandbox.id);
    } finally {
      setBusy(null);
    }
  };
  const queueBuild = async (template: Template) => {
    setBusy(`build:${template.id}`);
    try {
      const result = await api.createTemplateBuild(template.id, { sourceType: "image", imageDestination: template.image });
      setSelectedBuild(result.build);
      setTab("builds");
      await loadBuilds();
    } finally {
      setBusy(null);
    }
  };
  const retryBuild = async (id: string) => {
    setBusy(`retry:${id}`);
    try {
      const result = await api.retryTemplateBuild(id);
      setSelectedBuild(result.build);
      await loadBuilds();
    } finally {
      setBusy(null);
    }
  };
  const cancelBuild = async (id: string) => {
    setBusy(`cancel:${id}`);
    try {
      const result = await api.cancelTemplateBuild(id);
      setSelectedBuild(result.build);
      await loadBuilds();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="dash-page tmpl-workspace">
      <div className="tmpl-topline">
        <div>
          <h1 className="page-h">Templates</h1>
          <div className="tmpl-tabs">
            <button className={`tmpl-tab ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")}><Icon name="logs" size={13} /> List</button>
            <button className={`tmpl-tab ${tab === "builds" ? "active" : ""}`} onClick={() => setTab("builds")}><Icon name="settings" size={13} /> Builds</button>
          </div>
        </div>
        <div className="tmpl-live">
          <button className="btn btn-ghost btn-sm" onClick={() => { loadTemplates(); loadBuilds(); void api.usage().then(setUsage); }}><Icon name="refresh" size={12} /> Refresh</button>
          <span className="pill live"><span className="dot" /> live</span>
          <span className="num">{usage?.concurrentNow ?? 0}</span>
          <span className="tmpl-live-label">concurrent sandboxes</span>
        </div>
      </div>

      {tab === "list" ? (
        <>
          <div className="tmpl-toolbar">
            <div className="search-input tmpl-search"><Icon name="search" size={12} /><input placeholder="Search by name or ID..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <button className={`btn btn-sm ${visibility === "all" ? "active" : ""}`} onClick={() => setVisibility("all")}>All</button>
            <button className={`btn btn-sm ${visibility === "internal" ? "active" : ""}`} onClick={() => setVisibility("internal")}>Internal</button>
            <button className={`btn btn-sm ${visibility === "public" ? "active" : ""}`} onClick={() => setVisibility("public")}>Public</button>
            <button className={`btn btn-sm ${visibility === "private" ? "active" : ""}`} onClick={() => setVisibility("private")}>Private</button>
            <span className="tmpl-total num">{templateTotal} total</span>
          </div>
          <div className="tmpl-list card">
            <div className="tmpl-row tmpl-head"><span>Name</span><span>ID</span><span>CPU</span><span>Memory</span><span>Updated</span><span>Visibility</span><span>Version</span><span /></div>
            {templates.map((template) => (
              <div className="tmpl-row" key={template.id}>
                <span className="tmpl-main-name"><b>{template.name}</b><small>{template.aliases?.length ? template.aliases.join(", ") : template.description}</small></span>
                <span className="num muted">{template.id}</span>
                <span>{template.cpuCount ?? 1} Cores</span>
                <span className="num">{template.memoryMb?.toLocaleString() ?? 1024} MB</span>
                <span className="num muted">{formatDateTime(template.updatedAt)}</span>
                <span><span className={`tag ${template.visibility === "internal" ? "tag-lock" : ""}`}>{template.visibility === "internal" ? <Icon name="lock" size={10} /> : null}{template.visibility}</span></span>
                <span className="num muted">{shortDigest(template.imageDigest ?? template.latestVersionId)}</span>
                <span className="tmpl-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => createFromTemplate(template.id)} disabled={busy === `use:${template.id}`}>Use</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => queueBuild(template)} disabled={busy === `build:${template.id}`}>Build</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => void navigator.clipboard?.writeText(template.id)} title="Copy template ID"><Icon name="copy" size={12} /></button>
                </span>
              </div>
            ))}
            {templates.length ? null : <div className="sbx-empty"><div className="sbx-empty-title">No templates found.</div><div className="sbx-empty-sub">Clear filters or create a template from the CLI.</div></div>}
          </div>
        </>
      ) : (
        <>
          <div className="tmpl-toolbar build-toolbar">
            <div className="search-input tmpl-search"><Icon name="search" size={12} /><input placeholder="Build ID, Template ID or Name" value={buildQ} onChange={(e) => setBuildQ(e.target.value)} /></div>
            {(["all", "queued", "building", "success", "failed", "canceled"] as const).map((status) => (
              <button key={status} className={`btn btn-sm ${buildStatus === status ? "active" : ""}`} onClick={() => setBuildStatus(status)}>
                {status} <span className="filter-count">{buildCounts[status]}</span>
              </button>
            ))}
          </div>
          <div className="tmpl-build-layout">
            <div className="tmpl-builds card">
              <div className="build-row build-head"><span>Status</span><span>Template</span><span>Started</span><span>Duration</span><span>ID</span><span>Result</span><span /></div>
              {builds.map((build) => (
                <div
                  className={`build-row ${selectedBuild?.id === build.id ? "active" : ""}`}
                  key={build.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedBuild(build)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedBuild(build);
                    }
                  }}
                >
                  <span><span className={`build-badge ${build.status}`}>{build.status}</span></span>
                  <span>{build.templateId}</span>
                  <span className="num muted">{formatDateTime(build.startedAt ?? build.createdAt)}</span>
                  <span className="num">{buildDuration(build)}</span>
                  <span className="num muted">{build.id}</span>
                  <span className="muted">{build.error ?? shortDigest(build.imageDigest)}</span>
                  <span className="tmpl-actions">
                    {build.status === "queued" || build.status === "building" ? <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); void cancelBuild(build.id); }} disabled={busy === `cancel:${build.id}`}>Cancel</button> : null}
                    <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); void retryBuild(build.id); }} disabled={busy === `retry:${build.id}`}>Retry</button>
                  </span>
                </div>
              ))}
              {builds.length ? null : <div className="sbx-empty"><div className="sbx-empty-title">No builds found.</div><div className="sbx-empty-sub">Queue a build from the List tab or use the CLI.</div></div>}
            </div>
            <div className="build-detail card">
              {selectedBuild ? (
                <>
                  <div className="build-detail-head"><div><div className="card-h">Build details</div><div className="num muted">{selectedBuild.id}</div></div><span className={`build-badge ${selectedBuild.status}`}>{selectedBuild.status}</span></div>
                  <div className="build-meta">
                    <span>Template <b>{selectedBuild.templateId}</b></span>
                    <span>Dockerfile <b>{selectedBuild.dockerfilePath ?? "Dockerfile"}</b></span>
                    <span>Image <b>{selectedBuild.imageDestination ?? "pending"}</b></span>
                  </div>
                  <div className="build-log">
                    {buildLogs.length ? buildLogs.map((line) => <div key={line.lineNo}><span className="num">{line.lineNo}</span><span>{line.message}</span></div>) : <div className="muted">No build logs yet. The builder worker has not started this record.</div>}
                  </div>
                </>
              ) : (
                <div className="sbx-empty"><div className="sbx-empty-title">Select a build.</div><div className="sbx-empty-sub">Logs and result metadata appear here.</div></div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const Usage = () => {
  const [usage, setUsage] = useState<any>(null);
  useEffect(() => { api.usage().then(setUsage).catch(() => undefined); }, []);
  const u = usage ?? { sandboxesSpawned: 0, computeHours: 0, avgColdStartMs: 0, avgRuntimeSeconds: 0, concurrentNow: 0, concurrentPeak: 0, series: [1, 2, 3], topTemplates: [], statusBreakdown: [] };
  return <div className="dash-page"><div className="page-head"><div><h1 className="page-h">Usage</h1><div className="page-sub"><span style={{ color: "var(--muted)" }}>Across all sandboxes - last 14 days</span></div></div><button className="btn btn-sm active">14d</button></div><div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}><KPI label="Sandboxes spawned" v={String(u.sandboxesSpawned)} delta="+18.4%" /><KPI label="Total compute-hours" v={String(u.computeHours)} delta="+9.1%" /><KPI label="Avg cold start" v={`${u.avgColdStartMs}ms`} delta="-3ms" /><KPI label="Avg runtime" v={`${u.avgRuntimeSeconds}s`} delta="-0.21s" /></div><div className="card" style={{ padding: 24 }}><div style={{ marginBottom: 18 }}><div style={{ fontSize: 13, color: "var(--muted)" }}>Concurrent sandboxes</div><div className="num" style={{ fontSize: 24 }}>peak <b>{u.concurrentPeak}</b> - now <b>{u.concurrentNow}</b></div></div><Chart data={u.series} /></div></div>;
};

const KPI = ({ label, v, delta }: { label: string; v: string; delta: string }) => <div className="card" style={{ padding: 18 }}><div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div><div className="num" style={{ fontSize: 22, marginTop: 6 }}>{v}</div><div style={{ marginTop: 4, fontSize: 11.5, color: "var(--muted)" }}>{delta}</div></div>;

const Keys = () => {
  const [keys, setKeys] = useState<any[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const load = () => api.keys().then((r) => setKeys(r.keys));
  useEffect(() => { void load(); }, []);
  const create = async () => { const result = await api.createKey("dashboard"); setToken(result.token); await load(); };
  return <div className="dash-page"><div className="page-head"><div><h1 className="page-h">API keys</h1><div className="page-sub"><span style={{ color: "var(--muted)" }}>Keys grant access to your org sandboxes. Rotate them.</span></div></div><button className="btn btn-primary btn-sm" onClick={create}><Icon name="plus" size={12} /> Create key</button></div>{token ? <div className="card" style={{ padding: 16, marginBottom: 14, borderColor: "var(--accent)" }}><div className="field-l">New key. Shown once.</div><div className="num" style={{ wordBreak: "break-all", marginTop: 6 }}>{token}</div></div> : null}<div className="card">{keys.map((k, i) => <div key={k.id} className="keys-row" style={{ borderTop: i ? "1px solid var(--border)" : "none" }}><div><div style={{ fontWeight: 600 }}>{k.name}</div><div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>created {new Date(k.createdAt).toLocaleDateString()} - last used {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "idle"}</div></div><div className="num">{k.prefix}{"*".repeat(18)}{k.lastFour}</div><button className="btn btn-ghost btn-sm" style={{ color: "var(--err)" }} onClick={() => api.revokeKey(k.id).then(load)}>Revoke</button></div>)}</div></div>;
};

const Settings = () => {
  const [org, setOrg] = useState<any>({ name: "Workspace Labs", slug: "workspace-labs", idleTtlSeconds: 300, maxConcurrency: 200 });
  useEffect(() => { api.settings().then((r) => setOrg(r.organization)).catch(() => undefined); }, []);
  const save = () => api.updateSettings(org).then((r) => setOrg(r.organization));
  return <div className="dash-page"><div className="page-head"><div><h1 className="page-h">Settings</h1><div className="page-sub"><span style={{ color: "var(--muted)" }}>Org-wide controls.</span></div></div><button className="btn btn-primary btn-sm" onClick={save}>Save</button></div><div className="card" style={{ padding: 22, marginBottom: 14 }}><div className="card-h">Organization</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 12 }}><Field label="Name"><input className="input" value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} /></Field><Field label="Slug"><input className="input mono" value={org.slug} onChange={(e) => setOrg({ ...org, slug: e.target.value })} /></Field></div></div><div className="card" style={{ padding: 22 }}><div className="card-h">Defaults</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 12 }}><Field label="Idle TTL"><input className="input mono" type="number" value={org.idleTtlSeconds} onChange={(e) => setOrg({ ...org, idleTtlSeconds: Number(e.target.value) })} /></Field><Field label="Max concurrency"><input className="input mono" type="number" value={org.maxConcurrency} onChange={(e) => setOrg({ ...org, maxConcurrency: Number(e.target.value) })} /></Field></div></div></div>;
};

const Detail = ({ id, go }: { id: string; go: (route: Route) => void }) => {
  const [sandbox, setSandbox] = useState<SandboxSummary | null>(null);
  const [tab, setTab] = useState("terminal");
  useEffect(() => { api.sandbox(id).then((r) => setSandbox(r.sandbox)).catch(() => undefined); }, [id]);
  if (!sandbox) return <div className="dash-page">Loading...</div>;
  return <div className="detail"><aside className="dash-side" style={{ padding: "16px 0" }}><div className="dash-side-brand" style={{ padding: "6px 20px 16px" }}><Brand /></div><div style={{ padding: "0 12px 12px" }}><button className="btn btn-sm" style={{ width: "100%" }} onClick={() => go("dashboard/sandboxes")}><Icon name="chevron" size={11} style={{ transform: "rotate(180deg)" }} /> All sandboxes</button></div></aside><main className="detail-main"><div className="detail-top"><div style={{ display: "flex", alignItems: "baseline", gap: 10, flex: 1 }}><span className="detail-name">{sandbox.name}</span><span className="detail-id">{sandbox.id}</span><span className={`pill ${sandbox.status === "running" ? "live" : ""}`}><span className="dot" /> {sandbox.status}</span><span className="tag">{sandbox.template}</span></div><button className="btn btn-sm" style={{ color: "var(--err)" }} onClick={() => api.killSandbox(sandbox.id).then(() => api.sandbox(id).then((r) => setSandbox(r.sandbox)))}><Icon name="stop" size={11} /> Kill</button></div><div className="detail-tabs">{[["terminal", "Terminal", "terminal"], ["files", "Filesystem", "file"], ["logs", "Logs", "logs"], ["metrics", "Metrics", "chart"], ["network", "Network", "globe"]].map(([k, label, icon]) => <button key={k} className={`detail-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}><Icon name={icon} size={12} /> {label}</button>)}</div><div className="detail-body">{tab === "terminal" ? <TerminalPane sandbox={sandbox} /> : null}{tab === "files" ? <FilesPane id={sandbox.id} /> : null}{tab === "logs" ? <LogsPane id={sandbox.id} /> : null}{tab === "metrics" ? <MetricsPane id={sandbox.id} /> : null}{tab === "network" ? <NetworkPane sandbox={sandbox} /> : null}</div></main></div>;
};

type TerminalLine = { kind: "cmd" | "stdout" | "stderr" | "muted" | "ok"; text: string };

const splitOutput = (text: string, kind: TerminalLine["kind"]) =>
  text.split(/\r?\n/).filter(Boolean).map((line) => ({ kind, text: line }));

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const normalized = value.replace(/(\.\d{3})\d+/, "$1").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString();
};

const TerminalPane = ({ sandbox }: { sandbox: SandboxSummary }) => {
  const [lines, setLines] = useState<TerminalLine[]>([
    { kind: "muted", text: "harakiri v0.41.2 - attaching to " + sandbox.id },
    { kind: "muted", text: "connection sealed - TTL " + sandbox.ttlSeconds + "s" }
  ]);
  const [input, setInput] = useState("");
  const submit = async (e: React.FormEvent) => {
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
  const [cwd, setCwd] = useState("/");
  const [files, setFiles] = useState<any[]>([]);
  useEffect(() => { api.files(id, cwd).then((r) => { setCwd(r.cwd); setFiles(r.files); }).catch(() => setFiles([])); }, [id, cwd]);
  const open = (file: any) => { if (file.type === "directory") setCwd(file.path); };
  const parent = cwd === "/" ? "/" : cwd.split("/").slice(0, -1).join("/") || "/";
  return <div className="files-pane"><div className="files-toolbar"><button className="btn btn-sm" onClick={() => setCwd(parent)} disabled={cwd === "/"}><Icon name="chevron" size={11} style={{ transform: "rotate(180deg)" }} /> Up</button><code>{cwd}</code><button className="btn btn-ghost btn-sm" onClick={() => api.files(id, cwd).then((r) => setFiles(r.files))}><Icon name="refresh" size={12} /> Refresh</button></div><div className="files-table card"><div className="files-row files-head"><span>Name</span><span>Kind</span><span>Size</span><span>Modified</span><span>Path</span></div>{files.map((f) => <button key={f.path} className={`files-row ${f.type === "directory" ? "clickable" : ""}`} onClick={() => open(f)}><span className="files-name"><Icon name={f.type === "directory" ? "folder" : "file"} size={13} />{f.name}</span><span><span className="tag">{f.type}</span></span><span className="num">{formatBytes(f.size)}</span><span className="num muted">{formatDateTime(f.modifiedAt)}</span><span className="files-path">{f.path}</span></button>)}</div>{files.length ? null : <div className="empty-state">No files found at this path.</div>}</div>;
};

const LogsPane = ({ id }: { id: string }) => {
  const [logs, setLogs] = useState<any[]>([]);
  useEffect(() => { api.logs(id).then((r) => setLogs(r.logs)).catch(() => setLogs([])); }, [id]);
  return <div className="logs-pane rich-logs"><div className="logs-row logs-head"><span>Time</span><span>Source</span><span>Level</span><span>Message</span></div>{logs.map((l, i) => <div key={i} className="logs-row"><span className="ts">{new Date(l.ts).toLocaleTimeString()}</span><span className="tag">{l.source ?? "control-plane"}</span><span className={`lvl ${l.lvl}`}>{String(l.lvl).toUpperCase()}</span><span className="log-msg">{l.msg}</span></div>)}</div>;
};

const MetricsPane = ({ id }: { id: string }) => { const [metrics, setMetrics] = useState<any>(null); useEffect(() => { api.metrics(id).then(setMetrics); }, [id]); return <div style={{ padding: 24, overflow: "auto", height: "100%" }}><div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}><KPI label="CPU" v={`${metrics?.current.cpu ?? 0}%`} delta={`${metrics?.current.cpuCount ?? 1} vCPU visible`} /><KPI label="Memory" v={`${metrics?.current.mem ?? 0} MB`} delta={metrics?.current.memTotal ? `of ${metrics.current.memTotal} MB node memory` : "live snapshot"} /><KPI label="Disk I/O" v={`${metrics?.current.diskIo ?? 0} KB/s`} delta="not exposed by execd" /><KPI label="Network out" v={`${metrics?.current.networkOut ?? 0} KB/s`} delta="not exposed by execd" /></div><div className="card" style={{ padding: 22 }}><div className="card-h">CPU snapshot</div><Chart data={(metrics?.series ?? []).map((m: any) => m.cpu)} /></div></div>; };
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

const Onboarding = ({ go, profile }: { go: (route: Route) => void; profile?: UserProfile | null }) => {
  const [step, setStep] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [out, setOut] = useState<string[]>([]);
  const [workspace, setWorkspace] = useState(defaultWorkspace(profile));
  useEffect(() => { api.settings().then((r) => setWorkspace(r.organization)).catch(() => undefined); }, []);
  const saveWorkspace = async () => { const result = await api.updateSettings(workspace); setWorkspace(result.organization); setStep(2); };
  const createKey = async () => { const result = await api.createKey("onboarding"); setToken(result.token); setStep(3); };
  const run = async () => { const created = await api.createSandbox({ template: "python-3.12", ttlSeconds: 300 }); const result = await api.run(created.sandbox.id, { command: "python -c 'print(2+2)'" }); setOut([`POST /v1/sandboxes -> ${created.sandbox.id}`, result.result.stdout.trim(), "sandbox ready in dashboard"]); };
  const openDashboard = async () => { await api.completeOnboarding(); go("dashboard/sandboxes"); };
  return <div className="onb"><div className="onb-bar"><Brand /><div className="right"><a onClick={() => go("landing")}>Exit setup -&gt;</a></div></div><div className="onb-wrap"><div className="onb-steps">{["Account", "Workspace", "API key", "Hello, sandbox"].map((label, i) => <div key={label} className={`onb-step ${i === step ? "active" : i < step ? "done" : ""}`}><div className="onb-num">{i < step ? <Icon name="check" size={11} /> : i + 1}</div><div><div className="onb-step-l">{label}</div><div className="onb-step-s">{i === 0 ? "Keycloak profile." : i === 1 ? "Org defaults." : i === 2 ? "Drop this in .env." : "Run code."}</div></div></div>)}</div><div className="onb-body">{step === 0 ? <div><h1 className="onb-h">Welcome to Harakiri.</h1><p className="onb-sub">Keycloak owns sign-in. Your profile comes from the deployed realm.</p><div className="onb-section" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 560 }}><Field label="Full name"><input className="input" readOnly value={profile?.name ?? "Lyra Ito"} /></Field><Field label="Work email"><input className="input" readOnly value={profile?.email ?? "lyra@k.ai"} /></Field></div><div className="onb-foot"><button className="btn btn-primary" onClick={() => setStep(1)}>Continue <Icon name="arrowR" size={11} /></button></div></div> : null}{step === 1 ? <div><h1 className="onb-h">Your workspace.</h1><p className="onb-sub">Sandboxes live in an org. Defaults are saved to PostgreSQL.</p><div className="onb-section" style={{ maxWidth: 560 }}><Field label="Organization name"><input className="input" value={workspace.name} onChange={(e) => setWorkspace({ ...workspace, name: e.target.value })} /></Field><div style={{ height: 14 }} /><Field label="Slug"><input className="input mono" value={workspace.slug} onChange={(e) => setWorkspace({ ...workspace, slug: e.target.value })} /></Field></div><div className="onb-foot"><button className="btn" onClick={() => setStep(0)}>Back</button><button className="btn btn-primary" onClick={saveWorkspace}>Continue <Icon name="arrowR" size={11} /></button></div></div> : null}{step === 2 ? <div><h1 className="onb-h">Your first API key.</h1><p className="onb-sub">This is shown once and stored hashed in PostgreSQL.</p><div className="onb-foot"><button className="btn" onClick={() => setStep(1)}>Back</button><button className="btn btn-primary" onClick={createKey}>Create key <Icon name="key" size={11} /></button></div></div> : null}{step === 3 ? <div><h1 className="onb-h">Hello, sandbox.</h1>{token ? <div className="card" style={{ padding: 16, maxWidth: 680, marginBottom: 16 }}><div className="field-l">API key</div><div className="num" style={{ wordBreak: "break-all" }}>{token}</div></div> : null}<div className="hterm card" style={{ maxWidth: 780 }}><div className="hterm-bar"><span className="dot r" /><span className="dot y" /><span className="dot g" /><span className="hterm-title">first-sandbox.py</span></div><div className="hterm-body" style={{ minHeight: 220 }}>{out.length ? out.map((line) => <div key={line} className="hterm-line">{line}</div>) : <><div className="hterm-line muted"># Click Run to spawn your first sandbox</div><div className="hterm-line">print(2+2)</div></>}</div></div><div className="onb-foot"><button className="btn btn-accent" onClick={run}><Icon name="play" size={11} /> Run first sandbox</button><button className="btn btn-primary" onClick={openDashboard}>Open dashboard <Icon name="arrowR" size={11} /></button></div></div> : null}</div></div></div>;
};

type DocPage = {
  id: string;
  section: string;
  title: string;
  lede: string;
  toc: string[];
  body: React.ReactNode;
};

const docPages: DocPage[] = [
  {
    id: "quickstart",
    section: "Getting started",
    title: "Quickstart",
    lede: "Spawn a sealed Python sandbox, run code in it, expose a port, and end it from the dashboard or CLI.",
    toc: ["Install", "Create", "Expose"],
    body: (
      <>
        <h2>Install</h2>
        <pre>{`pnpm --filter @harakiri/cli build\nharakiri login --api-url http://127.0.0.1:18082 --api-key hk_live_...`}</pre>
        <h2>Create</h2>
        <pre>{`harakiri create --template python-3.12-data --name first-agent\nharakiri run --stdin agent.py\nharakiri kill sbx_...`}</pre>
        <h2>Expose</h2>
        <pre>{`harakiri run sbx_... --cmd "python -m http.server 3000 --bind 0.0.0.0"\nharakiri expose sbx_... --port 3000\nharakiri routes sbx_...`}</pre>
      </>
    )
  },
  {
    id: "create-sandbox",
    section: "Sandboxes",
    title: "Create a sandbox",
    lede: "Create sandboxes from catalog templates, custom template aliases, or immutable template version IDs.",
    toc: ["CLI", "API", "Routing"],
    body: (
      <>
        <h2>CLI</h2>
        <pre>{`harakiri create --template python-3.12-data --name agent-runner --ttl 300\nharakiri status sbx_...`}</pre>
        <h2>API</h2>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/sandboxes</code></span>
        <pre>{`curl "$PUBLIC_API_URL/v1/sandboxes" \\\n  -H "x-api-key: $HK_KEY" \\\n  -H "content-type: application/json" \\\n  -d '{"template":"python-3.12-data","name":"agent-runner","ttlSeconds":300}'`}</pre>
        <h2>Routing</h2>
        <p>Expose a port only when a process is listening on `0.0.0.0` inside the sandbox.</p>
        <pre>{`harakiri expose sbx_... --port 3000\nharakiri routes sbx_...`}</pre>
      </>
    )
  },
  {
    id: "custom-templates",
    section: "Templates",
    title: "Create a custom template",
    lede: "Define an OpenSandbox-compatible runtime once, build it, then create sandboxes by template name or alias.",
    toc: ["Config", "Build", "Run"],
    body: (
      <>
        <h2>Config</h2>
        <pre>{`harakiri template init --name open-agents-dev --dockerfile Dockerfile`}</pre>
        <pre>{`name = "open-agents-dev"\ndockerfile = "Dockerfile"\nvisibility = "private"\ncpu_count = 2\nmemory_mb = 2048\nworkdir = "/workspace"\nports = [3000, 5173, 4321, 8000]\nstart_command = "sleep 3600"`}</pre>
        <h2>Build</h2>
        <pre>{`harakiri template build --name open-agents-dev .\nharakiri template build --name ubuntu-import --source image --image ubuntu:24.04\nharakiri template builds --query open-agents-dev\nharakiri template logs bld_...`}</pre>
        <p>The CLI uploads Dockerfile contexts as verified tar+gzip archives. The k0s builder runs Kaniko, pushes to the local registry, and records a digest-pinned template version.</p>
        <h2>Run</h2>
        <pre>{`harakiri create --template open-agents-dev --name agent-runner`}</pre>
      </>
    )
  },
  {
    id: "template-builds",
    section: "Templates",
    title: "Template builds",
    lede: "Build records make template image creation inspectable from the API, CLI, and dashboard.",
    toc: ["Statuses", "Logs", "Retry"],
    body: (
      <>
        <h2>Statuses</h2>
        <p>Builds move through `queued`, `building`, `success`, `failed`, or `canceled`. Retry creates a new queued build linked to the original.</p>
        <pre>{`harakiri template build --name open-agents-dev .\nharakiri template build --name ubuntu-import --source image --image ubuntu:24.04\nharakiri template builds --status queued\nharakiri template builds --query ubuntu-import`}</pre>
        <h2>Logs</h2>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/template-builds/:id/logs</code></span>
        <pre>{`harakiri template logs bld_...`}</pre>
        <h2>Retry</h2>
        <p>Use retry after a failed or canceled build. Use promote only for ready template versions.</p>
        <pre>{`curl -X POST "$PUBLIC_API_URL/v1/template-builds/bld_.../retry" -H "x-api-key: $HK_KEY"\nharakiri template promote open-agents-dev --version-id tplv_... --alias stable`}</pre>
      </>
    )
  },
  {
    id: "sdk-usage",
    section: "Templates",
    title: "Using templates from SDKs",
    lede: "The SDK uses the same API surface as the dashboard and CLI, so template aliases work consistently.",
    toc: ["JavaScript", "HTTP", "Python"],
    body: (
      <>
        <h2>JavaScript</h2>
        <pre>{`import { HarakiriClient } from "@harakiri/sdk";\n\nconst client = new HarakiriClient({ apiUrl: process.env.PUBLIC_API_URL!, apiKey: process.env.HK_KEY! });\nconst { sandbox } = await client.createSandbox({ template: "open-agents-dev", ttlSeconds: 300 });\nawait client.run(sandbox.id, { command: "python --version" });`}</pre>
        <h2>HTTP</h2>
        <pre>{`curl "$PUBLIC_API_URL/v1/sandboxes" \\\n  -H "x-api-key: $HK_KEY" \\\n  -H "content-type: application/json" \\\n  -d '{"template":"open-agents-dev","ttlSeconds":300}'`}</pre>
        <h2>Python</h2>
        <p>A Python SDK is not shipped in this prototype yet. Use the HTTP API from Python until the SDK package is added.</p>
      </>
    )
  },
  {
    id: "open-agents-template",
    section: "Templates",
    title: "Open Agents template",
    lede: "The planned pilot template packages browser automation, code editing, JavaScript, and Python tools for agent runtimes.",
    toc: ["Included tools", "Ports", "Smoke test"],
    body: (
      <>
        <h2>Included tools</h2>
        <ul><li>`bun`, `node`, `pnpm`, `npm`, and `yarn`</li><li>`agent-browser` and Chromium headless dependencies</li><li>`code-server`, `git`, `jq`, and Python</li><li>Writable `/workspace` directory</li></ul>
        <h2>Ports</h2>
        <p>Use `3000`, `5173`, `4321`, and `8000` as default exposed-port candidates for web apps, Vite, code-server, and API servers.</p>
        <h2>Smoke test</h2>
        <pre>{`harakiri create --template open-agents-dev --name pilot\nharakiri run sbx_... --cmd "bun --version && jq --version && python --version"\nharakiri run sbx_... --cmd "echo ok >/workspace/write.txt && cat /workspace/write.txt"`}</pre>
      </>
    )
  },
  {
    id: "security-model",
    section: "Reference",
    title: "Security model",
    lede: "Custom templates are untrusted inputs until the builder, registry, digest, and promotion checks succeed.",
    toc: ["Visibility", "Digests", "Secrets"],
    body: (
      <>
        <h2>Visibility</h2>
        <p>`private`, `internal`, and `public` control product visibility. API authorization still enforces organization scope on template definitions, builds, logs, and versions.</p>
        <h2>Digests</h2>
        <p>Mutable tags can be accepted as input, but ready versions should store an immutable image digest before production use.</p>
        <h2>Secrets</h2>
        <p>Registry passwords and build secrets should live in Kubernetes Secrets or an external secret manager. PostgreSQL should store only credential references and redacted metadata.</p>
      </>
    )
  },
  {
    id: "api-reference",
    section: "Reference",
    title: "API reference",
    lede: "The template APIs share authentication with the rest of the Harakiri control plane.",
    toc: ["Templates", "Builds", "Promotion"],
    body: (
      <>
        <h2>Templates</h2>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/templates</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/templates</code></span>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/templates/:id/versions</code></span>
        <h2>Builds</h2>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/templates/:id/builds</code></span>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/template-builds/:id/context</code></span>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/template-builds</code></span>
        <span className="api-endpoint"><span className="api-method get">GET</span><code>/v1/template-builds/:id/logs</code></span>
        <h2>Promotion</h2>
        <span className="api-endpoint"><span className="api-method post">POST</span><code>/v1/templates/:id/promote</code></span>
      </>
    )
  }
];

const Docs = ({ go, profile, onSignIn, onSignOut }: { go: (route: Route) => void; profile?: UserProfile | null; onSignIn: () => void; onSignOut: () => void }) => {
  const [active, setActive] = useState("quickstart");
  const page = docPages.find((item) => item.id === active) ?? docPages[0];
  const sections = Array.from(new Set(docPages.map((item) => item.section)));
  return (
    <div className="app">
      <TopNav go={go} profile={profile} onSignIn={onSignIn} onSignOut={onSignOut} />
      <div className="docs">
        <aside className="docs-side">
          {sections.map((section) => (
            <div key={section}>
              <div className="docs-section-h">{section}</div>
              {docPages.filter((item) => item.section === section).map((item) => (
                <button key={item.id} className={`docs-link ${item.id === page.id ? "active" : ""}`} onClick={() => setActive(item.id)}>{item.title}</button>
              ))}
            </div>
          ))}
        </aside>
        <main className="docs-body">
          <article>
            <h1>{page.title}</h1>
            <p className="lede">{page.lede}</p>
            {page.body}
          </article>
        </main>
        <aside className="docs-toc">
          <div className="docs-toc-h">On this page</div>
          {page.toc.map((item, index) => <a key={item} className={index === 0 ? "active" : ""}>{item}</a>)}
        </aside>
      </div>
    </div>
  );
};

const SignInGate = ({ onSignIn }: { onSignIn: () => void }) => (
  <div className="onb">
    <div className="onb-bar"><Brand /></div>
    <div className="onb-wrap" style={{ gridTemplateColumns: "1fr", maxWidth: 760 }}>
      <div className="onb-body">
        <h1 className="onb-h">Sign in with Keycloak.</h1>
        <p className="onb-sub">Dashboard, sandbox detail, onboarding, API keys, usage, and settings require a Keycloak session.</p>
        <div className="onb-foot"><button className="btn btn-primary" onClick={onSignIn}>Sign in <Icon name="arrowR" size={11} /></button></div>
      </div>
    </div>
  </div>
);

const LoadingGate = () => (
  <div className="onb">
    <div className="onb-bar"><Brand /></div>
    <div className="onb-wrap" style={{ gridTemplateColumns: "1fr", maxWidth: 760 }}>
      <div className="onb-body">
        <h1 className="onb-h">Opening dashboard.</h1>
      </div>
    </div>
  </div>
);

const App = () => {
  const [route, setRoute] = useState<Route>(() => (location.hash.slice(1) as Route) || "landing");
  const [detailId, setDetailId] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(() => auth.profile());
  const [onboardingGate, setOnboardingGate] = useState<"checking" | "allowed">("checking");
  const resolveRoute = async (nextRoute: Route) => {
    if (nextRoute !== "onboarding" || !auth.token()) return nextRoute;
    const me = await api.me().catch(() => null);
    return me?.user?.onboardingCompletedAt ? "dashboard/sandboxes" : nextRoute;
  };
  useEffect(() => { auth.handleCallback().then(async (nextRoute) => { if (nextRoute) { setProfile(auth.profile()); setRoute(await resolveRoute(nextRoute as Route)); } }).catch((error) => console.error(error)); }, []);
  useEffect(() => { location.hash = route; }, [route]);
  useEffect(() => { const onHash = () => setRoute((location.hash.slice(1) as Route) || "landing"); window.addEventListener("hashchange", onHash); return () => window.removeEventListener("hashchange", onHash); }, []);
  useEffect(() => {
    if (route !== "onboarding" || !auth.token()) {
      setOnboardingGate("checking");
      return;
    }
    let cancelled = false;
    setOnboardingGate("checking");
    resolveRoute("onboarding").then((resolvedRoute) => {
      if (cancelled) return;
      if (resolvedRoute === "onboarding") setOnboardingGate("allowed");
      else setRoute(resolvedRoute);
    });
    return () => { cancelled = true; };
  }, [route]);
  const go = (r: Route) => { setRoute(r); window.scrollTo(0, 0); };
  const openSandbox = (id: string) => { setDetailId(id); go("detail"); };
  const signIn = () => void auth.signIn();
  const signOut = () => { auth.signOut(); setProfile(null); };
  if (route !== "landing" && route !== "docs" && !auth.token()) return <SignInGate onSignIn={signIn} />;
  if (route === "onboarding" && auth.token() && onboardingGate !== "allowed") return <LoadingGate />;
  return route === "landing" ? <Landing go={go} profile={profile} onSignIn={signIn} onSignOut={signOut} /> : route === "onboarding" ? <Onboarding go={go} profile={profile} /> : route === "detail" && detailId ? <Detail id={detailId} go={go} /> : route === "docs" ? <Docs go={go} profile={profile} onSignIn={signIn} onSignOut={signOut} /> : <DashboardShell route={route === "detail" ? "dashboard/sandboxes" : route} go={go} openSandbox={openSandbox} profile={profile} onSignOut={signOut} />;
};

createRoot(document.getElementById("root")!).render(<App />);
