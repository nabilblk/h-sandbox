import type { AuditEventSummary, AuditEventsResponse } from "@harakiri/shared";
import { query as defaultQuery } from "../db.js";
import { redactRecord } from "../redaction.js";
import { isOrganizationAdmin } from "./organization-access.js";
import type { Query } from "./query.js";

type AuditEventRow = {
  id: string;
  actorUserId: string | null;
  actorLabel: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

type AuditEventCountRow = { total: string };

export type AuditEventFilters = {
  targetType?: string;
  targetId?: string;
  actionPrefix?: string;
  limit: number;
  offset: number;
};

export type ListAuditEventsResult =
  | ({ kind: "ok" } & AuditEventsResponse)
  | { kind: "forbidden" };

const mapAuditEvent = (row: AuditEventRow): AuditEventSummary => ({
  id: row.id,
  actorUserId: row.actorUserId,
  actorLabel: row.actorLabel,
  action: row.action,
  targetType: row.targetType,
  targetId: row.targetId,
  metadata: redactRecord(row.metadata ?? {}),
  createdAt: row.createdAt.toISOString()
});

const auditEventFilter = `FROM audit_events
WHERE organization_id = $1
  AND ($2::text IS NULL OR target_type = $2)
  AND ($3::text IS NULL OR target_id = $3)
  AND ($4::text IS NULL OR action LIKE $4 || '%')`;

const auditEventCount = `SELECT COUNT(*)::text AS total
${auditEventFilter}`;

const auditEventSelect = `SELECT id::text,
       actor_user_id::text AS "actorUserId", actor_label AS "actorLabel",
       action, target_type AS "targetType", target_id AS "targetId", metadata,
       created_at AS "createdAt"
${auditEventFilter}
ORDER BY created_at DESC, id DESC
LIMIT $5 OFFSET $6`;

export const listAuditEvents = async (
  input: { organizationId: string; actorUserId: string; filters: AuditEventFilters },
  query: Query = defaultQuery
): Promise<ListAuditEventsResult> => {
  if (!await isOrganizationAdmin(input.organizationId, input.actorUserId, query)) {
    return { kind: "forbidden" };
  }
  const { targetType, targetId, actionPrefix, limit, offset } = input.filters;
  const filterParams = [
    input.organizationId,
    targetType ?? null,
    targetId ?? null,
    actionPrefix ?? null
  ];
  const countResult = await query<AuditEventCountRow>(auditEventCount, filterParams);
  const result = await query<AuditEventRow>(auditEventSelect, [
    ...filterParams,
    limit,
    offset
  ]);
  return {
    kind: "ok",
    events: result.rows.map(mapAuditEvent),
    page: { total: Number(countResult.rows[0]?.total ?? 0), limit, offset }
  };
};
