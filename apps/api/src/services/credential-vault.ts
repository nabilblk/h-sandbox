import {
  defaultEgressPolicyInput,
  customCredentialProfilesShareScope,
  normalizeEgressTarget,
  type AttachSandboxCredentialBody,
  type TemplateCredentialSlot,
  type TemplateCredentialSlotMappingBody,
  type CredentialVaultAuth,
  type CredentialVaultBinding,
  type CredentialVaultMatch,
  type CredentialVaultProviderState,
  type CredentialVaultSubstitution,
  type TestSandboxCredentialBody,
  type TestSandboxCredentialResponse,
  type InlineEphemeralSandboxCredentialBody,
  type SandboxCredentialAttachmentSummary,
  type EgressPolicyInput,
  type EgressPolicySummary
} from "@harakiri/shared";
import { makeId } from "../crypto.js";
import { query as defaultQuery } from "../db.js";
import type { RuntimeProvider, RuntimeSandboxRef } from "../providers/runtime/provider.js";
import { redactText } from "../redaction.js";
import {
  isResolvableCredentialSourceBody,
  resolveCredentialSourceMaterial,
  resolveCredentialSourceMaterialForSystem,
  type CredentialSourceMaterialDependencies,
  type CredentialSourceMaterialFailure,
  type CredentialSourceMaterialResult,
  type ResolvableCredentialSourceBody,
  type ResolvedCredentialSourceMaterial
} from "./credential-source-material.js";
import type { DecryptWorkspaceCredentialSecret } from "./workspace-credential-secrets.js";
import type { ExternalSecretResolverRegistry } from "../providers/secrets/provider.js";
import type { DynamicCredentialIssuerRegistry } from "../providers/credentials/provider.js";
import {
  policyInputFromSummary,
  runtimeEgressPolicyFromSummary,
  validateEgressPolicyForOrganization
} from "./egress-policy.js";
import type { Audit, SandboxEventRecorder } from "./sandbox-runtime.js";
import type { Query } from "./query.js";

