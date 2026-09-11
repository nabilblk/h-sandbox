import { observeCommandStream, type CommandStreamOptions } from "./command-stream.js";
import type { WorkspaceResponse, WorkspacesResponse, CreateWorkspaceBody } from "./workspaces.js";
import type { OrganizationCapacityResponse } from "./protocol.js";
export type { OrganizationCapacity, OrganizationCapacityResponse } from "./protocol.js";
export { readCommandEvents, observeCommandStream, CommandStreamError, type CommandStreamOptions } from "./command-stream.js";
export type { WorkspaceSummary, WorkspacePolicy, CreateWorkspaceBody, WorkspacesResponse, WorkspaceResponse } from "./workspaces.js";
export type { SandboxCommandEvent } from "./command-events.js";
import type {
  ApiErrorResponse,
  ApiKeysResponse,
  AuditEventSummary,
  AuditEventsResponse,
  AttachSandboxCredentialBody,
  AttachSandboxCredentialResponse,
  CredentialProviderPreset,
  CredentialProviderPresetCategory,
  CredentialProviderPresetId,
  CredentialProviderProfileId,
  CredentialProviderPresetResponse,
  CredentialProviderPresetsResponse,
  CredentialProviderPresetTest,
  CredentialSecretResponse,
  CredentialSecretsResponse,
  CredentialSecretSourceType,
  CredentialSourceCapabilities,
  CredentialSecretStatus,
  CredentialSecretSummary,
  CredentialSecretUsageSummary,
  CredentialSecretUsePolicy,
  CredentialVaultAttachmentStatus,
  CredentialVaultAuth,
  CredentialVaultAuthType,
  CredentialVaultBinding,
  CredentialVaultBindingMetadata,
  CredentialVaultCredentialMetadata,
  CredentialVaultMatch,
  CredentialVaultProviderState,
  CredentialVaultSubstitution,
  CredentialVaultSubstitutionLocation,
  CustomCredentialAuthType,
  CustomCredentialProfile,
  CustomCredentialProfileInput,
  CreateExternalSecretReferenceBody,
  CreateDynamicCredentialIssuerBody,
  DynamicCredentialIssuerResponse,
  DynamicCredentialIssuersResponse,
  DynamicCredentialIssuerStatus,
  DynamicCredentialIssuerSummary,
  DynamicCredentialIssuerType,
  DynamicCredentialValidationState,
  DynamicCredentialValidationSummary,
  DynamicSandboxCredentialBody,
  EgressMode,
  EgressPolicyInput,
  EgressPresetId,
  ExternalReferenceSandboxCredentialBody,
  ExternalSecretReferenceResponse,
  ExternalSecretReferencesResponse,
  ExternalSecretReferenceStatus,
  ExternalSecretReferenceSummary,
  ExternalSecretResolverType,
  ExternalSecretValidationState,
  ExternalSecretValidationSummary,
  HarakiriEncryptedSandboxCredentialBody,
  GitHubAppInstallationScope,
  InlineEphemeralTemplateCredentialSourceBody,
  InlineEphemeralSandboxCredentialBody,
  InspectSandboxCredentialsResponse,
  KubernetesSecretReference,
  TemplateCredentialSlotMappingBody,
  TemplateCredentialSlotSourceBody,
  CreateCredentialSecretBody,
  CreateTemplateBody,
  CreateTemplateBuildBody,
  CreateSandboxCommandSessionBody,
  CreateSandboxCommandBody,
  CreateSandboxBody,
  CreateSandboxResponse,
  CreateSandboxSnapshotBody,
  DetachSandboxCredentialResponse,
  ExposeSandboxRouteBody,
  OkResponse,
  PromoteTemplateBody,
  RefreshSandboxCredentialResponse,
  RehydrateSandboxCredentialsResponse,
  RotateCredentialSecretBody,
  UpdateCredentialSecretBody,
  UpdateDynamicCredentialIssuerBody,
  UpdateExternalSecretReferenceBody,
  PatchSandboxSourceBody,
  RegistryCredentialResponse,
  RegistryCredentialsResponse,
  RunSandboxBody,
  RunSandboxResponse,
  RunSandboxCommandSessionBody,
  RunSandboxCommandSessionResponse,
  RuntimeCapabilitiesResponse,
  RuntimeCapabilityName,
  SandboxCredentialAttachmentSummary,
  SandboxCredentialsResponse,
  SandboxCommandLogsResponse,
  SandboxCommandMetadata,
  SandboxCommandResponse,
  SandboxCommandSessionResponse,
  SandboxCommandSummary,
  SandboxCommandStatus,
  SandboxCommandsResponse,
  SandboxFilesResponse,
  SandboxFileMkdirBody,
  SandboxFileMkdirResponse,
  SandboxFileDownloadResponse,
  SandboxFileReadResponse,
  SandboxFileRemoveResponse,
  SandboxFileRenameBody,
  SandboxFileRenameResponse,
  SandboxFileStatResponse,
  SandboxFileTransferMetadata,
  SandboxFileUploadBody,
  SandboxFileUploadResponse,
  SandboxFileWriteBody,
  SandboxFileWriteResponse,
  SandboxEgressResponse,
  SandboxLogsResponse,
  SandboxMetricsResponse,
  SandboxResponse,
  SandboxSnapshotResponse,
  SandboxSnapshotsResponse,
  SandboxSnapshotStatus,
  SandboxSnapshotSummary,
  SandboxSourceProvenance,
  SandboxSourceResponse,
  SandboxGitOperationMetadata,
  SandboxGitOperationName,
  SandboxRouteResponse,
  SandboxRouteSummary,
  SandboxRoutesResponse,
  SandboxRuntimeMetadata,
  SandboxStatus,
  SandboxSummary,
  SandboxTerminalAttachOptions,
  SandboxTerminalAttachTicketResponse,
  PatchSandboxEgressBody,
  SandboxesResponse,
  TestSandboxCredentialBody,
  TestSandboxCredentialResponse,
  TemplateBuildContextResponse,
  TemplateBuildLogsResponse,
  TemplateBuildResponse,
  TemplateBuildsResponse,
  TemplateCredentialSlot,
  TemplateCredentialSlotInput,
  TemplateResponse,
  TemplatesResponse,
  TemplateVersionsResponse,
  UpsertRegistryCredentialBody,
  UploadTemplateBuildContextBody,
  TestSandboxEgressBody,
  TestSandboxEgressResponse,
  UsageSummary
} from "./protocol.js";
import {
  credentialProviderPresetCatalog,
  formatApiErrorResponse,
  parseApiErrorResponse,
  providerUnavailableApiErrorCodes,
  timeoutApiErrorCodes,
  unsupportedCapabilityApiErrorCodes
} from "./protocol.js";

export {
  credentialSourceCapabilities,
  credentialSecretStatuses,
  credentialSecretUsePolicies,
  credentialProviderPresetCatalog,
  credentialProviderPresetIds,
  credentialProviderProfileIds,
  customCredentialAuthTypes,
  dynamicCredentialIssuerStatuses,
  dynamicCredentialIssuerTypes,
  dynamicCredentialValidationStates,
  egressModes,
  egressPresetCatalog,
  egressPresetIds,
  externalSecretReferenceStatuses,
  externalSecretResolverTypes,
  externalSecretValidationStates,
  providerUnavailableApiErrorCodes,
  runtimeCapabilityNames,
  sandboxCommandStatuses,
  sandboxRuntimeApiErrorCodes,
  sandboxStatuses,
  timeoutApiErrorCodes,
  unsupportedCapabilityApiErrorCodes
} from "./protocol.js";

export type {
  ApiErrorResponse,
  ApiKeysResponse,
  AuditEventSummary,
  AuditEventsResponse,
  AttachSandboxCredentialBody,
  AttachSandboxCredentialResponse,
  CredentialProviderPreset,
  CredentialProviderPresetCategory,
  CredentialProviderPresetId,
  CredentialProviderProfileId,
  CredentialProviderPresetResponse,
  CredentialProviderPresetsResponse,
  CredentialProviderPresetTest,
  CredentialSecretResponse,
  CredentialSecretsResponse,
  CredentialSecretSourceType,
  CredentialSourceCapabilities,
  CredentialSecretStatus,
  CredentialSecretSummary,
  CredentialSecretUsageSummary,
  CredentialSecretUsePolicy,
  CredentialVaultAttachmentStatus,
  CredentialVaultAuth,
  CredentialVaultAuthType,
  CredentialVaultBinding,
  CredentialVaultBindingMetadata,
  CredentialVaultCredentialMetadata,
  CredentialVaultMatch,
  CredentialVaultProviderState,
  CredentialVaultSubstitution,
  CredentialVaultSubstitutionLocation,
  CustomCredentialAuthType,
  CustomCredentialProfile,
  CustomCredentialProfileInput,
  CreateExternalSecretReferenceBody,
  CreateDynamicCredentialIssuerBody,
  DynamicCredentialIssuerResponse,
  DynamicCredentialIssuersResponse,
  DynamicCredentialIssuerStatus,
  DynamicCredentialIssuerSummary,
  DynamicCredentialIssuerType,
  DynamicCredentialValidationState,
  DynamicCredentialValidationSummary,
  DynamicSandboxCredentialBody,
  EgressMode,
  EgressPolicyInput,
  EgressPresetId,
  ExternalReferenceSandboxCredentialBody,
  ExternalSecretReferenceResponse,
  ExternalSecretReferencesResponse,
  ExternalSecretReferenceStatus,
  ExternalSecretReferenceSummary,
  ExternalSecretResolverType,
  ExternalSecretValidationState,
  ExternalSecretValidationSummary,
  HarakiriEncryptedSandboxCredentialBody,
  GitHubAppInstallationScope,
  InlineEphemeralTemplateCredentialSourceBody,
  InlineEphemeralSandboxCredentialBody,
  InspectSandboxCredentialsResponse,
  KubernetesSecretReference,
  TemplateCredentialSlotMappingBody,
  TemplateCredentialSlotSourceBody,
  CreateCredentialSecretBody,
  CreateTemplateBody,
  CreateTemplateBuildBody,
  CreateSandboxCommandSessionBody,
  CreateSandboxCommandBody,
  CreateSandboxBody,
  CreateSandboxResponse,
  CreateSandboxSnapshotBody,
  ExposeSandboxRouteBody,
  OkResponse,
  PromoteTemplateBody,
  RefreshSandboxCredentialResponse,
  RehydrateSandboxCredentialsResponse,
  RotateCredentialSecretBody,
  UpdateCredentialSecretBody,
  UpdateDynamicCredentialIssuerBody,
  UpdateExternalSecretReferenceBody,
  PatchSandboxSourceBody,
  RegistryCredentialPurpose,
  RegistryCredentialResponse,
  RegistryCredentialsResponse,
  RunSandboxBody,
  RunSandboxResponse,
  RunSandboxCommandSessionBody,
  RunSandboxCommandSessionResponse,
  RuntimeCapabilitiesResponse,
  RuntimeCapabilityName,
  SandboxCredentialAttachmentSummary,
  SandboxCredentialsResponse,
  SandboxCommandLogsResponse,
  SandboxCommandMetadata,
  SandboxCommandResponse,
  SandboxCommandSessionResponse,
  SandboxCommandSummary,
  SandboxCommandStatus,
  SandboxCommandsResponse,
  SandboxEgressResponse,
  SandboxFilesResponse,
  SandboxFileMkdirBody,
  SandboxFileMkdirResponse,
  SandboxFileDownloadResponse,
  SandboxFileReadResponse,
  SandboxFileRemoveResponse,
  SandboxFileRenameBody,
  SandboxFileRenameResponse,
  SandboxFileStatResponse,
  SandboxFileTransferMetadata,
  SandboxFileUploadBody,
  SandboxFileUploadResponse,
  SandboxFileWriteBody,
  SandboxFileWriteResponse,
  SandboxLogsResponse,
  SandboxMetricsResponse,
  SandboxResponse,
  SandboxSnapshotResponse,
  SandboxSnapshotsResponse,
  SandboxSnapshotStatus,
  SandboxSnapshotSummary,
  SandboxSourceProvenance,
  SandboxSourceResponse,
  SandboxGitOperationMetadata,
  SandboxGitOperationName,
  SandboxRouteResponse,
  SandboxRouteSummary,
  SandboxRoutesResponse,
  SandboxRuntimeMetadata,
  SandboxStatus,
  SandboxSummary,
  SandboxTerminalAttachOptions,
  SandboxTerminalAttachTicketResponse,
  DetachSandboxCredentialResponse,
  PatchSandboxEgressBody,
  SandboxesResponse,
  TestSandboxCredentialBody,
  TestSandboxCredentialResponse,
  TemplateBuildContextResponse,
  TemplateBuildLogsResponse,
  TemplateBuildResponse,
  TemplateBuildsResponse,
  TemplateBuildSummary,
  TemplateCredentialSlot,
  TemplateCredentialSlotInput,
  TemplateResponse,
  TemplatesResponse,
  TemplateVersionsResponse,
  UpsertRegistryCredentialBody,
  UploadTemplateBuildContextBody,
  TestSandboxEgressBody,
  TestSandboxEgressResponse,
  UsageSummary
} from "./protocol.js";

