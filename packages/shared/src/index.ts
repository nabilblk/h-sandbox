export const sandboxStatuses = ["pending", "running", "idle", "pausing", "paused", "resuming", "error", "terminated"] as const;
export type { WorkspaceSummary, WorkspacePolicy, CreateWorkspaceBody, WorkspacesResponse, WorkspaceResponse } from "./workspaces.js";
export type { SandboxCommandEvent } from "./command-events.js";
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
  running: ["idle", "pausing", "error", "terminated"],
  idle: ["running", "pausing", "error", "terminated"],
  pausing: ["paused", "running", "error", "terminated"],
  paused: ["resuming", "error", "terminated"],
  resuming: ["running", "idle", "error", "terminated"],
  error: ["pending", "running", "terminated"],
  terminated: []
};

export const canTransitionSandboxStatus = (from: SandboxStatus, to: SandboxStatus) =>
  from === to || sandboxStatusTransitions[from]?.includes(to) === true;

export const sandboxOperationKinds = ["provision", "delete", "renew", "pause", "resume", "snapshot", "snapshot_delete", "route_expose"] as const;
export type SandboxOperationKind = typeof sandboxOperationKinds[number];

export const sandboxSnapshotStatuses = ["creating", "ready", "failed", "deleting", "deleted", "expired"] as const;
export type SandboxSnapshotStatus = typeof sandboxSnapshotStatuses[number];

export const sandboxOperationStates = ["queued", "running", "succeeded", "failed", "canceled"] as const;
export type SandboxOperationState = typeof sandboxOperationStates[number];

export const sandboxCommandStatuses = ["queued", "running", "succeeded", "failed", "killed"] as const;
export type SandboxCommandStatus = typeof sandboxCommandStatuses[number];

