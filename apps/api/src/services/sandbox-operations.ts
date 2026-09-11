import type { SandboxOperationKind, SandboxOperationState } from "@harakiri/shared";
import { makeId } from "../crypto.js";
import { query as defaultQuery } from "../db.js";
import { decryptSecretBox, encryptSecretBox, type EncryptedSecret } from "../secret-box.js";
import type { Query } from "./query.js";

export type SandboxOperation = {
  id: string;
  organizationId: string;
  sandboxId: string | null;
  kind: SandboxOperationKind;
  state: SandboxOperationState;
  idempotencyKey: string | null;
  request: Record<string, unknown>;
  result: Record<string, unknown>;
  error: string | null;
  attempts: number;
  lockedAt: Date | string | null;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type EnqueueSandboxOperationInput = {
  organizationId: string;
  sandboxId?: string | null;
  kind: SandboxOperationKind;
  request?: Record<string, unknown>;
  idempotencyKey?: string | null;
};

export type ClaimSandboxOperationInput = {
  kinds?: SandboxOperationKind[];
  maxAttempts?: number;
  staleAfterMs?: number;
};

export type SandboxOperationSecretName = "provision_env" | string;

export type SandboxOperationSecretRow = EncryptedSecret & {
  operationId: string;
  name: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export const sandboxOperationSelect = `
  SELECT id, organization_id AS "organizationId", sandbox_id AS "sandboxId",
         kind, state, idempotency_key AS "idempotencyKey", request, result,
         error, attempts, locked_at AS "lockedAt", started_at AS "startedAt",
         completed_at AS "completedAt", created_at AS "createdAt",
         updated_at AS "updatedAt"
  FROM sandbox_operations
`;

export const enqueueSandboxOperation = async (
  input: EnqueueSandboxOperationInput,
  dependencies: { query?: Query; idFactory?: typeof makeId } = {}
): Promise<{ operation: SandboxOperation; reused: boolean }> => {
  const query = dependencies.query ?? defaultQuery;
  if (input.idempotencyKey) {
    const existing = await query<SandboxOperation>(
      `${sandboxOperationSelect}
       WHERE organization_id = $1 AND kind = $2 AND idempotency_key = $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [input.organizationId, input.kind, input.idempotencyKey]
    );
    if (existing.rowCount) return { operation: existing.rows[0], reused: true };
  }

  const id = (dependencies.idFactory ?? makeId)("op", 12);
  const inserted = await query<SandboxOperation>(
    `INSERT INTO sandbox_operations
     (id, organization_id, sandbox_id, kind, state, idempotency_key, request)
     VALUES ($1, $2, $3, $4, 'queued', $5, $6)
     ON CONFLICT DO NOTHING
     RETURNING id, organization_id AS "organizationId", sandbox_id AS "sandboxId",
               kind, state, idempotency_key AS "idempotencyKey", request, result,
               error, attempts, locked_at AS "lockedAt", started_at AS "startedAt",
               completed_at AS "completedAt", created_at AS "createdAt",
               updated_at AS "updatedAt"`,
    [
      id,
      input.organizationId,
      input.sandboxId ?? null,
      input.kind,
      input.idempotencyKey ?? null,
      JSON.stringify(input.request ?? {})
    ]
  );
  if (!inserted.rows.length && input.idempotencyKey) {
    const existing = await query<SandboxOperation>(
      `${sandboxOperationSelect} WHERE organization_id = $1 AND kind = $2 AND idempotency_key = $3`,
      [input.organizationId, input.kind, input.idempotencyKey]
    );
    if (existing.rows[0]) return { operation: existing.rows[0], reused: true };
  }
  if (!inserted.rows[0]) throw new Error("sandbox operation could not be enqueued");
  return { operation: inserted.rows[0], reused: false };
};

export const storeSandboxOperationSecret = async (
  input: { operationId: string; name: SandboxOperationSecretName; value: string },
  dependencies: { query?: Query; encryptSecret?: typeof encryptSecretBox } = {}
) => {
  const query = dependencies.query ?? defaultQuery;
  const encrypted = (dependencies.encryptSecret ?? encryptSecretBox)(input.value);
  const result = await query<SandboxOperationSecretRow>(
    `INSERT INTO sandbox_operation_secrets
     (operation_id, name, secret_ciphertext, secret_iv, secret_tag)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (operation_id, name) DO UPDATE
       SET secret_ciphertext = EXCLUDED.secret_ciphertext,
           secret_iv = EXCLUDED.secret_iv,
           secret_tag = EXCLUDED.secret_tag,
           updated_at = now()
     RETURNING operation_id AS "operationId",
               name,
               secret_ciphertext AS "secretCiphertext",
               secret_iv AS "secretIv",
               secret_tag AS "secretTag",
               created_at AS "createdAt",
               updated_at AS "updatedAt"`,
    [input.operationId, input.name, encrypted.secretCiphertext, encrypted.secretIv, encrypted.secretTag]
  );
  return result.rows[0] ?? null;
};

export const readSandboxOperationSecret = async (
  input: { operationId: string; name: SandboxOperationSecretName },
  dependencies: { query?: Query; decryptSecret?: typeof decryptSecretBox } = {}
) => {
  const query = dependencies.query ?? defaultQuery;
  const result = await query<SandboxOperationSecretRow>(
    `SELECT operation_id AS "operationId",
            name,
            secret_ciphertext AS "secretCiphertext",
            secret_iv AS "secretIv",
            secret_tag AS "secretTag",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
     FROM sandbox_operation_secrets
     WHERE operation_id = $1 AND name = $2`,
    [input.operationId, input.name]
  );
  const row = result.rows[0];
  if (!row) return null;
  return (dependencies.decryptSecret ?? decryptSecretBox)({
    secretCiphertext: row.secretCiphertext,
    secretIv: row.secretIv,
    secretTag: row.secretTag
  });
};

export const startSandboxOperation = async (
  input: { operationId: string },
  query: Query = defaultQuery
) => {
  return claimSandboxOperationById(input, query);
};

export const claimSandboxOperationById = async (
  input: { operationId: string; kinds?: SandboxOperationKind[]; maxAttempts?: number },
  query: Query = defaultQuery
) => {
  const maxAttempts = Math.max(Math.trunc(input.maxAttempts ?? 3), 1);
  const params: unknown[] = [input.operationId, maxAttempts];
  let kindClause = "";
  if (input.kinds?.length) {
    params.push(input.kinds);
    kindClause = `AND kind = ANY($${params.length}::text[])`;
  }
  const updated = await query<SandboxOperation>(
    `UPDATE sandbox_operations
     SET state = 'running',
         attempts = attempts + 1,
         locked_at = now(),
         started_at = COALESCE(started_at, now()),
         completed_at = NULL,
         updated_at = now(),
         error = NULL
     WHERE id = $1
       AND state IN ('queued', 'failed')
       AND attempts < $2
       AND (request->>'dispatchReady') IS DISTINCT FROM 'false'
       AND NOT EXISTS (SELECT 1 FROM sandbox_runtime_effects e WHERE e.operation_id=sandbox_operations.id AND e.settled_at IS NULL)
       ${kindClause}
     RETURNING id, organization_id AS "organizationId", sandbox_id AS "sandboxId",
               kind, state, idempotency_key AS "idempotencyKey", request, result,
               error, attempts, locked_at AS "lockedAt", started_at AS "startedAt",
               completed_at AS "completedAt", created_at AS "createdAt",
               updated_at AS "updatedAt"`,
    params
  );
  return updated.rows[0] ?? null;
};

export const claimNextSandboxOperation = async (
  input: ClaimSandboxOperationInput = {},
  query: Query = defaultQuery
) => {
  const maxAttempts = Math.max(Math.trunc(input.maxAttempts ?? 3), 1);
  const staleAfterMs = Math.max(Math.trunc(input.staleAfterMs ?? 300_000), 1);
  const params: unknown[] = [maxAttempts, staleAfterMs];
  let kindClause = "";
  if (input.kinds?.length) {
    params.push(input.kinds);
    kindClause = `AND kind = ANY($${params.length}::text[])`;
  }
  const claimed = await query<SandboxOperation>(
    `WITH candidate AS (
       SELECT id
       FROM sandbox_operations
       WHERE state = 'queued'
         AND (request->>'nonReplayable') IS DISTINCT FROM 'true'
         AND (request->>'dispatchReady') IS DISTINCT FROM 'false'
         AND NOT EXISTS (SELECT 1 FROM sandbox_runtime_effects e WHERE e.operation_id=sandbox_operations.id AND e.settled_at IS NULL)
         AND attempts < $1
         AND (locked_at IS NULL OR locked_at < now() - ($2::double precision * interval '1 millisecond'))
         ${kindClause}
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE sandbox_operations op
     SET state = 'running',
         attempts = attempts + 1,
         locked_at = now(),
         started_at = COALESCE(started_at, now()),
         completed_at = NULL,
         updated_at = now(),
         error = NULL
     FROM candidate
     WHERE op.id = candidate.id
     RETURNING op.id,
               op.organization_id AS "organizationId",
               op.sandbox_id AS "sandboxId",
               op.kind,
               op.state,
               op.idempotency_key AS "idempotencyKey",
               op.request,
               op.result,
               op.error,
               op.attempts,
               op.locked_at AS "lockedAt",
               op.started_at AS "startedAt",
               op.completed_at AS "completedAt",
               op.created_at AS "createdAt",
               op.updated_at AS "updatedAt"`,
    params
  );
  return claimed.rows[0] ?? null;
};

export const claimStaleRunningSandboxOperation = async (
  input: ClaimSandboxOperationInput = {},
  query: Query = defaultQuery
) => {
  const staleAfterMs = Math.max(Math.trunc(input.staleAfterMs ?? 300_000), 1);
  const params: unknown[] = [staleAfterMs];
  let kindClause = "";
  if (input.kinds?.length) {
    params.push(input.kinds);
    kindClause = `AND kind = ANY($${params.length}::text[])`;
  }
  const claimed = await query<SandboxOperation>(
    `WITH candidate AS (
       SELECT id
       FROM sandbox_operations
       WHERE state = 'running'
         AND NOT EXISTS (SELECT 1 FROM sandbox_runtime_effects e WHERE e.operation_id=sandbox_operations.id AND e.settled_at IS NULL)
         AND locked_at < now() - ($1::double precision * interval '1 millisecond')
         ${kindClause}
       ORDER BY locked_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE sandbox_operations op
     SET locked_at = now(),
         updated_at = now()
     FROM candidate
     WHERE op.id = candidate.id
     RETURNING op.id,
               op.organization_id AS "organizationId",
               op.sandbox_id AS "sandboxId",
               op.kind,
               op.state,
               op.idempotency_key AS "idempotencyKey",
               op.request,
               op.result,
               op.error,
               op.attempts,
               op.locked_at AS "lockedAt",
               op.started_at AS "startedAt",
               op.completed_at AS "completedAt",
               op.created_at AS "createdAt",
               op.updated_at AS "updatedAt"`,
    params
  );
  return claimed.rows[0] ?? null;
};

export const completeSandboxOperation = async (
  input: { operationId: string; result?: Record<string, unknown>; expectedAttempts?: number; reconciled?: boolean },
  query: Query = defaultQuery
) => {
  const completed = await query<SandboxOperation>(
    `UPDATE sandbox_operations
     SET state = 'succeeded',
         error = NULL,
         result = $2::jsonb,
         completed_at = now(),
         locked_at = NULL,
         updated_at = now()
     WHERE id = $1
       AND ($3::int IS NULL OR ((state = 'running' OR ($4::boolean AND state = 'failed')) AND attempts = $3))
     RETURNING id, organization_id AS "organizationId", sandbox_id AS "sandboxId",
               kind, state, idempotency_key AS "idempotencyKey", request, result,
               error, attempts, locked_at AS "lockedAt", started_at AS "startedAt",
               completed_at AS "completedAt", created_at AS "createdAt",
               updated_at AS "updatedAt"`,
    [input.operationId, JSON.stringify(input.result ?? {}), input.expectedAttempts ?? null, input.reconciled ?? false]
  );
  return completed.rows[0] ?? null;
};

export const failSandboxOperation = async (
  input: { operationId: string; error: string; result?: Record<string, unknown>; expectedAttempts?: number },
  query: Query = defaultQuery
) => {
  const failed = await query<SandboxOperation>(
    `UPDATE sandbox_operations
     SET state = 'failed',
         error = $2,
         result = result || $3::jsonb,
         completed_at = now(),
         locked_at = NULL,
         updated_at = now()
     WHERE id = $1
       AND ($4::int IS NULL OR (state = 'running' AND attempts = $4))
     RETURNING id, organization_id AS "organizationId", sandbox_id AS "sandboxId",
               kind, state, idempotency_key AS "idempotencyKey", request, result,
               error, attempts, locked_at AS "lockedAt", started_at AS "startedAt",
               completed_at AS "completedAt", created_at AS "createdAt",
               updated_at AS "updatedAt"`,
    [input.operationId, input.error, JSON.stringify(input.result ?? {}), input.expectedAttempts ?? null]
  );
  return failed.rows[0] ?? null;
};

export const requeueSandboxOperation = async (
  input: { operationId: string; error: string; result?: Record<string, unknown>; expectedAttempts?: number },
  query: Query = defaultQuery
) => {
  const requeued = await query<SandboxOperation>(
    `UPDATE sandbox_operations
     SET state = 'queued',
         error = $2,
         result = result || $3::jsonb,
         locked_at = NULL,
         completed_at = NULL,
         updated_at = now()
     WHERE id = $1
       AND state = 'running'
       AND ($4::int IS NULL OR attempts = $4)
       AND NOT EXISTS (SELECT 1 FROM sandbox_runtime_effects e WHERE e.operation_id=sandbox_operations.id AND e.settled_at IS NULL)
     RETURNING id, organization_id AS "organizationId", sandbox_id AS "sandboxId",
               kind, state, idempotency_key AS "idempotencyKey", request, result,
               error, attempts, locked_at AS "lockedAt", started_at AS "startedAt",
               completed_at AS "completedAt", created_at AS "createdAt",
               updated_at AS "updatedAt"`,
    [input.operationId, input.error, JSON.stringify(input.result ?? {}), input.expectedAttempts ?? null]
  );
  return requeued.rows[0] ?? null;
};

export const cleanupStaleSandboxOperations = async (
  input: ClaimSandboxOperationInput = {},
  query: Query = defaultQuery
) => {
  const maxAttempts = Math.max(Math.trunc(input.maxAttempts ?? 3), 1);
  const staleAfterMs = Math.max(Math.trunc(input.staleAfterMs ?? 300_000), 1);
  const params: unknown[] = [maxAttempts, staleAfterMs];
  let kindClause = "";
  if (input.kinds?.length) {
    params.push(input.kinds);
    kindClause = `AND kind = ANY($${params.length}::text[])`;
  }
  const retryable = await query(
    `UPDATE sandbox_operations
     SET state = 'queued',
         locked_at = NULL,
         error = COALESCE(error, 'operation lease expired'),
         updated_at = now()
     WHERE state = 'running'
       AND NOT EXISTS (SELECT 1 FROM sandbox_runtime_effects e WHERE e.operation_id=sandbox_operations.id AND e.settled_at IS NULL)
       AND locked_at < now() - ($2::double precision * interval '1 millisecond')
       AND attempts < $1
       ${kindClause}`,
    params
  );
  const exhausted = await query(
    `UPDATE sandbox_operations
     SET state = 'failed',
         locked_at = NULL,
         completed_at = now(),
         error = COALESCE(error, 'operation attempt limit exceeded after stale lease'),
         updated_at = now()
     WHERE state = 'running'
       AND NOT EXISTS (SELECT 1 FROM sandbox_runtime_effects e WHERE e.operation_id=sandbox_operations.id AND e.settled_at IS NULL)
       AND locked_at < now() - ($2::double precision * interval '1 millisecond')
       AND attempts >= $1
       ${kindClause}`,
    params
  );
  return {
    requeued: retryable.rowCount ?? 0,
    failed: exhausted.rowCount ?? 0
  };
};

export const listQueuedSandboxOperations = async (
  input: { limit?: number; kinds?: SandboxOperationKind[] } = {},
  query: Query = defaultQuery
) => {
  const params: unknown[] = [];
  let where = "WHERE state = 'queued'";
  if (input.kinds?.length) {
    params.push(input.kinds);
    where += ` AND kind = ANY($${params.length}::text[])`;
  }
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  params.push(limit);
  const result = await query<SandboxOperation>(
    `${sandboxOperationSelect}
     ${where}
     ORDER BY created_at ASC
     LIMIT $${params.length}`,
    params
  );
  return result.rows;
};