type SandboxCredentialAttachmentRow = {
  id: string;
  sandboxId: string;
  displayName: string;
  sourceType: SandboxCredentialAttachmentSummary["sourceType"];
  sourceRef: string | null;
  credentialName: string;
  bindingName: string;
  match: CredentialVaultMatch;
  auth: CredentialVaultAuth;
  fakeEnv: Record<string, string>;
  status: SandboxCredentialAttachmentSummary["status"];
  provider: string;
  providerRevision: number | null;
  providerState: SandboxCredentialAttachmentSummary["providerState"];
  providerCheckedAt: Date | string | null;
  providerMetadata: Record<string, unknown>;
  sourceMetadata: Record<string, unknown>;
  expiresAt: Date | string | null;
  refreshAttemptedAt: Date | string | null;
  refreshedAt: Date | string | null;
  lastError: string | null;
  injectedAt: Date | string | null;
  detachedAt: Date | string | null;
  createdByUserId: string | null;
  createdByLabel: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type SandboxForCredentials = {
  id: string;
  opensandboxId: string | null;
  status: string;
  egressPolicy: EgressPolicyInput | null;
};

type TestSandboxCredentialInput = {
  organizationId: string;
  sandboxId: string;
  attachmentId: string;
  actorUserId: string;
  actorLabel: string;
  body: TestSandboxCredentialBody;
};

type TestSandboxCredentialDependencies = {
  query?: Query;
  runtimeProvider: RuntimeProvider;
  recordEvent: SandboxEventRecorder;
  recordAudit: Audit;
};

export type PreparedSandboxCredentialAttachment = {
  secretValue: string;
  fakeEnv: Record<string, string>;
  sourceType: SandboxCredentialAttachmentSummary["sourceType"];
  sourceRef: string | null;
  credentialName: string;
  bindingName: string;
  displayName: string;
  binding: CredentialVaultBinding;
  sourceMetadata: Record<string, unknown>;
  expiresAt: string | null;
};

export type PrepareSandboxCredentialAttachmentResult =
  | { kind: "ok"; attachment: PreparedSandboxCredentialAttachment }
  | { kind: "secret_required"; message: string }
  | { kind: "invalid_binding"; message: string };

export type PrepareCredentialSourceAttachmentResult =
  | PrepareSandboxCredentialAttachmentResult
  | CredentialSourceMaterialFailure;

export type AttachPreparedSandboxCredentialResult =
  | { kind: "not_found" }
  | { kind: "sandbox_not_running"; status: string }
  | { kind: "unsupported"; message: string }
  | { kind: "invalid_binding"; message: string }
  | { kind: "secret_required"; message: string }
  | { kind: "egress_conflict"; message: string }
  | { kind: "provider_unavailable"; message: string; attachment: SandboxCredentialAttachmentSummary }
  | { kind: "ok"; attachment: SandboxCredentialAttachmentSummary; vault: CredentialVaultProviderState };

export type AttachSandboxCredentialResult =
  | AttachPreparedSandboxCredentialResult
  | CredentialSourceMaterialFailure;

export type DetachSandboxCredentialResult =
  | { kind: "not_found" }
  | { kind: "attachment_not_found" }
  | { kind: "sandbox_not_running"; status: string }
  | { kind: "unsupported"; message: string }
  | { kind: "provider_unavailable"; message: string }
  | { kind: "ok"; attachment: SandboxCredentialAttachmentSummary; vault: CredentialVaultProviderState | null };

export type RehydrateSandboxCredentialsResult =
  | { kind: "not_found" }
  | { kind: "sandbox_not_running"; status: string }
  | { kind: "unsupported"; message: string }
  | {
    kind: "ok";
    attachments: SandboxCredentialAttachmentSummary[];
    vault: CredentialVaultProviderState | null;
    rehydrated: number;
    skipped: number;
    failed: number;
  };

export type RefreshSandboxCredentialResult =
  | { kind: "not_found" }
  | { kind: "attachment_not_found" }
  | { kind: "sandbox_not_running"; status: string }
  | { kind: "unsupported"; message: string }
  | { kind: "not_refreshable"; sourceType: SandboxCredentialAttachmentSummary["sourceType"] }
  | {
    kind: "source_unavailable";
    sourceKind: CredentialSourceMaterialFailure["kind"];
    message: string;
    attachment: SandboxCredentialAttachmentSummary;
  }
  | { kind: "provider_unavailable"; message: string; attachment: SandboxCredentialAttachmentSummary }
  | { kind: "ok"; attachment: SandboxCredentialAttachmentSummary; vault: CredentialVaultProviderState };

export type InspectSandboxCredentialsResult =
  | { kind: "not_found" }
  | { kind: "sandbox_not_running"; status: string }
  | { kind: "unsupported"; message: string }
  | { kind: "provider_unavailable"; message: string; attachments: SandboxCredentialAttachmentSummary[] }
  | { kind: "ok"; attachments: SandboxCredentialAttachmentSummary[]; vault: CredentialVaultProviderState | null };

export type TestSandboxCredentialResult =
  | { kind: "not_found" }
  | { kind: "attachment_not_found" }
  | { kind: "sandbox_not_running"; response: TestSandboxCredentialResponse }
  | { kind: "not_injected"; response: TestSandboxCredentialResponse }
  | { kind: "invalid_binding"; message: string }
  | { kind: "provider_unavailable"; response: TestSandboxCredentialResponse }
  | { kind: "ok"; response: TestSandboxCredentialResponse };

const attachmentProjection = `
         id,
         sandbox_id AS "sandboxId",
         display_name AS "displayName",
         source_type AS "sourceType",
         source_ref AS "sourceRef",
         credential_name AS "credentialName",
         binding_name AS "bindingName",
         match,
         auth,
         fake_env AS "fakeEnv",
         status,
         provider,
         provider_revision AS "providerRevision",
         provider_state AS "providerState",
         provider_checked_at AS "providerCheckedAt",
         provider_metadata AS "providerMetadata",
         source_metadata AS "sourceMetadata",
         expires_at AS "expiresAt",
         refresh_attempted_at AS "refreshAttemptedAt",
         refreshed_at AS "refreshedAt",
         last_error AS "lastError",
         injected_at AS "injectedAt",
         detached_at AS "detachedAt",
         created_by_user_id::text AS "createdByUserId",
         created_by_label AS "createdByLabel",
         created_at AS "createdAt",
         updated_at AS "updatedAt"`;

const attachmentSelect = `
  SELECT ${attachmentProjection}
  FROM sandbox_credential_attachments
`;

const toIso = (value: Date | string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const toIsoOrNull = (value: Date | string | null | undefined) => value ? toIso(value) : null;

const dynamicRefreshLeadMs = 5 * 60 * 1000;

const timestamp = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

const attachmentRefreshState = (
  row: SandboxCredentialAttachmentRow,
  nowMs = Date.now()
): SandboxCredentialAttachmentSummary["refreshState"] => {
  if (row.sourceType !== "dynamic") return "not_applicable";
  const expiresAt = timestamp(row.expiresAt);
  if (expiresAt !== null && expiresAt <= nowMs) return "expired";
  const attemptedAt = timestamp(row.refreshAttemptedAt);
  const refreshedAt = timestamp(row.refreshedAt);
  if (row.lastError && attemptedAt !== null && (refreshedAt === null || attemptedAt > refreshedAt)) {
    return "refresh_failed";
  }
  if (expiresAt !== null && expiresAt <= nowMs + dynamicRefreshLeadMs) return "expiring";
  return "current";
};

const mapAttachmentRow = (row: SandboxCredentialAttachmentRow): SandboxCredentialAttachmentSummary => ({
  id: row.id,
  sandboxId: row.sandboxId,
  displayName: row.displayName,
  sourceType: row.sourceType,
  sourceRef: row.sourceRef ?? null,
  credentialName: row.credentialName,
  bindingName: row.bindingName,
  match: row.match,
  auth: row.auth,
  fakeEnv: row.fakeEnv ?? {},
  status: row.status,
  provider: row.provider,
  providerRevision: row.providerRevision,
  providerState: row.providerState ?? "unknown",
  providerCheckedAt: toIsoOrNull(row.providerCheckedAt),
  providerMetadata: row.providerMetadata ?? {},
  sourceMetadata: row.sourceMetadata ?? {},
  expiresAt: toIsoOrNull(row.expiresAt),
  refreshState: attachmentRefreshState(row),
  refreshAttemptedAt: toIsoOrNull(row.refreshAttemptedAt),
  refreshedAt: toIsoOrNull(row.refreshedAt),
  lastError: row.lastError,
  injectedAt: toIsoOrNull(row.injectedAt),
  detachedAt: toIsoOrNull(row.detachedAt),
  createdByUserId: row.createdByUserId,
  createdByLabel: row.createdByLabel,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt)
});

const activeSandboxStates = new Set(["running", "idle"]);
const providerNamePattern = /^[A-Za-z0-9_.:-]{1,128}$/;
const headerNamePattern = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;
const methodPattern = /^[A-Z][A-Z0-9_-]{0,31}$/;
const credentialTestDefaultTimeoutMs = 8_000;

const validateProviderName = (value: string, label: string) => {
  const normalized = value.trim();
  if (!providerNamePattern.test(normalized)) {
    throw new Error(`${label} may contain letters, numbers, _, ., :, and - and must be 1-128 characters`);
  }
  return normalized;
};

const unique = <T>(values: T[]) => [...new Set(values)];

const normalizeMethods = (methods: string[] | undefined) => {
  if (!methods?.length) return undefined;
  return unique(methods.map((method) => method.trim().toUpperCase())).map((method) => {
    if (!methodPattern.test(method)) throw new Error(`invalid credential binding method "${method}"`);
    return method;
  });
};

const normalizePaths = (paths: string[] | undefined) => {
  if (!paths?.length) return undefined;
  return unique(paths.map((path) => path.trim())).map((path) => {
    if (!path.startsWith("/") || path.includes("\0")) throw new Error(`invalid credential binding path "${path}"`);
    return path;
  });
};

const normalizeMatch = (match: CredentialVaultMatch): CredentialVaultMatch => {
  if (!match.hosts.length) throw new Error("credential binding requires at least one host");
  return {
    schemes: unique(match.schemes?.length ? match.schemes : ["https"]),
    hosts: unique(match.hosts.map((host) => normalizeEgressTarget(host))),
    methods: normalizeMethods(match.methods),
    paths: normalizePaths(match.paths)
  };
};

const credentialReference = (value: string | undefined, credentialName: string, label: string) => {
  const name = value ? validateProviderName(value, label) : credentialName;
  if (name !== credentialName) {
    throw new Error(`this endpoint attaches one credential at a time; ${label} must reference ${credentialName}`);
  }
  return name;
};

const normalizeSubstitutions = (
  substitutions: CredentialVaultSubstitution[] | undefined,
  credentialName: string
) => substitutions?.map((substitution) => ({
  credential: credentialReference(substitution.credential, credentialName, "substitution credential"),
  placeholder: substitution.placeholder,
  in: unique(substitution.in)
}));

const normalizeAuth = (auth: CredentialVaultAuth, credentialName: string): CredentialVaultAuth => {
  if (auth.type === "bearer" || auth.type === "basic") {
    return {
      ...auth,
      credential: credentialReference(auth.credential, credentialName, `${auth.type} credential`),
      substitutions: normalizeSubstitutions(auth.substitutions, credentialName)
    };
  }
  if (auth.type === "apiKey") {
    const header = auth.name.trim();
    if (!headerNamePattern.test(header)) throw new Error(`invalid API key header name "${auth.name}"`);
    return {
      ...auth,
      name: header,
      credential: credentialReference(auth.credential, credentialName, "API key credential"),
      substitutions: normalizeSubstitutions(auth.substitutions, credentialName)
    };
  }
  if (auth.type === "customHeaders") {
    if (!auth.headers.length) throw new Error("customHeaders auth requires at least one header");
    return {
      ...auth,
      headers: auth.headers.map((header) => {
        const name = header.name.trim();
        if (!headerNamePattern.test(name)) throw new Error(`invalid custom header name "${header.name}"`);
        return {
          name,
          credential: credentialReference(header.credential, credentialName, "custom header credential")
        };
      }),
      substitutions: normalizeSubstitutions(auth.substitutions, credentialName)
    };
  }
  return {
    ...auth,
    substitutions: normalizeSubstitutions(auth.substitutions, credentialName)
  };
};

const providerMetadata = (vault: CredentialVaultProviderState) => ({
  revision: vault.revision,
  credentialCount: vault.credentials.length,
  bindingCount: vault.bindings.length
});

const shellQuote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;

const runtimeRef = (runtimeProvider: RuntimeProvider, sandbox: SandboxForCredentials): RuntimeSandboxRef => ({
  provider: runtimeProvider.kind,
  providerSandboxId: sandbox.opensandboxId ?? ""
});

const getSandboxForCredentials = async (input: { organizationId: string; sandboxId: string }, query: Query) => {
  const result = await query<SandboxForCredentials>(
    `SELECT id, opensandbox_id AS "opensandboxId", status, egress_policy AS "egressPolicy"
     FROM sandboxes WHERE id = $1 AND organization_id = $2`,
    [input.sandboxId, input.organizationId]
  );
  return result.rows[0] ?? null;
};

const credentialEgressInput = (current: EgressPolicyInput | null, hosts: string[]): EgressPolicyInput => {
  const policy = current ?? defaultEgressPolicyInput;
  if (policy.mode === "blocked") throw new Error("blocked outbound access cannot accept a network credential");
  return {
    ...policy,
    mode: policy.mode === "custom" ? "custom" : "restricted",
    allow: [...new Set([...(policy.allow ?? []), ...hosts])]
  };
};

const persistCredentialEgress = async (
  input: CredentialEgressActor,
  summary: EgressPolicySummary,
  providerStatus: Record<string, unknown>,
  dependencies: AttachSandboxCredentialDependencies,
  query: Query
) => {
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
      JSON.stringify(policyInputFromSummary(summary)),
      JSON.stringify(runtimeEgressPolicyFromSummary(summary)),
      JSON.stringify(providerStatus)
    ]
  );
  const metadata = { mode: summary.mode, hosts: summary.allow, reason: "credential_binding" };
  await dependencies.recordEvent(input.organizationId, input.sandboxId, "egress.updated", "outbound access updated for credential binding", metadata);
  await dependencies.recordAudit(input.organizationId, input.actorUserId, input.actorLabel, "sandbox.egress.credential_updated", "sandbox", input.sandboxId, metadata);
};

const ensureCredentialEgress = async (
  input: CredentialEgressActor,
  sandbox: SandboxForCredentials,
  hosts: string[],
  dependencies: AttachSandboxCredentialDependencies,
  query: Query
): Promise<{ kind: "ok" } | { kind: "egress_conflict"; message: string }> => {
  if (!sandbox.opensandboxId || !dependencies.runtimeProvider.setEgressPolicy) {
    return { kind: "egress_conflict", message: "runtime provider does not expose mutable egress required for credential attachment" };
  }
  let policy: EgressPolicyInput;
  try {
    policy = credentialEgressInput(sandbox.egressPolicy, hosts);
  } catch (error) {
    return { kind: "egress_conflict", message: error instanceof Error ? error.message : String(error) };
  }
  const validation = await validateEgressPolicyForOrganization({ organizationId: input.organizationId, policy }, query);
  if (validation.kind !== "ok") return { kind: "egress_conflict", message: `credential egress policy rejected: ${validation.kind}` };
  try {
    const provider = await dependencies.runtimeProvider.setEgressPolicy(
      runtimeRef(dependencies.runtimeProvider, sandbox),
      runtimeEgressPolicyFromSummary(validation.summary)
    );
    if (provider.credentialVaultReady !== true) {
      const mode = provider.enforcementMode ?? "unknown";
      return { kind: "egress_conflict", message: `runtime egress mode ${mode} is not safe for Credential Vault` };
    }
    const status = { state: "available", ...provider, checkedAt: new Date().toISOString() };
    await persistCredentialEgress(input, validation.summary, status, dependencies, query);
    return { kind: "ok" };
  } catch (error) {
    return { kind: "egress_conflict", message: redactText(error instanceof Error ? error.message : String(error)) };
  }
};

