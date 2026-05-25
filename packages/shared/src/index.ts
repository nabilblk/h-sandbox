export const sandboxStatuses = ["pending", "running", "idle", "error", "terminated"] as const;
export type SandboxStatus = typeof sandboxStatuses[number];

export const sandboxStatusTransitions: Record<SandboxStatus, SandboxStatus[]> = {
  pending: ["running", "error", "terminated"],
  running: ["idle", "error", "terminated"],
  idle: ["running", "error", "terminated"],
  error: ["pending", "terminated"],
  terminated: []
};

export const canTransitionSandboxStatus = (from: SandboxStatus, to: SandboxStatus) =>
  from === to || sandboxStatusTransitions[from]?.includes(to) === true;

export const sandboxOperationKinds = ["provision", "delete", "renew", "route_expose"] as const;
export type SandboxOperationKind = typeof sandboxOperationKinds[number];

export const sandboxOperationStates = ["queued", "running", "succeeded", "failed", "canceled"] as const;
export type SandboxOperationState = typeof sandboxOperationStates[number];

export type ApiErrorResponse<TCode extends string = string, TExtra extends Record<string, unknown> = Record<string, unknown>> = {
  error: TCode;
  message?: string;
} & TExtra;

export const apiErrorResponse = <TCode extends string, TExtra extends Record<string, unknown> = Record<string, never>>(
  error: TCode,
  extra?: TExtra
): ApiErrorResponse<TCode, TExtra> => ({ error, ...(extra ?? {}) }) as ApiErrorResponse<TCode, TExtra>;

export const isApiErrorResponse = (value: unknown): value is ApiErrorResponse => {
  if (!value || typeof value !== "object") return false;
  return typeof (value as { error?: unknown }).error === "string";
};

