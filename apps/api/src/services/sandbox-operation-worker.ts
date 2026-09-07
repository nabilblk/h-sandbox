import { config } from "../config.js";
import { query as defaultQuery, type Transaction } from "../db.js";
import type { RuntimeProvider, RuntimeRouteTarget, RuntimeSandboxRef, RuntimeSandboxSummary } from "../providers/runtime/provider.js";
import { runtimeProvider as defaultRuntimeProvider } from "../providers/runtime/index.js";
import { configuredRouteTarget, routeHost } from "../providers/runtime/route-targets.js";
import type { RuntimeTemplate } from "../templates.js";
import type { EgressNetworkPolicy } from "@harakiri/shared";
import { recordSandboxEvent, type SandboxEventRecorder } from "./sandbox-events.js";
import type { Query } from "./query.js";
import { prepareRuntimeWorkspace } from "./persistent-workspaces.js";
import { renewSandboxLease, SandboxLeaseError } from "./sandbox-lease.js";
import {
  claimNextSandboxOperation,
  claimStaleRunningSandboxOperation,
  cleanupStaleSandboxOperations,
  completeSandboxOperation,
  failSandboxOperation,
  readSandboxOperationSecret,
  requeueSandboxOperation,
  type SandboxOperation
} from "./sandbox-operations.js";

export const replayableSandboxOperationKinds = ["provision", "delete", "renew", "route_expose"] as const;
export const staleLeaseCleanupOperationKinds = ["delete", "renew", "route_expose"] as const;

export type ProcessSandboxOperationQueueReport = {
  claimed: number;
  succeeded: number;
  requeued: number;
  failed: number;
  staleRequeued: number;
  staleFailed: number;
  staleProvisionReconciled: number;
  staleProvisionFailed: number;
};

export type ProcessSandboxOperationQueueDependencies = {
  query?: Query;
  transaction?: Transaction;
  runtimeProvider?: RuntimeProvider;
  recordEvent?: SandboxEventRecorder;
  limit?: number;
  maxAttempts?: number;
  staleAfterMs?: number;
};

class NonRetryableOperationError extends Error {}

const runtimeRef = (runtimeProvider: RuntimeProvider, providerSandboxId: string | null | undefined): RuntimeSandboxRef => ({
  provider: runtimeProvider.kind,
  providerSandboxId: providerSandboxId ?? ""
});

const stringValue = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);
const numberValue = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const protocolValue = (value: unknown): "http" | "https" => (value === "https" ? "https" : "http");
const routeAccessModeValue = (value: unknown) => value === "token" ? "token" as const : "public" as const;
const normalizedProviderState = (state: string) => {
  const value = state.toLowerCase();
  if (value.includes("terminat") || value.includes("stopped") || value.includes("delete")) return "terminated";
  if (value.includes("fail") || value.includes("error")) return "error";
  if (value.includes("pending") || value.includes("creating")) return "pending";
  return "running";
};

const fallbackRouteTarget = (sandboxId: string, port: number): RuntimeRouteTarget => {
  return configuredRouteTarget({ sandboxId, port, provider: "fallback-local" });
};

const routeProxyUrl = (routeKey: string) =>
  `${config.publicApiUrl.replace(/\/+$/, "")}/v1/route-proxy/${encodeURIComponent(routeKey)}/`;

const routeSelect = `
  SELECT port, protocol, route_key AS "routeKey", host,
         COALESCE(url, target_url) AS url,
         target_url AS "targetUrl",
         state, provider, provider_route_id AS "providerRouteId",
         created_at AS "createdAt",
         last_checked_at AS "lastCheckedAt",
         terminated_at AS "terminatedAt"
  FROM sandbox_routes
`;

const sandboxIdForOperation = (operation: SandboxOperation) =>
  operation.sandboxId ?? stringValue(operation.request.sandboxId);

const stringArrayValue = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

const metadataMatches = (summary: RuntimeSandboxSummary, sandboxId: string, organizationId: string) => {
  const metadata = summary.metadata ?? {};
  const metadataSandboxId = metadata["harakiri.sandbox"] ?? metadata["harakiri.id"];
  const metadataOrganizationId = metadata["harakiri.organization"] ?? metadata["harakiri.org"];
  return metadataSandboxId === sandboxId && (!metadataOrganizationId || metadataOrganizationId === organizationId);
};

