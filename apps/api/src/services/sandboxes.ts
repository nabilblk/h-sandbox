import { config } from "../config.js";
import { makeId } from "../crypto.js";
import { query as defaultQuery } from "../db.js";
import { sandboxStatuses, type SandboxOperationSummary, type SandboxStatus, type SandboxSummary as SharedSandboxSummary } from "@harakiri/shared";
import type { RuntimeProvider, RuntimeSandboxRef } from "../providers/runtime/provider.js";
import { hasSecretBoxKey } from "../secret-box.js";
import {
  ensureTemplateImageDigest,
  resolveTemplate,
  templateCanCreateSandbox,
  type RuntimeTemplate
} from "../templates.js";
import type { Query } from "./query.js";
import {
  claimSandboxOperationById,
  completeSandboxOperation,
  enqueueSandboxOperation,
  failSandboxOperation,
  sandboxOperationSelect,
  storeSandboxOperationSecret,
  type SandboxOperation
} from "./sandbox-operations.js";
import type { Audit, SandboxEventRecorder } from "./sandbox-runtime.js";
export type { Audit, SandboxEventRecorder } from "./sandbox-runtime.js";

export type SandboxSummary = SharedSandboxSummary;

type SandboxRow = Omit<SharedSandboxSummary, "status" | "expiresAt" | "createdAt"> & {
  status: string;
  expiresAt: Date | string | null;
  createdAt: Date | string;
};

export type SandboxListFilters = {
  status?: string;
  q?: string;
  template?: string;
  templateVersionId?: string;
  limit?: string | number;
};

export type CreateSandboxInput = {
  organizationId: string;
  userId: string;
  actorLabel: string;
  templateRef: string;
  name?: string;
  ttlSeconds: number;
  env: Record<string, string>;
  idempotencyKey?: string | null;
  wait?: boolean;
  waitTimeoutMs?: number;
};

export const sandboxSelect = `
  SELECT s.id, s.opensandbox_id AS "opensandboxId", s.name, s.template_id AS template,
         s.status, s.cpu_pct AS cpu, s.memory_mb AS mem,
         COALESCE(to_char(now() - s.started_at, 'HH24"h "MI"m"'), '-') AS started,
         s.owner_label AS owner, s.cost_usd::float AS cost, s.ttl_seconds AS "ttlSeconds",
         s.expires_at AS "expiresAt", s.public_url AS "publicUrl",
         s.template_version_id AS "templateVersionId", s.template_image_digest AS "templateImageDigest",
         s.created_at AS "createdAt"
  FROM sandboxes s
`;

const runtimeRef = (runtimeProvider: RuntimeProvider, providerSandboxId: string | null | undefined): RuntimeSandboxRef => ({
  provider: runtimeProvider.kind,
  providerSandboxId: providerSandboxId ?? ""
});

const normalizeSandboxStatus = (status: string): SandboxStatus =>
  sandboxStatuses.includes(status as SandboxStatus) ? status as SandboxStatus : "error";

const toIso = (value: Date | string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const toIsoOrNull = (value: Date | string | null) => value ? toIso(value) : null;

const mapSandboxRow = (row: SandboxRow): SandboxSummary => ({
  ...row,
  status: normalizeSandboxStatus(row.status),
  expiresAt: toIsoOrNull(row.expiresAt),
  createdAt: toIso(row.createdAt)
});

const routePolicySummary = () => ({
  mode: config.sandboxRouteMode,
  baseDomain: config.sandboxRouteBaseDomain,
  publicScheme: config.sandboxRoutePublicScheme,
  maxRoutesPerSandbox: config.sandboxMaxRoutesPerSandbox,
  maxRoutesPerOrg: config.sandboxMaxRoutesPerOrg
});

const sandboxTemplateMetadata = (template: RuntimeTemplate) => ({
  templateId: template.id,
  templateVersionId: template.templateVersionId,
  imageDigest: template.imageDigest,
  routePolicy: routePolicySummary()
});

const waitFor = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T | "timeout"> =>
  Promise.race([
    promise,
    new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), timeoutMs))
  ]);