export const parseApiErrorResponse = (body: string): ApiErrorResponse | null => {
  try {
    const parsed = JSON.parse(body) as unknown;
    return isApiErrorResponse(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const formatApiErrorResponse = (status: number, body: string) => {
  const parsed = parseApiErrorResponse(body);
  if (!parsed) return `Harakiri API ${status}: ${body || "request failed"}`;
  return `Harakiri API ${status}: ${parsed.message ? `${parsed.error}: ${parsed.message}` : parsed.error}`;
};

export type Template = {
  id: string;
  name: string;
  description: string;
  image: string;
  imageDigest?: string | null;
  icon: "py" | "node" | "globe" | "box" | "file";
  tags: string[];
  aliases: string[];
  bootMs: number;
  visibility: "public" | "private" | "internal";
  status: string;
  ownerScope?: "platform" | "team";
  defaultEntrypoint: string[];
  cpuCount: number;
  memoryMb: number;
  workdir: string;
  defaultPorts: number[];
  runtimeFamily: string;
  latestVersionId?: string | null;
  latestBuildId?: string | null;
  latestBuildStatus?: string | null;
  latestBuildCreatedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type TemplateVersionSummary = {
  id: string;
  templateId: string;
  buildId: string | null;
  versionNumber: number;
  aliases: string[];
  imageUri: string;
  imageDigest: string | null;
  status: string;
  defaultEntrypoint: string[];
  cpuCount: number;
  memoryMb: number;
  workdir: string;
  defaultPorts: number[];
  envSchema: Record<string, unknown>;
  metadata: Record<string, unknown>;
  sbomRef: string | null;
  provenance: Record<string, unknown>;
  scanStatus: string;
  scanSummary: Record<string, unknown>;
  createdAt: string;
  promotedAt: string | null;
};

export type TemplateBuildSummary = {
  id: string;
  organizationId: string;
  templateId: string;
  status: "queued" | "building" | "success" | "failed" | "canceled" | string;
  sourceType: "dockerfile" | "git" | "image" | string;
  contextHash: string | null;
  dockerfilePath: string | null;
  buildArgs: Record<string, unknown>;
  imageDestination: string | null;
  imageDigest: string | null;
  resultVersionId?: string | null;
  logRef: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
  context?: TemplateBuildContextSummary | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TemplateBuildLogEntry = {
  lineNo: number;
  stream: string;
  message: string;
  createdAt: string;
};

export type TemplateBuildContextSummary = {
  buildId: string;
  sha256: string;
  sizeBytes: number;
  format: string;
  fileCount: number | null;
  metadata?: Record<string, unknown>;
  uploadedAt: string;
};

export type PageSummary = {
  total: number;
  limit: number;
  offset: number;
};

export type TemplateResponse = {
  template: Template;
};

export type TemplatesResponse = {
  templates: Template[];
  page?: PageSummary;
};

export type TemplateVersionsResponse = {
  versions: TemplateVersionSummary[];
};

export type CreateTemplateBody = {
  id?: string;
  name: string;
  description?: string;
  image?: string;
  icon?: Template["icon"];
  tags?: string[];
  aliases?: string[];
  visibility?: Template["visibility"];
  defaultEntrypoint?: string[];
  cpuCount?: number;
  memoryMb?: number;
  workdir?: string;
  defaultPorts?: number[];
  runtimeFamily?: string;
};

export type PromoteTemplateBody = {
  versionId: string;
  alias?: string;
};

export type TemplateBuildResponse = {
  build: TemplateBuildSummary;
};

export type TemplateBuildsResponse = {
  builds: TemplateBuildSummary[];
};

export type TemplateBuildLogsResponse = {
  logs: TemplateBuildLogEntry[];
};

export type CreateTemplateBuildBody = {
  sourceType?: "dockerfile" | "git" | "image";
  contextHash?: string;
  dockerfilePath?: string;
  buildArgs?: Record<string, unknown>;
  imageDestination?: string;
  metadata?: Record<string, unknown>;
};

export type UploadTemplateBuildContextBody = {
  archiveBase64: string;
  sha256: string;
  sizeBytes: number;
  format?: "tar+gzip";
  fileCount?: number;
  metadata?: Record<string, unknown>;
};

export type TemplateBuildContextResponse = {
  context: TemplateBuildContextSummary;
};

export type SandboxSummary = {
  id: string;
  opensandboxId?: string | null;
  name: string;
  template: string;
  status: SandboxStatus;
  cpu: number;
  mem: number;
  started: string;
  owner: string;
  cost: number;
  ttlSeconds: number;
  expiresAt: string | null;
  publicUrl: string | null;
  templateVersionId?: string | null;
  templateImageDigest?: string | null;
  createdAt: string;
};

export type SandboxOperationSummary = {
  id: string;
  sandboxId: string | null;
  kind: SandboxOperationKind;
  state: SandboxOperationState;
  error: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateSandboxBody = {
  template?: string;
  name?: string;
  ttlSeconds?: number;
  env?: Record<string, string>;
  idempotencyKey?: string;
  wait?: boolean;
  waitTimeoutMs?: number;
};

export type CreateSandboxResponse = {
  sandbox: SandboxSummary;
  operation?: SandboxOperationSummary;
  status?: "created" | "pending";
  message?: string;
};

export type SandboxesResponse = {
  sandboxes: SandboxSummary[];
};

export type SandboxResponse = {
  sandbox: SandboxSummary;
};

export const sandboxRouteStates = ["provisioning", "ready", "unhealthy", "terminated"] as const;
export type SandboxRouteState = typeof sandboxRouteStates[number];

export type SandboxRouteSummary = {
  port: number;
  protocol: "http" | "https";
  routeKey: string;
  host: string;
  url: string;
  targetUrl: string;
  state: SandboxRouteState;
  provider: string;
  providerRouteId: string | null;
  createdAt: string;
  lastCheckedAt: string | null;
  terminatedAt: string | null;
};

export type ExposeSandboxRouteBody = {
  port: number;
  protocol?: "http" | "https";
};

export type SandboxRouteResponse = {
  route: SandboxRouteSummary;
};

export type SandboxRoutesResponse = {
  routes: SandboxRouteSummary[];
};

export type ApiKeySummary = {
  id: string;
  name: string;
  prefix: string;
  lastFour: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type ApiKeysResponse = {
  keys: ApiKeySummary[];
};

export type CreateApiKeyBody = {
  name: string;
};

export type CreateApiKeyResponse = {
  key: ApiKeySummary;
  token: string;
};

export type RegistryCredentialPurpose = "pull" | "push" | "push_pull";

export type RegistryCredentialSummary = {
  id: string;
  name: string;
  registryHost: string;
  username: string | null;
  secretRef: string | null;
  purpose: RegistryCredentialPurpose;
  repositoryPrefix: string;
  pullSecretRef: string | null;
  pushSecretRef: string | null;
  hasEncryptedSecret: boolean;
  metadata: Record<string, unknown>;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpsertRegistryCredentialBody = {
  name: string;
  registryHost: string;
  username?: string;
  secretRef?: string;
  secret?: string;
  purpose?: RegistryCredentialPurpose;
  repositoryPrefix?: string;
  pullSecretRef?: string;
  pushSecretRef?: string;
  metadata?: Record<string, unknown>;
};

export type RegistryCredentialsResponse = {
  credentials: RegistryCredentialSummary[];
};

export type RegistryCredentialResponse = {
  credential: RegistryCredentialSummary;
};

export type UsageSummary = {
  sandboxesSpawned: number;
  computeHours: number;
  avgColdStartMs: number;
  avgRuntimeSeconds: number;
  concurrentNow: number;
  concurrentPeak: number;
  series: number[];
  topTemplates: Array<{ label: string; value: number }>;
  statusBreakdown: Array<{ label: string; value: number }>;
};

export type OrganizationSettings = {
  id?: string;
  name: string;
  slug: string;
  idleTtlSeconds: number;
  maxConcurrency: number;
  defaultTemplateId: string | null;
};

export type OrganizationSettingsResponse = {
  organization: OrganizationSettings;
};

export type CurrentAccountResponse = {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    onboardingCompletedAt: string | null;
  };
  auth: {
    userId: string;
    organizationId: string;
    actorLabel: string;
    authType?: string;
    [key: string]: unknown;
  };
  organization: OrganizationSettings;
};

export type CompleteOnboardingResponse = {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    onboardingCompletedAt: string;
  };
};

export type RunResult = {
  sandboxId: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
};

export type RunSandboxBody = {
  command?: string;
  stdin?: string;
};

export type RunSandboxResponse = {
  result: RunResult;
};

export type SandboxLogEntry = {
  ts: string;
  lvl: string;
  msg: string;
  source?: string;
};

export type SandboxLogsResponse = {
  logs: SandboxLogEntry[];
};

export type SandboxFileEntry = {
  path: string;
  name: string;
  type: string;
  size: number;
  mode?: string;
  owner?: string;
  group?: string;
  modifiedAt?: string | null;
};

export type SandboxFilesResponse = {
  cwd: string;
  files: SandboxFileEntry[];
};

export type SandboxMetricsResponse = {
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

export type OkResponse = {
  ok: boolean;
};

export type HealthResponse = {
  status: "ok";
};

export type BootstrapResponse = {
  apiUrl: string;
  keycloak: {
    url: string;
    realm: string;
    clientId: string;
  };
};

export const TEMPLATES: Template[] = [
  {
    id: "python-3.12",
    name: "Python 3.12",
    description: "Bare Python with pip + uv.",
    image: "python:3.12-slim",
    icon: "py",
    tags: ["python", "cli"],
    aliases: ["python"],
    bootMs: 126,
    visibility: "public",
    status: "ready",
    defaultEntrypoint: ["sleep", "3600"],
    cpuCount: 1,
    memoryMb: 1024,
    workdir: "/",
    defaultPorts: [],
    runtimeFamily: "python"
  },
  {
    id: "python-3.12-data",
    name: "Python 3.12 (data)",
    description: "Numpy, pandas, polars, matplotlib.",
    image: "python:3.12-slim",
    icon: "py",
    tags: ["python", "data"],
    aliases: ["python-data"],
    bootMs: 137,
    visibility: "public",
    status: "ready",
    defaultEntrypoint: ["sleep", "3600"],
    cpuCount: 2,
    memoryMb: 2048,
    workdir: "/",
    defaultPorts: [],
    runtimeFamily: "python-data"
  },
  {
    id: "node-20",
    name: "Node 20",
    description: "Node + pnpm + bun.",
    image: "node:20-bookworm-slim",
    icon: "node",
    tags: ["node", "js"],
    aliases: ["node"],
    bootMs: 142,
    visibility: "public",
    status: "ready",
    defaultEntrypoint: ["sleep", "3600"],
    cpuCount: 1,
    memoryMb: 1024,
    workdir: "/",
    defaultPorts: [3000, 5173],
    runtimeFamily: "node"
  },
  {
    id: "node-20-chromium",
    name: "Node 20 + Chromium",
    description: "Headless browser for agents.",
    image: "mcr.microsoft.com/playwright:v1.57.0-noble",
    icon: "globe",
    tags: ["browser", "node"],
    aliases: ["browser"],
    bootMs: 184,
    visibility: "public",
    status: "ready",
    defaultEntrypoint: ["sleep", "3600"],
    cpuCount: 2,
    memoryMb: 2048,
    workdir: "/",
    defaultPorts: [3000, 5173, 4321, 8000],
    runtimeFamily: "browser"
  },
  {
    id: "ubuntu-24.04",
    name: "Ubuntu 24.04",
    description: "Plain devbox, root, apt available.",
    image: "ubuntu:24.04",
    icon: "box",
    tags: ["os"],
    aliases: ["ubuntu"],
    bootMs: 119,
    visibility: "public",
    status: "ready",
    defaultEntrypoint: ["sleep", "3600"],
    cpuCount: 1,
    memoryMb: 1024,
    workdir: "/",
    defaultPorts: [],
    runtimeFamily: "linux"
  },
  {
    id: "custom",
    name: "Custom Dockerfile",
    description: "Bring your own image.",
    image: "ubuntu:24.04",
    icon: "file",
    tags: ["custom"],
    aliases: [],
    bootMs: 220,
    visibility: "internal",
    status: "ready",
    defaultEntrypoint: ["sleep", "3600"],
    cpuCount: 2,
    memoryMb: 2048,
    workdir: "/workspace",
    defaultPorts: [3000, 5173, 4321, 8000],
    runtimeFamily: "custom"
  }
];

export const statusLabel = (status: SandboxStatus) => {
  if (status === "pending") return "running";
  return status;
};

export const apiPath = (path: string) => `/v1${path.startsWith("/") ? path : `/${path}`}`;

export { openApiDocument, openApiJson, openApiPathMethodPairs } from "./openapi.js";
