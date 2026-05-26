import {
  compileEgressPolicy,
  defaultEgressPolicyInput,
  normalizeEgressTarget,
  type EgressNetworkPolicy,
  type EgressPolicyInput,
  type EgressPolicySummary,
  type PatchSandboxEgressBody,
  type RunResult,
  type SandboxRouteState,
  type SandboxRouteSummary,
  type TestSandboxEgressResponse,
  sandboxRouteStates
} from "@harakiri/shared";
import { config } from "../config.js";
import type {
  RuntimeFileListResult,
  RuntimeLogEntry,
  RuntimeMetricsSnapshot,
  RuntimeProvider,
  RuntimeRouteTarget,
  RuntimeSandboxRef
} from "../providers/runtime/provider.js";
import { query as defaultQuery } from "../db.js";
import { claimSandboxOperationById, completeSandboxOperation, enqueueSandboxOperation, failSandboxOperation } from "./sandbox-operations.js";
import type { Query } from "./query.js";
import { configuredRouteTarget } from "../providers/runtime/route-targets.js";
import { policyInputFromSummary, runtimeEgressPolicyFromSummary, validateEgressPolicyForOrganization } from "./egress-policy.js";

export type Audit = (
  organizationId: string,
  actorUserId: string,
  actorLabel: string,
  action: string,
  targetType: string,
  targetId?: string,
  metadata?: Record<string, unknown>
) => Promise<unknown>;

export type SandboxEventRecorder = (
  organizationId: string,
  sandboxId: string,
  type: string,
  message: string,
  metadata?: Record<string, unknown>
) => Promise<unknown>;

export type SandboxRouteRow = {
  port: number;
  protocol: "http" | "https";
  routeKey: string;
  host: string;
  url: string;
  targetUrl: string;
  state: string;
  provider: string;
  providerRouteId: string | null;
  createdAt?: Date | string;
  lastCheckedAt?: Date | string | null;
  terminatedAt?: Date | string | null;
};

export const routeSelect = `
  SELECT port, protocol, route_key AS "routeKey", host,
         COALESCE(url, target_url) AS url,
         target_url AS "targetUrl",
         state, provider, provider_route_id AS "providerRouteId",
         created_at AS "createdAt",
         last_checked_at AS "lastCheckedAt",
         terminated_at AS "terminatedAt"
  FROM sandbox_routes
`;

const runtimeRef = (runtimeProvider: RuntimeProvider, providerSandboxId: string | null | undefined): RuntimeSandboxRef => ({
  provider: runtimeProvider.kind,
  providerSandboxId: providerSandboxId ?? ""
});

const shellQuote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;

const fallbackRouteTarget = (sandboxId: string, port: number): RuntimeRouteTarget => {
  return configuredRouteTarget({ sandboxId, port, provider: "fallback-local" });
};

const normalizeRouteState = (state: string): SandboxRouteState =>
  sandboxRouteStates.includes(state as SandboxRouteState) ? state as SandboxRouteState : "unhealthy";

