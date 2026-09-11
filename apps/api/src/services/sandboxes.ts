import { config } from "../config.js";
import { makeId } from "../crypto.js";
import { query as defaultQuery, transaction as defaultTransaction, type Transaction } from "../db.js";
import {
  compileEgressPolicy,
  defaultEgressPolicyInput,
  sandboxRouteAccessModes,
  sandboxRouteStates,
  sandboxStatuses,
  type AttachSandboxCredentialBody,
  type EgressPolicyInput,
  type SandboxCredentialAttachmentSummary,
  type SandboxRouteAccessMode,
  type SandboxRouteState,
  type SandboxRuntimeMetadata,
  type SandboxRuntimeRouteMetadata,
  type SandboxOperationSummary,
  type SandboxSourceInput,
  type SandboxSourceProvenance,
  type SandboxStatus,
  type TemplateCredentialSlot,
  type TemplateCredentialSlotMappingBody,
  type SandboxSummary as SharedSandboxSummary
} from "@harakiri/shared";
import type { RuntimeProvider, RuntimeSandboxRef } from "../providers/runtime/provider.js";
import type { ExternalSecretResolverRegistry } from "../providers/secrets/provider.js";
import type { DynamicCredentialIssuerRegistry } from "../providers/credentials/provider.js";
import { hasSecretBoxKey } from "../secret-box.js";
import {
  ensureTemplateImageDigest,
  resolveTemplate,
  templateCanCreateSandbox,
  type RuntimeTemplate
} from "../templates.js";
import type { Query } from "./query.js";
import {
  claimSandboxOperationById,
  completeSandboxOperation,
  enqueueSandboxOperation,
  failSandboxOperation,
  sandboxOperationSelect,
  storeSandboxOperationSecret,
  type SandboxOperation
} from "./sandbox-operations.js";
import { policyInputFromSummary, runtimeEgressPolicyFromSummary, validateEgressPolicyForOrganization } from "./egress-policy.js";
import { getSandboxSnapshotForRestore } from "./sandbox-snapshots.js";
import { getRuntimeCapabilities, type Audit, type SandboxEventRecorder } from "./sandbox-runtime.js";
import {
  attachPreparedSandboxCredential,
  prepareSandboxCredentialSourceAttachment,
  prepareTemplateCredentialSlotAttachment,
  type PreparedSandboxCredentialAttachment
} from "./credential-vault.js";
import type { DecryptWorkspaceCredentialSecret } from "./workspace-credential-secrets.js";
import { redactText } from "../redaction.js";
import { prepareRuntimeWorkspace, validateWorkspaceAttachment, WorkspaceError } from "./persistent-workspaces.js";
import { renewSandboxLease, SandboxLeaseError } from "./sandbox-lease.js";
import { createIntentFingerprint, findAcceptedCreate, lockCreateAdmission } from "./sandbox-admission.js";
import { reserveSandboxCapacity, releaseSandboxCapacity } from "./organization-capacity.js";
import { beginRuntimeEffect, finishRuntimeEffect, type RuntimeEffect } from "./sandbox-runtime-effects.js";
import { provisionSandboxRuntime, completeSandboxProvision, type ProvisionedRuntime } from "./sandbox-provision.js";
import { requestSandboxTermination, executeRuntimeDeletion } from "./sandbox-termination.js";
export type { Audit, SandboxEventRecorder } from "./sandbox-runtime.js";

export type SandboxSummary = SharedSandboxSummary;

type SandboxRow = Omit<SharedSandboxSummary, "status" | "expiresAt" | "createdAt" | "runtimeMetadata" | "source"> & {
  status: string;
  expiresAt?: Date | string | null;
  createdAt?: Date | string | null;
  source?: unknown;
  runtimeWorkdir?: string | null;
  runtimeDefaultPorts?: number[] | null;
  runtimeFamily?: string | null;
  runtimeExposedPorts?: unknown;
};

type SandboxReadDependencies = Query | {
  query?: Query;
  runtimeProvider?: RuntimeProvider;
};

export type SandboxListFilters = {
  status?: string;
  q?: string;
  template?: string;
  templateVersionId?: string;
  limit?: string | number;
};

export type CreateSandboxInput = {
  workspaceId?: string;
  organizationId: string;
  userId: string | null;
  apiKeyId?: string;
  actorLabel: string;
  templateRef?: string;
  snapshotId?: string;
  name?: string;
  ttlSeconds: number;
  env: Record<string, string>;
  idempotencyKey?: string | null;
  wait?: boolean;
  waitTimeoutMs?: number;
  egress?: EgressPolicyInput | null;
  source?: SandboxSourceInput | null;
  credentials?: AttachSandboxCredentialBody[];
  credentialMappings?: TemplateCredentialSlotMappingBody[];
};

export const sandboxSelect = `
  SELECT s.id, s.opensandbox_id AS "opensandboxId", s.name, s.template_id AS template,
         s.workspace_id AS "workspaceId",
         COALESCE(
           (SELECT CASE WHEN e.uncertain_at IS NOT NULL THEN 'uncertain' ELSE 'releasing' END FROM sandbox_runtime_effects e WHERE e.sandbox_id=s.id AND e.kind='delete' AND e.settled_at IS NULL),
           (SELECT r.phase FROM sandbox_capacity_reservations r WHERE r.sandbox_id=s.id ORDER BY r.generation DESC LIMIT 1)
         ) AS "capacityPhase",
         s.status, s.cpu_pct AS cpu, s.memory_mb AS mem,
         COALESCE(to_char(now() - s.started_at, 'HH24"h "MI"m"'), '-') AS started,
         s.owner_label AS owner, s.cost_usd::float AS cost, s.ttl_seconds AS "ttlSeconds",
         s.expires_at AS "expiresAt", s.public_url AS "publicUrl",
         s.template_version_id AS "templateVersionId", s.template_image_digest AS "templateImageDigest",
         s.egress_policy AS "egressPolicy", s.source_provenance AS source,
         s.created_at AS "createdAt",
         COALESCE(v.workdir, t.workdir, '/') AS "runtimeWorkdir",
         COALESCE(v.default_ports, t.default_ports, '{}') AS "runtimeDefaultPorts",
         COALESCE(t.runtime_family, 'linux') AS "runtimeFamily",
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'port', r.port,
             'protocol', r.protocol,
             'accessMode', r.access_mode,
             'state', r.state,
             'host', r.host,
             'url', COALESCE(r.url, r.target_url),
             'labels', r.labels
           ) ORDER BY r.port, r.created_at)
           FROM sandbox_routes r
           WHERE r.sandbox_id = s.id
             AND r.organization_id = s.organization_id
             AND r.state <> 'terminated'
         ), '[]'::jsonb) AS "runtimeExposedPorts"
  FROM sandboxes s
  LEFT JOIN templates t ON t.id = s.template_id
  LEFT JOIN template_versions v ON v.id = s.template_version_id
`;

const runtimeRef = (runtimeProvider: RuntimeProvider, providerSandboxId: string | null | undefined): RuntimeSandboxRef => ({
  provider: runtimeProvider.kind,
  providerSandboxId: providerSandboxId ?? ""
});