export type HarakiriClientOptions = {
  apiUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
};

export type GitCredentialPersistence = "one-shot" | "dangerously-store-in-remote";

export type GitTokenCredentials = {
  type?: "token";
  token: string;
  username?: string;
};

export type GitBasicCredentials = {
  type: "basic";
  username: string;
  password: string;
};

export type GitCredentials = GitTokenCredentials | GitBasicCredentials;

export type GitSourceInput = {
  type: "git";
  url: string;
  branch?: string;
  commit?: string;
  targetPath?: string;
  depth?: number;
  shallow?: boolean;
  submodules?: boolean | "recursive";
  credentials?: GitCredentials;
  credentialPersistence?: GitCredentialPersistence;
  applyEgressPreset?: boolean;
  timeoutMs?: number;
};

export type SandboxSourceInput = GitSourceInput;

export type CreateSandboxInput = CreateSandboxBody & {
  source?: SandboxSourceInput;
  cleanupOnSourceError?: boolean;
};

export type RunSandboxInput = RunSandboxBody;
export type CreateSandboxCommandInput = CreateSandboxCommandBody;
export type CreateSandboxCommandSessionInput = CreateSandboxCommandSessionBody;
export type RunSandboxCommandSessionInput = RunSandboxCommandSessionBody;
export type TerminalAttachOptions = SandboxTerminalAttachOptions;
export type TerminalAttachRequest = {
  url: string;
  headers: Record<string, string>;
};

export type ExposePortInput = ExposeSandboxRouteBody;

export type RouteLike = SandboxRouteSummary | SandboxRouteResponse;

export type RouteBasicAuth = {
  username: string;
  password: string;
};

export type RouteAccessHeadersOptions = {
  basicAuth?: RouteBasicAuth;
};

export type CreateRouteFetchOptions = RouteAccessHeadersOptions & {
  fetch?: typeof fetch;
  headers?: HeadersInit;
};

export type WaitForRouteHttpOptions = CreateRouteFetchOptions & {
  path?: string;
  init?: RequestInit;
  timeoutMs?: number;
  intervalMs?: number;
  expect?: (response: Response) => boolean | Promise<boolean>;
};

export type ExposeAndWaitOptions = WaitForRouteHttpOptions;

export type WaitForSandboxOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  statuses?: SandboxStatus[];
};

export type WaitForCommandOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  statuses?: SandboxCommandStatus[];
};

export type WaitForSnapshotOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  statuses?: SandboxSnapshotStatus[];
};

export type GetCommandLogsOptions = {
  cursor?: number;
  tail?: number;
};

export type GitCommandRunResult = RunSandboxResponse["result"];

export type GitCommandOptions = {
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
};

export type GitCloneOptions = {
  branch?: string;
  commit?: string;
  targetPath?: string;
  depth?: number;
  shallow?: boolean;
  submodules?: boolean | "recursive";
  credentials?: GitCredentials;
  credentialPersistence?: GitCredentialPersistence;
  timeoutMs?: number;
  env?: Record<string, string>;
};

export type GitCloneResult = GitCommandRunResult & {
  path: string;
  url: string;
};

export type GitStatusFile = {
  path: string;
  index: string;
  workingTree: string;
  raw: string;
};

export type GitStatusResult = GitCommandRunResult & {
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  clean: boolean;
  files: GitStatusFile[];
};

export type GitBranchResult = GitCommandRunResult & {
  branches: string[];
};

export type GitCommitOptions = GitCommandOptions & {
  all?: boolean;
  allowEmpty?: boolean;
  authorName?: string;
  authorEmail?: string;
};

export type GitPullOptions = GitCommandOptions & {
  remote?: string;
  branch?: string;
  rebase?: boolean;
  credentials?: GitCredentials;
  remoteUrl?: string;
  credentialPersistence?: GitCredentialPersistence;
};

export type GitPushOptions = GitCommandOptions & {
  remote?: string;
  branch?: string;
  setUpstream?: boolean;
  credentials?: GitCredentials;
  remoteUrl?: string;
  credentialPersistence?: GitCredentialPersistence;
};

export type HarakiriSandboxOptions = {
  client: HarakiriClient;
  sandbox: SandboxSummary;
};

const defaultGitPath = "/workspace/project";

const shellQuote = (value: string) => {
  if (value === "") return "''";
  return `'${value.replace(/'/g, "'\\''")}'`;
};

const shellDoubleStatic = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$");

const doubleQuotedGitUrl = (parts: Array<string | { env: string }>) =>
  `"${parts.map((part) => typeof part === "string" ? shellDoubleStatic(part) : `$${part.env}`).join("")}"`;

export const sanitizeGitUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    return url.replace(/\/\/[^/\s@]+@/g, "//");
  }
};