const toIso = (value: Date | string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const toIsoOrNull = (value: Date | string | null | undefined) => value ? toIso(value) : null;

const mapSandboxRouteRow = (row: SandboxRouteRow): SandboxRouteSummary => ({
  port: row.port,
  protocol: row.protocol,
  routeKey: row.routeKey,
  host: row.host,
  url: row.url,
  targetUrl: row.targetUrl,
  state: normalizeRouteState(row.state),
  provider: row.provider,
  providerRouteId: row.providerRouteId,
  createdAt: toIsoOrNull(row.createdAt) ?? new Date().toISOString(),
  lastCheckedAt: toIsoOrNull(row.lastCheckedAt),
  terminatedAt: toIsoOrNull(row.terminatedAt)
});

export const runSandboxCommand = async (
  input: { organizationId: string; sandboxId: string; command?: string; stdin?: string },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder }
): Promise<RunResult | null> => {
  const query = dependencies.query ?? defaultQuery;
  const sandbox = await query<{ id: string; opensandbox_id: string | null }>(
    "SELECT id, opensandbox_id FROM sandboxes WHERE id = $1 AND organization_id = $2",
    [input.sandboxId, input.organizationId]
  );
  if (!sandbox.rowCount) return null;
  const command = input.command ?? (input.stdin ? "python agent.py" : "ls");
  const result = await dependencies.runtimeProvider.run({
    ...runtimeRef(dependencies.runtimeProvider, sandbox.rows[0].opensandbox_id),
    controlPlaneSandboxId: input.sandboxId,
    command,
    stdin: input.stdin
  });
  await query("UPDATE sandboxes SET last_active_at = now(), expires_at = now() + (ttl_seconds || ' seconds')::interval WHERE id = $1", [
    input.sandboxId
  ]);
  await dependencies.recordEvent(input.organizationId, input.sandboxId, "run", `command: ${command}`, {
    exitCode: result.exitCode,
    durationMs: result.durationMs
  });
  return result;
};

export const listSandboxLogs = async (
  input: { organizationId: string; sandboxId: string },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider }
): Promise<Array<{ ts: string; lvl: string; msg: string; source: string }> | null> => {
  const query = dependencies.query ?? defaultQuery;
  const sandbox = await query<{ opensandbox_id: string | null }>(
    "SELECT opensandbox_id FROM sandboxes WHERE id = $1 AND organization_id = $2",
    [input.sandboxId, input.organizationId]
  );
  if (!sandbox.rowCount) return null;
  const controlPlaneLogs = await query<{ ts: Date; lvl: string; msg: string }>(
    `SELECT created_at AS ts, type AS lvl, message AS msg
     FROM sandbox_events WHERE sandbox_id = $1 AND organization_id = $2 ORDER BY created_at ASC LIMIT 200`,
    [input.sandboxId, input.organizationId]
  );
  const runtimeLogs = await dependencies.runtimeProvider.logs(runtimeRef(dependencies.runtimeProvider, sandbox.rows[0].opensandbox_id)).catch((): RuntimeLogEntry[] => []);
  return [
    ...controlPlaneLogs.rows.map((row) => ({ ...row, ts: new Date(row.ts).toISOString(), source: "control-plane" })),
    ...runtimeLogs
  ].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
};

export const listSandboxFiles = async (
  input: { organizationId: string; sandboxId: string; path?: string },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider }
): Promise<{ kind: "not_found" } | { kind: "unavailable"; files: RuntimeFileListResult } | { kind: "ok"; cwd: string; files: RuntimeFileListResult["files"] }> => {
  const query = dependencies.query ?? defaultQuery;
  const sandbox = await query<{ opensandbox_id: string | null; workdir: string | null }>(
    `SELECT s.opensandbox_id, COALESCE(v.workdir, t.workdir, '/') AS workdir
     FROM sandboxes s
     JOIN templates t ON t.id = s.template_id
     LEFT JOIN template_versions v ON v.id = s.template_version_id
     WHERE s.id = $1 AND s.organization_id = $2`,
    [input.sandboxId, input.organizationId]
  );
  if (!sandbox.rowCount) return { kind: "not_found" };
  const files = await dependencies.runtimeProvider.files({
    ...runtimeRef(dependencies.runtimeProvider, sandbox.rows[0].opensandbox_id),
    path: input.path,
    defaultCwd: sandbox.rows[0].workdir ?? "/"
  });
  if (!files.ok) return { kind: "unavailable", files };
  return { kind: "ok", cwd: files.cwd, files: files.files };
};

