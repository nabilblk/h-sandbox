import type { OrganizationCapacity } from "@harakiri/shared";
import { query as defaultQuery } from "../db.js";
import type { Query } from "./query.js";

export class CapacityError extends Error {
  constructor(
    public readonly code: "organization_capacity_exceeded" | "organization_capacity_unavailable" | "organization_capacity_settings_conflict" | "sandbox_transition_in_progress" | "idempotency_conflict",
    message: string,
    public readonly details: Record<string, unknown> = {}
  ) { super(message); }

  get statusCode() { return this.code === "organization_capacity_unavailable" ? 503 : 409; }
}

export type CapacityHold = {
  organization_id: string;
  sandbox_id: string;
  generation: number;
  operation_id: string | null;
  phase: "reserved" | "active" | "releasing" | "uncertain" | "released";
  reason: string | null;
};

export const readOrganizationCapacity = async (organizationId: string, query: Query = defaultQuery): Promise<OrganizationCapacity> => {
  const result = await query<{
    max_concurrency: number; capacity_state: OrganizationCapacity["state"]; capacity_revision: number;
    reserved: number; active: number; releasing: number; uncertain: number; observed_at: Date;
  }>(`SELECT o.max_concurrency, o.capacity_state, o.capacity_revision, clock_timestamp() AS observed_at,
       (count(r.sandbox_id) FILTER (WHERE r.phase = 'reserved'))::int AS reserved,
       (count(r.sandbox_id) FILTER (WHERE r.phase = 'active'))::int AS active,
       (count(r.sandbox_id) FILTER (WHERE r.phase = 'releasing'))::int AS releasing,
       (count(r.sandbox_id) FILTER (WHERE r.phase = 'uncertain'))::int AS uncertain
     FROM organizations o LEFT JOIN sandbox_capacity_reservations r
       ON r.organization_id = o.id AND r.released_at IS NULL
     WHERE o.id = $1 GROUP BY o.id`, [organizationId]);
  const row = result.rows[0];
  if (!row) throw new CapacityError("organization_capacity_unavailable", "Organization capacity is unavailable.");
  const enforced = row.capacity_state === "enforced" && row.max_concurrency >= 1 && row.max_concurrency <= 10000;
  const total = row.reserved + row.active + row.releasing + row.uncertain;
  return {
    state: enforced ? "enforced" : row.capacity_state === "quarantined" ? "quarantined" : "reconciling",
    limit: row.max_concurrency, revision: row.capacity_revision,
    inUse: enforced ? total : null, available: enforced ? Math.max(0, row.max_concurrency - total) : null,
    overLimit: enforced ? Math.max(0, total - row.max_concurrency) : null,
    breakdown: enforced ? { reserved: row.reserved, active: row.active, releasing: row.releasing, uncertain: row.uncertain } : null,
    observedAt: new Date(row.observed_at).toISOString()
  };
};

// Call on the transaction's pinned connection, before locking any sandbox/operation.
export const lockOrganizationCapacity = async (organizationId: string, query: Query) => {
  await query("SET LOCAL lock_timeout = '3s'");
  const result = await query<{ capacity_state: string }>(
    "SELECT capacity_state FROM organizations WHERE id = $1 FOR NO KEY UPDATE", [organizationId]
  );
  if (!result.rows[0]) throw new CapacityError("organization_capacity_unavailable", "Organization capacity is unavailable.");
};

export const reserveSandboxCapacity = async (
  input: { organizationId: string; sandboxId: string; operationId: string }, query: Query
): Promise<CapacityHold> => {
  await lockOrganizationCapacity(input.organizationId, query);
  const existing = await query<CapacityHold>(
    "SELECT * FROM sandbox_capacity_reservations WHERE sandbox_id = $1 AND organization_id = $2 AND released_at IS NULL",
    [input.sandboxId, input.organizationId]
  );
  if (existing.rows[0]) {
    if (existing.rows[0].operation_id === input.operationId) return existing.rows[0];
    throw new CapacityError("sandbox_transition_in_progress", "This sandbox already has an execution reservation.");
  }
  // This statement must follow the lock statement to obtain a fresh READ COMMITTED snapshot.
  const capacity = await readOrganizationCapacity(input.organizationId, query);
  if (capacity.state !== "enforced") throw new CapacityError("organization_capacity_unavailable", "Capacity inventory is being reconciled. No new execution was admitted.", { capacity });
  if (capacity.available === 0) throw new CapacityError("organization_capacity_exceeded", `All ${capacity.limit} execution slots are in use. Stop a sandbox or ask an administrator to raise the limit.`, { capacity });
  const result = await query<CapacityHold>(
    `INSERT INTO sandbox_capacity_reservations (organization_id, sandbox_id, generation, operation_id, phase)
     SELECT $1, $2, COALESCE(max(generation), 0) + 1, $3, 'reserved'
     FROM sandbox_capacity_reservations WHERE sandbox_id = $2 RETURNING *`,
    [input.organizationId, input.sandboxId, input.operationId]
  );
  return result.rows[0];
};

export const releaseSandboxCapacity = async (
  input: { organizationId: string; sandboxId: string; generation: number; reason: "provider_absent" | "provider_suspended" | "canceled_before_dispatch" }, query: Query
) => {
  await lockOrganizationCapacity(input.organizationId, query);
  const result = await query(
    `UPDATE sandbox_capacity_reservations r SET phase = 'released', released_at = clock_timestamp(),
       reason = $4, updated_at = clock_timestamp()
     WHERE r.organization_id = $1 AND r.sandbox_id = $2 AND r.generation = $3 AND r.released_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM sandbox_runtime_effects e WHERE e.sandbox_id = r.sandbox_id AND e.settled_at IS NULL)`,
    [input.organizationId, input.sandboxId, input.generation, input.reason]
  );
  return Boolean(result.rowCount);
};
