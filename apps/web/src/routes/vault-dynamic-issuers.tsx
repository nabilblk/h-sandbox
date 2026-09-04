import { useCallback, useEffect, useMemo, useState } from "react";
import type { DynamicCredentialIssuerSummary } from "@harakiri/shared";
import { api } from "../api";
import { Icon } from "../components/icon";
import { Field } from "../components/ui";
import { formatDateTime } from "../format";

type IssuerForm = {
  name: string;
  installationId: string;
  repositories: string;
  contentAccess: "read" | "write";
  pullRequests: boolean;
  issues: boolean;
  shareWithMembers: boolean;
};

const emptyIssuerForm: IssuerForm = {
  name: "",
  installationId: "",
  repositories: "",
  contentAccess: "read",
  pullRequests: false,
  issues: false,
  shareWithMembers: false
};

const repositoryNames = (value: string) => [...new Set(value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))];

const permissionsFromForm = (form: IssuerForm) => ({
  metadata: "read" as const,
  contents: form.contentAccess,
  ...(form.pullRequests ? { pull_requests: "write" as const } : {}),
  ...(form.issues ? { issues: "write" as const } : {})
});

const formComplete = (form: IssuerForm) => Boolean(
  form.name.trim() && /^[1-9]\d*$/.test(form.installationId.trim()) && repositoryNames(form.repositories).length
);

const statusClass = (status: DynamicCredentialIssuerSummary["status"]) =>
  status === "active" ? "live" : status === "disabled" ? "warn" : "muted";

const validationClass = (state: DynamicCredentialIssuerSummary["validation"]["state"]) =>
  state === "valid" ? "live" : state === "unvalidated" ? "muted" : "warn";

const permissionLabel = (issuer: DynamicCredentialIssuerSummary) =>
  Object.entries(issuer.scope.permissions).map(([name, level]) => `${name}:${level}`).join(", ");

const updateIssuerStatus = (id: string, action: "disable" | "enable" | "delete") => {
  if (action === "disable") return api.disableDynamicCredentialIssuer(id);
  if (action === "enable") return api.enableDynamicCredentialIssuer(id);
  return api.deleteDynamicCredentialIssuer(id);
};

type IssuerRowProps = {
  issuer: DynamicCredentialIssuerSummary;
  busyId: string;
  onValidate: (issuer: DynamicCredentialIssuerSummary) => void;
  onPolicyChange: (issuer: DynamicCredentialIssuerSummary) => void;
  onStatusChange: (issuer: DynamicCredentialIssuerSummary, action: "disable" | "enable" | "delete") => void;
};

const DynamicIssuerRow = ({ issuer, busyId, onValidate, onPolicyChange, onStatusChange }: IssuerRowProps) => (
  <div className="vault-reference-row">
    <span className="vault-secret">
      <b>{issuer.name}</b>
      <small>{issuer.id} - v{issuer.version}</small>
    </span>
    <span>
      <b>Installation {issuer.scope.installationId}</b>
      <small>{issuer.scope.repositories.join(", ")}</small>
    </span>
    <span>
      <b>{issuer.scope.repositories.length} repositories</b>
      <small>{permissionLabel(issuer)}</small>
    </span>
    <span className="vault-reference-state">
      <span className={`pill ${statusClass(issuer.status)}`}><span className="dot" /> {issuer.status}</span>
      <span className={`pill ${validationClass(issuer.validation.state)}`}>{issuer.validation.state}</span>
    </span>
    <span>
      <b>{issuer.usage.activeSandboxCount} active</b>
      <small>{issuer.usePolicy === "organization_members" ? "all members" : "admins only"}</small>
    </span>
    <span className="num muted">{issuer.lastIssuedAt ? formatDateTime(issuer.lastIssuedAt) : "Never"}</span>
    <span className="vault-row-actions">
      {issuer.status !== "deleted" ? (
        <button className="btn btn-sm" disabled={busyId === `validate:${issuer.id}`} onClick={() => onValidate(issuer)}>
          <Icon name="check" size={12} /> Validate
        </button>
      ) : null}
      {issuer.status !== "deleted" ? (
        <button className="btn btn-sm" disabled={busyId === `access:${issuer.id}`} onClick={() => onPolicyChange(issuer)}>
          {issuer.usePolicy === "organization_members" ? "Restrict" : "Share"}
        </button>
      ) : null}
      {issuer.status === "active" ? <button className="btn btn-sm" disabled={busyId === `disable:${issuer.id}`} onClick={() => onStatusChange(issuer, "disable")}>Disable</button> : null}
      {issuer.status === "disabled" ? <button className="btn btn-sm" disabled={busyId === `enable:${issuer.id}`} onClick={() => onStatusChange(issuer, "enable")}>Enable</button> : null}
      {issuer.status !== "deleted" ? <button className="btn btn-sm danger" disabled={busyId === `delete:${issuer.id}`} onClick={() => onStatusChange(issuer, "delete")}>Delete</button> : null}
    </span>
  </div>
);

