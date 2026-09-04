import { useCallback, useEffect, useState } from "react";
import type {
  SandboxCredentialAttachmentSummary,
  SandboxSummary,
  TestSandboxCredentialResponse
} from "@harakiri/shared";
import { api } from "../api";
import { Icon } from "../components/icon";
import { formatDateTime } from "../format";
import { VaultAudit } from "./vault-audit";

const sourceLabels: Record<SandboxCredentialAttachmentSummary["sourceType"], string> = {
  inline_ephemeral: "One-time",
  harakiri_encrypted: "Workspace secret",
  external_ref: "External reference",
  dynamic: "Dynamic issuer"
};

const refreshLabels: Record<SandboxCredentialAttachmentSummary["refreshState"], string> = {
  not_applicable: "Not renewable",
  current: "Current",
  expiring: "Expiring soon",
  expired: "Expired",
  refresh_failed: "Refresh failed"
};

const providerStateLabels: Record<SandboxCredentialAttachmentSummary["providerState"], string> = {
  unknown: "Runtime not inspected",
  present: "Present at runtime",
  missing: "Missing at runtime",
  unavailable: "Runtime inspection unavailable"
};

const attachmentState = (attachment: SandboxCredentialAttachmentSummary) =>
  attachment.refreshState === "not_applicable"
    ? attachment.status.replaceAll("_", " ")
    : refreshLabels[attachment.refreshState];

const attachmentTone = (attachment: SandboxCredentialAttachmentSummary) => {
  if (attachment.providerState === "missing" || attachment.status === "failed" || attachment.refreshState === "expired" || attachment.refreshState === "refresh_failed") return "err";
  if (attachment.providerState === "unavailable" || attachment.status === "requires_reinjection" || attachment.refreshState === "expiring") return "idle";
  return attachment.status === "injected" ? "live" : "";
};

const targetLabel = (attachment: SandboxCredentialAttachmentSummary) =>
  attachment.match.hosts.join(", ") || "No destination";