export const summarizeSandboxOperation = (operation: SandboxOperation): SandboxOperationSummary => ({
  id: operation.id,
  sandboxId: operation.sandboxId,
  kind: operation.kind,
  state: operation.state,
  error: operation.error,
  attempts: operation.attempts,
  createdAt: new Date(operation.createdAt).toISOString(),
  updatedAt: new Date(operation.updatedAt).toISOString()
});

export const listSandboxes = async (
  input: { organizationId: string; filters?: SandboxListFilters },
  query: Query = defaultQuery
): Promise<SandboxSummary[]> => {
  const filters = input.filters ?? {};
  const params: unknown[] = [input.organizationId];
  let where = "WHERE s.organization_id = $1";
  const limit = Math.min(Math.max(Number(filters.limit ?? 100) || 100, 1), 200);
  if (filters.status && filters.status !== "all") {
    params.push(filters.status);
    where += ` AND s.status = $${params.length}`;
  }
  if (filters.template) {
    params.push(filters.template);
    where += ` AND s.template_id = $${params.length}`;
  }
  if (filters.templateVersionId) {
    params.push(filters.templateVersionId);
    where += ` AND s.template_version_id = $${params.length}`;
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    where += ` AND (s.id ILIKE $${params.length} OR s.name ILIKE $${params.length})`;
  }
  params.push(limit);
  const result = await query<SandboxRow>(`${sandboxSelect} ${where} ORDER BY s.created_at DESC LIMIT $${params.length}`, params);
  return result.rows.map(mapSandboxRow);
};

export const getSandbox = async (
  input: { organizationId: string; sandboxId: string },
  query: Query = defaultQuery
) => {
  const result = await query<SandboxRow>(`${sandboxSelect} WHERE s.id = $1 AND s.organization_id = $2`, [
    input.sandboxId,
    input.organizationId
  ]);
  return result.rowCount ? mapSandboxRow(result.rows[0]) : null;
};

export type CreateSandboxResult =
  | { kind: "created"; sandbox: SandboxSummary }
  | { kind: "pending"; sandbox: SandboxSummary; operation: SandboxOperation; message: string }
  | { kind: "template_not_found"; template: string }
  | { kind: "template_not_ready"; template: string; status: string }
  | { kind: "template_image_digest_unresolved"; template: string; message: string }
  | { kind: "sandbox_env_not_replayable"; message: string }
  | { kind: "sandbox_provision_failed"; sandbox: SandboxSummary | null; operation: SandboxOperation; message: string };

