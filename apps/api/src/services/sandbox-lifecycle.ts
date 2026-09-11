import {
  sandboxSnapshotStatuses,
  sandboxStatuses,
  type CreateSandboxSnapshotBody,
  type SandboxSnapshotStatus,
  type SandboxSnapshotSummary,
  type SandboxStatus,
  type SandboxSummary
} from "@harakiri/shared";
import { makeId } from "../crypto.js";
import { query as defaultQuery, transaction as defaultTransaction, type Transaction } from "../db.js";
import { CapacityError, reserveSandboxCapacity, releaseSandboxCapacity } from "./organization-capacity.js";
import { acknowledgeRuntimeEffect, beginRuntimeEffect, finishRuntimeEffect, lockEffectSandbox, markRuntimeEffectDispatched, markRuntimeEffectUncertain, type RuntimeEffect } from "./sandbox-runtime-effects.js";
import type {
  RuntimeProvider,
  RuntimeSandboxRef,
  RuntimeSandboxSummary,
  RuntimeSnapshotSummary
} from "../providers/runtime/provider.js";
import type { ExternalSecretResolverRegistry } from "../providers/secrets/provider.js";
import type { DynamicCredentialIssuerRegistry } from "../providers/credentials/provider.js";
import { getSandbox } from "./sandboxes.js";
import { WorkspaceError } from "./persistent-workspaces.js";
import {
  claimSandboxOperationById,
  completeSandboxOperation,
  enqueueSandboxOperation,
  failSandboxOperation,
  sandboxOperationSelect,
  type SandboxOperation
} from "./sandbox-operations.js";
import {
  getSandboxSnapshot,
  listSandboxSnapshots,
  mapSandboxSnapshotRow,
  sandboxSnapshotSelect,
  type SandboxSnapshotRow
} from "./sandbox-snapshots.js";
import {
  markSandboxCredentialsRequireReinjection,
  rehydrateSandboxCredentials,
  type RehydrateSandboxCredentialsResult
} from "./credential-vault.js";
import type { Query } from "./query.js";
import type { Audit, SandboxEventRecorder } from "./sandbox-runtime.js";
import type { DecryptWorkspaceCredentialSecret } from "./workspace-credential-secrets.js";

type LifecycleDependencies = {
  query?: Query;
  transaction?: Transaction;
  waitTimeoutMs?: number;
  runtimeProvider: RuntimeProvider;
  recordEvent: SandboxEventRecorder;
  recordAudit: Audit;
  idFactory?: typeof makeId;
  decryptSecret?: DecryptWorkspaceCredentialSecret;
  externalSecretResolvers?: ExternalSecretResolverRegistry;
  dynamicCredentialIssuers?: DynamicCredentialIssuerRegistry;
};

type SnapshotDependencies = LifecycleDependencies;
type LifecycleAction = "pause" | "resume";

type LifecycleSandboxRow = {
  id: string;
  workspaceId?: string | null;
  opensandboxId: string | null;
  status: string;
  template: string;
  templateVersionId: string | null;
  templateImageDigest: string | null;
};

const runtimeRef = (runtimeProvider: RuntimeProvider, providerSandboxId: string | null | undefined): RuntimeSandboxRef => ({
  provider: runtimeProvider.kind,
  providerSandboxId: providerSandboxId ?? ""
});

const providerErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

const normalizeSandboxStatus = (status: string): SandboxStatus => {
  const normalized = status.trim().replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
  if (normalized === "stopped" || normalized === "deleted") return "terminated";
  if (normalized === "failed") return "error";
  return sandboxStatuses.includes(normalized as SandboxStatus) ? normalized as SandboxStatus : "error";
};

const normalizeSnapshotStatus = (status: string): SandboxSnapshotStatus => {
  const normalized = status.trim().replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
  return sandboxSnapshotStatuses.includes(normalized as SandboxSnapshotStatus) ? normalized as SandboxSnapshotStatus : "failed";
};

const snapshotResponseStatus = (snapshot: SandboxSnapshotSummary) =>
  snapshot.status === "ready" ? "created" as const : "pending" as const;

