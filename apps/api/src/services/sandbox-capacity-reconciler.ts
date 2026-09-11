import { query as defaultQuery, transaction as defaultTransaction, type Transaction } from "../db.js";
import { recordAuditEvent } from "../audit.js";
import type { RuntimeProvider, RuntimeSandboxSummary } from "../providers/runtime/provider.js";
import type { Query } from "./query.js";
import { CapacityError, releaseSandboxCapacity, type CapacityHold } from "./organization-capacity.js";
import { acknowledgeRuntimeEffect, beginRuntimeEffect, finishRuntimeEffect, lockEffectSandbox, type RuntimeEffect } from "./sandbox-runtime-effects.js";
import { completeSandboxOperation, failSandboxOperation, sandboxOperationSelect, type SandboxOperation } from "./sandbox-operations.js";
import { executeRuntimeDeletion, finishRuntimeDeletion, persistSandboxTermination, requestSandboxTermination, runtimeIsAbsent } from "./sandbox-termination.js";
import { finishRuntimeRenewal, normalizeRuntimeState, reconcileSandboxLease } from "./sandbox-lease.js";
import { completeLifecycleEffect } from "./sandbox-lifecycle.js";
import { recordSandboxEvent } from "./sandbox-events.js";

type Dependencies = { query?: Query; transaction?: Transaction; runtimeProvider: RuntimeProvider; limit?: number; staleAfterMs?: number; organizationId?: string };
type Candidate = CapacityHold & { updated_at: Date; released_at: Date | null };

const exactDispatchMatch = (runtime: RuntimeSandboxSummary, effect: RuntimeEffect) => {
  const metadata = runtime.metadata ?? {};
  return (metadata["harakiri.org"] ?? metadata["harakiri.organization"]) === effect.organization_id &&
    (metadata["harakiri.sandbox"] ?? metadata["harakiri.id"]) === effect.sandbox_id &&
    metadata["harakiri.operation"] === effect.operation_id && metadata["harakiri.effect"] === effect.id &&
    metadata["harakiri.generation"] === String(effect.generation);
};

const cancelUndispatchedEffect = (effect: RuntimeEffect, transaction: Transaction) => finishRuntimeEffect(effect, async (query) => {
  const current = await query<RuntimeEffect>("SELECT * FROM sandbox_runtime_effects WHERE id=$1", [effect.id]);
  // The dispatch update and this check serialize on the same row, including a late worker.
  if (current.rows[0]?.dispatched_at) throw new CapacityError("sandbox_transition_in_progress", "Runtime dispatch won the cancellation race.");
  if (effect.operation_id) await failSandboxOperation({ operationId: effect.operation_id, error: "Worker stopped before runtime dispatch; the operation was canceled." }, query);
  const input = { organizationId: effect.organization_id, sandboxId: effect.sandbox_id, generation: effect.generation };
  if (["prepare", "provision"].includes(effect.kind)) {
    await persistSandboxTermination(input, query);
    await releaseSandboxCapacity({ ...input, reason: "canceled_before_dispatch" }, query);
    await query("UPDATE persistent_workspaces SET attached_sandbox_id=NULL, updated_at=now() WHERE organization_id=$1 AND attached_sandbox_id=$2 AND attachment_attempted_at IS NULL", [input.organizationId, input.sandboxId]);
  } else if (effect.kind === "resume") {
    await query("UPDATE sandboxes SET status='paused', updated_at=now() WHERE id=$1 AND organization_id=$2", [input.sandboxId, input.organizationId]);
    // If this resume reused a held pause, preserving that hold is conservative.
    const hold = await query("SELECT generation FROM sandbox_capacity_reservations WHERE sandbox_id=$1 AND generation<$2 AND reason='provider_suspended' ORDER BY generation DESC LIMIT 1", [input.sandboxId, input.generation]);
    if (hold.rows.length) await releaseSandboxCapacity({ ...input, reason: "canceled_before_dispatch" }, query);
    else await query("UPDATE sandbox_capacity_reservations SET phase='active', updated_at=now() WHERE sandbox_id=$1 AND released_at IS NULL", [input.sandboxId]);
  } else {
    if (effect.kind === "pause") await query("UPDATE sandboxes SET status=$3, updated_at=now() WHERE id=$1 AND organization_id=$2", [input.sandboxId, input.organizationId, effect.context.previousStatus === "idle" ? "idle" : "running"]);
    await query("UPDATE sandbox_capacity_reservations SET phase='active', updated_at=now() WHERE sandbox_id=$1 AND released_at IS NULL", [input.sandboxId]);
  }
}, transaction);

