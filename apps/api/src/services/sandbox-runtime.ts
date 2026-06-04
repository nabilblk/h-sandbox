import { createHash } from "node:crypto";
import {
  compileEgressPolicy,
  defaultEgressPolicyInput,
  normalizeEgressTarget,
  type EgressNetworkPolicy,
  type EgressPolicyInput,
  type EgressPolicySummary,
  type PatchSandboxEgressBody,
  type RunResult,
  type RuntimeCapabilitiesResponse,
  type RuntimeCapabilityContract,
  type RuntimeCapabilityName,
  type RuntimeCapabilityState,
  type SandboxCommandMetadata,
  type SandboxFileEncoding,
  type SandboxFileUploadBody,
  type SandboxGitOperationName,
  type CreateSandboxCommandBody,
  type CreateSandboxCommandSessionBody,
  type RunSandboxCommandSessionBody,
  type SandboxCommandLogsResponse,
  type SandboxCommandSessionResponse,
  type RunSandboxCommandSessionResponse,
  type SandboxCommandStatus,
  type SandboxCommandSummary,
  type SandboxFileTransferMetadata,
  type SandboxRouteAccessMode,
  type SandboxRouteState,
  type SandboxRouteSummary,
  type TestSandboxEgressResponse,
  sandboxRouteStates
} from "@harakiri/shared";
import { config } from "../config.js";
import { constantEquals, hashApiKey, makeId } from "../crypto.js";
import type {
  RuntimeFileError,
  RuntimeFileListResult,
  RuntimeLogEntry,
  RuntimeMetricsSnapshot,
  RuntimeProvider,
  RuntimeStartedCommand,
  RuntimeRouteTarget,
  RuntimeSandboxRef
} from "../providers/runtime/provider.js";
import { RuntimeUnsupportedError } from "../providers/runtime/provider.js";
import type { WebSocket } from "ws";
import { query as defaultQuery } from "../db.js";
import { claimSandboxOperationById, completeSandboxOperation, enqueueSandboxOperation, failSandboxOperation } from "./sandbox-operations.js";
import type { Query } from "./query.js";
import { configuredRouteTarget, routeHost } from "../providers/runtime/route-targets.js";
import { policyInputFromSummary, runtimeEgressPolicyFromSummary, validateEgressPolicyForOrganization } from "./egress-policy.js";
import { redactText } from "../redaction.js";

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

const gitAuditOperations = new Set<SandboxGitOperationName>([
  "clone",
  "checkout",
  "create-branch",
  "delete-branch",
  "add",
  "commit",
  "pull",
  "push",
  "remote-add",
  "config-set",
  "configure-user"
]);

const stripUrlCredentials = (value: string) => {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return redactText(value);
  }
};

const definedRecord = <T extends Record<string, unknown>>(record: T) =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as Partial<T>;

const sanitizeCommandMetadata = (metadata?: SandboxCommandMetadata): SandboxCommandMetadata | undefined => {
  if (!metadata) return undefined;
  if (metadata.capability !== "git") return undefined;
  return definedRecord({
    capability: "git",
    operation: metadata.operation,
    cwd: metadata.cwd ? redactText(metadata.cwd) : undefined,
    targetPath: metadata.targetPath ? redactText(metadata.targetPath) : undefined,
    repositoryUrl: metadata.repositoryUrl ? stripUrlCredentials(metadata.repositoryUrl) : undefined,
    branch: metadata.branch ? redactText(metadata.branch) : undefined,
    ref: metadata.ref ? redactText(metadata.ref) : undefined,
    remote: metadata.remote ? redactText(metadata.remote) : undefined,
    configKey: metadata.configKey ? redactText(metadata.configKey) : undefined,
    credentialPersistence: metadata.credentialPersistence,
    hasCredentials: metadata.hasCredentials
  }) as SandboxCommandMetadata;
};

const gitEventType = (operation: SandboxGitOperationName) => `git.${operation.replace(/-/g, ".")}`;

const recordGitCommandActivity = async (
  input: {
    organizationId: string;
    sandboxId: string;
    actorUserId?: string;
    actorLabel?: string;
    commandId?: string;
    providerCommandId?: string | null;
    command: string;
    status: string;
    exitCode?: number | null;
    metadata?: SandboxCommandMetadata;
  },
  dependencies: { recordEvent: SandboxEventRecorder; recordAudit?: Audit }
) => {
  const metadata = sanitizeCommandMetadata(input.metadata);
  if (!metadata) return;
  const eventMetadata = {
    commandId: input.commandId,
    providerCommandId: input.providerCommandId,
    status: input.status,
    exitCode: input.exitCode ?? null,
    git: metadata
  };
  await dependencies.recordEvent(
    input.organizationId,
    input.sandboxId,
    gitEventType(metadata.operation),
    `git ${metadata.operation}: ${input.command}`,
    eventMetadata
  );
  if (!gitAuditOperations.has(metadata.operation) || !dependencies.recordAudit || !input.actorUserId || !input.actorLabel) return;
  await dependencies.recordAudit(
    input.organizationId,
    input.actorUserId,
    input.actorLabel,
    `sandbox.git.${metadata.operation}`,
    "sandbox",
    input.sandboxId,
    eventMetadata
  );
};

export type SandboxRouteRow = {
  id?: string;
  port: number;
  protocol: "http" | "https";
  accessMode: string;
  accessHeaderName: string | null;
  tokenHint: string | null;
  accessTokenHash?: string | null;
  labels?: string[] | null;
  createdByUserId?: string | null;
  createdByLabel?: string | null;
  routeKey: string;
  host: string;
  url: string;
  targetUrl: string;
  state: string;
  provider: string;
  providerRouteId: string | null;
  createdAt?: Date | string;
  lastCheckedAt?: Date | string | null;
  lastUsedAt?: Date | string | null;
  terminatedAt?: Date | string | null;
};

