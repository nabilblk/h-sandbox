import { useEffect, useState } from "react";
import {
  egressPresetCatalog,
  type EgressMode,
  type EgressPresetId,
  type OrganizationSettings
} from "@harakiri/shared";
import { api } from "../api";
import { ApiResponseError } from "../api-client/request";
import { CapacitySummary, changedSettings, useOrganizationCapacity } from "../capacity";
import { EgressModePicker } from "../components/egress-mode-picker";
import { Icon } from "../components/icon";
import { Field } from "../components/ui";

const defaultSettings: OrganizationSettings = {
  name: "Workspace Labs",
  slug: "workspace-labs",
  idleTtlSeconds: 300,
  maxConcurrency: 200,
  defaultTemplateId: null,
  defaultEgressPolicy: { mode: "open", presets: [], allow: [], deny: [] },
  egressAllowedPresets: ["python-package-install", "node-package-install", "git-hosting", "llm-apis", "browser-basic"],
  egressCustomDomainsEnabled: true,
  egressMaxRules: 128,
  egressRedactDomains: false
};

export const SettingsRoute = ({ canManage = false }: { canManage?: boolean }) => {
  const [org, setOrg] = useState<OrganizationSettings>(defaultSettings);
  const [baseline, setBaseline] = useState<OrganizationSettings>(defaultSettings);
  const capacity = useOrganizationCapacity();
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const load = () => api.settings().then((r) => { setOrg(r.organization); setBaseline(r.organization); setLoaded(true); setError(""); setConflict(false); }).catch((e) => setError(e instanceof Error ? e.message : "Unable to load settings."));
  useEffect(() => { void load(); }, []);
  const patch = changedSettings(org, baseline);
  const dirty = Object.keys(patch).length > 0;
  const save = async () => {
    if (!canManage || !loaded || saving || !dirty || conflict) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const updated = await api.updateSettings(patch);
      setOrg(updated.organization);
      setBaseline(updated.organization);
      void capacity.refresh();
      setNotice("Settings saved.");
    } catch (e) {
      setConflict(e instanceof ApiResponseError && e.code === "organization_capacity_settings_conflict");
      setError(e instanceof Error ? e.message : "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  };
  const setDefaultMode = (mode: EgressMode) => setOrg({ ...org, defaultEgressPolicy: { ...org.defaultEgressPolicy, mode } });
  const toggleAllowedPreset = (preset: EgressPresetId) => {
    const selected = new Set(org.egressAllowedPresets);
    if (selected.has(preset)) selected.delete(preset);
    else selected.add(preset);
    setOrg({ ...org, egressAllowedPresets: [...selected] });
  };
  return (
    <div className="dash-page settings-page">
      <div className="page-head">
        <div>
          <h1 className="page-h">Settings</h1>
          <div className="page-sub"><span style={{ color: "var(--muted)" }}>Workspace controls and sandbox defaults.</span></div>
        </div>
        {canManage ? <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || !loaded || !dirty || conflict || !Number.isInteger(org.maxConcurrency) || org.maxConcurrency < 1 || org.maxConcurrency > 10000}>{saving ? <><span className="spinner" /> Saving</> : "Save"}</button> : null}
      </div>
      {error ? <div role="alert" className="build-inline-alert">{error}</div> : null}
      {conflict ? <button className="btn btn-sm" onClick={() => void load()}><Icon name="refresh" /> Reload settings</button> : null}
      <CapacitySummary state={capacity} canManage={canManage} />
      {!canManage ? <div className="workspace-notice">Read-only. Organization settings are managed by admins.</div> : null}
      {notice ? <div role="status" className="settings-notice">{notice}</div> : null}
      <fieldset className="settings-fields" disabled={!canManage || !loaded || saving} aria-label="Organization settings">
      <div className="settings-grid">
        <section className="card settings-card">
          <div className="card-h">Organization</div>
          <div className="settings-form-grid">
            <Field label="Name"><input className="input" value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} /></Field>
            <Field label="Slug"><input className="input mono" value={org.slug} onChange={(e) => setOrg({ ...org, slug: e.target.value })} /></Field>
          </div>
        </section>
        <section className="card settings-card">
          <div className="card-h">Sandbox defaults</div>
          <div className="settings-form-grid">
            <Field label="Idle TTL"><input className="input mono" type="number" value={org.idleTtlSeconds} onChange={(e) => setOrg({ ...org, idleTtlSeconds: Number(e.target.value) })} /></Field>
            <Field label="Execution slot limit"><input className="input mono" aria-label="Execution slot limit" aria-describedby="concurrency-boundary" type="number" min={1} max={10000} step={1} disabled={!Number.isInteger(org.capacityRevision)} value={org.maxConcurrency} onChange={(e) => setOrg({ ...org, maxConcurrency: Number(e.target.value) })} /></Field>
          </div>
          <p id="concurrency-boundary" className="workspace-notice">{!Number.isInteger(org.capacityRevision) ? "Limit editing requires a server with capacity admission support." : capacity.capacity?.inUse !== null && capacity.capacity?.inUse !== undefined && org.maxConcurrency < capacity.capacity.inUse ? `${capacity.capacity.inUse} slots are currently occupied. Existing work will continue; new execution must wait until usage falls below ${org.maxConcurrency}.` : "Applies to new execution across the organization. Existing work is never stopped when this limit is lowered."}</p>
        </section>
      </div>
      <section className="card settings-card outbound-card">
        <div className="settings-section-head">
          <div>
            <div className="card-h">Outbound access</div>
            <div className="settings-sub">Defaults and guardrails applied to template and sandbox egress controls.</div>
          </div>
          <span className="tag">{org.egressAllowedPresets.length} presets enabled</span>
        </div>
        <div className="settings-egress-layout">
          <div className="settings-egress-main">
            <Field label="Default mode">
              <EgressModePicker value={org.defaultEgressPolicy.mode} onChange={setDefaultMode} />
            </Field>
            <Field label="Available presets">
              <div className="egress-presets compact">
                {Object.entries(egressPresetCatalog).map(([id, preset]) => {
                  const presetId = id as EgressPresetId;
                  const active = org.egressAllowedPresets.includes(presetId);
                  return (
                    <button key={id} type="button" className={`preset-chip ${active ? "active" : ""}`} onClick={() => toggleAllowedPreset(presetId)}>
                      <span>{preset.label}</span>
                      <small>{preset.domains.length ? `${preset.domains.length} domains` : "mode preset"}</small>
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
          <div className="settings-egress-side">
            <label className="settings-toggle">
              <input type="checkbox" checked={org.egressCustomDomainsEnabled} onChange={(event) => setOrg({ ...org, egressCustomDomainsEnabled: event.target.checked })} />
              <span><b>Custom domains</b><small>Allow users to add explicit hostnames in templates and running sandboxes.</small></span>
            </label>
            <label className="settings-toggle">
              <input type="checkbox" checked={org.egressRedactDomains} onChange={(event) => setOrg({ ...org, egressRedactDomains: event.target.checked })} />
              <span><b>Redact domains in events</b><small>Keep future egress event views privacy-preserving for sensitive workspaces.</small></span>
            </label>
            <Field label="Max rules per sandbox">
              <input className="input mono" type="number" min={0} max={10000} value={org.egressMaxRules} onChange={(e) => setOrg({ ...org, egressMaxRules: Number(e.target.value) })} />
            </Field>
            <div className="settings-callout"><Icon name="globe" size={13} /> Restricted templates inherit these limits before a sandbox starts.</div>
          </div>
        </div>
      </section>
      </fieldset>
    </div>
  );
};