export const createSandbox = async (
  input: CreateSandboxInput,
  dependencies: {
    query?: Query;
    runtimeProvider: RuntimeProvider;
    recordEvent: SandboxEventRecorder;
    recordAudit: Audit;
    idFactory?: typeof makeId;
    resolveTemplateFn?: typeof resolveTemplate;
    templateCanCreateSandboxFn?: typeof templateCanCreateSandbox;
    ensureTemplateImageDigestFn?: typeof ensureTemplateImageDigest;
  }
): Promise<CreateSandboxResult> => {
  const query = dependencies.query ?? defaultQuery;
  if (input.idempotencyKey) {
    const existing = await query<SandboxOperation>(
      `${sandboxOperationSelect}
       WHERE organization_id = $1 AND kind = 'provision' AND idempotency_key = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [input.organizationId, input.idempotencyKey]
    );
    const operation = existing.rows[0];
    if (operation?.sandboxId) {
      const sandbox = await getSandbox({ organizationId: input.organizationId, sandboxId: operation.sandboxId }, query);
      if (sandbox && operation.state === "failed") {
        return {
          kind: "sandbox_provision_failed",
          sandbox,
          operation,
          message: operation.error ?? "sandbox provision failed"
        };
      }
      if (sandbox && (sandbox.status === "pending" || operation.state === "queued" || operation.state === "running")) {
        return {
          kind: "pending",
          sandbox,
          operation,
          message: "sandbox provision is still pending"
        };
      }
      if (sandbox) return { kind: "created", sandbox };
    }
  }
  const unresolvedTemplate = await (dependencies.resolveTemplateFn ?? resolveTemplate)(input.templateRef, input.organizationId);
  if (!unresolvedTemplate) return { kind: "template_not_found", template: input.templateRef };
  if (!(dependencies.templateCanCreateSandboxFn ?? templateCanCreateSandbox)(unresolvedTemplate)) {
    return { kind: "template_not_ready", template: input.templateRef, status: unresolvedTemplate.status };
  }
  let template;
  try {
    template = await (dependencies.ensureTemplateImageDigestFn ?? ensureTemplateImageDigest)(unresolvedTemplate);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { kind: "template_image_digest_unresolved", template: input.templateRef, message };
  }

  const id = (dependencies.idFactory ?? makeId)("sbx", 10);
  const name = input.name?.trim() || `${template.id}-runner`;
  const publicUrl = `${id}.sandbox.harakiri.local`;
  const envKeys = Object.keys(input.env).sort();
  const envReplayable = envKeys.length === 0 || hasSecretBoxKey();
  if (input.wait === false && !envReplayable) {
    return {
      kind: "sandbox_env_not_replayable",
      message: "async sandbox creation with env requires CONTROL_PLANE_SECRET_KEY or HARAKIRI_SECRET_KEY so env can be encrypted for worker replay"
    };
  }
  await query(
    `INSERT INTO sandboxes
     (id, opensandbox_id, organization_id, template_id, name, status, cpu_pct, memory_mb,
      owner_id, owner_label, ttl_seconds, started_at, last_active_at, expires_at, public_url,
      template_version_id, template_image_digest)
     VALUES ($1, NULL, $2, $3, $4, 'pending', 0, 0, $5, $6, $7, NULL, now(), NULL, $8, $9, $10)`,
    [
      id,
      input.organizationId,
      template.id,
      name,
      input.userId,
      input.actorLabel,
      input.ttlSeconds,
      publicUrl,
      template.templateVersionId,
      template.imageDigest
    ]
  );
  const { operation, reused } = await enqueueSandboxOperation(
    {
      organizationId: input.organizationId,
      sandboxId: id,
      kind: "provision",
      idempotencyKey: input.idempotencyKey,
      request: {
        sandboxId: id,
        templateId: template.id,
        templateVersionId: template.templateVersionId,
        imageDigest: template.imageDigest,
        name,
        ttlSeconds: input.ttlSeconds,
        envKeys,
        envReplayable,
        actorUserId: input.userId,
        actorLabel: input.actorLabel
      }
    },
    { query, idFactory: dependencies.idFactory }
  );
  if (!reused && envKeys.length > 0 && envReplayable) {
    await storeSandboxOperationSecret(
      {
        operationId: operation.id,
        name: "provision_env",
        value: JSON.stringify(input.env)
      },
      { query }
    );
  }
  if (reused) {
    const sandbox = operation.sandboxId ? await getSandbox({ organizationId: input.organizationId, sandboxId: operation.sandboxId }, query) : null;
    if (sandbox && (sandbox.status === "pending" || operation.state === "queued" || operation.state === "running")) {
      return {
        kind: "pending",
        sandbox,
        operation,
        message: "sandbox provision is still pending"
      };
    }
    if (sandbox) return { kind: "created", sandbox };
  }
  if (input.wait === false) {
    const sandbox = await getSandbox({ organizationId: input.organizationId, sandboxId: id }, query);
    if (!sandbox) throw new Error("sandbox row missing after provision enqueue");
    const metadata = {
      operationId: operation.id,
      envKeys,
      runtimeWorkdir: template.workdir,
      ...sandboxTemplateMetadata(template)
    };
    await dependencies.recordEvent(input.organizationId, id, "queued", "sandbox provision queued", metadata);
    await dependencies.recordAudit(input.organizationId, input.userId, input.actorLabel, "sandbox.create.queued", "sandbox", id, metadata);
    return {
      kind: "pending",
      sandbox,
      operation,
      message: "sandbox provision queued"
    };
  }
  const runningOperation = await claimSandboxOperationById({ operationId: operation.id, kinds: ["provision"] }, query);
  const activeOperation = runningOperation ?? operation;
  const provisionPromise = (async (): Promise<CreateSandboxResult> => {
    let provider;
    try {
      provider = await dependencies.runtimeProvider.create({
        template,
        ttlSeconds: input.ttlSeconds,
        name,
        organizationId: input.organizationId,
        env: input.env,
        metadata: {
          "harakiri.id": id,
          "harakiri.sandbox": id,
          "harakiri.org": input.organizationId,
          "harakiri.organization": input.organizationId
        }
      });
      await query(
        `UPDATE sandboxes
         SET opensandbox_id = $2,
             status = 'running',
             cpu_pct = 3,
             memory_mb = 128,
             started_at = now(),
             last_active_at = now(),
             expires_at = now() + make_interval(secs => ttl_seconds::int),
             updated_at = now()
         WHERE id = $1 AND organization_id = $3`,
        [id, provider.providerSandboxId, input.organizationId]
      );
      await query(
        `INSERT INTO sandbox_schedules (sandbox_id, organization_id, kind, run_at)
         VALUES ($1, $2, 'idle_ttl', now() + make_interval(secs => $3::int))`,
        [id, input.organizationId, input.ttlSeconds]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (provider?.providerSandboxId) {
        await dependencies.runtimeProvider.delete(runtimeRef(dependencies.runtimeProvider, provider.providerSandboxId)).catch(() => undefined);
      }
      await query("UPDATE sandboxes SET status = 'error', updated_at = now() WHERE id = $1 AND organization_id = $2", [id, input.organizationId]);
      const failed = await failSandboxOperation(
        {
          operationId: activeOperation.id,
          error: message,
          result: provider ? { provider: provider.provider, providerSandboxId: provider.providerSandboxId } : {}
        },
        query
      );
      await dependencies.recordEvent(input.organizationId, id, "error", `sandbox provision failed: ${message}`, {
        operationId: activeOperation.id,
        provider: provider?.provider
      });
      return {
        kind: "sandbox_provision_failed",
        sandbox: await getSandbox({ organizationId: input.organizationId, sandboxId: id }, query),
        operation: failed ?? activeOperation,
        message
      };
    }
    const metadata = {
      opensandboxId: provider.providerSandboxId,
      provider: provider.provider,
      operationId: activeOperation.id,
      envKeys: Object.keys(input.env).sort(),
      runtimeWorkdir: template.workdir,
      runtimeRegistryCredentialId: provider.runtimeRegistryCredentialId,
      runtimeImageAuthProvided: provider.runtimeImageAuthProvided,
      ...sandboxTemplateMetadata(template)
    };
    await completeSandboxOperation(
      {
        operationId: activeOperation.id,
        result: {
          provider: provider.provider,
          providerSandboxId: provider.providerSandboxId,
          runtimeRegistryCredentialId: provider.runtimeRegistryCredentialId,
          runtimeImageAuthProvided: provider.runtimeImageAuthProvided
        }
      },
      query
    );
    await dependencies.recordEvent(input.organizationId, id, "created", `created through ${provider.provider}`, metadata);
    await dependencies.recordAudit(input.organizationId, input.userId, input.actorLabel, "sandbox.create", "sandbox", id, metadata);
    const sandbox = await getSandbox({ organizationId: input.organizationId, sandboxId: id }, query);
    if (!sandbox) throw new Error("sandbox row missing after provider create");
    return { kind: "created", sandbox };
  })();
  if (input.waitTimeoutMs !== undefined) {
    void provisionPromise.catch(() => undefined);
    const waited = await waitFor(provisionPromise, input.waitTimeoutMs);
    if (waited === "timeout") {
      const sandbox = await getSandbox({ organizationId: input.organizationId, sandboxId: id }, query);
      if (!sandbox) throw new Error("sandbox row missing after provision timeout");
      return {
        kind: "pending",
        sandbox,
        operation: activeOperation,
        message: "sandbox provision is still running"
      };
    }
    return waited;
  }
  return provisionPromise;
};

export const deleteSandbox = async (
  input: {
    organizationId: string;
    userId: string;
    actorLabel: string;
    sandboxId: string;
    idempotencyKey?: string | null;
  },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder; recordAudit: Audit }
) => {
  const query = dependencies.query ?? defaultQuery;
  const result = await query<{ opensandbox_id: string | null }>(
    "SELECT opensandbox_id FROM sandboxes WHERE id = $1 AND organization_id = $2",
    [input.sandboxId, input.organizationId]
  );
  if (!result.rowCount) return false;
  const { operation } = await enqueueSandboxOperation(
    {
      organizationId: input.organizationId,
      sandboxId: input.sandboxId,
      kind: "delete",
      idempotencyKey: input.idempotencyKey,
      request: { sandboxId: input.sandboxId, providerSandboxId: result.rows[0].opensandbox_id }
    },
    { query }
  );
  const runningOperation = await claimSandboxOperationById({ operationId: operation.id, kinds: ["delete"] }, query);
  const activeOperation = runningOperation ?? operation;
  try {
    if (result.rows[0].opensandbox_id) await dependencies.runtimeProvider.delete(runtimeRef(dependencies.runtimeProvider, result.rows[0].opensandbox_id));
    await query("UPDATE sandboxes SET status = 'terminated', updated_at = now() WHERE id = $1", [input.sandboxId]);
    await query("UPDATE sandbox_routes SET state = 'terminated', terminated_at = COALESCE(terminated_at, now()), updated_at = now() WHERE sandbox_id = $1", [input.sandboxId]);
    await completeSandboxOperation({ operationId: activeOperation.id, result: { providerSandboxId: result.rows[0].opensandbox_id } }, query);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failSandboxOperation({ operationId: activeOperation.id, error: message }, query);
    throw error;
  }
  await dependencies.recordEvent(input.organizationId, input.sandboxId, "terminated", "sandbox terminated - disk zeroed");
  await dependencies.recordAudit(input.organizationId, input.userId, input.actorLabel, "sandbox.kill", "sandbox", input.sandboxId);
  return true;
};

export const renewSandbox = async (
  input: { organizationId: string; sandboxId: string; idempotencyKey?: string | null },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder }
) => {
  const query = dependencies.query ?? defaultQuery;
  const result = await query<{ opensandbox_id: string | null; ttl_seconds: number }>(
    "SELECT opensandbox_id, ttl_seconds FROM sandboxes WHERE id = $1 AND organization_id = $2",
    [input.sandboxId, input.organizationId]
  );
  if (!result.rowCount) return false;
  const { operation } = await enqueueSandboxOperation(
    {
      organizationId: input.organizationId,
      sandboxId: input.sandboxId,
      kind: "renew",
      idempotencyKey: input.idempotencyKey,
      request: { sandboxId: input.sandboxId, providerSandboxId: result.rows[0].opensandbox_id, ttlSeconds: result.rows[0].ttl_seconds }
    },
    { query }
  );
  const runningOperation = await claimSandboxOperationById({ operationId: operation.id, kinds: ["renew"] }, query);
  const activeOperation = runningOperation ?? operation;
  const expiresAt = new Date(Date.now() + result.rows[0].ttl_seconds * 1000).toISOString();
  try {
    if (result.rows[0].opensandbox_id) {
      await dependencies.runtimeProvider.renew(runtimeRef(dependencies.runtimeProvider, result.rows[0].opensandbox_id), { expiresAt });
    }
    await query("UPDATE sandboxes SET expires_at = $2::timestamptz, last_active_at = now() WHERE id = $1", [input.sandboxId, expiresAt]);
    await completeSandboxOperation({ operationId: activeOperation.id, result: { providerSandboxId: result.rows[0].opensandbox_id, expiresAt } }, query);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failSandboxOperation({ operationId: activeOperation.id, error: message }, query);
    throw error;
  }
  await dependencies.recordEvent(input.organizationId, input.sandboxId, "renewed", "ttl reset");
  return true;
};