type ProvisionSandboxRow = {
  workspaceId?: string | null;
  id: string;
  opensandboxId: string | null;
  status: string;
  sandboxName: string;
  ttlSeconds: number;
  templateId: string;
  templateName: string;
  description: string;
  image: string;
  imageDigest: string | null;
  icon: RuntimeTemplate["icon"];
  tags: string[];
  aliases: string[];
  bootMs: number;
  visibility: RuntimeTemplate["visibility"];
  ownerScope: NonNullable<RuntimeTemplate["ownerScope"]>;
  defaultEntrypoint: string[];
  cpuCount: number;
  memoryMb: number;
  workdir: string;
  defaultPorts: number[];
  runtimeFamily: string;
  templateVersionId: string | null;
  egressCompiledPolicy: EgressNetworkPolicy | null;
};

const runtimeTemplateFromProvisionRow = (row: ProvisionSandboxRow): RuntimeTemplate => ({
  id: row.templateId,
  name: row.templateName,
  description: row.description,
  image: row.image,
  imageDigest: row.imageDigest,
  icon: row.icon,
  tags: row.tags ?? [],
  aliases: row.aliases ?? [],
  bootMs: Number(row.bootMs) || 0,
  visibility: row.visibility,
  status: "ready",
  ownerScope: row.ownerScope,
  defaultEntrypoint: row.defaultEntrypoint ?? ["sleep", "3600"],
  cpuCount: Number(row.cpuCount) || 1,
  memoryMb: Number(row.memoryMb) || 1024,
  workdir: row.workdir || "/",
  defaultPorts: (row.defaultPorts ?? []).map(Number).filter(Number.isInteger),
  runtimeFamily: row.runtimeFamily || "linux",
  latestVersionId: row.templateVersionId,
  templateVersionId: row.templateVersionId
});

const readProvisionEnv = async (operation: SandboxOperation, query: Query) => {
  const envKeys = stringArrayValue(operation.request.envKeys);
  if (envKeys.length === 0) return {};
  if (operation.request.envReplayable !== true) {
    throw new NonRetryableOperationError("provision operation env is not replayable because no control-plane secret key was configured");
  }
  const stored = await readSandboxOperationSecret({ operationId: operation.id, name: "provision_env" }, { query });
  if (!stored) throw new NonRetryableOperationError("provision operation env secret is missing");
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored) as unknown;
  } catch {
    throw new NonRetryableOperationError("provision operation env secret is malformed");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new NonRetryableOperationError("provision operation env secret is malformed");
  }
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
};

