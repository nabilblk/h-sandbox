import { useEffect, useMemo, useState } from "react";
import type {
  CredentialProviderPreset,
  CredentialProviderProfileId,
  CredentialSecretSummary
} from "@harakiri/shared";
import { api } from "../api";
import { Icon } from "../components/icon";
import { Field } from "../components/ui";
import { formatDateTime } from "../format";
import { VaultExternalReferences } from "./vault-external-references";
import { VaultDynamicIssuers } from "./vault-dynamic-issuers";
import { VaultAudit } from "./vault-audit";
import {
  CredentialProfileFields,
  credentialProfileComplete,
  customCredentialProfileInput,
  emptyCustomCredentialProfile,
  type CustomCredentialProfileDraft
} from "./credential-profile-fields";

type SecretForm = {
  name: string;
  providerPresetId: CredentialProviderProfileId | "";
  customProfile: CustomCredentialProfileDraft;
  value: string;
  shareWithMembers: boolean;
};

const emptyForm: SecretForm = {
  name: "",
  providerPresetId: "",
  customProfile: emptyCustomCredentialProfile(),
  value: "",
  shareWithMembers: false
};

const statusClass = (status: CredentialSecretSummary["status"]) =>
  status === "active" ? "live" : status === "disabled" ? "warn" : "muted";

const categoryLabel = (category: CredentialProviderPreset["category"]) =>
  category.replace("-", " ");

const presetLabel = (secret: CredentialSecretSummary, presets: CredentialProviderPreset[]) =>
  secret.customProfile?.host
    ?? presets.find((preset) => preset.id === secret.providerPresetId)?.label
    ?? secret.providerPresetId;

const secretUpdatedAt = (secret: CredentialSecretSummary) =>
  secret.rotatedAt ?? secret.disabledAt ?? secret.deletedAt ?? secret.updatedAt;

const emptyNotice = "No workspace secrets yet.";

type VaultSecretRowProps = {
  secret: CredentialSecretSummary;
  presets: CredentialProviderPreset[];
  busyId: string;
  onRotate: (secret: CredentialSecretSummary) => void;
  onUsePolicyChange: (secret: CredentialSecretSummary) => void;
  onStatusChange: (secret: CredentialSecretSummary, action: "disable" | "enable" | "delete") => void;
};

const VaultSecretRow = ({ secret, presets, busyId, onRotate, onUsePolicyChange, onStatusChange }: VaultSecretRowProps) => (
  <div className="vault-row">
    <span className="vault-secret">
      <b>{secret.name}</b>
      <small>{secret.id} - v{secret.version} - {secret.usePolicy === "organization_members" ? "all members" : "admins only"}</small>
    </span>
    <span>
      <b>{presetLabel(secret, presets)}</b>
      <small>{secret.usage.activeSandboxCount} active - {secret.usage.attachmentCount} total uses</small>
    </span>
    <span><span className={`pill ${statusClass(secret.status)}`}><span className="dot" /> {secret.status}</span></span>
    <span className="num muted">{Object.keys(secret.fakeEnv).join(", ") || "-"}</span>
    <span className="vault-domains">
      {secret.egressDomains.slice(0, 3).map((domain) => <span className="tag" key={domain}>{domain}</span>)}
      {secret.egressDomains.length > 3 ? <span className="tag">+{secret.egressDomains.length - 3}</span> : null}
    </span>
    <span className="num muted">{formatDateTime(secretUpdatedAt(secret))}</span>
    <span className="vault-row-actions">
      {secret.status !== "deleted" ? <button className="btn btn-sm" onClick={() => onRotate(secret)}>Rotate</button> : null}
      {secret.status !== "deleted" ? (
        <button className="btn btn-sm" disabled={busyId === `access:${secret.id}`} onClick={() => onUsePolicyChange(secret)}>
          {secret.usePolicy === "organization_members" ? "Restrict" : "Share"}
        </button>
      ) : null}
      {secret.status === "active" ? <button className="btn btn-sm" disabled={busyId === `disable:${secret.id}`} onClick={() => onStatusChange(secret, "disable")}>Disable</button> : null}
      {secret.status === "disabled" ? <button className="btn btn-sm" disabled={busyId === `enable:${secret.id}`} onClick={() => onStatusChange(secret, "enable")}>Enable</button> : null}
      {secret.status !== "deleted" ? <button className="btn btn-sm danger" disabled={busyId === `delete:${secret.id}`} onClick={() => onStatusChange(secret, "delete")}>Delete</button> : null}
    </span>
  </div>
);