const getCredentialAttachment = async (
  input: { organizationId: string; sandboxId: string; attachmentId: string },
  query: Query
) => {
  const result = await query<SandboxCredentialAttachmentRow>(
    `${attachmentSelect}
     WHERE organization_id = $1 AND sandbox_id = $2 AND id = $3 AND detached_at IS NULL`,
    [input.organizationId, input.sandboxId, input.attachmentId]
  );
  return result.rows[0] ? mapAttachmentRow(result.rows[0]) : null;
};

const requireNonEmptySecret = (value: string) => {
  if (!value) throw new Error("credential value is required");
  return value;
};

const validateFakeEnv = (fakeEnv: Record<string, string> | undefined, secretValue: string) => {
  const env = fakeEnv ?? {};
  for (const [key, value] of Object.entries(env)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`invalid fake env key "${key}"`);
    if (value === secretValue) throw new Error(`fake env value for ${key} must not equal the real credential`);
  }
  return env;
};

export const prepareSandboxCredentialAttachment = (
  body: InlineEphemeralSandboxCredentialBody,
  idFactory: typeof makeId = makeId
): PrepareSandboxCredentialAttachmentResult => {
  try {
    const secretValue = requireNonEmptySecret(body.value);
    const fakeEnv = validateFakeEnv(body.fakeEnv, secretValue);
    const credentialName = validateProviderName(body.credentialName ?? idFactory("cred", 12), "credential name");
    const bindingName = validateProviderName(body.binding.name ?? idFactory("binding", 12), "binding name");
    const binding = {
      name: bindingName,
      match: normalizeMatch(body.binding.match),
      auth: normalizeAuth(body.binding.auth, credentialName)
    };
    return {
      kind: "ok",
      attachment: {
        secretValue,
        fakeEnv,
        sourceType: "inline_ephemeral",
        sourceRef: null,
        credentialName,
        bindingName,
        displayName: body.displayName?.trim() || bindingName,
        binding,
        sourceMetadata: {},
        expiresAt: null
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("credential value is required")) return { kind: "secret_required", message };
    return { kind: "invalid_binding", message };
  }
};

const sourceNameSuffix = (sourceRef: string) => sourceRef.replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 32) || "secret";

const resolvedCredentialNames = (
  body: ResolvableCredentialSourceBody,
  material: ResolvedCredentialSourceMaterial,
  presetCredentialName: string
) => {
  const suffix = sourceNameSuffix(material.sourceRef);
  return {
    credentialName: validateProviderName(body.credentialName ?? `${presetCredentialName}-${suffix}`, "credential name"),
    bindingName: validateProviderName(body.bindingName ?? `${material.binding.name}-${suffix}`, "binding name")
  };
};

const prepareResolvedCredentialMaterial = (
  body: ResolvableCredentialSourceBody,
  material: ResolvedCredentialSourceMaterial
): PrepareCredentialSourceAttachmentResult => {
  try {
    const names = resolvedCredentialNames(body, material, material.credentialName);
    const binding = {
      name: names.bindingName,
      match: normalizeMatch(material.binding.match),
      auth: normalizeAuth(material.binding.auth, names.credentialName)
    };
    return {
      kind: "ok",
      attachment: {
        secretValue: material.secretValue,
        fakeEnv: validateFakeEnv(material.fakeEnv, material.secretValue),
        sourceType: material.sourceType,
        sourceRef: material.sourceRef,
        credentialName: names.credentialName,
        bindingName: names.bindingName,
        displayName: body.displayName?.trim() || material.name,
        binding,
        sourceMetadata: material.sourceMetadata,
        expiresAt: material.expiresAt
      }
    };
  } catch (error) {
    return { kind: "invalid_binding", message: error instanceof Error ? error.message : String(error) };
  }
};

type AttachSandboxCredentialInput = {
  organizationId: string;
  sandboxId: string;
  actorUserId: string;
  actorLabel: string;
  body: AttachSandboxCredentialBody;
};

type CredentialEgressActor = Omit<AttachSandboxCredentialInput, "body">;

type AttachSandboxCredentialDependencies = {
  query?: Query;
  runtimeProvider: RuntimeProvider;
  recordEvent: SandboxEventRecorder;
  recordAudit: Audit;
  idFactory?: typeof makeId;
  decryptSecret?: DecryptWorkspaceCredentialSecret;
  externalSecretResolvers?: ExternalSecretResolverRegistry;
  dynamicCredentialIssuers?: DynamicCredentialIssuerRegistry;
};

export const prepareSandboxCredentialSourceAttachment = async (
  input: { organizationId: string; actorUserId: string; body: AttachSandboxCredentialBody },
  dependencies: CredentialSourceMaterialDependencies & { idFactory?: typeof makeId } = {}
): Promise<PrepareCredentialSourceAttachmentResult> => {
  if (isResolvableCredentialSourceBody(input.body)) {
    const resolved = await resolveCredentialSourceMaterial(
      { ...input, body: input.body },
      dependencies
    );
    return resolved.kind === "ok"
      ? prepareResolvedCredentialMaterial(input.body, resolved.material)
      : resolved;
  }
  return prepareSandboxCredentialAttachment(input.body, dependencies.idFactory ?? makeId);
};

type InlineTemplateCredentialSource = Extract<
  TemplateCredentialSlotMappingBody["source"],
  { sourceType?: "inline_ephemeral" }
>;

const inlineCredentialBodyFromSlot = (
  slot: TemplateCredentialSlot,
  source: InlineTemplateCredentialSource
): InlineEphemeralSandboxCredentialBody => ({
  sourceType: "inline_ephemeral",
  displayName: source.displayName ?? slot.label,
  credentialName: source.credentialName ?? slot.credentialName,
  value: source.value,
  fakeEnv: { ...slot.fakeEnv, ...(source.fakeEnv ?? {}) },
  binding: {
    name: source.bindingName ?? slot.binding.name,
    match: slot.binding.match,
    auth: slot.binding.auth
  }
});

const resolvedSlotCredentialBody = (
  slot: TemplateCredentialSlot,
  source: ResolvableCredentialSourceBody,
  material: ResolvedCredentialSourceMaterial
): InlineEphemeralSandboxCredentialBody => ({
  sourceType: "inline_ephemeral",
  displayName: source.displayName ?? material.name,
  credentialName: source.credentialName ?? slot.credentialName,
  value: material.secretValue,
  fakeEnv: slot.fakeEnv,
  binding: {
    name: source.bindingName ?? slot.binding.name,
    match: slot.binding.match,
    auth: slot.binding.auth
  }
});

const prepareResolvedSlotCredential = (
  slot: TemplateCredentialSlot,
  source: ResolvableCredentialSourceBody,
  material: ResolvedCredentialSourceMaterial,
  idFactory: typeof makeId
): PrepareCredentialSourceAttachmentResult => {
  if (material.providerPresetId !== slot.providerPresetId) {
    return {
      kind: "invalid_binding",
      message: `credential source preset ${material.providerPresetId} cannot satisfy template slot ${slot.id} (${slot.providerPresetId})`
    };
  }
  if (
    slot.providerPresetId === "custom"
    && !customCredentialProfilesShareScope(material.customProfile, slot.customProfile)
  ) {
    return {
      kind: "invalid_binding",
      message: `custom credential source scope cannot satisfy template slot ${slot.id}`
    };
  }
  const prepared = prepareSandboxCredentialAttachment(resolvedSlotCredentialBody(slot, source, material), idFactory);
  if (prepared.kind !== "ok") return prepared;
  return {
    kind: "ok",
    attachment: {
      ...prepared.attachment,
      sourceType: material.sourceType,
      sourceRef: material.sourceRef,
      displayName: source.displayName?.trim() || material.name,
      sourceMetadata: material.sourceMetadata,
      expiresAt: material.expiresAt
    }
  };
};

export const prepareTemplateCredentialSlotAttachment = async (
  input: { organizationId: string; actorUserId: string; slot: TemplateCredentialSlot; body: TemplateCredentialSlotMappingBody },
  dependencies: CredentialSourceMaterialDependencies & { idFactory?: typeof makeId } = {}
): Promise<PrepareCredentialSourceAttachmentResult> => {
  const idFactory = dependencies.idFactory ?? makeId;
  if (!isResolvableCredentialSourceBody(input.body.source)) {
    return prepareSandboxCredentialAttachment(inlineCredentialBodyFromSlot(input.slot, input.body.source), idFactory);
  }
  const resolved = await resolveCredentialSourceMaterial(
    { organizationId: input.organizationId, actorUserId: input.actorUserId, body: input.body.source },
    dependencies
  );
  if (resolved.kind !== "ok") return resolved;
  return prepareResolvedSlotCredential(input.slot, input.body.source, resolved.material, idFactory);
};

