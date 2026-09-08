import {
  credentialSourceCapabilities,
  templateCredentialSlotFromInput,
  type CreateExternalSecretReferenceBody,
  type CredentialProviderProfileId,
  type ExternalSecretReferenceSummary,
  type ExternalSecretValidationState,
  type KubernetesSecretReference,
  type UpdateExternalSecretReferenceBody
} from "@harakiri/shared";
import { config } from "../config.js";
import { makeId } from "../crypto.js";
import { query as defaultQuery } from "../db.js";
import { externalSecretResolvers } from "../providers/secrets/index.js";
import type {
  ExternalSecretResolution,
  ExternalSecretResolverRegistry
} from "../providers/secrets/provider.js";
import { redactRecord, redactText } from "../redaction.js";
import { canManageCredentials, credentialAccessRole } from "./organization-access.js";
import type { Query } from "./query.js";

type ExternalSecretReferenceRow = {
  id: string;
  name: string;
  providerPresetId: CredentialProviderProfileId;
  customProfile: ExternalSecretReferenceSummary["customProfile"];
  resolverType: "kubernetes_secret";
  reference: unknown;
  memberUseAllowed: boolean;
  version: number;
  fakeEnv: Record<string, string>;
  binding: ExternalSecretReferenceSummary["binding"];
  egressDomains: string[];
  metadata: Record<string, unknown>;
  validationState: ExternalSecretValidationState;
  validationMessage: string | null;
  resolvedVersionRef: string | null;
  validatedAt: Date | string | null;
  createdByUserId: string | null;
  createdByLabel: string | null;
  disabledAt: Date | string | null;
  deletedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  activeSandboxCount: number | string;
  attachmentCount: number | string;
  lastAttachedAt: Date | string | null;
};

export type ExternalSecretReferenceFailureResult =
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "duplicate" }
  | { kind: "disabled" }
  | { kind: "invalid"; message: string };

export type ExternalSecretReferenceResult =
  | { kind: "ok"; reference: ExternalSecretReferenceSummary }
  | ExternalSecretReferenceFailureResult;

export type ExternalSecretReferencesResult =
  | { kind: "ok"; references: ExternalSecretReferenceSummary[] }
  | { kind: "forbidden" };

export type ExternalSecretMaterialResult =
  | { kind: "ok"; reference: ExternalSecretReferenceSummary; secretValue: string; versionRef: string | null }
  | ExternalSecretReferenceFailureResult
  | { kind: "resolver_not_found"; message: string }
  | { kind: "resolver_forbidden"; message: string }
  | { kind: "resolver_invalid"; message: string }
  | { kind: "resolver_unavailable"; message: string };

type ResolveOptions = {
  query?: Query;
  resolvers?: ExternalSecretResolverRegistry;
};

export const externalSecretReferenceSelect = `
  SELECT id,
         name,
         provider_preset_id AS "providerPresetId",
         custom_profile AS "customProfile",
         resolver_type AS "resolverType",
         reference,
         member_use_allowed AS "memberUseAllowed",
         version,
         fake_env AS "fakeEnv",
         binding,
         egress_domains AS "egressDomains",
         metadata,
         validation_state AS "validationState",
         validation_message AS "validationMessage",
         resolved_version_ref AS "resolvedVersionRef",
         validated_at AS "validatedAt",
         created_by_user_id::text AS "createdByUserId",
         created_by_label AS "createdByLabel",
         disabled_at AS "disabledAt",
         deleted_at AS "deletedAt",
         created_at AS "createdAt",
         updated_at AS "updatedAt",
         (SELECT COUNT(DISTINCT attachment.sandbox_id)::int
            FROM sandbox_credential_attachments attachment
            JOIN sandboxes sandbox ON sandbox.id = attachment.sandbox_id
           WHERE attachment.organization_id = external_reference.organization_id
             AND attachment.source_type = 'external_ref'
             AND attachment.source_ref = external_reference.id
             AND attachment.detached_at IS NULL
             AND sandbox.status IN ('running', 'idle')) AS "activeSandboxCount",
         (SELECT COUNT(*)::int
            FROM sandbox_credential_attachments attachment
           WHERE attachment.organization_id = external_reference.organization_id
             AND attachment.source_type = 'external_ref'
             AND attachment.source_ref = external_reference.id) AS "attachmentCount",
         (SELECT MAX(COALESCE(attachment.injected_at, attachment.created_at))
            FROM sandbox_credential_attachments attachment
           WHERE attachment.organization_id = external_reference.organization_id
             AND attachment.source_type = 'external_ref'
             AND attachment.source_ref = external_reference.id) AS "lastAttachedAt"
  FROM external_secret_references external_reference
`;