const ProviderPresetCard = ({ preset }: { preset: CredentialProviderPreset }) => (
  <div className="vault-preset card">
    <div>
      <b>{preset.label}</b>
      <small>{categoryLabel(preset.category)} - {preset.defaultEnvName}</small>
    </div>
    <span className="tag">{preset.egressDomains.length} domains</span>
  </div>
);

type CreateSecretModalProps = {
  busy: boolean;
  form: SecretForm;
  presets: CredentialProviderPreset[];
  onClose: () => void;
  onCreate: () => void;
  onFormChange: (form: SecretForm) => void;
};

const CreateSecretModal = ({ busy, form, presets, onClose, onCreate, onFormChange }: CreateSecretModalProps) => (
  <div className="modal-backdrop" onClick={() => !busy && onClose()}>
    <div className="modal vault-modal card" onClick={(event) => event.stopPropagation()}>
      <div className="modal-head">
        <div>
          <div className="modal-title">New workspace secret</div>
          <div className="members-help">The value is encrypted, write-only, and never shown again.</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}><Icon name="x" size={13} /></button>
      </div>
      <form
        className="vault-form"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate();
        }}
      >
        <Field label="Name"><input autoFocus className="input" placeholder="openai-prod" value={form.name} onChange={(event) => onFormChange({ ...form, name: event.target.value })} /></Field>
        <CredentialProfileFields
          profileId={form.providerPresetId}
          custom={form.customProfile}
          presets={presets}
          onProfileChange={(providerPresetId) => onFormChange({ ...form, providerPresetId })}
          onCustomChange={(customProfile) => onFormChange({ ...form, customProfile })}
        />
        <Field label="Secret value" hint="Paste only into this field. The value is sent once and never returned.">
          <input className="input mono" type="password" value={form.value} onChange={(event) => onFormChange({ ...form, value: event.target.value })} />
        </Field>
        <label className="vault-access-option">
          <input
            type="checkbox"
            checked={form.shareWithMembers}
            onChange={(event) => onFormChange({ ...form, shareWithMembers: event.target.checked })}
          />
          <span><b>Allow organization members to use this secret</b><small>Members can attach it to sandboxes, but cannot read, rotate, or manage the value.</small></span>
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !form.name.trim() || !credentialProfileComplete(form.providerPresetId, form.customProfile) || !form.value}>{busy ? <><span className="spinner" /> Saving...</> : <><Icon name="lock" size={12} /> Store secret</>}</button>
        </div>
      </form>
    </div>
  </div>
);

type RotateSecretModalProps = {
  busy: boolean;
  secret: CredentialSecretSummary;
  value: string;
  onClose: () => void;
  onRotate: () => void;
  onValueChange: (value: string) => void;
};

const RotateSecretModal = ({ busy, secret, value, onClose, onRotate, onValueChange }: RotateSecretModalProps) => (
  <div className="modal-backdrop" onClick={() => !busy && onClose()}>
    <div className="modal vault-modal card" onClick={(event) => event.stopPropagation()}>
      <div className="modal-head">
        <div>
          <div className="modal-title">Rotate {secret.name}</div>
          <div className="members-help">Rotation replaces the encrypted value and increments the version.</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}><Icon name="x" size={13} /></button>
      </div>
      <form
        className="vault-form"
        onSubmit={(event) => {
          event.preventDefault();
          onRotate();
        }}
      >
        <Field label="New secret value">
          <input autoFocus className="input mono" type="password" value={value} onChange={(event) => onValueChange(event.target.value)} />
        </Field>
        <div className="modal-actions">
          <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !value}>{busy ? <><span className="spinner" /> Rotating...</> : "Rotate"}</button>
        </div>
      </form>
    </div>
  </div>
);