const firstConcreteHost = (hosts: string[]) => {
  const host = hosts.find((candidate) => !candidate.startsWith("*."));
  if (!host) throw new Error("credential test requires --target when every binding host is a wildcard");
  return host;
};

const firstConcretePath = (paths: string[] | undefined) => {
  const path = paths?.[0]?.trim() || "/";
  const wildcardIndex = path.indexOf("*");
  const concrete = wildcardIndex >= 0 ? path.slice(0, wildcardIndex) : path;
  return concrete.startsWith("/") ? concrete || "/" : "/";
};

const normalizeCredentialTestTarget = (attachment: SandboxCredentialAttachmentSummary, body: TestSandboxCredentialBody) => {
  const method = (body.method ?? attachment.match.methods?.[0] ?? "GET").trim().toUpperCase();
  if (!methodPattern.test(method)) throw new Error(`invalid credential test method "${method}"`);
  const scheme = attachment.match.schemes?.[0] ?? "https";
  const target = body.target?.trim() || `${scheme}://${firstConcreteHost(attachment.match.hosts)}${firstConcretePath(attachment.match.paths)}`;
  const url = /^https?:\/\//i.test(target) ? new URL(target) : new URL(`${scheme}://${target}`);
  return {
    method,
    target,
    normalizedTarget: normalizeEgressTarget(url.hostname),
    url: url.toString(),
    scheme: url.protocol.replace(":", "") as "http" | "https",
    path: url.pathname || "/"
  };
};

const hostMatches = (pattern: string, host: string) => {
  if (!pattern.startsWith("*.")) return pattern === host;
  const suffix = pattern.slice(1);
  return host.endsWith(suffix) && host !== pattern.slice(2);
};

const pathMatches = (pattern: string, path: string) => {
  const wildcardIndex = pattern.indexOf("*");
  if (wildcardIndex >= 0) return path.startsWith(pattern.slice(0, wildcardIndex));
  return path === pattern;
};

const testTargetMatchesBinding = (attachment: SandboxCredentialAttachmentSummary, target: ReturnType<typeof normalizeCredentialTestTarget>) => {
  const match = attachment.match;
  return (!match.schemes?.length || match.schemes.includes(target.scheme))
    && match.hosts.some((host) => hostMatches(host, target.normalizedTarget))
    && (!match.methods?.length || match.methods.includes(target.method))
    && (!match.paths?.length || match.paths.some((path) => pathMatches(path, target.path)));
};

const credentialTestScript = `
target="$HARAKIRI_CREDENTIAL_TEST_TARGET"
method="$HARAKIRI_CREDENTIAL_TEST_METHOD"
timeout="$HARAKIRI_CREDENTIAL_TEST_TIMEOUT"
if command -v curl >/dev/null 2>&1; then
  code="$(curl -sS -o /tmp/harakiri-credential-test-body -w '%{http_code}' --max-time "$timeout" -X "$method" "$target")"
  printf 'http_status=%s\\n' "$code"
elif command -v python3 >/dev/null 2>&1; then
  python3 - <<'PY'
import os, urllib.error, urllib.request
request = urllib.request.Request(os.environ["HARAKIRI_CREDENTIAL_TEST_TARGET"], method=os.environ["HARAKIRI_CREDENTIAL_TEST_METHOD"])
try:
    response = urllib.request.urlopen(request, timeout=int(os.environ["HARAKIRI_CREDENTIAL_TEST_TIMEOUT"]))
    print(f"http_status={response.status}")
except urllib.error.HTTPError as error:
    print(f"http_status={error.code}")
except Exception as error:
    print(str(error))
    raise
PY
else
  echo "no curl or python3 available" >&2
  exit 127
fi
`;

const parseHttpStatus = (stdout: string) => {
  const match = /http_status=(\d{3})/.exec(stdout);
  return match ? Number(match[1]) : null;
};

const makeCredentialTestResponse = (
  attachment: SandboxCredentialAttachmentSummary,
  target: ReturnType<typeof normalizeCredentialTestTarget>,
  status: TestSandboxCredentialResponse["status"],
  details: Partial<Pick<TestSandboxCredentialResponse, "httpStatus" | "stdout" | "stderr" | "durationMs">> = {}
): TestSandboxCredentialResponse => ({
  attachmentId: attachment.id,
  target: target.target,
  normalizedTarget: target.normalizedTarget,
  url: target.url,
  method: target.method,
  ok: status === "reachable",
  status,
  httpStatus: details.httpStatus ?? null,
  stdout: redactText(details.stdout ?? ""),
  stderr: redactText(details.stderr ?? ""),
  durationMs: details.durationMs ?? 0,
  checkedAt: new Date().toISOString()
});

const sourceMaterialFailureMessage = (result: CredentialSourceMaterialFailure) => {
  if (result.kind === "secret_not_found") return "credential secret reference is missing or deleted";
  if (result.kind === "secret_disabled") return "credential secret is disabled";
  if (result.kind === "secret_forbidden") return "credential secret could not be resolved by the control plane";
  if (result.kind === "external_reference_not_found") return "external secret reference is missing or deleted";
  if (result.kind === "external_reference_disabled") return "external secret reference is disabled";
  if (result.kind === "external_reference_forbidden") return "external secret reference could not be resolved by the control plane";
  if (result.kind === "dynamic_issuer_not_found") return "dynamic credential issuer is missing or deleted";
  if (result.kind === "dynamic_issuer_disabled") return "dynamic credential issuer is disabled";
  if (result.kind === "dynamic_issuer_forbidden") return "dynamic credential issuer could not be resolved by the control plane";
  if (result.kind === "secret_decryption_unavailable") {
    return `credential secret could not be decrypted: ${redactText(result.message)}`;
  }
  return redactText(result.message);
};

const markAttachmentRequiresReinjection = async (
  input: { organizationId: string; sandboxId: string; attachmentId: string; message: string },
  query: Query
) => {
  const result = await query<SandboxCredentialAttachmentRow>(
    `WITH updated AS (
       UPDATE sandbox_credential_attachments
       SET status = 'requires_reinjection',
           last_error = $4,
           updated_at = now()
       WHERE id = $1 AND organization_id = $2 AND sandbox_id = $3 AND detached_at IS NULL
       RETURNING ${attachmentProjection}
     )
     SELECT * FROM updated`,
    [input.attachmentId, input.organizationId, input.sandboxId, redactText(input.message)]
  );
  if (!result.rows[0]) throw new Error(`credential attachment ${input.attachmentId} was not found while updating rehydration state`);
  return mapAttachmentRow(result.rows[0]);
};

const markAttachmentRefreshFailed = async (
  input: { organizationId: string; sandboxId: string; attachmentId: string; message: string },
  query: Query
) => {
  const result = await query<SandboxCredentialAttachmentRow>(
    `WITH updated AS (
       UPDATE sandbox_credential_attachments
       SET status = CASE
             WHEN expires_at IS NOT NULL AND expires_at <= now() THEN 'requires_reinjection'
             ELSE status
           END,
           refresh_attempted_at = now(),
           last_error = $4,
           updated_at = now()
       WHERE id = $1 AND organization_id = $2 AND sandbox_id = $3 AND detached_at IS NULL
       RETURNING ${attachmentProjection}
     )
     SELECT * FROM updated`,
    [input.attachmentId, input.organizationId, input.sandboxId, redactText(input.message)]
  );
  if (!result.rows[0]) throw new Error(`credential attachment ${input.attachmentId} was not found while recording refresh failure`);
  return mapAttachmentRow(result.rows[0]);
};

const markAttachmentApplied = async (
  input: {
    organizationId: string;
    sandboxId: string;
    attachmentId: string;
    vault: CredentialVaultProviderState;
    sourceMetadata: Record<string, unknown>;
    expiresAt: string | null;
  },
  query: Query
) => {
  const result = await query<SandboxCredentialAttachmentRow>(
    `WITH updated AS (
       UPDATE sandbox_credential_attachments
       SET status = 'injected',
           provider_revision = $4,
           provider_state = 'present',
           provider_checked_at = now(),
           provider_metadata = $5::jsonb,
           source_metadata = $6::jsonb,
           expires_at = $7,
           refresh_attempted_at = now(),
           refreshed_at = now(),
           last_error = NULL,
           injected_at = now(),
           updated_at = now()
       WHERE id = $1 AND organization_id = $2 AND sandbox_id = $3 AND detached_at IS NULL
       RETURNING ${attachmentProjection}
     )
     SELECT * FROM updated`,
    [
      input.attachmentId,
      input.organizationId,
      input.sandboxId,
      input.vault.revision,
      JSON.stringify(providerMetadata(input.vault)),
      JSON.stringify(input.sourceMetadata),
      input.expiresAt
    ]
  );
  if (!result.rows[0]) throw new Error(`credential attachment ${input.attachmentId} was not found after rehydration`);
  return mapAttachmentRow(result.rows[0]);
};