const snapshotCreationResult = (
  snapshot: SandboxSnapshotSummary,
  operation: SandboxOperation
): CreateSandboxSnapshotResult =>
  snapshotResponseStatus(snapshot) === "created"
    ? { kind: "ok", snapshot, operation }
    : { kind: "pending", snapshot, operation, message: "snapshot creation is still pending" };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const waitForRuntimeSandboxState = async (
  dependencies: LifecycleDependencies,
  ref: RuntimeSandboxRef,
  initial: RuntimeSandboxSummary,
  expected: SandboxStatus[],
  timeoutMs = 120_000
) => {
  let latest = initial;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = normalizeSandboxStatus(latest.state);
    if (expected.includes(status)) return latest;
    await sleep(1_000);
    const current = await dependencies.runtimeProvider.get(ref);
    if (!current) return latest;
    latest = current;
  }
  return latest;
};

const getLifecycleSandboxRow = async (
  input: { organizationId: string; sandboxId: string },
  query: Query
) => {
  const result = await query<LifecycleSandboxRow>(
    `SELECT id,
            workspace_id AS "workspaceId",
            opensandbox_id AS "opensandboxId",
            status,
            template_id AS template,
            template_version_id AS "templateVersionId",
            template_image_digest AS "templateImageDigest"
     FROM sandboxes
     WHERE id = $1 AND organization_id = $2
     LIMIT 1`,
    [input.sandboxId, input.organizationId]
  );
  return result.rows[0] ?? null;
};

export type SandboxLifecycleResult =
  | { kind: "ok"; sandbox: SandboxSummary; operation: SandboxOperation }
  | { kind: "sandbox_not_found" }
  | { kind: "sandbox_invalid_state"; state: string; allowed: string[] }
  | { kind: "runtime_lifecycle_unsupported"; capability: LifecycleAction }
  | { kind: "runtime_provider_failed"; message: string; operation?: SandboxOperation };

type LifecycleSpec = {
  kind: LifecycleAction;
  idleStates: string[];
  allowedStates: string[];
  transitionStatus: "pausing" | "resuming";
  expectedStatuses: SandboxStatus[];
  auditAction: "sandbox.pause" | "sandbox.resume";
  eventType: (status: SandboxStatus) => string;
  callProvider: (provider: RuntimeProvider, ref: RuntimeSandboxRef) => Promise<RuntimeSandboxSummary>;
};

const pauseSpec: LifecycleSpec = {
  kind: "pause",
  idleStates: ["paused", "pausing"],
  allowedStates: ["running", "idle"],
  transitionStatus: "pausing",
  expectedStatuses: ["paused"],
  auditAction: "sandbox.pause",
  eventType: (status) => status === "paused" ? "paused" : status,
  callProvider: (provider, ref) => provider.pause!(ref)
};

const resumeSpec: LifecycleSpec = {
  kind: "resume",
  idleStates: ["running", "idle", "resuming"],
  allowedStates: ["paused"],
  transitionStatus: "resuming",
  expectedStatuses: ["running", "idle"],
  auditAction: "sandbox.resume",
  eventType: (status) => status === "running" ? "resumed" : status,
  callProvider: (provider, ref) => provider.resume!(ref)
};

export const pauseSandbox = (
  input: { organizationId: string; userId: string | null; actorLabel: string; sandboxId: string; idempotencyKey?: string | null },
  dependencies: LifecycleDependencies
) => changeSandboxLifecycle(input, dependencies, pauseSpec);

export const resumeSandbox = (
  input: { organizationId: string; userId: string | null; actorLabel: string; sandboxId: string; idempotencyKey?: string | null },
  dependencies: LifecycleDependencies
) => changeSandboxLifecycle(input, dependencies, resumeSpec);