const normalizeSandboxStatus = (status: string): SandboxStatus =>
  sandboxStatuses.includes(status as SandboxStatus) ? status as SandboxStatus : "error";

const toIso = (value: Date | string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const toIsoOrNull = (value: Date | string | null) => value ? toIso(value) : null;
const createdAtIso = (value: Date | string | null | undefined) => value ? toIso(value) : new Date(0).toISOString();

const readDependencies = (dependencies?: SandboxReadDependencies) => {
  if (typeof dependencies === "function") {
    return { query: dependencies, runtimeProvider: undefined };
  }
  return {
    query: dependencies?.query ?? defaultQuery,
    runtimeProvider: dependencies?.runtimeProvider
  };
};

const sanitizeGitUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    return url.replace(/\/\/[^/\s@]+@/g, "//");
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const gitTargetPath = (value: unknown) => typeof value === "string" && value.trim() ? value : "/workspace/project";

const sourceStatuses = new Set(["requested", "cloning", "ready", "failed"]);

const sanitizeSourceProvenance = (source: SandboxSourceProvenance | SandboxSourceInput | null | undefined): SandboxSourceProvenance | null => {
  if (!source || source.type !== "git") return null;
  const record = source as Record<string, unknown>;
  const provenance: SandboxSourceProvenance = {
    type: "git",
    url: sanitizeGitUrl(source.url),
    targetPath: gitTargetPath(source.targetPath),
    status: typeof record.status === "string" && sourceStatuses.has(record.status) ? record.status as SandboxSourceProvenance["status"] : "requested"
  };
  if (source.branch) provenance.branch = source.branch;
  if (source.commit) provenance.commit = source.commit;
  if (source.depth !== undefined) provenance.depth = source.depth;
  if (source.shallow !== undefined) provenance.shallow = source.shallow;
  if (source.submodules !== undefined) provenance.submodules = source.submodules;
  if (source.credentialPersistence) provenance.credentialPersistence = source.credentialPersistence;
  if (typeof record.startedAt === "string" || record.startedAt === null) provenance.startedAt = record.startedAt;
  if (typeof record.completedAt === "string" || record.completedAt === null) provenance.completedAt = record.completedAt;
  if (typeof record.durationMs === "number" || record.durationMs === null) provenance.durationMs = record.durationMs;
  if (typeof record.failureReason === "string") provenance.failureReason = redactText(record.failureReason);
  if (record.failureReason === null) provenance.failureReason = null;
  return provenance;
};

const mapSourceProvenance = (value: unknown): SandboxSourceProvenance | null => {
  if (!isRecord(value) || value.type !== "git" || typeof value.url !== "string") return null;
  return sanitizeSourceProvenance(value as unknown as SandboxSourceProvenance);
};

const numberList = (value: unknown) => Array.isArray(value)
  ? value.map(Number).filter((item) => Number.isInteger(item) && item > 0)
  : [];

const stringList = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string")
  : [];

const routeAccessMode = (value: unknown): SandboxRouteAccessMode =>
  sandboxRouteAccessModes.includes(value as SandboxRouteAccessMode) ? value as SandboxRouteAccessMode : "public";

const routeState = (value: unknown): SandboxRouteState =>
  sandboxRouteStates.includes(value as SandboxRouteState) ? value as SandboxRouteState : "unhealthy";

const runtimeRouteMetadata = (value: unknown): SandboxRuntimeRouteMetadata[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const port = Number(item.port);
    if (!Number.isInteger(port) || port <= 0) return [];
    const protocol = item.protocol === "https" ? "https" : "http";
    return [{
      port,
      protocol,
      accessMode: routeAccessMode(item.accessMode),
      state: routeState(item.state),
      host: typeof item.host === "string" ? item.host : "",
      url: typeof item.url === "string" ? item.url : "",
      labels: stringList(item.labels)
    }];
  });
};

const routePolicySummary = () => ({
  mode: config.sandboxRouteMode,
  baseDomain: config.sandboxRouteBaseDomain,
  publicScheme: config.sandboxRoutePublicScheme,
  defaultAccessMode: routeAccessMode(config.sandboxRouteDefaultAccessMode),
  maxRoutesPerSandbox: config.sandboxMaxRoutesPerSandbox,
  maxRoutesPerOrg: config.sandboxMaxRoutesPerOrg
});

const sandboxRuntimeMetadata = (
  row: SandboxRow,
  input: { createdAt: string; expiresAt: string | null; runtimeProvider?: RuntimeProvider }
): SandboxRuntimeMetadata => {
  let egress;
  try {
    egress = compileEgressPolicy(row.egressPolicy ?? defaultEgressPolicyInput);
  } catch {
    egress = compileEgressPolicy(defaultEgressPolicyInput);
  }
  const capabilities = input.runtimeProvider ? getRuntimeCapabilities(input.runtimeProvider).capabilities : [];
  return {
    workdir: row.runtimeWorkdir || "/",
    user: config.sandboxRuntimeUser,
    shell: config.sandboxRuntimeShell,
    template: {
      id: row.template,
      versionId: row.templateVersionId ?? null,
      imageDigest: row.templateImageDigest ?? null,
      runtimeFamily: row.runtimeFamily || "linux"
    },
    ports: {
      default: numberList(row.runtimeDefaultPorts),
      exposed: runtimeRouteMetadata(row.runtimeExposedPorts)
    },
    routes: routePolicySummary(),
    egress: {
      mode: egress.mode,
      presets: egress.presets,
      allow: egress.allow,
      deny: egress.deny,
      ruleCount: egress.rules.length
    },
    limits: {
      fileArtifactMaxBytes: config.sandboxFileArtifactMaxBytes,
      commandTimeoutMs: config.sandboxCommandTimeoutMs,
      terminalAttachTicketTtlSeconds: config.terminalAttachTicketTtlSeconds
    },
    lifecycle: {
      ttlSeconds: row.ttlSeconds ?? 0,
      expiresAt: input.expiresAt,
      createdAt: input.createdAt
    },
    provider: {
      kind: input.runtimeProvider?.kind ?? config.runtimeProvider,
      sandboxId: row.opensandboxId ?? null,
      capabilities
    }
  };
};

const mapSandboxRow = (row: SandboxRow, runtimeProvider?: RuntimeProvider): SandboxSummary => {
  const createdAt = createdAtIso(row.createdAt);
  const expiresAt = toIsoOrNull(row.expiresAt ?? null);
  return {
    ...row,
    cpu: Number(row.cpu ?? 0),
    mem: Number(row.mem ?? 0),
    started: row.started ?? "-",
    owner: row.owner ?? "",
    cost: Number(row.cost ?? 0),
    ttlSeconds: Number(row.ttlSeconds ?? 0),
    publicUrl: row.publicUrl ?? null,
    templateVersionId: row.templateVersionId ?? null,
    templateImageDigest: row.templateImageDigest ?? null,
    egressPolicy: row.egressPolicy ?? defaultEgressPolicyInput,
    status: normalizeSandboxStatus(row.status),
    expiresAt,
    source: mapSourceProvenance(row.source),
    createdAt,
    runtimeMetadata: sandboxRuntimeMetadata(row, { createdAt, expiresAt, runtimeProvider })
  };
};