const toIso = (value: Date | string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const toIsoOrNull = (value: Date | string | null | undefined) => value ? toIso(value) : null;

const referenceStatus = (row: ExternalSecretReferenceRow) => {
  if (row.deletedAt) return "deleted" as const;
  if (row.disabledAt) return "disabled" as const;
  return "active" as const;
};

const requiredString = (value: unknown, label: string) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
};

const mapKubernetesReference = (value: unknown): KubernetesSecretReference => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("stored Kubernetes Secret reference is invalid");
  }
  const record = value as Record<string, unknown>;
  return {
    namespace: requiredString(record.namespace, "Kubernetes Secret namespace"),
    name: requiredString(record.name, "Kubernetes Secret name"),
    key: requiredString(record.key, "Kubernetes Secret key")
  };
};

export const mapExternalSecretReferenceRow = (
  row: ExternalSecretReferenceRow
): ExternalSecretReferenceSummary => ({
  id: row.id,
  name: row.name,
  providerPresetId: row.providerPresetId,
  customProfile: row.customProfile ?? null,
  sourceType: "external_ref",
  resolverType: row.resolverType,
  reference: mapKubernetesReference(row.reference),
  status: referenceStatus(row),
  usePolicy: row.memberUseAllowed ? "organization_members" : "admins_only",
  version: row.version,
  fakeEnv: row.fakeEnv ?? {},
  binding: row.binding,
  egressDomains: row.egressDomains ?? [],
  metadata: redactRecord(row.metadata ?? {}),
  createdByUserId: row.createdByUserId,
  createdByLabel: row.createdByLabel,
  disabledAt: toIsoOrNull(row.disabledAt),
  deletedAt: toIsoOrNull(row.deletedAt),
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
  validation: {
    state: row.validationState,
    message: row.validationMessage ? redactText(row.validationMessage) : null,
    versionRef: row.resolvedVersionRef,
    checkedAt: toIsoOrNull(row.validatedAt)
  },
  usage: {
    activeSandboxCount: Number(row.activeSandboxCount ?? 0),
    attachmentCount: Number(row.attachmentCount ?? 0),
    lastAttachedAt: toIsoOrNull(row.lastAttachedAt)
  },
  capabilities: credentialSourceCapabilities.external_ref
});

const kubernetesNamePattern = /^[a-z0-9]([-.a-z0-9]*[a-z0-9])?$/;
const kubernetesKeyPattern = /^[A-Za-z0-9._-]+$/;
const envNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

const normalizeKubernetesName = (value: string, label: string) => {
  const normalized = value.trim();
  if (normalized.length > 253 || !kubernetesNamePattern.test(normalized)) {
    throw new Error(`${label} must be a valid Kubernetes DNS subdomain`);
  }
  return normalized;
};

const normalizeKubernetesKey = (value: string) => {
  const normalized = value.trim();
  if (normalized.length > 253 || !kubernetesKeyPattern.test(normalized)) {
    throw new Error("Kubernetes Secret key may contain letters, numbers, ., _, and -");
  }
  return normalized;
};

const normalizeReference = (
  reference: CreateExternalSecretReferenceBody["reference"]
): KubernetesSecretReference => ({
  namespace: normalizeKubernetesName(
    reference.namespace ?? config.externalSecretKubernetesDefaultNamespace,
    "Kubernetes Secret namespace"
  ),
  name: normalizeKubernetesName(reference.name, "Kubernetes Secret name"),
  key: normalizeKubernetesKey(reference.key)
});

const mergeFakeEnv = (defaults: Record<string, string>, overrides?: Record<string, string>) => {
  const fakeEnv = { ...defaults, ...(overrides ?? {}) };
  for (const key of Object.keys(fakeEnv)) {
    if (!envNamePattern.test(key)) throw new Error(`invalid fake env key "${key}"`);
  }
  return fakeEnv;
};

const prepareMetadata = (input: {
  name: string;
  providerPresetId: CredentialProviderProfileId;
  customProfile?: CreateExternalSecretReferenceBody["customProfile"];
  reference: CreateExternalSecretReferenceBody["reference"];
  fakeEnv?: Record<string, string>;
  metadata?: Record<string, unknown>;
}) => {
  const name = requiredString(input.name, "external secret reference name");
  const slot = templateCredentialSlotFromInput({
    providerPresetId: input.providerPresetId,
    customProfile: input.customProfile
  });
  return {
    name,
    customProfile: slot.customProfile,
    reference: normalizeReference(input.reference),
    fakeEnv: mergeFakeEnv(slot.fakeEnv, input.fakeEnv),
    binding: slot.binding,
    egressDomains: slot.egressDomains,
    metadata: redactRecord(input.metadata ?? {})
  };
};

