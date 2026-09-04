import type {
  CredentialVaultBinding,
  CredentialVaultProviderState,
  EgressNetworkPolicy,
  EgressNetworkRule,
  RunResult,
  SandboxFileEncoding
} from "@harakiri/shared";
import type { WebSocket } from "ws";
import type { RegistryImageAuth } from "../../registry-credentials.js";
import type { RuntimeTemplate } from "../../templates.js";

export type RuntimeProviderKind = "opensandbox" | "dev" | string;

export class RuntimeUnsupportedError extends Error {
  readonly code = "runtime_unsupported";

  constructor(message: string) {
    super(message);
    this.name = "RuntimeUnsupportedError";
  }
}

export type RuntimeSandboxState = "pending" | "running" | "idle" | "pausing" | "paused" | "resuming" | "error" | "terminated" | string;

export type RuntimeSnapshotState = "creating" | "ready" | "failed" | "deleting" | "deleted" | "expired" | string;

export type RuntimeSandboxRef = {
  provider: RuntimeProviderKind;
  providerSandboxId: string;
};

export type RuntimeSandboxSummary = RuntimeSandboxRef & {
  state: RuntimeSandboxState;
  expiresAt: string | null;
  metadata?: Record<string, string>;
};

export type RuntimeSnapshotRef = {
  provider: RuntimeProviderKind;
  providerSnapshotId: string;
};

export type RuntimeSnapshotSummary = RuntimeSnapshotRef & {
  sourceProviderSandboxId: string | null;
  name: string | null;
  state: RuntimeSnapshotState;
  reason?: string | null;
  message?: string | null;
  metadata?: Record<string, string>;
  providerState?: Record<string, unknown>;
  createdAt?: string | null;
};

export type RuntimeCreateSandboxInput = {
  template: RuntimeTemplate;
  ttlSeconds: number;
  name: string;
  organizationId?: string;
  snapshot?: RuntimeSnapshotRef;
  metadata?: Record<string, string>;
  env?: Record<string, string>;
  imageAuth?: RegistryImageAuth | null;
  egressPolicy?: EgressNetworkPolicy | null;
};

export type RuntimeCreateSandboxResult = RuntimeSandboxSummary & {
  runtimeRegistryCredentialId: string | null;
  runtimeImageAuthProvided: boolean;
};

export type RuntimeRunInput = RuntimeSandboxRef & {
  controlPlaneSandboxId: string;
  command: string;
  stdin?: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
};

export type RuntimeCommandStatus = "queued" | "running" | "succeeded" | "failed" | "killed";

export type RuntimeStartCommandInput = RuntimeRunInput & {
  detached?: boolean;
};

export type RuntimeStartedCommand = {
  providerCommandId: string | null;
  status: RuntimeCommandStatus;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number;
};