const sandboxTemplateMetadata = (template: RuntimeTemplate) => ({
  templateId: template.id,
  templateVersionId: template.templateVersionId,
  imageDigest: template.imageDigest,
  routePolicy: routePolicySummary()
});

const waitFor = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T | "timeout"> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), timeoutMs); })
    ]);
  } finally {
    clearTimeout(timer);
  }
};

const uniqueValues = (values: string[]) => [...new Set(values)];

const duplicateValue = (values: string[]) => {
  const seen = new Set<string>();
  return values.find((value) => {
    if (seen.has(value)) return true;
    seen.add(value);
    return false;
  });
};

const createCredentialSyncError = (input: CreateSandboxInput) => {
  const count = (input.credentials?.length ?? 0) + (input.credentialMappings?.length ?? 0);
  if (!count) return null;
  if (input.wait === false) return "create-time credentials require synchronous sandbox creation; omit wait:false";
  if (input.waitTimeoutMs !== undefined) {
    return "create-time credentials cannot use waitTimeoutMs because credential attachments are not replayed asynchronously";
  }
  return null;
};

const selectMappedCredentialSlot = (template: RuntimeTemplate, mapping: TemplateCredentialSlotMappingBody) => {
  const slots = template.credentialSlots ?? [];
  const idMatch = mapping.slotId ? slots.find((slot) => slot.id === mapping.slotId) : null;
  const presetMatches = mapping.providerPresetId
    ? slots.filter((slot) => slot.providerPresetId === mapping.providerPresetId)
    : [];

  if (mapping.slotId && !idMatch) {
    return { kind: "error" as const, message: `template credential slot ${mapping.slotId} was not found on template ${template.id}` };
  }
  if (idMatch && mapping.providerPresetId && idMatch.providerPresetId !== mapping.providerPresetId) {
    return { kind: "error" as const, message: `template credential slot ${idMatch.id} uses ${idMatch.providerPresetId}, not ${mapping.providerPresetId}` };
  }
  if (idMatch) return { kind: "ok" as const, slot: idMatch };
  if (!mapping.providerPresetId) return { kind: "error" as const, message: "credential mapping requires slotId or providerPresetId" };
  if (!presetMatches.length) {
    return { kind: "error" as const, message: `template ${template.id} has no credential slot for ${mapping.providerPresetId}` };
  }
  if (presetMatches.length > 1) {
    return { kind: "error" as const, message: `template ${template.id} has multiple ${mapping.providerPresetId} slots; use slotId` };
  }
  return { kind: "ok" as const, slot: presetMatches[0] };
};

const validateMappedCredentialSlots = (template: RuntimeTemplate, mappings: TemplateCredentialSlotMappingBody[]) => {
  const seen = new Set<string>();
  const slots: TemplateCredentialSlot[] = [];
  for (const mapping of mappings) {
    const resolved = selectMappedCredentialSlot(template, mapping);
    if (resolved.kind !== "ok") return resolved;
    if (seen.has(resolved.slot.id)) {
      return { kind: "error" as const, message: `template credential slot ${resolved.slot.id} is mapped more than once` };
    }
    seen.add(resolved.slot.id);
    slots.push(resolved.slot);
  }
  return { kind: "ok" as const, slots };
};

const missingRequiredCredentialSlots = (template: RuntimeTemplate, mappedSlots: TemplateCredentialSlot[]) => {
  const mappedSlotIds = new Set(mappedSlots.map((slot) => slot.id));
  return (template.credentialSlots ?? [])
    .filter((slot) => slot.required && !mappedSlotIds.has(slot.id))
    .map((slot) => slot.id);
};

const prepareCreateCredentials = async (
  input: {
    organizationId: string;
    userId: string | null;
    apiKeyId?: string;
    template: RuntimeTemplate;
    credentials: AttachSandboxCredentialBody[];
    credentialMappings: TemplateCredentialSlotMappingBody[];
  },
  dependencies: {
    query: Query;
    idFactory: typeof makeId;
    decryptSecret?: DecryptWorkspaceCredentialSecret;
    externalSecretResolvers?: ExternalSecretResolverRegistry;
    dynamicCredentialIssuers?: DynamicCredentialIssuerRegistry;
  }
) => {
  const attachments: PreparedSandboxCredentialAttachment[] = [];
  for (const credential of input.credentials) {
    const prepared = await prepareSandboxCredentialSourceAttachment(
      { organizationId: input.organizationId, actorUserId: input.userId, actorApiKeyId: input.apiKeyId, body: credential },
      {
        query: dependencies.query,
        idFactory: dependencies.idFactory,
        decryptSecret: dependencies.decryptSecret,
        externalSecretResolvers: dependencies.externalSecretResolvers,
        dynamicCredentialIssuers: dependencies.dynamicCredentialIssuers
      }
    );
    if (prepared.kind !== "ok") return prepared;
    attachments.push(prepared.attachment);
  }
  const mappedSlots = validateMappedCredentialSlots(input.template, input.credentialMappings);
  if (mappedSlots.kind !== "ok") return { kind: "invalid_binding" as const, message: mappedSlots.message };
  const missingSlots = missingRequiredCredentialSlots(input.template, mappedSlots.slots);
  if (missingSlots.length) {
    return {
      kind: "required_slot_missing" as const,
      missingSlots,
      message: `template ${input.template.id} requires credential slot${missingSlots.length === 1 ? "" : "s"}: ${missingSlots.join(", ")}`
    };
  }
  for (const [index, mapping] of input.credentialMappings.entries()) {
    const prepared = await prepareTemplateCredentialSlotAttachment(
      { organizationId: input.organizationId, actorUserId: input.userId, actorApiKeyId: input.apiKeyId, slot: mappedSlots.slots[index], body: mapping },
      {
        query: dependencies.query,
        idFactory: dependencies.idFactory,
        decryptSecret: dependencies.decryptSecret,
        externalSecretResolvers: dependencies.externalSecretResolvers,
        dynamicCredentialIssuers: dependencies.dynamicCredentialIssuers
      }
    );
    if (prepared.kind !== "ok") return prepared;
    attachments.push(prepared.attachment);
  }
  const duplicateBinding = duplicateValue(attachments.map((credential) => credential.bindingName));
  if (duplicateBinding) return { kind: "invalid_binding" as const, message: `binding ${duplicateBinding} is already declared for this sandbox` };
  const duplicateCredential = duplicateValue(attachments.map((credential) => credential.credentialName));
  if (duplicateCredential) return { kind: "invalid_binding" as const, message: `credential ${duplicateCredential} is already declared for this sandbox` };
  return { kind: "ok" as const, attachments };
};

const mergeCredentialFakeEnv = (
  env: Record<string, string>,
  credentials: PreparedSandboxCredentialAttachment[]
) => {
  const merged = { ...env };
  for (const credential of credentials) {
    for (const [key, value] of Object.entries(credential.fakeEnv)) {
      if (merged[key] !== undefined && merged[key] !== value) throw new Error(`credential fake env ${key} conflicts with sandbox env`);
      merged[key] = value;
    }
  }
  return merged;
};