export const redactGitSecrets = (value: string, secrets: string[] = []) => {
  let redacted = value.replace(/(https?:\/\/)([^/\s:@]+):([^/\s@]+)@/gi, "$1[redacted]@");
  for (const secret of secrets.filter(Boolean)) {
    redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted;
};

const gitSecretValues = (credentials?: GitCredentials) => {
  if (!credentials) return [];
  if (credentials.type === "basic") return [credentials.password];
  return [credentials.token];
};

const gitCredentialEnv = (credentials?: GitCredentials): Record<string, string> => {
  if (!credentials) return {};
  if (credentials.type === "basic") {
    return {
      HARAKIRI_GIT_USERNAME: credentials.username,
      HARAKIRI_GIT_PASSWORD: credentials.password
    };
  }
  return {
    HARAKIRI_GIT_USERNAME: credentials.username ?? "x-access-token",
    HARAKIRI_GIT_TOKEN: credentials.token
  };
};

const gitAskPassSetup = (credentials?: GitCredentials) => {
  if (!credentials) return { before: [] as string[], after: [] as string[] };
  return {
    before: [
      "askpass_file=\"$(mktemp /tmp/harakiri-git-askpass.XXXXXX)\"",
      "cat > \"$askpass_file\" <<'HARAKIRI_GIT_ASKPASS'",
      "#!/bin/sh",
      "case \"$1\" in",
      "  *Username*|*username*) printf '%s\\n' \"$HARAKIRI_GIT_USERNAME\" ;;",
      "  *Password*|*password*) printf '%s\\n' \"${HARAKIRI_GIT_PASSWORD:-$HARAKIRI_GIT_TOKEN}\" ;;",
      "  *) printf '%s\\n' \"${HARAKIRI_GIT_PASSWORD:-$HARAKIRI_GIT_TOKEN}\" ;;",
      "esac",
      "HARAKIRI_GIT_ASKPASS",
      "chmod 700 \"$askpass_file\"",
      "export GIT_ASKPASS=\"$askpass_file\" GIT_TERMINAL_PROMPT=0"
    ],
    after: ["rm -f \"$askpass_file\""]
  };
};

const credentialedGitUrlExpression = (url: string, credentials?: GitCredentials) => {
  const sanitized = sanitizeGitUrl(url);
  if (!credentials) return shellQuote(sanitized);
  let parsed: URL;
  try {
    parsed = new URL(sanitized);
  } catch {
    throw new Error("Git credentials are only supported for HTTPS repository URLs.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Git credentials are only supported for HTTPS repository URLs.");
  }
  const passwordEnv = credentials.type === "basic" ? "HARAKIRI_GIT_PASSWORD" : "HARAKIRI_GIT_TOKEN";
  return doubleQuotedGitUrl([
    `${parsed.protocol}//`,
    { env: "HARAKIRI_GIT_USERNAME" },
    ":",
    { env: passwordEnv },
    "@",
    `${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`
  ]);
};

const gitPrefix = (cwd: string) => `command -v git >/dev/null 2>&1 || { echo 'git binary not found in sandbox image' >&2; exit 127; }\ngit -C ${shellQuote(cwd)}`;

const runResultWithRedaction = (response: RunSandboxResponse, secrets: string[] = []) => ({
  ...response.result,
  command: redactGitSecrets(response.result.command, secrets),
  stdout: redactGitSecrets(response.result.stdout, secrets),
  stderr: redactGitSecrets(response.result.stderr, secrets)
});

export class HarakiriGitCommandError extends Error {
  constructor(
    message: string,
    public readonly sandboxId: string,
    public readonly operation: string,
    public readonly result: GitCommandRunResult
  ) {
    super(message);
    this.name = "HarakiriGitCommandError";
  }
}

export class HarakiriGitUnsupportedRuntimeError extends HarakiriGitCommandError {
  readonly code = "git_runtime_unsupported";
  readonly reason = "missing_git_binary";
  readonly templateGuidance = "Use a sandbox template that includes git, such as open-agents-dev, opencode, or a custom template that installs git.";

  constructor(sandboxId: string, operation: string, result: GitCommandRunResult) {
    super(
      `Git ${operation} is not supported by sandbox ${sandboxId}: git binary not found. ${HarakiriGitUnsupportedRuntimeError.guidance}`,
      sandboxId,
      operation,
      result
    );
    this.name = "HarakiriGitUnsupportedRuntimeError";
  }

  private static readonly guidance = "Use a sandbox template that includes git, such as open-agents-dev, opencode, or a custom template that installs git.";
}

export class HarakiriGitNetworkAccessError extends HarakiriGitCommandError {
  readonly code = "git_network_access_failed";
  readonly reason = "network_or_egress";
  readonly egressGuidance = "If this sandbox uses restricted or custom outbound access, add the git-hosting egress preset or allow the required Git hostnames, then retry.";

  constructor(sandboxId: string, operation: string, result: GitCommandRunResult) {
    super(
      `Git ${operation} could not reach the repository from sandbox ${sandboxId}. ${HarakiriGitNetworkAccessError.guidance} ${result.stderr || result.stdout || `exit ${result.exitCode}`}`,
      sandboxId,
      operation,
      result
    );
    this.name = "HarakiriGitNetworkAccessError";
  }

  private static readonly guidance = "If this sandbox uses restricted or custom outbound access, add the git-hosting egress preset or allow the required Git hostnames, then retry.";
}

const parseGitStatus = (result: GitCommandRunResult): GitStatusResult => {
  const lines = result.stdout.split(/\r?\n/).filter(Boolean);
  const branchLine = lines.find((line) => line.startsWith("## "));
  const fileLines = lines.filter((line) => !line.startsWith("## "));
  let branch: string | null = null;
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;

  if (branchLine) {
    const body = branchLine.slice(3);
    const bracketIndex = body.indexOf(" [");
    const branchSpec = bracketIndex >= 0 ? body.slice(0, bracketIndex) : body;
    const divergence = bracketIndex >= 0 ? body.slice(bracketIndex) : "";
    if (branchSpec.includes("...")) {
      const [local, remote] = branchSpec.split("...");
      branch = local || null;
      upstream = remote || null;
    } else {
      branch = branchSpec || null;
    }
    const aheadMatch = divergence.match(/ahead (\d+)/);
    const behindMatch = divergence.match(/behind (\d+)/);
    ahead = aheadMatch ? Number(aheadMatch[1]) : 0;
    behind = behindMatch ? Number(behindMatch[1]) : 0;
  }

  const files = fileLines.map((line): GitStatusFile => ({
    path: line.slice(3),
    index: line[0] ?? " ",
    workingTree: line[1] ?? " ",
    raw: line
  }));

  return {
    ...result,
    branch,
    upstream,
    ahead,
    behind,
    clean: files.length === 0,
    files
  };
};

const buildGitCloneCommand = (url: string, options: GitCloneOptions = {}) => {
  const targetPath = options.targetPath ?? defaultGitPath;
  const depth = options.depth ?? (options.shallow ? 1 : undefined);
  const args = ["clone"];
  if (depth !== undefined) args.push("--depth", String(depth));
  if (options.branch) args.push("--branch", options.branch);
  const repoExpression = shellQuote(sanitizeGitUrl(url));
  const askPass = gitAskPassSetup(options.credentials);
  const clone = `git ${args.map(shellQuote).join(" ")} ${repoExpression} ${shellQuote(targetPath)}`;
  const commands = [
    "set -eu",
    ...askPass.before,
    "command -v git >/dev/null 2>&1 || { echo 'git binary not found in sandbox image' >&2; exit 127; }",
    clone
  ];
  if (options.credentials && options.credentialPersistence === "dangerously-store-in-remote") {
    commands.push(`git -C ${shellQuote(targetPath)} remote set-url origin ${credentialedGitUrlExpression(url, options.credentials)}`);
  }
  if (options.commit) commands.push(`git -C ${shellQuote(targetPath)} checkout --detach ${shellQuote(options.commit)}`);
  if (options.submodules) {
    commands.push(`git -C ${shellQuote(targetPath)} submodule update --init${options.submodules === "recursive" || options.submodules === true ? " --recursive" : ""}`);
  }
  commands.push(...askPass.after);
  return { command: commands.join("\n"), targetPath, env: gitCredentialEnv(options.credentials), secrets: gitSecretValues(options.credentials) };
};

const gitSourceForApi = (source: GitSourceInput) => ({
  type: "git" as const,
  url: sanitizeGitUrl(source.url),
  branch: source.branch,
  commit: source.commit,
  targetPath: source.targetPath ?? defaultGitPath,
  depth: source.depth,
  shallow: source.shallow,
  submodules: source.submodules,
  credentialPersistence: source.credentialPersistence ?? (source.credentials ? "one-shot" as const : undefined),
  applyEgressPreset: source.applyEgressPreset,
  timeoutMs: source.timeoutMs
});

const gitSourceProvenance = (
  source: GitSourceInput,
  status: SandboxSourceProvenance["status"],
  details: Partial<Omit<SandboxSourceProvenance, "type" | "url" | "targetPath" | "status">> = {}
): SandboxSourceProvenance => {
  const apiSource = gitSourceForApi(source);
  const { applyEgressPreset: _applyEgressPreset, timeoutMs: _timeoutMs, ...provenance } = apiSource;
  return {
    ...provenance,
    status,
    ...details
  };
};

const gitCommandMetadata = (
  operation: SandboxGitOperationName,
  metadata: Omit<SandboxGitOperationMetadata, "capability" | "operation"> = {}
): SandboxGitOperationMetadata => ({
  capability: "git",
  operation,
  ...metadata
});

const buildTemporaryRemoteCommand = (
  cwd: string,
  remote: string,
  remoteUrl: string | undefined,
  credentials: GitCredentials | undefined,
  credentialPersistence: GitCredentialPersistence | undefined,
  action: string
) => {
  if (!credentials || !remoteUrl) return action;
  const remoteExpression = credentialPersistence === "dangerously-store-in-remote"
    ? credentialedGitUrlExpression(remoteUrl, credentials)
    : shellQuote(sanitizeGitUrl(remoteUrl));
  const setRemote = `git -C ${shellQuote(cwd)} remote set-url ${shellQuote(remote)} ${remoteExpression}`;
  if (credentialPersistence === "dangerously-store-in-remote") return `${setRemote}\n${action}`;
  return [
    `previous_remote_url="$(git -C ${shellQuote(cwd)} remote get-url ${shellQuote(remote)} 2>/dev/null || true)"`,
    "restore_remote_url() { if [ -n \"$previous_remote_url\" ]; then git -C " + shellQuote(cwd) + " remote set-url " + shellQuote(remote) + " \"$previous_remote_url\"; fi; }",
    "trap restore_remote_url EXIT",
    setRemote,
    action,
    "trap - EXIT",
    "restore_remote_url"
  ].join("\n");
};

const missingGitBinary = (result: GitCommandRunResult) =>
  result.exitCode === 127 && /git binary not found in sandbox image/i.test(`${result.stderr}\n${result.stdout}`);

const gitNetworkAccessFailure = (result: GitCommandRunResult) => {
  const output = `${result.stderr}\n${result.stdout}`;
  return /could not resolve host|temporary failure in name resolution|failed to connect|connection timed out|network is unreachable|connection refused|name or service not known|proxy connect aborted|ssl_connect/i.test(output);
};


const isRouteResponse = (route: RouteLike): route is SandboxRouteResponse =>
  "route" in route && typeof route.route === "object" && route.route !== null;

const routeSummaryFor = (route: RouteLike) => isRouteResponse(route) ? route.route : route;

const routeTokenFor = (route: RouteLike) => isRouteResponse(route) ? route.accessToken : undefined;

const routeAccessHeaderNameFor = (route: RouteLike) => {
  if (isRouteResponse(route) && route.accessHeaderName) return route.accessHeaderName;
  return routeSummaryFor(route).accessHeaderName ?? undefined;
};

const encodeBase64 = (value: string) => {
  if (typeof Buffer !== "undefined") return Buffer.from(value, "utf8").toString("base64");
  return btoa(unescape(encodeURIComponent(value)));
};

const routeUrlFor = (route: RouteLike) => routeSummaryFor(route).url.replace(/\/+$/, "");

const routeRequestUrlFor = (route: RouteLike, input: string | URL | Request = "/") => {
  if (input instanceof Request) return input.url;
  const value = String(input);
  if (/^https?:\/\//i.test(value)) return value;
  return new URL(value.replace(/^\/+/, ""), `${routeUrlFor(route)}/`).toString();
};

export const routeAccessHeaders = (route: RouteLike, options: RouteAccessHeadersOptions = {}) => {
  const headers: Record<string, string> = {};
  const accessToken = routeTokenFor(route);
  const accessHeaderName = routeAccessHeaderNameFor(route);
  if (accessToken && accessHeaderName) headers[accessHeaderName] = accessToken;
  if (options.basicAuth) {
    headers.authorization = `Basic ${encodeBase64(`${options.basicAuth.username}:${options.basicAuth.password}`)}`;
  }
  return headers;
};

export const createRouteFetch = (route: RouteLike, options: CreateRouteFetchOptions = {}) => {
  const fetchImpl = options.fetch ?? fetch;
  return (input: string | URL | Request = "/", init: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    const accessHeaders = routeAccessHeaders(route, options);
    for (const [key, value] of Object.entries(accessHeaders)) headers.set(key, value);
    return fetchImpl(routeRequestUrlFor(route, input), { ...init, headers });
  };
};

export const waitForRouteHttp = async (route: RouteLike, options: WaitForRouteHttpOptions = {}) => {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 500;
  const path = options.path ?? "/";
  const expect = options.expect ?? ((response: Response) => response.ok);
  const routeFetch = createRouteFetch(route, options);
  const started = Date.now();
  let lastError: unknown;
  let lastResponse: Response | null = null;
  while (Date.now() - started <= timeoutMs) {
    try {
      const response = await routeFetch(path, options.init);
      lastResponse = response;
      if (await expect(response)) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  const suffix = lastResponse ? `; last status ${lastResponse.status}` : lastError instanceof Error ? `; ${lastError.message}` : "";
  throw new HarakiriWaitTimeoutError(`Timed out waiting for route ${routeSummaryFor(route).url}${suffix}`, "route", routeSummaryFor(route).routeKey, lastResponse?.status ? String(lastResponse.status) : undefined);
};

export type CreateTemplateInput = CreateTemplateBody;

export type CreateTemplateBuildInput = CreateTemplateBuildBody;

export type UploadTemplateBuildContextInput = UploadTemplateBuildContextBody;

export type UpsertRegistryCredentialInput = UpsertRegistryCredentialBody;

export type CreateCredentialSecretInput = CreateCredentialSecretBody;
export type RotateCredentialSecretInput = RotateCredentialSecretBody;
export type UpdateCredentialSecretInput = UpdateCredentialSecretBody;
export type CreateExternalSecretReferenceInput = CreateExternalSecretReferenceBody;
export type UpdateExternalSecretReferenceInput = UpdateExternalSecretReferenceBody;
export type CreateDynamicCredentialIssuerInput = CreateDynamicCredentialIssuerBody;
export type UpdateDynamicCredentialIssuerInput = UpdateDynamicCredentialIssuerBody;

export type ListAuditEventsInput = {
  targetType?: string;
  targetId?: string;
  actionPrefix?: string;
  limit?: number;
  offset?: number;
};

export type AttachSandboxCredentialInput = AttachSandboxCredentialBody;

export type CredentialFromPresetOptions = {
  displayName?: string;
  credentialName?: string;
  bindingName?: string;
  fakeEnv?: Record<string, string>;
};

export const credentialFromPreset = (
  presetId: CredentialProviderPresetId,
  value: string,
  options: CredentialFromPresetOptions = {}
): InlineEphemeralSandboxCredentialBody => {
  if (!value) throw new Error("credential value is required");
  const preset = credentialProviderPresetCatalog[presetId];
  return {
    sourceType: "inline_ephemeral",
    displayName: options.displayName ?? preset.label,
    credentialName: options.credentialName ?? preset.credentialName,
    value,
    fakeEnv: options.fakeEnv ?? { ...preset.fakeEnv },
    binding: {
      ...preset.binding,
      name: options.bindingName ?? preset.binding.name,
      match: {
        ...preset.binding.match,
        hosts: [...preset.binding.match.hosts],
        ...(preset.binding.match.schemes ? { schemes: [...preset.binding.match.schemes] } : {}),
        ...(preset.binding.match.methods ? { methods: [...preset.binding.match.methods] } : {}),
        ...(preset.binding.match.paths ? { paths: [...preset.binding.match.paths] } : {})
      },
      auth: { ...preset.binding.auth }
    }
  };
};
export type AttachWorkspaceCredentialSecretInput = Omit<
  HarakiriEncryptedSandboxCredentialBody,
  "sourceType" | "secretId"
>;
export type AttachExternalSecretReferenceInput = Omit<
  ExternalReferenceSandboxCredentialBody,
  "sourceType" | "referenceId"
>;
export type AttachDynamicCredentialIssuerInput = Omit<
  DynamicSandboxCredentialBody,
  "sourceType" | "issuerId"
>;
export type TestSandboxCredentialInput = TestSandboxCredentialBody;

export type CreateSandboxSnapshotInput = CreateSandboxSnapshotBody;

export type HarakiriApiErrorCategory =
  | "authentication"
  | "authorization"
  | "validation"
  | "not_found"
  | "conflict"
  | "rate_limit"
  | "unsupported_capability"
  | "provider_unavailable"
  | "timeout"
  | "server"
  | "unknown";

export type HarakiriApiErrorOptions = {
  category?: HarakiriApiErrorCategory;
  retryable?: boolean;
};

export class HarakiriApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly details: ApiErrorResponse | null = parseApiErrorResponse(body),
    public readonly options: HarakiriApiErrorOptions = {}
  ) {
    super(formatApiErrorResponse(status, body));
  }

  get code() {
    return this.details?.error;
  }

  get category(): HarakiriApiErrorCategory {
    return this.options.category ?? "unknown";
  }

  get retryable() {
    return this.options.retryable ?? false;
  }
}

export class HarakiriAuthenticationError extends HarakiriApiError {
  constructor(status: number, body: string, details: ApiErrorResponse | null = parseApiErrorResponse(body)) {
    super(status, body, details, { category: "authentication", retryable: false });
  }
}

export class HarakiriAuthorizationError extends HarakiriApiError {
  constructor(status: number, body: string, details: ApiErrorResponse | null = parseApiErrorResponse(body)) {
    super(status, body, details, { category: "authorization", retryable: false });
  }
}

export class HarakiriValidationError extends HarakiriApiError {
  constructor(status: number, body: string, details: ApiErrorResponse | null = parseApiErrorResponse(body)) {
    super(status, body, details, { category: "validation", retryable: false });
  }
}

export class HarakiriNotFoundError extends HarakiriApiError {
  constructor(status: number, body: string, details: ApiErrorResponse | null = parseApiErrorResponse(body)) {
    super(status, body, details, { category: "not_found", retryable: false });
  }
}

export class HarakiriConflictError extends HarakiriApiError {
  constructor(status: number, body: string, details: ApiErrorResponse | null = parseApiErrorResponse(body)) {
    super(status, body, details, { category: "conflict", retryable: false });
  }
}

export class HarakiriRateLimitError extends HarakiriApiError {
  constructor(status: number, body: string, details: ApiErrorResponse | null = parseApiErrorResponse(body)) {
    super(status, body, details, { category: "rate_limit", retryable: true });
  }
}

export class HarakiriUnsupportedCapabilityError extends HarakiriApiError {
  constructor(status: number, body: string, details: ApiErrorResponse | null = parseApiErrorResponse(body)) {
    super(status, body, details, { category: "unsupported_capability", retryable: false });
  }
}

export class HarakiriProviderUnavailableError extends HarakiriApiError {
  constructor(status: number, body: string, details: ApiErrorResponse | null = parseApiErrorResponse(body)) {
    super(status, body, details, { category: "provider_unavailable", retryable: true });
  }
}

export class HarakiriTimeoutApiError extends HarakiriApiError {
  constructor(status: number, body: string, details: ApiErrorResponse | null = parseApiErrorResponse(body)) {
    super(status, body, details, { category: "timeout", retryable: true });
  }
}

export class HarakiriServerError extends HarakiriApiError {
  constructor(status: number, body: string, details: ApiErrorResponse | null = parseApiErrorResponse(body)) {
    super(status, body, details, { category: "server", retryable: true });
  }
}

export class HarakiriWaitTimeoutError extends Error {
  constructor(
    message: string,
    public readonly target: "sandbox" | "command" | "route" | "snapshot",
    public readonly id: string,
    public readonly lastStatus?: string
  ) {
    super(message);
    this.name = "HarakiriWaitTimeoutError";
  }
}

export class HarakiriCommandEndedError extends Error {
  readonly category = "command_ended";
  readonly retryable = false;

  constructor(
    message: string,
    public readonly sandboxId: string,
    public readonly commandId: string,
    public readonly command: SandboxCommandSummary
  ) {
    super(message);
    this.name = "HarakiriCommandEndedError";
  }

  get status() {
    return this.command.status;
  }

  get exitCode() {
    return this.command.exitCode;
  }

  get finishReason() {
    return this.command.finishReason;
  }
}

const includesCode = (codes: readonly string[], code: string | undefined) => Boolean(code && codes.includes(code));
const isTimeoutCode = (code: string | undefined) => includesCode(timeoutApiErrorCodes, code) || Boolean(code && /timeout|timed_out/.test(code));
const isUnsupportedCapabilityCode = (code: string | undefined) =>
  includesCode(unsupportedCapabilityApiErrorCodes, code) || Boolean(code && /unsupported/.test(code));
const isProviderUnavailableCode = (code: string | undefined) =>
  includesCode(providerUnavailableApiErrorCodes, code) || Boolean(code && /(provider_unavailable|runtime_.*unavailable|upstream_unreachable)/.test(code));

export const createHarakiriApiError = (status: number, body: string) => {
  const details = parseApiErrorResponse(body);
  const code = details?.error;
  if (status === 401) return new HarakiriAuthenticationError(status, body, details);
  if (status === 403) return new HarakiriAuthorizationError(status, body, details);
  if (status === 400) return new HarakiriValidationError(status, body, details);
  if (status === 404) return new HarakiriNotFoundError(status, body, details);
  if (status === 408 || isTimeoutCode(code)) return new HarakiriTimeoutApiError(status, body, details);
  if (status === 409) return new HarakiriConflictError(status, body, details);
  if (status === 429) return new HarakiriRateLimitError(status, body, details);
  if (status === 501 || isUnsupportedCapabilityCode(code)) return new HarakiriUnsupportedCapabilityError(status, body, details);
  if (status === 502 || status === 503 || status === 504 || isProviderUnavailableCode(code)) {
    return new HarakiriProviderUnavailableError(status, body, details);
  }
  if (status >= 500) return new HarakiriServerError(status, body, details);
  return new HarakiriApiError(status, body, details, { category: "unknown", retryable: false });
};

export class HarakiriSandbox {
  readonly client: HarakiriClient;
  private current: SandboxSummary;

  constructor(options: HarakiriSandboxOptions) {
    this.client = options.client;
    this.current = options.sandbox;
  }

  static async create(client: HarakiriClient, input: CreateSandboxInput = {}) {
    const result = await client.createSandbox(input);
    return new HarakiriSandbox({ client, sandbox: result.sandbox });
  }

  static async connect(client: HarakiriClient, id: string) {
    const result = await client.getSandbox(id);
    return new HarakiriSandbox({ client, sandbox: result.sandbox });
  }

  static wrap(client: HarakiriClient, sandbox: SandboxSummary) {
    return new HarakiriSandbox({ client, sandbox });
  }

  get id() {
    return this.current.id;
  }

  get name() {
    return this.current.name;
  }

  get template() {
    return this.current.template;
  }

  get status() {
    return this.current.status;
  }

  get summary() {
    return this.current;
  }

  get runtimeMetadata() {
    return this.current.runtimeMetadata;
  }

  get lifecycle() {
    return this.current.runtimeMetadata.lifecycle;
  }

  get expiresAt() {
    return this.current.expiresAt;
  }

  async refresh() {
    const result = await this.client.getSandbox(this.id);
    this.current = result.sandbox;
    return this;
  }

  async wait(options: WaitForSandboxOptions = {}) {
    const result = await this.client.waitForSandbox(this.id, options);
    this.current = result.sandbox;
    return this;
  }

  async renew() {
    const result = await this.client.renewSandbox(this.id);
    await this.refresh();
    return result;
  }

  reconnect() {
    return this.refresh();
  }

  async kill() {
    const result = await this.client.killSandbox(this.id);
    // A delete acknowledgement is not evidence that execution has stopped.
    if (this.current.status !== "terminated") this.current = { ...this.current, capacityPhase: "releasing" };
    return result;
  }

  async pause() {
    const result = await this.client.pauseSandbox(this.id);
    this.current = result.sandbox;
    return this;
  }

  async resume(options: { idempotencyKey?: string } = {}) {
    const result = await this.client.resumeSandbox(this.id, options);
    this.current = result.sandbox;
    return this;
  }

  snapshot(input: CreateSandboxSnapshotInput = {}) {
    return this.client.createSnapshot(this.id, input);
  }

  run(input: RunSandboxInput) {
    return this.client.runSandbox(this.id, input);
  }

  logs() {
    return this.client.getSandboxLogs(this.id);
  }

  metrics() {
    return this.client.getSandboxMetrics(this.id);
  }

  readonly commands = {
    start: (input: CreateSandboxCommandInput) => this.client.commands.start(this.id, input),
    stream: (commandId: string, options: CommandStreamOptions = {}) => this.client.commands.stream(this.id, commandId, options),
    run: (input: CreateSandboxCommandInput) => this.client.commands.run(this.id, input),
    list: () => this.client.commands.list(this.id),
    get: (commandId: string) => this.client.commands.get(this.id, commandId),
    logs: (commandId: string, options: GetCommandLogsOptions = {}) => this.client.commands.logs(this.id, commandId, options),
    kill: (commandId: string) => this.client.commands.kill(this.id, commandId),
    wait: (commandId: string, options: WaitForCommandOptions = {}) => this.client.commands.wait(this.id, commandId, options),
    sessions: {
      create: (input: CreateSandboxCommandSessionInput = {}) => this.client.commands.sessions.create(this.id, input),
      run: (sessionId: string, input: RunSandboxCommandSessionInput) => this.client.commands.sessions.run(this.id, sessionId, input),
      delete: (sessionId: string) => this.client.commands.sessions.delete(this.id, sessionId)
    }
  };

  readonly processes = {
    start: (input: CreateSandboxCommandInput) => this.client.processes.start(this.id, { ...input, detached: input.detached ?? true }),
    list: () => this.client.processes.list(this.id),
    get: (processId: string) => this.client.processes.get(this.id, processId),
    logs: (processId: string, options: GetCommandLogsOptions = {}) => this.client.processes.logs(this.id, processId, options),
    tail: (processId: string, lines = 100) => this.client.processes.tail(this.id, processId, lines),
    wait: (processId: string, options: WaitForCommandOptions = {}) => this.client.processes.wait(this.id, processId, options),
    kill: (processId: string) => this.client.processes.kill(this.id, processId)
  };

  readonly terminal = {
    attachUrl: (options: TerminalAttachOptions = {}) => this.client.terminal.attachUrl(this.id, options),
    attachRequest: (options: TerminalAttachOptions = {}) => this.client.terminal.attachRequest(this.id, options),
    attachTicket: () => this.client.terminal.attachTicket(this.id)
  };

  readonly files = {
    list: (path?: string) => this.client.files.list(this.id, path),
    stat: (path: string) => this.client.files.stat(this.id, path),
    read: (path: string, options: { encoding?: "utf8" | "base64" } = {}) => this.client.files.read(this.id, path, options),
    write: (input: SandboxFileWriteBody) => this.client.files.write(this.id, input),
    mkdir: (input: SandboxFileMkdirBody) => this.client.files.mkdir(this.id, input),
    remove: (path: string, options: { recursive?: boolean } = {}) => this.client.files.remove(this.id, path, options),
    rename: (input: SandboxFileRenameBody) => this.client.files.rename(this.id, input),
    upload: (input: SandboxFileUploadBody) => this.client.files.upload(this.id, input),
    download: (path: string) => this.client.files.download(this.id, path)
  };

  readonly artifacts = {
    upload: (input: SandboxFileUploadBody) => this.client.artifacts.upload(this.id, input),
    download: (path: string) => this.client.artifacts.download(this.id, path)
  };

  readonly routes = {
    expose: (input: ExposePortInput) => this.client.routes.expose(this.id, input),
    list: () => this.client.routes.list(this.id),
    delete: (port: number) => this.client.routes.delete(this.id, port),
    getHost: (port: number) => this.client.routes.getHost(this.id, port),
    getUrl: (port: number) => this.client.routes.getUrl(this.id, port),
    exposeAndWait: (input: ExposePortInput, options: ExposeAndWaitOptions = {}) => this.client.routes.exposeAndWait(this.id, input, options),
    headers: (route: RouteLike, options: RouteAccessHeadersOptions = {}) => this.client.routes.headers(route, options),
    fetch: (route: RouteLike, options: CreateRouteFetchOptions = {}) => this.client.routes.fetch(route, options),
    waitForHttp: (route: RouteLike, options: WaitForRouteHttpOptions = {}) => this.client.routes.waitForHttp(route, options)
  };

  readonly egress = {
    get: () => this.client.getEgressPolicy(this.id),
    update: (input: PatchSandboxEgressBody) => this.client.updateEgressPolicy(this.id, input),
    set: (input: PatchSandboxEgressBody) => this.client.setOutboundAccess(this.id, input),
    allow: (domains: string[]) => this.client.allowDomains(this.id, domains),
    deny: (domains: string[]) => this.client.denyDomains(this.id, domains),
    block: () => this.client.blockOutboundAccess(this.id),
    test: (target: string | TestSandboxEgressBody) => this.client.testOutboundAccess(this.id, target)
  };

  readonly credentials = {
    list: () => this.client.credentials.list(this.id),
    inspect: () => this.client.credentials.inspect(this.id),
    attach: (input: AttachSandboxCredentialInput) => this.client.credentials.attach(this.id, input),
    attachSecret: (secretId: string, input: AttachWorkspaceCredentialSecretInput = {}) =>
      this.client.credentials.attachSecret(this.id, secretId, input),
    attachReference: (referenceId: string, input: AttachExternalSecretReferenceInput = {}) =>
      this.client.credentials.attachReference(this.id, referenceId, input),
    attachIssuer: (issuerId: string, input: AttachDynamicCredentialIssuerInput = {}) =>
      this.client.credentials.attachIssuer(this.id, issuerId, input),
    refresh: (attachmentId: string) => this.client.credentials.refresh(this.id, attachmentId),
    rehydrate: () => this.client.credentials.rehydrate(this.id),
    detach: (attachmentId: string) => this.client.credentials.detach(this.id, attachmentId),
    test: (attachmentId: string, input: TestSandboxCredentialInput = {}) => this.client.credentials.test(this.id, attachmentId, input),
    testAccess: (attachmentId: string, input: TestSandboxCredentialInput = {}) => this.client.credentials.testAccess(this.id, attachmentId, input)
  };

  readonly git = {
    clone: (url: string, options: GitCloneOptions = {}) => this.client.git.clone(this.id, url, options),
    status: (options: GitCommandOptions = {}) => this.client.git.status(this.id, options),
    branches: (options: GitCommandOptions = {}) => this.client.git.branches(this.id, options),
    checkout: (ref: string, options: GitCommandOptions = {}) => this.client.git.checkout(this.id, ref, options),
    createBranch: (name: string, options: GitCommandOptions = {}) => this.client.git.createBranch(this.id, name, options),
    deleteBranch: (name: string, options: GitCommandOptions = {}) => this.client.git.deleteBranch(this.id, name, options),
    add: (paths: string[] = ["."], options: GitCommandOptions = {}) => this.client.git.add(this.id, paths, options),
    commit: (message: string, options: GitCommitOptions = {}) => this.client.git.commit(this.id, message, options),
    pull: (options: GitPullOptions = {}) => this.client.git.pull(this.id, options),
    push: (options: GitPushOptions = {}) => this.client.git.push(this.id, options),
    remotes: (options: GitCommandOptions = {}) => this.client.git.remotes(this.id, options),
    remoteAdd: (name: string, url: string, options: GitCommandOptions = {}) => this.client.git.remoteAdd(this.id, name, url, options),
    setConfig: (key: string, value: string, options: GitCommandOptions = {}) => this.client.git.setConfig(this.id, key, value, options),
    getConfig: (key: string, options: GitCommandOptions = {}) => this.client.git.getConfig(this.id, key, options),
    configureUser: (input: { name: string; email: string }, options: GitCommandOptions = {}) => this.client.git.configureUser(this.id, input, options)
  };
}

export class HarakiriClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HarakiriClientOptions) {
    if (!options.apiUrl) throw new Error("apiUrl is required");
    if (!options.apiKey) throw new Error("apiKey is required");
    this.apiUrl = options.apiUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? fetch;
  }

  readonly commands = {
    stream: (id: string, commandId: string, options: CommandStreamOptions = {}) => this.streamCommand(id, commandId, options),
    start: (id: string, input: CreateSandboxCommandInput) => this.startCommand(id, input),
    run: (id: string, input: CreateSandboxCommandInput) => this.runCommand(id, input),
    list: (id: string) => this.listCommands(id),
    get: (id: string, commandId: string) => this.getCommand(id, commandId),
    logs: (id: string, commandId: string, options: GetCommandLogsOptions = {}) => this.getCommandLogs(id, commandId, options),
    kill: (id: string, commandId: string) => this.killCommand(id, commandId),
    wait: (id: string, commandId: string, options: WaitForCommandOptions = {}) => this.waitForCommand(id, commandId, options),
    sessions: {
      create: (id: string, input: CreateSandboxCommandSessionInput = {}) => this.createCommandSession(id, input),
      run: (id: string, sessionId: string, input: RunSandboxCommandSessionInput) => this.runCommandSession(id, sessionId, input),
      delete: (id: string, sessionId: string) => this.deleteCommandSession(id, sessionId)
    }
  };

  readonly processes = {
    start: (id: string, input: CreateSandboxCommandInput) => this.startCommand(id, { ...input, detached: input.detached ?? true }),
    stream: (id: string, commandId: string, options: CommandStreamOptions = {}) => this.streamCommand(id, commandId, options),
    list: (id: string) => this.listCommands(id),
    get: (id: string, processId: string) => this.getCommand(id, processId),
    logs: (id: string, processId: string, options: GetCommandLogsOptions = {}) => this.getCommandLogs(id, processId, options),
    tail: (id: string, processId: string, lines = 100) => this.getCommandLogs(id, processId, { tail: lines }),
    wait: (id: string, processId: string, options: WaitForCommandOptions = {}) => this.waitForCommand(id, processId, options),
    kill: (id: string, processId: string) => this.killCommand(id, processId)
  };

  readonly terminal = {
    attachUrl: (id: string, options: TerminalAttachOptions = {}) => this.createTerminalAttachUrl(id, options),
    attachRequest: (id: string, options: TerminalAttachOptions = {}) => this.createTerminalAttachRequest(id, options),
    attachTicket: (id: string) => this.createTerminalAttachTicket(id)
  };

  readonly files = {
    list: (id: string, path?: string) => this.listSandboxFiles(id, path),
    stat: (id: string, path: string) => this.statSandboxFile(id, path),
    read: (id: string, path: string, options: { encoding?: "utf8" | "base64" } = {}) => this.readSandboxFile(id, path, options),
    write: (id: string, input: SandboxFileWriteBody) => this.writeSandboxFile(id, input),
    mkdir: (id: string, input: SandboxFileMkdirBody) => this.mkdirSandboxFile(id, input),
    remove: (id: string, path: string, options: { recursive?: boolean } = {}) => this.removeSandboxFile(id, path, options),
    rename: (id: string, input: SandboxFileRenameBody) => this.renameSandboxFile(id, input),
    upload: (id: string, input: SandboxFileUploadBody) => this.uploadSandboxFile(id, input),
    download: (id: string, path: string) => this.downloadSandboxFile(id, path)
  };

  readonly artifacts = {
    upload: (id: string, input: SandboxFileUploadBody) => this.uploadSandboxFile(id, input),
    download: (id: string, path: string) => this.downloadSandboxFile(id, path)
  };

  readonly routes = {
    expose: (id: string, input: ExposePortInput) => this.exposePort(id, input),
    list: (id: string) => this.listRoutes(id),
    delete: (id: string, port: number) => this.deleteRoute(id, port),
    getHost: (id: string, port: number) => this.getHost(id, port),
    getUrl: (id: string, port: number) => this.getRouteUrl(id, port),
    exposeAndWait: (id: string, input: ExposePortInput, options: ExposeAndWaitOptions = {}) => this.exposeAndWaitForHttp(id, input, options),
    headers: (route: RouteLike, options: RouteAccessHeadersOptions = {}) => routeAccessHeaders(route, options),
    fetch: (route: RouteLike, options: CreateRouteFetchOptions = {}) => createRouteFetch(route, options),
    waitForHttp: (route: RouteLike, options: WaitForRouteHttpOptions = {}) => waitForRouteHttp(route, options)
  };

  readonly credentials = {
    list: (id: string) => this.listCredentials(id),
    inspect: (id: string) => this.inspectCredentials(id),
    attach: (id: string, input: AttachSandboxCredentialInput) => this.attachCredential(id, input),
    attachSecret: (id: string, secretId: string, input: AttachWorkspaceCredentialSecretInput = {}) =>
      this.attachWorkspaceCredentialSecret(id, secretId, input),
    attachReference: (id: string, referenceId: string, input: AttachExternalSecretReferenceInput = {}) =>
      this.attachExternalSecretReference(id, referenceId, input),
    attachIssuer: (id: string, issuerId: string, input: AttachDynamicCredentialIssuerInput = {}) =>
      this.attachDynamicCredentialIssuer(id, issuerId, input),
    refresh: (id: string, attachmentId: string) => this.refreshCredential(id, attachmentId),
    rehydrate: (id: string) => this.rehydrateCredentials(id),
    detach: (id: string, attachmentId: string) => this.detachCredential(id, attachmentId),
    test: (id: string, attachmentId: string, input: TestSandboxCredentialInput = {}) => this.testCredential(id, attachmentId, input),
    testAccess: (id: string, attachmentId: string, input: TestSandboxCredentialInput = {}) => this.testCredential(id, attachmentId, input)
  };

  readonly credentialPresets = {
    list: () => this.listCredentialPresets(),
    get: (id: string) => this.getCredentialPreset(id)
  };

  readonly credentialSecrets = {
    list: (options: { includeDeleted?: boolean } = {}) => this.listCredentialSecrets(options),
    get: (id: string) => this.getCredentialSecret(id),
    create: (input: CreateCredentialSecretInput) => this.createCredentialSecret(input),
    update: (id: string, input: UpdateCredentialSecretInput) => this.updateCredentialSecret(id, input),
    rotate: (id: string, input: RotateCredentialSecretInput) => this.rotateCredentialSecret(id, input),
    disable: (id: string) => this.disableCredentialSecret(id),
    enable: (id: string) => this.enableCredentialSecret(id),
    delete: (id: string) => this.deleteCredentialSecret(id)
  };

  readonly externalSecretReferences = {
    list: (options: { includeDeleted?: boolean } = {}) => this.listExternalSecretReferences(options),
    get: (id: string) => this.getExternalSecretReference(id),
    create: (input: CreateExternalSecretReferenceInput) => this.createExternalSecretReference(input),
    update: (id: string, input: UpdateExternalSecretReferenceInput) => this.updateExternalSecretReference(id, input),
    validate: (id: string) => this.validateExternalSecretReference(id),
    disable: (id: string) => this.disableExternalSecretReference(id),
    enable: (id: string) => this.enableExternalSecretReference(id),
    delete: (id: string) => this.deleteExternalSecretReference(id)
  };

  readonly dynamicCredentialIssuers = {
    list: (options: { includeDeleted?: boolean } = {}) => this.listDynamicCredentialIssuers(options),
    get: (id: string) => this.getDynamicCredentialIssuer(id),
    create: (input: CreateDynamicCredentialIssuerInput) => this.createDynamicCredentialIssuer(input),
    update: (id: string, input: UpdateDynamicCredentialIssuerInput) => this.updateDynamicCredentialIssuer(id, input),
    validate: (id: string) => this.validateDynamicCredentialIssuer(id),
    disable: (id: string) => this.disableDynamicCredentialIssuer(id),
    enable: (id: string) => this.enableDynamicCredentialIssuer(id),
    delete: (id: string) => this.deleteDynamicCredentialIssuer(id)
  };

  readonly auditEvents = {
    list: (input: ListAuditEventsInput = {}) => this.listAuditEvents(input)
  };

  readonly git = {
    clone: (id: string, url: string, options: GitCloneOptions = {}) => this.cloneGitRepository(id, url, options),
    status: (id: string, options: GitCommandOptions = {}) => this.getGitStatus(id, options),
    branches: (id: string, options: GitCommandOptions = {}) => this.listGitBranches(id, options),
    checkout: (id: string, ref: string, options: GitCommandOptions = {}) => this.checkoutGitRef(id, ref, options),
    createBranch: (id: string, name: string, options: GitCommandOptions = {}) => this.createGitBranch(id, name, options),
    deleteBranch: (id: string, name: string, options: GitCommandOptions = {}) => this.deleteGitBranch(id, name, options),
    add: (id: string, paths: string[] = ["."], options: GitCommandOptions = {}) => this.addGitPaths(id, paths, options),
    commit: (id: string, message: string, options: GitCommitOptions = {}) => this.commitGitChanges(id, message, options),
    pull: (id: string, options: GitPullOptions = {}) => this.pullGitRepository(id, options),
    push: (id: string, options: GitPushOptions = {}) => this.pushGitRepository(id, options),
    remotes: (id: string, options: GitCommandOptions = {}) => this.listGitRemotes(id, options),
    remoteAdd: (id: string, name: string, url: string, options: GitCommandOptions = {}) => this.addGitRemote(id, name, url, options),
    setConfig: (id: string, key: string, value: string, options: GitCommandOptions = {}) => this.setGitConfig(id, key, value, options),
    getConfig: (id: string, key: string, options: GitCommandOptions = {}) => this.getGitConfig(id, key, options),
    configureUser: (id: string, input: { name: string; email: string }, options: GitCommandOptions = {}) => this.configureGitUser(id, input, options)
  };

  readonly sandboxes = {
    create: (input: CreateSandboxInput = {}) => HarakiriSandbox.create(this, input),
    connect: (id: string) => HarakiriSandbox.connect(this, id),
    wrap: (sandbox: SandboxSummary) => HarakiriSandbox.wrap(this, sandbox),
    list: (params = "") => this.listSandboxes(params),
    get: (id: string) => this.getSandbox(id),
    reconnect: (id: string) => HarakiriSandbox.connect(this, id),
    wait: (id: string, options: WaitForSandboxOptions = {}) => this.waitForSandbox(id, options),
    renew: (id: string) => this.renewSandbox(id),
    kill: (id: string) => this.killSandbox(id),
    pause: (id: string) => this.pauseSandbox(id),
    resume: (id: string, options?: { idempotencyKey?: string }) => this.resumeSandbox(id, options),
    snapshot: (id: string, input: CreateSandboxSnapshotInput = {}) => this.createSnapshot(id, input)
  };

  readonly snapshots = {
    list: (params = "") => this.listSnapshots(params),
    get: (id: string) => this.getSnapshot(id),
    delete: (id: string) => this.deleteSnapshot(id),
    wait: (id: string, options: WaitForSnapshotOptions = {}) => this.waitForSnapshot(id, options)
  };

  private async request<T>(path: string, init: RequestInit = {}) {
    const hasBody = init.body !== undefined;
    const response = await this.fetchImpl(`${this.apiUrl}${path}`, {
      ...init,
      headers: {
        ...(hasBody ? { "content-type": "application/json" } : {}),
        "x-api-key": this.apiKey,
        ...(init.headers ?? {})
      }
    });
    if (!response.ok) throw createHarakiriApiError(response.status, await response.text());
    return (await response.json()) as T;
  }

  readonly workspaces = {
    list: () => this.request<WorkspacesResponse>("/v1/workspaces"),
    create: (input: CreateWorkspaceBody) => this.request<WorkspaceResponse>("/v1/workspaces", { method: "POST", body: JSON.stringify(input) }),
    get: (id: string) => this.request<WorkspaceResponse>(`/v1/workspaces/${encodeURIComponent(id)}`),
    archive: (id: string) => this.request<WorkspaceResponse>(`/v1/workspaces/${encodeURIComponent(id)}/archive`, { method: "POST" })
  };

  streamCommand(id: string, commandId: string, options: CommandStreamOptions = {}) {
    return observeCommandStream(async (cursor, signal) => {
      const url = new URL(`${this.apiUrl}/v1/sandboxes/${encodeURIComponent(id)}/commands/${encodeURIComponent(commandId)}/events`);
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await this.fetchImpl(url, { signal, headers: { "x-api-key": this.apiKey, accept: "text/event-stream" } });
      if (!response.ok) throw createHarakiriApiError(response.status, await response.text());
      return response;
    }, commandId, options);
  }

  listTemplates() {
    return this.request<TemplatesResponse>("/v1/templates");
  }

  createTemplate(input: CreateTemplateInput) {
    return this.request<TemplateResponse>("/v1/templates", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  getTemplate(id: string) {
    return this.request<TemplateResponse>(`/v1/templates/${encodeURIComponent(id)}`);
  }

  listTemplateVersions(id: string) {
    return this.request<TemplateVersionsResponse>(`/v1/templates/${encodeURIComponent(id)}/versions`);
  }

  createTemplateBuild(id: string, input: CreateTemplateBuildInput = {}) {
    return this.request<TemplateBuildResponse>(`/v1/templates/${encodeURIComponent(id)}/builds`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  listTemplateBuilds(params = "") {
    return this.request<TemplateBuildsResponse>(`/v1/template-builds${params}`);
  }

  getTemplateBuild(id: string) {
    return this.request<TemplateBuildResponse>(`/v1/template-builds/${encodeURIComponent(id)}`);
  }

  getTemplateBuildLogs(id: string) {
    return this.request<TemplateBuildLogsResponse>(`/v1/template-builds/${encodeURIComponent(id)}/logs`);
  }

  uploadTemplateBuildContext(id: string, input: UploadTemplateBuildContextInput) {
    return this.request<TemplateBuildContextResponse>(`/v1/template-builds/${encodeURIComponent(id)}/context`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  cancelTemplateBuild(id: string) {
    return this.request<TemplateBuildResponse>(`/v1/template-builds/${encodeURIComponent(id)}/cancel`, { method: "POST" });
  }

  retryTemplateBuild(id: string) {
    return this.request<TemplateBuildResponse>(`/v1/template-builds/${encodeURIComponent(id)}/retry`, { method: "POST" });
  }

  promoteTemplateVersion(id: string, versionId: string, alias = "stable") {
    const body: PromoteTemplateBody = { versionId, alias };
    return this.request<TemplateResponse>(`/v1/templates/${encodeURIComponent(id)}/promote`, {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  archiveTemplate(id: string) {
    return this.request<TemplateResponse>(`/v1/templates/${encodeURIComponent(id)}/archive`, { method: "POST" });
  }

  listSandboxes(params = "") {
    return this.request<SandboxesResponse>(`/v1/sandboxes${params}`);
  }

  capacity() {
    return this.request<OrganizationCapacityResponse>("/v1/org/capacity");
  }

  async createSandbox(input: CreateSandboxInput = {}) {
    const { source, cleanupOnSourceError, ...createInput } = input;
    const createCredentialCount = (createInput.credentials?.length ?? 0) + (createInput.credentialMappings?.length ?? 0);
    if (source && createInput.wait === false) {
      throw new Error("Git source bootstrap requires sandbox readiness. Omit wait:false, or create first and call sandbox.git.clone later.");
    }
    if (createCredentialCount && createInput.wait === false) {
      throw new Error("Create-time credentials require sandbox readiness. Omit wait:false, or attach credentials after the sandbox is running.");
    }
    if (createCredentialCount && createInput.waitTimeoutMs !== undefined) {
      throw new Error("Create-time credentials cannot use waitTimeoutMs because credential attachments are not replayed asynchronously.");
    }
    const egress = source?.type === "git" && source.applyEgressPreset !== false
      ? this.egressWithGitPreset(createInput.egress)
      : createInput.egress;
    const result = await this.request<CreateSandboxResponse>("/v1/sandboxes", {
      method: "POST",
      body: JSON.stringify({
        template: createInput.template ?? (createInput.snapshotId ? undefined : "python-3.12-data"),
        snapshotId: createInput.snapshotId,
        workspaceId: createInput.workspaceId,
        name: createInput.name,
        ttlSeconds: createInput.ttlSeconds ?? 300,
        env: createInput.env,
        egress,
        source: source?.type === "git" ? gitSourceForApi(source) : undefined,
        credentials: createInput.credentials,
        credentialMappings: createInput.credentialMappings,
        idempotencyKey: createInput.idempotencyKey ?? globalThis.crypto.randomUUID(),
        wait: createInput.wait,
        waitTimeoutMs: createInput.waitTimeoutMs
      })
    });
    if (!source) return result;

    try {
      const ready = result.sandbox.status === "running" || result.sandbox.status === "idle"
        ? { sandbox: result.sandbox }
        : await this.waitForSandbox(result.sandbox.id, { timeoutMs: Math.max(createInput.waitTimeoutMs ?? 0, 60_000) });
      const startedAt = new Date().toISOString();
      const started = Date.now();
      await this.updateSandboxSource(ready.sandbox.id, {
        source: gitSourceProvenance(source, "cloning", { startedAt })
      });
      await this.cloneGitRepository(ready.sandbox.id, source.url, {
        branch: source.branch,
        commit: source.commit,
        targetPath: source.targetPath,
        depth: source.depth,
        shallow: source.shallow,
        submodules: source.submodules,
        credentials: source.credentials,
        credentialPersistence: source.credentialPersistence,
        timeoutMs: source.timeoutMs
      });
      const completed = await this.updateSandboxSource(ready.sandbox.id, {
        source: gitSourceProvenance(source, "ready", {
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - started
        })
      });
      return { ...result, sandbox: completed.sandbox };
    } catch (error) {
      await this.updateSandboxSource(result.sandbox.id, {
        source: gitSourceProvenance(source, "failed", {
          completedAt: new Date().toISOString(),
          failureReason: redactGitSecrets(error instanceof Error ? error.message : String(error), gitSecretValues(source.credentials))
        })
      }).catch(() => undefined);
      if (cleanupOnSourceError) await this.killSandbox(result.sandbox.id).catch(() => undefined);
      throw error;
    }
  }

  private egressWithGitPreset(egress: CreateSandboxBody["egress"]) {
    if (!egress || egress.mode === "open" || egress.mode === "blocked") return egress;
    return {
      ...egress,
      presets: Array.from(new Set([...(egress.presets ?? []), "git-hosting"]))
    };
  }

  getSandbox(id: string) {
    return this.request<SandboxResponse>(`/v1/sandboxes/${id}`);
  }

  updateSandboxSource(id: string, input: PatchSandboxSourceBody) {
    return this.request<SandboxSourceResponse>(`/v1/sandboxes/${encodeURIComponent(id)}/source`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  }

  async waitForSandbox(id: string, options: WaitForSandboxOptions = {}) {
    const timeoutMs = options.timeoutMs ?? 60_000;
    const intervalMs = options.intervalMs ?? 1_000;
    const targetStatuses = new Set<SandboxStatus>(options.statuses ?? ["running", "idle"]);
    const started = Date.now();
    let last: SandboxResponse | null = null;
    while (Date.now() - started <= timeoutMs) {
      last = await this.getSandbox(id);
      if (targetStatuses.has(last.sandbox.status)) return last;
      if (!options.statuses && (last.sandbox.status === "error" || last.sandbox.status === "terminated")) {
        throw new Error(`Sandbox ${id} reached ${last.sandbox.status} before becoming ready`);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    const suffix = last ? `; last status ${last.sandbox.status}` : "";
    throw new HarakiriWaitTimeoutError(`Timed out waiting for sandbox ${id}${suffix}`, "sandbox", id, last?.sandbox.status);
  }

  renewSandbox(id: string) {
    return this.request<OkResponse>(`/v1/sandboxes/${id}/renew`, { method: "POST" });
  }

  pauseSandbox(id: string) {
    return this.request<SandboxResponse>(`/v1/sandboxes/${encodeURIComponent(id)}/pause`, { method: "POST" });
  }

  resumeSandbox(id: string, options: { idempotencyKey?: string } = {}) {
    return this.request<SandboxResponse>(`/v1/sandboxes/${encodeURIComponent(id)}/resume`, {
      method: "POST", headers: { "Idempotency-Key": options.idempotencyKey ?? globalThis.crypto.randomUUID() }
    });
  }

  createSnapshot(id: string, input: CreateSandboxSnapshotInput = {}) {
    return this.request<SandboxSnapshotResponse>(`/v1/sandboxes/${encodeURIComponent(id)}/snapshots`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  createSandboxSnapshot(id: string, input: CreateSandboxSnapshotInput = {}) {
    return this.createSnapshot(id, input);
  }

  listSnapshots(params = "") {
    return this.request<SandboxSnapshotsResponse>(`/v1/snapshots${params}`);
  }

  getSnapshot(id: string) {
    return this.request<SandboxSnapshotResponse>(`/v1/snapshots/${encodeURIComponent(id)}`);
  }

  getSandboxSnapshot(id: string) {
    return this.getSnapshot(id);
  }

  deleteSnapshot(id: string) {
    return this.request<OkResponse>(`/v1/snapshots/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  deleteSandboxSnapshot(id: string) {
    return this.deleteSnapshot(id);
  }

  async waitForSnapshot(id: string, options: WaitForSnapshotOptions = {}) {
    const timeoutMs = options.timeoutMs ?? 60_000;
    const intervalMs = options.intervalMs ?? 1_000;
    const targetStatuses = new Set<SandboxSnapshotStatus>(options.statuses ?? ["ready"]);
    const started = Date.now();
    let last: SandboxSnapshotResponse | null = null;
    while (Date.now() - started <= timeoutMs) {
      last = await this.getSnapshot(id);
      if (targetStatuses.has(last.snapshot.status as SandboxSnapshotStatus)) return last;
      if (!options.statuses && ["failed", "deleted", "expired"].includes(String(last.snapshot.status))) {
        throw new Error(`Snapshot ${id} reached ${last.snapshot.status} before becoming ready`);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    const suffix = last ? `; last status ${last.snapshot.status}` : "";
    throw new HarakiriWaitTimeoutError(`Timed out waiting for snapshot ${id}${suffix}`, "snapshot", id, String(last?.snapshot.status ?? ""));
  }

  getRuntimeCapabilities() {
    return this.request<RuntimeCapabilitiesResponse>("/v1/runtime/capabilities");
  }

  runSandbox(id: string, input: RunSandboxInput) {
    return this.request<RunSandboxResponse>(`/v1/sandboxes/${id}/run`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  runSandboxCommand(id: string, input: RunSandboxInput) {
    return this.runSandbox(id, input);
  }

  private async executeGitCommand(
    id: string,
    operation: string,
    input: RunSandboxInput,
    secrets: string[] = [],
    metadata?: SandboxCommandMetadata
  ): Promise<GitCommandRunResult> {
    const response = await this.runSandbox(id, metadata ? { ...input, metadata } : input);
    const result = runResultWithRedaction(response, secrets);
    if (result.exitCode !== 0) {
      if (missingGitBinary(result)) {
        throw new HarakiriGitUnsupportedRuntimeError(id, operation, result);
      }
      if (gitNetworkAccessFailure(result)) {
        throw new HarakiriGitNetworkAccessError(id, operation, result);
      }
      throw new HarakiriGitCommandError(
        `Git ${operation} failed in sandbox ${id}: ${result.stderr || result.stdout || `exit ${result.exitCode}`}`,
        id,
        operation,
        result
      );
    }
    return result;
  }

  cloneGitRepository(id: string, url: string, options: GitCloneOptions = {}): Promise<GitCloneResult> {
    const built = buildGitCloneCommand(url, options);
    return this.executeGitCommand(id, "clone", {
      command: built.command,
      env: { ...(options.env ?? {}), ...built.env },
      timeoutMs: options.timeoutMs ?? 120_000
    }, built.secrets, gitCommandMetadata("clone", {
      repositoryUrl: sanitizeGitUrl(url),
      targetPath: built.targetPath,
      branch: options.branch,
      ref: options.commit,
      credentialPersistence: options.credentialPersistence ?? (options.credentials ? "one-shot" : undefined),
      hasCredentials: Boolean(options.credentials)
    })).then((result) => ({
      ...result,
      path: built.targetPath,
      url: sanitizeGitUrl(url)
    }));
  }

  async getGitStatus(id: string, options: GitCommandOptions = {}): Promise<GitStatusResult> {
    const cwd = options.cwd ?? defaultGitPath;
    const result = await this.executeGitCommand(id, "status", {
      command: `${gitPrefix(cwd)} status --short --branch --porcelain=v1`,
      env: options.env,
      timeoutMs: options.timeoutMs
    }, [], gitCommandMetadata("status", { cwd }));
    return parseGitStatus(result);
  }

  async listGitBranches(id: string, options: GitCommandOptions = {}): Promise<GitBranchResult> {
    const cwd = options.cwd ?? defaultGitPath;
    const result = await this.executeGitCommand(id, "branches", {
      command: `${gitPrefix(cwd)} branch --format='%(refname:short)'`,
      env: options.env,
      timeoutMs: options.timeoutMs
    }, [], gitCommandMetadata("branches", { cwd }));
    return {
      ...result,
      branches: result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    };
  }

  checkoutGitRef(id: string, ref: string, options: GitCommandOptions = {}) {
    const cwd = options.cwd ?? defaultGitPath;
    return this.executeGitCommand(id, "checkout", {
      command: `${gitPrefix(cwd)} checkout ${shellQuote(ref)}`,
      env: options.env,
      timeoutMs: options.timeoutMs
    }, [], gitCommandMetadata("checkout", { cwd, ref }));
  }

  createGitBranch(id: string, name: string, options: GitCommandOptions = {}) {
    const cwd = options.cwd ?? defaultGitPath;
    return this.executeGitCommand(id, "branch", {
      command: `${gitPrefix(cwd)} checkout -b ${shellQuote(name)}`,
      env: options.env,
      timeoutMs: options.timeoutMs
    }, [], gitCommandMetadata("create-branch", { cwd, branch: name }));
  }

  deleteGitBranch(id: string, name: string, options: GitCommandOptions = {}) {
    const cwd = options.cwd ?? defaultGitPath;
    return this.executeGitCommand(id, "branch delete", {
      command: `${gitPrefix(cwd)} branch -D ${shellQuote(name)}`,
      env: options.env,
      timeoutMs: options.timeoutMs
    }, [], gitCommandMetadata("delete-branch", { cwd, branch: name }));
  }

  addGitPaths(id: string, paths: string[] = ["."], options: GitCommandOptions = {}) {
    const cwd = options.cwd ?? defaultGitPath;
    const targets = paths.length ? paths : ["."];
    return this.executeGitCommand(id, "add", {
      command: `${gitPrefix(cwd)} add -- ${targets.map(shellQuote).join(" ")}`,
      env: options.env,
      timeoutMs: options.timeoutMs
    }, [], gitCommandMetadata("add", { cwd }));
  }

  commitGitChanges(id: string, message: string, options: GitCommitOptions = {}) {
    const cwd = options.cwd ?? defaultGitPath;
    const config = [
      options.authorName ? `-c user.name=${shellQuote(options.authorName)}` : "",
      options.authorEmail ? `-c user.email=${shellQuote(options.authorEmail)}` : ""
    ].filter(Boolean).join(" ");
    const args = [
      "commit",
      options.all ? "-a" : "",
      options.allowEmpty ? "--allow-empty" : "",
      "-m",
      shellQuote(message)
    ].filter(Boolean).join(" ");
    return this.executeGitCommand(id, "commit", {
      command: `${gitPrefix(cwd)}${config ? ` ${config}` : ""} ${args}`,
      env: options.env,
      timeoutMs: options.timeoutMs
    }, [], gitCommandMetadata("commit", { cwd }));
  }

  pullGitRepository(id: string, options: GitPullOptions = {}) {
    const cwd = options.cwd ?? defaultGitPath;
    const remote = options.remote ?? "origin";
    const askPass = gitAskPassSetup(options.credentials);
    const args = [
      "git",
      "-C",
      shellQuote(cwd),
      "pull",
      options.rebase ? "--rebase" : "",
      shellQuote(remote),
      options.branch ? shellQuote(options.branch) : ""
    ].filter(Boolean).join(" ");
    const command = [
      "set -eu",
      ...askPass.before,
      "command -v git >/dev/null 2>&1 || { echo 'git binary not found in sandbox image' >&2; exit 127; }",
      buildTemporaryRemoteCommand(cwd, remote, options.remoteUrl, options.credentials, options.credentialPersistence, args),
      ...askPass.after
    ].join("\n");
    return this.executeGitCommand(id, "pull", {
      command,
      env: { ...(options.env ?? {}), ...gitCredentialEnv(options.credentials) },
      timeoutMs: options.timeoutMs
    }, gitSecretValues(options.credentials), gitCommandMetadata("pull", {
      cwd,
      remote,
      branch: options.branch,
      repositoryUrl: options.remoteUrl ? sanitizeGitUrl(options.remoteUrl) : undefined,
      credentialPersistence: options.credentialPersistence ?? (options.credentials ? "one-shot" : undefined),
      hasCredentials: Boolean(options.credentials)
    }));
  }

  pushGitRepository(id: string, options: GitPushOptions = {}) {
    const cwd = options.cwd ?? defaultGitPath;
    const remote = options.remote ?? "origin";
    const askPass = gitAskPassSetup(options.credentials);
    const args = [
      "git",
      "-C",
      shellQuote(cwd),
      "push",
      options.setUpstream ? "--set-upstream" : "",
      shellQuote(remote),
      options.branch ? shellQuote(options.branch) : ""
    ].filter(Boolean).join(" ");
    const command = [
      "set -eu",
      ...askPass.before,
      "command -v git >/dev/null 2>&1 || { echo 'git binary not found in sandbox image' >&2; exit 127; }",
      buildTemporaryRemoteCommand(cwd, remote, options.remoteUrl, options.credentials, options.credentialPersistence, args),
      ...askPass.after
    ].join("\n");
    return this.executeGitCommand(id, "push", {
      command,
      env: { ...(options.env ?? {}), ...gitCredentialEnv(options.credentials) },
      timeoutMs: options.timeoutMs
    }, gitSecretValues(options.credentials), gitCommandMetadata("push", {
      cwd,
      remote,
      branch: options.branch,
      repositoryUrl: options.remoteUrl ? sanitizeGitUrl(options.remoteUrl) : undefined,
      credentialPersistence: options.credentialPersistence ?? (options.credentials ? "one-shot" : undefined),
      hasCredentials: Boolean(options.credentials)
    }));
  }

  listGitRemotes(id: string, options: GitCommandOptions = {}) {
    const cwd = options.cwd ?? defaultGitPath;
    return this.executeGitCommand(id, "remotes", {
      command: `${gitPrefix(cwd)} remote -v`,
      env: options.env,
      timeoutMs: options.timeoutMs
    }, [], gitCommandMetadata("remotes", { cwd }));
  }

  addGitRemote(id: string, name: string, url: string, options: GitCommandOptions = {}) {
    const cwd = options.cwd ?? defaultGitPath;
    return this.executeGitCommand(id, "remote add", {
      command: `${gitPrefix(cwd)} remote add ${shellQuote(name)} ${shellQuote(sanitizeGitUrl(url))}`,
      env: options.env,
      timeoutMs: options.timeoutMs
    }, [], gitCommandMetadata("remote-add", { cwd, remote: name, repositoryUrl: sanitizeGitUrl(url) }));
  }

  setGitConfig(id: string, key: string, value: string, options: GitCommandOptions = {}) {
    const cwd = options.cwd ?? defaultGitPath;
    return this.executeGitCommand(id, "config", {
      command: `${gitPrefix(cwd)} config ${shellQuote(key)} ${shellQuote(value)}`,
      env: options.env,
      timeoutMs: options.timeoutMs
    }, [], gitCommandMetadata("config-set", { cwd, configKey: key }));
  }

  getGitConfig(id: string, key: string, options: GitCommandOptions = {}) {
    const cwd = options.cwd ?? defaultGitPath;
    return this.executeGitCommand(id, "config get", {
      command: `${gitPrefix(cwd)} config --get ${shellQuote(key)}`,
      env: options.env,
      timeoutMs: options.timeoutMs
    }, [], gitCommandMetadata("config-get", { cwd, configKey: key }));
  }

  configureGitUser(id: string, input: { name: string; email: string }, options: GitCommandOptions = {}) {
    const cwd = options.cwd ?? defaultGitPath;
    return this.executeGitCommand(id, "configure user", {
      command: [
        "set -eu",
        `${gitPrefix(cwd)} config user.name ${shellQuote(input.name)}`,
        `git -C ${shellQuote(cwd)} config user.email ${shellQuote(input.email)}`
      ].join("\n"),
      env: options.env,
      timeoutMs: options.timeoutMs
    }, [], gitCommandMetadata("configure-user", { cwd, configKey: "user.name,user.email" }));
  }

  startCommand(id: string, input: CreateSandboxCommandInput) {
    return this.request<SandboxCommandResponse>(`/v1/sandboxes/${id}/commands`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  createSandboxCommand(id: string, input: CreateSandboxCommandInput) {
    return this.startCommand(id, input);
  }

  runCommand(id: string, input: CreateSandboxCommandInput) {
    return this.startCommand(id, input);
  }

  listCommands(id: string) {
    return this.request<SandboxCommandsResponse>(`/v1/sandboxes/${id}/commands`);
  }

  listSandboxCommands(id: string) {
    return this.listCommands(id);
  }

  getCommand(id: string, commandId: string) {
    return this.request<SandboxCommandResponse>(`/v1/sandboxes/${id}/commands/${encodeURIComponent(commandId)}`);
  }

  getSandboxCommand(id: string, commandId: string) {
    return this.getCommand(id, commandId);
  }

  async waitForCommand(id: string, commandId: string, options: WaitForCommandOptions = {}) {
    const timeoutMs = options.timeoutMs ?? 60_000;
    const intervalMs = options.intervalMs ?? 1_000;
    const targetStatuses = new Set<SandboxCommandStatus>(options.statuses ?? ["succeeded"]);
    const started = Date.now();
    let last: SandboxCommandResponse | null = null;
    while (Date.now() - started <= timeoutMs) {
      last = await this.getCommand(id, commandId);
      if (targetStatuses.has(last.command.status)) return last;
      if (!options.statuses && (last.command.status === "failed" || last.command.status === "killed")) {
        throw new HarakiriCommandEndedError(`Command ${commandId} reached ${last.command.status} before succeeding`, id, commandId, last.command);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    const suffix = last ? `; last status ${last.command.status}` : "";
    throw new HarakiriWaitTimeoutError(`Timed out waiting for command ${commandId}${suffix}`, "command", commandId, last?.command.status);
  }

  getCommandLogs(id: string, commandId: string, options: GetCommandLogsOptions = {}) {
    const params = new URLSearchParams();
    if (options.cursor !== undefined) params.set("cursor", String(options.cursor));
    if (options.tail !== undefined) params.set("tail", String(options.tail));
    const suffix = params.size ? `?${params.toString()}` : "";
    return this.request<SandboxCommandLogsResponse>(`/v1/sandboxes/${id}/commands/${encodeURIComponent(commandId)}/logs${suffix}`);
  }

  getSandboxCommandLogs(id: string, commandId: string, options: GetCommandLogsOptions = {}) {
    return this.getCommandLogs(id, commandId, options);
  }

  commandLogs(id: string, commandId: string, options: GetCommandLogsOptions = {}) {
    return this.getCommandLogs(id, commandId, options);
  }

  killCommand(id: string, commandId: string) {
    return this.request<SandboxCommandResponse>(`/v1/sandboxes/${id}/commands/${encodeURIComponent(commandId)}`, { method: "DELETE" });
  }

  killSandboxCommand(id: string, commandId: string) {
    return this.killCommand(id, commandId);
  }

  createCommandSession(id: string, input: CreateSandboxCommandSessionInput = {}) {
    return this.request<SandboxCommandSessionResponse>(`/v1/sandboxes/${id}/command-sessions`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  createSandboxCommandSession(id: string, input: CreateSandboxCommandSessionInput = {}) {
    return this.createCommandSession(id, input);
  }

  runCommandSession(id: string, sessionId: string, input: RunSandboxCommandSessionInput) {
    return this.request<RunSandboxCommandSessionResponse>(
      `/v1/sandboxes/${id}/command-sessions/${encodeURIComponent(sessionId)}/run`,
      {
        method: "POST",
        body: JSON.stringify(input)
      }
    );
  }

  runSandboxCommandSession(id: string, sessionId: string, input: RunSandboxCommandSessionInput) {
    return this.runCommandSession(id, sessionId, input);
  }

  deleteCommandSession(id: string, sessionId: string) {
    return this.request<SandboxCommandSessionResponse>(`/v1/sandboxes/${id}/command-sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE"
    });
  }

  deleteSandboxCommandSession(id: string, sessionId: string) {
    return this.deleteCommandSession(id, sessionId);
  }

  createTerminalAttachUrl(id: string, options: TerminalAttachOptions = {}) {
    const url = new URL(`${this.apiUrl}/v1/sandboxes/${encodeURIComponent(id)}/terminal/attach`);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    if (options.cwd) url.searchParams.set("cwd", options.cwd);
    if (options.shell) url.searchParams.set("shell", options.shell);
    if (options.sessionName) url.searchParams.set("sessionName", options.sessionName);
    for (const [key, value] of Object.entries(options.env ?? {})) url.searchParams.append("env", `${key}=${value}`);
    if (options.cols !== undefined) url.searchParams.set("cols", String(options.cols));
    if (options.rows !== undefined) url.searchParams.set("rows", String(options.rows));
    if (options.since !== undefined) url.searchParams.set("since", String(options.since));
    if (options.pty !== undefined) url.searchParams.set("pty", options.pty ? "true" : "false");
    return url.toString();
  }

  createSandboxTerminalAttachUrl(id: string, options: TerminalAttachOptions = {}) {
    return this.createTerminalAttachUrl(id, options);
  }

  createTerminalAttachRequest(id: string, options: TerminalAttachOptions = {}): TerminalAttachRequest {
    return {
      url: this.createTerminalAttachUrl(id, options),
      headers: { "x-api-key": this.apiKey }
    };
  }

  createSandboxTerminalAttachRequest(id: string, options: TerminalAttachOptions = {}) {
    return this.createTerminalAttachRequest(id, options);
  }

  createTerminalAttachTicket(id: string) {
    return this.request<SandboxTerminalAttachTicketResponse>(`/v1/sandboxes/${id}/terminal/attach-ticket`, {
      method: "POST"
    });
  }

  createSandboxTerminalAttachTicket(id: string) {
    return this.createTerminalAttachTicket(id);
  }

  getSandboxLogs(id: string) {
    return this.request<SandboxLogsResponse>(`/v1/sandboxes/${id}/logs`);
  }

  listSandboxFiles(id: string, path?: string) {
    return this.request<SandboxFilesResponse>(`/v1/sandboxes/${id}/files${path ? `?path=${encodeURIComponent(path)}` : ""}`);
  }

  statSandboxFile(id: string, path: string) {
    return this.request<SandboxFileStatResponse>(`/v1/sandboxes/${id}/files/stat?path=${encodeURIComponent(path)}`);
  }

  readSandboxFile(id: string, path: string, options: { encoding?: "utf8" | "base64" } = {}) {
    const params = new URLSearchParams({ path });
    if (options.encoding) params.set("encoding", options.encoding);
    return this.request<SandboxFileReadResponse>(`/v1/sandboxes/${id}/files/read?${params.toString()}`);
  }

  writeSandboxFile(id: string, input: SandboxFileWriteBody) {
    return this.request<SandboxFileWriteResponse>(`/v1/sandboxes/${id}/files`, {
      method: "PUT",
      body: JSON.stringify(input)
    });
  }

  uploadSandboxFile(id: string, input: SandboxFileUploadBody) {
    return this.request<SandboxFileUploadResponse>(`/v1/sandboxes/${id}/files/upload`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  downloadSandboxFile(id: string, path: string) {
    return this.request<SandboxFileDownloadResponse>(`/v1/sandboxes/${id}/files/download?path=${encodeURIComponent(path)}`);
  }

  mkdirSandboxFile(id: string, input: SandboxFileMkdirBody) {
    return this.request<SandboxFileMkdirResponse>(`/v1/sandboxes/${id}/files/mkdir`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  removeSandboxFile(id: string, path: string, options: { recursive?: boolean } = {}) {
    const params = new URLSearchParams({ path });
    if (options.recursive !== undefined) params.set("recursive", String(options.recursive));
    return this.request<SandboxFileRemoveResponse>(`/v1/sandboxes/${id}/files?${params.toString()}`, { method: "DELETE" });
  }

  renameSandboxFile(id: string, input: SandboxFileRenameBody) {
    return this.request<SandboxFileRenameResponse>(`/v1/sandboxes/${id}/files/rename`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  getSandboxMetrics(id: string) {
    return this.request<SandboxMetricsResponse>(`/v1/sandboxes/${id}/metrics`);
  }

  killSandbox(id: string) {
    return this.request<OkResponse>(`/v1/sandboxes/${id}`, { method: "DELETE" });
  }

  listRoutes(id: string) {
    return this.request<SandboxRoutesResponse>(`/v1/sandboxes/${id}/routes`);
  }

  listSandboxRoutes(id: string) {
    return this.listRoutes(id);
  }

  getEgressPolicy(id: string) {
    return this.request<SandboxEgressResponse>(`/v1/sandboxes/${id}/egress`);
  }

  getSandboxEgress(id: string) {
    return this.getEgressPolicy(id);
  }

  getOutboundAccess(id: string) {
    return this.getEgressPolicy(id);
  }

  updateEgressPolicy(id: string, input: PatchSandboxEgressBody) {
    return this.request<SandboxEgressResponse>(`/v1/sandboxes/${id}/egress`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  }

  updateSandboxEgress(id: string, input: PatchSandboxEgressBody) {
    return this.updateEgressPolicy(id, input);
  }

  setOutboundAccess(id: string, input: PatchSandboxEgressBody) {
    return this.updateEgressPolicy(id, input);
  }

  allowEgress(id: string, domains: string[]) {
    return this.updateEgressPolicy(id, { allow: domains });
  }

  allowDomains(id: string, domains: string[]) {
    return this.allowEgress(id, domains);
  }

  denyEgress(id: string, domains: string[]) {
    return this.updateEgressPolicy(id, { deny: domains });
  }

  denyDomains(id: string, domains: string[]) {
    return this.denyEgress(id, domains);
  }

  blockEgress(id: string) {
    return this.updateEgressPolicy(id, { mode: "blocked" });
  }

  blockOutboundAccess(id: string) {
    return this.blockEgress(id);
  }

  testEgress(id: string, target: string | TestSandboxEgressBody) {
    const body: TestSandboxEgressBody = typeof target === "string" ? { target } : target;
    return this.request<TestSandboxEgressResponse>(`/v1/sandboxes/${id}/egress/test`, {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  testOutboundAccess(id: string, target: string | TestSandboxEgressBody) {
    return this.testEgress(id, target);
  }

  listCredentials(id: string) {
    return this.request<SandboxCredentialsResponse>(`/v1/sandboxes/${encodeURIComponent(id)}/credentials`);
  }

  listSandboxCredentials(id: string) {
    return this.listCredentials(id);
  }

  inspectCredentials(id: string) {
    return this.request<InspectSandboxCredentialsResponse>(
      `/v1/sandboxes/${encodeURIComponent(id)}/credentials/inspect`,
      { method: "POST" }
    );
  }

  inspectSandboxCredentials(id: string) {
    return this.inspectCredentials(id);
  }

  attachCredential(id: string, input: AttachSandboxCredentialInput) {
    return this.request<AttachSandboxCredentialResponse>(`/v1/sandboxes/${encodeURIComponent(id)}/credentials`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  attachSandboxCredential(id: string, input: AttachSandboxCredentialInput) {
    return this.attachCredential(id, input);
  }

  attachWorkspaceCredentialSecret(id: string, secretId: string, input: AttachWorkspaceCredentialSecretInput = {}) {
    return this.attachCredential(id, {
      ...input,
      sourceType: "harakiri_encrypted",
      secretId
    });
  }

  attachExternalSecretReference(id: string, referenceId: string, input: AttachExternalSecretReferenceInput = {}) {
    return this.attachCredential(id, {
      ...input,
      sourceType: "external_ref",
      referenceId
    });
  }

  attachDynamicCredentialIssuer(id: string, issuerId: string, input: AttachDynamicCredentialIssuerInput = {}) {
    return this.attachCredential(id, {
      ...input,
      sourceType: "dynamic",
      issuerId
    });
  }

  rehydrateCredentials(id: string) {
    return this.request<RehydrateSandboxCredentialsResponse>(
      `/v1/sandboxes/${encodeURIComponent(id)}/credentials/rehydrate`,
      { method: "POST" }
    );
  }

  refreshCredential(id: string, attachmentId: string) {
    return this.request<RefreshSandboxCredentialResponse>(
      `/v1/sandboxes/${encodeURIComponent(id)}/credentials/${encodeURIComponent(attachmentId)}/refresh`,
      { method: "POST" }
    );
  }

  refreshSandboxCredential(id: string, attachmentId: string) {
    return this.refreshCredential(id, attachmentId);
  }

  rehydrateSandboxCredentials(id: string) {
    return this.rehydrateCredentials(id);
  }

  detachCredential(id: string, attachmentId: string) {
    return this.request<DetachSandboxCredentialResponse>(
      `/v1/sandboxes/${encodeURIComponent(id)}/credentials/${encodeURIComponent(attachmentId)}`,
      { method: "DELETE" }
    );
  }

  detachSandboxCredential(id: string, attachmentId: string) {
    return this.detachCredential(id, attachmentId);
  }

  testCredential(id: string, attachmentId: string, input: TestSandboxCredentialInput = {}) {
    return this.request<TestSandboxCredentialResponse>(
      `/v1/sandboxes/${encodeURIComponent(id)}/credentials/${encodeURIComponent(attachmentId)}/test`,
      {
        method: "POST",
        body: JSON.stringify(input)
      }
    );
  }

  testSandboxCredential(id: string, attachmentId: string, input: TestSandboxCredentialInput = {}) {
    return this.testCredential(id, attachmentId, input);
  }

  listCredentialPresets() {
    return this.request<CredentialProviderPresetsResponse>("/v1/credential-presets");
  }

  getCredentialPreset(id: string) {
    return this.request<CredentialProviderPresetResponse>(`/v1/credential-presets/${encodeURIComponent(id)}`);
  }

  listCredentialSecrets(options: { includeDeleted?: boolean } = {}) {
    return this.request<CredentialSecretsResponse>(`/v1/credential-secrets${options.includeDeleted ? "?includeDeleted=1" : ""}`);
  }

  getCredentialSecret(id: string) {
    return this.request<CredentialSecretResponse>(`/v1/credential-secrets/${encodeURIComponent(id)}`);
  }

  createCredentialSecret(input: CreateCredentialSecretInput) {
    return this.request<CredentialSecretResponse>("/v1/credential-secrets", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  updateCredentialSecret(id: string, input: UpdateCredentialSecretInput) {
    return this.request<CredentialSecretResponse>(`/v1/credential-secrets/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  }

  rotateCredentialSecret(id: string, input: RotateCredentialSecretInput) {
    return this.request<CredentialSecretResponse>(`/v1/credential-secrets/${encodeURIComponent(id)}/rotate`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  disableCredentialSecret(id: string) {
    return this.request<CredentialSecretResponse>(`/v1/credential-secrets/${encodeURIComponent(id)}/disable`, { method: "POST" });
  }

  enableCredentialSecret(id: string) {
    return this.request<CredentialSecretResponse>(`/v1/credential-secrets/${encodeURIComponent(id)}/enable`, { method: "POST" });
  }

  deleteCredentialSecret(id: string) {
    return this.request<CredentialSecretResponse>(`/v1/credential-secrets/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  listExternalSecretReferences(options: { includeDeleted?: boolean } = {}) {
    const query = options.includeDeleted ? "?includeDeleted=1" : "";
    return this.request<ExternalSecretReferencesResponse>(`/v1/external-secret-references${query}`);
  }

  getExternalSecretReference(id: string) {
    return this.request<ExternalSecretReferenceResponse>(`/v1/external-secret-references/${encodeURIComponent(id)}`);
  }

  createExternalSecretReference(input: CreateExternalSecretReferenceInput) {
    return this.request<ExternalSecretReferenceResponse>("/v1/external-secret-references", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  updateExternalSecretReference(id: string, input: UpdateExternalSecretReferenceInput) {
    return this.request<ExternalSecretReferenceResponse>(`/v1/external-secret-references/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  }

  validateExternalSecretReference(id: string) {
    return this.request<ExternalSecretReferenceResponse>(`/v1/external-secret-references/${encodeURIComponent(id)}/validate`, {
      method: "POST"
    });
  }

  disableExternalSecretReference(id: string) {
    return this.request<ExternalSecretReferenceResponse>(`/v1/external-secret-references/${encodeURIComponent(id)}/disable`, {
      method: "POST"
    });
  }

  enableExternalSecretReference(id: string) {
    return this.request<ExternalSecretReferenceResponse>(`/v1/external-secret-references/${encodeURIComponent(id)}/enable`, {
      method: "POST"
    });
  }

  deleteExternalSecretReference(id: string) {
    return this.request<ExternalSecretReferenceResponse>(`/v1/external-secret-references/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
  }

  listDynamicCredentialIssuers(options: { includeDeleted?: boolean } = {}) {
    const query = options.includeDeleted ? "?includeDeleted=1" : "";
    return this.request<DynamicCredentialIssuersResponse>(`/v1/dynamic-credential-issuers${query}`);
  }

  getDynamicCredentialIssuer(id: string) {
    return this.request<DynamicCredentialIssuerResponse>(`/v1/dynamic-credential-issuers/${encodeURIComponent(id)}`);
  }

  createDynamicCredentialIssuer(input: CreateDynamicCredentialIssuerInput) {
    return this.request<DynamicCredentialIssuerResponse>("/v1/dynamic-credential-issuers", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  updateDynamicCredentialIssuer(id: string, input: UpdateDynamicCredentialIssuerInput) {
    return this.request<DynamicCredentialIssuerResponse>(`/v1/dynamic-credential-issuers/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  }

  validateDynamicCredentialIssuer(id: string) {
    return this.request<DynamicCredentialIssuerResponse>(`/v1/dynamic-credential-issuers/${encodeURIComponent(id)}/validate`, {
      method: "POST"
    });
  }

  disableDynamicCredentialIssuer(id: string) {
    return this.request<DynamicCredentialIssuerResponse>(`/v1/dynamic-credential-issuers/${encodeURIComponent(id)}/disable`, {
      method: "POST"
    });
  }

  enableDynamicCredentialIssuer(id: string) {
    return this.request<DynamicCredentialIssuerResponse>(`/v1/dynamic-credential-issuers/${encodeURIComponent(id)}/enable`, {
      method: "POST"
    });
  }

  deleteDynamicCredentialIssuer(id: string) {
    return this.request<DynamicCredentialIssuerResponse>(`/v1/dynamic-credential-issuers/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
  }

  listAuditEvents(input: ListAuditEventsInput = {}) {
    const query = new URLSearchParams();
    if (input.targetType) query.set("targetType", input.targetType);
    if (input.targetId) query.set("targetId", input.targetId);
    if (input.actionPrefix) query.set("actionPrefix", input.actionPrefix);
    if (input.limit !== undefined) query.set("limit", String(input.limit));
    if (input.offset !== undefined) query.set("offset", String(input.offset));
    const suffix = query.size ? `?${query.toString()}` : "";
    return this.request<AuditEventsResponse>(`/v1/audit-events${suffix}`);
  }

  exposePort(id: string, input: ExposePortInput) {
    return this.request<SandboxRouteResponse>(`/v1/sandboxes/${id}/routes`, {
      method: "POST",
      body: JSON.stringify({
        port: input.port,
        protocol: input.protocol ?? "http",
        accessMode: input.accessMode ?? "public",
        labels: input.labels
      })
    });
  }

  exposeSandboxRoute(id: string, input: ExposePortInput) {
    return this.exposePort(id, input);
  }

  deleteRoute(id: string, port: number) {
    return this.request<SandboxRouteResponse>(`/v1/sandboxes/${id}/routes/${encodeURIComponent(String(port))}`, { method: "DELETE" });
  }

  deleteSandboxRoute(id: string, port: number) {
    return this.deleteRoute(id, port);
  }

  async getHost(id: string, port: number) {
    const result = await this.exposePort(id, { port });
    return result.route.url;
  }

  getRouteUrl(id: string, port: number) {
    return this.getHost(id, port);
  }

  async exposeAndWaitForHttp(id: string, input: ExposePortInput, options: ExposeAndWaitOptions = {}) {
    const result = await this.exposePort(id, input);
    await waitForRouteHttp(result, options);
    return result;
  }

  /** Requires a human OIDC bearer token. API keys cannot list or mint other keys. */
  listApiKeys() {
    return this.request<ApiKeysResponse>("/v1/api-keys");
  }

  listRegistryCredentials(options: { includeRevoked?: boolean } = {}) {
    return this.request<RegistryCredentialsResponse>(`/v1/registry-credentials${options.includeRevoked ? "?includeRevoked=1" : ""}`);
  }

  upsertRegistryCredential(input: UpsertRegistryCredentialInput) {
    return this.request<RegistryCredentialResponse>("/v1/registry-credentials", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  revokeRegistryCredential(id: string) {
    return this.request<RegistryCredentialResponse>(`/v1/registry-credentials/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  usage() {
    return this.request<UsageSummary>("/v1/usage");
  }
}
export type { ApiKeyScope, ApiKeySummary, CreateApiKeyBody, CreateApiKeyResponse } from "./protocol.js";