const executeProvisionOperation = async (
  operation: SandboxOperation,
  dependencies: { query: Query; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder }
) => {
  const sandboxId = sandboxIdForOperation(operation);
  if (!sandboxId) throw new NonRetryableOperationError("provision operation is missing sandbox id");
  const result = await dependencies.query<ProvisionSandboxRow>(
    `SELECT s.id,
            s.workspace_id AS "workspaceId",
            s.opensandbox_id AS "opensandboxId",
            s.status,
            s.name AS "sandboxName",
            s.ttl_seconds AS "ttlSeconds",
            t.id AS "templateId",
            t.name AS "templateName",
            t.description,
            COALESCE(v.image_uri, t.image) AS image,
            COALESCE(v.image_digest, t.image_digest) AS "imageDigest",
            t.icon,
            t.tags,
            t.aliases,
            t.boot_ms AS "bootMs",
            t.visibility,
            CASE WHEN t.organization_id IS NULL THEN 'platform' ELSE 'team' END AS "ownerScope",
            COALESCE(v.default_entrypoint, t.default_entrypoint) AS "defaultEntrypoint",
            COALESCE(v.cpu_count, t.cpu_count) AS "cpuCount",
            COALESCE(v.memory_mb, t.memory_mb) AS "memoryMb",
            COALESCE(v.workdir, t.workdir) AS workdir,
            COALESCE(v.default_ports, t.default_ports) AS "defaultPorts",
            t.runtime_family AS "runtimeFamily",
            s.template_version_id AS "templateVersionId",
            s.egress_compiled_policy AS "egressCompiledPolicy"
     FROM sandboxes s
     JOIN templates t ON t.id = s.template_id
     LEFT JOIN template_versions v ON v.id = s.template_version_id
     WHERE s.id = $1 AND s.organization_id = $2`,
    [sandboxId, operation.organizationId]
  );
  const row = result.rows[0];
  if (!row) throw new NonRetryableOperationError("sandbox not found for provision operation");
  if (row.opensandboxId) {
    await completeSandboxOperation({ operationId: operation.id, result: { providerSandboxId: row.opensandboxId } }, dependencies.query);
    return;
  }
  if (row.status === "terminated") throw new NonRetryableOperationError("sandbox terminated before provision");
  const template = runtimeTemplateFromProvisionRow(row);
  const env = await readProvisionEnv(operation, dependencies.query);
  let provider;
  try {
    provider = await dependencies.runtimeProvider.create({
      workspace: row.workspaceId ? await prepareRuntimeWorkspace(operation.organizationId, sandboxId, dependencies.query, dependencies.runtimeProvider) : undefined,
      template,
      ttlSeconds: row.ttlSeconds,
      name: row.sandboxName,
      organizationId: operation.organizationId,
      env,
      egressPolicy: row.egressCompiledPolicy,
      metadata: {
        "harakiri.id": sandboxId,
        "harakiri.sandbox": sandboxId,
        "harakiri.org": operation.organizationId,
        "harakiri.organization": operation.organizationId
      }
    });
    await dependencies.query(
      `UPDATE sandboxes
       SET opensandbox_id = $2,
           status = 'running',
           cpu_pct = 3,
           memory_mb = 128,
           started_at = now(),
           last_active_at = now(),
           expires_at = LEAST($4::timestamptz, now() + make_interval(secs => ttl_seconds::int)),
           provider_expires_at = $4::timestamptz,
           updated_at = now()
       WHERE id = $1 AND organization_id = $3`,
      [sandboxId, provider.providerSandboxId, operation.organizationId, provider.expiresAt ?? null]
    );
    await dependencies.query(
      `INSERT INTO sandbox_schedules (sandbox_id, organization_id, kind, run_at)
       SELECT id, organization_id, 'idle_ttl', expires_at FROM sandboxes WHERE id = $1 AND organization_id = $2`,
      [sandboxId, operation.organizationId]
    );
    await completeSandboxOperation(
      {
        operationId: operation.id,
        result: {
          provider: provider.provider,
          providerSandboxId: provider.providerSandboxId,
          runtimeRegistryCredentialId: provider.runtimeRegistryCredentialId,
          runtimeImageAuthProvided: provider.runtimeImageAuthProvided
        }
      },
      dependencies.query
    );
    await dependencies.recordEvent(operation.organizationId, sandboxId, "created", `created through ${provider.provider} by operation worker`, {
      operationId: operation.id,
      opensandboxId: provider.providerSandboxId,
      provider: provider.provider,
      envKeys: stringArrayValue(operation.request.envKeys),
      runtimeWorkdir: template.workdir,
      templateId: template.id,
      templateVersionId: template.templateVersionId,
      imageDigest: template.imageDigest,
      egressRuleCount: row.egressCompiledPolicy?.egress.length ?? 0,
      egressDefaultAction: row.egressCompiledPolicy?.defaultAction ?? "allow"
    });
  } catch (error) {
    if (provider?.providerSandboxId) {
      await dependencies.runtimeProvider.delete(runtimeRef(dependencies.runtimeProvider, provider.providerSandboxId)).catch(() => undefined);
    }
    throw error;
  }
};