export const routeSelect = `
  SELECT id::text, port, protocol, route_key AS "routeKey", host,
         COALESCE(url, target_url) AS url,
         target_url AS "targetUrl",
         state, provider, provider_route_id AS "providerRouteId",
         COALESCE(access_mode, 'public') AS "accessMode",
         access_header_name AS "accessHeaderName",
         access_token_hint AS "tokenHint",
         access_token_hash AS "accessTokenHash",
         COALESCE(labels, '{}') AS labels,
         created_by_user_id::text AS "createdByUserId",
         created_by_label AS "createdByLabel",
         created_at AS "createdAt",
         last_checked_at AS "lastCheckedAt",
         last_used_at AS "lastUsedAt",
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

const normalizeRouteAccessMode = (mode: string | null | undefined): SandboxRouteAccessMode =>
  mode === "token" ? "token" : "public";

export const sandboxRouteAccessTokenHeader = "x-harakiri-route-token";
export const sandboxRouteAccessTokenQueryParam = "harakiri_route_token";

const routeAccessTokenHint = (token: string) => `${token.slice(0, 8)}...${token.slice(-4)}`;

const createRouteAccessToken = (idFactory: typeof makeId = makeId) => {
  const token = idFactory("hrt", 32);
  return {
    token,
    hash: hashApiKey(token),
    hint: routeAccessTokenHint(token)
  };
};

const routeProxyUrl = (routeKey: string) =>
  `${config.publicApiUrl.replace(/\/+$/, "")}/v1/route-proxy/${encodeURIComponent(routeKey)}/`;

const toIso = (value: Date | string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const toIsoOrNull = (value: Date | string | null | undefined) => value ? toIso(value) : null;

const capabilitySummary = (
  name: RuntimeCapabilityName,
  state: RuntimeCapabilityState,
  reason: string | null = null,
  required = true,
  availableContract: RuntimeCapabilityContract = "opensandbox_spec",
  source = "OpenSandbox provider API"
) => ({
  name,
  state,
  contract: state === "unavailable" ? "unavailable" : availableContract,
  source: state === "unavailable" ? reason ?? "Provider does not expose this capability" : source,
  required,
  reason
});

const unsupportedCapabilitySummary = (name: RuntimeCapabilityName, reason: string) => ({
  name,
  state: "unavailable" as const,
  contract: "unsupported" as const,
  source: "Current runtime provider contract",
  required: false,
  reason
});

const methodState = (methods: Array<unknown>, reason: string): { state: RuntimeCapabilityState; reason: string | null } => {
  const available = methods.filter((method) => typeof method === "function").length;
  if (available === methods.length) return { state: "available", reason: null };
  if (available > 0) return { state: "degraded", reason };
  return { state: "unavailable", reason };
};

const booleanState = (available: boolean, reason: string): { state: RuntimeCapabilityState; reason: string | null } =>
  available ? { state: "available", reason: null } : { state: "unavailable", reason };

export const getRuntimeCapabilities = (runtimeProvider: RuntimeProvider): RuntimeCapabilitiesResponse => {
  const commandMethods = methodState(
    [runtimeProvider.startCommand, runtimeProvider.getCommand, runtimeProvider.commandLogs, runtimeProvider.interruptCommand],
    "tracked command lifecycle requires start, status, logs, and interrupt methods"
  );
  const commandLogMethods = methodState([runtimeProvider.commandLogs], "tracked command logs are not exposed by this provider");
  const terminalAttachMethods = methodState(
    [runtimeProvider.createPtySession, runtimeProvider.attachPtySession],
    "interactive terminal attach requires provider PTY session create and WebSocket attach methods"
  );
  const terminalResize = booleanState(
    Boolean(runtimeProvider.capabilities.terminalResize && runtimeProvider.attachPtySession),
    "terminal resize events are not exposed by this provider"
  );
  const shellSessions = methodState(
    [runtimeProvider.createPtySession, runtimeProvider.getPtySession, runtimeProvider.deletePtySession],
    "shell session lifecycle requires create, status, and delete methods"
  );
  const sessionCommands = methodState(
    [runtimeProvider.createCommandSession, runtimeProvider.runCommandSession, runtimeProvider.deleteCommandSession],
    "persistent command sessions require create, run, and delete methods"
  );
  const fileReadMethods = methodState([runtimeProvider.statFile, runtimeProvider.readFile], "file metadata and read methods are not fully exposed");
  const fileWriteMethods = methodState(
    [runtimeProvider.writeFile, runtimeProvider.mkdir, runtimeProvider.removeFile, runtimeProvider.renameFile],
    "file write, mkdir, remove, and rename methods are not fully exposed"
  );
  const commandRun = booleanState(Boolean(runtimeProvider.capabilities.terminal && runtimeProvider.run), "blocking command execution is not exposed by this provider");
  const filesystemList = booleanState(Boolean(runtimeProvider.capabilities.filesystem && runtimeProvider.files), "filesystem listing is not exposed by this provider");
  const routes = booleanState(Boolean(runtimeProvider.capabilities.routes && runtimeProvider.exposeRoute), "route exposure is not exposed by this provider");
  const egress = booleanState(Boolean(runtimeProvider.capabilities.egress && runtimeProvider.setEgressPolicy), "mutable egress policy is not exposed by this provider");
  const logs = booleanState(Boolean(runtimeProvider.capabilities.logs && runtimeProvider.logs), "sandbox logs are not exposed by this provider");
  const metrics = booleanState(Boolean(runtimeProvider.capabilities.metrics && runtimeProvider.metrics), "sandbox metrics are not exposed by this provider");
  return {
    provider: runtimeProvider.kind,
    generatedAt: new Date().toISOString(),
    capabilities: [
      capabilitySummary("lifecycle", "available", null, true, "opensandbox_spec", "OpenSandbox lifecycle API"),
      capabilitySummary("lifecycleRenew", "available", null, true, "opensandbox_spec", "OpenSandbox renew API"),
      capabilitySummary("lifecycleKill", "available", null, true, "opensandbox_spec", "OpenSandbox delete API"),
      capabilitySummary("lifecycleReconnect", "available", null, true, "harakiri_control_plane", "Harakiri persisted sandbox lookup and runtime attach APIs"),
      unsupportedCapabilitySummary("lifecyclePause", "Pause is not exposed by OpenSandbox or the current Harakiri runtime provider."),
      unsupportedCapabilitySummary("lifecycleResume", "Resume is not exposed because pause is not supported by OpenSandbox or the current Harakiri runtime provider."),
      unsupportedCapabilitySummary("lifecycleSnapshot", "Snapshot and restore are not exposed by OpenSandbox or the current Harakiri runtime provider."),
      capabilitySummary("commandRun", commandRun.state, commandRun.reason, true, "opensandbox_spec", "OpenSandbox execd command API"),
      capabilitySummary("commands", commandMethods.state, commandMethods.reason, true, "opensandbox_spec", "OpenSandbox execd tracked command API"),
      capabilitySummary("detachedCommands", commandMethods.state, commandMethods.reason, true, "opensandbox_spec", "OpenSandbox execd background command API persisted by Harakiri command IDs"),
      capabilitySummary("commandLogs", commandLogMethods.state, commandLogMethods.reason, true, "opensandbox_spec", "OpenSandbox execd command logs API"),
      capabilitySummary("commandLogTail", commandLogMethods.state, commandLogMethods.reason, true, "harakiri_control_plane", "Harakiri cursor and tail helpers for detached command logs"),
      capabilitySummary("commandKill", commandMethods.state, commandMethods.reason, true, "opensandbox_spec", "OpenSandbox execd command interrupt API"),
      capabilitySummary("terminalAttach", terminalAttachMethods.state, terminalAttachMethods.reason, true, "opensandbox_provider", "OpenSandbox execd PTY implementation"),
      capabilitySummary("terminalResize", terminalResize.state, terminalResize.reason, false, "opensandbox_provider", "OpenSandbox execd PTY WebSocket implementation"),
      capabilitySummary("shellSessions", shellSessions.state, shellSessions.reason, false, "opensandbox_provider", "OpenSandbox execd PTY session lifecycle implementation"),
      capabilitySummary("sessionCommands", sessionCommands.state, sessionCommands.reason, false, "opensandbox_spec", "OpenSandbox execd persistent session API"),
      capabilitySummary("filesystemList", filesystemList.state, filesystemList.reason, true, "opensandbox_spec", "OpenSandbox execd filesystem API"),
      capabilitySummary("filesystemRead", fileReadMethods.state, fileReadMethods.reason, true, "opensandbox_spec", "OpenSandbox execd filesystem API"),
      capabilitySummary("filesystemWrite", fileWriteMethods.state, fileWriteMethods.reason, true, "opensandbox_spec", "OpenSandbox execd filesystem API"),
      capabilitySummary("routes", routes.state, routes.reason, true, "opensandbox_provider", "OpenSandbox sandbox route endpoint and gateway integration"),
      capabilitySummary("tokenRoutes", routes.state, routes.state === "available" ? null : "token routes require route exposure support", true, "harakiri_control_plane", "Harakiri route proxy and access-token control plane"),
      capabilitySummary(
        "git",
        commandRun.state === "available" ? "degraded" : commandRun.state,
        commandRun.state === "available"
          ? "Git operations are Harakiri SDK/CLI helpers over sandbox commands and require the selected template to include the git binary."
          : "Git operations require blocking command execution support.",
        false,
        "harakiri_control_plane",
        "Harakiri SDK/CLI Git helpers over sandbox command execution"
      ),
      capabilitySummary("egressPolicy", egress.state, egress.reason, true, "opensandbox_provider", "OpenSandbox egress policy endpoint"),
      capabilitySummary("logs", logs.state, logs.reason, true, "opensandbox_provider", "OpenSandbox diagnostics logs endpoint"),
      capabilitySummary("metrics", metrics.state, metrics.reason, true, "opensandbox_spec", "OpenSandbox execd metrics API")
    ]
  };
};

const mapSandboxRouteRow = (row: SandboxRouteRow): SandboxRouteSummary => ({
  port: row.port,
  protocol: row.protocol,
  accessMode: normalizeRouteAccessMode(row.accessMode),
  accessHeaderName: row.accessHeaderName ?? null,
  tokenHint: row.tokenHint ?? null,
  labels: row.labels ?? [],
  createdByUserId: row.createdByUserId ?? null,
  createdByLabel: row.createdByLabel ?? null,
  routeKey: row.routeKey,
  host: row.host,
  url: row.url,
  targetUrl: row.targetUrl,
  state: normalizeRouteState(row.state),
  provider: row.provider,
  providerRouteId: row.providerRouteId,
  createdAt: toIsoOrNull(row.createdAt) ?? new Date().toISOString(),
  lastCheckedAt: toIsoOrNull(row.lastCheckedAt),
  lastUsedAt: toIsoOrNull(row.lastUsedAt),
  terminatedAt: toIsoOrNull(row.terminatedAt)
});

const runResultFromCommand = (command: SandboxCommandSummary): RunResult => {
  const durationMs = command.startedAt && command.finishedAt
    ? Math.max(0, Date.parse(command.finishedAt) - Date.parse(command.startedAt))
    : 0;
  return {
    sandboxId: command.sandboxId,
    command: command.command,
    stdout: command.stdout,
    stderr: command.stderr,
    exitCode: command.exitCode ?? (command.status === "succeeded" ? 0 : 1),
    durationMs
  };
};

const redactRunResult = (result: RunResult): RunResult => ({
  ...result,
  command: redactText(result.command),
  stdout: redactText(result.stdout),
  stderr: redactText(result.stderr)
});

const redactStartedCommand = <T extends { stdout: string; stderr: string; error: string | null }>(command: T): T => ({
  ...command,
  stdout: redactText(command.stdout),
  stderr: redactText(command.stderr),
  error: command.error ? redactText(command.error) : command.error
});

const websocketOpen = 1;

const sendTerminalControlFrame = (client: WebSocket, payload: Record<string, unknown>) => {
  if (client.readyState !== websocketOpen) return;
  client.send(JSON.stringify(payload));
};

export const runSandboxCommand = async (
  input: {
    organizationId: string;
    sandboxId: string;
    command?: string;
    stdin?: string;
    cwd?: string;
    env?: Record<string, string>;
    timeoutMs?: number;
    metadata?: SandboxCommandMetadata;
    actorUserId?: string;
    actorLabel?: string;
  },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder; recordAudit?: Audit }
): Promise<
  | { kind: "ok"; result: RunResult }
  | { kind: "not_found" }
  | { kind: "sandbox_not_running"; status: string }
  | { kind: "unsupported"; message: string }
> => {
  const query = dependencies.query ?? defaultQuery;
  const command = input.command ?? (input.stdin ? "python agent.py" : "ls");
  const redactedCommand = redactText(command);
  if (dependencies.runtimeProvider.startCommand) {
    const tracked = await createSandboxCommand(
      {
        organizationId: input.organizationId,
        sandboxId: input.sandboxId,
        body: {
          command,
          stdin: input.stdin,
          cwd: input.cwd,
          env: input.env,
          timeoutMs: input.timeoutMs,
          detached: false,
          metadata: input.metadata
        }
      },
      { ...dependencies, actorUserId: input.actorUserId, actorLabel: input.actorLabel }
    );
    if (tracked.kind === "not_found") return { kind: "not_found" };
    if (tracked.kind === "sandbox_not_running") return tracked;
    if (tracked.kind === "unsupported") return tracked;
    return { kind: "ok", result: runResultFromCommand(tracked.command) };
  }

  const sandbox = await query<{ id: string; opensandbox_id: string | null }>(
    "SELECT id, opensandbox_id FROM sandboxes WHERE id = $1 AND organization_id = $2",
    [input.sandboxId, input.organizationId]
  );
  if (!sandbox.rowCount) return { kind: "not_found" };
  const result = await dependencies.runtimeProvider.run({
    ...runtimeRef(dependencies.runtimeProvider, sandbox.rows[0].opensandbox_id),
    controlPlaneSandboxId: input.sandboxId,
    command,
    stdin: input.stdin,
    cwd: input.cwd,
    env: input.env,
    timeoutMs: input.timeoutMs
  });
  await query("UPDATE sandboxes SET last_active_at = now(), expires_at = now() + (ttl_seconds || ' seconds')::interval WHERE id = $1", [
    input.sandboxId
  ]);
  const redactedResult = redactRunResult({ ...result, command: redactedCommand });
  await dependencies.recordEvent(input.organizationId, input.sandboxId, "run", `command: ${redactedCommand}`, {
    exitCode: redactedResult.exitCode,
    durationMs: redactedResult.durationMs,
    cwd: input.cwd,
    envKeys: Object.keys(input.env ?? {}),
    timeoutMs: input.timeoutMs,
    metadata: sanitizeCommandMetadata(input.metadata)
  });
  await recordGitCommandActivity(
    {
      organizationId: input.organizationId,
      sandboxId: input.sandboxId,
      actorUserId: input.actorUserId,
      actorLabel: input.actorLabel,
      command: redactedCommand,
      status: redactedResult.exitCode === 0 ? "succeeded" : "failed",
      exitCode: redactedResult.exitCode,
      metadata: input.metadata
    },
    dependencies
  );
  return { kind: "ok", result: redactedResult };
};

type SandboxCommandRow = Omit<SandboxCommandSummary, "status" | "envKeys" | "timeoutMs" | "exitCode" | "startedAt" | "finishedAt" | "createdAt" | "updatedAt"> & {
  status: string;
  envKeys: string[];
  timeoutMs: number | null;
  exitCode: number | null;
  startedAt: Date | string | null;
  finishedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

const commandColumns = (alias = "sandbox_commands") => `
  ${alias}.id, ${alias}.sandbox_id AS "sandboxId", ${alias}.provider,
  ${alias}.provider_command_id AS "providerCommandId", ${alias}.command,
  ${alias}.status, ${alias}.cwd, ${alias}.env_keys AS "envKeys",
  ${alias}.timeout_ms AS "timeoutMs", ${alias}.detached, ${alias}.stdout,
  ${alias}.stderr, ${alias}.exit_code AS "exitCode", ${alias}.error,
  ${alias}.started_at AS "startedAt", ${alias}.finished_at AS "finishedAt",
  ${alias}.created_at AS "createdAt", ${alias}.updated_at AS "updatedAt"
