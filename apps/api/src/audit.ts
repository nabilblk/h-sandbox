import { query } from "./db.js";
import { redactRecord } from "./redaction.js";

export type AuditEventInput = {
  organizationId: string;
  actorUserId?: string | null;
  actorLabel: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

type QueryRunner = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

export const recordAuditEvent = async (event: AuditEventInput, runner?: QueryRunner) => {
  const db = runner ?? { query };
  await db.query(
    `INSERT INTO audit_events (organization_id, actor_user_id, actor_label, action, target_type, target_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      event.organizationId,
      event.actorUserId ?? null,
      event.actorLabel,
      event.action,
      event.targetType,
      event.targetId ?? null,
      redactRecord(event.metadata ?? {})
    ]
  );
};
