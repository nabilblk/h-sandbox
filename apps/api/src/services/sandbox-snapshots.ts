import {
  sandboxSnapshotStatuses,
  type PageSummary,
  type SandboxSnapshotStatus,
  type SandboxSnapshotSummary
} from "@harakiri/shared";
import { query as defaultQuery } from "../db.js";
import type { Query } from "./query.js";

export type SandboxSnapshotRow = Omit<
  SandboxSnapshotSummary,
  "sourceSandboxId" | "status" | "expiresAt" | "createdAt" | "updatedAt" | "deletedAt"
> & {
  organizationId: string;
  sourceSandboxId: string | null;
  provider: string;
  providerSnapshotId: string | null;
  status: string;
  expiresAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt: Date | string | null;
};

export type SandboxSnapshotForRestore = {
  id: string;
  provider: string;
  providerSnapshotId: string | null;
  template: string | null;
  templateVersionId: string | null;
  templateImageDigest: string | null;
  status: SandboxSnapshotStatus | string;
};

export const sandboxSnapshotSelect = `
  SELECT id,
         organization_id::text AS "organizationId",
         source_sandbox_id AS "sourceSandboxId",
         provider,
         provider_snapshot_id AS "providerSnapshotId",
         name,
         status,
         status_reason AS "statusReason",
         status_message AS "statusMessage",
         template_id AS template,
         template_version_id AS "templateVersionId",
         template_image_digest AS "templateImageDigest",
         created_by_user_id::text AS "createdByUserId",
         created_by_label AS "createdByLabel",
         metadata,
         provider_state AS "providerState",
         expires_at AS "expiresAt",
         created_at AS "createdAt",
         updated_at AS "updatedAt",
         deleted_at AS "deletedAt"
  FROM sandbox_snapshots
`;

const toIso = (value: Date | string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const toIsoOrNull = (value: Date | string | null | undefined) => value ? toIso(value) : null;

const normalizeSnapshotStatus = (status: string): SandboxSnapshotStatus | string =>
  sandboxSnapshotStatuses.includes(status as SandboxSnapshotStatus) ? status as SandboxSnapshotStatus : status;

export const mapSandboxSnapshotRow = (row: SandboxSnapshotRow): SandboxSnapshotSummary => ({
  id: row.id,
  sourceSandboxId: row.sourceSandboxId,
  name: row.name ?? null,
  status: normalizeSnapshotStatus(row.status),
  statusReason: row.statusReason ?? null,
  statusMessage: row.statusMessage ?? null,
  template: row.template ?? null,
  templateVersionId: row.templateVersionId ?? null,
  templateImageDigest: row.templateImageDigest ?? null,
  createdByUserId: row.createdByUserId ?? null,
  createdByLabel: row.createdByLabel ?? null,
  metadata: row.metadata ?? {},
  providerState: row.providerState ?? {},
  expiresAt: toIsoOrNull(row.expiresAt),
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
  deletedAt: toIsoOrNull(row.deletedAt)
});

export const listSandboxSnapshots = async (
  input: { organizationId: string; status?: string; sourceSandboxId?: string; includeDeleted?: boolean; limit?: string | number; offset?: string | number },
  query: Query = defaultQuery
): Promise<{ snapshots: SandboxSnapshotSummary[]; page: PageSummary }> => {
  const params: unknown[] = [input.organizationId];
  let where = "WHERE organization_id = $1";
  if (!input.includeDeleted) where += " AND deleted_at IS NULL";
  if (input.status && input.status !== "all") {
    params.push(input.status);
    where += ` AND status = $${params.length}`;
  }
  if (input.sourceSandboxId) {
    params.push(input.sourceSandboxId);
    where += ` AND source_sandbox_id = $${params.length}`;
  }
  const limit = Math.min(Math.max(Number(input.limit ?? 100) || 100, 1), 200);
  const offset = Math.max(Number(input.offset ?? 0) || 0, 0);
  const count = await query<{ total: string }>(`SELECT count(*)::text AS total FROM sandbox_snapshots ${where}`, params);
  params.push(limit, offset);
  const result = await query<SandboxSnapshotRow>(
    `${sandboxSnapshotSelect} ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return {
    snapshots: result.rows.map(mapSandboxSnapshotRow),
    page: { total: Number(count.rows[0]?.total ?? 0), limit, offset }
  };
};

export const getSandboxSnapshot = async (
  input: { organizationId: string; snapshotId: string; includeDeleted?: boolean },
  query: Query = defaultQuery
): Promise<SandboxSnapshotSummary | null> => {
  const result = await query<SandboxSnapshotRow>(
    `${sandboxSnapshotSelect}
     WHERE id = $1 AND organization_id = $2 ${input.includeDeleted ? "" : "AND deleted_at IS NULL"}
     LIMIT 1`,
    [input.snapshotId, input.organizationId]
  );
  return result.rowCount ? mapSandboxSnapshotRow(result.rows[0]) : null;
};

export const getSandboxSnapshotForRestore = async (
  input: { organizationId: string; snapshotId: string },
  query: Query = defaultQuery
): Promise<SandboxSnapshotForRestore | null> => {
  const result = await query<SandboxSnapshotForRestore>(
    `SELECT id,
            provider,
            provider_snapshot_id AS "providerSnapshotId",
            template_id AS template,
            template_version_id AS "templateVersionId",
            template_image_digest AS "templateImageDigest",
            status
     FROM sandbox_snapshots
     WHERE id = $1
       AND organization_id = $2
       AND deleted_at IS NULL
     LIMIT 1`,
    [input.snapshotId, input.organizationId]
  );
  const row = result.rows[0];
  return row ?? null;
};
