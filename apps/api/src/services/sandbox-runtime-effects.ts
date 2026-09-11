import { randomUUID } from "node:crypto";
import { transaction as defaultTransaction, type Transaction } from "../db.js";
import type { Query } from "./query.js";
import { CapacityError, lockOrganizationCapacity, type CapacityHold } from "./organization-capacity.js";
import { sandboxOperationSelect, type SandboxOperation } from "./sandbox-operations.js";

export type RuntimeEffect = {
  id: string;
  organization_id: string;
  sandbox_id: string;
  generation: number;
  operation_id: string | null;
  kind: "prepare" | "provision" | "pause" | "resume" | "delete" | "renew";
  provider_id: string | null;
  context: Record<string, unknown>;
  dispatched_at: Date | string | null;
  acknowledged_at: Date | string | null;
  uncertain_at: Date | string | null;
  settled_at: Date | string | null;
};

export const lockEffectSandbox = async (organizationId: string, sandboxId: string, query: Query) => {
  await lockOrganizationCapacity(organizationId, query);
  const result = await query<{ opensandbox_id: string | null; status: string }>(
    "SELECT opensandbox_id, status FROM sandboxes WHERE id=$1 AND organization_id=$2 FOR UPDATE", [sandboxId, organizationId]
  );
  if (!result.rows[0]) throw new CapacityError("organization_capacity_unavailable", "Sandbox inventory is unavailable.");
  return result.rows[0];
};

export const readRuntimeFence = async (sandboxId: string, query: Query) => {
  const result = await query<{ version: string; busy: boolean }>(
    "SELECT count(*)::text AS version, COALESCE(bool_or(settled_at IS NULL),false) AS busy FROM sandbox_runtime_effects WHERE sandbox_id=$1", [sandboxId]
  );
  return result.rows[0];
};

export const beginRuntimeEffect = async (
  input: { organizationId: string; sandboxId: string; kind: RuntimeEffect["kind"]; operation?: SandboxOperation; context?: Record<string, unknown> }, query: Query
): Promise<RuntimeEffect> => {
  const sandbox = await lockEffectSandbox(input.organizationId, input.sandboxId, query);
  if (input.operation) {
    const result = await query<SandboxOperation>(`${sandboxOperationSelect} WHERE id=$1 FOR UPDATE`, [input.operation.id]);
    const current = result.rows[0];
    if (!current || current.organizationId !== input.organizationId || current.sandboxId !== input.sandboxId ||
      current.state !== (input.kind === "prepare" ? "queued" : "running") || current.attempts !== input.operation.attempts) {
      throw new CapacityError("sandbox_transition_in_progress", "The operation is owned by another worker.");
    }
  }
  const holds = await query<CapacityHold>(
    "SELECT * FROM sandbox_capacity_reservations WHERE organization_id=$1 AND sandbox_id=$2 AND (released_at IS NULL OR $3::boolean) ORDER BY generation DESC LIMIT 1",
    [input.organizationId, input.sandboxId, input.kind === "delete" && sandbox.status === "paused"]
  );
  const hold = holds.rows[0];
  if (!hold) throw new CapacityError("organization_capacity_unavailable", "No execution reservation exists for this sandbox.");
  if (["prepare", "provision", "resume"].includes(input.kind) && (hold.phase !== "reserved" || hold.operation_id !== input.operation?.id)) {
    throw new CapacityError("sandbox_transition_in_progress", "This operation does not own a starting reservation.");
  }
  const existing = await query("SELECT id FROM sandbox_runtime_effects WHERE sandbox_id=$1 AND settled_at IS NULL", [input.sandboxId]);
  if (existing.rows.length) throw new CapacityError("sandbox_transition_in_progress", "A runtime operation is still in progress or its outcome is being checked.");
  const result = await query<RuntimeEffect>(
    `INSERT INTO sandbox_runtime_effects(id,organization_id,sandbox_id,operation_id,kind,generation,provider_id,context)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`,
    [randomUUID(), input.organizationId, input.sandboxId, input.operation?.id ?? null, input.kind, hold.generation, sandbox.opensandbox_id, JSON.stringify({ ...input.context, operationAttempt: input.operation?.attempts ?? null })]
  );
  return result.rows[0];
};

export const markRuntimeEffectDispatched = async (effect: RuntimeEffect, query: Query) => {
  const result = await query(
    "UPDATE sandbox_runtime_effects SET dispatched_at=clock_timestamp(), updated_at=clock_timestamp() WHERE id=$1 AND settled_at IS NULL AND dispatched_at IS NULL RETURNING id", [effect.id]
  );
  if (!result.rowCount) throw new CapacityError("sandbox_transition_in_progress", "Runtime dispatch was canceled or already started.");
};

export const acknowledgeRuntimeEffect = async (effect: RuntimeEffect, query: Query, providerId?: string) => {
  const result = await query(
    `UPDATE sandbox_runtime_effects SET acknowledged_at=clock_timestamp(), provider_id=COALESCE($2,provider_id), updated_at=clock_timestamp()
     WHERE id=$1 AND settled_at IS NULL RETURNING id`, [effect.id, providerId ?? null]
  );
  if (!result.rowCount) throw new CapacityError("sandbox_transition_in_progress", "Runtime result belongs to a settled operation.");
};

export const finishRuntimeEffect = async <T>(
  effect: RuntimeEffect, work: (query: Query) => Promise<T>, transaction: Transaction = defaultTransaction
): Promise<T> => transaction(async (query) => {
  await lockEffectSandbox(effect.organization_id, effect.sandbox_id, query);
  const result = await query(
    `UPDATE sandbox_runtime_effects SET settled_at=clock_timestamp(), updated_at=clock_timestamp()
     WHERE id=$1 AND generation=$2 AND settled_at IS NULL RETURNING id`, [effect.id, effect.generation]
  );
  if (!result.rowCount) throw new CapacityError("sandbox_transition_in_progress", "Runtime result belongs to a settled operation.");
  return work(query);
});

export const markRuntimeEffectUncertain = async (
  effect: RuntimeEffect, transaction: Transaction = defaultTransaction, providerId?: string
) => transaction(async (query) => {
  await lockEffectSandbox(effect.organization_id, effect.sandbox_id, query);
  const result = await query(
    `UPDATE sandbox_runtime_effects SET uncertain_at=clock_timestamp(), provider_id=COALESCE($2,provider_id), updated_at=clock_timestamp()
     WHERE id=$1 AND settled_at IS NULL RETURNING id`, [effect.id, providerId ?? null]
  );
  if (!result.rowCount) return;
  await query(
    `UPDATE sandbox_capacity_reservations SET phase='uncertain', reason='runtime_outcome_unknown', updated_at=clock_timestamp()
     WHERE sandbox_id=$1 AND generation=$2 AND released_at IS NULL`, [effect.sandbox_id, effect.generation]
  );
});