const credentialAwareEgressInput = (
  policy: EgressPolicyInput,
  credentials: PreparedSandboxCredentialAttachment[]
) => {
  if (!credentials.length) return policy;
  if (policy.mode === "blocked") throw new Error("create-time credentials cannot be used with blocked outbound access");
  const allow = uniqueValues([...(policy.allow ?? []), ...credentials.flatMap((credential) => credential.binding.match.hosts)]);
  return {
    ...policy,
    mode: policy.mode === "custom" ? "custom" as const : "restricted" as const,
    allow
  };
};

const mapCreateCredentialPreparationFailure = (
  result: Exclude<Awaited<ReturnType<typeof prepareCreateCredentials>>, { kind: "ok" }>
) => {
  if (result.kind === "secret_required") return { kind: "credential_vault_secret_required" as const, message: result.message };
  if (result.kind === "invalid_binding") return { kind: "credential_vault_invalid_binding" as const, message: result.message };
  if (result.kind === "required_slot_missing") {
    return { kind: "credential_vault_required_slot_missing" as const, message: result.message, missingSlots: result.missingSlots };
  }
  if (result.kind === "secret_forbidden") return { kind: "credential_secret_forbidden" as const };
  if (result.kind === "secret_not_found") return { kind: "credential_secret_not_found" as const };
  if (result.kind === "secret_disabled") return { kind: "credential_secret_disabled" as const };
  if (result.kind === "secret_decryption_unavailable") {
    return { kind: "credential_secret_decryption_unavailable" as const, message: result.message };
  }
  if (result.kind === "external_reference_forbidden") return { kind: "external_secret_reference_forbidden" as const };
  if (result.kind === "external_reference_not_found") return { kind: "external_secret_reference_not_found" as const };
  if (result.kind === "external_reference_disabled") return { kind: "external_secret_reference_disabled" as const };
  if (result.kind === "external_resolution_not_found") return { kind: "external_secret_resolution_not_found" as const, message: result.message };
  if (result.kind === "external_resolution_forbidden") return { kind: "external_secret_resolution_forbidden" as const, message: result.message };
  if (result.kind === "external_resolution_invalid") return { kind: "external_secret_resolution_invalid" as const, message: result.message };
  if (result.kind === "external_resolver_unavailable") return { kind: "external_secret_resolver_unavailable" as const, message: result.message };
  if (result.kind === "dynamic_issuer_forbidden") return { kind: "dynamic_credential_issuer_forbidden" as const };
  if (result.kind === "dynamic_issuer_not_found") return { kind: "dynamic_credential_issuer_not_found" as const };
  if (result.kind === "dynamic_issuer_disabled") return { kind: "dynamic_credential_issuer_disabled" as const };
  if (result.kind === "dynamic_issue_not_found") return { kind: "dynamic_credential_issue_not_found" as const, message: result.message };
  if (result.kind === "dynamic_issue_forbidden") return { kind: "dynamic_credential_issue_forbidden" as const, message: result.message };
  if (result.kind === "dynamic_issue_invalid") return { kind: "dynamic_credential_issue_invalid" as const, message: result.message };
  return { kind: "dynamic_credential_issuer_unavailable" as const, message: result.message };
};

const mapCreateCredentialAttachFailure = (
  result: Exclude<Awaited<ReturnType<typeof attachPreparedSandboxCredential>>, { kind: "ok" }>
) => {
  if (result.kind === "provider_unavailable") {
    return { kind: "credential_vault_provider_unavailable" as const, message: result.message, attachment: result.attachment };
  }
  if (result.kind === "unsupported") return { kind: "credential_vault_unsupported" as const, message: result.message };
  if (result.kind === "secret_required") return { kind: "credential_vault_secret_required" as const, message: result.message };
  if (result.kind === "invalid_binding") return { kind: "credential_vault_invalid_binding" as const, message: result.message };
  if (result.kind === "egress_conflict") return { kind: "credential_vault_invalid_binding" as const, message: result.message };
  if (result.kind === "sandbox_not_running") {
    return { kind: "credential_vault_invalid_binding" as const, message: `cannot attach credential to sandbox in state ${result.status}` };
  }
  return { kind: "credential_vault_invalid_binding" as const, message: "sandbox disappeared before credential attach" };
};

export const summarizeSandboxOperation = (operation: SandboxOperation): SandboxOperationSummary => ({
  id: operation.id,
  sandboxId: operation.sandboxId,
  kind: operation.kind,
  state: operation.state,
  error: operation.error,
  attempts: operation.attempts,
  createdAt: new Date(operation.createdAt).toISOString(),
  updatedAt: new Date(operation.updatedAt).toISOString()
});

export const listSandboxes = async (
  input: { organizationId: string; filters?: SandboxListFilters },
  dependencies?: SandboxReadDependencies
): Promise<SandboxSummary[]> => {
  const { query, runtimeProvider } = readDependencies(dependencies);
  const filters = input.filters ?? {};
  const params: unknown[] = [input.organizationId];
  let where = "WHERE s.organization_id = $1";
  const limit = Math.min(Math.max(Number(filters.limit ?? 100) || 100, 1), 200);
  if (filters.status && filters.status !== "all") {
    params.push(filters.status);
    where += ` AND s.status = $${params.length}`;
  }
  if (filters.template) {
    params.push(filters.template);
    where += ` AND s.template_id = $${params.length}`;
  }
  if (filters.templateVersionId) {
    params.push(filters.templateVersionId);
    where += ` AND s.template_version_id = $${params.length}`;
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    where += ` AND (s.id ILIKE $${params.length} OR s.name ILIKE $${params.length})`;
  }
  params.push(limit);
  const result = await query<SandboxRow>(`${sandboxSelect} ${where} ORDER BY s.created_at DESC LIMIT $${params.length}`, params);
  return result.rows.map((row) => mapSandboxRow(row, runtimeProvider));
};

const attachCreateCredentials = async (
  input: {
    organizationId: string;
    userId: string | null;
    actorLabel: string;
    sandbox: SandboxSummary;
    credentials: PreparedSandboxCredentialAttachment[];
  },
  dependencies: { query: Query; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder; recordAudit: Audit; idFactory: typeof makeId; decryptSecret?: DecryptWorkspaceCredentialSecret }
) => {
  const attachments: SandboxCredentialAttachmentSummary[] = [];
  for (const credential of input.credentials) {
    const result = await attachPreparedSandboxCredential(
      {
        organizationId: input.organizationId,
        sandboxId: input.sandbox.id,
        actorUserId: input.userId,
        actorLabel: input.actorLabel,
        prepared: credential
      },
      dependencies
    );
    if (result.kind === "ok") {
      attachments.push(result.attachment);
      continue;
    }
    return mapCreateCredentialAttachFailure(result);
  }
  return { kind: "ok" as const, attachments };
};