const selectReference = async (
  organizationId: string,
  referenceId: string,
  query: Query,
  includeDeleted = false
) => {
  const deletedFilter = includeDeleted ? "" : "AND deleted_at IS NULL";
  const result = await query<ExternalSecretReferenceRow>(
    `${externalSecretReferenceSelect}
     WHERE organization_id = $1 AND id = $2 ${deletedFilter}`,
    [organizationId, referenceId]
  );
  return result.rows[0] ?? null;
};

const activeNameExists = async (
  organizationId: string,
  name: string,
  query: Query,
  excludingId?: string
) => {
  const result = await query<{ id: string }>(
    `SELECT id FROM external_secret_references
     WHERE organization_id = $1 AND lower(name) = lower($2)
       AND deleted_at IS NULL AND ($3::text IS NULL OR id <> $3)
     LIMIT 1`,
    [organizationId, name, excludingId ?? null]
  );
  return Boolean(result.rows.length);
};

export const listExternalSecretReferences = async (
  input: { organizationId: string; actorUserId: string | null; actorApiKeyId?: string; includeDeleted?: boolean },
  query: Query = defaultQuery
): Promise<ExternalSecretReferencesResult> => {
  const role = await credentialAccessRole(input.organizationId, input, query);
  if (!role) return { kind: "forbidden" };
  const predicates = ["organization_id = $1"];
  if (role !== "admin") predicates.push("member_use_allowed = true", "deleted_at IS NULL");
  else if (!input.includeDeleted) predicates.push("deleted_at IS NULL");
  const result = await query<ExternalSecretReferenceRow>(
    `${externalSecretReferenceSelect} WHERE ${predicates.join(" AND ")} ORDER BY updated_at DESC`,
    [input.organizationId]
  );
  return { kind: "ok", references: result.rows.map(mapExternalSecretReferenceRow) };
};

export const getExternalSecretReference = async (
  input: { organizationId: string; actorUserId: string | null; actorApiKeyId?: string; referenceId: string },
  query: Query = defaultQuery
): Promise<ExternalSecretReferenceResult> => {
  const role = await credentialAccessRole(input.organizationId, input, query);
  if (!role) return { kind: "forbidden" };
  const row = await selectReference(input.organizationId, input.referenceId, query, role === "admin");
  if (!row) return { kind: "not_found" };
  if (role !== "admin" && !row.memberUseAllowed) return { kind: "forbidden" };
  return { kind: "ok", reference: mapExternalSecretReferenceRow(row) };
};

export const createExternalSecretReference = async (
  input: {
    organizationId: string;
    actorUserId: string | null; actorApiKeyId?: string;
    actorLabel: string;
    body: CreateExternalSecretReferenceBody;
  },
  dependencies: { query?: Query; idFactory?: typeof makeId } = {}
): Promise<ExternalSecretReferenceResult> => {
  const query = dependencies.query ?? defaultQuery;
  if (!await canManageCredentials(input.organizationId, input, query)) return { kind: "forbidden" };
  let prepared;
  try {
    prepared = prepareMetadata(input.body);
  } catch (error) {
    return { kind: "invalid", message: error instanceof Error ? error.message : String(error) };
  }
  if (await activeNameExists(input.organizationId, prepared.name, query)) return { kind: "duplicate" };
  const id = (dependencies.idFactory ?? makeId)("xsr", 12);
  await query(
    `INSERT INTO external_secret_references
     (id, organization_id, name, provider_preset_id, custom_profile, resolver_type, reference,
      member_use_allowed, fake_env, binding, egress_domains, metadata,
      created_by_user_id, created_by_label)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9::jsonb, $10::jsonb,
             $11::jsonb, $12::jsonb, $13, $14)`,
    [
      id,
      input.organizationId,
      prepared.name,
      input.body.providerPresetId,
      JSON.stringify(prepared.customProfile),
      input.body.resolverType,
      JSON.stringify(prepared.reference),
      input.body.usePolicy === "organization_members",
      JSON.stringify(prepared.fakeEnv),
      JSON.stringify(prepared.binding),
      JSON.stringify(prepared.egressDomains),
      JSON.stringify(prepared.metadata),
      input.actorUserId,
      input.actorLabel
    ]
  );
  const row = await selectReference(input.organizationId, id, query);
  if (!row) throw new Error(`external secret reference ${id} was not found after creation`);
  return { kind: "ok", reference: mapExternalSecretReferenceRow(row) };
};