const changeSandboxLifecycle = async (
  input: { organizationId: string; userId: string | null; actorLabel: string; sandboxId: string; idempotencyKey?: string | null },
  dependencies: LifecycleDependencies,
  spec: LifecycleSpec
): Promise<SandboxLifecycleResult> => {
  const query = dependencies.query ?? defaultQuery;
  const transaction = dependencies.transaction ?? defaultTransaction;
  if (!dependencies.runtimeProvider[spec.kind]) return { kind: "runtime_lifecycle_unsupported", capability: spec.kind };
  if (!await getLifecycleSandboxRow(input, query)) return { kind: "sandbox_not_found" };
  const admission = await transaction(async (q) => {
    const row = await lockEffectSandbox(input.organizationId, input.sandboxId, q);
    if (input.idempotencyKey) {
      const found = await q<SandboxOperation>(`${sandboxOperationSelect} WHERE organization_id=$1 AND kind=$2 AND idempotency_key=$3`, [input.organizationId, spec.kind, input.idempotencyKey]);
      if (found.rows[0]) {
        if (found.rows[0].sandboxId !== input.sandboxId) throw new CapacityError("idempotency_conflict", "This key belongs to another sandbox.");
        return { operation: found.rows[0], effect: null };
      }
    }
    if (spec.idleStates.includes(row.status)) return { operation: await lastNoopOperation(input, spec.kind, q), effect: null };
    if (!spec.allowedStates.includes(row.status) || !row.opensandbox_id) return { invalidState: row.status };
    const busy = await q("SELECT id FROM sandbox_runtime_effects WHERE sandbox_id=$1 AND settled_at IS NULL", [input.sandboxId]);
    if (busy.rows.length) throw new CapacityError("sandbox_transition_in_progress", "Another runtime operation is still in progress.");
    const { operation: queued } = await enqueueSandboxOperation({
      ...input, kind: spec.kind, request: { providerSandboxId: row.opensandbox_id, capacityProtocol: 1 }
    }, { query: q, idFactory: dependencies.idFactory });
    if (spec.kind === "resume") {
      const held = await q("SELECT generation FROM sandbox_capacity_reservations WHERE sandbox_id=$1 AND released_at IS NULL", [input.sandboxId]);
      if (held.rows.length) {
        // Providers without a suspension guarantee keep their existing execution slot.
        await q("UPDATE sandbox_capacity_reservations SET operation_id=$2, phase='reserved', reason=NULL, updated_at=now() WHERE sandbox_id=$1 AND released_at IS NULL", [input.sandboxId, queued.id]);
      } else await reserveSandboxCapacity({ ...input, operationId: queued.id }, q);
    }
    const operation = await claimSandboxOperationById({ operationId: queued.id, kinds: [spec.kind] }, q);
    if (!operation) throw new CapacityError("sandbox_transition_in_progress", "Another worker owns this transition.");
    const effect = await beginRuntimeEffect({ ...input, kind: spec.kind, operation, context: { userId: input.userId, actorLabel: input.actorLabel, previousStatus: row.status } }, q);
    await q("UPDATE sandboxes SET status=$3, updated_at=now() WHERE id=$1 AND organization_id=$2", [input.sandboxId, input.organizationId, spec.transitionStatus]);
    return { operation, effect };
  });
  if ("invalidState" in admission) return { kind: "sandbox_invalid_state", state: admission.invalidState!, allowed: spec.allowedStates };
  const { effect, operation } = admission;
  if (effect) {
    try {
      await markRuntimeEffectDispatched(effect, query);
      const ref = runtimeRef(dependencies.runtimeProvider, effect.provider_id);
      const requested = await spec.callProvider(dependencies.runtimeProvider, ref);
      await acknowledgeRuntimeEffect(effect, query);
      const observed = await waitForRuntimeSandboxState(dependencies, ref, requested, spec.expectedStatuses, dependencies.waitTimeoutMs ?? 2_000);
      if (spec.expectedStatuses.includes(normalizeSandboxStatus(observed.state))) {
        await completeLifecycleEffect(effect, observed, dependencies);
      }
    } catch {
      await markRuntimeEffectUncertain(effect, transaction);
      return { kind: "runtime_provider_failed", message: "The runtime transition could not be confirmed. Its execution slot remains reserved.", operation };
    }
  }
  const sandbox = await getSandbox(input, { query, runtimeProvider: dependencies.runtimeProvider });
  return sandbox ? { kind: "ok", sandbox, operation } : { kind: "sandbox_not_found" };
};