type CreateIssuerModalProps = {
  busy: boolean;
  form: IssuerForm;
  onClose: () => void;
  onCreate: () => void;
  onFormChange: (form: IssuerForm) => void;
};

const CreateIssuerModal = ({ busy, form, onClose, onCreate, onFormChange }: CreateIssuerModalProps) => (
  <div className="modal-backdrop" onClick={() => !busy && onClose()}>
    <div className="modal vault-modal card" onClick={(event) => event.stopPropagation()}>
      <div className="modal-head">
        <div>
          <div className="modal-title">New GitHub App issuer</div>
          <div className="members-help">Tokens are minted on demand, scoped to these repositories, and never stored.</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}><Icon name="x" size={13} /></button>
      </div>
      <form className="vault-form" onSubmit={(event) => { event.preventDefault(); onCreate(); }}>
        <Field label="Name"><input autoFocus className="input" placeholder="agent-repositories" value={form.name} onChange={(event) => onFormChange({ ...form, name: event.target.value })} /></Field>
        <Field label="Installation ID" hint="The numeric installation ID for the operator-configured GitHub App.">
          <input className="input mono" inputMode="numeric" placeholder="12345678" value={form.installationId} onChange={(event) => onFormChange({ ...form, installationId: event.target.value })} />
        </Field>
        <Field label="Repositories" hint="Repository names only, separated by commas or new lines.">
          <textarea className="input mono vault-scope-input" placeholder={"agent-runtime\nagent-ui"} value={form.repositories} onChange={(event) => onFormChange({ ...form, repositories: event.target.value })} />
        </Field>
        <Field label="Repository contents">
          <div className="seg-control vault-permission-control" role="radiogroup" aria-label="Repository contents access">
            <button type="button" className={form.contentAccess === "read" ? "active" : ""} onClick={() => onFormChange({ ...form, contentAccess: "read" })}>Read</button>
            <button type="button" className={form.contentAccess === "write" ? "active" : ""} onClick={() => onFormChange({ ...form, contentAccess: "write" })}>Read and write</button>
          </div>
        </Field>
        <div className="vault-form-grid">
          <label className="vault-access-option">
            <input type="checkbox" checked={form.pullRequests} onChange={(event) => onFormChange({ ...form, pullRequests: event.target.checked })} />
            <span><b>Pull requests</b><small>Allow read and write access.</small></span>
          </label>
          <label className="vault-access-option">
            <input type="checkbox" checked={form.issues} onChange={(event) => onFormChange({ ...form, issues: event.target.checked })} />
            <span><b>Issues</b><small>Allow read and write access.</small></span>
          </label>
        </div>
        <label className="vault-access-option">
          <input type="checkbox" checked={form.shareWithMembers} onChange={(event) => onFormChange({ ...form, shareWithMembers: event.target.checked })} />
          <span><b>Allow organization members to use this issuer</b><small>Members can mint scoped tokens through a sandbox, but cannot manage the issuer.</small></span>
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !formComplete(form)}>{busy ? <><span className="spinner" /> Saving...</> : <><Icon name="key" size={12} /> Create issuer</>}</button>
        </div>
      </form>
    </div>
  </div>
);

const useDynamicIssuers = (includeDeleted: boolean) => {
  const [issuers, setIssuers] = useState<DynamicCredentialIssuerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setIssuers((await api.dynamicCredentialIssuers(includeDeleted)).issuers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dynamic credential issuers.");
    } finally {
      setLoading(false);
    }
  }, [includeDeleted]);

  const run = useCallback(async (
    id: string,
    operation: () => Promise<{ issuer: DynamicCredentialIssuerSummary }>,
    message: (issuer: DynamicCredentialIssuerSummary) => string
  ) => {
    setBusyId(id);
    setNotice("");
    setError("");
    try {
      const result = await operation();
      setNotice(message(result.issuer));
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dynamic issuer operation failed.");
      return false;
    } finally {
      setBusyId("");
    }
  }, [load]);

  useEffect(() => { void load(); }, [load]);
  return { issuers, loading, busyId, notice, error, load, run };
};