`;

const commandSelect = `SELECT ${commandColumns()} FROM sandbox_commands`;

const normalizeCommandStatus = (status: string): SandboxCommandStatus => {
  if (status === "queued" || status === "running" || status === "succeeded" || status === "failed" || status === "killed") return status;
  return "failed";
};

const commandFinishMetadata = (row: SandboxCommandRow): Pick<SandboxCommandSummary, "finishReason" | "signal"> => {
  const status = normalizeCommandStatus(row.status);
  if (status === "queued" || status === "running") return { finishReason: null, signal: null };
  if (status === "killed") return { finishReason: "killed", signal: row.exitCode === 130 ? "SIGINT" : null };
  if (status === "succeeded") return { finishReason: "exit", signal: null };
  const message = `${row.error ?? ""}\n${row.stderr ?? ""}`;
  if (/timeout|timed out/i.test(message)) return { finishReason: "timeout", signal: null };
  return { finishReason: row.exitCode === null ? "unknown" : "error", signal: null };
};

const mapCommandRow = (row: SandboxCommandRow): SandboxCommandSummary => ({
  ...row,
  command: redactText(row.command),
  status: normalizeCommandStatus(row.status),
  stdout: redactText(row.stdout),
  stderr: redactText(row.stderr),
  ...commandFinishMetadata(row),
  error: row.error ? redactText(row.error) : row.error,
  startedAt: toIsoOrNull(row.startedAt),
  finishedAt: toIsoOrNull(row.finishedAt),
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt)
});

const resultFromStartedCommand = (started: RuntimeStartedCommand) => ({
  providerCommandId: started.providerCommandId,
  status: started.status,
  stdout: started.stdout,
  stderr: started.stderr,
  exitCode: started.exitCode,
  error: started.error ?? null,
  startedAt: started.startedAt ?? new Date().toISOString(),
  finishedAt: started.finishedAt ?? (started.status === "running" ? null : new Date().toISOString())
});

export const createSandboxCommand = async (
  input: {
    organizationId: string;
    sandboxId: string;
    body: CreateSandboxCommandBody;
  },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder; recordAudit?: Audit; actorUserId?: string; actorLabel?: string; idFactory?: typeof makeId }
): Promise<
  | { kind: "ok"; command: SandboxCommandSummary }
  | { kind: "not_found" }
  | { kind: "sandbox_not_running"; status: string }
  | { kind: "unsupported"; message: string }
> => {
  const query = dependencies.query ?? defaultQuery;
  const command = input.body.command.trim();
  const redactedCommand = redactText(command);
  if (!command) return { kind: "unsupported", message: "Command cannot be empty." };
  if (!dependencies.runtimeProvider.startCommand) return { kind: "unsupported", message: "Runtime provider does not support tracked commands." };

  const sandbox = await query<{ id: string; opensandbox_id: string | null; status: string }>(
    "SELECT id, opensandbox_id, status FROM sandboxes WHERE id = $1 AND organization_id = $2",
    [input.sandboxId, input.organizationId]
  );
  if (!sandbox.rowCount) return { kind: "not_found" };
  if (sandbox.rows[0].status !== "running" && sandbox.rows[0].status !== "idle") {
    return { kind: "sandbox_not_running", status: sandbox.rows[0].status };
  }

  const commandId = (dependencies.idFactory ?? makeId)("cmd", 12);
  await query(
    `INSERT INTO sandbox_commands
     (id, organization_id, sandbox_id, provider, command, status, cwd, env_keys, timeout_ms, detached, started_at)
     VALUES ($1, $2, $3, $4, $5, 'queued', $6, $7, $8, $9, now())`,
    [
      commandId,
      input.organizationId,
      input.sandboxId,
      dependencies.runtimeProvider.kind,
      redactedCommand,
      input.body.cwd ?? null,
      Object.keys(input.body.env ?? {}),
      input.body.timeoutMs ?? null,
      Boolean(input.body.detached)
    ]
  );

  try {
    const started = await dependencies.runtimeProvider.startCommand({
      ...runtimeRef(dependencies.runtimeProvider, sandbox.rows[0].opensandbox_id),
      controlPlaneSandboxId: input.sandboxId,
      command,
      stdin: input.body.stdin,
      cwd: input.body.cwd,
      env: input.body.env,
      timeoutMs: input.body.timeoutMs,
      detached: input.body.detached
    });
    const result = redactStartedCommand(resultFromStartedCommand(started));
    const updated = await query<SandboxCommandRow>(
      `WITH updated AS (
         UPDATE sandbox_commands
         SET provider_command_id = $2, status = $3, stdout = $4, stderr = $5,
             exit_code = $6, error = $7, started_at = COALESCE($8::timestamptz, started_at),
             finished_at = $9::timestamptz, updated_at = now()
         WHERE id = $1 AND organization_id = $10
         RETURNING *
       )
       SELECT ${commandColumns("updated")} FROM updated`,
      [
        commandId,
        result.providerCommandId,
        result.status,
        result.stdout,
        result.stderr,
        result.exitCode,
        result.error,
        result.startedAt,
        result.finishedAt,
        input.organizationId
      ]
    );
    await query("UPDATE sandboxes SET last_active_at = now(), expires_at = now() + (ttl_seconds || ' seconds')::interval WHERE id = $1", [input.sandboxId]);
    await dependencies.recordEvent(input.organizationId, input.sandboxId, "command.started", `command: ${redactedCommand}`, {
      commandId,
      providerCommandId: result.providerCommandId,
      detached: Boolean(input.body.detached),
      cwd: input.body.cwd,
      envKeys: Object.keys(input.body.env ?? {}),
      metadata: sanitizeCommandMetadata(input.body.metadata)
    });
    await recordGitCommandActivity(
      {
        organizationId: input.organizationId,
        sandboxId: input.sandboxId,
        actorUserId: dependencies.actorUserId,
        actorLabel: dependencies.actorLabel,
        commandId,
        providerCommandId: result.providerCommandId,
        command: redactedCommand,
        status: result.status,
        exitCode: result.exitCode,
        metadata: input.body.metadata
      },
      dependencies
    );
    return { kind: "ok", command: mapCommandRow(updated.rows[0]) };
  } catch (error) {
    const message = redactText(error instanceof Error ? error.message : String(error));
    const updated = await query<SandboxCommandRow>(
      `WITH updated AS (
         UPDATE sandbox_commands
         SET status = 'failed', stderr = $2, error = $2, finished_at = now(), updated_at = now()
         WHERE id = $1 AND organization_id = $3
         RETURNING *
       )
      SELECT ${commandColumns("updated")} FROM updated`,
      [commandId, message, input.organizationId]
    );
    await recordGitCommandActivity(
      {
        organizationId: input.organizationId,
        sandboxId: input.sandboxId,
        actorUserId: dependencies.actorUserId,
        actorLabel: dependencies.actorLabel,
        commandId,
        command: redactedCommand,
        status: "failed",
        exitCode: 1,
        metadata: input.body.metadata
      },
      dependencies
    );
    return { kind: "ok", command: mapCommandRow(updated.rows[0]) };
  }
};

export const listSandboxCommands = async (
  input: { organizationId: string; sandboxId: string },
  query: Query = defaultQuery
) => {
  const sandbox = await query("SELECT id FROM sandboxes WHERE id = $1 AND organization_id = $2", [input.sandboxId, input.organizationId]);
  if (!sandbox.rowCount) return null;
  const result = await query<SandboxCommandRow>(
    `${commandSelect}
     WHERE sandbox_id = $1 AND id IN (SELECT id FROM sandbox_commands WHERE organization_id = $2)
     ORDER BY created_at DESC
     LIMIT 100`,
    [input.sandboxId, input.organizationId]
  );
  return result.rows.map(mapCommandRow);
};

const refreshCommand = async (
  row: SandboxCommandRow,
  input: { organizationId: string; sandboxId: string },
  dependencies: { query: Query; runtimeProvider: RuntimeProvider; providerSandboxId: string | null }
) => {
  const command = mapCommandRow(row);
  if (!command.providerCommandId || !dependencies.runtimeProvider.getCommand || command.status !== "running") return command;
  const providerState = await dependencies.runtimeProvider.getCommand({
    ...runtimeRef(dependencies.runtimeProvider, dependencies.providerSandboxId),
    providerCommandId: command.providerCommandId
  });
  const updated = await dependencies.query<SandboxCommandRow>(
    `WITH updated AS (
       UPDATE sandbox_commands
       SET status = $3, exit_code = $4, error = $5,
           started_at = COALESCE($6::timestamptz, started_at),
           finished_at = COALESCE($7::timestamptz, finished_at),
           updated_at = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING *
     )
     SELECT ${commandColumns("updated")} FROM updated`,
    [
      command.id,
      input.organizationId,
      providerState.status,
      providerState.exitCode,
      providerState.error ? redactText(providerState.error) : null,
      providerState.startedAt,
      providerState.finishedAt
    ]
  );
  return mapCommandRow(updated.rows[0]);
};

export const getSandboxCommand = async (
  input: { organizationId: string; sandboxId: string; commandId: string },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider }
) => {
  const query = dependencies.query ?? defaultQuery;
  const result = await query<SandboxCommandRow & { opensandboxId: string | null }>(
    `SELECT ${commandColumns("c")}, s.opensandbox_id AS "opensandboxId"
     FROM sandbox_commands c
     JOIN sandboxes s ON s.id = c.sandbox_id AND s.organization_id = c.organization_id
     WHERE c.sandbox_id = $1 AND c.organization_id = $2 AND c.id = $3`,
    [input.sandboxId, input.organizationId, input.commandId]
  );
  if (!result.rowCount) return null;
  return refreshCommand(result.rows[0], input, { query, runtimeProvider: dependencies.runtimeProvider, providerSandboxId: result.rows[0].opensandboxId });
};

export const getSandboxCommandLogs = async (
  input: { organizationId: string; sandboxId: string; commandId: string; cursor?: number; tail?: number },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider }
) => {
  const query = dependencies.query ?? defaultQuery;
  const result = await query<(SandboxCommandRow & { opensandboxId: string | null })>(
    `SELECT ${commandColumns("c")}, s.opensandbox_id AS "opensandboxId"
     FROM sandbox_commands c
     JOIN sandboxes s ON s.id = c.sandbox_id AND s.organization_id = c.organization_id
     WHERE c.sandbox_id = $1 AND c.organization_id = $2 AND c.id = $3`,
    [input.sandboxId, input.organizationId, input.commandId]
  );
  if (!result.rowCount) return null;
  const command = mapCommandRow(result.rows[0]);
  const applyTail = (logs: { stdout: string; stderr: string; cursor?: number }): SandboxCommandLogsResponse => {
    const truncate = (value: string) => {
      if (input.tail === undefined) return { value, truncated: false };
      const hadTrailingNewline = value.endsWith("\n");
      const lines = value.split(/\r?\n/);
      if (lines.at(-1) === "") lines.pop();
      if (lines.length <= input.tail) return { value, truncated: false };
      return {
        value: `${lines.slice(-input.tail).join("\n")}${hadTrailingNewline ? "\n" : ""}`,
        truncated: true
      };
    };
    const stdout = truncate(redactText(logs.stdout));
    const stderr = truncate(redactText(logs.stderr));
    return {
      commandId: command.id,
      stdout: stdout.value,
      stderr: stderr.value,
      cursor: logs.cursor,
      ...(input.tail === undefined ? {} : {
        tail: input.tail,
        stdoutTruncated: stdout.truncated,
        stderrTruncated: stderr.truncated
      })
    };
  };
  if (command.providerCommandId && command.detached && dependencies.runtimeProvider.commandLogs) {
    return applyTail(await dependencies.runtimeProvider.commandLogs({
      ...runtimeRef(dependencies.runtimeProvider, result.rows[0].opensandboxId),
      providerCommandId: command.providerCommandId,
      cursor: input.cursor
    }));
  }
  return applyTail({ stdout: command.stdout, stderr: command.stderr });
};

export const killSandboxCommand = async (
  input: { organizationId: string; sandboxId: string; commandId: string },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder }
) => {
  const query = dependencies.query ?? defaultQuery;
  const result = await query<(SandboxCommandRow & { opensandboxId: string | null })>(
    `SELECT ${commandColumns("c")}, s.opensandbox_id AS "opensandboxId"
     FROM sandbox_commands c
     JOIN sandboxes s ON s.id = c.sandbox_id AND s.organization_id = c.organization_id
     WHERE c.sandbox_id = $1 AND c.organization_id = $2 AND c.id = $3`,
    [input.sandboxId, input.organizationId, input.commandId]
  );
  if (!result.rowCount) return null;
  const command = mapCommandRow(result.rows[0]);
  if (command.providerCommandId && command.status === "running" && dependencies.runtimeProvider.interruptCommand) {
    await dependencies.runtimeProvider.interruptCommand({
      ...runtimeRef(dependencies.runtimeProvider, result.rows[0].opensandboxId),
      providerCommandId: command.providerCommandId
    });
  }
  const updated = await query<SandboxCommandRow>(
    `WITH updated AS (
       UPDATE sandbox_commands
       SET status = 'killed', exit_code = COALESCE(exit_code, 130), finished_at = now(), updated_at = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING *
     )
     SELECT ${commandColumns("updated")} FROM updated`,
    [input.commandId, input.organizationId]
  );
  await dependencies.recordEvent(input.organizationId, input.sandboxId, "command.killed", `command killed: ${redactText(command.command)}`, {
    commandId: command.id,
    providerCommandId: command.providerCommandId
  });
  return mapCommandRow(updated.rows[0]);
};

type SandboxRuntimeContext = {
  ref: RuntimeSandboxRef;
  status: string;
  workdir: string;
};

const getSandboxRuntimeContext = async (
  input: { organizationId: string; sandboxId: string },
  query: Query,
  runtimeProvider: RuntimeProvider
): Promise<SandboxRuntimeContext | null> => {
  const sandbox = await query<{ id: string; opensandboxId: string | null; status: string; workdir: string | null }>(
    `SELECT s.id, s.opensandbox_id AS "opensandboxId", s.status,
            COALESCE(v.workdir, t.workdir, '/') AS workdir
     FROM sandboxes s
     JOIN templates t ON t.id = s.template_id
     LEFT JOIN template_versions v ON v.id = s.template_version_id
     WHERE s.id = $1 AND s.organization_id = $2`,
    [input.sandboxId, input.organizationId]
  );
  const row = sandbox.rows[0];
  if (!row) return null;
  return {
    ref: runtimeRef(runtimeProvider, row.opensandboxId),
    status: row.status,
    workdir: row.workdir ?? "/"
  };
};

const sessionNotFound = (error: unknown) =>
  typeof (error as { status?: unknown }).status === "number" && (error as { status: number }).status === 404;

const renewSandboxActivity = (query: Query, input: { organizationId: string; sandboxId: string }) =>
  query("UPDATE sandboxes SET last_active_at = now(), expires_at = now() + (ttl_seconds || ' seconds')::interval WHERE id = $1 AND organization_id = $2", [
    input.sandboxId,
    input.organizationId
  ]);

export type SandboxCommandSessionMutationResult =
  | { kind: "ok"; response: SandboxCommandSessionResponse }
  | { kind: "not_found" }
  | { kind: "sandbox_not_running"; status: string }
  | { kind: "session_not_found" }
  | { kind: "unsupported"; message: string }
  | { kind: "provider_unavailable"; message: string };

export const createSandboxCommandSession = async (
  input: {
    organizationId: string;
    sandboxId: string;
    body: CreateSandboxCommandSessionBody;
  },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder }
): Promise<SandboxCommandSessionMutationResult> => {
  const query = dependencies.query ?? defaultQuery;
  const runtimeProvider = dependencies.runtimeProvider;
  if (!runtimeProvider.createCommandSession) {
    return { kind: "unsupported", message: "Runtime provider does not support persistent command sessions." };
  }

  const context = await getSandboxRuntimeContext(input, query, runtimeProvider);
  if (!context) return { kind: "not_found" };
  if (context.status !== "running" && context.status !== "idle") return { kind: "sandbox_not_running", status: context.status };

  const cwd = input.body.cwd ?? context.workdir;
  try {
    const session = await runtimeProvider.createCommandSession({ ...context.ref, cwd });
    await renewSandboxActivity(query, input);
    await dependencies.recordEvent(input.organizationId, input.sandboxId, "command.session.created", "command session created", {
      providerSessionId: session.providerSessionId,
      cwd
    });
    return {
      kind: "ok",
      response: {
        session: {
          id: session.providerSessionId,
          sandboxId: input.sandboxId,
          provider: runtimeProvider.kind,
          cwd: session.cwd ?? cwd,
          status: "running"
        }
      }
    };
  } catch (error) {
    if (sessionNotFound(error)) return { kind: "session_not_found" };
    return { kind: "provider_unavailable", message: error instanceof Error ? error.message : String(error) };
  }
};

export type SandboxCommandSessionRunResult =
  | { kind: "ok"; response: RunSandboxCommandSessionResponse }
  | { kind: "not_found" }
  | { kind: "sandbox_not_running"; status: string }
  | { kind: "session_not_found" }
  | { kind: "unsupported"; message: string }
  | { kind: "provider_unavailable"; message: string };

export const runSandboxCommandSession = async (
  input: {
    organizationId: string;
    sandboxId: string;
    sessionId: string;
    body: RunSandboxCommandSessionBody;
  },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder }
): Promise<SandboxCommandSessionRunResult> => {
  const query = dependencies.query ?? defaultQuery;
  const runtimeProvider = dependencies.runtimeProvider;
  if (!runtimeProvider.runCommandSession) {
    return { kind: "unsupported", message: "Runtime provider does not support persistent command session runs." };
  }

  const command = input.body.command.trim();
  const redactedCommand = redactText(command);
  if (!command) return { kind: "unsupported", message: "Command cannot be empty." };
  const context = await getSandboxRuntimeContext(input, query, runtimeProvider);
  if (!context) return { kind: "not_found" };
  if (context.status !== "running" && context.status !== "idle") return { kind: "sandbox_not_running", status: context.status };

  try {
    const started = Date.now();
    const result = await runtimeProvider.runCommandSession({
      ...context.ref,
      providerSessionId: input.sessionId,
      command,
      cwd: input.body.cwd,
      timeoutMs: input.body.timeoutMs
    });
    await renewSandboxActivity(query, input);
    const redactedResult = redactRunResult({
      sandboxId: input.sandboxId,
      command: redactedCommand,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: result.durationMs ?? Date.now() - started
    });
    await dependencies.recordEvent(input.organizationId, input.sandboxId, "command.session.run", `session command: ${redactedCommand}`, {
      providerSessionId: input.sessionId,
      cwd: input.body.cwd,
      timeoutMs: input.body.timeoutMs,
      exitCode: redactedResult.exitCode,
      durationMs: redactedResult.durationMs
    });
    return {
      kind: "ok",
      response: {
        result: redactedResult
      }
    };
  } catch (error) {
    if (sessionNotFound(error)) return { kind: "session_not_found" };
    return { kind: "provider_unavailable", message: error instanceof Error ? error.message : String(error) };
  }
};

export const deleteSandboxCommandSession = async (
  input: { organizationId: string; sandboxId: string; sessionId: string },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder }
): Promise<SandboxCommandSessionMutationResult> => {
  const query = dependencies.query ?? defaultQuery;
  const runtimeProvider = dependencies.runtimeProvider;
  if (!runtimeProvider.deleteCommandSession) {
    return { kind: "unsupported", message: "Runtime provider does not support persistent command session deletion." };
  }
  const context = await getSandboxRuntimeContext(input, query, runtimeProvider);
  if (!context) return { kind: "not_found" };
  if (context.status !== "running" && context.status !== "idle") return { kind: "sandbox_not_running", status: context.status };

  try {
    await runtimeProvider.deleteCommandSession({ ...context.ref, providerSessionId: input.sessionId });
    await dependencies.recordEvent(input.organizationId, input.sandboxId, "command.session.deleted", "command session deleted", {
      providerSessionId: input.sessionId
    });
    return {
      kind: "ok",
      response: {
        session: {
          id: input.sessionId,
          sandboxId: input.sandboxId,
          provider: runtimeProvider.kind,
          cwd: null,
          status: "closed"
        }
      }
    };
  } catch (error) {
    if (sessionNotFound(error)) return { kind: "session_not_found" };
    return { kind: "provider_unavailable", message: error instanceof Error ? error.message : String(error) };
  }
};

export type AttachSandboxTerminalResult =
  | { kind: "ok" }
  | { kind: "not_found" }
  | { kind: "sandbox_not_running"; status: string }
  | { kind: "unsupported"; message: string }
  | { kind: "provider_unavailable"; message: string };

export const attachSandboxTerminal = async (
  input: {
    organizationId: string;
    actorUserId: string;
    actorLabel: string;
    sandboxId: string;
    client: WebSocket;
    cwd?: string;
    shell?: string;
    env?: Record<string, string>;
    sessionName?: string;
    cols?: number;
    rows?: number;
    since?: number;
    pty?: boolean;
  },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder }
): Promise<AttachSandboxTerminalResult> => {
  const query = dependencies.query ?? defaultQuery;
  const runtimeProvider = dependencies.runtimeProvider;
  if (!runtimeProvider.createPtySession || !runtimeProvider.attachPtySession) {
    return { kind: "unsupported", message: "Runtime provider does not support interactive terminal attach." };
  }

  const sandbox = await query<{ id: string; opensandboxId: string | null; status: string; workdir: string | null }>(
    `SELECT s.id, s.opensandbox_id AS "opensandboxId", s.status,
            COALESCE(v.workdir, t.workdir, '/') AS workdir
     FROM sandboxes s
     JOIN templates t ON t.id = s.template_id
     LEFT JOIN template_versions v ON v.id = s.template_version_id
     WHERE s.id = $1 AND s.organization_id = $2`,
    [input.sandboxId, input.organizationId]
  );
  const row = sandbox.rows[0];
  if (!row) return { kind: "not_found" };
  if (row.status !== "running" && row.status !== "idle") return { kind: "sandbox_not_running", status: row.status };
  if (!row.opensandboxId) return { kind: "provider_unavailable", message: "Sandbox does not have an OpenSandbox runtime id." };

  const cwd = input.cwd ?? row.workdir ?? "/";
  const ref = runtimeRef(runtimeProvider, row.opensandboxId);
  let providerSessionId: string | undefined;
  const startedAt = Date.now();
  const renewLease = () =>
    query("UPDATE sandboxes SET last_active_at = now(), expires_at = now() + (ttl_seconds || ' seconds')::interval WHERE id = $1 AND organization_id = $2", [
      input.sandboxId,
      input.organizationId
    ]);

  let renewTimer: ReturnType<typeof setInterval> | undefined;
  try {
    const session = await runtimeProvider.createPtySession({
      ...ref,
      cwd,
      cols: input.cols,
      rows: input.rows,
      shell: input.shell,
      env: input.env,
      sessionName: input.sessionName
    });
    providerSessionId = session.providerSessionId;
    await renewLease();
    renewTimer = setInterval(() => {
      void renewLease().catch(() => undefined);
    }, 30_000);
    renewTimer.unref?.();
    await dependencies.recordEvent(input.organizationId, input.sandboxId, "terminal.attach.started", "terminal attached", {
      providerSessionId,
      cwd,
      shell: input.shell,
      sessionName: input.sessionName,
      cols: input.cols,
      rows: input.rows,
      envKeys: Object.keys(input.env ?? {}),
      actorUserId: input.actorUserId,
      actorLabel: input.actorLabel
    });
    sendTerminalControlFrame(input.client, {
      type: "connected",
      session_id: providerSessionId,
      mode: "pty",
      cwd
    });

    await runtimeProvider.attachPtySession({
      ...ref,
      providerSessionId,
      client: input.client,
      since: input.since,
      pty: input.pty
    });

    await dependencies.recordEvent(input.organizationId, input.sandboxId, "terminal.attach.ended", "terminal detached", {
      providerSessionId,
      durationMs: Date.now() - startedAt,
      actorUserId: input.actorUserId,
      actorLabel: input.actorLabel
    });
    return { kind: "ok" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await dependencies.recordEvent(input.organizationId, input.sandboxId, "terminal.attach.failed", "terminal attach failed", {
      providerSessionId,
      message,
      durationMs: Date.now() - startedAt,
      actorUserId: input.actorUserId,
      actorLabel: input.actorLabel
    }).catch(() => undefined);
    if (error instanceof RuntimeUnsupportedError) return { kind: "unsupported", message };
    return { kind: "provider_unavailable", message };
  } finally {
    if (renewTimer) clearInterval(renewTimer);
    if (providerSessionId && runtimeProvider.deletePtySession) {
      await runtimeProvider.deletePtySession({ ...ref, providerSessionId }).catch(() => undefined);
    }
  }
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
): Promise<
  | { kind: "not_found" }
  | { kind: "unavailable"; files: RuntimeFileListResult }
  | { kind: "ok"; cwd: string; files: RuntimeFileListResult["files"]; source: string; warnings?: string[] }
> => {
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
  return { kind: "ok", cwd: files.cwd, files: files.files, source: files.source, warnings: files.warnings };
};

type SandboxFileContext = {
  ref: RuntimeSandboxRef;
  defaultCwd: string;
};

type SandboxFileOperationResult<T> =
  | { kind: "not_found" }
  | { kind: "unsupported"; message: string }
  | { kind: "file_error"; error: RuntimeFileError }
  | { kind: "invalid_artifact"; code: string; message: string; statusCode?: number }
  | ({ kind: "ok" } & T);

const getSandboxFileContext = async (
  input: { organizationId: string; sandboxId: string },
  query: Query,
  runtimeProvider: RuntimeProvider
): Promise<SandboxFileContext | null> => {
  const sandbox = await query<{ opensandbox_id: string | null; workdir: string | null }>(
    `SELECT s.opensandbox_id, COALESCE(v.workdir, t.workdir, '/') AS workdir
     FROM sandboxes s
     JOIN templates t ON t.id = s.template_id
     LEFT JOIN template_versions v ON v.id = s.template_version_id
     WHERE s.id = $1 AND s.organization_id = $2`,
    [input.sandboxId, input.organizationId]
  );
  if (!sandbox.rowCount) return null;
  return {
    ref: runtimeRef(runtimeProvider, sandbox.rows[0].opensandbox_id),
    defaultCwd: sandbox.rows[0].workdir ?? "/"
  };
};

const unsupportedFileOperation = (operation: string) => ({
  kind: "unsupported" as const,
  message: `Runtime provider does not support sandbox file ${operation}.`
});

export const statSandboxFile = async (
  input: { organizationId: string; sandboxId: string; path: string },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider }
): Promise<SandboxFileOperationResult<{ file: RuntimeFileListResult["files"][number] }>> => {
  const query = dependencies.query ?? defaultQuery;
  if (!dependencies.runtimeProvider.statFile) return unsupportedFileOperation("stat");
  const context = await getSandboxFileContext(input, query, dependencies.runtimeProvider);
  if (!context) return { kind: "not_found" };
  const result = await dependencies.runtimeProvider.statFile({ ...context.ref, path: input.path, defaultCwd: context.defaultCwd });
  return result.ok ? { kind: "ok", file: result.file } : { kind: "file_error", error: result.error };
};

export const readSandboxFile = async (
  input: { organizationId: string; sandboxId: string; path: string; encoding: SandboxFileEncoding },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider }
): Promise<SandboxFileOperationResult<{ path: string; encoding: SandboxFileEncoding; content: string }>> => {
  const query = dependencies.query ?? defaultQuery;
  if (!dependencies.runtimeProvider.readFile) return unsupportedFileOperation("read");
  const context = await getSandboxFileContext(input, query, dependencies.runtimeProvider);
  if (!context) return { kind: "not_found" };
  const result = await dependencies.runtimeProvider.readFile({ ...context.ref, path: input.path, defaultCwd: context.defaultCwd, encoding: input.encoding });
  return result.ok ? { kind: "ok", path: result.path, encoding: result.encoding, content: result.content } : { kind: "file_error", error: result.error };
};

export const writeSandboxFile = async (
  input: { organizationId: string; sandboxId: string; path: string; content: string; encoding: SandboxFileEncoding; createParents?: boolean; mode?: string },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider }
): Promise<SandboxFileOperationResult<{ file: RuntimeFileListResult["files"][number] }>> => {
  const query = dependencies.query ?? defaultQuery;
  if (!dependencies.runtimeProvider.writeFile) return unsupportedFileOperation("write");
  const context = await getSandboxFileContext(input, query, dependencies.runtimeProvider);
  if (!context) return { kind: "not_found" };
  const result = await dependencies.runtimeProvider.writeFile({
    ...context.ref,
    path: input.path,
    defaultCwd: context.defaultCwd,
    content: input.content,
    encoding: input.encoding,
    createParents: input.createParents,
    mode: input.mode
  });
  return result.ok ? { kind: "ok", file: result.file } : { kind: "file_error", error: result.error };
};

const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
const artifactSha256 = (content: Buffer) => `sha256:${createHash("sha256").update(content).digest("hex")}`;
const artifactTransfer = () => ({
  mode: "json-base64" as const,
  encoding: "base64" as const,
  maxBytes: config.sandboxFileArtifactMaxBytes
});

const decodeArtifactBase64 = (body: SandboxFileUploadBody, maxBytes = config.sandboxFileArtifactMaxBytes) => {
  if (body.contentBase64.length % 4 !== 0) {
    return {
      kind: "invalid_artifact" as const,
      code: "sandbox_file_artifact_invalid_base64",
      message: "Artifact contentBase64 must be canonical base64.",
      statusCode: 400
    };
  }
  const padding = body.contentBase64.endsWith("==") ? 2 : body.contentBase64.endsWith("=") ? 1 : 0;
  const decodedSize = body.contentBase64.length / 4 * 3 - padding;
  if (decodedSize > maxBytes) {
    return {
      kind: "invalid_artifact" as const,
      code: "sandbox_file_artifact_too_large",
      message: `Artifact exceeds ${maxBytes} bytes.`,
      statusCode: 413
    };
  }
  if (!base64Pattern.test(body.contentBase64)) {
    return {
      kind: "invalid_artifact" as const,
      code: "sandbox_file_artifact_invalid_base64",
      message: "Artifact contentBase64 must be canonical base64.",
      statusCode: 400
    };
  }
  const content = Buffer.from(body.contentBase64, "base64");
  if (content.toString("base64") !== body.contentBase64) {
    return {
      kind: "invalid_artifact" as const,
      code: "sandbox_file_artifact_invalid_base64",
      message: "Artifact contentBase64 must be canonical base64.",
      statusCode: 400
    };
  }
  if (body.sizeBytes !== undefined && body.sizeBytes !== content.byteLength) {
    return {
      kind: "invalid_artifact" as const,
      code: "sandbox_file_artifact_size_mismatch",
      message: `Artifact declared ${body.sizeBytes} bytes but decoded to ${content.byteLength} bytes.`,
      statusCode: 400
    };
  }
  const sha256 = artifactSha256(content);
  if (body.sha256 && body.sha256.toLowerCase() !== sha256) {
    return {
      kind: "invalid_artifact" as const,
      code: "sandbox_file_artifact_checksum_mismatch",
      message: "Artifact sha256 does not match contentBase64.",
      statusCode: 400
    };
  }
  return { kind: "ok" as const, content, sha256 };
};

export const uploadSandboxFileArtifact = async (
  input: { organizationId: string; sandboxId: string } & SandboxFileUploadBody,
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider }
): Promise<SandboxFileOperationResult<{ file: RuntimeFileListResult["files"][number]; sizeBytes: number; sha256: string; transfer: SandboxFileTransferMetadata }>> => {
  const decoded = decodeArtifactBase64(input);
  if (decoded.kind !== "ok") return decoded;
  const written = await writeSandboxFile(
    {
      organizationId: input.organizationId,
      sandboxId: input.sandboxId,
      path: input.path,
      content: input.contentBase64,
      encoding: "base64",
      createParents: input.createParents,
      mode: input.mode
    },
    dependencies
  );
  if (written.kind !== "ok") return written;
  return { kind: "ok", file: written.file, sizeBytes: decoded.content.byteLength, sha256: decoded.sha256, transfer: artifactTransfer() };
};

export const downloadSandboxFileArtifact = async (
  input: { organizationId: string; sandboxId: string; path: string },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider }
): Promise<SandboxFileOperationResult<{ path: string; contentBase64: string; sizeBytes: number; sha256: string; transfer: SandboxFileTransferMetadata }>> => {
  const read = await readSandboxFile({ ...input, encoding: "base64" }, dependencies);
  if (read.kind !== "ok") return read;
  const decoded = decodeArtifactBase64({ path: input.path, contentBase64: read.content });
  if (decoded.kind !== "ok") return decoded;
  return { kind: "ok", path: read.path, contentBase64: read.content, sizeBytes: decoded.content.byteLength, sha256: decoded.sha256, transfer: artifactTransfer() };
};

export const mkdirSandboxFile = async (
  input: { organizationId: string; sandboxId: string; path: string; recursive?: boolean },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider }
): Promise<SandboxFileOperationResult<{ file: RuntimeFileListResult["files"][number] }>> => {
  const query = dependencies.query ?? defaultQuery;
  if (!dependencies.runtimeProvider.mkdir) return unsupportedFileOperation("mkdir");
  const context = await getSandboxFileContext(input, query, dependencies.runtimeProvider);
  if (!context) return { kind: "not_found" };
  const result = await dependencies.runtimeProvider.mkdir({ ...context.ref, path: input.path, defaultCwd: context.defaultCwd, recursive: input.recursive });
  return result.ok ? { kind: "ok", file: result.file } : { kind: "file_error", error: result.error };
};

export const removeSandboxFile = async (
  input: { organizationId: string; sandboxId: string; path: string; recursive?: boolean },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider }
): Promise<SandboxFileOperationResult<{ path: string }>> => {
  const query = dependencies.query ?? defaultQuery;
  if (!dependencies.runtimeProvider.removeFile) return unsupportedFileOperation("remove");
  const context = await getSandboxFileContext(input, query, dependencies.runtimeProvider);
  if (!context) return { kind: "not_found" };
  const result = await dependencies.runtimeProvider.removeFile({ ...context.ref, path: input.path, defaultCwd: context.defaultCwd, recursive: input.recursive });
  return result.ok ? { kind: "ok", path: result.path } : { kind: "file_error", error: result.error };
};

export const renameSandboxFile = async (
  input: { organizationId: string; sandboxId: string; fromPath: string; toPath: string },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider }
): Promise<SandboxFileOperationResult<{ file: RuntimeFileListResult["files"][number] }>> => {
  const query = dependencies.query ?? defaultQuery;
  if (!dependencies.runtimeProvider.renameFile) return unsupportedFileOperation("rename");
  const context = await getSandboxFileContext(input, query, dependencies.runtimeProvider);
  if (!context) return { kind: "not_found" };
  const result = await dependencies.runtimeProvider.renameFile({
    ...context.ref,
    fromPath: input.fromPath,
    toPath: input.toPath,
    defaultCwd: context.defaultCwd
  });
  return result.ok ? { kind: "ok", file: result.file } : { kind: "file_error", error: result.error };
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
  const existing = await query<SandboxRouteRow>(
    `${routeSelect} WHERE sandbox_id = $1 AND organization_id = $2 AND state <> 'terminated' ORDER BY port ASC`,
    [
      input.sandboxId,
      input.organizationId
    ]
  );
  return existing.rows.map(mapSandboxRouteRow);
};

export type CreateSandboxRouteResult =
  | { kind: "sandbox_not_found" }
  | { kind: "sandbox_terminated" }
  | { kind: "sandbox_route_limit_exceeded"; limit: number }
  | { kind: "organization_route_limit_exceeded"; limit: number }
  | { kind: "route_access_mode_conflict"; existing: SandboxRouteAccessMode }
  | { kind: "existing"; route: SandboxRouteSummary }
  | { kind: "created"; route: SandboxRouteSummary; accessToken?: string; accessHeaderName?: string };

export const createSandboxRoute = async (
  input: {
    organizationId: string;
    actorUserId: string;
    actorLabel: string;
    sandboxId: string;
    port: number;
    protocol: "http" | "https";
    accessMode: SandboxRouteAccessMode;
    labels?: string[];
    idempotencyKey?: string | null;
  },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder; recordAudit: Audit; idFactory?: typeof makeId }
): Promise<CreateSandboxRouteResult> => {
  const query = dependencies.query ?? defaultQuery;
  const sandbox = await query<{ id: string; opensandbox_id: string | null; status: string }>(
    "SELECT id, opensandbox_id, status FROM sandboxes WHERE id = $1 AND organization_id = $2",
    [input.sandboxId, input.organizationId]
  );
  if (!sandbox.rowCount) return { kind: "sandbox_not_found" };
  if (sandbox.rows[0].status === "terminated") return { kind: "sandbox_terminated" };

  const existing = await query<SandboxRouteRow>(
    `${routeSelect} WHERE sandbox_id = $1 AND organization_id = $2 AND port = $3 AND state <> 'terminated'`,
    [
      input.sandboxId,
      input.organizationId,
      input.port
    ]
  );
  if (existing.rowCount) {
    const route = mapSandboxRouteRow(existing.rows[0]);
    if (route.accessMode !== input.accessMode) return { kind: "route_access_mode_conflict", existing: route.accessMode };
    return { kind: "existing", route };
  }

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

  const access = input.accessMode === "token" ? createRouteAccessToken(dependencies.idFactory) : null;
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
        protocol: input.protocol,
        accessMode: input.accessMode,
        accessTokenHash: access?.hash ?? null,
        accessTokenHint: access?.hint ?? null,
        accessHeaderName: access ? sandboxRouteAccessTokenHeader : null,
        labels: input.labels ?? [],
        createdByUserId: input.actorUserId,
        createdByLabel: input.actorLabel
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
    const publicUrl = input.accessMode === "token" ? routeProxyUrl(providerRoute.routeKey) : providerRoute.url;
    const publicHost = input.accessMode === "token" ? routeHost(publicUrl) : providerRoute.host;

    await query(
      `INSERT INTO sandbox_routes
       (sandbox_id, organization_id, port, protocol, route_key, host, url, target_url, state, provider, provider_route_id,
        access_mode, access_token_hash, access_token_hint, access_header_name, created_by_user_id, created_by_label, labels, last_checked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, now())
       ON CONFLICT (sandbox_id, port) WHERE state <> 'terminated' DO NOTHING`,
      [
        input.sandboxId,
        input.organizationId,
        input.port,
        input.protocol,
        providerRoute.routeKey,
        publicHost,
        publicUrl,
        providerRoute.targetUrl,
        providerRoute.state,
        providerRoute.provider,
        providerRoute.providerRouteId,
        input.accessMode,
        access?.hash ?? null,
        access?.hint ?? null,
        access ? sandboxRouteAccessTokenHeader : null,
        input.actorUserId,
        input.actorLabel,
        input.labels ?? []
      ]
    );
    await completeSandboxOperation(
      {
        operationId: activeOperation.id,
        result: {
          routeKey: providerRoute.routeKey,
          host: publicHost,
          url: publicUrl,
          accessMode: input.accessMode,
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
    accessMode: input.accessMode,
    labels: input.labels ?? [],
    provider: providerRoute.provider,
    operationId: activeOperation.id
  });
  await dependencies.recordAudit(input.organizationId, input.actorUserId, input.actorLabel, "sandbox.route.create", "sandbox", input.sandboxId, {
    port: input.port,
    routeKey: providerRoute.routeKey,
    accessMode: input.accessMode,
    labels: input.labels ?? []
  });
  const created = await query<SandboxRouteRow>(
    `${routeSelect} WHERE sandbox_id = $1 AND organization_id = $2 AND port = $3 AND state <> 'terminated'`,
    [
      input.sandboxId,
      input.organizationId,
      input.port
    ]
  );
  return {
    kind: "created",
    route: mapSandboxRouteRow(created.rows[0]),
    accessToken: access?.token,
    accessHeaderName: access ? sandboxRouteAccessTokenHeader : undefined
  };
};

type SandboxRouteProxyRow = {
  id: string;
  routeKey: string;
  host: string;
  targetUrl: string;
  provider: string;
  state: string;
  accessMode: string;
  accessTokenHash: string | null;
  accessHeaderName: string | null;
};

export type SandboxRouteProxyTargetResult =
  | { kind: "not_found" }
  | { kind: "route_not_ready"; state: SandboxRouteState }
  | { kind: "public_route" }
  | { kind: "unauthorized"; headerName: string }
  | { kind: "ok"; targetUrl: string; headerName: string; provider: string; host: string; routeKey: string };

export const getSandboxRouteProxyTarget = async (
  input: { routeKey: string; token?: string | null },
  query: Query = defaultQuery
): Promise<SandboxRouteProxyTargetResult> => {
  const result = await query<SandboxRouteProxyRow>(
    `SELECT id::text,
            route_key AS "routeKey",
            host,
            target_url AS "targetUrl",
            provider,
            state,
            COALESCE(access_mode, 'public') AS "accessMode",
            access_token_hash AS "accessTokenHash",
            access_header_name AS "accessHeaderName"
     FROM sandbox_routes
     WHERE route_key = $1 AND state <> 'terminated'
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.routeKey]
  );
  const route = result.rows[0];
  if (!route) return { kind: "not_found" };
  const state = normalizeRouteState(route.state);
  if (state !== "ready") return { kind: "route_not_ready", state };
  const headerName = route.accessHeaderName ?? sandboxRouteAccessTokenHeader;
  if (normalizeRouteAccessMode(route.accessMode) !== "token") return { kind: "public_route" };
  if (!route.accessTokenHash || !input.token) return { kind: "unauthorized", headerName };
  const presentedHash = hashApiKey(input.token);
  if (!constantEquals(presentedHash, route.accessTokenHash)) return { kind: "unauthorized", headerName };
  await query("UPDATE sandbox_routes SET last_used_at = now(), updated_at = now() WHERE id = $1", [route.id]);
  return { kind: "ok", targetUrl: route.targetUrl, headerName, provider: route.provider, host: route.host, routeKey: route.routeKey };
};

