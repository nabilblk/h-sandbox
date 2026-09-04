import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CredentialProviderPreset,
  CredentialProviderProfileId,
  ExternalSecretReferenceSummary
} from "@harakiri/shared";
import { api } from "../api";
import { Icon } from "../components/icon";
import { Field } from "../components/ui";
import { formatDateTime } from "../format";
import {
  CredentialProfileFields,
  credentialProfileComplete,
  customCredentialProfileInput,
  emptyCustomCredentialProfile,
  type CustomCredentialProfileDraft
} from "./credential-profile-fields";

type ReferenceForm = {
  name: string;
  providerPresetId: CredentialProviderProfileId | "";
  customProfile: CustomCredentialProfileDraft;
  namespace: string;
  secretName: string;
  key: string;
  shareWithMembers: boolean;
};

const emptyReferenceForm = (presetId: CredentialProviderProfileId | "" = ""): ReferenceForm => ({
  name: "",
  providerPresetId: presetId,
  customProfile: emptyCustomCredentialProfile(),
  namespace: "",
  secretName: "",
  key: "",
  shareWithMembers: false
});

const statusClass = (status: ExternalSecretReferenceSummary["status"]) =>
  status === "active" ? "live" : status === "disabled" ? "warn" : "muted";

const validationClass = (state: ExternalSecretReferenceSummary["validation"]["state"]) =>
  state === "valid" ? "live" : state === "unvalidated" ? "muted" : "warn";

const referenceLocation = (reference: ExternalSecretReferenceSummary) =>
  `${reference.reference.namespace}/${reference.reference.name}`;

const updateReferenceStatus = (id: string, action: "disable" | "enable" | "delete") => {
  if (action === "disable") return api.disableExternalSecretReference(id);
  if (action === "enable") return api.enableExternalSecretReference(id);
  return api.deleteExternalSecretReference(id);
};

type ReferenceRowProps = {
  reference: ExternalSecretReferenceSummary;
  busyId: string;
  onValidate: (reference: ExternalSecretReferenceSummary) => void;
  onPolicyChange: (reference: ExternalSecretReferenceSummary) => void;
  onStatusChange: (reference: ExternalSecretReferenceSummary, action: "disable" | "enable" | "delete") => void;
};

const ExternalReferenceRow = ({ reference, busyId, onValidate, onPolicyChange, onStatusChange }: ReferenceRowProps) => (
  <div className="vault-reference-row">
    <span className="vault-secret">
      <b>{reference.name}</b>
      <small>{reference.id} - v{reference.version}</small>
    </span>
    <span>
      <b>{referenceLocation(reference)}</b>
      <small>key: {reference.reference.key}</small>
    </span>
    <span>
      <b>{reference.customProfile?.host ?? reference.providerPresetId}</b>
      <small>{reference.usePolicy === "organization_members" ? "all members" : "admins only"}</small>
    </span>
    <span className="vault-reference-state">
      <span className={`pill ${statusClass(reference.status)}`}><span className="dot" /> {reference.status}</span>
      <span className={`pill ${validationClass(reference.validation.state)}`}>{reference.validation.state}</span>
    </span>
    <span>
      <b>{reference.usage.activeSandboxCount} active</b>
      <small>{reference.usage.attachmentCount} total attachments</small>
    </span>
    <span className="num muted">{formatDateTime(reference.updatedAt)}</span>
    <span className="vault-row-actions">
      {reference.status !== "deleted" ? (
        <button className="btn btn-sm" disabled={busyId === `validate:${reference.id}`} onClick={() => onValidate(reference)}>
          <Icon name="check" size={12} /> Validate
        </button>
      ) : null}
      {reference.status !== "deleted" ? (
        <button className="btn btn-sm" disabled={busyId === `access:${reference.id}`} onClick={() => onPolicyChange(reference)}>
          {reference.usePolicy === "organization_members" ? "Restrict" : "Share"}
        </button>
      ) : null}
      {reference.status === "active" ? <button className="btn btn-sm" disabled={busyId === `disable:${reference.id}`} onClick={() => onStatusChange(reference, "disable")}>Disable</button> : null}
      {reference.status === "disabled" ? <button className="btn btn-sm" disabled={busyId === `enable:${reference.id}`} onClick={() => onStatusChange(reference, "enable")}>Enable</button> : null}
      {reference.status !== "deleted" ? <button className="btn btn-sm danger" disabled={busyId === `delete:${reference.id}`} onClick={() => onStatusChange(reference, "delete")}>Delete</button> : null}
    </span>
  </div>
);

