import { transaction as defaultTransaction, type Transaction } from "../db.js";
import { CapacityError, lockOrganizationCapacity, releaseSandboxCapacity } from "./organization-capacity.js";
import { acknowledgeRuntimeEffect, beginRuntimeEffect, finishRuntimeEffect, lockEffectSandbox, markRuntimeEffectDispatched, markRuntimeEffectUncertain, readRuntimeFence, type RuntimeEffect } from "./sandbox-runtime-effects.js";
import { executeRuntimeDeletion, persistSandboxTermination, runtimeIsAbsent } from "./sandbox-termination.js";
import type { RuntimeProvider } from "../providers/runtime/provider.js";
import type { Query } from "./query.js";
import { completeSandboxOperation, sandboxOperationSelect, type SandboxOperation } from "./sandbox-operations.js";

type SandboxIdentity = { sandboxId: string; organizationId: string };
type LeaseRow = {
  opensandbox_id: string | null;
  status: string;
  ttl_seconds: number;
  expires_at: Date | string | null;
  provider_expires_at: Date | string | null;
};
export type LeaseDependencies = { runtimeProvider: RuntimeProvider; transaction?: Transaction; query?: Query };

export class SandboxLeaseError extends Error {
  constructor(public readonly code: "sandbox_not_found" | "sandbox_not_running" | "renew_in_progress" | "renew_failed" | "idempotency_conflict") {
    super(code);
  }
}

export const normalizeRuntimeState = (state?: string | null) => {
  const value = String(state ?? "").toLowerCase();
  if (value.includes("pausing")) return "pausing";
  if (value.includes("paused")) return "paused";
  if (value.includes("resuming")) return "resuming";
  if (value === "idle") return "idle";
  if (value.includes("running") || value.includes("ready")) return "running";
  if (value.includes("pending") || value.includes("creating")) return "pending";
  if (value.includes("fail") || value.includes("error")) return "error";
  if (["deleted", "terminated", "stopped"].includes(value)) return "terminated";
  return null;
};

const timestamp = (value: Date | string | null | undefined) => value ? new Date(value).getTime() : NaN;
const renewable = (status: string | null) => status === "running" || status === "idle";

