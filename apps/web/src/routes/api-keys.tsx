import { useEffect, useState } from "react";
import type { ApiKeySummary } from "@harakiri/shared";
import { api } from "../api";
import { Icon } from "../components/icon";

export const ApiKeysRoute = () => {
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const load = () => api.keys().then((r) => setKeys(r.keys));
  useEffect(() => { void load(); }, []);
  const create = async () => { const result = await api.createKey("dashboard"); setToken(result.token); await load(); };
  return <div className="dash-page"><div className="page-head"><div><h1 className="page-h">API keys</h1><div className="page-sub"><span style={{ color: "var(--muted)" }}>Keys grant access to your org sandboxes. Rotate them.</span></div></div><button className="btn btn-primary btn-sm" onClick={create}><Icon name="plus" size={12} /> Create key</button></div>{token ? <div className="card" style={{ padding: 16, marginBottom: 14, borderColor: "var(--accent)" }}><div className="field-l">New key. Shown once.</div><div className="num" style={{ wordBreak: "break-all", marginTop: 6 }}>{token}</div></div> : null}<div className="card">{keys.map((k, i) => <div key={k.id} className="keys-row" style={{ borderTop: i ? "1px solid var(--border)" : "none" }}><div><div style={{ fontWeight: 600 }}>{k.name}</div><div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>created {new Date(k.createdAt).toLocaleDateString()} - last used {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "idle"}</div></div><div className="num">{k.prefix}{"*".repeat(18)}{k.lastFour}</div><button className="btn btn-ghost btn-sm" style={{ color: "var(--err)" }} onClick={() => api.revokeKey(k.id).then(load)}>Revoke</button></div>)}</div></div>;
};