const mergedUpdate = (
  current: ExternalSecretReferenceSummary,
  body: UpdateExternalSecretReferenceBody
) => {
  const providerPresetId = body.providerPresetId ?? current.providerPresetId;
  const currentCustomProfile = current.customProfile
    ? { ...current.customProfile, headerName: current.customProfile.headerName ?? undefined }
    : undefined;
  return prepareMetadata({
    name: body.name ?? current.name,
    providerPresetId,
    customProfile: providerPresetId === "custom" ? body.customProfile ?? currentCustomProfile : undefined,
    reference: body.reference ?? current.reference,
    fakeEnv: body.fakeEnv ?? current.fakeEnv,
    metadata: body.metadata ?? current.metadata
  });
};

export const updateExternalSecretReference = async (
  input: {
    organizationId: string;
    actorUserId: string | null; actorApiKeyId?: string;
    referenceId: string;
    body: UpdateExternalSecretReferenceBody;
  },
  query: Query = defaultQuery
): Promise<ExternalSecretReferenceResult> => {
  if (!await canManageCredentials(input.organizationId, input, query)) return { kind: "forbidden" };
  const row = await selectReference(input.organizationId, input.referenceId, query);
  if (!row) return { kind: "not_found" };
  let prepared;
  try {
    prepared = mergedUpdate(mapExternalSecretReferenceRow(row), input.body);
  } catch (error) {
    return { kind: "invalid", message: error instanceof Error ? error.message : String(error) };
  }
  if (await activeNameExists(input.organizationId, prepared.name, query, input.referenceId)) return { kind: "duplicate" };
  await query(
    `UPDATE external_secret_references
     SET name = $3, provider_preset_id = $4, custom_profile = $5::jsonb, reference = $6::jsonb,
         member_use_allowed = $7, fake_env = $8::jsonb, binding = $9::jsonb,
         egress_domains = $10::jsonb, metadata = $11::jsonb, version = version + 1,
         validation_state = 'unvalidated', validation_message = NULL,
         resolved_version_ref = NULL, validated_at = NULL, updated_at = now()
     WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [
      input.organizationId,
      input.referenceId,
      prepared.name,
      input.body.providerPresetId ?? row.providerPresetId,
      JSON.stringify(prepared.customProfile),
      JSON.stringify(prepared.reference),
      (input.body.usePolicy ?? (row.memberUseAllowed ? "organization_members" : "admins_only")) === "organization_members",
      JSON.stringify(prepared.fakeEnv),
      JSON.stringify(prepared.binding),
      JSON.stringify(prepared.egressDomains),
      JSON.stringify(prepared.metadata)
    ]
  );
  const updated = await selectReference(input.organizationId, input.referenceId, query);
  if (!updated) throw new Error(`external secret reference ${input.referenceId} was not found after update`);
  return { kind: "ok", reference: mapExternalSecretReferenceRow(updated) };
};

const changeReferenceStatus = async (
  input: { organizationId: string; actorUserId: string | null; actorApiKeyId?: string; referenceId: string },
  action: "disable" | "enable" | "delete",
  query: Query
): Promise<ExternalSecretReferenceResult> => {
  if (!await canManageCredentials(input.organizationId, input, query)) return { kind: "forbidden" };
  const row = await selectReference(input.organizationId, input.referenceId, query);
  if (!row) return { kind: "not_found" };
  const assignments = action === "disable"
    ? "disabled_at = now()"
    : action === "enable"
      ? "disabled_at = NULL"
      : "deleted_at = now(), disabled_at = COALESCE(disabled_at, now())";
  await query(
    `UPDATE external_secret_references SET ${assignments}, updated_at = now()
     WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [input.organizationId, input.referenceId]
  );
  const updated = await selectReference(input.organizationId, input.referenceId, query, true);
  if (!updated) throw new Error(`external secret reference ${input.referenceId} was not found after ${action}`);
  return { kind: "ok", reference: mapExternalSecretReferenceRow(updated) };
};

export const disableExternalSecretReference = (
  input: { organizationId: string; actorUserId: string | null; actorApiKeyId?: string; referenceId: string },
  query: Query = defaultQuery
) => changeReferenceStatus(input, "disable", query);

export const enableExternalSecretReference = (
  input: { organizationId: string; actorUserId: string | null; actorApiKeyId?: string; referenceId: string },
  query: Query = defaultQuery
) => changeReferenceStatus(input, "enable", query);