const rollbackCredentialCreate = async (
  input: {
    organizationId: string; userId: string | null; actorLabel: string; sandboxId: string;
    providerSandboxId: string; operationId: string; failureKind: string; failureMessage: string;
    effect: RuntimeEffect;
  },
  dependencies: { query: Query; transaction: Transaction; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder; recordAudit: Audit }
) => {
  const deletion = await finishRuntimeEffect(input.effect, async (query) => {
    await query("UPDATE sandboxes SET status='error', updated_at=now() WHERE id=$1 AND organization_id=$2", [input.sandboxId, input.organizationId]);
    await failSandboxOperation({ operationId: input.operationId, error: "Credential attachment failed; runtime cleanup requested.", result: { credentialFailure: input.failureKind, cleanup: "pending" } }, query);
    // A separate effect prevents an old provision observer from completing cleanup.
    const effect = await beginRuntimeEffect({ ...input, kind: "delete", context: { failedProvisionOperationId: input.operationId } }, query);
    await query("UPDATE sandbox_capacity_reservations SET phase='releasing', reason='credential_attachment_failed', updated_at=now() WHERE sandbox_id=$1 AND released_at IS NULL", [input.sandboxId]);
    await query("UPDATE sandbox_credential_attachments SET status='failed', last_error='Sandbox creation failed; runtime cleanup pending', updated_at=now() WHERE sandbox_id=$1 AND organization_id=$2 AND detached_at IS NULL", [input.sandboxId, input.organizationId]);
    return effect;
  }, dependencies.transaction);
  try { await executeRuntimeDeletion(deletion, dependencies); }
  catch { /* The durable cleanup effect retains capacity and is reconciled independently. */ }
  await dependencies.recordEvent(input.organizationId, input.sandboxId, "error", "sandbox credential attachment failed; cleanup requested", { operationId: input.operationId, failure: input.failureKind });
  await dependencies.recordAudit(input.organizationId, input.userId, input.actorLabel, "sandbox.create.credential_failed", "sandbox", input.sandboxId, { operationId: input.operationId, failure: input.failureKind });
};

export const getSandbox = async (
  input: { organizationId: string; sandboxId: string },
  dependencies?: SandboxReadDependencies
) => {
  const { query, runtimeProvider } = readDependencies(dependencies);
  const result = await query<SandboxRow>(`${sandboxSelect} WHERE s.id = $1 AND s.organization_id = $2`, [
    input.sandboxId,
    input.organizationId
  ]);
  return result.rowCount ? mapSandboxRow(result.rows[0], runtimeProvider) : null;
};

export type CreateSandboxResult =
  | { kind: "created"; sandbox: SandboxSummary; credentialAttachments?: SandboxCredentialAttachmentSummary[] }
  | { kind: "pending"; sandbox: SandboxSummary; operation: SandboxOperation; message: string }
  | { kind: "template_not_found"; template: string }
  | { kind: "template_not_ready"; template: string; status: string }
  | { kind: "template_image_digest_unresolved"; template: string; message: string }
  | { kind: "snapshot_not_found"; snapshotId: string }
  | { kind: "snapshot_not_ready"; snapshotId: string; status: string }
  | { kind: "snapshot_provider_mismatch"; snapshotId: string; provider: string; runtimeProvider: string }
  | { kind: "egress_policy_invalid"; message: string }
  | { kind: "egress_preset_not_allowed"; preset: string }
  | { kind: "egress_custom_domains_disabled" }
  | { kind: "egress_rule_limit_exceeded"; limit: number }
  | { kind: "sandbox_env_not_replayable"; message: string }
  | { kind: "credential_vault_create_requires_sync"; message: string }
  | { kind: "credential_vault_unsupported"; message: string }
  | { kind: "credential_vault_secret_required"; message: string }
  | { kind: "credential_vault_invalid_binding"; message: string }
  | { kind: "credential_vault_required_slot_missing"; message: string; missingSlots: string[] }
  | { kind: "credential_secret_forbidden" }
  | { kind: "credential_secret_not_found" }
  | { kind: "credential_secret_disabled" }
  | { kind: "credential_secret_decryption_unavailable"; message: string }
  | { kind: "external_secret_reference_forbidden" }
  | { kind: "external_secret_reference_not_found" }
  | { kind: "external_secret_reference_disabled" }
  | { kind: "external_secret_resolution_not_found"; message: string }
  | { kind: "external_secret_resolution_forbidden"; message: string }
  | { kind: "external_secret_resolution_invalid"; message: string }
  | { kind: "external_secret_resolver_unavailable"; message: string }
  | { kind: "dynamic_credential_issuer_forbidden" }
  | { kind: "dynamic_credential_issuer_not_found" }
  | { kind: "dynamic_credential_issuer_disabled" }
  | { kind: "dynamic_credential_issue_not_found"; message: string }
  | { kind: "dynamic_credential_issue_forbidden"; message: string }
  | { kind: "dynamic_credential_issue_invalid"; message: string }
  | { kind: "dynamic_credential_issuer_unavailable"; message: string }
  | { kind: "credential_vault_provider_unavailable"; message: string; sandbox: SandboxSummary; attachment: SandboxCredentialAttachmentSummary }
  | { kind: "sandbox_provision_failed"; sandbox: SandboxSummary | null; operation: SandboxOperation; message: string };