const credentialTestCommand = (target: ReturnType<typeof normalizeCredentialTestTarget>, timeoutMs: number) => [
  `HARAKIRI_CREDENTIAL_TEST_TARGET=${shellQuote(target.url)}`,
  `HARAKIRI_CREDENTIAL_TEST_METHOD=${shellQuote(target.method)}`,
  `HARAKIRI_CREDENTIAL_TEST_TIMEOUT=${shellQuote(String(Math.ceil(timeoutMs / 1000)))}`,
  `sh -lc ${shellQuote(credentialTestScript)}`
].join(" ");

const recordCredentialTest = async (
  input: { organizationId: string; sandboxId: string; attachmentId: string; actorUserId: string; actorLabel: string },
  dependencies: { recordEvent: SandboxEventRecorder; recordAudit: Audit },
  response: TestSandboxCredentialResponse
) => {
  const metadata = {
    attachmentId: input.attachmentId,
    target: response.normalizedTarget,
    method: response.method,
    status: response.status,
    httpStatus: response.httpStatus,
    ok: response.ok
  };
  await dependencies.recordEvent(input.organizationId, input.sandboxId, "credential.tested", `credential test ${response.status} for ${response.normalizedTarget}`, metadata);
  await dependencies.recordAudit(input.organizationId, input.actorUserId, input.actorLabel, "sandbox.credential.tested", "sandbox", input.sandboxId, metadata);
};

const finishCredentialTest = async (
  input: TestSandboxCredentialInput,
  dependencies: TestSandboxCredentialDependencies,
  response: TestSandboxCredentialResponse,
  kind: Extract<TestSandboxCredentialResult["kind"], "ok" | "sandbox_not_running" | "not_injected" | "provider_unavailable"> = "ok"
): Promise<TestSandboxCredentialResult> => {
  await recordCredentialTest(input, dependencies, response);
  if (kind === "sandbox_not_running") return { kind: "sandbox_not_running", response };
  if (kind === "not_injected") return { kind: "not_injected", response };
  if (kind === "provider_unavailable") return { kind: "provider_unavailable", response };
  return { kind: "ok", response };
};

const runCredentialTestCommand = async (
  sandbox: SandboxForCredentials,
  attachment: SandboxCredentialAttachmentSummary,
  target: ReturnType<typeof normalizeCredentialTestTarget>,
  input: TestSandboxCredentialInput,
  dependencies: TestSandboxCredentialDependencies
) => {
  const started = Date.now();
  const timeoutMs = Math.min(Math.max(input.body.timeoutMs ?? credentialTestDefaultTimeoutMs, 1_000), 60_000);
  try {
    const result = await dependencies.runtimeProvider.run({
      ...runtimeRef(dependencies.runtimeProvider, sandbox),
      controlPlaneSandboxId: input.sandboxId,
      timeoutMs,
      command: credentialTestCommand(target, timeoutMs)
    });
    const httpStatus = parseHttpStatus(result.stdout);
    const reachable = result.exitCode === 0 && httpStatus !== null && httpStatus >= 200 && httpStatus < 400;
    return makeCredentialTestResponse(attachment, target, reachable ? "reachable" : "blocked_or_unreachable", {
      httpStatus,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs ?? Date.now() - started
    });
  } catch (error) {
    return makeCredentialTestResponse(attachment, target, "provider_unavailable", {
      stderr: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - started
    });
  }
};

export const listSandboxCredentials = async (
  input: { organizationId: string; sandboxId: string },
  query: Query = defaultQuery
): Promise<{ kind: "not_found" } | { kind: "ok"; attachments: SandboxCredentialAttachmentSummary[] }> => {
  const sandbox = await getSandboxForCredentials(input, query);
  if (!sandbox) return { kind: "not_found" };
  const result = await query<SandboxCredentialAttachmentRow>(
    `${attachmentSelect}
     WHERE organization_id = $1 AND sandbox_id = $2
     ORDER BY created_at DESC`,
    [input.organizationId, input.sandboxId]
  );
  return { kind: "ok", attachments: result.rows.map(mapAttachmentRow) };
};

const updateProviderInspection = async (
  input: { organizationId: string; sandboxId: string },
  state: SandboxCredentialAttachmentSummary["providerState"],
  attachmentIds: string[],
  vault: CredentialVaultProviderState | null,
  query: Query,
  message: string | null = null
) => {
  if (!attachmentIds.length) return;
  const missing = state === "missing";
  await query(
    `UPDATE sandbox_credential_attachments
     SET provider_state = $4,
         provider_checked_at = now(),
         provider_revision = COALESCE($5, provider_revision),
         provider_metadata = CASE WHEN $5 IS NULL THEN provider_metadata ELSE $6::jsonb END,
         status = CASE
           WHEN $7 THEN 'requires_reinjection'
           WHEN $4 = 'present' THEN 'injected'
           ELSE status
         END,
         last_error = CASE
           WHEN $7 THEN $8
           WHEN $4 = 'present' THEN NULL
           ELSE last_error
         END,
         updated_at = now()
     WHERE organization_id = $1 AND sandbox_id = $2
       AND id = ANY($3::text[]) AND detached_at IS NULL`,
    [
      input.organizationId,
      input.sandboxId,
      attachmentIds,
      state,
      vault?.revision ?? null,
      JSON.stringify(vault ? providerMetadata(vault) : {}),
      missing,
      message
    ]
  );
};

const presentAttachmentIds = (
  attachments: SandboxCredentialAttachmentSummary[],
  vault: CredentialVaultProviderState
) => {
  const credentialNames = new Set(vault.credentials.map(({ name }) => name));
  const bindingNames = new Set(vault.bindings.map(({ name }) => name));
  return new Set(
    attachments
      .filter(({ credentialName, bindingName }) => credentialNames.has(credentialName) && bindingNames.has(bindingName))
      .map(({ id }) => id)
  );
};

const selectAttachmentIds = (
  attachments: SandboxCredentialAttachmentSummary[],
  selected: Set<string>,
  include: boolean
) => attachments.filter(({ id }) => selected.has(id) === include).map(({ id }) => id);

const inspectProviderVault = async (
  sandbox: SandboxForCredentials,
  attachments: SandboxCredentialAttachmentSummary[],
  runtimeProvider: RuntimeProvider
) => {
  const vault = await runtimeProvider.getCredentialVault!(runtimeRef(runtimeProvider, sandbox));
  const present = vault ? presentAttachmentIds(attachments, vault) : new Set<string>();
  return {
    vault,
    presentIds: selectAttachmentIds(attachments, present, true),
    missingIds: selectAttachmentIds(attachments, present, false)
  };
};

export const inspectSandboxCredentials = async (
  input: { organizationId: string; sandboxId: string },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider }
): Promise<InspectSandboxCredentialsResult> => {
  const query = dependencies.query ?? defaultQuery;
  const sandbox = await getSandboxForCredentials(input, query);
  if (!sandbox) return { kind: "not_found" };
  if (!activeSandboxStates.has(sandbox.status)) return { kind: "sandbox_not_running", status: sandbox.status };
  if (!dependencies.runtimeProvider.getCredentialVault) {
    return { kind: "unsupported", message: "runtime provider does not expose sanitized Credential Vault state" };
  }
  const listed = await listSandboxCredentials(input, query);
  if (listed.kind !== "ok") return listed;
  const active = listed.attachments.filter((attachment) => !attachment.detachedAt);
  try {
    const inspection = await inspectProviderVault(sandbox, active, dependencies.runtimeProvider);
    await updateProviderInspection(input, "present", inspection.presentIds, inspection.vault, query);
    await updateProviderInspection(
      input,
      "missing",
      inspection.missingIds,
      inspection.vault,
      query,
      "credential is missing from runtime vault and requires reinjection"
    );
    const current = await listSandboxCredentials(input, query);
    return { kind: "ok", attachments: current.kind === "ok" ? current.attachments : [], vault: inspection.vault };
  } catch {
    const message = "runtime provider credential inspection failed";
    await updateProviderInspection(input, "unavailable", active.map((attachment) => attachment.id), null, query, message);
    const current = await listSandboxCredentials(input, query);
    return { kind: "provider_unavailable", message, attachments: current.kind === "ok" ? current.attachments : [] };
  }
};