const recoverProvision = async (effect: RuntimeEffect, dependencies: Dependencies & { query: Query; transaction: Transaction }) => {
  const { query, transaction, runtimeProvider } = dependencies;
  const operations = await query<SandboxOperation>(`${sandboxOperationSelect} WHERE id=$1 AND organization_id=$2`, [effect.operation_id, effect.organization_id]);
  const operation = operations.rows[0];
  if (!operation || operation.request.capacityProtocol !== 1) return false;
  let runtime: RuntimeSandboxSummary | null = null;
  if (effect.provider_id) runtime = await runtimeProvider.get({ provider: runtimeProvider.kind, providerSandboxId: effect.provider_id });
  else {
    const matches = (await runtimeProvider.list()).filter((item) => exactDispatchMatch(item, effect));
    if (matches.length > 1) {
      await transaction(async (q) => {
        await lockEffectSandbox(effect.organization_id, effect.sandbox_id, q);
        const owner = await q("SELECT id FROM sandbox_runtime_effects WHERE id=$1 AND generation=$2 AND settled_at IS NULL", [effect.id, effect.generation]);
        if (!owner.rowCount) throw new CapacityError("sandbox_transition_in_progress", "Inventory observation belongs to a settled operation.");
        await q("UPDATE organizations SET capacity_state='quarantined' WHERE id=$1", [effect.organization_id]);
        await q("UPDATE sandbox_capacity_reservations SET phase='uncertain', reason='duplicate_runtime_identity', updated_at=now() WHERE sandbox_id=$1 AND released_at IS NULL", [effect.sandbox_id]);
      });
      return false;
    }
    runtime = matches[0] ?? null;
    // Provider listing is positive evidence only; an empty/partial list is not absence.
    if (!runtime) return false;
  }
  if (!runtime && !effect.acknowledged_at) return false;
  if (runtime && !effect.provider_id) await acknowledgeRuntimeEffect(effect, query, runtime.providerSandboxId);
  const recovered = { ...effect, provider_id: runtime?.providerSandboxId ?? effect.provider_id };
  if (runtimeIsAbsent(runtimeProvider, runtime)) {
    await finishRuntimeEffect(recovered, async (q) => {
      await persistSandboxTermination({ organizationId: effect.organization_id, sandboxId: effect.sandbox_id }, q);
      await releaseSandboxCapacity({ organizationId: effect.organization_id, sandboxId: effect.sandbox_id, generation: effect.generation, reason: "provider_absent" }, q);
      await failSandboxOperation({ operationId: operation.id, error: "The runtime disappeared before provisioning completed." }, q);
    }, transaction);
    return true;
  }
  if (!runtime) return false;
  const observed = runtime;
  const cleanup = await finishRuntimeEffect(recovered, async (q) => {
    const persisted = await q("UPDATE sandboxes SET opensandbox_id=$3, status=$4, started_at=COALESCE(started_at,now()), provider_expires_at=$5, expires_at=COALESCE(expires_at,LEAST($5::timestamptz,now()+make_interval(secs=>ttl_seconds::int))), updated_at=now() WHERE id=$1 AND organization_id=$2 AND (opensandbox_id IS NULL OR opensandbox_id=$3)", [effect.sandbox_id, effect.organization_id, observed.providerSandboxId, operation.request.nonReplayable === true ? "error" : normalizeRuntimeState(observed.state) ?? "pending", observed.expiresAt ?? null]);
    if (persisted.rowCount !== 1) throw new CapacityError("sandbox_transition_in_progress", "Sandbox identity changed before recovery.");
    if (operation.request.nonReplayable === true) {
      await failSandboxOperation({ operationId: operation.id, error: "Credential-bearing creation was interrupted; cleanup requested without replaying credentials." }, q);
      const deletion = await beginRuntimeEffect({ organizationId: effect.organization_id, sandboxId: effect.sandbox_id, kind: "delete", context: { failedProvisionOperationId: operation.id } }, q);
      await q("UPDATE sandbox_capacity_reservations SET phase='releasing', reason='interrupted_credential_create', updated_at=now() WHERE sandbox_id=$1 AND generation=$2 AND released_at IS NULL", [effect.sandbox_id, effect.generation]);
      return deletion;
    }
    await q("UPDATE sandbox_capacity_reservations SET phase=$3, reason=NULL, updated_at=now() WHERE sandbox_id=$1 AND generation=$2 AND released_at IS NULL", [effect.sandbox_id, effect.generation, ["running", "idle"].includes(normalizeRuntimeState(observed.state) ?? "") ? "active" : "reserved"]);
    const completed = await completeSandboxOperation({ operationId: operation.id, expectedAttempts: operation.attempts, reconciled: true, result: { providerSandboxId: observed.providerSandboxId, reconciled: true } }, q);
    if (!completed) throw new CapacityError("sandbox_transition_in_progress", "Provision operation changed before recovery.");
    return null;
  }, transaction);
  if (cleanup) await executeRuntimeDeletion(cleanup, dependencies);
  return true;
};