const reconcileStaleProvisionOperation = async (
  operation: SandboxOperation,
  dependencies: { query: Query; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder }
): Promise<"reconciled" | "failed"> => {
  const sandboxId = sandboxIdForOperation(operation);
  if (!sandboxId) {
    await failSandboxOperation({ operationId: operation.id, error: "stale provision operation is missing sandbox id" }, dependencies.query);
    return "failed";
  }
  const sandbox = await dependencies.query<{ opensandbox_id: string | null; status: string; ttl_seconds: number }>(
    "SELECT opensandbox_id, status, ttl_seconds FROM sandboxes WHERE id = $1 AND organization_id = $2",
    [sandboxId, operation.organizationId]
  );
  if (!sandbox.rowCount) {
    await failSandboxOperation({ operationId: operation.id, error: "sandbox not found for stale provision operation" }, dependencies.query);
    return "failed";
  }
  if (sandbox.rows[0].opensandbox_id) {
    await completeSandboxOperation(
      { operationId: operation.id, result: { providerSandboxId: sandbox.rows[0].opensandbox_id, reconciled: true } },
      dependencies.query
    );
    return "reconciled";
  }

  const providerSandboxes = await dependencies.runtimeProvider.list();
  const match = providerSandboxes.find((summary) => metadataMatches(summary, sandboxId, operation.organizationId));
  if (!match) {
    const message = "stale provision operation could not be matched to a provider sandbox";
    await dependencies.query("UPDATE sandboxes SET status = 'error', updated_at = now() WHERE id = $1 AND organization_id = $2", [
      sandboxId,
      operation.organizationId
    ]);
    await failSandboxOperation({ operationId: operation.id, error: message }, dependencies.query);
    await dependencies.recordEvent(operation.organizationId, sandboxId, "error", message, { operationId: operation.id });
    return "failed";
  }

  const status = normalizedProviderState(match.state);
  await dependencies.query(
    `UPDATE sandboxes
     SET opensandbox_id = $2,
         status = $3,
         cpu_pct = CASE WHEN cpu_pct = 0 THEN 3 ELSE cpu_pct END,
         memory_mb = CASE WHEN memory_mb = 0 THEN 128 ELSE memory_mb END,
         started_at = COALESCE(started_at, now()),
         last_active_at = now(),
         expires_at = COALESCE($4::timestamptz, expires_at, now() + make_interval(secs => ttl_seconds::int)),
         provider_expires_at = $4::timestamptz,
         updated_at = now()
     WHERE id = $1 AND organization_id = $5`,
    [sandboxId, match.providerSandboxId, status, match.expiresAt ?? null, operation.organizationId]
  );
  if (status !== "terminated") {
    await dependencies.query(
      `INSERT INTO sandbox_schedules (sandbox_id, organization_id, kind, run_at)
       SELECT $1, $2, 'idle_ttl', now() + make_interval(secs => $3::int)
       WHERE NOT EXISTS (
         SELECT 1 FROM sandbox_schedules
         WHERE sandbox_id = $1
           AND organization_id = $2
           AND kind = 'idle_ttl'
           AND completed_at IS NULL
       )`,
      [sandboxId, operation.organizationId, sandbox.rows[0].ttl_seconds]
    );
  }
  await completeSandboxOperation(
    {
      operationId: operation.id,
      result: {
        provider: match.provider,
        providerSandboxId: match.providerSandboxId,
        reconciled: true
      }
    },
    dependencies.query
  );
  await dependencies.recordEvent(operation.organizationId, sandboxId, "created", `reconciled provider-created sandbox ${match.providerSandboxId}`, {
    operationId: operation.id,
    provider: match.provider,
    providerSandboxId: match.providerSandboxId
  });
  return "reconciled";
};

const executeDeleteOperation = async (
  operation: SandboxOperation,
  dependencies: { query: Query; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder }
) => {
  const sandboxId = sandboxIdForOperation(operation);
  if (!sandboxId) throw new NonRetryableOperationError("delete operation is missing sandbox id");
  const sandbox = await dependencies.query<{ opensandbox_id: string | null }>(
    "SELECT opensandbox_id FROM sandboxes WHERE id = $1 AND organization_id = $2",
    [sandboxId, operation.organizationId]
  );
  if (!sandbox.rowCount) throw new NonRetryableOperationError("sandbox not found for delete operation");
  const providerSandboxId = stringValue(operation.request.providerSandboxId) ?? sandbox.rows[0].opensandbox_id;
  if (providerSandboxId) await dependencies.runtimeProvider.delete(runtimeRef(dependencies.runtimeProvider, providerSandboxId));
  await dependencies.query("UPDATE sandboxes SET status = 'terminated', updated_at = now() WHERE id = $1", [sandboxId]);
  await dependencies.query(
    "UPDATE sandbox_routes SET state = 'terminated', terminated_at = COALESCE(terminated_at, now()), updated_at = now() WHERE sandbox_id = $1",
    [sandboxId]
  );
  await completeSandboxOperation({ operationId: operation.id, result: { providerSandboxId } }, dependencies.query);
  await dependencies.recordEvent(operation.organizationId, sandboxId, "terminated", "sandbox terminated by operation worker", {
    operationId: operation.id
  });
};

