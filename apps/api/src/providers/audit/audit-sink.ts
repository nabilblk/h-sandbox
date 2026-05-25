export type AuditSinkKind = "postgres" | "stdout" | "webhook" | string;

export type AuditRecord = {
  organizationId: string;
  actorUserId?: string | null;
  actorLabel: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
};

export interface AuditSink {
  readonly kind: AuditSinkKind;

  record(event: AuditRecord): Promise<void>;
}