export const createSandbox = async (
  input: CreateSandboxInput,
  dependencies: {
    query?: Query;
    transaction?: Transaction;
    runtimeProvider: RuntimeProvider;
    recordEvent: SandboxEventRecorder;
    recordAudit: Audit;
    idFactory?: typeof makeId;
    resolveTemplateFn?: typeof resolveTemplate;
    templateCanCreateSandboxFn?: typeof templateCanCreateSandbox;
    ensureTemplateImageDigestFn?: typeof ensureTemplateImageDigest;
    decryptSecret?: DecryptWorkspaceCredentialSecret;
    externalSecretResolvers?: ExternalSecretResolverRegistry;
    dynamicCredentialIssuers?: DynamicCredentialIssuerRegistry;
  }
): Promise<CreateSandboxResult> => {
  const waitDeadline = input.waitTimeoutMs === undefined ? undefined : Date.now() + input.waitTimeoutMs;
  const query = dependencies.query ?? defaultQuery;
  const transaction = dependencies.transaction ?? defaultTransaction;
  const idFactory = dependencies.idFactory ?? makeId;
  const createCredentials = input.credentials ?? [];
  const credentialMappings = input.credentialMappings ?? [];
  const credentialCount = createCredentials.length + credentialMappings.length;
  const syncError = createCredentialSyncError(input);
  if (syncError) return { kind: "credential_vault_create_requires_sync", message: syncError };
  if (credentialCount && !dependencies.runtimeProvider.applyCredentialVault) {
    return { kind: "credential_vault_unsupported", message: "runtime provider does not expose Credential Vault injection" };
  }
  const existingResult = async (operation: SandboxOperation): Promise<CreateSandboxResult> => {
    const sandbox = operation.sandboxId ? await getSandbox(
      { organizationId: input.organizationId, sandboxId: operation.sandboxId }, { query, runtimeProvider: dependencies.runtimeProvider }
    ) : null;
    if (!sandbox || operation.state === "failed" || operation.state === "canceled") {
      return { kind: "sandbox_provision_failed", sandbox, operation, message: operation.error ?? "The accepted provision operation is no longer running." };
    }
    if (sandbox.status === "pending" || operation.state === "queued" || operation.state === "running") {
      return { kind: "pending", sandbox, operation, message: "sandbox provision is still pending" };
    }
    return { kind: "created", sandbox };
  };
  const existing = await findAcceptedCreate(input, query);
  if (existing) return existingResult(existing);
  const intentFingerprint = createIntentFingerprint(input);
  if (!intentFingerprint) return {
    kind: "sandbox_env_not_replayable",
    message: "Create inputs containing env, source or credentials require CONTROL_PLANE_SECRET_KEY for safe idempotent admission. Inline credentials are never stored as replay input."
  };
  const restoreSnapshot = input.snapshotId
    ? await getSandboxSnapshotForRestore({ organizationId: input.organizationId, snapshotId: input.snapshotId }, query) : null;
  if (input.snapshotId && !restoreSnapshot) return { kind: "snapshot_not_found", snapshotId: input.snapshotId };
  if (restoreSnapshot && restoreSnapshot.status !== "ready") return { kind: "snapshot_not_ready", snapshotId: restoreSnapshot.id, status: restoreSnapshot.status };
  if (restoreSnapshot && restoreSnapshot.provider !== dependencies.runtimeProvider.kind) {
    return { kind: "snapshot_provider_mismatch", snapshotId: restoreSnapshot.id, provider: restoreSnapshot.provider, runtimeProvider: dependencies.runtimeProvider.kind };
  }
  if (restoreSnapshot && (!restoreSnapshot.providerSnapshotId || !restoreSnapshot.template)) {
    return { kind: "snapshot_not_ready", snapshotId: restoreSnapshot.id, status: restoreSnapshot.status };
  }
  const templateRef = input.templateRef ?? restoreSnapshot?.template ?? "python-3.12-data";
  const unresolvedTemplate = await (dependencies.resolveTemplateFn ?? resolveTemplate)(templateRef, input.organizationId);
  if (!unresolvedTemplate) return { kind: "template_not_found", template: templateRef };
  if (!(dependencies.templateCanCreateSandboxFn ?? templateCanCreateSandbox)(unresolvedTemplate)) return { kind: "template_not_ready", template: templateRef, status: unresolvedTemplate.status };
  let template;
  try { template = await (dependencies.ensureTemplateImageDigestFn ?? ensureTemplateImageDigest)(unresolvedTemplate); }
  catch { return { kind: "template_image_digest_unresolved", template: templateRef, message: "Unable to resolve the template image digest." }; }

  const basePolicy = input.egress ?? template.egressPolicy ?? defaultEgressPolicyInput;
  if (credentialCount && basePolicy.mode === "blocked") return { kind: "credential_vault_invalid_binding", message: "create-time credentials cannot be used with blocked outbound access" };
  const initialEgress = await validateEgressPolicyForOrganization({ organizationId: input.organizationId, policy: basePolicy }, query);
  if (initialEgress.kind === "invalid_policy") return { kind: "egress_policy_invalid", message: initialEgress.message };
  if (initialEgress.kind === "preset_not_allowed") return { kind: "egress_preset_not_allowed", preset: initialEgress.preset };
  if (initialEgress.kind === "custom_domains_disabled") return { kind: "egress_custom_domains_disabled" };
  if (initialEgress.kind === "rule_limit_exceeded") return { kind: "egress_rule_limit_exceeded", limit: initialEgress.limit };
  if (input.workspaceId) {
    if (input.snapshotId) throw new WorkspaceError("workspace_snapshot_conflict", 400, "Workspace attachment cannot be combined with snapshot restore");
  }
  const id = idFactory("sbx", 10);
  const name = input.name?.trim() || `${template.id}-runner`;
  const source = sanitizeSourceProvenance(input.source);
  const sourceMetadata = source ? { source } : {};
  const restoreMetadata = restoreSnapshot ? { restoreSnapshotId: restoreSnapshot.id, providerSnapshotId: restoreSnapshot.providerSnapshotId } : {};
  const admitted = await transaction(async (q) => {
    const reused = await lockCreateAdmission(input, q);
    if (reused) return { operation: reused, preparation: null };
    if (input.workspaceId) await validateWorkspaceAttachment(input.organizationId, input.workspaceId, q, dependencies.runtimeProvider);
    await q(
      `INSERT INTO sandboxes
       (id, opensandbox_id, organization_id, template_id, name, status, cpu_pct, memory_mb,
        owner_id, owner_label, ttl_seconds, started_at, last_active_at, expires_at, public_url,
        template_version_id, template_image_digest, egress_policy, egress_compiled_policy, source_provenance, workspace_id)
       VALUES ($1,NULL,$2,$3,$4,'pending',0,0,$5,$6,$7,NULL,now(),NULL,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14)`,
      [id, input.organizationId, template.id, name, input.userId, input.actorLabel, input.ttlSeconds,
        `${id}.sandbox.harakiri.local`, template.templateVersionId, template.imageDigest,
        JSON.stringify(policyInputFromSummary(initialEgress.summary)), JSON.stringify(runtimeEgressPolicyFromSummary(initialEgress.summary)),
        source ? JSON.stringify(source) : null, input.workspaceId ?? null]
    ).catch((error: unknown) => {
      if ((error as { code?: string; message?: string }).code === "P0001" && (error as Error).message === "workspace_unavailable") {
        throw new WorkspaceError("workspace_unavailable", 409, "Workspace was reserved by another sandbox");
      }
      throw error;
    });
    const { operation } = await enqueueSandboxOperation({
      organizationId: input.organizationId, sandboxId: id, kind: "provision", idempotencyKey: input.idempotencyKey,
      request: {
        sandboxId: id, templateId: template.id, templateVersionId: template.templateVersionId, imageDigest: template.imageDigest,
        name, ttlSeconds: input.ttlSeconds, envKeys: Object.keys(input.env).sort(), envReplayable: true,
        dispatchReady: false, nonReplayable: credentialCount > 0, intentFingerprint, capacityProtocol: 1,
        actorUserId: input.userId, actorLabel: input.actorLabel, ...restoreMetadata, ...sourceMetadata
      }
    }, { query: q, idFactory: dependencies.idFactory });
    await reserveSandboxCapacity({ organizationId: input.organizationId, sandboxId: id, operationId: operation.id }, q);
    if (Object.keys(input.env).length) await storeSandboxOperationSecret({ operationId: operation.id, name: "provision_env", value: JSON.stringify(input.env) }, { query: q });
    const preparation = await beginRuntimeEffect({ organizationId: input.organizationId, sandboxId: id, kind: "prepare", operation }, q);
    return { operation, preparation };
  });
  if (!admitted.preparation) return existingResult(admitted.operation);
  const preparation = admitted.preparation;
  let operation = admitted.operation;
  const abandonPreparation = async (result: CreateSandboxResult): Promise<CreateSandboxResult> => {
    await finishRuntimeEffect(preparation, async (q) => {
      await q("UPDATE sandboxes SET status='error', updated_at=now() WHERE id=$1 AND organization_id=$2 AND opensandbox_id IS NULL", [id, input.organizationId]);
      await failSandboxOperation({ operationId: operation.id, error: "Sandbox preparation failed before runtime dispatch" }, q);
      await releaseSandboxCapacity({ organizationId: input.organizationId, sandboxId: id, generation: preparation.generation, reason: "canceled_before_dispatch" }, q);
      await q("UPDATE persistent_workspaces SET attached_sandbox_id=NULL, updated_at=now() WHERE attached_sandbox_id=$1 AND organization_id=$2 AND attachment_attempted_at IS NULL", [id, input.organizationId]);
    }, transaction);
    return result;
  };
  let preparedCredentials: Extract<Awaited<ReturnType<typeof prepareCreateCredentials>>, { kind: "ok" }>;
  let sandboxEnv: Record<string, string>;
  let egressSummary = initialEgress.summary;
  try {
    const prepared = await prepareCreateCredentials(
      { organizationId: input.organizationId, userId: input.userId, apiKeyId: input.apiKeyId, template, credentials: createCredentials, credentialMappings },
      { query, idFactory, decryptSecret: dependencies.decryptSecret, externalSecretResolvers: dependencies.externalSecretResolvers, dynamicCredentialIssuers: dependencies.dynamicCredentialIssuers }
    );
    if (prepared.kind !== "ok") return abandonPreparation(mapCreateCredentialPreparationFailure(prepared));
    preparedCredentials = prepared;
    try { sandboxEnv = mergeCredentialFakeEnv(input.env, prepared.attachments); }
    catch (error) {
      return abandonPreparation({ kind: "credential_vault_invalid_binding", message: (error as Error).message });
    }
    const egress = await validateEgressPolicyForOrganization({
      organizationId: input.organizationId, policy: credentialAwareEgressInput(basePolicy, prepared.attachments)
    }, query);
    if (egress.kind === "invalid_policy") return abandonPreparation({ kind: "egress_policy_invalid", message: egress.message });
    if (egress.kind === "preset_not_allowed") return abandonPreparation({ kind: "egress_preset_not_allowed", preset: egress.preset });
    if (egress.kind === "custom_domains_disabled") return abandonPreparation({ kind: "egress_custom_domains_disabled" });
    if (egress.kind === "rule_limit_exceeded") return abandonPreparation({ kind: "egress_rule_limit_exceeded", limit: egress.limit });
    egressSummary = egress.summary;
    operation = await finishRuntimeEffect(preparation, async (q) => {
      await q("UPDATE sandboxes SET egress_policy=$3::jsonb, egress_compiled_policy=$4::jsonb WHERE id=$1 AND organization_id=$2", [
        id, input.organizationId, JSON.stringify(policyInputFromSummary(egressSummary)), JSON.stringify(runtimeEgressPolicyFromSummary(egressSummary))
      ]);
      if (Object.keys(sandboxEnv).length) await storeSandboxOperationSecret({ operationId: operation.id, name: "provision_env", value: JSON.stringify(sandboxEnv) }, { query: q });
      await q("UPDATE sandbox_operations SET request=request || $2::jsonb, updated_at=now() WHERE id=$1 AND state='queued'", [
        operation.id, JSON.stringify({ dispatchReady: true, envKeys: Object.keys(sandboxEnv).sort(), envReplayable: true })
      ]);
      return (await q<SandboxOperation>(`${sandboxOperationSelect} WHERE id=$1`, [operation.id])).rows[0];
    }, transaction);
  } catch {
    return abandonPreparation({ kind: "sandbox_provision_failed", sandbox: null, operation, message: "Sandbox preparation failed before runtime dispatch." });
  }
  if (input.wait === false) {
    await dependencies.recordEvent(input.organizationId, id, "queued", "sandbox provision queued", { operationId: operation.id, ...restoreMetadata });
    await dependencies.recordAudit(input.organizationId, input.userId, input.actorLabel, "sandbox.create.queued", "sandbox", id, { operationId: operation.id, ...restoreMetadata });
    return existingResult(operation);
  }
  const claimed = await claimSandboxOperationById({ operationId: operation.id, kinds: ["provision"] }, query);
  if (!claimed) return existingResult((await query<SandboxOperation>(`${sandboxOperationSelect} WHERE id=$1`, [operation.id])).rows[0] ?? operation);
  const activeOperation = claimed;
  const provisionPromise = (async (): Promise<CreateSandboxResult> => {
    let provisioned: ProvisionedRuntime;
    try {
      provisioned = await provisionSandboxRuntime(activeOperation, async () => ({
        workspace: input.workspaceId ? await prepareRuntimeWorkspace(input.organizationId, id, query, dependencies.runtimeProvider) : undefined,
        template, ttlSeconds: input.ttlSeconds, name, organizationId: input.organizationId,
        snapshot: restoreSnapshot?.providerSnapshotId ? { provider: dependencies.runtimeProvider.kind, providerSnapshotId: restoreSnapshot.providerSnapshotId } : undefined,
        env: sandboxEnv, egressPolicy: runtimeEgressPolicyFromSummary(egressSummary),
        metadata: { "harakiri.id": id, "harakiri.sandbox": id, "harakiri.org": input.organizationId, "harakiri.organization": input.organizationId,
          ...(restoreSnapshot ? { "harakiri.restore_snapshot": restoreSnapshot.id } : {}) }
      }), { query, transaction, runtimeProvider: dependencies.runtimeProvider });
    } catch {
      const failed = await failSandboxOperation({ operationId: activeOperation.id, expectedAttempts: activeOperation.attempts,
        error: "Runtime provisioning could not be confirmed. The execution reservation is retained until safely reconciled." }, query);
      await dependencies.recordEvent(input.organizationId, id, "error", "Runtime provisioning could not be confirmed; its execution slot is retained.", { operationId: activeOperation.id });
      return { kind: "sandbox_provision_failed", sandbox: await getSandbox({ organizationId: input.organizationId, sandboxId: id }, { query, runtimeProvider: dependencies.runtimeProvider }),
        operation: failed ?? activeOperation, message: "Runtime provisioning could not be confirmed. Inspect the accepted operation before retrying." };
    }
    const sandbox = await getSandbox({ organizationId: input.organizationId, sandboxId: id }, { query, runtimeProvider: dependencies.runtimeProvider });
    if (!sandbox) throw new Error("sandbox row missing after provider create");
    let credentialAttachments: SandboxCredentialAttachmentSummary[] = [];
    if (preparedCredentials.attachments.length) {
      const attached = await attachCreateCredentials({
        organizationId: input.organizationId, userId: input.userId, actorLabel: input.actorLabel, sandbox, credentials: preparedCredentials.attachments
      }, { query, runtimeProvider: dependencies.runtimeProvider, recordEvent: dependencies.recordEvent, recordAudit: dependencies.recordAudit, idFactory, decryptSecret: dependencies.decryptSecret }).catch(() => ({
        kind: "sandbox_provision_failed" as const, message: "Credential attachment could not be confirmed.", sandbox, operation: activeOperation
      }));
      if (attached.kind !== "ok") {
        await rollbackCredentialCreate({
          organizationId: input.organizationId, userId: input.userId, actorLabel: input.actorLabel, sandboxId: id,
          providerSandboxId: provisioned.provider.providerSandboxId, operationId: activeOperation.id, failureKind: attached.kind, failureMessage: attached.message, effect: provisioned.effect
        }, { query, transaction, runtimeProvider: dependencies.runtimeProvider, recordEvent: dependencies.recordEvent, recordAudit: dependencies.recordAudit });
        if (attached.kind === "credential_vault_provider_unavailable") {
          return { ...attached, sandbox: await getSandbox({ organizationId: input.organizationId, sandboxId: id }, { query, runtimeProvider: dependencies.runtimeProvider }) ?? sandbox };
        }
        return attached;
      }
      credentialAttachments = attached.attachments;
    }
    await completeSandboxProvision(activeOperation, provisioned, {
      credentialAttachmentIds: credentialAttachments.map((attachment) => attachment.id), ...restoreMetadata, ...sourceMetadata,
      runtimeRegistryCredentialId: provisioned.provider.runtimeRegistryCredentialId, runtimeImageAuthProvided: provisioned.provider.runtimeImageAuthProvided
    }, transaction);
    const metadata = { operationId: activeOperation.id, provider: provisioned.provider.provider,
      opensandboxId: provisioned.provider.providerSandboxId, envKeys: Object.keys(sandboxEnv).sort(), runtimeWorkdir: template.workdir,
      egressMode: egressSummary.mode, egressRuleCount: egressSummary.rules.length, ...sandboxTemplateMetadata(template), ...restoreMetadata, ...sourceMetadata };
    await dependencies.recordEvent(input.organizationId, id, "created", `created through ${provisioned.provider.provider}`, metadata);
    await dependencies.recordAudit(input.organizationId, input.userId, input.actorLabel, "sandbox.create", "sandbox", id, metadata);
    return { kind: "created", sandbox, ...(credentialAttachments.length ? { credentialAttachments } : {}) };
  })();
  if (input.waitTimeoutMs !== undefined) {
    void provisionPromise.catch(() => undefined);
    const waited = await waitFor(provisionPromise, Math.max(0, waitDeadline! - Date.now()));
    if (waited === "timeout") return existingResult(activeOperation);
    return waited;
  }
  return provisionPromise;
};