export const markSandboxCredentialsRequireReinjection = async (
  input: { organizationId: string; sandboxId: string },
  query: Query = defaultQuery
): Promise<number> => {
  const result = await query<{ id: string }>(
    `WITH updated AS (
       UPDATE sandbox_credential_attachments
       SET status = 'requires_reinjection',
           last_error = $3,
           updated_at = now()
       WHERE organization_id = $1
         AND sandbox_id = $2
         AND detached_at IS NULL
         AND status = 'injected'
       RETURNING id
     )
     SELECT id FROM updated`,
    [
      input.organizationId,
      input.sandboxId,
      "runtime vault state was reset when the sandbox resumed; reattach or rehydrate this credential"
    ]
  );
  return result.rows.length;
};

const listCredentialsNeedingRehydration = async (
  input: { organizationId: string; sandboxId: string },
  query: Query
) => {
  const result = await query<SandboxCredentialAttachmentRow>(
    `${attachmentSelect}
     WHERE organization_id = $1
       AND sandbox_id = $2
       AND detached_at IS NULL
       AND status = 'requires_reinjection'
     ORDER BY created_at ASC`,
    [input.organizationId, input.sandboxId]
  );
  return result.rows.map(mapAttachmentRow);
};

type CredentialRehydrateOutcome = {
  state: "rehydrated" | "skipped" | "failed";
  attachment: SandboxCredentialAttachmentSummary;
  vault: CredentialVaultProviderState | null;
};

const recordCredentialRehydration = async (
  input: { organizationId: string; sandboxId: string; actorUserId: string | null; actorLabel: string },
  dependencies: { recordEvent: SandboxEventRecorder; recordAudit: Audit },
  outcome: CredentialRehydrateOutcome
) => {
  if (outcome.state === "skipped") return;
  const metadata = {
    attachmentId: outcome.attachment.id,
    bindingName: outcome.attachment.bindingName,
    sourceType: outcome.attachment.sourceType,
    sourceRef: outcome.attachment.sourceRef,
    status: outcome.attachment.status
  };
  const eventType = outcome.state === "rehydrated" ? "credential.rehydrated" : "credential.rehydrate_failed";
  const action = outcome.state === "rehydrated" ? "sandbox.credential.rehydrated" : "sandbox.credential.rehydrate_failed";
  await dependencies.recordEvent(input.organizationId, input.sandboxId, eventType, `credential ${outcome.attachment.displayName} ${outcome.state}`, metadata);
  await dependencies.recordAudit(input.organizationId, input.actorUserId, input.actorLabel, action, "sandbox", input.sandboxId, metadata);
};

const resolveAttachmentMaterial = (
  input: { organizationId: string },
  attachment: SandboxCredentialAttachmentSummary,
  dependencies: Pick<
    RehydrateSandboxCredentialsDependencies,
    "decryptSecret" | "externalSecretResolvers" | "dynamicCredentialIssuers"
  >,
  query: Query
): Promise<CredentialSourceMaterialResult> => {
  if (!attachment.sourceRef) {
    return Promise.resolve({ kind: "invalid_binding", message: "stored credential attachment is missing source reference" });
  }
  return resolveCredentialSourceMaterialForSystem(
    {
      organizationId: input.organizationId,
      sourceType: attachment.sourceType,
      sourceRef: attachment.sourceRef
    },
    { ...dependencies, query }
  );
};

const applyResolvedCredential = (
  sandbox: SandboxForCredentials,
  attachment: SandboxCredentialAttachmentSummary,
  material: ResolvedCredentialSourceMaterial,
  runtimeProvider: RuntimeProvider
) => {
  const applyCredentialVault = runtimeProvider.applyCredentialVault;
  if (!applyCredentialVault) throw new Error("runtime provider does not expose Credential Vault injection");
  const binding = {
    name: attachment.bindingName,
    match: normalizeMatch(attachment.match),
    auth: normalizeAuth(attachment.auth, attachment.credentialName)
  };
  return applyCredentialVault({
    ...runtimeRef(runtimeProvider, sandbox),
    credentials: [{ name: attachment.credentialName, value: material.secretValue }],
    bindings: [binding]
  });
};

const rehydrateResolvableCredential = async (
  input: { organizationId: string; sandboxId: string; actorUserId: string | null; actorLabel: string },
  sandbox: SandboxForCredentials,
  attachment: SandboxCredentialAttachmentSummary,
  dependencies: RehydrateSandboxCredentialsDependencies,
  query: Query
): Promise<CredentialRehydrateOutcome> => {
  const resolved = await resolveAttachmentMaterial(input, attachment, dependencies, query);
  if (resolved.kind !== "ok") {
    return failCredentialRehydration(input, attachment, sourceMaterialFailureMessage(resolved), dependencies, query);
  }
  const attachedPreset = attachment.sourceMetadata.providerPresetId;
  if (
    typeof attachedPreset === "string"
    && attachedPreset !== resolved.material.providerPresetId
  ) {
    return failCredentialRehydration(
      input,
      attachment,
      `credential source profile changed from ${attachedPreset} to ${resolved.material.providerPresetId}`,
      dependencies,
      query
    );
  }
  try {
    const vault = await applyResolvedCredential(sandbox, attachment, resolved.material, dependencies.runtimeProvider);
    const updated = await markAttachmentApplied({
      ...input,
      attachmentId: attachment.id,
      vault,
      sourceMetadata: resolved.material.sourceMetadata,
      expiresAt: resolved.material.expiresAt
    }, query);
    const outcome = { state: "rehydrated" as const, attachment: updated, vault };
    await recordCredentialRehydration(input, dependencies, outcome);
    return outcome;
  } catch (error) {
    return failCredentialRehydration(input, attachment, error instanceof Error ? error.message : String(error), dependencies, query);
  }
};

const failCredentialRehydration = async (
  input: { organizationId: string; sandboxId: string; actorUserId: string | null; actorLabel: string },
  attachment: SandboxCredentialAttachmentSummary,
  message: string,
  dependencies: Pick<RehydrateSandboxCredentialsDependencies, "recordEvent" | "recordAudit">,
  query: Query
): Promise<CredentialRehydrateOutcome> => {
  const updated = await markAttachmentRequiresReinjection({ ...input, attachmentId: attachment.id, message }, query);
  const outcome = { state: "failed" as const, attachment: updated, vault: null };
  await recordCredentialRehydration(input, dependencies, outcome);
  return outcome;
};

const rehydrateCredentialAttachment = async (
  input: { organizationId: string; sandboxId: string; actorUserId: string | null; actorLabel: string },
  sandbox: SandboxForCredentials,
  attachment: SandboxCredentialAttachmentSummary,
  dependencies: RehydrateSandboxCredentialsDependencies,
  query: Query
): Promise<CredentialRehydrateOutcome> => {
  if (
    attachment.sourceType === "harakiri_encrypted"
    || attachment.sourceType === "external_ref"
    || attachment.sourceType === "dynamic"
  ) {
    return rehydrateResolvableCredential(input, sandbox, attachment, dependencies, query);
  }
  const message = `credential source type ${attachment.sourceType} cannot be rehydrated by this release`;
  const updated = await markAttachmentRequiresReinjection({ ...input, attachmentId: attachment.id, message }, query);
  return { state: "skipped", attachment: updated, vault: null };
};

type RehydrateSandboxCredentialsDependencies = {
  query?: Query;
  runtimeProvider: RuntimeProvider;
  recordEvent: SandboxEventRecorder;
  recordAudit: Audit;
  decryptSecret?: DecryptWorkspaceCredentialSecret;
  externalSecretResolvers?: ExternalSecretResolverRegistry;
  dynamicCredentialIssuers?: DynamicCredentialIssuerRegistry;
};

export const rehydrateSandboxCredentials = async (
  input: { organizationId: string; sandboxId: string; actorUserId: string | null; actorLabel: string },
  dependencies: RehydrateSandboxCredentialsDependencies
): Promise<RehydrateSandboxCredentialsResult> => {
  const query = dependencies.query ?? defaultQuery;
  const sandbox = await getSandboxForCredentials(input, query);
  if (!sandbox) return { kind: "not_found" };
  if (!activeSandboxStates.has(sandbox.status)) return { kind: "sandbox_not_running", status: sandbox.status };
  if (!dependencies.runtimeProvider.applyCredentialVault) {
    return { kind: "unsupported", message: "runtime provider does not expose Credential Vault injection" };
  }
  const staleAttachments = await listCredentialsNeedingRehydration(input, query);
  const outcomes: CredentialRehydrateOutcome[] = [];
  let lastVault: CredentialVaultProviderState | null = null;
  for (const attachment of staleAttachments) {
    const outcome = await rehydrateCredentialAttachment(input, sandbox, attachment, dependencies, query);
    outcomes.push(outcome);
    if (outcome.vault) lastVault = outcome.vault;
  }
  return {
    kind: "ok",
    attachments: outcomes.map((outcome) => outcome.attachment),
    vault: lastVault,
    rehydrated: outcomes.filter((outcome) => outcome.state === "rehydrated").length,
    skipped: outcomes.filter((outcome) => outcome.state === "skipped").length,
    failed: outcomes.filter((outcome) => outcome.state === "failed").length
  };
};

