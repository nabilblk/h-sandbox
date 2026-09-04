import { useEffect, useState } from "react";
import type { AuditEventSummary, PageSummary } from "@harakiri/shared";
import { api } from "../api";
import { Icon } from "../components/icon";
import { formatDateTime } from "../format";

const pageSize = 50;

const targetTypes = [
  ["", "All targets"],
  ["credential_secret", "Stored secrets"],
  ["external_secret_reference", "External references"],
  ["dynamic_credential_issuer", "Dynamic issuers"],
  ["sandbox", "Sandboxes"]
] as const;

const metadataLabel = (metadata: Record<string, unknown>) =>
  Object.keys(metadata).length ? JSON.stringify(metadata) : "No metadata";

export const VaultAudit = ({ targetType: fixedTargetType, targetId: fixedTargetId, compact = false }: {
  targetType?: string;
  targetId?: string;
  compact?: boolean;
} = {}) => {
  const [events, setEvents] = useState<AuditEventSummary[]>([]);
  const [page, setPage] = useState<PageSummary>({ total: 0, limit: pageSize, offset: 0 });
  const [targetType, setTargetType] = useState("");
  const [targetId, setTargetId] = useState("");
  const [actionPrefix, setActionPrefix] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void api.auditEvents({
      targetType: fixedTargetType ?? (targetType || undefined),
      targetId: fixedTargetId ?? (targetId.trim() || undefined),
      actionPrefix: actionPrefix.trim() || undefined,
      limit: pageSize,
      offset
    }).then((result) => {
      if (!active) return;
      setEvents(result.events);
      setPage(result.page);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Failed to load audit events.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [actionPrefix, fixedTargetId, fixedTargetType, offset, reload, targetId, targetType]);

  const updateFilter = (setValue: (value: string) => void, value: string) => {
    setOffset(0);
    setValue(value);
  };
  const end = Math.min(page.offset + events.length, page.total);

  return (
    <section className={`vault-source-panel vault-audit-panel ${compact ? "compact" : ""}`}>
      <div className="vault-audit-toolbar">
        <div className="vault-audit-filters">
          {!fixedTargetType ? <select className="input" aria-label="Audit target type" value={targetType} onChange={(event) => updateFilter(setTargetType, event.target.value)}>
            {targetTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select> : null}
          {!fixedTargetId ? <input className="input mono" aria-label="Audit target id" placeholder="Target ID" value={targetId} onChange={(event) => updateFilter(setTargetId, event.target.value)} /> : null}
          <input className="input mono" aria-label="Audit action prefix" placeholder="Action prefix" value={actionPrefix} onChange={(event) => updateFilter(setActionPrefix, event.target.value)} />
        </div>
        <button className="btn btn-sm" disabled={loading} onClick={() => setReload((value) => value + 1)}><Icon name="refresh" size={12} /> Refresh</button>
      </div>

      {error ? <div className="member-error">{error}</div> : null}
      <div className="vault-audit-table card">
        <div className="vault-audit-row vault-head"><span>Created</span><span>Actor</span><span>Action</span>{compact ? null : <span>Target</span>}<span>Metadata</span></div>
        {events.map((event) => (
          <div className="vault-audit-row" key={event.id}>
            <span className="num muted">{formatDateTime(event.createdAt)}</span>
            <span><b>{event.actorLabel}</b><small>{event.actorUserId ?? "system"}</small></span>
            <span><code>{event.action}</code></span>
            {compact ? null : <span><b>{event.targetType}</b><small>{event.targetId ?? "-"}</small></span>}
            <span className="vault-audit-metadata" title={metadataLabel(event.metadata)}>{metadataLabel(event.metadata)}</span>
          </div>
        ))}
        {!events.length ? <div className="sbx-empty"><div className="sbx-empty-title">{loading ? "Loading audit history..." : "No matching audit events."}</div><div className="sbx-empty-sub">Vault lifecycle activity appears here without credential values.</div></div> : null}
      </div>

      <div className="vault-audit-pagination">
        <span className="muted num">{page.total ? `${page.offset + 1}-${end} of ${page.total}` : "0 events"}</span>
        <div>
          <button className="btn btn-sm" disabled={loading || page.offset === 0} onClick={() => setOffset(Math.max(0, page.offset - pageSize))}>Previous</button>
          <button className="btn btn-sm" disabled={loading || end >= page.total} onClick={() => setOffset(page.offset + pageSize)}>Next</button>
        </div>
      </div>
    </section>
  );
};