export const updateSandboxSource = async (
  input: {
    organizationId: string;
    userId: string | null;
    actorLabel: string;
    sandboxId: string;
    source: SandboxSourceProvenance | null;
  },
  dependencies: { query?: Query; runtimeProvider?: RuntimeProvider; recordEvent: SandboxEventRecorder; recordAudit: Audit }
) => {
  const query = dependencies.query ?? defaultQuery;
  const source = sanitizeSourceProvenance(input.source);
  const updated = await query(
    `UPDATE sandboxes
     SET source_provenance = $3::jsonb, updated_at = now()
     WHERE id = $1 AND organization_id = $2`,
    [input.sandboxId, input.organizationId, source ? JSON.stringify(source) : null]
  );
  if (!updated.rowCount) return null;
  const metadata = source ? { source } : {};
  await dependencies.recordEvent(
    input.organizationId,
    input.sandboxId,
    source ? `source.${source.status}` : "source.cleared",
    source ? `${source.type} source ${source.status}` : "sandbox source cleared",
    metadata
  );
  await dependencies.recordAudit(input.organizationId, input.userId, input.actorLabel, "sandbox.source.update", "sandbox", input.sandboxId, metadata);
  return getSandbox({ organizationId: input.organizationId, sandboxId: input.sandboxId }, { query, runtimeProvider: dependencies.runtimeProvider });
};

