import type { RunResult } from "@harakiri/shared";
import type { RegistryImageAuth } from "../../registry-credentials.js";
import type { RuntimeTemplate } from "../../templates.js";

export type RuntimeProviderKind = "opensandbox" | "dev" | string;

export type RuntimeSandboxState = "pending" | "running" | "idle" | "error" | "terminated" | string;

export type RuntimeSandboxRef = {
  provider: RuntimeProviderKind;
  providerSandboxId: string;
};

export type RuntimeSandboxSummary = RuntimeSandboxRef & {
  state: RuntimeSandboxState;
  expiresAt: string | null;
  metadata?: Record<string, string>;
};

export type RuntimeCreateSandboxInput = {
  template: RuntimeTemplate;
  ttlSeconds: number;
  name: string;
  organizationId?: string;
  metadata?: Record<string, string>;
  env?: Record<string, string>;
  imageAuth?: RegistryImageAuth | null;
};

export type RuntimeCreateSandboxResult = RuntimeSandboxSummary & {
  runtimeRegistryCredentialId: string | null;
  runtimeImageAuthProvided: boolean;
};

export type RuntimeRunInput = RuntimeSandboxRef & {
  controlPlaneSandboxId: string;
  command: string;
  stdin?: string;
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

export type RuntimeRenewInput = {
  expiresAt: string;
};

export type RuntimeProviderCapabilities = {
  terminal: boolean;
  filesystem: boolean;
  logs: boolean;
  metrics: boolean;
  routes: boolean;
};

export interface RuntimeProvider {
  readonly kind: RuntimeProviderKind;
  readonly capabilities: RuntimeProviderCapabilities;

  create(input: RuntimeCreateSandboxInput): Promise<RuntimeCreateSandboxResult>;
  list(): Promise<RuntimeSandboxSummary[]>;
  get(ref: RuntimeSandboxRef): Promise<RuntimeSandboxSummary | null>;
  delete(ref: RuntimeSandboxRef): Promise<void>;
  renew(ref: RuntimeSandboxRef, input: RuntimeRenewInput): Promise<void>;
  run(input: RuntimeRunInput): Promise<RunResult>;
  files(input: RuntimeListFilesInput): Promise<RuntimeFileListResult>;
  logs(ref: RuntimeSandboxRef): Promise<RuntimeLogEntry[]>;
  metrics(ref: RuntimeSandboxRef): Promise<RuntimeMetricsSnapshot | null>;
  exposeRoute(input: RuntimeExposeRouteInput): Promise<RuntimeRouteTarget>;
}