type CreateReferenceModalProps = {
  busy: boolean;
  form: ReferenceForm;
  presets: CredentialProviderPreset[];
  onClose: () => void;
  onCreate: () => void;
  onFormChange: (form: ReferenceForm) => void;
};

const referenceFormComplete = (form: ReferenceForm) =>
  Boolean(
    form.name.trim()
    && credentialProfileComplete(form.providerPresetId, form.customProfile)
    && form.secretName.trim()
    && form.key.trim()
  );

const CreateReferenceModal = ({ busy, form, presets, onClose, onCreate, onFormChange }: CreateReferenceModalProps) => (
  <div className="modal-backdrop" onClick={() => !busy && onClose()}>
    <div className="modal vault-modal card" onClick={(event) => event.stopPropagation()}>
      <div className="modal-head">
        <div>
          <div className="modal-title">New external reference</div>
          <div className="members-help">Harakiri stores this locator, not the Kubernetes Secret value.</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}><Icon name="x" size={13} /></button>
      </div>
      <form className="vault-form" onSubmit={(event) => { event.preventDefault(); onCreate(); }}>
        <Field label="Name"><input autoFocus className="input" placeholder="openai-cluster" value={form.name} onChange={(event) => onFormChange({ ...form, name: event.target.value })} /></Field>
        <CredentialProfileFields
          profileId={form.providerPresetId}
          custom={form.customProfile}
          presets={presets}
          onProfileChange={(providerPresetId) => onFormChange({ ...form, providerPresetId })}
          onCustomChange={(customProfile) => onFormChange({ ...form, customProfile })}
        />
        <div className="vault-form-grid">
          <Field label="Namespace" hint="Leave empty to use the operator default."><input className="input mono" placeholder="harakiri" value={form.namespace} onChange={(event) => onFormChange({ ...form, namespace: event.target.value })} /></Field>
          <Field label="Secret name"><input className="input mono" placeholder="agent-credentials" value={form.secretName} onChange={(event) => onFormChange({ ...form, secretName: event.target.value })} /></Field>
        </div>
        <Field label="Secret key"><input className="input mono" placeholder="OPENAI_API_KEY" value={form.key} onChange={(event) => onFormChange({ ...form, key: event.target.value })} /></Field>
        <label className="vault-access-option">
          <input type="checkbox" checked={form.shareWithMembers} onChange={(event) => onFormChange({ ...form, shareWithMembers: event.target.checked })} />
          <span><b>Allow organization members to use this reference</b><small>Members can attach it, but cannot change its locator or access policy.</small></span>
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !referenceFormComplete(form)}>{busy ? <><span className="spinner" /> Saving...</> : <><Icon name="key" size={12} /> Create reference</>}</button>
        </div>
      </form>
    </div>
  </div>
);

const useExternalReferences = (includeDeleted: boolean) => {
  const [references, setReferences] = useState<ExternalSecretReferenceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setReferences((await api.externalSecretReferences(includeDeleted)).references);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load external references.");
    } finally {
      setLoading(false);
    }
  }, [includeDeleted]);

  const run = useCallback(async (id: string, operation: () => Promise<{ reference: ExternalSecretReferenceSummary }>, message: (reference: ExternalSecretReferenceSummary) => string) => {
    setBusyId(id);
    setNotice("");
    setError("");
    try {
      const result = await operation();
      setNotice(message(result.reference));
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "External reference operation failed.");
      return false;
    } finally {
      setBusyId("");
    }
  }, [load]);

  useEffect(() => { void load(); }, [load]);
  return { references, loading, busyId, notice, error, load, run };
};