const executeRenewOperation = async (
  operation: SandboxOperation,
  dependencies: { query: Query; transaction?: Transaction; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder }
) => {
  const sandboxId = sandboxIdForOperation(operation);
  if (!sandboxId) throw new NonRetryableOperationError("renew operation is missing sandbox id");
  await renewSandboxLease({ sandboxId, organizationId: operation.organizationId, operation }, dependencies);
  await dependencies.recordEvent(operation.organizationId, sandboxId, "renewed", "ttl reset by operation worker", {
    operationId: operation.id
  });
};

const executeRouteExposeOperation = async (
  operation: SandboxOperation,
  dependencies: { query: Query; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder }
) => {
  const sandboxId = sandboxIdForOperation(operation);
  const port = numberValue(operation.request.port);
  if (!sandboxId) throw new NonRetryableOperationError("route operation is missing sandbox id");
  if (!port) throw new NonRetryableOperationError("route operation is missing port");
  const protocol = protocolValue(operation.request.protocol);
  const accessMode = routeAccessModeValue(operation.request.accessMode);
  const accessTokenHash = stringValue(operation.request.accessTokenHash);
  const accessTokenHint = stringValue(operation.request.accessTokenHint);
  const accessHeaderName = accessMode === "token" ? stringValue(operation.request.accessHeaderName) ?? "x-harakiri-route-token" : null;
  const labels = stringArrayValue(operation.request.labels);
  const createdByUserId = stringValue(operation.request.createdByUserId);
  const createdByLabel = stringValue(operation.request.createdByLabel);
  if (accessMode === "token" && !accessTokenHash) {
    throw new NonRetryableOperationError("token route operation is missing access token hash");
  }
  const sandbox = await dependencies.query<{ opensandbox_id: string | null; status: string }>(
    "SELECT opensandbox_id, status FROM sandboxes WHERE id = $1 AND organization_id = $2",
    [sandboxId, operation.organizationId]
  );
  if (!sandbox.rowCount) throw new NonRetryableOperationError("sandbox not found for route operation");
  if (sandbox.rows[0].status === "terminated") throw new NonRetryableOperationError("sandbox terminated before route exposure");
  const existing = await dependencies.query<{ routeKey: string; host: string; url: string; provider: string; providerRouteId: string | null }>(
    `${routeSelect} WHERE sandbox_id = $1 AND organization_id = $2 AND port = $3 AND state <> 'terminated'`,
    [sandboxId, operation.organizationId, port]
  );
  if (existing.rowCount) {
    await completeSandboxOperation({ operationId: operation.id, result: existing.rows[0] }, dependencies.query);
    return;
  }
  const providerSandboxId = stringValue(operation.request.providerSandboxId) ?? sandbox.rows[0].opensandbox_id;
  const providerRoute = providerSandboxId
    ? await dependencies.runtimeProvider.exposeRoute({
        ...runtimeRef(dependencies.runtimeProvider, providerSandboxId),
        port,
        protocol
      })
    : fallbackRouteTarget(sandboxId, port);
  const publicUrl = accessMode === "token" ? routeProxyUrl(providerRoute.routeKey) : providerRoute.url;
  const publicHost = accessMode === "token" ? routeHost(publicUrl) : providerRoute.host;
  await dependencies.query(
    `INSERT INTO sandbox_routes
     (sandbox_id, organization_id, port, protocol, route_key, host, url, target_url, state, provider, provider_route_id,
      access_mode, access_token_hash, access_token_hint, access_header_name, created_by_user_id, created_by_label, labels, last_checked_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, now())
     ON CONFLICT (sandbox_id, port) WHERE state <> 'terminated' DO NOTHING`,
    [
      sandboxId,
      operation.organizationId,
      port,
      protocol,
      providerRoute.routeKey,
      publicHost,
      publicUrl,
      providerRoute.targetUrl,
      providerRoute.state,
      providerRoute.provider,
      providerRoute.providerRouteId,
      accessMode,
      accessTokenHash,
      accessTokenHint,
      accessHeaderName,
      createdByUserId,
      createdByLabel,
      labels
    ]
  );
  await completeSandboxOperation(
    {
      operationId: operation.id,
      result: {
        routeKey: providerRoute.routeKey,
        host: publicHost,
        url: publicUrl,
        accessMode,
        provider: providerRoute.provider,
        providerRouteId: providerRoute.providerRouteId
      }
    },
    dependencies.query
  );
  await dependencies.recordEvent(operation.organizationId, sandboxId, "route.created", `exposed ${protocol} port ${port} by operation worker`, {
    operationId: operation.id,
    port,
    routeKey: providerRoute.routeKey,
    provider: providerRoute.provider,
    accessMode,
    labels
  });
};