export const getSandboxMetrics = async (
  input: { organizationId: string; sandboxId: string },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider }
): Promise<RuntimeMetricsSnapshot | null> => {
  const query = dependencies.query ?? defaultQuery;
  const sandbox = await query<{ opensandbox_id: string | null; cpu_pct: number; memory_mb: number }>(
    "SELECT opensandbox_id, cpu_pct, memory_mb FROM sandboxes WHERE id = $1 AND organization_id = $2",
    [input.sandboxId, input.organizationId]
  );
  if (!sandbox.rowCount) return null;
  const liveMetrics = await dependencies.runtimeProvider.metrics(runtimeRef(dependencies.runtimeProvider, sandbox.rows[0].opensandbox_id)).catch(() => null);
  if (liveMetrics) {
    await query("UPDATE sandboxes SET cpu_pct = $1, memory_mb = $2, updated_at = now() WHERE id = $3", [
      liveMetrics.current.cpu,
      liveMetrics.current.mem,
      input.sandboxId
    ]);
    return liveMetrics;
  }
  const ts = new Date().toISOString();
  return {
    current: { cpu: sandbox.rows[0].cpu_pct, mem: sandbox.rows[0].memory_mb, diskIo: 0, networkOut: 0 },
    series: [{ ts, cpu: sandbox.rows[0].cpu_pct, mem: sandbox.rows[0].memory_mb }]
  };
};

type SandboxEgressRow = {
  id: string;
  opensandboxId: string | null;
  status: string;
  egressPolicy: EgressPolicyInput | null;
  egressCompiledPolicy: EgressNetworkPolicy | null;
  egressProviderStatus: Record<string, unknown> | null;
  updatedAt: Date | string | null;
};

const sandboxEgressSelect = `
  SELECT id,
         opensandbox_id AS "opensandboxId",
         status,
         egress_policy AS "egressPolicy",
         egress_compiled_policy AS "egressCompiledPolicy",
         egress_provider_status AS "egressProviderStatus",
         updated_at AS "updatedAt"
  FROM sandboxes
`;

const providerUnavailable = (message: string) => ({
  available: false,
  error: message,
  checkedAt: new Date().toISOString()
});

const providerAvailable = (status: Awaited<ReturnType<NonNullable<RuntimeProvider["getEgressPolicy"]>>>) => ({
  available: true,
  status: status.status,
  mode: status.mode,
  enforcementMode: status.enforcementMode,
  reason: status.reason,
  checkedAt: new Date().toISOString()
});

const storedEgressSummary = (row: SandboxEgressRow): EgressPolicySummary => ({
  ...compileEgressPolicy(row.egressPolicy ?? defaultEgressPolicyInput),
  providerStatus: row.egressProviderStatus as EgressPolicySummary["providerStatus"],
  updatedAt: toIsoOrNull(row.updatedAt)
});

const mergeEgressPatch = (current: EgressPolicyInput | null, patch: PatchSandboxEgressBody): EgressPolicyInput => {
  if (patch.reset) return defaultEgressPolicyInput;
  const base = current ?? defaultEgressPolicyInput;
  const mode = patch.mode ?? base.mode ?? "open";
  if (mode === "blocked") return { mode, presets: [], allow: [], deny: [] };
  return {
    mode,
    presets: patch.presets ?? base.presets ?? [],
    allow: patch.allow ? [...(base.allow ?? []), ...patch.allow] : base.allow ?? [],
    deny: patch.deny ? [...(base.deny ?? []), ...patch.deny] : base.deny ?? [],
    defaultAction: patch.mode === "custom" || base.mode === "custom" ? patch.mode ? patch.mode === "open" ? "allow" : undefined : base.defaultAction : undefined
  };
};

