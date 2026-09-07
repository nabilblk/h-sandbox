import { transaction as defaultTransaction, type Transaction } from "../db.js";
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
export type LeaseDependencies = { runtimeProvider: RuntimeProvider; transaction?: Transaction };

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
  if (value.includes("delete") || value.includes("terminat") || value.includes("stopped")) return "terminated";
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
) => (dependencies.transaction ?? defaultTransaction)(async (query) => {
  const row = await lockSandbox(query, input);
  if (!row) throw new SandboxLeaseError("sandbox_not_found");
  if (input.operation) {
    const result = await query<SandboxOperation>(`${sandboxOperationSelect} WHERE id = $1 FOR UPDATE`, [input.operation.id]);
    const operation = result.rows[0];
    if (operation?.sandboxId !== input.sandboxId || operation.organizationId !== input.organizationId) {
      throw new SandboxLeaseError("idempotency_conflict");
    }
    if (operation.state === "succeeded") return operation.result;
    if (operation.state !== "running" || operation.attempts !== input.operation.attempts) {
      throw new SandboxLeaseError("renew_in_progress");
    }
  }
  if (!renewable(row.status) || !row.opensandbox_id) throw new SandboxLeaseError("sandbox_not_running");
  const ref = { provider: dependencies.runtimeProvider.kind, providerSandboxId: row.opensandbox_id };
  const runtime = await dependencies.runtimeProvider.get(ref);
  if (!runtime || !renewable(normalizeRuntimeState(runtime.state))) throw new SandboxLeaseError("sandbox_not_running");
  const now = await databaseNow(query);
  const expiresAt = new Date(Math.max(
    now + row.ttl_seconds * 1000,
    effectiveDeadline(row, timestamp(runtime.expiresAt)) || 0
  )).toISOString();
  await dependencies.runtimeProvider.renew(ref, { expiresAt });
  await persistDeadline(query, input, expiresAt, expiresAt, true);
  const result = { providerSandboxId: row.opensandbox_id, expiresAt };
  if (input.operation) await completeSandboxOperation({ operationId: input.operation.id, result }, query);
  return result;
});

const terminate = async (query: Query, input: SandboxIdentity, expired: boolean) => {
  await query("UPDATE sandboxes SET status = 'terminated', updated_at = clock_timestamp() WHERE id = $1", [input.sandboxId]);
  await query(
    `UPDATE sandbox_routes SET state = 'terminated', terminated_at = COALESCE(terminated_at, now()), updated_at = now()
     WHERE sandbox_id = $1 AND state <> 'terminated'`, [input.sandboxId]
  );
  await query("UPDATE sandbox_schedules SET completed_at = now() WHERE sandbox_id = $1 AND completed_at IS NULL", [input.sandboxId]);
  if (expired) await query(
    `INSERT INTO sandbox_events (sandbox_id, organization_id, type, message)
     VALUES ($1, $2, 'ttl', 'idle ttl exceeded; sandbox terminated; persistent workspace storage retained')`,
    [input.sandboxId, input.organizationId]
  );
};

export const reconcileSandboxLease = async (
  input: SandboxIdentity & { expire?: boolean },
  dependencies: LeaseDependencies
) => (dependencies.transaction ?? defaultTransaction)(async (query) => {
  const row = await lockSandbox(query, input);
  if (!row || !row.opensandbox_id || !["running", "idle", "pending"].includes(row.status)) return;
  const now = await databaseNow(query);
  // A selected schedule is only a hint. A concurrent renewal may already have won.
  if (input.expire && (!Number.isFinite(timestamp(row.expires_at)) || timestamp(row.expires_at) > now)) return;
  const ref = { provider: dependencies.runtimeProvider.kind, providerSandboxId: row.opensandbox_id };
  const runtime = await dependencies.runtimeProvider.get(ref);
  const status = runtime ? normalizeRuntimeState(runtime.state) : "terminated";
  if (status === "terminated") {
    await terminate(query, input, timestamp(row.expires_at) <= now);
    return;
  }
  if (!status) return;
  if (status !== row.status) await query(
    "UPDATE sandboxes SET status = $2, updated_at = clock_timestamp() WHERE id = $1", [input.sandboxId, status]
  );
  const providerDeadline = timestamp(runtime?.expiresAt);
  const deadline = effectiveDeadline(row, providerDeadline);
  if (Number.isFinite(providerDeadline)) {
    await persistDeadline(query, input, new Date(deadline).toISOString(), new Date(providerDeadline).toISOString());
  }
  if (!input.expire || !["running", "idle", "pending"].includes(status)) return;
  // Recover a native renewal that succeeded before a failed control-plane commit.
  // Without a provider deadline, do not delete on potentially stale local evidence.
  if (!Number.isFinite(providerDeadline) || deadline > await databaseNow(query)) return;
  await dependencies.runtimeProvider.delete(ref);
  await terminate(query, input, true);
});