export const deleteSandbox = async (
  input: {
    organizationId: string;
    userId: string | null;
    actorLabel: string;
    sandboxId: string;
    idempotencyKey?: string | null;
  },
  dependencies: { query?: Query; transaction?: Transaction; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder; recordAudit: Audit }
) => {
  const query = dependencies.query ?? defaultQuery;
  const result = await query<{ opensandbox_id: string | null; workspace_id: string | null; status: string }>(
    "SELECT opensandbox_id, workspace_id, status FROM sandboxes WHERE id = $1 AND organization_id = $2",
    [input.sandboxId, input.organizationId]
  );
  if (!result.rowCount) return false;
  await requestSandboxTermination(input, { query, transaction: dependencies.transaction, runtimeProvider: dependencies.runtimeProvider });
  await dependencies.recordEvent(input.organizationId, input.sandboxId, "termination.requested", "Stop requested; execution capacity is released after runtime absence is confirmed. Persistent workspace storage is retained.");
  await dependencies.recordAudit(input.organizationId, input.userId, input.actorLabel, "sandbox.kill", "sandbox", input.sandboxId);
  return true;
};

export const renewSandbox = async (
  input: { organizationId: string; sandboxId: string; idempotencyKey?: string | null },
  dependencies: { query?: Query; transaction?: Transaction; runtimeProvider: RuntimeProvider; recordEvent: SandboxEventRecorder }
) => {
  const query = dependencies.query ?? defaultQuery;
  const result = await query<{ opensandbox_id: string | null; ttl_seconds: number }>(
    "SELECT opensandbox_id, ttl_seconds FROM sandboxes WHERE id = $1 AND organization_id = $2",
    [input.sandboxId, input.organizationId]
  );
  if (!result.rowCount) return false;
  const { operation } = await enqueueSandboxOperation(
    {
      organizationId: input.organizationId,
      sandboxId: input.sandboxId,
      kind: "renew",
      idempotencyKey: input.idempotencyKey,
      request: { sandboxId: input.sandboxId, providerSandboxId: result.rows[0].opensandbox_id, ttlSeconds: result.rows[0].ttl_seconds }
    },
    { query }
  );
  if (operation.sandboxId !== input.sandboxId) throw new SandboxLeaseError("idempotency_conflict");
  if (operation.state === "succeeded") return true;
  const activeOperation = await claimSandboxOperationById({ operationId: operation.id, kinds: ["renew"] }, query);
  if (!activeOperation) {
    const latest = await query<{ state: string }>("SELECT state FROM sandbox_operations WHERE id = $1 AND organization_id = $2", [operation.id, input.organizationId]);
    if (latest.rows[0]?.state === "succeeded") return true;
    throw new SandboxLeaseError(["queued", "running"].includes(latest.rows[0]?.state) ? "renew_in_progress" : "renew_failed");
  }
  try {
    await renewSandboxLease({ ...input, operation: activeOperation }, dependencies);
  } catch (error) {
    if (error instanceof SandboxLeaseError && error.code === "renew_in_progress") throw error;
    const message = error instanceof Error ? error.message : String(error);
    await failSandboxOperation({ operationId: activeOperation.id, error: message, expectedAttempts: activeOperation.attempts }, query);
    throw error;
  }
  await dependencies.recordEvent(input.organizationId, input.sandboxId, "renewed", "ttl reset");
  return true;
};
