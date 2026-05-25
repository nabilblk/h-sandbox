import { useEffect, useState } from "react";
import type { OrganizationSettings } from "@harakiri/shared";
import { api } from "../api";
import { Field } from "../components/ui";

const defaultSettings: OrganizationSettings = {
  name: "Workspace Labs",
  slug: "workspace-labs",
  idleTtlSeconds: 300,
  maxConcurrency: 200,
  defaultTemplateId: null
};

export const SettingsRoute = () => {
  const [org, setOrg] = useState<OrganizationSettings>(defaultSettings);
  useEffect(() => { api.settings().then((r) => setOrg(r.organization)).catch(() => undefined); }, []);
  const save = () => api.updateSettings({ ...org }).then((r) => setOrg(r.organization));
  return <div className="dash-page"><div className="page-head"><div><h1 className="page-h">Settings</h1><div className="page-sub"><span style={{ color: "var(--muted)" }}>Org-wide controls.</span></div></div><button className="btn btn-primary btn-sm" onClick={save}>Save</button></div><div className="card" style={{ padding: 22, marginBottom: 14 }}><div className="card-h">Organization</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 12 }}><Field label="Name"><input className="input" value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} /></Field><Field label="Slug"><input className="input mono" value={org.slug} onChange={(e) => setOrg({ ...org, slug: e.target.value })} /></Field></div></div><div className="card" style={{ padding: 22 }}><div className="card-h">Defaults</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 12 }}><Field label="Idle TTL"><input className="input mono" type="number" value={org.idleTtlSeconds} onChange={(e) => setOrg({ ...org, idleTtlSeconds: Number(e.target.value) })} /></Field><Field label="Max concurrency"><input className="input mono" type="number" value={org.maxConcurrency} onChange={(e) => setOrg({ ...org, maxConcurrency: Number(e.target.value) })} /></Field></div></div></div>;
};