export const reconcileSandboxCapacity = async (dependencies: Dependencies) => {
  const query = dependencies.query ?? defaultQuery;
  const transaction = dependencies.transaction ?? defaultTransaction;
  const deps = { ...dependencies, query, transaction };
  const staleAfterMs = Math.max(0, dependencies.staleAfterMs ?? 300_000);
  const limit = Math.max(1, Math.min(200, dependencies.limit ?? 50));
  const candidates = await query<Candidate>(`WITH due_candidates AS MATERIALIZED (
      SELECT sandbox_id, generation, next_check_at FROM (
        SELECT sandbox_id, generation, next_check_at FROM sandbox_capacity_reservations
        WHERE released_at IS NULL AND next_check_at <= statement_timestamp()
          AND ($2::uuid IS NULL OR organization_id=$2)
        UNION ALL
        SELECT r.sandbox_id, r.generation, r.next_check_at FROM sandbox_runtime_effects e
        JOIN sandbox_capacity_reservations r ON r.sandbox_id=e.sandbox_id AND r.generation=e.generation
        WHERE e.settled_at IS NULL AND r.released_at IS NOT NULL AND r.next_check_at <= statement_timestamp()
          AND ($2::uuid IS NULL OR r.organization_id=$2)
      ) candidates ORDER BY next_check_at, sandbox_id LIMIT ($1 * 2)
    ), due AS (
      SELECT r.sandbox_id, r.generation FROM due_candidates candidates
      JOIN LATERAL (
        SELECT r.sandbox_id, r.generation FROM sandbox_capacity_reservations r
        WHERE r.sandbox_id=candidates.sandbox_id AND r.generation=candidates.generation
          AND r.next_check_at <= statement_timestamp()
        FOR UPDATE SKIP LOCKED
      ) r ON true LIMIT $1
    ) UPDATE sandbox_capacity_reservations r SET next_check_at=clock_timestamp()+interval '30 seconds', checked_at=clock_timestamp()
      FROM due WHERE r.sandbox_id=due.sandbox_id AND r.generation=due.generation RETURNING r.*`, [limit, dependencies.organizationId ?? null]);
  const report = { checked: candidates.rows.length, recovered: 0, unresolved: 0, failed: 0 };
  for (const hold of candidates.rows) {
    try {
      if (hold.reason === "legacy_inventory") { report.unresolved++; continue; }
      const result = await query<RuntimeEffect & { updated_at: Date }>("SELECT * FROM sandbox_runtime_effects WHERE sandbox_id=$1 AND generation=$2 AND settled_at IS NULL", [hold.sandbox_id, hold.generation]);
      const effect = result.rows[0];
      const input = { organizationId: hold.organization_id, sandboxId: hold.sandbox_id };
      if (!effect) {
        const sandbox = await query<{ opensandbox_id: string | null }>("SELECT opensandbox_id FROM sandboxes WHERE id=$1 AND organization_id=$2", [hold.sandbox_id, hold.organization_id]);
        if (sandbox.rows[0]?.opensandbox_id) await reconcileSandboxLease(input, deps);
        else if (Date.now() - new Date(hold.updated_at).getTime() >= staleAfterMs) {
          const operation = await query<{ state: string; request: Record<string, unknown> }>("SELECT state, request FROM sandbox_operations WHERE id=$1", [hold.operation_id]);
          if (operation.rows[0]?.state === "failed" || operation.rows[0]?.request.nonReplayable === true) await requestSandboxTermination(input, deps);
        }
        continue;
      }
      const stale = Date.now() - new Date(effect.updated_at).getTime() >= staleAfterMs;
      if (!effect.dispatched_at) {
        if (stale) { await cancelUndispatchedEffect(effect, transaction); report.recovered++; }
        continue;
      }
      if (effect.kind === "provision") {
        if (stale && await recoverProvision(effect, deps)) report.recovered++;
        else report.unresolved++;
        continue;
      }
      if (!effect.provider_id) { report.unresolved++; continue; }
      const runtime = await dependencies.runtimeProvider.get({ provider: dependencies.runtimeProvider.kind, providerSandboxId: effect.provider_id });
      if (effect.kind === "delete" && runtimeIsAbsent(dependencies.runtimeProvider, runtime)) {
        await finishRuntimeDeletion(effect, transaction); report.recovered++;
      } else if (runtime && dependencies.runtimeProvider.capabilities.authoritativeLifecycle &&
          ((effect.kind === "pause" && normalizeRuntimeState(runtime.state) === "paused") ||
           (effect.kind === "resume" && ["running", "idle"].includes(normalizeRuntimeState(runtime.state) ?? "")))) {
        await completeLifecycleEffect(effect, runtime, {
          ...deps, recordEvent: recordSandboxEvent(query),
          recordAudit: (organizationId, actorUserId, actorLabel, action, targetType, targetId, metadata) =>
            recordAuditEvent({ organizationId, actorUserId, actorLabel, action, targetType, targetId, metadata }, { query })
        }); report.recovered++;
      } else if (effect.kind === "renew" && runtime && dependencies.runtimeProvider.capabilities.authoritativeLifecycle &&
          new Date(runtime.expiresAt ?? "").getTime() >= new Date(String(effect.context.expiresAt)).getTime()) {
        await finishRuntimeRenewal(effect, transaction); report.recovered++;
      } else report.unresolved++;
    } catch (error) {
      if (error instanceof CapacityError && error.code === "sandbox_transition_in_progress") continue;
      report.failed++;
    }
  }
  return report;
};