export const completeLifecycleEffect = async (
  effect: RuntimeEffect, provider: RuntimeSandboxSummary, dependencies: LifecycleDependencies
) => {
  const spec = effect.kind === "pause" ? pauseSpec : resumeSpec;
  const status = normalizeSandboxStatus(provider.state);
  if (!spec.expectedStatuses.includes(status)) return;
  const input = {
    organizationId: effect.organization_id, sandboxId: effect.sandbox_id,
    userId: typeof effect.context.userId === "string" ? effect.context.userId : null,
    actorLabel: typeof effect.context.actorLabel === "string" ? effect.context.actorLabel : "system"
  };
  const marked = await finishRuntimeEffect(effect, async (query) => {
    await query("UPDATE sandboxes SET status=$3, last_active_at=now(), updated_at=now() WHERE id=$1 AND organization_id=$2", [input.sandboxId, input.organizationId, status]);
    if (spec.kind === "pause" && dependencies.runtimeProvider.capabilities.pauseStopsExecution) {
      await releaseSandboxCapacity({ ...input, generation: effect.generation, reason: "provider_suspended" }, query);
    } else {
      await query("UPDATE sandbox_capacity_reservations SET phase='active', reason=NULL, updated_at=now() WHERE sandbox_id=$1 AND generation=$2 AND released_at IS NULL", [input.sandboxId, effect.generation]);
    }
    const credentials = spec.kind === "resume" ? await markSandboxCredentialsRequireReinjection(input, query) : 0;
    if (effect.operation_id) await completeSandboxOperation({
      operationId: effect.operation_id, reconciled: true,
      expectedAttempts: typeof effect.context.operationAttempt === "number" ? effect.context.operationAttempt : undefined,
      result: { provider: provider.provider, providerSandboxId: provider.providerSandboxId, state: provider.state }
    }, query);
    return credentials;
  }, dependencies.transaction);
  // Re-injection can make provider calls and must not hold the organization's admission lock.
  let rehydrated: RehydrateSandboxCredentialsResult | null = null;
  if (marked) {
    try {
      rehydrated = await rehydrateSandboxCredentials({
        ...input, actorUserId: input.userId
      }, { ...dependencies, sourceAccess: "system" });
    } catch { /* Durable needs-reinjection state remains visible for recovery. */ }
  }
  await dependencies.recordEvent(input.organizationId, input.sandboxId, spec.eventType(status), `sandbox ${status}`, { operationId: effect.operation_id, ...credentialMetadata(marked, rehydrated) });
  await dependencies.recordAudit(input.organizationId, input.userId, input.actorLabel, spec.auditAction, "sandbox", input.sandboxId, { operationId: effect.operation_id, ...credentialMetadata(marked, rehydrated) });
};

const credentialMetadata = (
  marked: number,
  rehydration: RehydrateSandboxCredentialsResult | null
): Record<string, unknown> => {
  if (!marked) return {};
  if (!rehydration) return { credentialsNeedingReinjection: marked };
  if (rehydration.kind !== "ok") {
    return { credentialsNeedingReinjection: marked, credentialRehydrationStatus: rehydration.kind };
  }
  return {
    credentialsNeedingReinjection: marked,
    credentialsRehydrated: rehydration.rehydrated,
    credentialsRehydrateSkipped: rehydration.skipped,
    credentialsRehydrateFailed: rehydration.failed
  };
};


const lastNoopOperation = async (
  input: { organizationId: string; sandboxId: string },
  kind: "pause" | "resume",
  query: Query
): Promise<SandboxOperation> => {
  const existing = await query<SandboxOperation>(
    `${sandboxOperationSelect}
     WHERE organization_id = $1 AND sandbox_id = $2 AND kind = $3
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.organizationId, input.sandboxId, kind]
  );
  return existing.rows[0] ?? {
    id: "op_noop",
    organizationId: input.organizationId,
    sandboxId: input.sandboxId,
    kind,
    state: "succeeded",
    idempotencyKey: null,
    request: {},
    result: {},
    error: null,
    attempts: 0,
    lockedAt: null,
    startedAt: null,
    completedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
};

export type CreateSandboxSnapshotResult =
  | { kind: "ok"; snapshot: SandboxSnapshotSummary; operation: SandboxOperation }
  | { kind: "pending"; snapshot: SandboxSnapshotSummary; operation: SandboxOperation; message: string }
  | { kind: "sandbox_not_found" }
  | { kind: "sandbox_invalid_state"; state: string; allowed: string[] }
  | { kind: "runtime_lifecycle_unsupported"; capability: "snapshot" }
  | { kind: "runtime_provider_failed"; snapshot: SandboxSnapshotSummary | null; message: string; operation: SandboxOperation };

export const createSandboxSnapshot = async (
  input: {
    organizationId: string;
    userId: string | null;
    actorLabel: string;
    sandboxId: string;
  } & CreateSandboxSnapshotBody,
  dependencies: SnapshotDependencies
): Promise<CreateSandboxSnapshotResult> => {
  const query = dependencies.query ?? defaultQuery;
  if (!dependencies.runtimeProvider.createSnapshot) return { kind: "runtime_lifecycle_unsupported", capability: "snapshot" };
  const existing = await existingSnapshotCreationResult(input, query);
  if (existing) return existing;
  const sandbox = await getLifecycleSandboxRow(input, query);
  if (!sandbox) return { kind: "sandbox_not_found" };
  if (sandbox.workspaceId) throw new WorkspaceError("workspace_snapshot_unsupported", 409, "Snapshots of workspace-backed sandboxes are not supported. Back up the persistent volume separately.");
  if (!["running", "idle", "paused"].includes(sandbox.status)) {
    return { kind: "sandbox_invalid_state", state: sandbox.status, allowed: ["running", "idle", "paused"] };
  }
  return createNewSandboxSnapshot(input, dependencies, sandbox, query);
};

const existingSnapshotCreationResult = async (
  input: { organizationId: string; sandboxId: string; idempotencyKey?: string | null },
  query: Query
) => {
  if (!input.idempotencyKey) return null;
  const existing = await query<SandboxSnapshotRow>(
    `${sandboxSnapshotSelect}
     WHERE organization_id = $1
       AND idempotency_key = $2
       AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.organizationId, input.idempotencyKey]
  );
  if (!existing.rowCount) return null;
  const snapshot = mapSandboxSnapshotRow(existing.rows[0]);
  const operation = await snapshotOperationForIdempotency(input, query);
  return snapshotCreationResult(snapshot, operation);
};

