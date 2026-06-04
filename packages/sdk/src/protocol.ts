export const sandboxStatuses = ["pending", "running", "idle", "error", "terminated"] as const;
export type SandboxStatus = typeof sandboxStatuses[number];

export {
  isKnownSandboxRuntimeApiErrorCode,
  providerUnavailableApiErrorCodes,
  runtimePolicyApiErrorCodes,
  sandboxConflictApiErrorCodes,
  sandboxRuntimeApiErrorCodes,
  timeoutApiErrorCodes,
  unsupportedCapabilityApiErrorCodes,
  type ProviderUnavailableApiErrorCode,
  type RuntimePolicyApiErrorCode,
  type SandboxConflictApiErrorCode,
  type SandboxRuntimeApiErrorCode,
  type TimeoutApiErrorCode,
  type UnsupportedCapabilityApiErrorCode
} from "./api-errors.js";

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

export const sandboxCommandStatuses = ["queued", "running", "succeeded", "failed", "killed"] as const;
export type SandboxCommandStatus = typeof sandboxCommandStatuses[number];

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
  egressPolicy?: EgressPolicyInput | null;
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
  egressPolicy?: EgressPolicyInput | null;
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
  egressPolicy?: EgressPolicyInput | null;
};

export type UpdateTemplateEgressBody = {
  egressPolicy: EgressPolicyInput;
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

export type GitCredentialPersistence = "one-shot" | "dangerously-store-in-remote";

export type SandboxGitSourceInput = {
  type: "git";
  url: string;
  branch?: string;
  commit?: string;
  targetPath?: string;
  depth?: number;
  shallow?: boolean;
  submodules?: boolean | "recursive";
  credentialPersistence?: GitCredentialPersistence;
  applyEgressPreset?: boolean;
  timeoutMs?: number;
};

export type SandboxSourceInput = SandboxGitSourceInput;

export type SandboxSourceStatus = "requested" | "cloning" | "ready" | "failed";

export type SandboxGitSourceProvenance = Omit<SandboxGitSourceInput, "applyEgressPreset" | "timeoutMs"> & {
  type: "git";
  url: string;
  targetPath: string;
  status: SandboxSourceStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
  failureReason?: string | null;
};

export type SandboxSourceProvenance = SandboxGitSourceProvenance;

export type PatchSandboxSourceBody = {
  source: SandboxSourceProvenance | null;
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
  egressPolicy?: EgressPolicyInput | null;
  source?: SandboxSourceProvenance | null;
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
  egress?: EgressPolicyInput | null;
  source?: SandboxSourceInput;
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

export type SandboxSourceResponse = {
  sandbox: SandboxSummary;
};

export const sandboxRouteStates = ["provisioning", "ready", "unhealthy", "terminated"] as const;
export type SandboxRouteState = typeof sandboxRouteStates[number];
export const sandboxRouteAccessModes = ["public", "token"] as const;
export type SandboxRouteAccessMode = typeof sandboxRouteAccessModes[number];

export type SandboxRouteSummary = {
  port: number;
  protocol: "http" | "https";
  accessMode: SandboxRouteAccessMode;
  accessHeaderName: string | null;
  tokenHint: string | null;
  labels: string[];
  createdByUserId: string | null;
  createdByLabel: string | null;
  routeKey: string;
  host: string;
  url: string;
  targetUrl: string;
  state: SandboxRouteState;
  provider: string;
  providerRouteId: string | null;
  createdAt: string;
  lastCheckedAt: string | null;
  lastUsedAt: string | null;
  terminatedAt: string | null;
};

export type ExposeSandboxRouteBody = {
  port: number;
  protocol?: "http" | "https";
  accessMode?: SandboxRouteAccessMode;
  labels?: string[];
};

export type SandboxRouteResponse = {
  route: SandboxRouteSummary;
  accessToken?: string;
  accessHeaderName?: string;
};

export type SandboxRoutesResponse = {
  routes: SandboxRouteSummary[];
};

export const runtimeCapabilityNames = [
  "lifecycle",
  "commandRun",
  "commands",
  "commandLogs",
  "terminalAttach",
  "terminalResize",
  "shellSessions",
  "sessionCommands",
  "filesystemList",
  "filesystemRead",
  "filesystemWrite",
  "routes",
  "tokenRoutes",
  "git",
  "egressPolicy",
  "logs",
  "metrics"
] as const;
export type RuntimeCapabilityName = typeof runtimeCapabilityNames[number];

export const runtimeCapabilityStates = ["available", "degraded", "unavailable"] as const;
export type RuntimeCapabilityState = typeof runtimeCapabilityStates[number];

export const runtimeCapabilityContracts = [
  "opensandbox_spec",
  "opensandbox_provider",
  "harakiri_control_plane",
  "unavailable",
  "unsupported"
] as const;
export type RuntimeCapabilityContract = typeof runtimeCapabilityContracts[number];

export type RuntimeCapabilitySummary = {
  name: RuntimeCapabilityName;
  state: RuntimeCapabilityState;
  contract: RuntimeCapabilityContract;
  source: string;
  required: boolean;
  reason: string | null;
};

export type RuntimeCapabilitiesResponse = {
  provider: string;
  capabilities: RuntimeCapabilitySummary[];
  generatedAt: string;
};

export type SandboxTerminalAttachOptions = {
  cwd?: string;
  shell?: string;
  env?: Record<string, string>;
  sessionName?: string;
  cols?: number;
  rows?: number;
  since?: number;
  pty?: boolean;
};

export type SandboxTerminalAttachTicketResponse = {
  ticket: string;
  expiresAt: string;
  attachUrl: string;
};

export const egressModes = ["open", "restricted", "blocked", "custom"] as const;
export type EgressMode = typeof egressModes[number];

export const egressPresetIds = [
  "python-package-install",
  "node-package-install",
  "git-hosting",
  "llm-apis",
  "browser-basic"
] as const;
export type EgressPresetId = typeof egressPresetIds[number];

export type EgressRuleAction = "allow" | "deny";

export type EgressNetworkRule = {
  action: EgressRuleAction;
  target: string;
};

export type EgressNetworkPolicy = {
  defaultAction: EgressRuleAction;
  egress: EgressNetworkRule[];
};

export type EgressPolicyInput = {
  mode?: EgressMode;
  presets?: EgressPresetId[];
  allow?: string[];
  deny?: string[];
  defaultAction?: EgressRuleAction;
};

export type EgressPolicyRule = EgressNetworkRule & {
  source: "preset" | "template" | "sandbox" | "custom";
  presetId?: EgressPresetId;
};

export type EgressProviderStatus = {
  available: boolean;
  status?: string;
  mode?: string;
  enforcementMode?: string;
  reason?: string;
  error?: string;
  checkedAt?: string;
};

export type EgressPolicySummary = {
  mode: EgressMode;
  presets: EgressPresetId[];
  allow: string[];
  deny: string[];
  rules: EgressPolicyRule[];
  compiledPolicy: EgressNetworkPolicy | null;
  providerStatus?: EgressProviderStatus;
  updatedAt?: string | null;
};

export type SandboxEgressResponse = {
  egress: EgressPolicySummary;
};

export type PatchSandboxEgressBody = {
  mode?: EgressMode;
  presets?: EgressPresetId[];
  allow?: string[];
  deny?: string[];
  reset?: boolean;
};

export type TestSandboxEgressBody = {
  target: string;
};

export type TestSandboxEgressResponse = {
  target: string;
  normalizedTarget: string;
  url: string;
  ok: boolean;
  status: "reachable" | "blocked_or_unreachable" | "sandbox_not_running" | "provider_unavailable";
  stdout: string;
  stderr: string;
  durationMs: number;
};

export const egressPresetCatalog: Record<EgressPresetId, { label: string; description: string; domains: string[] }> = {
  "python-package-install": {
    label: "Python packages",
    description: "Allow pip, uv, PyPI, and Python package artifacts.",
    domains: ["pypi.org", "*.pypi.org", "files.pythonhosted.org", "*.pythonhosted.org", "astral.sh", "*.astral.sh"]
  },
  "node-package-install": {
    label: "Node packages",
    description: "Allow npm registry and Node distribution endpoints.",
    domains: ["registry.npmjs.org", "*.npmjs.org", "nodejs.org", "*.nodejs.org"]
  },
  "git-hosting": {
    label: "Git hosting",
    description: "Allow GitHub source, API, raw, and archive downloads.",
    domains: ["github.com", "api.github.com", "raw.githubusercontent.com", "objects.githubusercontent.com", "codeload.github.com"]
  },
  "llm-apis": {
    label: "LLM APIs",
    description: "Allow common hosted model API domains.",
    domains: ["api.openai.com", "api.anthropic.com", "opencode.ai"]
  },
  "browser-basic": {
    label: "Browser basic",
    description: "Use open mode with explicit deny rules for risky endpoints.",
    domains: []
  }
};

const invalidEgressTargetReason = (target: string) => {
  const trimmed = target.trim().toLowerCase().replace(/\.$/, "");
  if (!trimmed) return "domain is required";
  if (trimmed === "*" || trimmed === "*.") return "bare wildcards are not supported";
  if (/^https?:\/\//i.test(trimmed)) return "use a hostname, not a URL";
  if (/[/?#]/.test(trimmed)) return "paths and query strings are not supported";
  if (/\s/.test(trimmed)) return "spaces are not supported";
  if (trimmed.includes(":")) return "ports and IP literals are not supported";
  if (trimmed === "localhost" || trimmed.endsWith(".localhost")) return "localhost is not supported";
  if (trimmed === "169.254.169.254") return "metadata endpoints are not supported";
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(trimmed)) return "IP addresses are not supported";
  const body = trimmed.startsWith("*.") ? trimmed.slice(2) : trimmed;
  if (!body.includes(".")) return "use a fully qualified domain name";
  const labels = body.split(".");
  if (labels.some((label) => !label || label.length > 63)) return "domain labels must be 1-63 characters";
  if (labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    return "domain labels may contain letters, numbers, and hyphens";
  }
  return null;
};

export const normalizeEgressTarget = (target: string) => {
  const normalized = target.trim().toLowerCase().replace(/\.$/, "");
  const reason = invalidEgressTargetReason(normalized);
  if (reason) throw new Error(`invalid egress target "${target}": ${reason}`);
  return normalized;
};

export const isEgressTargetValid = (target: string) => invalidEgressTargetReason(target) === null;

const uniqueNormalizedTargets = (values: string[] | undefined) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values ?? []) {
    const normalized = normalizeEgressTarget(value);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
};

const validPresetIds = new Set<string>(egressPresetIds);

const normalizePresets = (presets: EgressPresetId[] | undefined) => {
  const seen = new Set<EgressPresetId>();
  const result: EgressPresetId[] = [];
  for (const preset of presets ?? []) {
    if (!validPresetIds.has(preset)) throw new Error(`invalid egress preset "${preset}"`);
    if (seen.has(preset)) continue;
    seen.add(preset);
    result.push(preset);
  }
  return result;
};

const inferEgressMode = (input?: EgressPolicyInput | null): EgressMode => {
  if (input?.mode) return input.mode;
  if ((input?.presets?.length ?? 0) > 0 || (input?.allow?.length ?? 0) > 0) return "restricted";
  if ((input?.deny?.length ?? 0) > 0) return "open";
  return "open";
};

export const compileEgressPolicy = (input?: EgressPolicyInput | null): EgressPolicySummary => {
  const mode = inferEgressMode(input);
  const presets = normalizePresets(input?.presets);
  const presetAllowRules = presets.flatMap((presetId) =>
    egressPresetCatalog[presetId].domains.map((target) => ({
      action: "allow" as const,
      target: normalizeEgressTarget(target),
      source: "preset" as const,
      presetId
    }))
  );
  const explicitAllow = uniqueNormalizedTargets(input?.allow);
  const explicitDeny = uniqueNormalizedTargets(input?.deny);
  const allowRules: EgressPolicyRule[] = [
    ...presetAllowRules,
    ...explicitAllow.map((target) => ({ action: "allow" as const, target, source: "sandbox" as const }))
  ];
  const denyRules: EgressPolicyRule[] = explicitDeny.map((target) => ({ action: "deny" as const, target, source: "sandbox" as const }));
  const dedupedRules: EgressPolicyRule[] = [];
  const seen = new Set<string>();
  for (const rule of [...allowRules, ...denyRules]) {
    const key = `${rule.action}:${rule.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedRules.push(rule);
  }

  if (mode === "blocked") {
    const compiledPolicy = { defaultAction: "deny" as const, egress: [] };
    return { mode, presets: [], allow: [], deny: [], rules: [], compiledPolicy };
  }

  if (mode === "open") {
    const compiledPolicy = denyRules.length
      ? { defaultAction: "allow" as const, egress: denyRules.map(({ action, target }) => ({ action, target })) }
      : null;
    return { mode, presets: [], allow: [], deny: explicitDeny, rules: denyRules, compiledPolicy };
  }

  const defaultAction = mode === "custom" ? input?.defaultAction ?? (denyRules.length > 0 && allowRules.length === 0 ? "allow" : "deny") : "deny";
  const rules = defaultAction === "allow" ? denyRules : dedupedRules;
  return {
    mode,
    presets,
    allow: explicitAllow,
    deny: explicitDeny,
    rules,
    compiledPolicy: {
      defaultAction,
      egress: rules.map(({ action, target }) => ({ action, target }))
    }
  };
};

export const defaultEgressPolicyInput: EgressPolicyInput = { mode: "open", presets: [], allow: [], deny: [] };

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
  defaultEgressPolicy: EgressPolicyInput;
  egressAllowedPresets: EgressPresetId[];
  egressCustomDomainsEnabled: boolean;
  egressMaxRules: number;
  egressRedactDomains: boolean;
};

export type OrganizationSettingsResponse = {
  organization: OrganizationSettings;
};

export type AccountCapabilities = {
  canManageMembers: boolean;
};

export type OrganizationMemberRole = "admin" | "member" | string;
export type OrganizationMemberStatus = "active" | "sent" | "send_failed" | "pending" | "expired" | "accepted" | "canceled";

export type OrganizationMemberSummary = {
  id: string;
  kind: "member" | "invitation";
  userId: string | null;
  membershipId: string | null;
  invitationId: string | null;
  email: string;
  fullName: string | null;
  role: OrganizationMemberRole;
  status: OrganizationMemberStatus;
  keycloakLinked: boolean;
  joinedAt: string | null;
  invitedAt: string | null;
  expiresAt: string | null;
  lastError: string | null;
  actions: {
    canResend: boolean;
    canCancel: boolean;
    canRemove: boolean;
  };
};

export type OrganizationMembersResponse = {
  members: OrganizationMemberSummary[];
};

export type AddOrganizationMemberBody = {
  email: string;
};

export type AddOrganizationMemberResponse = {
  member: OrganizationMemberSummary;
  created: boolean;
};

export type OrganizationInvitationResponse = AddOrganizationMemberResponse;

export type OrganizationMemberMutationResponse = {
  member: OrganizationMemberSummary;
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
  role: OrganizationMemberRole;
  capabilities: AccountCapabilities;
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
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
};

export type RunSandboxResponse = {
  result: RunResult;
};

export type SandboxCommandSessionStatus = "running" | "closed";

export type SandboxCommandSessionSummary = {
  id: string;
  sandboxId: string;
  provider: string;
  cwd: string | null;
  status: SandboxCommandSessionStatus;
};

export type CreateSandboxCommandSessionBody = {
  cwd?: string;
};

export type SandboxCommandSessionResponse = {
  session: SandboxCommandSessionSummary;
};

export type RunSandboxCommandSessionBody = {
  command: string;
  cwd?: string;
  timeoutMs?: number;
};

export type RunSandboxCommandSessionResponse = {
  result: RunResult;
};

export type SandboxCommandSummary = {
  id: string;
  sandboxId: string;
  provider: string;
  providerCommandId: string | null;
  command: string;
  status: SandboxCommandStatus;
  cwd: string | null;
  envKeys: string[];
  timeoutMs: number | null;
  detached: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateSandboxCommandBody = {
  command: string;
  stdin?: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  detached?: boolean;
};

export type SandboxCommandResponse = {
  command: SandboxCommandSummary;
};

export type SandboxCommandsResponse = {
  commands: SandboxCommandSummary[];
};

export type SandboxCommandLogsResponse = {
  commandId: string;
  stdout: string;
  stderr: string;
  cursor?: number;
  tail?: number;
  stdoutTruncated?: boolean;
  stderrTruncated?: boolean;
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

export const sandboxFileEncodings = ["utf8", "base64"] as const;
export type SandboxFileEncoding = typeof sandboxFileEncodings[number];

export type SandboxFilesResponse = {
  cwd: string;
  files: SandboxFileEntry[];
  source?: string;
  warnings?: string[];
};

export type SandboxFileStatResponse = {
  file: SandboxFileEntry;
};

export type SandboxFileReadResponse = {
  path: string;
  encoding: SandboxFileEncoding;
  content: string;
};

export type SandboxFileWriteBody = {
  path: string;
  content: string;
  encoding?: SandboxFileEncoding;
  createParents?: boolean;
  mode?: string;
};

export type SandboxFileWriteResponse = {
  file: SandboxFileEntry;
};

export type SandboxFileUploadBody = {
  path: string;
  contentBase64: string;
  sizeBytes?: number;
  sha256?: string;
  createParents?: boolean;
  mode?: string;
};

export type SandboxFileUploadResponse = {
  file: SandboxFileEntry;
  sizeBytes: number;
  sha256: string;
};

export type SandboxFileDownloadResponse = {
  path: string;
  contentBase64: string;
  sizeBytes: number;
  sha256: string;
};

export type SandboxFileMkdirBody = {
  path: string;
  recursive?: boolean;
};

export type SandboxFileMkdirResponse = {
  file: SandboxFileEntry;
};

export type SandboxFileRenameBody = {
  fromPath: string;
  toPath: string;
};

export type SandboxFileRenameResponse = {
  file: SandboxFileEntry;
};

export type SandboxFileRemoveResponse = {
  ok: boolean;
  path: string;
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