type RefreshSandboxCredentialInput = {
  organizationId: string;
  sandboxId: string;
  attachmentId: string;
  actorUserId: string | null;
  actorLabel: string;
};

type RefreshSandboxCredentialDependencies = RehydrateSandboxCredentialsDependencies;

const recordCredentialRefresh = async (
  input: RefreshSandboxCredentialInput,
  dependencies: Pick<RefreshSandboxCredentialDependencies, "recordEvent" | "recordAudit">,
  attachment: SandboxCredentialAttachmentSummary,
  outcome: "refreshed" | "failed"
) => {
  const metadata = {
    attachmentId: attachment.id,
    issuerId: attachment.sourceRef,
    expiresAt: attachment.expiresAt,
    sourceMetadata: attachment.sourceMetadata,
    status: attachment.status
  };
  const eventType = outcome === "refreshed" ? "credential.refreshed" : "credential.refresh_failed";
  const action = outcome === "refreshed" ? "sandbox.credential.refreshed" : "sandbox.credential.refresh_failed";
  await dependencies.recordEvent(
    input.organizationId,
    input.sandboxId,
    eventType,
    `dynamic credential ${attachment.displayName} ${outcome}`,
    metadata
  );
  await dependencies.recordAudit(
    input.organizationId,
    input.actorUserId,
    input.actorLabel,
    action,
    "sandbox",
    input.sandboxId,
    metadata
  );
};

const failCredentialRefresh = async (
  input: RefreshSandboxCredentialInput,
  attachment: SandboxCredentialAttachmentSummary,
  message: string,
  dependencies: Pick<RefreshSandboxCredentialDependencies, "recordEvent" | "recordAudit">,
  query: Query
) => {
  const updated = await markAttachmentRefreshFailed({ ...input, message }, query);
  await recordCredentialRefresh(input, dependencies, updated, "failed");
  return updated;
};

export const refreshSandboxCredential = async (
  input: RefreshSandboxCredentialInput,
  dependencies: RefreshSandboxCredentialDependencies
): Promise<RefreshSandboxCredentialResult> => {
  const query = dependencies.query ?? defaultQuery;
  const sandbox = await getSandboxForCredentials(input, query);
  if (!sandbox) return { kind: "not_found" };
  if (!activeSandboxStates.has(sandbox.status)) return { kind: "sandbox_not_running", status: sandbox.status };
  if (!dependencies.runtimeProvider.applyCredentialVault) {
    return { kind: "unsupported", message: "runtime provider does not expose Credential Vault injection" };
  }
  const attachment = await getCredentialAttachment(input, query);
  if (!attachment) return { kind: "attachment_not_found" };
  if (attachment.sourceType !== "dynamic") {
    return { kind: "not_refreshable", sourceType: attachment.sourceType };
  }

  const resolved = await resolveAttachmentMaterial(input, attachment, dependencies, query);
  if (resolved.kind !== "ok") {
    const message = sourceMaterialFailureMessage(resolved);
    const updated = await failCredentialRefresh(input, attachment, message, dependencies, query);
    return { kind: "source_unavailable", sourceKind: resolved.kind, message, attachment: updated };
  }

  try {
    const vault = await applyResolvedCredential(sandbox, attachment, resolved.material, dependencies.runtimeProvider);
    const updated = await markAttachmentApplied({
      ...input,
      vault,
      sourceMetadata: resolved.material.sourceMetadata,
      expiresAt: resolved.material.expiresAt
    }, query);
    await recordCredentialRefresh(input, dependencies, updated, "refreshed");
    return { kind: "ok", attachment: updated, vault };
  } catch (error) {
    const message = redactText(error instanceof Error ? error.message : String(error));
    const updated = await failCredentialRefresh(input, attachment, message, dependencies, query);
    return { kind: "provider_unavailable", message, attachment: updated };
  }
};

type AttachPreparedCredentialInput = CredentialEgressActor & {
  prepared: PreparedSandboxCredentialAttachment;
};

const findAttachmentConflict = async (
  sandboxId: string,
  prepared: PreparedSandboxCredentialAttachment,
  query: Query
) => {
  const existing = await query<{ credentialName: string; bindingName: string }>(
    `SELECT id,
            credential_name AS "credentialName",
            binding_name AS "bindingName"
     FROM sandbox_credential_attachments
     WHERE sandbox_id = $1
       AND detached_at IS NULL
       AND (binding_name = $2 OR credential_name = $3)
     ORDER BY CASE WHEN binding_name = $2 THEN 0 ELSE 1 END
     LIMIT 1`,
    [sandboxId, prepared.bindingName, prepared.credentialName]
  );
  const duplicate = existing.rows[0];
  if (!duplicate) return null;
  return duplicate.bindingName === prepared.bindingName
    ? `binding ${prepared.bindingName} is already attached to this sandbox`
    : `credential ${prepared.credentialName} is already attached to this sandbox`;
};

const insertPendingAttachment = async (
  input: AttachPreparedCredentialInput,
  attachmentId: string,
  provider: string,
  query: Query
) => {
  const { prepared } = input;
  await query(
    `INSERT INTO sandbox_credential_attachments
     (id, organization_id, sandbox_id, provider, source_type, source_ref, credential_name, display_name,
      binding_name, match, auth, fake_env, source_metadata, expires_at, status,
      created_by_user_id, created_by_label)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb,
             $13::jsonb, $14, 'pending', $15, $16)`,
    [
      attachmentId,
      input.organizationId,
      input.sandboxId,
      provider,
      prepared.sourceType,
      prepared.sourceRef,
      prepared.credentialName,
      prepared.displayName,
      prepared.bindingName,
      JSON.stringify(prepared.binding.match),
      JSON.stringify(prepared.binding.auth),
      JSON.stringify(prepared.fakeEnv),
      JSON.stringify(prepared.sourceMetadata),
      prepared.expiresAt,
      input.actorUserId,
      input.actorLabel
    ]
  );
};

const failedAttachmentFallback = (
  input: AttachPreparedCredentialInput,
  attachmentId: string,
  provider: string,
  message: string
): SandboxCredentialAttachmentSummary => {
  const now = new Date().toISOString();
  const { prepared } = input;
  return {
    id: attachmentId,
    sandboxId: input.sandboxId,
    displayName: prepared.displayName,
    sourceType: prepared.sourceType,
    sourceRef: prepared.sourceRef,
    credentialName: prepared.credentialName,
    bindingName: prepared.bindingName,
    match: prepared.binding.match,
    auth: prepared.binding.auth,
    fakeEnv: prepared.fakeEnv,
    status: "failed",
    provider,
    providerRevision: null,
    providerState: "unavailable",
    providerCheckedAt: now,
    providerMetadata: {},
    sourceMetadata: prepared.sourceMetadata,
    expiresAt: prepared.expiresAt,
    refreshState: prepared.sourceType === "dynamic" ? "current" : "not_applicable",
    refreshAttemptedAt: null,
    refreshedAt: null,
    lastError: message,
    injectedAt: null,
    detachedAt: null,
    createdByUserId: input.actorUserId,
    createdByLabel: input.actorLabel,
    createdAt: now,
    updatedAt: now
  };
};

const markCredentialAttachFailed = async (
  input: AttachPreparedCredentialInput,
  attachmentId: string,
  provider: string,
  message: string,
  query: Query
) => {
  const failed = await query<SandboxCredentialAttachmentRow>(
    `WITH updated AS (
       UPDATE sandbox_credential_attachments
       SET status = 'failed',
           provider_state = 'unavailable',
           provider_checked_at = now(),
           last_error = $2,
           updated_at = now()
       WHERE id = $1
       RETURNING ${attachmentProjection}
     )
     SELECT * FROM updated`,
    [attachmentId, message]
  );
  return failed.rows[0]
    ? mapAttachmentRow(failed.rows[0])
    : failedAttachmentFallback(input, attachmentId, provider, message);
};

const applyPreparedCredential = (
  sandbox: SandboxForCredentials,
  prepared: PreparedSandboxCredentialAttachment,
  runtimeProvider: RuntimeProvider
) => runtimeProvider.applyCredentialVault!({
  ...runtimeRef(runtimeProvider, sandbox),
  credentials: [{ name: prepared.credentialName, value: prepared.secretValue }],
  bindings: [prepared.binding]
});

const markCredentialAttached = async (
  attachmentId: string,
  prepared: PreparedSandboxCredentialAttachment,
  vault: CredentialVaultProviderState,
  query: Query
) => {
  const updated = await query<SandboxCredentialAttachmentRow>(
    `WITH updated AS (
       UPDATE sandbox_credential_attachments
       SET status = 'injected',
           provider_revision = $2,
           provider_state = 'present',
           provider_checked_at = now(),
           provider_metadata = $3::jsonb,
           source_metadata = $4::jsonb,
           expires_at = $5,
           injected_at = now(),
           updated_at = now()
       WHERE id = $1
       RETURNING ${attachmentProjection}
     )
     SELECT * FROM updated`,
    [
      attachmentId,
      vault.revision,
      JSON.stringify(providerMetadata(vault)),
      JSON.stringify(prepared.sourceMetadata),
      prepared.expiresAt
    ]
  );
  return mapAttachmentRow(updated.rows[0]);
};

