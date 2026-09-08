import { useEffect, useRef, useState } from "react";
import { defaultApiKeyScopes, type ApiKeyScope, type ApiKeySummary, type ApiKeysResponse, type CreateApiKeyResponse } from "@harakiri/shared";
import { api } from "../api";
import { Dialog } from "../components/dialog";
import { Icon } from "../components/icon";

const message = (error: unknown) => error instanceof Error ? error.message : "The request failed. Please retry.";
const date = (value: string | null) => value ? new Date(value).toLocaleDateString() : "No expiry";
export const apiKeyStatus = (key: ApiKeySummary) => key.revokedAt ? "Revoked" : key.expiresAt && Date.parse(key.expiresAt) <= Date.now() ? "Expired" : "Active";

export const ApiKeysRoute = ({ userId }: { userId?: string }) => {
  const nameInput = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<ApiKeysResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreateApiKeyResponse | null>(null);
  const [revoking, setRevoking] = useState<ApiKeySummary | null>(null);
  const [name, setName] = useState("");
  const [days, setDays] = useState(90);
  const [scopes, setScopes] = useState<ApiKeyScope[]>([...defaultApiKeyScopes]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const load = async () => { try { setData(await api.keys()); setError(""); } catch (e) { setError(message(e)); } };
  useEffect(() => { void load(); }, []);
  const allowed = data?.allowedScopes ?? [];
  const close = () => { if (!busy) { setCreating(false); setRevoking(null); setCreated(null); setFormError(""); setCopyStatus(""); } };
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !name.trim() || !scopes.length) return;
    setBusy(true); setFormError("");
    try {
      const result = await api.createKey(name.trim(), { scopes, expiresAt: new Date(Date.now() + days * 86400_000).toISOString() });
      setCreated(result); setCreating(false); setName(""); await load();
    } catch (e) { setFormError(message(e)); }
    finally { setBusy(false); }
  };
  const revoke = async () => {
    if (!revoking || busy) return;
    setBusy(true); setFormError("");
    try { await api.revokeKey(revoking.id); setRevoking(null); await load(); }
    catch (e) { setFormError(message(e)); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(created!.token); setCopyStatus("Copied"); }
    catch { setCopyStatus("Clipboard unavailable. Select the key to copy it."); }
  };
  return <div className="dash-page api-keys-page">
    <div className="page-head"><div><h1 className="page-h">API keys</h1><div className="page-sub">{data?.canManageAll ? "Organization keys" : "Your keys"}</div></div>
      <div className="key-actions"><button type="button" className="btn btn-sm" aria-label="Refresh keys" title="Refresh keys" onClick={() => void load()} disabled={busy}><Icon name="refresh" /></button>
        <button className="btn btn-primary btn-sm" disabled={!allowed.length || busy} onClick={() => { setScopes(defaultApiKeyScopes.filter((s) => allowed.includes(s))); setDays(90); setFormError(""); setCreating(true); }}><Icon name="plus" size={12} /> Create key</button></div></div>
    {error ? <div role="alert" className="build-inline-alert">{error}</div> : null}
    {!data && !error ? <p role="status">Loading keys...</p> : null}
    {data?.keys.length === 0 ? <p className="workspace-notice">No API keys.</p> : null}
    <div className="key-list">{data?.keys.map((key) => <article key={key.id} className="key-entry">
      <div><div className="key-name"><strong>{key.name}</strong><span className={`tag key-status-${apiKeyStatus(key).toLowerCase()}`}>{apiKeyStatus(key)}</span>{key.legacy ? <span className="tag">Legacy</span> : null}</div>
        <div className="key-metadata">Created {date(key.createdAt)} - {key.lastUsedAt ? `Last used ${date(key.lastUsedAt)}` : "Never used"}</div>
        <div className="key-metadata" title={key.createdByUserId ?? "Pre-migration key"}>Owner: {key.legacy ? "Unassigned" : key.createdByUserId === userId ? "You" : key.createdByUserId ?? "Removed member"}</div>
        <details className="key-scopes"><summary>{key.scopes.length} scopes</summary><div>{key.scopes.map((scope) => <code key={scope}>{scope}</code>)}</div></details>
      </div>
      <div className="key-fingerprint"><code>{key.prefix}...{key.lastFour}</code><div className="key-metadata">{key.expiresAt ? `Expires ${date(key.expiresAt)}` : "No expiry"}</div>{key.legacy ? <div className="key-metadata">Runtime-only compatibility key</div> : null}</div>
      <button className="btn btn-ghost btn-sm" disabled={!!key.revokedAt || busy} onClick={() => { setFormError(""); setRevoking(key); }}>Revoke<span className="sr-only"> {key.name}</span></button>
    </article>)}</div>
    {creating ? <Dialog title="Create API key" onClose={close} initialFocus={nameInput}><form className="key-form" onSubmit={create}>
      <fieldset disabled={busy}><label className="field">Name<input ref={nameInput} required maxLength={100} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="CI integration" /></label>
        <label className="field">Expires in<select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 30, 90, 365].map((n) => <option key={n} value={n}>{n} days</option>)}</select></label>
        <fieldset className="key-scope-options"><legend>Permissions</legend>{allowed.map((scope) => <label key={scope}><input type="checkbox" checked={scopes.includes(scope)} onChange={(e) => setScopes((current) => e.target.checked ? [...current, scope] : current.filter((s) => s !== scope))} /><span>{scope}</span></label>)}</fieldset>
      </fieldset>
      {formError ? <p role="alert" className="build-inline-alert">{formError}</p> : null}
      <div className="key-actions"><button className="btn" type="button" disabled={busy} onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy || !name.trim() || !scopes.length}>{busy ? "Creating..." : "Create key"}</button></div>
    </form></Dialog> : null}
    {created ? <Dialog title="API key created" onClose={close}>
      <div className="key-form">
        <p>This key is shown only once. Store it securely.</p>
        <div className="key-secret">
          <code>{created.token}</code>
          <button className="btn btn-ghost btn-sm" onClick={copy} aria-label="Copy API key" title="Copy API key"><Icon name={copyStatus === "Copied" ? "check" : "copy"} /></button>
        </div>
        <p className="key-metadata">{created.key.name} - Expires {date(created.key.expiresAt)}</p>
        <p role="status">{copyStatus}</p>
        <div className="key-actions"><button className="btn btn-primary" onClick={close} disabled={busy}>Done</button></div>
      </div>
    </Dialog> : null}
    {revoking ? <Dialog title="Revoke API key" onClose={close}><div className="key-form"><p>Revoke <strong>{revoking.name}</strong>? Applications using this key will lose access. This cannot be undone.</p>{formError ? <p role="alert" className="build-inline-alert">{formError}</p> : null}<div className="key-actions"><button className="btn" disabled={busy} onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={revoke}>{busy ? "Revoking..." : "Revoke key"}</button></div></div></Dialog> : null}
  </div>;
};
