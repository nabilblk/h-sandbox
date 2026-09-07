import { randomUUID } from "node:crypto";
import type { WorkspaceSummary, WorkspacePolicy } from "@harakiri/shared";
import { config } from "../config.js";
import { makeId } from "../crypto.js";
import type { RuntimeProvider, RuntimeWorkspaceMount } from "../providers/runtime/provider.js";
import type { Query } from "./query.js";

export class WorkspaceError extends Error {
  constructor(public readonly code: string, public readonly statusCode: number, message: string) {
    super(message);
  }
}

type WorkspaceRow = {
  id: string; name: string; sizeGiB: number; attachedSandboxId: string | null;
  sandboxStatus: string | null; provider: string; volumeName: string;
  storageClass: string | null; provisionAttemptedAt: Date | string | null;
  archivedAt: Date | string | null; createdAt: Date | string; updatedAt: Date | string;
};

const select = `SELECT w.id, w.name, w.size_gib AS "sizeGiB", w.provider,
  w.provider_volume_name AS "volumeName", w.storage_class AS "storageClass",
  w.attached_sandbox_id AS "attachedSandboxId", s.status AS "sandboxStatus",
  w.provision_attempted_at AS "provisionAttemptedAt", w.archived_at AS "archivedAt",
  w.created_at AS "createdAt", w.updated_at AS "updatedAt"
  FROM persistent_workspaces w LEFT JOIN sandboxes s ON s.id = w.attached_sandbox_id`;
const iso = (value: Date | string) => new Date(value).toISOString();
export const workspaceSummary = (row: WorkspaceRow): WorkspaceSummary => ({
  id: row.id, name: row.name, sizeGiB: Number(row.sizeGiB), mountPath: "/workspace",
  status: row.archivedAt ? "archived" : row.attachedSandboxId
    ? row.sandboxStatus === "error" ? "recovery_required" : row.sandboxStatus === "terminated" ? "releasing" : "attached" : "available",
  attachedSandboxId: row.attachedSandboxId,
  storageRequested: Boolean(row.provisionAttemptedAt),
  archivedAt: row.archivedAt ? iso(row.archivedAt) : null,
  createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt)
});

export function workspacePolicy(provider: RuntimeProvider): WorkspacePolicy {
  const validSize = Number.isInteger(config.workspaceSizeGiB) && config.workspaceSizeGiB >= 1 && config.workspaceSizeGiB <= 1024;
  const validQuota = Number.isInteger(config.workspaceMaxPerOrganization) && config.workspaceMaxPerOrganization >= 1 && config.workspaceMaxPerOrganization <= 1000;
  const valid = validSize && validQuota && (!config.workspaceStorageClass || (config.workspaceStorageClass.length <= 253
    && config.workspaceStorageClass.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))));
  const available = valid && config.persistentWorkspacesEnabled && Boolean(provider.capabilities.persistentWorkspaces)
    && !(provider.kind === "opensandbox" && config.openSandboxAllowFallback);
  return { available, reason: available ? null : "Persistent workspaces require an operator-enabled storage profile, a supported provider, and fail-closed runtime errors.",
    sizeGiB: validSize ? config.workspaceSizeGiB : 0, maxPerOrganization: validQuota ? config.workspaceMaxPerOrganization : 0, mountPath: "/workspace",
    retention: "until_operator_reclaims", physicalDeletion: false };
}

export function requireWorkspaceSupport(provider: RuntimeProvider) {
  const policy = workspacePolicy(provider);
  if (!policy.available) throw new WorkspaceError("workspaces_unavailable", 501, policy.reason!);
  return policy;
}

export async function getWorkspaceRow(organizationId: string, id: string, query: Query) {
  const result = await query<WorkspaceRow>(`${select} WHERE w.organization_id = $1 AND w.id = $2`, [organizationId, id]);
  if (!result.rows[0]) throw new WorkspaceError("workspace_not_found", 404, "Workspace not found");
  return result.rows[0];
}

export async function listWorkspaces(organizationId: string, query: Query) {
  return (await query<WorkspaceRow>(`${select} WHERE w.organization_id = $1 ORDER BY w.created_at DESC LIMIT 1000`, [organizationId])).rows.map(workspaceSummary);
}

