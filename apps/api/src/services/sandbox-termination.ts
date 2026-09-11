import { transaction as defaultTransaction, type Transaction } from "../db.js";
import type { RuntimeProvider, RuntimeSandboxSummary } from "../providers/runtime/provider.js";
import type { Query } from "./query.js";
import { CapacityError, releaseSandboxCapacity, type CapacityHold } from "./organization-capacity.js";
import { acknowledgeRuntimeEffect, beginRuntimeEffect, finishRuntimeEffect, lockEffectSandbox, markRuntimeEffectDispatched, markRuntimeEffectUncertain, type RuntimeEffect } from "./sandbox-runtime-effects.js";
import { claimSandboxOperationById, completeSandboxOperation, enqueueSandboxOperation, type SandboxOperation } from "./sandbox-operations.js";
import { recordSandboxEvent } from "./sandbox-events.js";

export const runtimeIsAbsent = (provider: RuntimeProvider, observed: RuntimeSandboxSummary | null) => Boolean(
  provider.capabilities.authoritativeLifecycle && (!observed || ["terminated", "deleted", "stopped"].includes(observed.state.trim().toLowerCase()))
);

export const persistSandboxTermination = async (input: { organizationId: string; sandboxId: string }, query: Query) => {
  await query("UPDATE sandboxes SET status='terminated', updated_at=clock_timestamp() WHERE id=$1 AND organization_id=$2", [input.sandboxId, input.organizationId]);
  await query("UPDATE sandbox_routes SET state='terminated', terminated_at=COALESCE(terminated_at,now()), updated_at=now() WHERE sandbox_id=$1 AND organization_id=$2 AND state<>'terminated'", [input.sandboxId, input.organizationId]);
  await query("UPDATE sandbox_schedules SET completed_at=now() WHERE sandbox_id=$1 AND organization_id=$2 AND completed_at IS NULL", [input.sandboxId, input.organizationId]);
  await query("UPDATE sandbox_credential_attachments SET status='detached', provider_state='missing', detached_at=COALESCE(detached_at,now()), updated_at=now() WHERE sandbox_id=$1 AND organization_id=$2 AND detached_at IS NULL", [input.sandboxId, input.organizationId]);
};

export const finishRuntimeDeletion = async (
  effect: RuntimeEffect, transaction: Transaction = defaultTransaction
) => finishRuntimeEffect(effect, async (query) => {
  await persistSandboxTermination({ organizationId: effect.organization_id, sandboxId: effect.sandbox_id }, query);
  await releaseSandboxCapacity({ organizationId: effect.organization_id, sandboxId: effect.sandbox_id, generation: effect.generation, reason: "provider_absent" }, query);
  await recordSandboxEvent(query)(effect.organization_id, effect.sandbox_id, "terminated", "Runtime absence confirmed; execution capacity released.", { reason: effect.context.reason ?? "stop_requested", generation: effect.generation });
  if (effect.operation_id) await completeSandboxOperation({ operationId: effect.operation_id, reconciled: true,
    expectedAttempts: typeof effect.context.operationAttempt === "number" ? effect.context.operationAttempt : undefined,
    result: { providerSandboxId: effect.provider_id, confirmedAbsent: true } }, query);
}, transaction);

export const executeRuntimeDeletion = async (
  effect: RuntimeEffect, dependencies: { query: Query; transaction?: Transaction; runtimeProvider: RuntimeProvider }
) => {
  if (!effect.provider_id) throw new CapacityError("sandbox_transition_in_progress", "A runtime identity is required to confirm deletion.");
  const ref = { provider: dependencies.runtimeProvider.kind, providerSandboxId: effect.provider_id };
  try {
    await markRuntimeEffectDispatched(effect, dependencies.query);
    await dependencies.runtimeProvider.delete(ref);
    await acknowledgeRuntimeEffect(effect, dependencies.query);
    const observed = await dependencies.runtimeProvider.get(ref);
    const confirmed = runtimeIsAbsent(dependencies.runtimeProvider, observed);
    if (confirmed) await finishRuntimeDeletion(effect, dependencies.transaction);
    return confirmed;
  } catch (error) {
    if (error instanceof CapacityError && error.code === "sandbox_transition_in_progress") {
      const completed = await dependencies.query(
        `SELECT e.id FROM sandbox_runtime_effects e JOIN sandboxes s ON s.id=e.sandbox_id AND s.organization_id=e.organization_id
         WHERE e.id=$1 AND e.settled_at IS NOT NULL AND s.status='terminated' AND s.opensandbox_id=e.provider_id`, [effect.id]
      );
      if (completed.rowCount) return true;
    }
    await markRuntimeEffectUncertain(effect, dependencies.transaction);
    throw new CapacityError("organization_capacity_unavailable", "Runtime deletion could not be confirmed. The execution slot remains reserved.", { sandboxId: effect.sandbox_id, operationId: effect.operation_id });
  }
};