type SandboxRouteProxyHeaderValue = string | string[] | undefined;

export type SandboxRouteProxyRequestResult =
  | Exclude<SandboxRouteProxyTargetResult, { kind: "ok" }>
  | { kind: "upstream_unreachable"; message: string }
  | { kind: "ok"; status: number; headers: Record<string, string>; body: Buffer };

const proxyBodyFromRequest = (method: string, body: unknown): string | ArrayBuffer | undefined => {
  if (method === "GET" || method === "HEAD" || body === undefined) return undefined;
  if (Buffer.isBuffer(body)) {
    const copy = new Uint8Array(body.byteLength);
    copy.set(body);
    return copy.buffer;
  }
  return typeof body === "string" ? body : JSON.stringify(body);
};

const proxyHeadersFromRequest = (headers: Record<string, SandboxRouteProxyHeaderValue>) => {
  const upstreamHeaders = new Headers();
  const skipHeaders = new Set([
    "host",
    "connection",
    "content-length",
    "transfer-encoding",
    "keep-alive",
    "upgrade",
    "proxy-authenticate",
    "proxy-authorization",
    sandboxRouteAccessTokenHeader
  ]);
  for (const [key, value] of Object.entries(headers)) {
    if (skipHeaders.has(key.toLowerCase()) || value === undefined) continue;
    if (Array.isArray(value)) value.forEach((entry) => upstreamHeaders.append(key, entry));
    else upstreamHeaders.set(key, value);
  }
  return upstreamHeaders;
};