export const VaultRoute = () => {
  const [view, setView] = useState<"stored" | "external" | "dynamic" | "audit">("stored");
  const [secrets, setSecrets] = useState<CredentialSecretSummary[]>([]);
  const [presets, setPresets] = useState<CredentialProviderPreset[]>([]);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [rotateTarget, setRotateTarget] = useState<CredentialSecretSummary | null>(null);
  const [form, setForm] = useState<SecretForm>(emptyForm);
  const [rotateValue, setRotateValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const counts = useMemo(() => ({
    active: secrets.filter((secret) => secret.status === "active").length,
    disabled: secrets.filter((secret) => secret.status === "disabled").length,
    deleted: secrets.filter((secret) => secret.status === "deleted").length
  }), [secrets]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [presetResult, secretResult] = await Promise.all([
        api.credentialPresets(),
        api.credentialSecrets(includeDeleted)
      ]);
      setPresets(presetResult.presets);
      setSecrets(secretResult.secrets);
      setForm((current) => current.providerPresetId ? current : {
        ...current,
        providerPresetId: presetResult.presets[0]?.id ?? ""
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Vault.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [includeDeleted]);

  const createSecret = async () => {
    if (!form.name.trim() || !form.providerPresetId || !credentialProfileComplete(form.providerPresetId, form.customProfile) || !form.value) return;
    setBusyId("create");
    setNotice("");
    setError("");
    try {
      const result = await api.createCredentialSecret({
        name: form.name.trim(),
        providerPresetId: form.providerPresetId,
        customProfile: form.providerPresetId === "custom" ? customCredentialProfileInput(form.customProfile) : undefined,
        value: form.value,
        usePolicy: form.shareWithMembers ? "organization_members" : "admins_only"
      });
      setNotice(`${result.secret.name} was stored as a write-only workspace secret.`);
      setForm({ ...emptyForm, providerPresetId: presets[0]?.id ?? "" });
      setCreateOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace secret.");
    } finally {
      setBusyId("");
    }
  };

  const rotateSecret = async () => {
    if (!rotateTarget || !rotateValue) return;
    setBusyId(`rotate:${rotateTarget.id}`);
    setNotice("");
    setError("");
    try {
      const result = await api.rotateCredentialSecret(rotateTarget.id, { value: rotateValue });
      setNotice(`${result.secret.name} rotated to version ${result.secret.version}.`);
      setRotateTarget(null);
      setRotateValue("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rotate workspace secret.");
    } finally {
      setBusyId("");
    }
  };

  const updateSecretStatus = async (secret: CredentialSecretSummary, action: "disable" | "enable" | "delete") => {
    if (action === "delete" && !confirm(`Delete encrypted value for ${secret.name}? Metadata and audit history stay visible.`)) return;
    setBusyId(`${action}:${secret.id}`);
    setNotice("");
    setError("");
    try {
      const result =
        action === "disable" ? await api.disableCredentialSecret(secret.id)
          : action === "enable" ? await api.enableCredentialSecret(secret.id)
            : await api.deleteCredentialSecret(secret.id);
      setNotice(`${result.secret.name} is ${result.secret.status}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} workspace secret.`);
    } finally {
      setBusyId("");
    }
  };

  const updateUsePolicy = async (secret: CredentialSecretSummary) => {
    const usePolicy = secret.usePolicy === "organization_members" ? "admins_only" : "organization_members";
    setBusyId(`access:${secret.id}`);
    setNotice("");
    setError("");
    try {
      const result = await api.updateCredentialSecret(secret.id, { usePolicy });
      setNotice(`${result.secret.name} is now available to ${usePolicy === "organization_members" ? "all organization members" : "admins only"}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update secret access.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="dash-page vault-page">
      <div className="page-head vault-page-head">
        <div>
          <h1 className="page-h">Vault</h1>
          <div className="page-sub"><span style={{ color: "var(--muted)" }}>Reusable credential sources for sandbox bindings.</span></div>
        </div>
        {view === "stored" ? (
          <div className="vault-actions">
            <button className="btn btn-sm" onClick={() => void load()} disabled={loading}><Icon name="refresh" size={12} /> Refresh</button>
            <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}><Icon name="plus" size={12} /> New secret</button>
          </div>
        ) : null}
      </div>

      <div className="vault-source-tabs" role="tablist" aria-label="Credential source type">
        <button className={view === "stored" ? "active" : ""} role="tab" aria-selected={view === "stored"} onClick={() => setView("stored")}><Icon name="lock" size={13} /> Stored secrets</button>
        <button className={view === "external" ? "active" : ""} role="tab" aria-selected={view === "external"} onClick={() => setView("external")}><Icon name="key" size={13} /> External references</button>
        <button className={view === "dynamic" ? "active" : ""} role="tab" aria-selected={view === "dynamic"} onClick={() => setView("dynamic")}><Icon name="refresh" size={13} /> Dynamic issuers</button>
        <button className={view === "audit" ? "active" : ""} role="tab" aria-selected={view === "audit"} onClick={() => setView("audit")}><Icon name="logs" size={13} /> Audit history</button>
      </div>

      {view === "stored" ? (
        <>
          <div className="vault-stats">
            <span className="stat"><b>{counts.active}</b> <span>active</span></span>
            <span className="stat"><b>{counts.disabled}</b> <span>disabled</span></span>
            <span className="stat"><b>{counts.deleted}</b> <span>deleted</span></span>
            <label className="vault-toggle">
              <input type="checkbox" checked={includeDeleted} onChange={(event) => setIncludeDeleted(event.target.checked)} />
              <span>Show deleted metadata</span>
            </label>
          </div>

          {notice ? <div className="member-notice">{notice}</div> : null}
          {error ? <div className="member-error">{error}</div> : null}

          <div className="vault-table card">
            <div className="vault-row vault-head"><span>Secret</span><span>Provider</span><span>Status</span><span>Fake env</span><span>Destinations</span><span>Updated</span><span /></div>
            {secrets.map((secret) => (
              <VaultSecretRow
                busyId={busyId}
                key={secret.id}
                onRotate={setRotateTarget}
                onUsePolicyChange={(rowSecret) => void updateUsePolicy(rowSecret)}
                onStatusChange={(rowSecret, action) => void updateSecretStatus(rowSecret, action)}
                presets={presets}
                secret={secret}
              />
            ))}
            {!secrets.length ? <div className="sbx-empty"><div className="sbx-empty-title">{loading ? "Loading Vault..." : emptyNotice}</div><div className="sbx-empty-sub">Create a write-only secret from a provider preset.</div></div> : null}
          </div>
        </>
      ) : view === "external" ? <VaultExternalReferences presets={presets} /> : view === "dynamic" ? <VaultDynamicIssuers /> : <VaultAudit />}

      {view !== "audit" ? <section className="vault-presets">
        <div className="card-h">Provider presets</div>
        <div className="vault-preset-grid">
          {presets.map((preset) => <ProviderPresetCard key={preset.id} preset={preset} />)}
        </div>
      </section> : null}

      {createOpen ? (
        <CreateSecretModal
          busy={busyId === "create"}
          form={form}
          onClose={() => setCreateOpen(false)}
          onCreate={() => void createSecret()}
          onFormChange={setForm}
          presets={presets}
        />
      ) : null}

      {rotateTarget ? (
        <RotateSecretModal
          busy={busyId === `rotate:${rotateTarget.id}`}
          onClose={() => setRotateTarget(null)}
          onRotate={() => void rotateSecret()}
          onValueChange={setRotateValue}
          secret={rotateTarget}
          value={rotateValue}
        />
      ) : null}
    </div>
  );
};