const lockSandbox = async (query: Query, input: SandboxIdentity) => {
  await query("SET LOCAL lock_timeout = '10s'");
  const result = await query<LeaseRow>(
    `SELECT opensandbox_id, ttl_seconds, status, expires_at, provider_expires_at FROM sandboxes
     WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
    [input.sandboxId, input.organizationId]
  );
  return result.rows[0];
};

const databaseNow = async (query: Query) => {
  // Read after acquiring the lock: transaction start time may precede a renewal.
  const result = await query<{ now: Date }>("SELECT clock_timestamp() AS now");
  return new Date(result.rows[0].now).getTime();
};

const scheduleDeadline = async (query: Query, input: SandboxIdentity, expiresAt: string) => {
  await query(
    `UPDATE sandbox_schedules SET run_at = $3::timestamptz
     WHERE sandbox_id = $1 AND organization_id = $2 AND kind = 'idle_ttl' AND completed_at IS NULL`,
    [input.sandboxId, input.organizationId, expiresAt]
  );
  await query(
    `INSERT INTO sandbox_schedules (sandbox_id, organization_id, kind, run_at)
     SELECT $1, $2, 'idle_ttl', $3::timestamptz
     WHERE NOT EXISTS (SELECT 1 FROM sandbox_schedules
       WHERE sandbox_id = $1 AND kind = 'idle_ttl' AND completed_at IS NULL)`,
    [input.sandboxId, input.organizationId, expiresAt]
  );
};

const persistDeadline = async (query: Query, input: SandboxIdentity, expiresAt: string, providerExpiresAt: string, activity = false) => {
  await query(
    `UPDATE sandboxes SET expires_at = $3::timestamptz, provider_expires_at = $4::timestamptz, updated_at = clock_timestamp(),
       last_active_at = CASE WHEN $5 THEN clock_timestamp() ELSE last_active_at END
     WHERE id = $1 AND organization_id = $2`,
    [input.sandboxId, input.organizationId, expiresAt, providerExpiresAt, activity]
  );
  await scheduleDeadline(query, input, expiresAt);
};

const effectiveDeadline = (row: LeaseRow, providerDeadline: number) => {
  const local = timestamp(row.expires_at);
  if (!Number.isFinite(providerDeadline)) return local;
  // A changed native deadline can be a successful renewal with a lost DB commit.
  // An unchanged longer native lease can be the provider's minimum create TTL.
  if (providerDeadline !== timestamp(row.provider_expires_at)) return providerDeadline;
  return Number.isFinite(local) ? Math.min(local, providerDeadline) : providerDeadline;
};

export const renewSandboxLease = async (
  input: SandboxIdentity & { operation?: SandboxOperation },
  dependencies: LeaseDependencies
) => {
  const transaction = dependencies.transaction ?? defaultTransaction;
  const query: Query = (text, params) => transaction((q) => q(text, params));
  const admission = await transaction(async (q) => {
    try { await lockOrganizationCapacity(input.organizationId, q); }
    catch (error) { if (error instanceof CapacityError) throw new SandboxLeaseError("sandbox_not_found"); throw error; }
    const row = await lockSandbox(q, input);
    if (!row) throw new SandboxLeaseError("sandbox_not_found");
    if (input.operation) {
      const result = await q<SandboxOperation>(`${sandboxOperationSelect} WHERE id=$1 FOR UPDATE`, [input.operation.id]);
      const operation = result.rows[0];
      if (operation?.sandboxId !== input.sandboxId || operation.organizationId !== input.organizationId) throw new SandboxLeaseError("idempotency_conflict");
      if (operation.state === "succeeded") return { result: operation.result };
      if (operation.state !== "running" || operation.attempts !== input.operation.attempts) throw new SandboxLeaseError("renew_in_progress");
    }
    if (!renewable(row.status) || !row.opensandbox_id) throw new SandboxLeaseError("sandbox_not_running");
    if (!input.operation) {
      const current = await q<RuntimeEffect>("SELECT * FROM sandbox_runtime_effects WHERE sandbox_id=$1 AND kind='renew' AND settled_at IS NULL", [input.sandboxId]);
      if (current.rows[0] && !current.rows[0].uncertain_at) return { coalesced: current.rows[0] };
    }
    const effect = await beginRuntimeEffect({ ...input, kind: "renew", operation: input.operation }, q);
    return { row, effect };
  });
  if ("result" in admission) return admission.result;
  if ("coalesced" in admission && admission.coalesced) {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      const current = await query<{ settled_at: Date | null; expires_at: Date | null; status: string }>(
        "SELECT e.settled_at,s.expires_at,s.status FROM sandbox_runtime_effects e JOIN sandboxes s ON s.id=e.sandbox_id WHERE e.id=$1", [admission.coalesced.id]
      );
      if (current.rows[0]?.settled_at) {
        if (renewable(current.rows[0].status) && timestamp(current.rows[0].expires_at) > await databaseNow(query)) return { coalesced: true, expiresAt: current.rows[0].expires_at };
        throw new SandboxLeaseError("sandbox_not_running");
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new SandboxLeaseError("renew_in_progress");
  }
  if (!("effect" in admission) || !admission.effect) throw new SandboxLeaseError("renew_failed");
  const { row, effect } = admission;
  let dispatched = false;
  try {
    const ref = { provider: dependencies.runtimeProvider.kind, providerSandboxId: row.opensandbox_id! };
    const runtime = await dependencies.runtimeProvider.get(ref);
    if (!runtime || !renewable(normalizeRuntimeState(runtime.state))) throw new SandboxLeaseError("sandbox_not_running");
    const expiresAt = new Date(Math.max(await databaseNow(query) + row.ttl_seconds * 1000, effectiveDeadline(row, timestamp(runtime.expiresAt)) || 0)).toISOString();
    await query("UPDATE sandbox_runtime_effects SET context=context || $2::jsonb WHERE id=$1 AND settled_at IS NULL", [effect.id, JSON.stringify({ expiresAt })]);
    await markRuntimeEffectDispatched(effect, query);
    dispatched = true;
    await dependencies.runtimeProvider.renew(ref, { expiresAt });
    await acknowledgeRuntimeEffect(effect, query);
    return await finishRuntimeRenewal({ ...effect, context: { ...effect.context, expiresAt } }, transaction);
  } catch (error) {
    if (dispatched) await markRuntimeEffectUncertain(effect, transaction);
    else await finishRuntimeEffect(effect, async () => undefined, transaction);
    throw error;
  }
};

export const finishRuntimeRenewal = (effect: RuntimeEffect, transaction: Transaction = defaultTransaction) => finishRuntimeEffect(effect, async (query) => {
  const expiresAt = String(effect.context.expiresAt);
  if (!Number.isFinite(timestamp(expiresAt))) throw new SandboxLeaseError("renew_failed");
  await persistDeadline(query, { organizationId: effect.organization_id, sandboxId: effect.sandbox_id }, expiresAt, expiresAt, true);
  await query("UPDATE sandbox_capacity_reservations SET phase='active', reason=NULL, updated_at=now() WHERE sandbox_id=$1 AND generation=$2 AND released_at IS NULL", [effect.sandbox_id, effect.generation]);
  const result = { providerSandboxId: effect.provider_id, expiresAt };
  if (effect.operation_id) await completeSandboxOperation({
    operationId: effect.operation_id, reconciled: true,
    expectedAttempts: typeof effect.context.operationAttempt === "number" ? effect.context.operationAttempt : undefined,
    result
  }, query);
  return result;
}, transaction);

export const reconcileSandboxLease = async (
  input: SandboxIdentity & { expire?: boolean },
  dependencies: LeaseDependencies
) => {
  const transaction = dependencies.transaction ?? defaultTransaction;
  const query: Query = (text, params) => transaction((q) => q(text, params));
  const before = await transaction(async (q) => {
    await lockEffectSandbox(input.organizationId, input.sandboxId, q);
    const row = await lockSandbox(q, input);
    const fence = await readRuntimeFence(input.sandboxId, q);
    const hold = await q<{ generation: number; reason: string | null }>("SELECT generation, reason FROM sandbox_capacity_reservations WHERE sandbox_id=$1 AND released_at IS NULL", [input.sandboxId]);
    if (!row?.opensandbox_id || fence.busy || !hold.rows[0] || hold.rows[0].reason === "legacy_inventory") return null;
    return { row, fence, generation: hold.rows[0].generation };
  });
  if (!before) return;
  const ref = { provider: dependencies.runtimeProvider.kind, providerSandboxId: before.row.opensandbox_id! };
  const runtime = await dependencies.runtimeProvider.get(ref);
  const effect = await transaction(async (q) => {
    const current = await lockEffectSandbox(input.organizationId, input.sandboxId, q);
    const fence = await readRuntimeFence(input.sandboxId, q);
    if (fence.busy || fence.version !== before.fence.version || current.opensandbox_id !== ref.providerSandboxId) return null;
    const holds = await q<{ generation: number }>("SELECT generation FROM sandbox_capacity_reservations WHERE sandbox_id=$1 AND released_at IS NULL", [input.sandboxId]);
    if (holds.rows[0]?.generation !== before.generation) return null;
    const row = await lockSandbox(q, input);
    if (!row) return null;
    if (runtimeIsAbsent(dependencies.runtimeProvider, runtime)) {
      await persistSandboxTermination(input, q);
      await releaseSandboxCapacity({ ...input, generation: before.generation, reason: "provider_absent" }, q);
      return null;
    }
    const status = normalizeRuntimeState(runtime?.state);
    if (!runtime || !status || status === "terminated") {
      await q("UPDATE sandbox_capacity_reservations SET phase='uncertain', reason='runtime_state_unknown', updated_at=now() WHERE sandbox_id=$1 AND released_at IS NULL", [input.sandboxId]);
      return null;
    }
    await q("UPDATE sandboxes SET status=$3, updated_at=now() WHERE id=$1 AND organization_id=$2", [input.sandboxId, input.organizationId, status]);
    if (status === "paused" && dependencies.runtimeProvider.capabilities.pauseStopsExecution) {
      await releaseSandboxCapacity({ ...input, generation: before.generation, reason: "provider_suspended" }, q);
      return null;
    }
    const phase = ["running", "idle", "paused"].includes(status) ? "active" : status === "error" ? "uncertain" : "reserved";
    await q("UPDATE sandbox_capacity_reservations SET phase=$2, reason=NULL, updated_at=now() WHERE sandbox_id=$1 AND released_at IS NULL", [input.sandboxId, phase]);
    const providerDeadline = timestamp(runtime.expiresAt);
    const deadline = effectiveDeadline(row, providerDeadline);
    if (Number.isFinite(providerDeadline)) await persistDeadline(q, input, new Date(deadline).toISOString(), new Date(providerDeadline).toISOString());
    if (!input.expire || !["running", "idle", "pending"].includes(status) || !Number.isFinite(providerDeadline) || deadline > await databaseNow(q)) return null;
    const deletion = await beginRuntimeEffect({ ...input, kind: "delete", context: { reason: "ttl_expired" } }, q);
    await q("UPDATE sandbox_capacity_reservations SET phase='releasing', reason='ttl_expired', updated_at=now() WHERE sandbox_id=$1 AND released_at IS NULL", [input.sandboxId]);
    return deletion;
  });
  if (effect) await executeRuntimeDeletion(effect, { ...dependencies, query, transaction });
};