export const SandboxVaultPane = ({ sandbox, canViewAudit = false }: { sandbox: SandboxSummary; canViewAudit?: boolean }) => {
  const [attachments, setAttachments] = useState<SandboxCredentialAttachmentSummary[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState<TestSandboxCredentialResponse | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.sandboxCredentials(sandbox.id);
      setAttachments(result.attachments);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Credential attachments are unavailable.");
    }
  }, [sandbox.id]);

  useEffect(() => { void load(); }, [load]);

  const inspect = async () => {
    setBusyId("inspect");
    setError("");
    try {
      const result = await api.inspectSandboxCredentials(sandbox.id);
      setAttachments(result.attachments);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Runtime credential inspection failed.");
    } finally {
      setBusyId(null);
    }
  };

  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError("");
    try {
      await action();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Credential operation failed.");
    } finally {
      setBusyId(null);
    }
  };

  const test = (attachment: SandboxCredentialAttachmentSummary) => run(attachment.id, async () => {
    setTestResult(await api.testSandboxCredential(sandbox.id, attachment.id));
  });

  const detach = (attachment: SandboxCredentialAttachmentSummary) => {
    if (!window.confirm(`Detach ${attachment.displayName} from this sandbox?`)) return;
    void run(attachment.id, () => api.detachSandboxCredential(sandbox.id, attachment.id));
  };

  const activeAttachments = attachments.filter((attachment) => !attachment.detachedAt);
  const staleCount = activeAttachments.filter((attachment) => attachment.status === "requires_reinjection").length;
  const available = sandbox.runtimeMetadata?.provider.capabilities.some(
    (capability) => capability.name === "credentialVault" && capability.state === "available"
  );

  return (
    <div className="sandbox-vault-pane">
      <div className="sandbox-vault-toolbar">
        <div>
          <div className="card-h">Credential attachments</div>
          <div className="network-sub">Real values remain outside the sandbox. Only matching outbound requests receive credentials.</div>
        </div>
        <div className="sandbox-vault-actions">
          {staleCount ? <button className="btn btn-sm" disabled={busyId !== null} onClick={() => void run("rehydrate", () => api.rehydrateSandboxCredentials(sandbox.id))}><Icon name="refresh" size={12} /> Rehydrate {staleCount}</button> : null}
          <button className="btn btn-ghost btn-sm" disabled={busyId !== null || !available || sandbox.status === "terminated"} onClick={() => void inspect()} title="Compare attachments with sanitized runtime state"><Icon name="refresh" size={12} /> Inspect runtime</button>
        </div>
      </div>

      {!available ? <div className="network-warning">Credential Vault is unavailable for this runtime profile.</div> : null}
      {error ? <div className="network-error">{error}</div> : null}
      {testResult ? (
        <div className={`credential-test-summary ${testResult.ok ? "ok" : "blocked"}`}>
          <span>{testResult.ok ? "Credential request reached its destination." : "Credential request failed."}</span>
          <span className="mono">{testResult.method} {testResult.normalizedTarget} · {testResult.httpStatus ?? testResult.status}</span>
          <button className="btn btn-ghost btn-sm icon-only" onClick={() => setTestResult(null)} title="Dismiss result" aria-label="Dismiss result"><Icon name="x" size={11} /></button>
        </div>
      ) : null}

      <div className="sandbox-vault-table">
        <div className="sandbox-vault-row sandbox-vault-head">
          <span>Credential</span><span>Source</span><span>Destinations</span><span>State</span><span>Expiry</span><span />
        </div>
        {activeAttachments.map((attachment) => (
          <div className="sandbox-vault-row" key={attachment.id}>
            <span className="credential-identity"><b>{attachment.displayName}</b><small className="mono">{attachment.id}</small><small>{Object.keys(attachment.fakeEnv).join(", ") || "No fake env"}</small></span>
            <span><span className="tag">{sourceLabels[attachment.sourceType]}</span><small className="mono credential-source-ref">{attachment.sourceRef ?? "launch only"}</small></span>
            <span className="credential-destinations">{targetLabel(attachment)}</span>
            <span><span className={`pill ${attachmentTone(attachment)}`}><span className="dot" /> {attachmentState(attachment)}</span><small>{providerStateLabels[attachment.providerState]}{attachment.providerCheckedAt ? ` · ${formatDateTime(attachment.providerCheckedAt)}` : ""}</small>{attachment.lastError ? <small className="credential-error">{attachment.lastError}</small> : null}</span>
            <span className="num credential-expiry">{attachment.expiresAt ? formatDateTime(attachment.expiresAt) : "No expiry"}{attachment.refreshedAt ? <small>refreshed {formatDateTime(attachment.refreshedAt)}</small> : null}</span>
            <span className="sandbox-vault-row-actions">
              {attachment.sourceType === "dynamic" ? <button className="btn btn-ghost btn-sm" disabled={busyId !== null || sandbox.status === "terminated"} onClick={() => void run(attachment.id, () => api.refreshSandboxCredential(sandbox.id, attachment.id))}>Refresh</button> : null}
              <button className="btn btn-ghost btn-sm" disabled={busyId !== null || attachment.status !== "injected"} onClick={() => void test(attachment)}>Test</button>
              <button className="btn btn-ghost btn-sm route-delete icon-only" disabled={busyId !== null || sandbox.status === "terminated"} onClick={() => detach(attachment)} title="Detach credential" aria-label={`Detach ${attachment.displayName}`}><Icon name="x" size={11} /></button>
            </span>
          </div>
        ))}
        {activeAttachments.length ? null : <div className="empty-state">No credentials are attached to this sandbox.</div>}
      </div>
      {canViewAudit ? (
        <section className="sandbox-vault-audit">
          <div className="card-h">Credential activity</div>
          <div className="network-sub">Organization audit history for this sandbox. Credential values are never recorded.</div>
          <VaultAudit targetType="sandbox" targetId={sandbox.id} compact />
        </section>
      ) : null}
    </div>
  );
};