const recordCredentialAttached = async (
  input: AttachPreparedCredentialInput,
  attachmentId: string,
  dependencies: Pick<AttachSandboxCredentialDependencies, "recordEvent" | "recordAudit">
) => {
  const { prepared } = input;
  await dependencies.recordEvent(input.organizationId, input.sandboxId, "credential.attached", `credential ${prepared.displayName} attached`, {
    attachmentId,
    bindingName: prepared.bindingName,
    hosts: prepared.binding.match.hosts,
    sourceType: prepared.sourceType
  });
  await dependencies.recordAudit(input.organizationId, input.actorUserId, input.actorLabel, "sandbox.credential.attached", "sandbox", input.sandboxId, {
    attachmentId,
    bindingName: prepared.bindingName,
    sourceType: prepared.sourceType,
    sourceRef: prepared.sourceRef,
    expiresAt: prepared.expiresAt,
    sourceMetadata: prepared.sourceMetadata
  });
};

export const attachPreparedSandboxCredential = async (
  input: AttachPreparedCredentialInput,
  dependencies: AttachSandboxCredentialDependencies
): Promise<AttachPreparedSandboxCredentialResult> => {
  const query = dependencies.query ?? defaultQuery;
  const sandbox = await getSandboxForCredentials(input, query);
  if (!sandbox) return { kind: "not_found" };
  if (!activeSandboxStates.has(sandbox.status)) return { kind: "sandbox_not_running", status: sandbox.status };
  if (!dependencies.runtimeProvider.applyCredentialVault) {
    return { kind: "unsupported", message: "runtime provider does not expose Credential Vault injection" };
  }

  const conflict = await findAttachmentConflict(input.sandboxId, input.prepared, query);
  if (conflict) return { kind: "invalid_binding", message: conflict };
  const egress = await ensureCredentialEgress(input, sandbox, input.prepared.binding.match.hosts, dependencies, query);
  if (egress.kind !== "ok") return egress;

  const attachmentId = (dependencies.idFactory ?? makeId)("sca", 12);
  await insertPendingAttachment(input, attachmentId, dependencies.runtimeProvider.kind, query);

  let vault: CredentialVaultProviderState;
  try {
    vault = await applyPreparedCredential(sandbox, input.prepared, dependencies.runtimeProvider);
  } catch (error) {
    const message = redactText(error instanceof Error ? error.message : String(error));
    const attachment = await markCredentialAttachFailed(
      input,
      attachmentId,
      dependencies.runtimeProvider.kind,
      message,
      query
    );
    return { kind: "provider_unavailable", message, attachment };
  }

  const attachment = await markCredentialAttached(attachmentId, input.prepared, vault, query);
  await recordCredentialAttached(input, attachmentId, dependencies);
  return { kind: "ok", attachment, vault };
};

export const attachSandboxCredential = async (
  input: AttachSandboxCredentialInput,
  dependencies: AttachSandboxCredentialDependencies
): Promise<AttachSandboxCredentialResult> => {
  const query = dependencies.query ?? defaultQuery;
  const sandbox = await getSandboxForCredentials(input, query);
  if (!sandbox) return { kind: "not_found" };
  if (!activeSandboxStates.has(sandbox.status)) return { kind: "sandbox_not_running", status: sandbox.status };
  if (!dependencies.runtimeProvider.applyCredentialVault) {
    return { kind: "unsupported", message: "runtime provider does not expose Credential Vault injection" };
  }
  const prepared = await prepareSandboxCredentialSourceAttachment(
    { organizationId: input.organizationId, actorUserId: input.actorUserId, body: input.body },
    {
      query,
      idFactory: dependencies.idFactory,
      decryptSecret: dependencies.decryptSecret,
      externalSecretResolvers: dependencies.externalSecretResolvers,
      dynamicCredentialIssuers: dependencies.dynamicCredentialIssuers
    }
  );
  if (prepared.kind !== "ok") return prepared;
  return attachPreparedSandboxCredential({ ...input, prepared: prepared.attachment }, { ...dependencies, query });
};

export const detachSandboxCredential = async (
  input: {
    organizationId: string;
    sandboxId: string;
    attachmentId: string;
    actorUserId: string;
    actorLabel: string;
    reason?: "source_disabled" | "source_deleted";
  },
  dependencies: { query?: Query; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder; recordAudit: Audit }
): Promise<DetachSandboxCredentialResult> => {
  const query = dependencies.query ?? defaultQuery;
  const sandbox = await getSandboxForCredentials(input, query);
  if (!sandbox) return { kind: "not_found" };
  if (!activeSandboxStates.has(sandbox.status)) return { kind: "sandbox_not_running", status: sandbox.status };
  if (!dependencies.runtimeProvider.deleteCredentialVaultEntries) {
    return { kind: "unsupported", message: "runtime provider does not expose Credential Vault mutation" };
  }
  const current = await query<SandboxCredentialAttachmentRow>(
    `${attachmentSelect}
     WHERE organization_id = $1 AND sandbox_id = $2 AND id = $3 AND detached_at IS NULL`,
    [input.organizationId, input.sandboxId, input.attachmentId]
  );
  const row = current.rows[0];
  if (!row) return { kind: "attachment_not_found" };
  let vault: CredentialVaultProviderState | null;
  try {
    vault = await dependencies.runtimeProvider.deleteCredentialVaultEntries({
      ...runtimeRef(dependencies.runtimeProvider, sandbox),
      credentialNames: [row.credentialName],
      bindingNames: [row.bindingName]
    });
  } catch (error) {
    return { kind: "provider_unavailable", message: redactText(error instanceof Error ? error.message : String(error)) };
  }

  const updated = await query<SandboxCredentialAttachmentRow>(
    `WITH updated AS (
       UPDATE sandbox_credential_attachments
       SET status = 'detached',
           provider_state = 'missing',
           provider_checked_at = now(),
           provider_revision = $2,
           provider_metadata = $3::jsonb,
           detached_at = now(),
           last_error = NULL,
           updated_at = now()
       WHERE id = $1
       RETURNING ${attachmentProjection}
     )
     SELECT * FROM updated`,
    [input.attachmentId, vault?.revision ?? row.providerRevision, JSON.stringify(vault ? providerMetadata(vault) : row.providerMetadata)]
  );
  const attachment = mapAttachmentRow(updated.rows[0]);
  await dependencies.recordEvent(input.organizationId, input.sandboxId, "credential.detached", `credential ${row.displayName} detached`, {
    attachmentId: input.attachmentId,
    bindingName: row.bindingName,
    ...(input.reason ? { reason: input.reason } : {})
  });
  await dependencies.recordAudit(input.organizationId, input.actorUserId, input.actorLabel, "sandbox.credential.detached", "sandbox", input.sandboxId, {
    attachmentId: input.attachmentId,
    bindingName: row.bindingName,
    ...(input.reason ? { reason: input.reason } : {})
  });
  return { kind: "ok", attachment, vault };
};

export const testSandboxCredential = async (
  input: TestSandboxCredentialInput,
  dependencies: TestSandboxCredentialDependencies
): Promise<TestSandboxCredentialResult> => {
  const query = dependencies.query ?? defaultQuery;
  const sandbox = await getSandboxForCredentials(input, query);
  if (!sandbox) return { kind: "not_found" };

  const attachment = await getCredentialAttachment(input, query);
  if (!attachment) return { kind: "attachment_not_found" };

  let target;
  try {
    target = normalizeCredentialTestTarget(attachment, input.body);
  } catch (error) {
    return { kind: "invalid_binding", message: error instanceof Error ? error.message : String(error) };
  }

  if (!testTargetMatchesBinding(attachment, target)) {
    return finishCredentialTest(input, dependencies, makeCredentialTestResponse(attachment, target, "binding_mismatch"));
  }
  if (!activeSandboxStates.has(sandbox.status)) {
    const response = makeCredentialTestResponse(attachment, target, "sandbox_not_running", { stderr: `sandbox is ${sandbox.status}` });
    return finishCredentialTest(input, dependencies, response, "sandbox_not_running");
  }
  if (attachment.status !== "injected") {
    const response = makeCredentialTestResponse(attachment, target, "not_injected", { stderr: `credential is ${attachment.status}` });
    return finishCredentialTest(input, dependencies, response, "not_injected");
  }

  const response = await runCredentialTestCommand(sandbox, attachment, target, input, dependencies);
  return finishCredentialTest(input, dependencies, response, response.status === "provider_unavailable" ? "provider_unavailable" : "ok");
};