export const deleteExternalSecretReference = (
  input: { organizationId: string; actorUserId: string | null; actorApiKeyId?: string; referenceId: string },
  query: Query = defaultQuery
) => changeReferenceStatus(input, "delete", query);

const validationStateFor = (
  resolution: ExternalSecretResolution
): Exclude<ExternalSecretValidationState, "unvalidated"> =>
  resolution.kind === "ok" ? "valid" : resolution.kind;

const storeValidation = async (
  organizationId: string,
  referenceId: string,
  resolution: ExternalSecretResolution,
  query: Query
) => {
  const message = resolution.kind === "ok" ? null : redactText(resolution.message);
  const versionRef = resolution.kind === "ok" ? resolution.versionRef : null;
  await query(
    `UPDATE external_secret_references
     SET validation_state = $3, validation_message = $4,
         resolved_version_ref = $5, validated_at = now(), updated_at = now()
     WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [organizationId, referenceId, validationStateFor(resolution), message, versionRef]
  );
};

const externalResolutionFailure = (
  resolution: Exclude<ExternalSecretResolution, { kind: "ok" }>
): ExternalSecretMaterialResult => {
  if (resolution.kind === "not_found") return { kind: "resolver_not_found", message: resolution.message };
  if (resolution.kind === "forbidden") return { kind: "resolver_forbidden", message: resolution.message };
  if (resolution.kind === "invalid") return { kind: "resolver_invalid", message: resolution.message };
  return { kind: "resolver_unavailable", message: resolution.message };
};

const resolveRow = async (
  organizationId: string,
  row: ExternalSecretReferenceRow,
  options: ResolveOptions
): Promise<ExternalSecretMaterialResult> => {
  const query = options.query ?? defaultQuery;
  if (row.disabledAt) return { kind: "disabled" };
  const resolver = (options.resolvers ?? externalSecretResolvers)[row.resolverType];
  const resolution = resolver
    ? await resolver.resolve(mapKubernetesReference(row.reference))
    : { kind: "unavailable" as const, message: `external secret resolver ${row.resolverType} is unavailable` };
  await storeValidation(organizationId, row.id, resolution, query);
  if (resolution.kind !== "ok") return externalResolutionFailure(resolution);
  const refreshed = await selectReference(organizationId, row.id, query);
  if (!refreshed) return { kind: "not_found" };
  return {
    kind: "ok",
    reference: mapExternalSecretReferenceRow(refreshed),
    secretValue: resolution.value,
    versionRef: resolution.versionRef
  };
};

export const validateExternalSecretReference = async (
  input: { organizationId: string; actorUserId: string | null; actorApiKeyId?: string; referenceId: string },
  options: ResolveOptions = {}
): Promise<ExternalSecretReferenceResult> => {
  const query = options.query ?? defaultQuery;
  if (!await canManageCredentials(input.organizationId, input, query)) return { kind: "forbidden" };
  const row = await selectReference(input.organizationId, input.referenceId, query);
  if (!row) return { kind: "not_found" };
  if (row.disabledAt) return { kind: "disabled" };
  await resolveRow(input.organizationId, row, { ...options, query });
  const updated = await selectReference(input.organizationId, input.referenceId, query);
  if (!updated) return { kind: "not_found" };
  return { kind: "ok", reference: mapExternalSecretReferenceRow(updated) };
};

export const resolveExternalSecretReferenceMaterial = async (
  input: { organizationId: string; actorUserId: string | null; actorApiKeyId?: string; referenceId: string },
  options: ResolveOptions = {}
): Promise<ExternalSecretMaterialResult> => {
  const query = options.query ?? defaultQuery;
  const role = await credentialAccessRole(input.organizationId, input, query);
  if (!role) return { kind: "forbidden" };
  const row = await selectReference(input.organizationId, input.referenceId, query);
  if (!row) return { kind: "not_found" };
  if (role !== "admin" && !row.memberUseAllowed) return { kind: "forbidden" };
  return resolveRow(input.organizationId, row, { ...options, query });
};

export const resolveExternalSecretReferenceMaterialForSystem = async (
  input: { organizationId: string; referenceId: string },
  options: ResolveOptions = {}
): Promise<ExternalSecretMaterialResult> => {
  const query = options.query ?? defaultQuery;
  const row = await selectReference(input.organizationId, input.referenceId, query);
  if (!row) return { kind: "not_found" };
  return resolveRow(input.organizationId, row, { ...options, query });
};