export const VaultDynamicIssuers = () => {
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<IssuerForm>(emptyIssuerForm);
  const state = useDynamicIssuers(includeDeleted);
  const counts = useMemo(() => ({
    active: state.issuers.filter((issuer) => issuer.status === "active").length,
    attention: state.issuers.filter((issuer) => !["valid", "unvalidated"].includes(issuer.validation.state)).length
  }), [state.issuers]);

  const createIssuer = async () => {
    if (!formComplete(form)) return;
    const succeeded = await state.run("create", () => api.createDynamicCredentialIssuer({
      name: form.name.trim(),
      issuerType: "github_app_installation",
      scope: {
        installationId: form.installationId.trim(),
        repositories: repositoryNames(form.repositories),
        permissions: permissionsFromForm(form)
      },
      usePolicy: form.shareWithMembers ? "organization_members" : "admins_only"
    }), (issuer) => `${issuer.name} is ready to validate against GitHub.`);
    if (!succeeded) return;
    setForm(emptyIssuerForm);
    setCreateOpen(false);
  };

  const validate = (issuer: DynamicCredentialIssuerSummary) => state.run(
    `validate:${issuer.id}`,
    () => api.validateDynamicCredentialIssuer(issuer.id),
    (updated) => `${updated.name} validation is ${updated.validation.state}.`
  );

  const changePolicy = (issuer: DynamicCredentialIssuerSummary) => {
    const usePolicy = issuer.usePolicy === "organization_members" ? "admins_only" : "organization_members";
    return state.run(`access:${issuer.id}`, () => api.updateDynamicCredentialIssuer(issuer.id, { usePolicy }),
      (updated) => `${updated.name} is available to ${usePolicy === "organization_members" ? "all organization members" : "admins only"}.`);
  };

  const changeStatus = (issuer: DynamicCredentialIssuerSummary, action: "disable" | "enable" | "delete") => {
    if (action === "delete" && !confirm(`Delete ${issuer.name}? Metadata and audit history stay visible.`)) return;
    void state.run(`${action}:${issuer.id}`, () => updateIssuerStatus(issuer.id, action),
      (updated) => `${updated.name} is ${updated.status}.`);
  };

  return (
    <section className="vault-source-panel">
      <div className="vault-source-toolbar">
        <div className="vault-stats">
          <span className="stat"><b>{counts.active}</b> <span>active</span></span>
          <span className="stat"><b>{counts.attention}</b> <span>needs attention</span></span>
          <label className="vault-toggle"><input type="checkbox" checked={includeDeleted} onChange={(event) => setIncludeDeleted(event.target.checked)} /><span>Show deleted metadata</span></label>
        </div>
        <div className="vault-actions">
          <button className="btn btn-sm" onClick={() => void state.load()} disabled={state.loading}><Icon name="refresh" size={12} /> Refresh</button>
          <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}><Icon name="plus" size={12} /> New issuer</button>
        </div>
      </div>
      {state.notice ? <div className="member-notice">{state.notice}</div> : null}
      {state.error ? <div className="member-error">{state.error}</div> : null}
      <div className="vault-table card">
        <div className="vault-reference-row vault-head"><span>Issuer</span><span>GitHub installation</span><span>Scope</span><span>State</span><span>Usage</span><span>Last issued</span><span /></div>
        {state.issuers.map((issuer) => <DynamicIssuerRow key={issuer.id} issuer={issuer} busyId={state.busyId} onValidate={(item) => void validate(item)} onPolicyChange={(item) => void changePolicy(item)} onStatusChange={changeStatus} />)}
        {!state.issuers.length ? <div className="sbx-empty"><div className="sbx-empty-title">{state.loading ? "Loading dynamic issuers..." : "No dynamic issuers yet."}</div><div className="sbx-empty-sub">Configure a GitHub App installation to mint short-lived sandbox credentials.</div></div> : null}
      </div>
      <div className="vault-custody-note"><Icon name="lock" size={13} /><span><b>Tokens are transient.</b> Harakiri stores the installation scope and token expiry, never the issued token.</span></div>
      {createOpen ? <CreateIssuerModal busy={state.busyId === "create"} form={form} onClose={() => setCreateOpen(false)} onCreate={() => void createIssuer()} onFormChange={setForm} /> : null}
    </section>
  );
};