export const getSandboxEgress = async (
  input: { organizationId: string; sandboxId: string },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider }
): Promise<{ kind: "not_found" } | { kind: "ok"; egress: EgressPolicySummary }> => {
  const query = dependencies.query ?? defaultQuery;
  const result = await query<SandboxEgressRow>(`${sandboxEgressSelect} WHERE id = $1 AND organization_id = $2`, [
    input.sandboxId,
    input.organizationId
  ]);
  const row = result.rows[0];
  if (!row) return { kind: "not_found" };
  let summary = storedEgressSummary(row);
  if (row.status !== "terminated" && row.opensandboxId && dependencies.runtimeProvider.getEgressPolicy) {
    try {
      const provider = await dependencies.runtimeProvider.getEgressPolicy(runtimeRef(dependencies.runtimeProvider, row.opensandboxId));
      const status = providerAvailable(provider);
      await query("UPDATE sandboxes SET egress_provider_status = $3::jsonb, updated_at = updated_at WHERE id = $1 AND organization_id = $2", [
        input.sandboxId,
        input.organizationId,
        JSON.stringify(status)
      ]);
      summary = { ...summary, providerStatus: status };
    } catch (error) {
      const status = providerUnavailable(error instanceof Error ? error.message : String(error));
      await query("UPDATE sandboxes SET egress_provider_status = $3::jsonb, updated_at = updated_at WHERE id = $1 AND organization_id = $2", [
        input.sandboxId,
        input.organizationId,
        JSON.stringify(status)
      ]);
      summary = { ...summary, providerStatus: status };
    }
  } else if (!summary.providerStatus) {
    summary = { ...summary, providerStatus: providerUnavailable(row.status === "terminated" ? "sandbox is terminated" : "provider does not expose egress policy") };
  }
  return { kind: "ok", egress: summary };
};

export type UpdateSandboxEgressResult =
  | { kind: "not_found" }
  | { kind: "sandbox_terminated" }
  | { kind: "provider_unavailable"; message: string }
  | { kind: "invalid_policy"; message: string }
  | { kind: "preset_not_allowed"; preset: string }
  | { kind: "custom_domains_disabled" }
  | { kind: "rule_limit_exceeded"; limit: number }
  | { kind: "ok"; egress: EgressPolicySummary };

export const updateSandboxEgress = async (
  input: {
    organizationId: string;
    actorUserId: string;
    actorLabel: string;
    sandboxId: string;
    patch: PatchSandboxEgressBody;
  },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder; recordAudit: Audit }
): Promise<UpdateSandboxEgressResult> => {
  const query = dependencies.query ?? defaultQuery;
  const result = await query<SandboxEgressRow>(`${sandboxEgressSelect} WHERE id = $1 AND organization_id = $2`, [
    input.sandboxId,
    input.organizationId
  ]);
  const row = result.rows[0];
  if (!row) return { kind: "not_found" };
  if (row.status === "terminated") return { kind: "sandbox_terminated" };
  const validation = await validateEgressPolicyForOrganization(
    { organizationId: input.organizationId, policy: mergeEgressPatch(row.egressPolicy, input.patch) },
    query
  );
  if (validation.kind === "invalid_policy") return { kind: "invalid_policy", message: validation.message };
  if (validation.kind === "preset_not_allowed") return { kind: "preset_not_allowed", preset: validation.preset };
  if (validation.kind === "custom_domains_disabled") return { kind: "custom_domains_disabled" };
  if (validation.kind === "rule_limit_exceeded") return { kind: "rule_limit_exceeded", limit: validation.limit };
  const summary = validation.summary;
  if (!row.opensandboxId || !dependencies.runtimeProvider.setEgressPolicy) {
    return { kind: "provider_unavailable", message: "runtime provider does not expose mutable egress policy" };
  }
  const policyForRuntime = runtimeEgressPolicyFromSummary(summary);
  let providerStatus;
  try {
    const provider = await dependencies.runtimeProvider.setEgressPolicy(
      runtimeRef(dependencies.runtimeProvider, row.opensandboxId),
      policyForRuntime
    );
    providerStatus = providerAvailable(provider);
  } catch (error) {
    return { kind: "provider_unavailable", message: error instanceof Error ? error.message : String(error) };
  }
  const policyInput = policyInputFromSummary(summary);
  await query(
    `UPDATE sandboxes
     SET egress_policy = $3::jsonb,
         egress_compiled_policy = $4::jsonb,
         egress_provider_status = $5::jsonb,
         updated_at = now()
     WHERE id = $1 AND organization_id = $2`,
    [
      input.sandboxId,
      input.organizationId,
      JSON.stringify(policyInput),
      JSON.stringify(policyForRuntime),
      JSON.stringify(providerStatus)
    ]
  );
  await dependencies.recordEvent(input.organizationId, input.sandboxId, "egress.updated", `outbound access set to ${summary.mode}`, {
    mode: summary.mode,
    ruleCount: summary.rules.length,
    defaultAction: policyForRuntime.defaultAction
  });
  await dependencies.recordAudit(input.organizationId, input.actorUserId, input.actorLabel, "sandbox.egress.updated", "sandbox", input.sandboxId, {
    mode: summary.mode,
    ruleCount: summary.rules.length
  });
  return { kind: "ok", egress: { ...summary, providerStatus, updatedAt: new Date().toISOString() } };
};

