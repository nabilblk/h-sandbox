import { transaction as defaultTransaction, type Transaction } from "../db.js";
import type { RuntimeProvider, RuntimeCreateSandboxInput, RuntimeCreateSandboxResult } from "../providers/runtime/provider.js";
import type { Query } from "./query.js";
import { CapacityError, releaseSandboxCapacity } from "./organization-capacity.js";
import { acknowledgeRuntimeEffect, beginRuntimeEffect, finishRuntimeEffect, lockEffectSandbox, markRuntimeEffectDispatched, markRuntimeEffectUncertain, type RuntimeEffect } from "./sandbox-runtime-effects.js";
import { completeSandboxOperation, type SandboxOperation } from "./sandbox-operations.js";
import { normalizeRuntimeState } from "./sandbox-lease.js";

export type ProvisionedRuntime = { effect: RuntimeEffect; provider: RuntimeCreateSandboxResult };

export const provisionSandboxRuntime = async (
  operation: SandboxOperation,
  input: () => Promise<RuntimeCreateSandboxInput>,
  dependencies: { query: Query; transaction?: Transaction; runtimeProvider: RuntimeProvider }
): Promise<ProvisionedRuntime> => {
  if (!operation.sandboxId) throw new CapacityError("idempotency_conflict", "Provision operation has no sandbox.");
  const transaction = dependencies.transaction ?? defaultTransaction;
  const effect = await transaction((q) => beginRuntimeEffect({
    organizationId: operation.organizationId, sandboxId: operation.sandboxId!, kind: "provision", operation
  }, q));
  let dispatched = false;
  let provider: RuntimeCreateSandboxResult | undefined;
  try {
    const prepared = await input();
    await markRuntimeEffectDispatched(effect, dependencies.query);
    dispatched = true;
    provider = await dependencies.runtimeProvider.create({ ...prepared, metadata: {
      ...prepared.metadata, "harakiri.operation": operation.id, "harakiri.effect": effect.id,
      "harakiri.generation": String(effect.generation)
    } });
    if (!provider.providerSandboxId) throw new Error("Provider accepted creation without a runtime identity");
    await acknowledgeRuntimeEffect(effect, dependencies.query, provider.providerSandboxId);
    const created = provider;
    await transaction(async (q) => {
      await lockEffectSandbox(operation.organizationId, operation.sandboxId!, q);
      const owner = await q("SELECT id FROM sandbox_runtime_effects WHERE id=$1 AND settled_at IS NULL", [effect.id]);
      if (!owner.rowCount) throw new CapacityError("sandbox_transition_in_progress", "Provision result is no longer owned by this worker.");
      const state = normalizeRuntimeState(created.state);
      const persisted = await q(`UPDATE sandboxes SET opensandbox_id=$2, status=$4, started_at=COALESCE(started_at,now()),
          last_active_at=now(), expires_at=LEAST($5::timestamptz, now()+make_interval(secs=>ttl_seconds::int)),
          provider_expires_at=$5::timestamptz, updated_at=now()
        WHERE id=$1 AND organization_id=$3 AND status='pending' AND opensandbox_id IS NULL`,
      [operation.sandboxId, created.providerSandboxId, operation.organizationId, state === "running" || state === "idle" ? state : "pending", created.expiresAt ?? null]);
      if (persisted.rowCount !== 1) throw new CapacityError("sandbox_transition_in_progress", "Sandbox changed before its runtime identity could be saved.");
      await q(`INSERT INTO sandbox_schedules(sandbox_id,organization_id,kind,run_at)
        SELECT id,organization_id,'idle_ttl',expires_at FROM sandboxes WHERE id=$1 AND organization_id=$2`, [operation.sandboxId, operation.organizationId]);
    });
    return { effect, provider };
  } catch (error) {
    if (dispatched) {
      // A timeout or failed commit cannot prove the provider failed to create execution.
      await markRuntimeEffectUncertain(effect, transaction, provider?.providerSandboxId);
    } else {
      await finishRuntimeEffect(effect, (q) => releaseSandboxCapacity({ organizationId: effect.organization_id, sandboxId: effect.sandbox_id, generation: effect.generation, reason: "canceled_before_dispatch" }, q), transaction);
    }
    throw error;
  }
};

export const completeSandboxProvision = async (
  operation: SandboxOperation, provisioned: ProvisionedRuntime, result: Record<string, unknown>, transaction: Transaction = defaultTransaction
) => finishRuntimeEffect(provisioned.effect, async (query) => {
  const status = normalizeRuntimeState(provisioned.provider.state);
  await query(`UPDATE sandbox_capacity_reservations SET phase=$3, reason=NULL, updated_at=now()
    WHERE sandbox_id=$1 AND generation=$2 AND released_at IS NULL`,
  [operation.sandboxId, provisioned.effect.generation, status === "running" || status === "idle" ? "active" : "reserved"]);
  const completed = await completeSandboxOperation({ operationId: operation.id, expectedAttempts: operation.attempts, result: {
    ...result, provider: provisioned.provider.provider, providerSandboxId: provisioned.provider.providerSandboxId
  } }, query);
  if (!completed) throw new CapacityError("sandbox_transition_in_progress", "Provision operation changed before completion.");
  return completed;
}, transaction);