export async function createWorkspace(organizationId: string, name: string, query: Query, provider: RuntimeProvider) {
  const policy = requireWorkspaceSupport(provider);
  const id = makeId("wsp");
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await query<{ id: string }>(`INSERT INTO persistent_workspaces
      (id, organization_id, name, provider, provider_volume_name, storage_class, size_gib, quota_slot)
      SELECT $1, $2, $3, $4, $5, $6, $7, slot FROM generate_series(1, $8::int) AS slot
      WHERE NOT EXISTS (SELECT 1 FROM persistent_workspaces WHERE organization_id = $2 AND quota_slot = slot)
      ORDER BY slot LIMIT 1 ON CONFLICT DO NOTHING RETURNING id`,
    [id, organizationId, name, provider.kind, `harakiri-wsp-${randomUUID()}`, config.workspaceStorageClass, policy.sizeGiB, policy.maxPerOrganization]);
    if (result.rows.length) return workspaceSummary(await getWorkspaceRow(organizationId, id, query));
    const duplicate = await query("SELECT id FROM persistent_workspaces WHERE organization_id = $1 AND name = $2", [organizationId, name]);
    if (duplicate.rows.length) throw new WorkspaceError("workspace_name_conflict", 409, "A workspace already uses this name");
  }
  throw new WorkspaceError("workspace_quota_exceeded", 409, "Workspace allocation is full or busy. Archived storage still counts toward the allocation.");
}

export async function validateWorkspaceAttachment(organizationId: string, id: string, query: Query, provider: RuntimeProvider) {
  requireWorkspaceSupport(provider);
  const workspace = await getWorkspaceRow(organizationId, id, query);
  if (workspace.provider !== provider.kind) throw new WorkspaceError("workspace_provider_mismatch", 409, "Workspace belongs to a different runtime provider");
  if (workspace.archivedAt || workspace.attachedSandboxId) throw new WorkspaceError("workspace_unavailable", 409, "Workspace is archived or attached to another sandbox");
}

export async function prepareRuntimeWorkspace(organizationId: string, sandboxId: string, query: Query, provider: RuntimeProvider): Promise<RuntimeWorkspaceMount> {
  requireWorkspaceSupport(provider);
  const result = await query<WorkspaceRow>(`${select} WHERE w.organization_id = $1 AND w.attached_sandbox_id = $2 AND w.archived_at IS NULL`, [organizationId, sandboxId]);
  const row = result.rows[0];
  if (!row || row.provider !== provider.kind) throw new WorkspaceError("workspace_reservation_missing", 409, "Sandbox no longer owns its workspace reservation");
  // Only the first provider call may provision storage. Later calls must never silently recreate lost data.
  const attempt = await query(`UPDATE persistent_workspaces
    SET provision_attempted_at = COALESCE(provision_attempted_at, now()), attachment_attempted_at = now(), updated_at = now()
    WHERE id = $1 AND organization_id = $2 AND attached_sandbox_id = $3 AND attachment_attempted_at IS NULL RETURNING id`, [row.id, organizationId, sandboxId]);
  if (!attempt.rows.length) throw new WorkspaceError("workspace_attachment_ambiguous", 409, "An attachment was already attempted. Operator recovery is required before retrying an unconfirmed provider request.");
  return { volumeName: row.volumeName, storageClass: row.storageClass, sizeGiB: row.sizeGiB, createIfMissing: !row.provisionAttemptedAt, mountPath: "/workspace" };
}

export async function archiveWorkspace(organizationId: string, id: string, query: Query) {
  await getWorkspaceRow(organizationId, id, query);
  const result = await query(`UPDATE persistent_workspaces SET archived_at = COALESCE(archived_at, now()), updated_at = now()
    WHERE id = $1 AND organization_id = $2 AND attached_sandbox_id IS NULL RETURNING id`, [id, organizationId]);
  if (!result.rows.length) throw new WorkspaceError("workspace_attached", 409, "Terminate the attached sandbox and wait for storage release before archiving");
  return workspaceSummary(await getWorkspaceRow(organizationId, id, query));
}

export async function reconcileWorkspaces(query: Query, provider: RuntimeProvider) {
  if (!workspacePolicy(provider).available) return;
  const rows = await query<{ id: string; sandboxId: string; providerSandboxId: string | null; attachmentAttemptedAt: Date | null }>(
    `SELECT w.id, w.attached_sandbox_id AS "sandboxId", s.opensandbox_id AS "providerSandboxId", w.attachment_attempted_at AS "attachmentAttemptedAt"
     FROM persistent_workspaces w JOIN sandboxes s ON s.id = w.attached_sandbox_id
     WHERE w.provider = $1 AND s.status IN ('terminated', 'error')
       AND NOT EXISTS (SELECT 1 FROM sandbox_operations op WHERE op.sandbox_id = s.id AND op.state IN ('queued', 'running'))
     ORDER BY w.updated_at LIMIT 100`, [provider.kind]);
  for (const row of rows.rows) {
    if (row.providerSandboxId) {
      if (await provider.get({ provider: provider.kind, providerSandboxId: row.providerSandboxId })) continue;
    } else if (row.attachmentAttemptedAt) continue;
    await query("UPDATE persistent_workspaces SET attached_sandbox_id = NULL, updated_at = now() WHERE id = $1 AND attached_sandbox_id = $2", [row.id, row.sandboxId]);
  }
}