const normalizeEgressTestTarget = (target: string) => {
  const value = target.trim();
  const url = /^https?:\/\//i.test(value) ? new URL(value) : new URL(`https://${value}`);
  const normalizedTarget = normalizeEgressTarget(url.hostname);
  return {
    normalizedTarget,
    url: url.toString()
  };
};

export const testSandboxEgress = async (
  input: { organizationId: string; sandboxId: string; target: string },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder; recordAudit: Audit; actorUserId: string; actorLabel: string }
): Promise<{ kind: "not_found" } | { kind: "sandbox_not_running"; response: TestSandboxEgressResponse } | { kind: "ok"; response: TestSandboxEgressResponse }> => {
  const query = dependencies.query ?? defaultQuery;
  const sandbox = await query<{ id: string; opensandbox_id: string | null; status: string }>(
    "SELECT id, opensandbox_id, status FROM sandboxes WHERE id = $1 AND organization_id = $2",
    [input.sandboxId, input.organizationId]
  );
  if (!sandbox.rowCount) return { kind: "not_found" };
  const target = normalizeEgressTestTarget(input.target);
  if (sandbox.rows[0].status !== "running") {
    return {
      kind: "sandbox_not_running",
      response: {
        target: input.target,
        normalizedTarget: target.normalizedTarget,
        url: target.url,
        ok: false,
        status: "sandbox_not_running",
        stdout: "",
        stderr: `sandbox is ${sandbox.rows[0].status}`,
        durationMs: 0
      }
    };
  }
  const script = `
target="$HARAKIRI_EGRESS_TEST_TARGET"
if command -v curl >/dev/null 2>&1; then
  curl -fsSIL --max-time 8 "$target" >/tmp/harakiri-egress-test 2>&1
elif command -v wget >/dev/null 2>&1; then
  wget -q --spider --timeout=8 "$target" >/tmp/harakiri-egress-test 2>&1
elif command -v python3 >/dev/null 2>&1; then
  python3 - <<'PY'
import os, urllib.request
urllib.request.urlopen(os.environ["HARAKIRI_EGRESS_TEST_TARGET"], timeout=8).read(1)
PY
else
  echo "no curl, wget, or python3 available" >&2
  exit 127
fi
`;
  const started = Date.now();
  const result = await dependencies.runtimeProvider.run({
    ...runtimeRef(dependencies.runtimeProvider, sandbox.rows[0].opensandbox_id),
    controlPlaneSandboxId: input.sandboxId,
    command: `HARAKIRI_EGRESS_TEST_TARGET=${shellQuote(target.url)} sh -lc ${shellQuote(script)}`
  });
  const ok = result.exitCode === 0;
  const response: TestSandboxEgressResponse = {
    target: input.target,
    normalizedTarget: target.normalizedTarget,
    url: target.url,
    ok,
    status: ok ? "reachable" : "blocked_or_unreachable",
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs || Date.now() - started
  };
  await dependencies.recordEvent(input.organizationId, input.sandboxId, "egress.tested", `tested outbound access to ${target.normalizedTarget}`, {
    target: target.normalizedTarget,
    ok
  });
  await dependencies.recordAudit(input.organizationId, dependencies.actorUserId, dependencies.actorLabel, "sandbox.egress.tested", "sandbox", input.sandboxId, {
    target: target.normalizedTarget,
    ok
  });
  return { kind: "ok", response };
};