const opensandboxGatewayProxyTarget = (target: Extract<SandboxRouteProxyTargetResult, { kind: "ok" }>) => {
  if (target.provider !== "opensandbox-gateway") return null;
  const gatewayUrl = config.openSandboxGatewayUrl.trim();
  if (!gatewayUrl) return null;
  return {
    baseUrl: gatewayUrl.replace(/\/+$/, ""),
    routeKey: target.routeKey
  };
};

export const proxySandboxRouteRequest = async (
  input: {
    routeKey: string;
    path?: string;
    url: string;
    method: string;
    headers: Record<string, SandboxRouteProxyHeaderValue>;
    body: unknown;
    token?: string | null;
  },
  dependencies: { query?: Query; fetch?: typeof fetch } = {}
): Promise<SandboxRouteProxyRequestResult> => {
  const query = dependencies.query ?? defaultQuery;
  const fetcher = dependencies.fetch ?? fetch;
  const target = await getSandboxRouteProxyTarget({ routeKey: input.routeKey, token: input.token }, query);
  if (target.kind !== "ok") return target;

  const originalUrl = new URL(input.url, "http://harakiri.local");
  originalUrl.searchParams.delete(sandboxRouteAccessTokenQueryParam);
  const gatewayTarget = opensandboxGatewayProxyTarget(target);
  const upstreamBaseUrl = gatewayTarget?.baseUrl ?? target.targetUrl;
  const upstreamBase = upstreamBaseUrl.endsWith("/") ? upstreamBaseUrl : `${upstreamBaseUrl}/`;
  const upstreamUrl = new URL(input.path ?? "", upstreamBase);
  upstreamUrl.search = originalUrl.searchParams.toString();
  const upstreamHeaders = proxyHeadersFromRequest(input.headers);
  if (gatewayTarget) upstreamHeaders.set("OpenSandbox-Ingress-To", gatewayTarget.routeKey);

  let upstream: Awaited<ReturnType<typeof fetch>>;
  try {
    upstream = await fetcher(upstreamUrl, {
      method: input.method,
      headers: upstreamHeaders,
      body: proxyBodyFromRequest(input.method, input.body)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { kind: "upstream_unreachable", message };
  }

  const headers: Record<string, string> = {};
  for (const header of ["content-type", "cache-control", "etag", "last-modified", "location"]) {
    const value = upstream.headers.get(header);
    if (value) headers[header] = value;
  }
  return { kind: "ok", status: upstream.status, headers, body: Buffer.from(await upstream.arrayBuffer()) };
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
     WHERE sandbox_id = $1 AND organization_id = $2 AND port = $3 AND state <> 'terminated'`,
    [input.sandboxId, input.organizationId, input.port]
  );
  if (!result.rowCount) return null;
  await query(
    `UPDATE sandbox_routes
     SET state = 'terminated', terminated_at = COALESCE(terminated_at, now()), updated_at = now()
     WHERE sandbox_id = $1 AND organization_id = $2 AND port = $3 AND state <> 'terminated'`,
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
