import {
  credentialProviderPresetCatalog,
  credentialSourceCapabilities,
  type CreateDynamicCredentialIssuerBody,
  type DynamicCredentialIssuerSummary,
  type DynamicCredentialValidationState,
  type GitHubAppInstallationScope,
  type UpdateDynamicCredentialIssuerBody
} from "@harakiri/shared";
import { makeId } from "../crypto.js";
import { query as defaultQuery } from "../db.js";
import { dynamicCredentialIssuers } from "../providers/credentials/index.js";
import type {
  DynamicCredentialIssuance,
  DynamicCredentialIssuerRegistry,
  DynamicCredentialValidation
} from "../providers/credentials/provider.js";
import { redactRecord, redactText } from "../redaction.js";
import { isOrganizationAdmin, organizationMembershipRole } from "./organization-access.js";
import type { Query } from "./query.js";

type DynamicCredentialIssuerRow = {
  id: string;
  name: string;
  issuerType: "github_app_installation";
  scope: GitHubAppInstallationScope;
  memberUseAllowed: boolean;
  version: number;
  fakeEnv: Record<string, string>;
  binding: DynamicCredentialIssuerSummary["binding"];
  egressDomains: string[];
  metadata: Record<string, unknown>;
  validationState: DynamicCredentialValidationState;
  validationMessage: string | null;
  validatedAt: Date | string | null;
  lastIssuedAt: Date | string | null;
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

export type DynamicCredentialIssuerFailureResult =
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "duplicate" }
  | { kind: "disabled" }
  | { kind: "invalid"; message: string };

export type DynamicCredentialIssuerResult =
  | { kind: "ok"; issuer: DynamicCredentialIssuerSummary }
  | DynamicCredentialIssuerFailureResult;

export type DynamicCredentialIssuersResult =
  | { kind: "ok"; issuers: DynamicCredentialIssuerSummary[] }
  | { kind: "forbidden" };

export type DynamicCredentialMaterialResult =
  | {
    kind: "ok";
    issuer: DynamicCredentialIssuerSummary;
    value: string;
    expiresAt: string;
    metadata: Record<string, unknown>;
  }
  | DynamicCredentialIssuerFailureResult
  | { kind: "issuer_not_found"; message: string }
  | { kind: "issuer_forbidden"; message: string }
  | { kind: "issuer_invalid"; message: string }
  | { kind: "issuer_unavailable"; message: string };

type IssuerOptions = {
  query?: Query;
  issuers?: DynamicCredentialIssuerRegistry;
};

export const dynamicCredentialIssuerSelect = `
  SELECT id,
         name,
         issuer_type AS "issuerType",
         scope,
         member_use_allowed AS "memberUseAllowed",
         version,
         fake_env AS "fakeEnv",
         binding,
         egress_domains AS "egressDomains",
         metadata,
         validation_state AS "validationState",
         validation_message AS "validationMessage",
         validated_at AS "validatedAt",
         last_issued_at AS "lastIssuedAt",
         created_by_user_id::text AS "createdByUserId",
         created_by_label AS "createdByLabel",
         disabled_at AS "disabledAt",
         deleted_at AS "deletedAt",
         created_at AS "createdAt",
         updated_at AS "updatedAt",
         (SELECT COUNT(DISTINCT attachment.sandbox_id)::int
            FROM sandbox_credential_attachments attachment
            JOIN sandboxes sandbox ON sandbox.id = attachment.sandbox_id
           WHERE attachment.organization_id = dynamic_issuer.organization_id
             AND attachment.source_type = 'dynamic'
             AND attachment.source_ref = dynamic_issuer.id
             AND attachment.detached_at IS NULL
             AND sandbox.status IN ('running', 'idle')) AS "activeSandboxCount",
         (SELECT COUNT(*)::int
            FROM sandbox_credential_attachments attachment
           WHERE attachment.organization_id = dynamic_issuer.organization_id
             AND attachment.source_type = 'dynamic'
             AND attachment.source_ref = dynamic_issuer.id) AS "attachmentCount",
         (SELECT MAX(COALESCE(attachment.injected_at, attachment.created_at))
            FROM sandbox_credential_attachments attachment
           WHERE attachment.organization_id = dynamic_issuer.organization_id
             AND attachment.source_type = 'dynamic'
             AND attachment.source_ref = dynamic_issuer.id) AS "lastAttachedAt"
  FROM dynamic_credential_issuers dynamic_issuer
`;

