import { useEffect, useState } from "react";
import {
  TEMPLATES,
  egressPresetCatalog,
  type EgressMode,
  type EgressPresetId,
  type SandboxSummary
} from "@harakiri/shared";
import { api } from "../api";
import { EgressModePicker } from "../components/egress-mode-picker";
import { Icon } from "../components/icon";
import { Field } from "../components/ui";

export const SandboxesRoute = ({ openSandbox }: { openSandbox: (id: string) => void }) => {
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
    <div className="dash-page sandbox-workspace">
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
  const [envText, setEnvText] = useState("");
  const [egressMode, setEgressMode] = useState<EgressMode>("open");
  const [egressPresets, setEgressPresets] = useState<EgressPresetId[]>([]);
  const [allowTarget, setAllowTarget] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const parseEnv = () => {
    const env: Record<string, string> = {};
    for (const rawLine of envText.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const index = line.indexOf("=");
      if (index <= 0) throw new Error("Environment rows must use KEY=value.");
      const key = line.slice(0, index);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`${key} is not a valid environment key.`);
      env[key] = line.slice(index + 1);
    }
    return env;
  };
  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      const env = parseEnv();
      const allow = allowTarget.split(",").map((value) => value.trim()).filter(Boolean);
      const result = await api.createSandbox({
        template,
        name,
        ttlSeconds,
        env,
        egress: egressMode === "open" && !egressPresets.length && !allow.length ? undefined : {
          mode: egressMode,
          presets: egressPresets,
          allow
        }
      });
      onCreate(result.sandbox.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };
  const togglePreset = (presetId: EgressPresetId) => {
    setEgressPresets((current) => current.includes(presetId) ? current.filter((id) => id !== presetId) : [...current, presetId]);
    if (egressMode === "open") setEgressMode("restricted");
  };
  return (
    <div className="modal-wrap" onClick={onClose}><div className="modal card" onClick={(e) => e.stopPropagation()}><div className="modal-head"><h3>New sandbox</h3><button className="btn btn-ghost btn-sm" onClick={onClose}><Icon name="x" size={12} /></button></div><div className="modal-body"><Field label="Template"><div className="tmpl-pick">{TEMPLATES.slice(0, 4).map((t) => <button key={t.id} className={`tmpl-pick-c ${template === t.id ? "active" : ""}`} onClick={() => setTemplate(t.id)}><Icon name={t.icon} size={14} /><span>{t.name}</span></button>)}</div></Field><Field label="Name (optional)" hint="A label for your own reference"><input className="input" placeholder="agent-eval-runner" value={name} onChange={(e) => setName(e.target.value)} /></Field><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><Field label="Idle TTL"><input className="input mono" type="number" value={ttlSeconds} onChange={(e) => setTtlSeconds(Number(e.target.value))} /></Field><Field label="Resources"><select className="input"><option>2 vCPU - 2 GiB</option><option>4 vCPU - 4 GiB</option></select></Field></div><Field label="Outbound access"><EgressModePicker value={egressMode} compact onChange={setEgressMode} /><div className="egress-presets compact">{Object.entries(egressPresetCatalog).slice(0, 4).map(([id, preset]) => <button key={id} className={`preset-chip ${egressPresets.includes(id as EgressPresetId) ? "active" : ""}`} onClick={() => togglePreset(id as EgressPresetId)}><span>{preset.label}</span><small>{preset.domains.length} domains</small></button>)}</div><input className="input" placeholder="Extra allowed domains, comma separated" value={allowTarget} onChange={(e) => { setAllowTarget(e.target.value); if (egressMode === "open" && e.target.value.trim()) setEgressMode("restricted"); }} /></Field><Field label="Environment" hint="KEY=value per line"><textarea className="input mono sandbox-env-input" spellCheck={false} placeholder="HARAKIRI_ENV=dev" value={envText} onChange={(e) => setEnvText(e.target.value)} /></Field>{error ? <div className="build-inline-alert"><span>{error}</span></div> : null}<div className="cost-est"><span style={{ color: "var(--muted)" }}>Cold start</span><span className="num">~142ms - idle TTL {ttlSeconds}s</span></div></div><div className="modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={loading}>{loading ? <><span className="spinner" /> Provisioning...</> : <>Create sandbox <Icon name="arrowR" size={11} /></>}</button></div></div></div>
  );
};