export type RuntimeCommandState = {
  providerCommandId: string;
  command?: string;
  status: RuntimeCommandStatus;
  exitCode: number | null;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type RuntimeCommandLogs = {
  stdout: string;
  stderr: string;
  cursor?: number;
};

export type RuntimeCommandSession = {
  providerSessionId: string;
  cwd?: string | null;
};

export type RuntimeCreateCommandSessionInput = RuntimeSandboxRef & {
  cwd?: string;
};

export type RuntimeRunCommandSessionInput = RuntimeSandboxRef & {
  providerSessionId: string;
  command: string;
  cwd?: string;
  timeoutMs?: number;
};

export type RuntimeCommandSessionRun = {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs?: number;
};

export type RuntimePtySession = {
  providerSessionId: string;
};

export type RuntimeCreatePtySessionInput = RuntimeSandboxRef & {
  cwd?: string;
  cols?: number;
  rows?: number;
  shell?: string;
  env?: Record<string, string>;
  sessionName?: string;
};

export type RuntimePtySessionStatus = {
  providerSessionId: string;
  running: boolean;
  outputOffset?: number;
};

export type RuntimePtyAttachInput = RuntimeSandboxRef & {
  providerSessionId: string;
  client: WebSocket;
  since?: number;
  pty?: boolean;
};

export type RuntimeFileEntry = {
  path: string;
  name: string;
  type: "file" | "directory" | "symlink" | "other";
  size: number;
  mode?: string;
  owner?: string;
  group?: string;
  modifiedAt?: string | null;
};

export type RuntimeFileListSuccess = {
  ok: true;
  cwd: string;
  defaultCwd: string;
  files: RuntimeFileEntry[];
  source: "native-directory-listing" | "search" | "provider-command" | string;
  warnings?: string[];
};

export type RuntimeFileListUnavailable = {
  ok: false;
  cwd: string;
  defaultCwd: string;
  files: [];
  error: {
    code: string;
    message: string;
    recoverable: boolean;
  };
};

export type RuntimeFileListResult = RuntimeFileListSuccess | RuntimeFileListUnavailable;

export type RuntimeListFilesInput = RuntimeSandboxRef & {
  path?: string;
  defaultCwd: string;
};

export type RuntimeFileError = {
  code: "file_not_found" | "file_permission_denied" | "runtime_files_unavailable" | "invalid_file_path" | string;
  message: string;
  recoverable: boolean;
  statusCode?: number;
};

export type RuntimeFileResult<T> = { ok: true } & T | { ok: false; error: RuntimeFileError };

export type RuntimeFilePathInput = RuntimeSandboxRef & {
  path: string;
  defaultCwd: string;
};

export type RuntimeReadFileInput = RuntimeFilePathInput & {
  encoding: SandboxFileEncoding;
};

export type RuntimeWriteFileInput = RuntimeFilePathInput & {
  content: string;
  encoding: SandboxFileEncoding;
  createParents?: boolean;
  mode?: string;
};

export type RuntimeMkdirInput = RuntimeFilePathInput & {
  recursive?: boolean;
};

export type RuntimeRemoveFileInput = RuntimeFilePathInput & {
  recursive?: boolean;
};

export type RuntimeRenameFileInput = RuntimeSandboxRef & {
  fromPath: string;
  toPath: string;
  defaultCwd: string;
};

export type RuntimeLogEntry = {
  ts: string;
  lvl: string;
  msg: string;
  source: "control-plane" | "sandbox";
};

export type RuntimeMetricsSnapshot = {
  current: {
    cpu: number;
    mem: number;
    diskIo: number;
    networkOut: number;
    cpuCount?: number;
    memTotal?: number;
  };
  series: Array<{ ts: string; cpu: number; mem: number }>;
};

export type RuntimeRouteTarget = {
  routeKey: string;
  host: string;
  url: string;
  targetUrl: string;
  provider: string;
  providerRouteId: string | null;
  state: "provisioning" | "ready" | "unhealthy";
};

export type RuntimeExposeRouteInput = RuntimeSandboxRef & {
  port: number;
  protocol: "http" | "https";
};

export type RuntimeEgressPolicyStatus = {
  status?: string;
  mode?: string;
  enforcementMode?: string;
  credentialVaultReady?: boolean;
  reason?: string;
  policy: EgressNetworkPolicy | null;
};

export type RuntimeCredentialVaultValue = {
  name: string;
  value: string;
};

export type RuntimeCredentialVaultApplyInput = RuntimeSandboxRef & {
  credentials: RuntimeCredentialVaultValue[];
  bindings: CredentialVaultBinding[];
};

export type RuntimeCredentialVaultDeleteInput = RuntimeSandboxRef & {
  credentialNames: string[];
  bindingNames: string[];
};

export type RuntimeRenewInput = {
  expiresAt: string;
};

export type RuntimeCreateSnapshotInput = RuntimeSandboxRef & {
  name?: string;
  metadata?: Record<string, string>;
};

export type RuntimeProviderCapabilities = {
  terminal: boolean;
  terminalAttach?: boolean;
  terminalResize?: boolean;
  shellSessions?: boolean;
  sessionCommands?: boolean;
  filesystem: boolean;
  logs: boolean;
  metrics: boolean;
  routes: boolean;
  egress?: boolean;
  credentialVault?: boolean;
  credentialVaultPatch?: boolean;
  credentialVaultSanitizedRead?: boolean;
  credentialVaultRequiresRehydration?: boolean;
  pause?: boolean;
  resume?: boolean;
  snapshots?: boolean;
};

export interface RuntimeProvider {
  readonly kind: RuntimeProviderKind;
  readonly capabilities: RuntimeProviderCapabilities;

  create(input: RuntimeCreateSandboxInput): Promise<RuntimeCreateSandboxResult>;
  list(): Promise<RuntimeSandboxSummary[]>;
  get(ref: RuntimeSandboxRef): Promise<RuntimeSandboxSummary | null>;
  delete(ref: RuntimeSandboxRef): Promise<void>;
  renew(ref: RuntimeSandboxRef, input: RuntimeRenewInput): Promise<void>;
  pause?(ref: RuntimeSandboxRef): Promise<RuntimeSandboxSummary>;
  resume?(ref: RuntimeSandboxRef): Promise<RuntimeSandboxSummary>;
  createSnapshot?(input: RuntimeCreateSnapshotInput): Promise<RuntimeSnapshotSummary>;
  listSnapshots?(): Promise<RuntimeSnapshotSummary[]>;
  getSnapshot?(ref: RuntimeSnapshotRef): Promise<RuntimeSnapshotSummary | null>;
  deleteSnapshot?(ref: RuntimeSnapshotRef): Promise<void>;
  run(input: RuntimeRunInput): Promise<RunResult>;
  startCommand?(input: RuntimeStartCommandInput): Promise<RuntimeStartedCommand>;
  getCommand?(ref: RuntimeSandboxRef & { providerCommandId: string }): Promise<RuntimeCommandState>;
  commandLogs?(ref: RuntimeSandboxRef & { providerCommandId: string; cursor?: number }): Promise<RuntimeCommandLogs>;
  interruptCommand?(ref: RuntimeSandboxRef & { providerCommandId: string }): Promise<void>;
  createCommandSession?(input: RuntimeCreateCommandSessionInput): Promise<RuntimeCommandSession>;
  runCommandSession?(input: RuntimeRunCommandSessionInput): Promise<RuntimeCommandSessionRun>;
  deleteCommandSession?(input: RuntimeSandboxRef & { providerSessionId: string }): Promise<void>;
  createPtySession?(input: RuntimeCreatePtySessionInput): Promise<RuntimePtySession>;
  getPtySession?(input: RuntimeSandboxRef & { providerSessionId: string }): Promise<RuntimePtySessionStatus>;
  deletePtySession?(input: RuntimeSandboxRef & { providerSessionId: string }): Promise<void>;
  attachPtySession?(input: RuntimePtyAttachInput): Promise<void>;
  files(input: RuntimeListFilesInput): Promise<RuntimeFileListResult>;
  statFile?(input: RuntimeFilePathInput): Promise<RuntimeFileResult<{ file: RuntimeFileEntry }>>;
  readFile?(input: RuntimeReadFileInput): Promise<RuntimeFileResult<{ path: string; encoding: SandboxFileEncoding; content: string }>>;
  writeFile?(input: RuntimeWriteFileInput): Promise<RuntimeFileResult<{ file: RuntimeFileEntry }>>;
  mkdir?(input: RuntimeMkdirInput): Promise<RuntimeFileResult<{ file: RuntimeFileEntry }>>;
  removeFile?(input: RuntimeRemoveFileInput): Promise<RuntimeFileResult<{ path: string }>>;
  renameFile?(input: RuntimeRenameFileInput): Promise<RuntimeFileResult<{ file: RuntimeFileEntry }>>;
  logs(ref: RuntimeSandboxRef): Promise<RuntimeLogEntry[]>;
  metrics(ref: RuntimeSandboxRef): Promise<RuntimeMetricsSnapshot | null>;
  exposeRoute(input: RuntimeExposeRouteInput): Promise<RuntimeRouteTarget>;
  getEgressPolicy?(ref: RuntimeSandboxRef): Promise<RuntimeEgressPolicyStatus>;
  setEgressPolicy?(ref: RuntimeSandboxRef, policy: EgressNetworkPolicy): Promise<RuntimeEgressPolicyStatus>;
  patchEgressRules?(ref: RuntimeSandboxRef, rules: EgressNetworkRule[]): Promise<RuntimeEgressPolicyStatus>;
  getCredentialVault?(ref: RuntimeSandboxRef): Promise<CredentialVaultProviderState | null>;
  applyCredentialVault?(input: RuntimeCredentialVaultApplyInput): Promise<CredentialVaultProviderState>;
  deleteCredentialVaultEntries?(input: RuntimeCredentialVaultDeleteInput): Promise<CredentialVaultProviderState | null>;
}