const snapshotOperationForIdempotency = async (
  input: { organizationId: string; sandboxId: string; idempotencyKey?: string | null },
  query: Query
) => {
  const result = await query<SandboxOperation>(
    `${sandboxOperationSelect}
     WHERE organization_id = $1
       AND kind = 'snapshot'
       AND idempotency_key = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.organizationId, input.idempotencyKey]
  );
  return result.rows[0] ?? lastSnapshotNoopOperation(input);
};

const createNewSandboxSnapshot = async (
  input: { organizationId: string; userId: string | null; actorLabel: string; sandboxId: string } & CreateSandboxSnapshotBody,
  dependencies: SnapshotDependencies,
  sandbox: LifecycleSandboxRow,
  query: Query
): Promise<CreateSandboxSnapshotResult> => {
  const snapshotId = (dependencies.idFactory ?? makeId)("snp", 10);
  await insertCreatingSnapshot(input, dependencies, sandbox, snapshotId, query);
  const operation = await claimSnapshotCreateOperation(input, dependencies, sandbox, snapshotId, query);
  try {
    return await createProviderSnapshot(input, dependencies, snapshotId, sandbox, operation, query);
  } catch (error) {
    return failCreatedSnapshot(input, snapshotId, operation, query, error);
  }
};

const insertCreatingSnapshot = (
  input: { organizationId: string; userId: string | null; actorLabel: string; sandboxId: string } & CreateSandboxSnapshotBody,
  dependencies: SnapshotDependencies,
  sandbox: LifecycleSandboxRow,
  snapshotId: string,
  query: Query
) => query(
    `INSERT INTO sandbox_snapshots
     (id, organization_id, source_sandbox_id, provider, name, status,
      template_id, template_version_id, template_image_digest,
      metadata, created_by_user_id, created_by_label, idempotency_key, expires_at)
     VALUES ($1, $2, $3, $4, $5, 'creating', $6, $7, $8, $9::jsonb, $10, $11, $12, $13::timestamptz)`,
    [
      snapshotId,
      input.organizationId,
      input.sandboxId,
      dependencies.runtimeProvider.kind,
      input.name?.trim() || null,
      sandbox.template,
      sandbox.templateVersionId,
      sandbox.templateImageDigest,
      JSON.stringify(input.metadata ?? {}),
      input.userId,
      input.actorLabel,
      input.idempotencyKey ?? null,
      input.expiresAt ?? null
    ]
  );

const claimSnapshotCreateOperation = async (
  input: { organizationId: string; sandboxId: string } & CreateSandboxSnapshotBody,
  dependencies: SnapshotDependencies,
  sandbox: LifecycleSandboxRow,
  snapshotId: string,
  query: Query
) => {
  const { operation } = await enqueueSandboxOperation(
    {
      organizationId: input.organizationId,
      sandboxId: input.sandboxId,
      kind: "snapshot",
      idempotencyKey: input.idempotencyKey,
      request: {
        sandboxId: input.sandboxId,
        snapshotId,
        providerSandboxId: sandbox.opensandboxId,
        name: input.name,
        expiresAt: input.expiresAt ?? null
      }
    },
    { query, idFactory: dependencies.idFactory }
  );
  return await claimSandboxOperationById({ operationId: operation.id, kinds: ["snapshot"] }, query) ?? operation;
};

const createProviderSnapshot = async (
  input: { organizationId: string; userId: string | null; actorLabel: string; sandboxId: string } & CreateSandboxSnapshotBody,
  dependencies: SnapshotDependencies,
  snapshotId: string,
  sandbox: LifecycleSandboxRow,
  operation: SandboxOperation,
  query: Query
): Promise<CreateSandboxSnapshotResult> => {
  const provider = await dependencies.runtimeProvider.createSnapshot!(providerSnapshotInput(input, dependencies, snapshotId, sandbox));
  await updateSnapshotFromProvider(snapshotId, input.organizationId, provider, query);
  const current = await currentSnapshotAfterCreate(input, dependencies, snapshotId, provider, query);
  if (["failed", "deleted", "expired"].includes(current.status)) {
    return failSnapshotCreateOperation(snapshotId, current, provider, operation, query);
  }
  return completeSnapshotCreate(input, dependencies, snapshotId, current, provider, operation, query);
};

const providerSnapshotInput = (
  input: { organizationId: string; sandboxId: string } & CreateSandboxSnapshotBody,
  dependencies: SnapshotDependencies,
  snapshotId: string,
  sandbox: LifecycleSandboxRow
) => ({
  ...runtimeRef(dependencies.runtimeProvider, sandbox.opensandboxId),
  name: input.name,
  metadata: {
    "harakiri.snapshot": snapshotId,
    "harakiri.sandbox": input.sandboxId,
    "harakiri.org": input.organizationId,
    ...(input.metadata ?? {})
  }
});

const currentSnapshotAfterCreate = async (
  input: { organizationId: string } & CreateSandboxSnapshotBody,
  dependencies: SnapshotDependencies,
  snapshotId: string,
  provider: RuntimeSnapshotSummary,
  query: Query
) => {
  if (!input.wait) {
    const current = await getSandboxSnapshot({ organizationId: input.organizationId, snapshotId }, query);
    if (!current) throw new Error("snapshot row missing after provider snapshot create");
    return current;
  }
  return waitForSnapshotReady(
    {
      organizationId: input.organizationId,
      snapshotId,
      providerSnapshotId: provider.providerSnapshotId,
      timeoutMs: input.waitTimeoutMs ?? 60_000
    },
    dependencies
  );
};

const failSnapshotCreateOperation = async (
  snapshotId: string,
  snapshot: SandboxSnapshotSummary,
  provider: RuntimeSnapshotSummary,
  operation: SandboxOperation,
  query: Query
): Promise<CreateSandboxSnapshotResult> => {
  const message = snapshot.statusMessage ?? snapshot.statusReason ?? `snapshot ${snapshot.status}`;
  const failed = await failSandboxOperation({
    operationId: operation.id,
    error: message,
    result: {
      snapshotId,
      provider: provider.provider,
      providerSnapshotId: provider.providerSnapshotId,
      state: snapshot.status
    }
  }, query);
  return { kind: "runtime_provider_failed", snapshot, message, operation: failed ?? operation };
};

const completeSnapshotCreate = async (
  input: { organizationId: string; userId: string | null; actorLabel: string; sandboxId: string },
  dependencies: SnapshotDependencies,
  snapshotId: string,
  snapshot: SandboxSnapshotSummary,
  provider: RuntimeSnapshotSummary,
  operation: SandboxOperation,
  query: Query
): Promise<CreateSandboxSnapshotResult> => {
  const completed = await completeSandboxOperation({
    operationId: operation.id,
    result: {
      snapshotId,
      provider: provider.provider,
      providerSnapshotId: provider.providerSnapshotId,
      state: snapshot.status
    }
  }, query) ?? operation;
  await recordSnapshotCreate(input, dependencies, snapshotId, snapshot, provider, operation);
  return snapshotCreationResult(snapshot, completed);
};

const recordSnapshotCreate = async (
  input: { organizationId: string; userId: string | null; actorLabel: string; sandboxId: string },
  dependencies: SnapshotDependencies,
  snapshotId: string,
  snapshot: SandboxSnapshotSummary,
  provider: RuntimeSnapshotSummary,
  operation: SandboxOperation
) => {
  await dependencies.recordEvent(input.organizationId, input.sandboxId, "snapshot.created", `snapshot ${snapshot.status}`, {
    operationId: operation.id,
    snapshotId,
    providerSnapshotId: provider.providerSnapshotId
  });
  await dependencies.recordAudit(input.organizationId, input.userId, input.actorLabel, "sandbox.snapshot", "sandbox", input.sandboxId, {
    operationId: operation.id,
    snapshotId
  });
};

const failCreatedSnapshot = async (
  input: { organizationId: string },
  snapshotId: string,
  operation: SandboxOperation,
  query: Query,
  error: unknown
): Promise<CreateSandboxSnapshotResult> => {
  const message = providerErrorMessage(error);
  await query(
    `UPDATE sandbox_snapshots
     SET status = 'failed',
         status_message = $3,
         updated_at = now()
     WHERE id = $1 AND organization_id = $2`,
    [snapshotId, input.organizationId, message]
  );
  const failed = await failSandboxOperation({ operationId: operation.id, error: message, result: { snapshotId } }, query);
  return {
    kind: "runtime_provider_failed",
    snapshot: await getSandboxSnapshot({ organizationId: input.organizationId, snapshotId, includeDeleted: true }, query),
    message,
    operation: failed ?? operation
  };
};

const updateSnapshotFromProvider = async (
  snapshotId: string,
  organizationId: string,
  provider: RuntimeSnapshotSummary,
  query: Query
) => {
  const status = normalizeSnapshotStatus(provider.state);
  await query(
    `UPDATE sandbox_snapshots
     SET provider_snapshot_id = $3,
         status = $4,
         status_reason = $5,
         status_message = $6,
         provider_state = $7::jsonb,
         updated_at = now()
     WHERE id = $1 AND organization_id = $2`,
    [
      snapshotId,
      organizationId,
      provider.providerSnapshotId,
      status,
      provider.reason ?? null,
      provider.message ?? null,
      JSON.stringify(provider.providerState ?? provider)
    ]
  );
};

const waitForSnapshotReady = async (
  input: { organizationId: string; snapshotId: string; providerSnapshotId: string; timeoutMs: number },
  dependencies: SnapshotDependencies
): Promise<SandboxSnapshotSummary> => {
  const query = dependencies.query ?? defaultQuery;
  if (!dependencies.runtimeProvider.getSnapshot) {
    const current = await getSandboxSnapshot({ organizationId: input.organizationId, snapshotId: input.snapshotId }, query);
    if (!current) throw new Error("snapshot row missing while waiting");
    return current;
  }
  const started = Date.now();
  let current: SandboxSnapshotSummary | null = null;
  while (Date.now() - started <= input.timeoutMs) {
    const provider = await dependencies.runtimeProvider.getSnapshot({
      provider: dependencies.runtimeProvider.kind,
      providerSnapshotId: input.providerSnapshotId
    });
    if (provider) await updateSnapshotFromProvider(input.snapshotId, input.organizationId, provider, query);
    current = await getSandboxSnapshot({ organizationId: input.organizationId, snapshotId: input.snapshotId }, query);
    if (current && ["ready", "failed", "deleted", "expired"].includes(String(current.status))) return current;
    await sleep(1_000);
  }
  current = await getSandboxSnapshot({ organizationId: input.organizationId, snapshotId: input.snapshotId }, query);
  if (!current) throw new Error("snapshot row missing after wait timeout");
  return current;
};

const lastSnapshotNoopOperation = (
  input: { organizationId: string; sandboxId: string }
): SandboxOperation => ({
  id: "op_noop",
  organizationId: input.organizationId,
  sandboxId: input.sandboxId,
  kind: "snapshot",
  state: "succeeded",
  idempotencyKey: null,
  request: {},
  result: {},
  error: null,
  attempts: 0,
  lockedAt: null,
  startedAt: null,
  completedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

export type DeleteSandboxSnapshotResult =
  | { kind: "ok"; snapshot: SandboxSnapshotSummary; operation: SandboxOperation }
  | { kind: "snapshot_not_found" }
  | { kind: "runtime_lifecycle_unsupported"; capability: "snapshot_delete" }
  | { kind: "runtime_provider_failed"; message: string; operation: SandboxOperation };

export const deleteSandboxSnapshot = async (
  input: { organizationId: string; userId: string | null; actorLabel: string; snapshotId: string; idempotencyKey?: string | null },
  dependencies: SnapshotDependencies
): Promise<DeleteSandboxSnapshotResult> => {
  const query = dependencies.query ?? defaultQuery;
  if (!dependencies.runtimeProvider.deleteSnapshot) return { kind: "runtime_lifecycle_unsupported", capability: "snapshot_delete" };
  const snapshot = await getDeletableSnapshot(input, query);
  if (!snapshot) return { kind: "snapshot_not_found" };
  const operation = await claimSnapshotDeleteOperation(input, dependencies, snapshot, query);
  try {
    return await deleteProviderSnapshot(input, dependencies, snapshot, operation, query);
  } catch (error) {
    return failSnapshotDelete(input, snapshot, operation, query, error);
  }
};

const getDeletableSnapshot = async (
  input: { organizationId: string; snapshotId: string },
  query: Query
) => {
  const result = await query<SandboxSnapshotRow>(
    `${sandboxSnapshotSelect}
     WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [input.snapshotId, input.organizationId]
  );
  return result.rows[0] ?? null;
};