export const executeSandboxOperation = async (
  operation: SandboxOperation,
  dependencies: { query: Query; transaction?: Transaction; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder }
) => {
  if (operation.kind === "provision") return executeProvisionOperation(operation, dependencies);
  if (operation.kind === "delete") return executeDeleteOperation(operation, dependencies);
  if (operation.kind === "renew") return executeRenewOperation(operation, dependencies);
  if (operation.kind === "route_expose") return executeRouteExposeOperation(operation, dependencies);
  throw new NonRetryableOperationError(`operation kind ${operation.kind} is not supported by this worker`);
};

export const processSandboxOperationQueue = async (
  dependencies: ProcessSandboxOperationQueueDependencies = {}
): Promise<ProcessSandboxOperationQueueReport> => {
  const query = dependencies.query ?? defaultQuery;
  const runtimeProvider = dependencies.runtimeProvider ?? defaultRuntimeProvider;
  const recordEvent = dependencies.recordEvent ?? recordSandboxEvent(query);
  const limit = Math.min(Math.max(Math.trunc(dependencies.limit ?? config.sandboxOperationWorkerLimit), 0), 100);
  const maxAttempts = Math.max(Math.trunc(dependencies.maxAttempts ?? config.sandboxOperationMaxAttempts), 1);
  const staleAfterMs = Math.max(Math.trunc(dependencies.staleAfterMs ?? config.sandboxOperationLeaseMs), 1);
  const report: ProcessSandboxOperationQueueReport = {
    claimed: 0,
    succeeded: 0,
    requeued: 0,
    failed: 0,
    staleRequeued: 0,
    staleFailed: 0,
    staleProvisionReconciled: 0,
    staleProvisionFailed: 0
  };

  for (let index = 0; index < limit; index += 1) {
    const staleProvision = await claimStaleRunningSandboxOperation({ kinds: ["provision"], staleAfterMs }, query);
    if (!staleProvision) break;
    try {
      const result = await reconcileStaleProvisionOperation(staleProvision, { query, runtimeProvider, recordEvent });
      if (result === "reconciled") report.staleProvisionReconciled += 1;
      else report.staleProvisionFailed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await failSandboxOperation({ operationId: staleProvision.id, error: message }, query);
      report.staleProvisionFailed += 1;
    }
  }

  const stale = await cleanupStaleSandboxOperations(
    { kinds: [...staleLeaseCleanupOperationKinds], maxAttempts, staleAfterMs },
    query
  );
  report.staleRequeued = stale.requeued;
  report.staleFailed = stale.failed;

  for (let index = 0; index < limit; index += 1) {
    const operation = await claimNextSandboxOperation(
      { kinds: [...replayableSandboxOperationKinds], maxAttempts, staleAfterMs },
      query
    );
    if (!operation) break;
    report.claimed += 1;
    try {
      await executeSandboxOperation(operation, { query, runtimeProvider, recordEvent, transaction: dependencies.transaction });
      report.succeeded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof SandboxLeaseError && error.code === "renew_in_progress") continue;
      if (error instanceof NonRetryableOperationError || error instanceof SandboxLeaseError || operation.attempts >= maxAttempts) {
        await failSandboxOperation({ operationId: operation.id, error: message, expectedAttempts: operation.attempts }, query);
        report.failed += 1;
      } else {
        await requeueSandboxOperation({ operationId: operation.id, error: message, expectedAttempts: operation.attempts }, query);
        report.requeued += 1;
      }
    }
  }

  return report;
};