export const VaultExternalReferences = ({ presets }: { presets: CredentialProviderPreset[] }) => {
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<ReferenceForm>(() => emptyReferenceForm(presets[0]?.id ?? ""));
  const state = useExternalReferences(includeDeleted);
  const counts = useMemo(() => ({
    active: state.references.filter((reference) => reference.status === "active").length,
    invalid: state.references.filter((reference) => !["valid", "unvalidated"].includes(reference.validation.state)).length
  }), [state.references]);

  useEffect(() => {
    if (form.providerPresetId || !presets[0]) return;
    setForm((current) => ({ ...current, providerPresetId: presets[0].id }));
  }, [form.providerPresetId, presets]);

  const createReference = async () => {
    if (!referenceFormComplete(form) || !form.providerPresetId) return;
    const providerPresetId = form.providerPresetId;
    const succeeded = await state.run("create", () => api.createExternalSecretReference({
      name: form.name.trim(),
      providerPresetId,
      customProfile: providerPresetId === "custom" ? customCredentialProfileInput(form.customProfile) : undefined,
      resolverType: "kubernetes_secret",
      reference: { namespace: form.namespace.trim() || undefined, name: form.secretName.trim(), key: form.key.trim() },
      usePolicy: form.shareWithMembers ? "organization_members" : "admins_only"
    }), (reference) => `${reference.name} now points to a Kubernetes Secret. Validate it before use.`);
    if (!succeeded) return;
    setForm(emptyReferenceForm(presets[0]?.id ?? ""));
    setCreateOpen(false);
  };

  const validate = (reference: ExternalSecretReferenceSummary) => state.run(
    `validate:${reference.id}`,
    () => api.validateExternalSecretReference(reference.id),
    (updated) => `${updated.name} validation is ${updated.validation.state}.`
  );

  const changePolicy = (reference: ExternalSecretReferenceSummary) => {
    const usePolicy = reference.usePolicy === "organization_members" ? "admins_only" : "organization_members";
    return state.run(`access:${reference.id}`, () => api.updateExternalSecretReference(reference.id, { usePolicy }),
      (updated) => `${updated.name} is available to ${usePolicy === "organization_members" ? "all organization members" : "admins only"}.`);
  };

  const changeStatus = (reference: ExternalSecretReferenceSummary, action: "disable" | "enable" | "delete") => {
    if (action === "delete" && !confirm(`Delete ${reference.name}? Metadata and audit history stay visible.`)) return;
    void state.run(`${action}:${reference.id}`, () => updateReferenceStatus(reference.id, action),
      (updated) => `${updated.name} is ${updated.status}.`);
  };

  return (
    <section className="vault-source-panel">
      <div className="vault-source-toolbar">
        <div className="vault-stats">
          <span className="stat"><b>{counts.active}</b> <span>active</span></span>
          <span className="stat"><b>{counts.invalid}</b> <span>needs attention</span></span>
          <label className="vault-toggle"><input type="checkbox" checked={includeDeleted} onChange={(event) => setIncludeDeleted(event.target.checked)} /><span>Show deleted metadata</span></label>
        </div>
        <div className="vault-actions">
          <button className="btn btn-sm" onClick={() => void state.load()} disabled={state.loading}><Icon name="refresh" size={12} /> Refresh</button>
          <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}><Icon name="plus" size={12} /> New reference</button>
        </div>
      </div>
      {state.notice ? <div className="member-notice">{state.notice}</div> : null}
      {state.error ? <div className="member-error">{state.error}</div> : null}
      <div className="vault-table card">
        <div className="vault-reference-row vault-head"><span>Reference</span><span>Kubernetes Secret</span><span>Provider</span><span>State</span><span>Usage</span><span>Updated</span><span /></div>
        {state.references.map((reference) => <ExternalReferenceRow key={reference.id} reference={reference} busyId={state.busyId} onValidate={(item) => void validate(item)} onPolicyChange={(item) => void changePolicy(item)} onStatusChange={changeStatus} />)}
        {!state.references.length ? <div className="sbx-empty"><div className="sbx-empty-title">{state.loading ? "Loading external references..." : "No external references yet."}</div><div className="sbx-empty-sub">Point Harakiri at an operator-approved Kubernetes Secret.</div></div> : null}
      </div>
      <div className="vault-custody-note"><Icon name="lock" size={13} /><span><b>Kubernetes owns the value.</b> Harakiri resolves it only when validating, attaching, or rehydrating a credential.</span></div>
      {createOpen ? <CreateReferenceModal busy={state.busyId === "create"} form={form} presets={presets} onClose={() => setCreateOpen(false)} onCreate={() => void createReference()} onFormChange={setForm} /> : null}
    </section>
  );
};