const claimSnapshotDeleteOperation = async (
  input: { organizationId: string; snapshotId: string; idempotencyKey?: string | null },
  dependencies: SnapshotDependencies,
  snapshot: SandboxSnapshotRow,
  query: Query
) => {
  const { operation } = await enqueueSandboxOperation(
    {
      organizationId: input.organizationId,
      sandboxId: snapshot.sourceSandboxId,
      kind: "snapshot_delete",
      idempotencyKey: input.idempotencyKey,
      request: {
        snapshotId: input.snapshotId,
        providerSnapshotId: snapshot.providerSnapshotId
      }
    },
    { query, idFactory: dependencies.idFactory }
  );
  return await claimSandboxOperationById({ operationId: operation.id, kinds: ["snapshot_delete"] }, query) ?? operation;
};

const deleteProviderSnapshot = async (
  input: { organizationId: string; userId: string | null; actorLabel: string; snapshotId: string },
  dependencies: SnapshotDependencies,
  snapshot: SandboxSnapshotRow,
  operation: SandboxOperation,
  query: Query
): Promise<DeleteSandboxSnapshotResult> => {
  await markSnapshotDeleting(input, query);
  if (snapshot.providerSnapshotId) await dependencies.runtimeProvider.deleteSnapshot!({
    provider: dependencies.runtimeProvider.kind,
    providerSnapshotId: snapshot.providerSnapshotId
  });
  await markSnapshotDeleted(input, query);
  return finishSnapshotDelete(input, dependencies, snapshot, operation, query);
};