export const requestSandboxTermination = async (
  input: { organizationId: string; sandboxId: string; idempotencyKey?: string | null },
  dependencies: { query: Query; transaction?: Transaction; runtimeProvider: RuntimeProvider }
) => {
  const transaction = dependencies.transaction ?? defaultTransaction;
  const outcome = await transaction(async (query) => {
    const sandbox = await lockEffectSandbox(input.organizationId, input.sandboxId, query);
    const holds = await query<CapacityHold>("SELECT * FROM sandbox_capacity_reservations WHERE organization_id=$1 AND sandbox_id=$2 AND (released_at IS NULL OR $3::boolean) ORDER BY generation DESC LIMIT 1", [input.organizationId, input.sandboxId, sandbox.status === "paused"]);
    const hold = holds.rows[0];
    if (!hold && sandbox.status === "terminated") return null;
    if (!hold) throw new CapacityError("organization_capacity_unavailable", "Sandbox inventory needs reconciliation before deletion.");
    const effects = await query<RuntimeEffect>("SELECT * FROM sandbox_runtime_effects WHERE sandbox_id=$1 AND settled_at IS NULL", [input.sandboxId]);
    const current = effects.rows[0];
    if (current?.kind === "delete") return null;
    if (!sandbox.opensandbox_id) {
      const accepted = await query<SandboxOperation>("SELECT request FROM sandbox_operations WHERE id=$1 AND organization_id=$2", [hold.operation_id, input.organizationId]);
      if (current?.dispatched_at || accepted.rows[0]?.request.capacityProtocol !== 1) {
        throw new CapacityError("sandbox_transition_in_progress", "Provisioning may have started. Its outcome must be reconciled before canceling.");
      }
      if (current) {
        const canceled = await query("UPDATE sandbox_runtime_effects SET settled_at=now(), updated_at=now() WHERE id=$1 AND dispatched_at IS NULL AND settled_at IS NULL RETURNING id", [current.id]);
        if (!canceled.rowCount) throw new CapacityError("sandbox_transition_in_progress", "Runtime dispatch started before cancellation. Its outcome must be reconciled.");
      }
      await query("UPDATE sandbox_operations SET state='canceled', completed_at=now(), updated_at=now() WHERE sandbox_id=$1 AND organization_id=$2 AND state IN ('queued','running')", [input.sandboxId, input.organizationId]);
      await persistSandboxTermination(input, query);
      await releaseSandboxCapacity({ ...input, generation: hold.generation, reason: "canceled_before_dispatch" }, query);
      await query("UPDATE persistent_workspaces SET attached_sandbox_id=NULL, updated_at=now() WHERE organization_id=$1 AND attached_sandbox_id=$2 AND attachment_attempted_at IS NULL", [input.organizationId, input.sandboxId]);
      return null;
    }
    if (current) throw new CapacityError("sandbox_transition_in_progress", "Another runtime operation is still in progress. Its execution slot remains reserved.");
    const queued = await enqueueSandboxOperation({ ...input, kind: "delete", request: { providerSandboxId: sandbox.opensandbox_id, capacityProtocol: 1 } }, { query });
    if (queued.operation.sandboxId !== input.sandboxId) throw new CapacityError("idempotency_conflict", "This key belongs to a different sandbox.");
    const operation = await claimSandboxOperationById({ operationId: queued.operation.id, kinds: ["delete"] }, query);
    if (!operation) return null;
    const effect = await beginRuntimeEffect({ ...input, kind: "delete", operation }, query);
    await query("UPDATE sandbox_capacity_reservations SET phase='releasing', reason=NULL, updated_at=now() WHERE sandbox_id=$1 AND generation=$2 AND released_at IS NULL", [input.sandboxId, hold.generation]);
    return effect;
  });
  if (outcome) await executeRuntimeDeletion(outcome, dependencies);
};