export type ApiErrorResponse<TCode extends string = string, TExtra extends Record<string, unknown> = Record<string, unknown>> = {
  error: TCode;
  message?: string;
  capacity?: OrganizationCapacity;
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
  credentialSlots?: TemplateCredentialSlot[];
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
  credentialSlots?: TemplateCredentialSlot[];
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

export type AuditEventSummary = {
  id: string;
  actorUserId: string | null;
  actorLabel: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AuditEventsResponse = {
  events: AuditEventSummary[];
  page: PageSummary;
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
  credentialSlots?: TemplateCredentialSlotInput[];
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

export type SandboxRuntimeRouteMetadata = {
  port: number;
  protocol: "http" | "https";
  accessMode: SandboxRouteAccessMode;
  state: SandboxRouteState;
  host: string;
  url: string;
  labels: string[];
};

export type SandboxRuntimeMetadata = {
  workdir: string;
  user: string;
  shell: string;
  template: {
    id: string;
    versionId: string | null;
    imageDigest: string | null;
    runtimeFamily: string;
  };
  ports: {
    default: number[];
    exposed: SandboxRuntimeRouteMetadata[];
  };
  routes: {
    mode: string;
    baseDomain: string;
    publicScheme: string;
    defaultAccessMode: SandboxRouteAccessMode;
    maxRoutesPerSandbox: number;
    maxRoutesPerOrg: number;
  };
  egress: {
    mode: EgressMode;
    presets: EgressPresetId[];
    allow: string[];
    deny: string[];
    ruleCount: number;
  };
  limits: {
    fileArtifactMaxBytes: number;
    commandTimeoutMs: number;
    terminalAttachTicketTtlSeconds: number;
  };
  lifecycle: {
    ttlSeconds: number;
    expiresAt: string | null;
    createdAt: string;
  };
  provider: {
    kind: string;
    sandboxId: string | null;
    capabilities: RuntimeCapabilitySummary[];
  };
};

export type SandboxSummary = {
  capacityPhase?: "reserved" | "active" | "releasing" | "uncertain" | "released" | null;
  workspaceId?: string | null;
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
  runtimeMetadata: SandboxRuntimeMetadata;
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
  workspaceId?: string;
  template?: string;
  snapshotId?: string;
  name?: string;
  ttlSeconds?: number;
  env?: Record<string, string>;
  egress?: EgressPolicyInput | null;
  source?: SandboxSourceInput;
  credentials?: AttachSandboxCredentialBody[];
  credentialMappings?: TemplateCredentialSlotMappingBody[];
  idempotencyKey?: string;
  wait?: boolean;
  waitTimeoutMs?: number;
};

export type CreateSandboxResponse = {
  sandbox: SandboxSummary;
  readiness?: SandboxReadiness;
  credentialAttachments?: SandboxCredentialAttachmentSummary[];
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

export type SandboxReadiness = {
  status: "ready" | "starting" | "unavailable" | "not_running" | "unsupported";
  checkedAt: string;
};

export type SandboxReadinessResponse = SandboxResponse & {
  readiness: SandboxReadiness;
};

export type SandboxSourceResponse = {
  sandbox: SandboxSummary;
};

export type SandboxSnapshotSummary = {
  id: string;
  sourceSandboxId: string | null;
  name: string | null;
  status: SandboxSnapshotStatus | string;
  statusReason: string | null;
  statusMessage: string | null;
  template: string | null;
  templateVersionId: string | null;
  templateImageDigest: string | null;
  createdByUserId: string | null;
  createdByLabel: string | null;
  metadata: Record<string, unknown>;
  providerState: Record<string, unknown>;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type CreateSandboxSnapshotBody = {
  name?: string;
  metadata?: Record<string, string>;
  expiresAt?: string | null;
  idempotencyKey?: string;
  wait?: boolean;
  waitTimeoutMs?: number;
};

export type SandboxSnapshotResponse = {
  snapshot: SandboxSnapshotSummary;
  operation?: SandboxOperationSummary;
  status?: "created" | "pending";
  message?: string;
};

export type SandboxSnapshotsResponse = {
  snapshots: SandboxSnapshotSummary[];
  page?: PageSummary;
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

export const credentialSecretSourceTypes = ["inline_ephemeral", "harakiri_encrypted", "external_ref", "dynamic"] as const;
export type CredentialSecretSourceType = typeof credentialSecretSourceTypes[number];

export type CredentialSourceCapabilities = {
  reusable: boolean;
  rehydratable: boolean;
  rotatable: boolean;
  externallyOwned: boolean;
  shortLived: boolean;
  launchOnly: boolean;
};

export const credentialSourceCapabilities: Record<CredentialSecretSourceType, CredentialSourceCapabilities> = {
  inline_ephemeral: {
    reusable: false,
    rehydratable: false,
    rotatable: false,
    externallyOwned: false,
    shortLived: false,
    launchOnly: true
  },
  harakiri_encrypted: {
    reusable: true,
    rehydratable: true,
    rotatable: true,
    externallyOwned: false,
    shortLived: false,
    launchOnly: false
  },
  external_ref: {
    reusable: true,
    rehydratable: true,
    rotatable: false,
    externallyOwned: true,
    shortLived: false,
    launchOnly: false
  },
  dynamic: {
    reusable: true,
    rehydratable: true,
    rotatable: false,
    externallyOwned: true,
    shortLived: true,
    launchOnly: false
  }
};

export const credentialVaultAttachmentStatuses = [
  "pending",
  "injected",
  "requires_reinjection",
  "detached",
  "failed"
] as const;
export type CredentialVaultAttachmentStatus = typeof credentialVaultAttachmentStatuses[number];

export const credentialVaultAuthTypes = ["bearer", "basic", "apiKey", "customHeaders", "passthrough"] as const;
export type CredentialVaultAuthType = typeof credentialVaultAuthTypes[number];

export type CredentialVaultSubstitutionLocation = "path" | "query" | "header" | "body";

export type CredentialVaultSubstitution = {
  credential?: string;
  placeholder: string;
  in: CredentialVaultSubstitutionLocation[];
};

export type CredentialVaultMatch = {
  schemes?: Array<"https" | "http">;
  hosts: string[];
  methods?: string[];
  paths?: string[];
};

export type CredentialVaultBearerAuth = {
  type: "bearer";
  credential?: string;
  substitutions?: CredentialVaultSubstitution[];
};

export type CredentialVaultBasicAuth = {
  type: "basic";
  credential?: string;
  substitutions?: CredentialVaultSubstitution[];
};

export type CredentialVaultApiKeyAuth = {
  type: "apiKey";
  name: string;
  credential?: string;
  substitutions?: CredentialVaultSubstitution[];
};

export type CredentialVaultCustomHeader = {
  name: string;
  credential?: string;
};

export type CredentialVaultCustomHeadersAuth = {
  type: "customHeaders";
  headers: CredentialVaultCustomHeader[];
  substitutions?: CredentialVaultSubstitution[];
};

export type CredentialVaultPassthroughAuth = {
  type: "passthrough";
  substitutions?: CredentialVaultSubstitution[];
};

export type CredentialVaultAuth =
  | CredentialVaultBearerAuth
  | CredentialVaultBasicAuth
  | CredentialVaultApiKeyAuth
  | CredentialVaultCustomHeadersAuth
  | CredentialVaultPassthroughAuth;

export type CredentialVaultBinding = {
  name: string;
  match: CredentialVaultMatch;
  auth: CredentialVaultAuth;
};

export const credentialProviderPresetIds = [
  "openai",
  "anthropic",
  "openrouter",
  "github",
  "gitlab",
  "npm",
  "pypi-publish"
] as const;
export type CredentialProviderPresetId = typeof credentialProviderPresetIds[number];
export const credentialProviderProfileIds = [...credentialProviderPresetIds, "custom"] as const;
export type CredentialProviderProfileId = typeof credentialProviderProfileIds[number];

export const customCredentialAuthTypes = ["bearer", "apiKey"] as const;
export type CustomCredentialAuthType = typeof customCredentialAuthTypes[number];

export type CustomCredentialProfileInput = {
  host: string;
  authType: CustomCredentialAuthType;
  headerName?: string;
  methods?: string[];
  paths?: string[];
  envName?: string;
  testPath?: string;
};

export type CustomCredentialProfile = {
  host: string;
  authType: CustomCredentialAuthType;
  headerName: string | null;
  methods: string[];
  paths: string[];
  envName: string;
  testPath: string;
};

export const customCredentialProfilesShareScope = (
  left: CustomCredentialProfile | null | undefined,
  right: CustomCredentialProfile | null | undefined
) => {
  if (!left || !right) return false;
  const scope = (profile: CustomCredentialProfile) => JSON.stringify({
    host: profile.host,
    authType: profile.authType,
    headerName: profile.headerName,
    methods: [...profile.methods].sort(),
    paths: [...profile.paths].sort()
  });
  return scope(left) === scope(right);
};

export type CredentialProviderPresetCategory = "model-api" | "git-hosting" | "package-registry";

export type CredentialProviderPresetTest = {
  target: string;
  method?: string;
};

export type CredentialProviderPreset = {
  id: CredentialProviderPresetId;
  label: string;
  description: string;
  category: CredentialProviderPresetCategory;
  defaultEnvName: string;
  credentialName: string;
  fakeEnv: Record<string, string>;
  binding: CredentialVaultBinding;
  egressDomains: string[];
  test: CredentialProviderPresetTest;
};

export type CredentialProviderPresetsResponse = {
  presets: CredentialProviderPreset[];
};

export type CredentialProviderPresetResponse = {
  preset: CredentialProviderPreset;
};

export const credentialSecretStatuses = ["active", "disabled", "deleted"] as const;
export type CredentialSecretStatus = typeof credentialSecretStatuses[number];

export const credentialSecretUsePolicies = ["admins_only", "organization_members"] as const;
export type CredentialSecretUsePolicy = typeof credentialSecretUsePolicies[number];

export type CredentialSecretUsageSummary = {
  activeSandboxCount: number;
  attachmentCount: number;
  lastAttachedAt: string | null;
};

export type CredentialSecretSummary = {
  id: string;
  name: string;
  providerPresetId: CredentialProviderProfileId;
  customProfile: CustomCredentialProfile | null;
  sourceType: "harakiri_encrypted";
  status: CredentialSecretStatus;
  usePolicy: CredentialSecretUsePolicy;
  version: number;
  fakeEnv: Record<string, string>;
  binding: CredentialVaultBinding;
  egressDomains: string[];
  hasEncryptedSecret: boolean;
  metadata: Record<string, unknown>;
  createdByUserId: string | null;
  createdByLabel: string | null;
  rotatedAt: string | null;
  disabledAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  usage: CredentialSecretUsageSummary;
  capabilities: CredentialSourceCapabilities;
};

export type CreateCredentialSecretBody = {
  name: string;
  providerPresetId: CredentialProviderProfileId;
  customProfile?: CustomCredentialProfileInput;
  value: string;
  usePolicy?: CredentialSecretUsePolicy;
  fakeEnv?: Record<string, string>;
  metadata?: Record<string, unknown>;
};

export type UpdateCredentialSecretBody = {
  usePolicy: CredentialSecretUsePolicy;
};

export type RotateCredentialSecretBody = {
  value: string;
};

export type CredentialSecretsResponse = {
  secrets: CredentialSecretSummary[];
};

export type CredentialSecretResponse = {
  secret: CredentialSecretSummary;
};

export const externalSecretResolverTypes = ["kubernetes_secret"] as const;
export type ExternalSecretResolverType = typeof externalSecretResolverTypes[number];

export const externalSecretReferenceStatuses = ["active", "disabled", "deleted"] as const;
export type ExternalSecretReferenceStatus = typeof externalSecretReferenceStatuses[number];

export const externalSecretValidationStates = [
  "unvalidated",
  "valid",
  "not_found",
  "forbidden",
  "invalid",
  "unavailable"
] as const;
export type ExternalSecretValidationState = typeof externalSecretValidationStates[number];

export type KubernetesSecretReference = {
  namespace: string;
  name: string;
  key: string;
};

export type ExternalSecretValidationSummary = {
  state: ExternalSecretValidationState;
  message: string | null;
  versionRef: string | null;
  checkedAt: string | null;
};

export type ExternalSecretReferenceSummary = {
  id: string;
  name: string;
  providerPresetId: CredentialProviderProfileId;
  customProfile: CustomCredentialProfile | null;
  sourceType: "external_ref";
  resolverType: "kubernetes_secret";
  reference: KubernetesSecretReference;
  status: ExternalSecretReferenceStatus;
  usePolicy: CredentialSecretUsePolicy;
  version: number;
  fakeEnv: Record<string, string>;
  binding: CredentialVaultBinding;
  egressDomains: string[];
  metadata: Record<string, unknown>;
  createdByUserId: string | null;
  createdByLabel: string | null;
  disabledAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  validation: ExternalSecretValidationSummary;
  usage: CredentialSecretUsageSummary;
  capabilities: CredentialSourceCapabilities;
};

export type CreateExternalSecretReferenceBody = {
  name: string;
  providerPresetId: CredentialProviderProfileId;
  customProfile?: CustomCredentialProfileInput;
  resolverType: "kubernetes_secret";
  reference: {
    namespace?: string;
    name: string;
    key: string;
  };
  usePolicy?: CredentialSecretUsePolicy;
  fakeEnv?: Record<string, string>;
  metadata?: Record<string, unknown>;
};

export type UpdateExternalSecretReferenceBody = {
  name?: string;
  providerPresetId?: CredentialProviderProfileId;
  customProfile?: CustomCredentialProfileInput;
  reference?: {
    namespace?: string;
    name: string;
    key: string;
  };
  usePolicy?: CredentialSecretUsePolicy;
  fakeEnv?: Record<string, string>;
  metadata?: Record<string, unknown>;
};

export type ExternalSecretReferencesResponse = {
  references: ExternalSecretReferenceSummary[];
};

export type ExternalSecretReferenceResponse = {
  reference: ExternalSecretReferenceSummary;
};

export const dynamicCredentialIssuerTypes = ["github_app_installation"] as const;
export type DynamicCredentialIssuerType = typeof dynamicCredentialIssuerTypes[number];

export const dynamicCredentialIssuerStatuses = ["active", "disabled", "deleted"] as const;
export type DynamicCredentialIssuerStatus = typeof dynamicCredentialIssuerStatuses[number];

export const dynamicCredentialValidationStates = [
  "unvalidated",
  "valid",
  "not_found",
  "forbidden",
  "invalid",
  "unavailable"
] as const;
export type DynamicCredentialValidationState = typeof dynamicCredentialValidationStates[number];

export type GitHubAppInstallationScope = {
  installationId: string;
  repositories: string[];
  permissions: Record<string, "read" | "write" | "admin">;
};

export type DynamicCredentialValidationSummary = {
  state: DynamicCredentialValidationState;
  message: string | null;
  checkedAt: string | null;
};

export type DynamicCredentialIssuerSummary = {
  id: string;
  name: string;
  providerPresetId: "github";
  sourceType: "dynamic";
  issuerType: "github_app_installation";
  scope: GitHubAppInstallationScope;
  status: DynamicCredentialIssuerStatus;
  usePolicy: CredentialSecretUsePolicy;
  version: number;
  fakeEnv: Record<string, string>;
  binding: CredentialVaultBinding;
  egressDomains: string[];
  metadata: Record<string, unknown>;
  createdByUserId: string | null;
  createdByLabel: string | null;
  disabledAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastIssuedAt: string | null;
  validation: DynamicCredentialValidationSummary;
  usage: CredentialSecretUsageSummary;
  capabilities: CredentialSourceCapabilities;
};

export type CreateDynamicCredentialIssuerBody = {
  name: string;
  issuerType: "github_app_installation";
  scope: GitHubAppInstallationScope;
  usePolicy?: CredentialSecretUsePolicy;
  fakeEnv?: Record<string, string>;
  metadata?: Record<string, unknown>;
};

export type UpdateDynamicCredentialIssuerBody = {
  name?: string;
  scope?: GitHubAppInstallationScope;
  usePolicy?: CredentialSecretUsePolicy;
  fakeEnv?: Record<string, string>;
  metadata?: Record<string, unknown>;
};

export type DynamicCredentialIssuersResponse = {
  issuers: DynamicCredentialIssuerSummary[];
};

export type DynamicCredentialIssuerResponse = {
  issuer: DynamicCredentialIssuerSummary;
};

export const credentialProviderPresetCatalog: Record<CredentialProviderPresetId, CredentialProviderPreset> = {
  openai: {
    id: "openai",
    label: "OpenAI API",
    description: "Inject an OpenAI-compatible bearer token for OpenAI API calls.",
    category: "model-api",
    defaultEnvName: "OPENAI_API_KEY",
    credentialName: "openai",
    fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
    binding: {
      name: "openai-api",
      match: {
        schemes: ["https"],
        hosts: ["api.openai.com"],
        methods: ["GET", "POST"],
        paths: ["/v1/*"]
      },
      auth: { type: "bearer" }
    },
    egressDomains: ["api.openai.com"],
    test: { target: "https://api.openai.com/v1/models", method: "GET" }
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic API",
    description: "Inject an Anthropic API key through the x-api-key header.",
    category: "model-api",
    defaultEnvName: "ANTHROPIC_API_KEY",
    credentialName: "anthropic",
    fakeEnv: { ANTHROPIC_API_KEY: "fake-anthropic-key" },
    binding: {
      name: "anthropic-api",
      match: {
        schemes: ["https"],
        hosts: ["api.anthropic.com"],
        methods: ["GET", "POST"],
        paths: ["/v1/*"]
      },
      auth: { type: "apiKey", name: "x-api-key" }
    },
    egressDomains: ["api.anthropic.com"],
    test: { target: "https://api.anthropic.com/v1/models", method: "GET" }
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter API",
    description: "Inject an OpenRouter bearer token for OpenAI-compatible model calls.",
    category: "model-api",
    defaultEnvName: "OPENROUTER_API_KEY",
    credentialName: "openrouter",
    fakeEnv: { OPENROUTER_API_KEY: "fake-openrouter-key" },
    binding: {
      name: "openrouter-api",
      match: {
        schemes: ["https"],
        hosts: ["openrouter.ai"],
        methods: ["GET", "POST"],
        paths: ["/api/v1/*"]
      },
      auth: { type: "bearer" }
    },
    egressDomains: ["openrouter.ai"],
    test: { target: "https://openrouter.ai/api/v1/models", method: "GET" }
  },
  github: {
    id: "github",
    label: "GitHub",
    description: "Inject a GitHub token for REST API requests and allow common GitHub source hosts.",
    category: "git-hosting",
    defaultEnvName: "GITHUB_TOKEN",
    credentialName: "github",
    fakeEnv: { GITHUB_TOKEN: "fake-github-token" },
    binding: {
      name: "github-api",
      match: {
        schemes: ["https"],
        hosts: ["api.github.com"],
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE"]
      },
      auth: { type: "bearer" }
    },
    egressDomains: ["api.github.com", "github.com", "raw.githubusercontent.com", "objects.githubusercontent.com", "codeload.github.com"],
    test: { target: "https://api.github.com/user", method: "GET" }
  },
  gitlab: {
    id: "gitlab",
    label: "GitLab",
    description: "Inject a GitLab token through the PRIVATE-TOKEN header for REST API calls.",
    category: "git-hosting",
    defaultEnvName: "GITLAB_TOKEN",
    credentialName: "gitlab",
    fakeEnv: { GITLAB_TOKEN: "fake-gitlab-token" },
    binding: {
      name: "gitlab-api",
      match: {
        schemes: ["https"],
        hosts: ["gitlab.com"],
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
        paths: ["/api/v4/*"]
      },
      auth: { type: "apiKey", name: "PRIVATE-TOKEN" }
    },
    egressDomains: ["gitlab.com"],
    test: { target: "https://gitlab.com/api/v4/user", method: "GET" }
  },
  npm: {
    id: "npm",
    label: "npm Registry",
    description: "Inject an npm token for registry.npmjs.org package registry requests.",
    category: "package-registry",
    defaultEnvName: "NPM_TOKEN",
    credentialName: "npm",
    fakeEnv: { NPM_TOKEN: "fake-npm-token" },
    binding: {
      name: "npm-registry",
      match: {
        schemes: ["https"],
        hosts: ["registry.npmjs.org"],
        methods: ["GET", "PUT", "POST", "DELETE"]
      },
      auth: { type: "bearer" }
    },
    egressDomains: ["registry.npmjs.org", "*.npmjs.org"],
    test: { target: "https://registry.npmjs.org/-/whoami", method: "GET" }
  },
  "pypi-publish": {
    id: "pypi-publish",
    label: "PyPI Publish",
    description: "Inject a PyPI upload token for package publishing requests.",
    category: "package-registry",
    defaultEnvName: "PYPI_TOKEN",
    credentialName: "pypi",
    fakeEnv: { PYPI_TOKEN: "fake-pypi-token" },
    binding: {
      name: "pypi-upload",
      match: {
        schemes: ["https"],
        hosts: ["upload.pypi.org"],
        methods: ["POST"],
        paths: ["/legacy/*"]
      },
      auth: { type: "basic" }
    },
    egressDomains: ["upload.pypi.org", "pypi.org", "files.pythonhosted.org", "*.pythonhosted.org"],
    test: { target: "https://upload.pypi.org/legacy/", method: "POST" }
  }
};

export type TemplateCredentialSlotInput = {
  id?: string;
  providerPresetId: CredentialProviderProfileId;
  customProfile?: CustomCredentialProfileInput;
  required?: boolean;
  label?: string;
  description?: string;
  envName?: string;
};

export type TemplateCredentialSlot = {
  id: string;
  providerPresetId: CredentialProviderProfileId;
  customProfile: CustomCredentialProfile | null;
  credentialName: string;
  required: boolean;
  label: string;
  description: string;
  envName: string;
  fakeEnv: Record<string, string>;
  binding: CredentialVaultBinding;
  egressDomains: string[];
  test: CredentialProviderPresetTest;
};

const templateCredentialSlotIdPattern = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const templateCredentialSlotEnvPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const customCredentialHeaderPattern = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const customCredentialMethodPattern = /^[A-Z]{3,16}$/;

const isCredentialProviderPresetId = (value: string): value is CredentialProviderPresetId =>
  credentialProviderPresetIds.includes(value as CredentialProviderPresetId);

const copyCredentialVaultMatch = (match: CredentialVaultMatch): CredentialVaultMatch => ({
  hosts: [...match.hosts],
  schemes: match.schemes ? [...match.schemes] : undefined,
  methods: match.methods ? [...match.methods] : undefined,
  paths: match.paths ? [...match.paths] : undefined
});

const copyCredentialVaultSubstitutions = (auth: CredentialVaultAuth) =>
  auth.substitutions ? auth.substitutions.map((substitution) => ({ ...substitution, in: [...substitution.in] })) : undefined;

const copyCredentialVaultAuth = (auth: CredentialVaultAuth): CredentialVaultAuth => {
  const substitutions = copyCredentialVaultSubstitutions(auth);
  if (auth.type === "bearer") return { ...auth, substitutions };
  if (auth.type === "basic") return { ...auth, substitutions };
  if (auth.type === "apiKey") return { ...auth, substitutions };
  if (auth.type === "customHeaders") return { ...auth, headers: auth.headers.map((header) => ({ ...header })), substitutions };
  return { ...auth, substitutions };
};

const copyCredentialVaultBinding = (binding: CredentialVaultBinding): CredentialVaultBinding => ({
  name: binding.name,
  match: copyCredentialVaultMatch(binding.match),
  auth: copyCredentialVaultAuth(binding.auth)
});

const normalizeCustomCredentialPath = (value: string, label: string) => {
  const path = value.trim();
  if (!path.startsWith("/") || path.length > 512 || path.includes("?") || path.includes("#")) {
    throw new Error(`${label} must be an absolute path without a query or fragment`);
  }
  return path;
};

const concreteCustomCredentialPath = (path: string) => {
  const wildcard = path.indexOf("*");
  const concrete = wildcard < 0 ? path : path.slice(0, wildcard);
  return concrete || "/";
};

export const normalizeCustomCredentialProfile = (
  input: CustomCredentialProfileInput
): CustomCredentialProfile => {
  const host = normalizeEgressTarget(input.host);
  if (host.startsWith("*.")) throw new Error("custom credential host must be exact; wildcards are not allowed");
  const methods = [...new Set((input.methods?.length ? input.methods : ["GET", "POST"]).map((method) => method.trim().toUpperCase()))];
  if (methods.length > 16 || methods.some((method) => !customCredentialMethodPattern.test(method))) {
    throw new Error("custom credential methods must contain at most 16 HTTP method names");
  }
  const paths = [...new Set((input.paths?.length ? input.paths : ["/*"]).map((path) => normalizeCustomCredentialPath(path, "custom credential path")))];
  if (paths.length > 16) throw new Error("custom credential profile supports at most 16 paths");
  const envName = input.envName?.trim() || "PRIVATE_API_KEY";
  if (!templateCredentialSlotEnvPattern.test(envName)) throw new Error("custom credential envName must be a valid environment variable name");
  const headerName = input.headerName?.trim() || null;
  if (input.authType === "apiKey" && (!headerName || !customCredentialHeaderPattern.test(headerName))) {
    throw new Error("custom API-key credentials require a valid headerName");
  }
  if (input.authType === "bearer" && headerName) throw new Error("bearer credentials do not accept headerName");
  const testPath = normalizeCustomCredentialPath(
    input.testPath ?? concreteCustomCredentialPath(paths[0] ?? "/"),
    "custom credential testPath"
  );
  if (testPath.includes("*")) throw new Error("custom credential testPath must not contain wildcards");
  return { host, authType: input.authType, headerName, methods, paths, envName, testPath };
};

export const templateCredentialSlotFromInput = (input: TemplateCredentialSlotInput): TemplateCredentialSlot => {
  if (input.providerPresetId === "custom") {
    if (!input.customProfile) throw new Error("custom credential slots require customProfile");
    const profile = normalizeCustomCredentialProfile(input.customProfile);
    const id = input.id ?? "private-api";
    if (!templateCredentialSlotIdPattern.test(id)) {
      throw new Error("template credential slot id must match [a-z0-9][a-z0-9._-]{0,79}");
    }
    const envName = input.envName ?? profile.envName;
    if (!templateCredentialSlotEnvPattern.test(envName)) {
      throw new Error("template credential slot envName must match [A-Za-z_][A-Za-z0-9_]*");
    }
    return {
      id,
      providerPresetId: "custom",
      customProfile: { ...profile, envName },
      credentialName: id,
      required: input.required ?? true,
      label: input.label ?? profile.host,
      description: input.description ?? `Inject a credential for HTTPS requests to ${profile.host}.`,
      envName,
      fakeEnv: { [envName]: "fake-private-api-key" },
      binding: {
        name: id,
        match: { schemes: ["https"], hosts: [profile.host], methods: profile.methods, paths: profile.paths },
        auth: profile.authType === "bearer"
          ? { type: "bearer" }
          : { type: "apiKey", name: profile.headerName! }
      },
      egressDomains: [profile.host],
      test: { target: `https://${profile.host}${profile.testPath}`, method: profile.methods[0] }
    };
  }
  if (!isCredentialProviderPresetId(input.providerPresetId)) {
    throw new Error(`unknown credential provider preset: ${input.providerPresetId}`);
  }
  const preset = credentialProviderPresetCatalog[input.providerPresetId];
  const id = input.id ?? preset.id;
  if (!templateCredentialSlotIdPattern.test(id)) {
    throw new Error("template credential slot id must match [a-z0-9][a-z0-9._-]{0,79}");
  }
  const envName = input.envName ?? preset.defaultEnvName;
  if (!templateCredentialSlotEnvPattern.test(envName)) {
    throw new Error("template credential slot envName must match [A-Za-z_][A-Za-z0-9_]*");
  }
  return {
    id,
    providerPresetId: preset.id,
    customProfile: null,
    credentialName: preset.credentialName,
    required: input.required ?? true,
    label: input.label ?? preset.label,
    description: input.description ?? preset.description,
    envName,
    fakeEnv: { [envName]: preset.fakeEnv[preset.defaultEnvName] ?? `fake-${preset.id}-credential` },
    binding: copyCredentialVaultBinding(preset.binding),
    egressDomains: [...preset.egressDomains],
    test: { ...preset.test }
  };
};

export const templateCredentialSlotsFromInputs = (inputs: TemplateCredentialSlotInput[] = []) => {
  const slots = inputs.map(templateCredentialSlotFromInput);
  const ids = new Set<string>();
  const envNames = new Set<string>();
  for (const slot of slots) {
    if (ids.has(slot.id)) throw new Error(`duplicate template credential slot id: ${slot.id}`);
    if (envNames.has(slot.envName)) throw new Error(`duplicate template credential slot envName: ${slot.envName}`);
    ids.add(slot.id);
    envNames.add(slot.envName);
  }
  return slots;
};

export type CredentialVaultCredentialMetadata = {
  name: string;
  sourceType: string;
  revision: number;
};

export type CredentialVaultBindingMetadata = {
  name: string;
  revision: number;
  match?: CredentialVaultMatch;
  auth?: {
    type: CredentialVaultAuthType | string;
    name?: string;
  };
};

export type CredentialVaultProviderState = {
  revision: number;
  credentials: CredentialVaultCredentialMetadata[];
  bindings: CredentialVaultBindingMetadata[];
};

export type InlineEphemeralSandboxCredentialBody = {
  sourceType?: "inline_ephemeral";
  displayName?: string;
  credentialName?: string;
  value: string;
  fakeEnv?: Record<string, string>;
  binding: {
    name?: string;
    match: CredentialVaultMatch;
    auth: CredentialVaultAuth;
  };
};

export type HarakiriEncryptedSandboxCredentialBody = {
  sourceType: "harakiri_encrypted";
  secretId: string;
  displayName?: string;
  credentialName?: string;
  bindingName?: string;
};

export type ExternalReferenceSandboxCredentialBody = {
  sourceType: "external_ref";
  referenceId: string;
  displayName?: string;
  credentialName?: string;
  bindingName?: string;
};

export type DynamicSandboxCredentialBody = {
  sourceType: "dynamic";
  issuerId: string;
  displayName?: string;
  credentialName?: string;
  bindingName?: string;
};

export type AttachSandboxCredentialBody =
  | InlineEphemeralSandboxCredentialBody
  | HarakiriEncryptedSandboxCredentialBody
  | ExternalReferenceSandboxCredentialBody
  | DynamicSandboxCredentialBody;

export type InlineEphemeralTemplateCredentialSourceBody = {
  sourceType?: "inline_ephemeral";
  displayName?: string;
  credentialName?: string;
  bindingName?: string;
  value: string;
  fakeEnv?: Record<string, string>;
};

export type TemplateCredentialSlotSourceBody =
  | InlineEphemeralTemplateCredentialSourceBody
  | HarakiriEncryptedSandboxCredentialBody
  | ExternalReferenceSandboxCredentialBody
  | DynamicSandboxCredentialBody;

export type TemplateCredentialSlotMappingBody = {
  slotId?: string;
  providerPresetId?: CredentialProviderProfileId;
  source: TemplateCredentialSlotSourceBody;
};

export type SandboxCredentialAttachmentSummary = {
  id: string;
  sandboxId: string;
  displayName: string;
  sourceType: CredentialSecretSourceType;
  sourceRef: string | null;
  credentialName: string;
  bindingName: string;
  match: CredentialVaultMatch;
  auth: CredentialVaultAuth;
  fakeEnv: Record<string, string>;
  status: CredentialVaultAttachmentStatus;
  provider: string;
  providerRevision: number | null;
  providerState: "unknown" | "present" | "missing" | "unavailable";
  providerCheckedAt: string | null;
  providerMetadata: Record<string, unknown>;
  sourceMetadata: Record<string, unknown>;
  expiresAt: string | null;
  refreshState: "not_applicable" | "current" | "expiring" | "expired" | "refresh_failed";
  refreshAttemptedAt: string | null;
  refreshedAt: string | null;
  lastError: string | null;
  injectedAt: string | null;
  detachedAt: string | null;
  createdByUserId: string | null;
  createdByLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SandboxCredentialsResponse = {
  attachments: SandboxCredentialAttachmentSummary[];
};

export type InspectSandboxCredentialsResponse = SandboxCredentialsResponse & {
  vault: CredentialVaultProviderState | null;
};

export type AttachSandboxCredentialResponse = {
  attachment: SandboxCredentialAttachmentSummary;
  vault: CredentialVaultProviderState;
};

export type RefreshSandboxCredentialResponse = AttachSandboxCredentialResponse;

export type DetachSandboxCredentialResponse = {
  attachment: SandboxCredentialAttachmentSummary;
  vault: CredentialVaultProviderState | null;
};

export type RehydrateSandboxCredentialsResponse = {
  attachments: SandboxCredentialAttachmentSummary[];
  vault: CredentialVaultProviderState | null;
  rehydrated: number;
  skipped: number;
  failed: number;
};

export type TestSandboxCredentialBody = {
  target?: string;
  method?: string;
  timeoutMs?: number;
};

export type TestSandboxCredentialResponse = {
  attachmentId: string;
  target: string;
  normalizedTarget: string;
  url: string;
  method: string;
  ok: boolean;
  status: "reachable" | "blocked_or_unreachable" | "binding_mismatch" | "not_injected" | "sandbox_not_running" | "provider_unavailable";
  httpStatus: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  checkedAt: string;
};

export const runtimeCapabilityNames = [
  "persistentWorkspaces",
  "commandStream",
  "lifecycle",
  "lifecycleRenew",
  "lifecycleKill",
  "lifecycleReconnect",
  "lifecyclePause",
  "lifecycleResume",
  "lifecycleSnapshot",
  "snapshotList",
  "snapshotDelete",
  "createFromSnapshot",
  "commandRun",
  "commands",
  "detachedCommands",
  "commandLogs",
  "commandLogTail",
  "commandKill",
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
  "credentialVault",
  "credentialVaultPatch",
  "credentialVaultSanitizedRead",
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

export * from "./authorization.js";

export type ApiKeySummary = {
  id: string;
  name: string;
  prefix: string;
  lastFour: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  scopes: import("./authorization.js").ApiKeyScope[];
  expiresAt: string | null;
  createdByUserId: string | null;
  legacy: boolean;
};

export type ApiKeysResponse = {
  keys: ApiKeySummary[];
  allowedScopes?: import("./authorization.js").ApiKeyScope[];
  canManageAll?: boolean;
};

export type CreateApiKeyBody = {
  name: string;
  scopes?: import("./authorization.js").ApiKeyScope[];
  expiresAt?: string;
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
  /** Counts retained sandbox records, including failed creates, not billable executions. */
  sandboxesSpawned: number;
  /** @deprecated Unmeasured. Compatibility placeholder; consult coverage. */
  computeHours: number;
  /** @deprecated Unmeasured. Template boot estimates are not observed cold starts. */
  avgColdStartMs: number;
  /** @deprecated Unmeasured. Compatibility placeholder; consult coverage. */
  avgRuntimeSeconds: number;
  /** Running records at observation time; not a provider-level capacity measurement. */
  concurrentNow: number;
  /** Execution reservations, distinct from the running observation. Absent on older servers. */
  capacity?: OrganizationCapacity;
  /** @deprecated Unmeasured. Compatibility placeholder; consult coverage. */
  concurrentPeak: number;
  series: number[];
  topTemplates: Array<{ label: string; value: number }>;
  statusBreakdown: Array<{ label: string; value: number }>;
  /** Absent on older servers. Do not interpret absence as measured history. */
  coverage?: {
    source: "control_plane_records";
    period: "retained_records";
    observedAt: string;
    unavailableMetrics: Array<"computeHours" | "avgColdStartMs" | "avgRuntimeSeconds" | "concurrentPeak" | "series">;
    concurrencyLimitEnforced: boolean;
  };
};

export type OrganizationCapacity = {
  state: "enforced" | "reconciling" | "quarantined";
  limit: number;
  revision: number;
  inUse: number | null;
  available: number | null;
  overLimit: number | null;
  breakdown: { reserved: number; active: number; releasing: number; uncertain: number } | null;
  observedAt: string;
};

export type OrganizationCapacityResponse = { capacity: OrganizationCapacity };

export type OrganizationSettings = {
  id?: string;
  name: string;
  slug: string;
  idleTtlSeconds: number;
  /** Maximum concurrent execution reservations. Lowering this never evicts existing work. */
  maxConcurrency: number;
  capacityRevision?: number;
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

export type UpdateOrganizationSettingsBody = Partial<Omit<OrganizationSettings, "id" | "capacityRevision">> & {
  /** Required when changing maxConcurrency. Read capacityRevision from settings first. */
  expectedCapacityRevision?: number;
};

export type AccountCapabilities = {
  canManageMembers: boolean;
  canManageCredentialSecrets: boolean;
  canManageSettings?: boolean;
  canManageAllApiKeys?: boolean;
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

export const sandboxGitOperationNames = [
  "clone",
  "status",
  "branches",
  "checkout",
  "create-branch",
  "delete-branch",
  "add",
  "commit",
  "pull",
  "push",
  "remotes",
  "remote-add",
  "config-set",
  "config-get",
  "configure-user"
] as const;

export type SandboxGitOperationName = typeof sandboxGitOperationNames[number];

export type SandboxGitOperationMetadata = {
  capability: "git";
  operation: SandboxGitOperationName;
  cwd?: string;
  targetPath?: string;
  repositoryUrl?: string;
  branch?: string;
  ref?: string;
  remote?: string;
  configKey?: string;
  credentialPersistence?: GitCredentialPersistence;
  hasCredentials?: boolean;
};

export type SandboxCommandMetadata = SandboxGitOperationMetadata;

export type RunSandboxBody = {
  command?: string;
  stdin?: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  metadata?: SandboxCommandMetadata;
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
  finishReason: "exit" | "error" | "killed" | "timeout" | "unknown" | null;
  signal: string | null;
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
  metadata?: SandboxCommandMetadata;
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

export type SandboxFileTransferMetadata = {
  mode: "json-base64";
  encoding: "base64";
  maxBytes: number;
};

export type SandboxFileUploadResponse = {
  file: SandboxFileEntry;
  sizeBytes: number;
  sha256: string;
  transfer: SandboxFileTransferMetadata;
};

export type SandboxFileDownloadResponse = {
  path: string;
  contentBase64: string;
  sizeBytes: number;
  sha256: string;
  transfer: SandboxFileTransferMetadata;
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

export { openApiDocument, openApiJson, openApiPathMethodPairs } from "./openapi.js";