const markSnapshotDeleting = (
  input: { organizationId: string; snapshotId: string },
  query: Query
) => query("UPDATE sandbox_snapshots SET status = 'deleting', updated_at = now() WHERE id = $1 AND organization_id = $2", [input.snapshotId, input.organizationId]);

const markSnapshotDeleted = (
  input: { organizationId: string; snapshotId: string },
  query: Query
) => query(
  `UPDATE sandbox_snapshots
   SET status = 'deleted',
       deleted_at = COALESCE(deleted_at, now()),
       updated_at = now()
   WHERE id = $1 AND organization_id = $2`,
  [input.snapshotId, input.organizationId]
);

const finishSnapshotDelete = async (
  input: { organizationId: string; userId: string | null; actorLabel: string; snapshotId: string },
  dependencies: SnapshotDependencies,
  snapshot: SandboxSnapshotRow,
  operation: SandboxOperation,
  query: Query
): Promise<DeleteSandboxSnapshotResult> => {
  const completed = await completeSandboxOperation({
    operationId: operation.id,
    result: { snapshotId: input.snapshotId, providerSnapshotId: snapshot.providerSnapshotId }
  }, query);
  await dependencies.recordAudit(input.organizationId, input.userId, input.actorLabel, "snapshot.delete", "snapshot", input.snapshotId);
  const deleted = await getSandboxSnapshot({ organizationId: input.organizationId, snapshotId: input.snapshotId, includeDeleted: true }, query);
  if (!deleted) return { kind: "snapshot_not_found" };
  return { kind: "ok", snapshot: deleted, operation: completed ?? operation };
};

const failSnapshotDelete = async (
  input: { organizationId: string; snapshotId: string },
  snapshot: SandboxSnapshotRow,
  operation: SandboxOperation,
  query: Query,
  error: unknown
): Promise<DeleteSandboxSnapshotResult> => {
  const message = providerErrorMessage(error);
  await failSandboxOperation({ operationId: operation.id, error: message }, query);
  await query(
    "UPDATE sandbox_snapshots SET status = $3, updated_at = now() WHERE id = $1 AND organization_id = $2",
    [input.snapshotId, input.organizationId, snapshot.status]
  );
  return { kind: "runtime_provider_failed", message, operation };
};

export { getSandboxSnapshot, listSandboxSnapshots };