const toIso = (value: Date | string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const toIsoOrNull = (value: Date | string | null | undefined) => value ? toIso(value) : null;

const statusFor = (row: DynamicCredentialIssuerRow) => {
  if (row.deletedAt) return "deleted" as const;
  if (row.disabledAt) return "disabled" as const;
  return "active" as const;
};

export const mapDynamicCredentialIssuerRow = (
  row: DynamicCredentialIssuerRow
): DynamicCredentialIssuerSummary => ({
  id: row.id,
  name: row.name,
  providerPresetId: "github",
  sourceType: "dynamic",
  issuerType: row.issuerType,
  scope: row.scope,
  status: statusFor(row),
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
  lastIssuedAt: toIsoOrNull(row.lastIssuedAt),
  validation: {
    state: row.validationState,
    message: row.validationMessage ? redactText(row.validationMessage) : null,
    checkedAt: toIsoOrNull(row.validatedAt)
  },
  usage: {
    activeSandboxCount: Number(row.activeSandboxCount ?? 0),
    attachmentCount: Number(row.attachmentCount ?? 0),
    lastAttachedAt: toIsoOrNull(row.lastAttachedAt)
  },
  capabilities: credentialSourceCapabilities.dynamic
});

const requiredName = (value: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error("dynamic credential issuer name is required");
  return normalized;
};

const normalizeScope = (scope: GitHubAppInstallationScope): GitHubAppInstallationScope => {
  const installationId = scope.installationId.trim();
  if (!/^[1-9]\d*$/.test(installationId)) throw new Error("GitHub App installation id must be a positive integer");
  const repositories = [...new Set(scope.repositories.map((item) => item.trim()).filter(Boolean))];
  if (!repositories.length || repositories.length > 500) {
    throw new Error("GitHub App scope requires between 1 and 500 repository names");
  }
  if (repositories.some((name) => name.length > 100 || name.includes("/") || !/^[A-Za-z0-9._-]+$/.test(name))) {
    throw new Error("GitHub repository names must not include an owner or unsupported characters");
  }
  const permissions = Object.fromEntries(Object.entries(scope.permissions).map(([key, value]) => [key.trim(), value]));
  if (!Object.keys(permissions).length || Object.keys(permissions).length > 50) {
    throw new Error("GitHub App scope requires between 1 and 50 explicit permissions");
  }
  if (Object.keys(permissions).some((key) => !/^[a-z][a-z0-9_]{0,63}$/.test(key))) {
    throw new Error("GitHub App permission names must use lower-case snake case");
  }
  return { installationId, repositories, permissions };
};

const envNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

const prepareMetadata = (input: {
  name: string;
  scope: GitHubAppInstallationScope;
  fakeEnv?: Record<string, string>;
  metadata?: Record<string, unknown>;
}) => {
  const preset = credentialProviderPresetCatalog.github;
  const fakeEnv = { ...preset.fakeEnv, ...(input.fakeEnv ?? {}) };
  if (Object.keys(fakeEnv).some((key) => !envNamePattern.test(key))) throw new Error("invalid fake environment key");
  return {
    name: requiredName(input.name),
    scope: normalizeScope(input.scope),
    fakeEnv,
    binding: preset.binding,
    egressDomains: preset.egressDomains,
    metadata: redactRecord(input.metadata ?? {})
  };
};

const selectIssuer = async (
  organizationId: string,
  issuerId: string,
  query: Query,
  includeDeleted = false
) => {
  const deletedFilter = includeDeleted ? "" : "AND deleted_at IS NULL";
  const result = await query<DynamicCredentialIssuerRow>(
    `${dynamicCredentialIssuerSelect}
     WHERE organization_id = $1 AND id = $2 ${deletedFilter}`,
    [organizationId, issuerId]
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
    `SELECT id FROM dynamic_credential_issuers
     WHERE organization_id = $1 AND lower(name) = lower($2)
       AND deleted_at IS NULL AND ($3::text IS NULL OR id <> $3)
     LIMIT 1`,
    [organizationId, name, excludingId ?? null]
  );
  return Boolean(result.rows.length);
};

export const listDynamicCredentialIssuers = async (
  input: { organizationId: string; actorUserId: string; includeDeleted?: boolean },
  query: Query = defaultQuery
): Promise<DynamicCredentialIssuersResult> => {
  const role = await organizationMembershipRole(input.organizationId, input.actorUserId, query);
  if (!role) return { kind: "forbidden" };
  const predicates = ["organization_id = $1"];
  if (role !== "admin") predicates.push("member_use_allowed = true", "deleted_at IS NULL");
  else if (!input.includeDeleted) predicates.push("deleted_at IS NULL");
  const result = await query<DynamicCredentialIssuerRow>(
    `${dynamicCredentialIssuerSelect} WHERE ${predicates.join(" AND ")} ORDER BY updated_at DESC`,
    [input.organizationId]
  );
  return { kind: "ok", issuers: result.rows.map(mapDynamicCredentialIssuerRow) };
};

export const getDynamicCredentialIssuer = async (
  input: { organizationId: string; actorUserId: string; issuerId: string },
  query: Query = defaultQuery
): Promise<DynamicCredentialIssuerResult> => {
  const role = await organizationMembershipRole(input.organizationId, input.actorUserId, query);
  if (!role) return { kind: "forbidden" };
  const row = await selectIssuer(input.organizationId, input.issuerId, query, role === "admin");
  if (!row) return { kind: "not_found" };
  if (role !== "admin" && !row.memberUseAllowed) return { kind: "forbidden" };
  return { kind: "ok", issuer: mapDynamicCredentialIssuerRow(row) };
};

export const createDynamicCredentialIssuer = async (
  input: {
    organizationId: string;
    actorUserId: string;
    actorLabel: string;
    body: CreateDynamicCredentialIssuerBody;
  },
  dependencies: { query?: Query; idFactory?: typeof makeId } = {}
): Promise<DynamicCredentialIssuerResult> => {
  const query = dependencies.query ?? defaultQuery;
  if (!await isOrganizationAdmin(input.organizationId, input.actorUserId, query)) return { kind: "forbidden" };
  let prepared;
  try {
    prepared = prepareMetadata(input.body);
  } catch (error) {
    return { kind: "invalid", message: error instanceof Error ? error.message : String(error) };
  }
  if (await activeNameExists(input.organizationId, prepared.name, query)) return { kind: "duplicate" };
  const id = (dependencies.idFactory ?? makeId)("dci", 12);
  await query(
    `INSERT INTO dynamic_credential_issuers
     (id, organization_id, name, issuer_type, scope, member_use_allowed,
      fake_env, binding, egress_domains, metadata, created_by_user_id, created_by_label)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8::jsonb, $9::jsonb,
             $10::jsonb, $11, $12)`,
    [
      id, input.organizationId, prepared.name, input.body.issuerType,
      JSON.stringify(prepared.scope), input.body.usePolicy === "organization_members",
      JSON.stringify(prepared.fakeEnv), JSON.stringify(prepared.binding),
      JSON.stringify(prepared.egressDomains), JSON.stringify(prepared.metadata),
      input.actorUserId, input.actorLabel
    ]
  );
  const row = await selectIssuer(input.organizationId, id, query);
  if (!row) throw new Error(`dynamic credential issuer ${id} was not found after creation`);
  return { kind: "ok", issuer: mapDynamicCredentialIssuerRow(row) };
};

export const updateDynamicCredentialIssuer = async (
  input: {
    organizationId: string;
    actorUserId: string;
    issuerId: string;
    body: UpdateDynamicCredentialIssuerBody;
  },
  query: Query = defaultQuery
): Promise<DynamicCredentialIssuerResult> => {
  if (!await isOrganizationAdmin(input.organizationId, input.actorUserId, query)) return { kind: "forbidden" };
  const row = await selectIssuer(input.organizationId, input.issuerId, query);
  if (!row) return { kind: "not_found" };
  const current = mapDynamicCredentialIssuerRow(row);
  let prepared;
  try {
    prepared = prepareMetadata({
      name: input.body.name ?? current.name,
      scope: input.body.scope ?? current.scope,
      fakeEnv: input.body.fakeEnv ?? current.fakeEnv,
      metadata: input.body.metadata ?? current.metadata
    });
  } catch (error) {
    return { kind: "invalid", message: error instanceof Error ? error.message : String(error) };
  }
  if (await activeNameExists(input.organizationId, prepared.name, query, input.issuerId)) return { kind: "duplicate" };
  await query(
    `UPDATE dynamic_credential_issuers
     SET name = $3, scope = $4::jsonb, member_use_allowed = $5,
         fake_env = $6::jsonb, binding = $7::jsonb, egress_domains = $8::jsonb,
         metadata = $9::jsonb, version = version + 1,
         validation_state = 'unvalidated', validation_message = NULL,
         validated_at = NULL, updated_at = now()
     WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [
      input.organizationId, input.issuerId, prepared.name, JSON.stringify(prepared.scope),
      (input.body.usePolicy ?? current.usePolicy) === "organization_members",
      JSON.stringify(prepared.fakeEnv), JSON.stringify(prepared.binding),
      JSON.stringify(prepared.egressDomains), JSON.stringify(prepared.metadata)
    ]
  );
  const updated = await selectIssuer(input.organizationId, input.issuerId, query);
  if (!updated) throw new Error(`dynamic credential issuer ${input.issuerId} was not found after update`);
  return { kind: "ok", issuer: mapDynamicCredentialIssuerRow(updated) };
};

const changeIssuerStatus = async (
  input: { organizationId: string; actorUserId: string; issuerId: string },
  action: "disable" | "enable" | "delete",
  query: Query
): Promise<DynamicCredentialIssuerResult> => {
  if (!await isOrganizationAdmin(input.organizationId, input.actorUserId, query)) return { kind: "forbidden" };
  const row = await selectIssuer(input.organizationId, input.issuerId, query);
  if (!row) return { kind: "not_found" };
  const assignments = action === "disable"
    ? "disabled_at = now()"
    : action === "enable"
      ? "disabled_at = NULL"
      : "deleted_at = now(), disabled_at = COALESCE(disabled_at, now())";
  await query(
    `UPDATE dynamic_credential_issuers SET ${assignments}, updated_at = now()
     WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [input.organizationId, input.issuerId]
  );
  const updated = await selectIssuer(input.organizationId, input.issuerId, query, true);
  if (!updated) throw new Error(`dynamic credential issuer ${input.issuerId} was not found after ${action}`);
  return { kind: "ok", issuer: mapDynamicCredentialIssuerRow(updated) };
};

export const disableDynamicCredentialIssuer = (
  input: { organizationId: string; actorUserId: string; issuerId: string },
  query: Query = defaultQuery
) => changeIssuerStatus(input, "disable", query);

export const enableDynamicCredentialIssuer = (
  input: { organizationId: string; actorUserId: string; issuerId: string },
  query: Query = defaultQuery
) => changeIssuerStatus(input, "enable", query);

export const deleteDynamicCredentialIssuer = (
  input: { organizationId: string; actorUserId: string; issuerId: string },
  query: Query = defaultQuery
) => changeIssuerStatus(input, "delete", query);

const validationStateFor = (
  result: DynamicCredentialValidation | DynamicCredentialIssuance
): Exclude<DynamicCredentialValidationState, "unvalidated"> => result.kind === "ok" ? "valid" : result.kind;

const storeIssuerResult = async (
  organizationId: string,
  issuerId: string,
  result: DynamicCredentialValidation | DynamicCredentialIssuance,
  query: Query,
  issued: boolean
) => {
  const message = result.kind === "ok" ? null : redactText(result.message);
  await query(
    `UPDATE dynamic_credential_issuers
     SET validation_state = $3, validation_message = $4, validated_at = now(),
         last_issued_at = CASE WHEN $5 THEN now() ELSE last_issued_at END,
         updated_at = now()
     WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [organizationId, issuerId, validationStateFor(result), message, issued && result.kind === "ok"]
  );
};

const issuanceFailure = (
  result: Exclude<DynamicCredentialIssuance, { kind: "ok" }>
): DynamicCredentialMaterialResult => {
  if (result.kind === "not_found") return { kind: "issuer_not_found", message: result.message };
  if (result.kind === "forbidden") return { kind: "issuer_forbidden", message: result.message };
  if (result.kind === "invalid") return { kind: "issuer_invalid", message: result.message };
  return { kind: "issuer_unavailable", message: result.message };
};

const issueFromRow = async (
  organizationId: string,
  row: DynamicCredentialIssuerRow,
  options: IssuerOptions
): Promise<DynamicCredentialMaterialResult> => {
  if (row.disabledAt) return { kind: "disabled" };
  const query = options.query ?? defaultQuery;
  const adapter = (options.issuers ?? dynamicCredentialIssuers)[row.issuerType];
  const result = adapter
    ? await adapter.issue(normalizeScope(row.scope))
    : { kind: "unavailable" as const, message: `dynamic credential issuer ${row.issuerType} is unavailable` };
  await storeIssuerResult(organizationId, row.id, result, query, true);
  if (result.kind !== "ok") return issuanceFailure(result);
  const refreshed = await selectIssuer(organizationId, row.id, query);
  if (!refreshed) return { kind: "not_found" };
  return {
    kind: "ok",
    issuer: mapDynamicCredentialIssuerRow(refreshed),
    value: result.value,
    expiresAt: result.expiresAt,
    metadata: redactRecord(result.metadata)
  };
};

export const validateDynamicCredentialIssuer = async (
  input: { organizationId: string; actorUserId: string; issuerId: string },
  options: IssuerOptions = {}
): Promise<DynamicCredentialIssuerResult> => {
  const query = options.query ?? defaultQuery;
  if (!await isOrganizationAdmin(input.organizationId, input.actorUserId, query)) return { kind: "forbidden" };
  const row = await selectIssuer(input.organizationId, input.issuerId, query);
  if (!row) return { kind: "not_found" };
  if (row.disabledAt) return { kind: "disabled" };
  const adapter = (options.issuers ?? dynamicCredentialIssuers)[row.issuerType];
  const result = adapter
    ? await adapter.validate(normalizeScope(row.scope))
    : { kind: "unavailable" as const, message: `dynamic credential issuer ${row.issuerType} is unavailable` };
  await storeIssuerResult(input.organizationId, row.id, result, query, false);
  const updated = await selectIssuer(input.organizationId, row.id, query);
  if (!updated) return { kind: "not_found" };
  return { kind: "ok", issuer: mapDynamicCredentialIssuerRow(updated) };
};

export const issueDynamicCredential = async (
  input: { organizationId: string; actorUserId: string; issuerId: string },
  options: IssuerOptions = {}
): Promise<DynamicCredentialMaterialResult> => {
  const query = options.query ?? defaultQuery;
  const role = await organizationMembershipRole(input.organizationId, input.actorUserId, query);
  if (!role) return { kind: "forbidden" };
  const row = await selectIssuer(input.organizationId, input.issuerId, query);
  if (!row) return { kind: "not_found" };
  if (role !== "admin" && !row.memberUseAllowed) return { kind: "forbidden" };
  return issueFromRow(input.organizationId, row, { ...options, query });
};

export const issueDynamicCredentialForSystem = async (
  input: { organizationId: string; issuerId: string },
  options: IssuerOptions = {}
): Promise<DynamicCredentialMaterialResult> => {
  const query = options.query ?? defaultQuery;
  const row = await selectIssuer(input.organizationId, input.issuerId, query);
  if (!row) return { kind: "not_found" };
  return issueFromRow(input.organizationId, row, { ...options, query });
};