export const listSandboxRoutes = async (
  input: { organizationId: string; sandboxId: string },
  query: Query = defaultQuery
): Promise<SandboxRouteSummary[] | null> => {
  const sandbox = await query<{ opensandbox_id: string | null }>(
    "SELECT opensandbox_id FROM sandboxes WHERE id = $1 AND organization_id = $2",
    [input.sandboxId, input.organizationId]
  );
  if (!sandbox.rowCount) return null;
  const existing = await query<SandboxRouteRow>(`${routeSelect} WHERE sandbox_id = $1 AND organization_id = $2 ORDER BY port ASC`, [
    input.sandboxId,
    input.organizationId
  ]);
  return existing.rows.map(mapSandboxRouteRow);
};

export type CreateSandboxRouteResult =
  | { kind: "sandbox_not_found" }
  | { kind: "sandbox_terminated" }
  | { kind: "sandbox_route_limit_exceeded"; limit: number }
  | { kind: "organization_route_limit_exceeded"; limit: number }
  | { kind: "existing"; route: SandboxRouteSummary }
  | { kind: "created"; route: SandboxRouteSummary };

export const createSandboxRoute = async (
  input: {
    organizationId: string;
    actorUserId: string;
    actorLabel: string;
    sandboxId: string;
    port: number;
    protocol: "http" | "https";
    idempotencyKey?: string | null;
  },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder; recordAudit: Audit }
): Promise<CreateSandboxRouteResult> => {
  const query = dependencies.query ?? defaultQuery;
  const sandbox = await query<{ id: string; opensandbox_id: string | null; status: string }>(
    "SELECT id, opensandbox_id, status FROM sandboxes WHERE id = $1 AND organization_id = $2",
    [input.sandboxId, input.organizationId]
  );
  if (!sandbox.rowCount) return { kind: "sandbox_not_found" };
  if (sandbox.rows[0].status === "terminated") return { kind: "sandbox_terminated" };

  const existing = await query<SandboxRouteRow>(`${routeSelect} WHERE sandbox_id = $1 AND organization_id = $2 AND port = $3`, [
    input.sandboxId,
    input.organizationId,
    input.port
  ]);
  if (existing.rowCount) return { kind: "existing", route: mapSandboxRouteRow(existing.rows[0]) };

  const [sandboxRouteCount, orgRouteCount] = await Promise.all([
    query<{ count: string }>("SELECT count(*) FROM sandbox_routes WHERE sandbox_id = $1 AND state <> 'terminated'", [input.sandboxId]),
    query<{ count: string }>("SELECT count(*) FROM sandbox_routes WHERE organization_id = $1 AND state <> 'terminated'", [input.organizationId])
  ]);
  if (Number(sandboxRouteCount.rows[0]?.count ?? 0) >= config.sandboxMaxRoutesPerSandbox) {
    return { kind: "sandbox_route_limit_exceeded", limit: config.sandboxMaxRoutesPerSandbox };
  }
  if (Number(orgRouteCount.rows[0]?.count ?? 0) >= config.sandboxMaxRoutesPerOrg) {
    return { kind: "organization_route_limit_exceeded", limit: config.sandboxMaxRoutesPerOrg };
  }

  const { operation } = await enqueueSandboxOperation(
    {
      organizationId: input.organizationId,
      sandboxId: input.sandboxId,
      kind: "route_expose",
      idempotencyKey: input.idempotencyKey,
      request: {
        sandboxId: input.sandboxId,
        providerSandboxId: sandbox.rows[0].opensandbox_id,
        port: input.port,
        protocol: input.protocol
      }
    },
    { query }
  );
  const runningOperation = await claimSandboxOperationById({ operationId: operation.id, kinds: ["route_expose"] }, query);
  const activeOperation = runningOperation ?? operation;
  let providerRoute;
  try {
    providerRoute = sandbox.rows[0].opensandbox_id
      ? await dependencies.runtimeProvider.exposeRoute({
          ...runtimeRef(dependencies.runtimeProvider, sandbox.rows[0].opensandbox_id),
          port: input.port,
          protocol: input.protocol
        })
      : fallbackRouteTarget(input.sandboxId, input.port);

    await query(
      `INSERT INTO sandbox_routes
       (sandbox_id, organization_id, port, protocol, route_key, host, url, target_url, state, provider, provider_route_id, last_checked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
       ON CONFLICT (sandbox_id, port) DO NOTHING`,
      [
        input.sandboxId,
        input.organizationId,
        input.port,
        input.protocol,
        providerRoute.routeKey,
        providerRoute.host,
        providerRoute.url,
        providerRoute.targetUrl,
        providerRoute.state,
        providerRoute.provider,
        providerRoute.providerRouteId
      ]
    );
    await completeSandboxOperation(
      {
        operationId: activeOperation.id,
        result: {
          routeKey: providerRoute.routeKey,
          host: providerRoute.host,
          url: providerRoute.url,
          provider: providerRoute.provider,
          providerRouteId: providerRoute.providerRouteId
        }
      },
      query
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failSandboxOperation({ operationId: activeOperation.id, error: message }, query);
    throw error;
  }
  await dependencies.recordEvent(input.organizationId, input.sandboxId, "route.created", `exposed ${input.protocol} port ${input.port}`, {
    port: input.port,
    routeKey: providerRoute.routeKey,
    provider: providerRoute.provider,
    operationId: activeOperation.id
  });
  await dependencies.recordAudit(input.organizationId, input.actorUserId, input.actorLabel, "sandbox.route.create", "sandbox", input.sandboxId, {
    port: input.port,
    routeKey: providerRoute.routeKey
  });
  const created = await query<SandboxRouteRow>(`${routeSelect} WHERE sandbox_id = $1 AND organization_id = $2 AND port = $3`, [
    input.sandboxId,
    input.organizationId,
    input.port
  ]);
  return { kind: "created", route: mapSandboxRouteRow(created.rows[0]) };
};

export const deleteSandboxRoute = async (
  input: {
    organizationId: string;
    actorUserId: string;
    actorLabel: string;
    sandboxId: string;
    port: number;
  },
  dependencies: { query?: Query; recordEvent: SandboxEventRecorder; recordAudit: Audit }
): Promise<SandboxRouteSummary | null> => {
  const query = dependencies.query ?? defaultQuery;
  const result = await query<SandboxRouteRow>(
    `${routeSelect}
     WHERE sandbox_id = $1 AND organization_id = $2 AND port = $3`,
    [input.sandboxId, input.organizationId, input.port]
  );
  if (!result.rowCount) return null;
  await query(
    `UPDATE sandbox_routes
     SET state = 'terminated', terminated_at = COALESCE(terminated_at, now()), updated_at = now()
     WHERE sandbox_id = $1 AND organization_id = $2 AND port = $3`,
    [input.sandboxId, input.organizationId, input.port]
  );
  await dependencies.recordEvent(input.organizationId, input.sandboxId, "route.terminated", `route for port ${input.port} disabled`, {
    port: input.port
  });
  await dependencies.recordAudit(input.organizationId, input.actorUserId, input.actorLabel, "sandbox.route.delete", "sandbox", input.sandboxId, {
    port: input.port
  });
  const updated = await query<SandboxRouteRow>(`${routeSelect} WHERE sandbox_id = $1 AND organization_id = $2 AND port = $3`, [
    input.sandboxId,
    input.organizationId,
    input.port
  ]);
  return mapSandboxRouteRow(updated.rows[0]);
};
