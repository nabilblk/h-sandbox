import {
  credentialSourceCapabilities,
  templateCredentialSlotFromInput,
  type CreateCredentialSecretBody,
  type CredentialProviderProfileId,
  type CredentialSecretSummary,
  type RotateCredentialSecretBody,
  type UpdateCredentialSecretBody
} from "@harakiri/shared";
import {
  decryptCredentialEnvelope,
  encryptCredentialEnvelope,
  type EnvelopeEncryptedSecret,
  type StoredEncryptedSecret
} from "../credential-envelope.js";
import { makeId } from "../crypto.js";
import { query as defaultQuery } from "../db.js";
import { redactRecord } from "../redaction.js";
import type { Query } from "./query.js";
import { isOrganizationAdmin, organizationMembershipRole } from "./organization-access.js";

type CredentialSecretRow = {
  id: string;
  name: string;
  providerPresetId: CredentialProviderProfileId;
  customProfile: CredentialSecretSummary["customProfile"];
  sourceType: "harakiri_encrypted";
  memberUseAllowed: boolean;
  version: number;
  fakeEnv: Record<string, string>;
  binding: CredentialSecretSummary["binding"];
  egressDomains: string[];
  hasEncryptedSecret: boolean;
  metadata: Record<string, unknown>;
  createdByUserId: string | null;
  createdByLabel: string | null;
  rotatedAt: Date | string | null;
  disabledAt: Date | string | null;
  deletedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  activeSandboxCount: number | string;
  attachmentCount: number | string;
  lastAttachedAt: Date | string | null;
};

export type WorkspaceCredentialSecretInput = CreateCredentialSecretBody;
export type RotateWorkspaceCredentialSecretInput = RotateCredentialSecretBody;
export type UpdateWorkspaceCredentialSecretInput = UpdateCredentialSecretBody;
export type EncryptWorkspaceCredentialSecret = typeof encryptCredentialEnvelope;
export type DecryptWorkspaceCredentialSecret = typeof decryptCredentialEnvelope;

export type CredentialSecretFailureResult =
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "duplicate" }
  | { kind: "disabled" }
  | { kind: "value_required"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "encryption_unavailable"; message: string }
  | { kind: "decryption_unavailable"; message: string };

export type CredentialSecretResult = { kind: "ok"; secret: CredentialSecretSummary } | CredentialSecretFailureResult;
export type CredentialSecretsListResult = { kind: "ok"; secrets: CredentialSecretSummary[] } | CredentialSecretFailureResult;
export type CredentialSecretMaterialFailureResult =
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "disabled" }
  | { kind: "value_required"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "decryption_unavailable"; message: string };
export type CredentialSecretMaterialResult =
  | { kind: "ok"; secret: CredentialSecretSummary; secretValue: string }
  | CredentialSecretMaterialFailureResult;

type CredentialSecretMaterialOptions = {
  query?: Query;
  decryptSecret?: DecryptWorkspaceCredentialSecret;
};

export const credentialSecretSelect = `
  SELECT id,
         name,
         provider_preset_id AS "providerPresetId",
         custom_profile AS "customProfile",
         source_type AS "sourceType",
         member_use_allowed AS "memberUseAllowed",
         version,
         fake_env AS "fakeEnv",
         binding,
         egress_domains AS "egressDomains",
         (secret_ciphertext IS NOT NULL AND secret_iv IS NOT NULL AND secret_tag IS NOT NULL) AS "hasEncryptedSecret",
         metadata,
         created_by_user_id::text AS "createdByUserId",
         created_by_label AS "createdByLabel",
         rotated_at AS "rotatedAt",
         disabled_at AS "disabledAt",
         deleted_at AS "deletedAt",
         created_at AS "createdAt",
         updated_at AS "updatedAt",
         (SELECT COUNT(DISTINCT attachment.sandbox_id)::int
            FROM sandbox_credential_attachments attachment
            JOIN sandboxes sandbox ON sandbox.id = attachment.sandbox_id
           WHERE attachment.organization_id = workspace_secret.organization_id
             AND attachment.source_type = 'harakiri_encrypted'
             AND attachment.source_ref = workspace_secret.id
             AND attachment.detached_at IS NULL
             AND sandbox.status IN ('running', 'idle')) AS "activeSandboxCount",
         (SELECT COUNT(*)::int
            FROM sandbox_credential_attachments attachment
           WHERE attachment.organization_id = workspace_secret.organization_id
             AND attachment.source_type = 'harakiri_encrypted'
             AND attachment.source_ref = workspace_secret.id) AS "attachmentCount",
         (SELECT MAX(COALESCE(attachment.injected_at, attachment.created_at))
            FROM sandbox_credential_attachments attachment
           WHERE attachment.organization_id = workspace_secret.organization_id
             AND attachment.source_type = 'harakiri_encrypted'
             AND attachment.source_ref = workspace_secret.id) AS "lastAttachedAt"
  FROM workspace_credential_secrets workspace_secret
`;

const credentialSecretMaterialSelect = `
  SELECT id,
         name,
         provider_preset_id AS "providerPresetId",
         custom_profile AS "customProfile",
         source_type AS "sourceType",
         member_use_allowed AS "memberUseAllowed",
         version,
         fake_env AS "fakeEnv",
         binding,
         egress_domains AS "egressDomains",
         (secret_ciphertext IS NOT NULL AND secret_iv IS NOT NULL AND secret_tag IS NOT NULL) AS "hasEncryptedSecret",
         metadata,
         created_by_user_id::text AS "createdByUserId",
         created_by_label AS "createdByLabel",
         rotated_at AS "rotatedAt",
         disabled_at AS "disabledAt",
         deleted_at AS "deletedAt",
         created_at AS "createdAt",
         updated_at AS "updatedAt",
         0::int AS "activeSandboxCount",
         0::int AS "attachmentCount",
         NULL::timestamptz AS "lastAttachedAt",
         secret_ciphertext AS "secretCiphertext",
         secret_iv AS "secretIv",
         secret_tag AS "secretTag",
         encryption_scheme AS "encryptionScheme",
         key_id AS "keyId",
         wrapped_dek_ciphertext AS "wrappedDekCiphertext",
         wrapped_dek_iv AS "wrappedDekIv",
         wrapped_dek_tag AS "wrappedDekTag"
  FROM workspace_credential_secrets
`;

const toIso = (value: Date | string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const toIsoOrNull = (value: Date | string | null | undefined) => value ? toIso(value) : null;

const statusFor = (row: CredentialSecretRow) => {
  if (row.deletedAt) return "deleted";
  if (row.disabledAt) return "disabled";
  return "active";
};

export const mapCredentialSecretRow = (row: CredentialSecretRow): CredentialSecretSummary => ({
  id: row.id,
  name: row.name,
  providerPresetId: row.providerPresetId,
  customProfile: row.customProfile ?? null,
  sourceType: "harakiri_encrypted",
  status: statusFor(row),
  usePolicy: row.memberUseAllowed ? "organization_members" : "admins_only",
  version: row.version,
  fakeEnv: row.fakeEnv ?? {},
  binding: row.binding,
  egressDomains: row.egressDomains ?? [],
  hasEncryptedSecret: row.hasEncryptedSecret,
  metadata: redactRecord(row.metadata ?? {}),
  createdByUserId: row.createdByUserId,
  createdByLabel: row.createdByLabel,
  rotatedAt: toIsoOrNull(row.rotatedAt),
  disabledAt: toIsoOrNull(row.disabledAt),
  deletedAt: toIsoOrNull(row.deletedAt),
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
  usage: {
    activeSandboxCount: Number(row.activeSandboxCount ?? 0),
    attachmentCount: Number(row.attachmentCount ?? 0),
    lastAttachedAt: toIsoOrNull(row.lastAttachedAt)
  },
  capabilities: credentialSourceCapabilities.harakiri_encrypted
});

const encryptValue = (value: string, encryptSecret: EncryptWorkspaceCredentialSecret) => {
  if (!value) return { kind: "value_required" as const, message: "credential secret value is required" };
  try {
    return { kind: "ok" as const, encrypted: encryptSecret(value) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { kind: "encryption_unavailable" as const, message };
  }
};

const envNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

const mergeFakeEnv = (defaults: Record<string, string>, overrides: Record<string, string> | undefined, secretValue: string) => {
  const fakeEnv = { ...defaults, ...(overrides ?? {}) };
  for (const [key, value] of Object.entries(fakeEnv)) {
    if (!envNamePattern.test(key)) throw new Error(`invalid fake env key "${key}"`);
    if (value === secretValue) throw new Error(`fake env value for ${key} must not equal the real credential`);
  }
  return fakeEnv;
};

const prepareSecretMetadata = (input: WorkspaceCredentialSecretInput) => {
  const name = input.name.trim();
  if (!name) throw new Error("credential secret name is required");
  const slot = templateCredentialSlotFromInput({
    providerPresetId: input.providerPresetId,
    customProfile: input.customProfile
  });
  return {
    name,
    customProfile: slot.customProfile,
    fakeEnv: mergeFakeEnv(slot.fakeEnv, input.fakeEnv, input.value),
    binding: slot.binding,
    egressDomains: slot.egressDomains,
    metadata: redactRecord(input.metadata ?? {})
  };
};

type PreparedCredentialSecretMetadata = ReturnType<typeof prepareSecretMetadata>;

const selectSecretById = async (organizationId: string, secretId: string, query: Query) => {
  const result = await query<CredentialSecretRow>(
    `${credentialSecretSelect}
     WHERE organization_id = $1 AND id = $2`,
    [organizationId, secretId]
  );
  return result.rows[0] ? mapCredentialSecretRow(result.rows[0]) : null;
};

type CredentialSecretMaterialRow = CredentialSecretRow & StoredEncryptedSecret & {
  secretCiphertext: string | null;
  secretIv: string | null;
  secretTag: string | null;
};

const decryptValue = (row: CredentialSecretMaterialRow, decryptSecret: DecryptWorkspaceCredentialSecret) => {
  if (!row.secretCiphertext || !row.secretIv || !row.secretTag) {
    return { kind: "value_required" as const, message: "credential secret has no encrypted value" };
  }
  try {
    return {
      kind: "ok" as const,
      value: decryptSecret({
        secretCiphertext: row.secretCiphertext,
        secretIv: row.secretIv,
        secretTag: row.secretTag,
        encryptionScheme: row.encryptionScheme,
        keyId: row.keyId,
        wrappedDekCiphertext: row.wrappedDekCiphertext,
        wrappedDekIv: row.wrappedDekIv,
        wrappedDekTag: row.wrappedDekTag
      })
    };
  } catch (error) {
    return { kind: "decryption_unavailable" as const, message: error instanceof Error ? error.message : String(error) };
  }
};

const readCredentialSecretMaterial = async (
  input: { organizationId: string; secretId: string },
  options: CredentialSecretMaterialOptions = {},
  canUse: (row: CredentialSecretMaterialRow) => boolean = () => true
): Promise<CredentialSecretMaterialResult> => {
  const query = options.query ?? defaultQuery;
  const result = await query<CredentialSecretMaterialRow>(
    `${credentialSecretMaterialSelect}
     WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [input.organizationId, input.secretId]
  );
  const row = result.rows[0];
  if (!row) return { kind: "not_found" };
  if (!canUse(row)) return { kind: "forbidden" };
  if (row.disabledAt) return { kind: "disabled" };
  const decrypted = decryptValue(row, options.decryptSecret ?? decryptCredentialEnvelope);
  if (decrypted.kind !== "ok") return decrypted;
  return { kind: "ok", secret: mapCredentialSecretRow(row), secretValue: decrypted.value };
};

export const resolveCredentialSecretMaterialForSystem = (
  input: { organizationId: string; secretId: string },
  options: CredentialSecretMaterialOptions = {}
) => readCredentialSecretMaterial(input, options);

export const resolveCredentialSecretMaterial = async (
  input: { organizationId: string; actorUserId: string; secretId: string },
  options: CredentialSecretMaterialOptions = {}
): Promise<CredentialSecretMaterialResult> => {
  const query = options.query ?? defaultQuery;
  const role = await organizationMembershipRole(input.organizationId, input.actorUserId, query);
  if (!role) return { kind: "forbidden" };
  return readCredentialSecretMaterial(input, { ...options, query }, (row) => role === "admin" || row.memberUseAllowed);
};

const activeNameExists = async (organizationId: string, name: string, query: Query) => {
  const result = await query<{ id: string }>(
    `SELECT id FROM workspace_credential_secrets
     WHERE organization_id = $1 AND lower(name) = lower($2) AND deleted_at IS NULL
     LIMIT 1`,
    [organizationId, name]
  );
  return Boolean(result.rowCount);
};

const insertSecret = async (
  input: {
    organizationId: string;
    actorUserId: string;
    actorLabel: string;
    body: WorkspaceCredentialSecretInput;
    encrypted: EnvelopeEncryptedSecret;
    metadata: PreparedCredentialSecretMetadata;
  },
  query: Query,
  idFactory: typeof makeId
) => {
  const id = idFactory("vlt", 16);
  const inserted = await query<{ id: string }>(
    `INSERT INTO workspace_credential_secrets
     (id, organization_id, name, provider_preset_id, source_type, secret_ciphertext,
      secret_iv, secret_tag, encryption_scheme, key_id, wrapped_dek_ciphertext,
      wrapped_dek_iv, wrapped_dek_tag, custom_profile, fake_env, binding, egress_domains, metadata,
      created_by_user_id, created_by_label, member_use_allowed)
     VALUES ($1, $2, $3, $4, 'harakiri_encrypted', $5, $6, $7, $8, $9, $10,
             $11, $12, $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb, $18, $19, $20)
     RETURNING id`,
    [
      id,
      input.organizationId,
      input.metadata.name,
      input.body.providerPresetId,
      input.encrypted.secretCiphertext,
      input.encrypted.secretIv,
      input.encrypted.secretTag,
      input.encrypted.encryptionScheme,
      input.encrypted.keyId,
      input.encrypted.wrappedDekCiphertext,
      input.encrypted.wrappedDekIv,
      input.encrypted.wrappedDekTag,
      JSON.stringify(input.metadata.customProfile),
      JSON.stringify(input.metadata.fakeEnv),
      JSON.stringify(input.metadata.binding),
      JSON.stringify(input.metadata.egressDomains),
      JSON.stringify(input.metadata.metadata),
      input.actorUserId,
      input.actorLabel,
      input.body.usePolicy === "organization_members"
    ]
  );
  return inserted.rows[0].id;
};

export const listCredentialSecrets = async (
  input: { organizationId: string; actorUserId: string; includeDeleted?: boolean },
  query: Query = defaultQuery
): Promise<CredentialSecretsListResult> => {
  const role = await organizationMembershipRole(input.organizationId, input.actorUserId, query);
  if (!role) return { kind: "forbidden" };
  const where = role === "admin" && input.includeDeleted
    ? "WHERE organization_id = $1"
    : `WHERE organization_id = $1 AND deleted_at IS NULL${role === "admin" ? "" : " AND member_use_allowed = true"}`;
  const result = await query<CredentialSecretRow>(`${credentialSecretSelect} ${where} ORDER BY updated_at DESC, name ASC`, [
    input.organizationId
  ]);
  return { kind: "ok", secrets: result.rows.map(mapCredentialSecretRow) };
};

export const getCredentialSecret = async (
  input: { organizationId: string; actorUserId: string; secretId: string },
  query: Query = defaultQuery
): Promise<CredentialSecretResult> => {
  const role = await organizationMembershipRole(input.organizationId, input.actorUserId, query);
  if (!role) return { kind: "forbidden" };
  const secret = await selectSecretById(input.organizationId, input.secretId, query);
  if (secret && role !== "admin" && secret.usePolicy !== "organization_members") return { kind: "forbidden" };
  return secret ? { kind: "ok", secret } : { kind: "not_found" };
};

export const updateCredentialSecret = async (
  input: { organizationId: string; actorUserId: string; secretId: string; body: UpdateWorkspaceCredentialSecretInput },
  query: Query = defaultQuery
): Promise<CredentialSecretResult> => {
  if (!await isOrganizationAdmin(input.organizationId, input.actorUserId, query)) return { kind: "forbidden" };
  const result = await query<{ id: string }>(
    `UPDATE workspace_credential_secrets
     SET member_use_allowed = $3, updated_at = now()
     WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [input.organizationId, input.secretId, input.body.usePolicy === "organization_members"]
  );
  if (!result.rowCount) return { kind: "not_found" };
  const secret = await selectSecretById(input.organizationId, input.secretId, query);
  return secret ? { kind: "ok", secret } : { kind: "not_found" };
};

export const createCredentialSecret = async (
  input: { organizationId: string; actorUserId: string; actorLabel: string; body: WorkspaceCredentialSecretInput },
  options: { query?: Query; encryptSecret?: EncryptWorkspaceCredentialSecret; idFactory?: typeof makeId } = {}
): Promise<CredentialSecretResult> => {
  const query = options.query ?? defaultQuery;
  if (!await isOrganizationAdmin(input.organizationId, input.actorUserId, query)) return { kind: "forbidden" };
  let id: string;
  try {
    const metadata = prepareSecretMetadata(input.body);
    if (await activeNameExists(input.organizationId, metadata.name, query)) return { kind: "duplicate" };
    const encrypted = encryptValue(input.body.value, options.encryptSecret ?? encryptCredentialEnvelope);
    if (encrypted.kind !== "ok") return encrypted;
    id = await insertSecret({ ...input, encrypted: encrypted.encrypted, metadata }, query, options.idFactory ?? makeId);
  } catch (error) {
    return { kind: "invalid", message: error instanceof Error ? error.message : String(error) };
  }
  const secret = await selectSecretById(input.organizationId, id, query);
  if (!secret) return { kind: "not_found" };
  return { kind: "ok", secret };
};

export const rotateCredentialSecret = async (
  input: { organizationId: string; actorUserId: string; secretId: string; body: RotateWorkspaceCredentialSecretInput },
  options: { query?: Query; encryptSecret?: EncryptWorkspaceCredentialSecret } = {}
): Promise<CredentialSecretResult> => {
  const query = options.query ?? defaultQuery;
  if (!await isOrganizationAdmin(input.organizationId, input.actorUserId, query)) return { kind: "forbidden" };
  const encrypted = encryptValue(input.body.value, options.encryptSecret ?? encryptCredentialEnvelope);
  if (encrypted.kind !== "ok") return encrypted;
  const result = await query<{ id: string }>(
    `UPDATE workspace_credential_secrets
     SET secret_ciphertext = $3,
         secret_iv = $4,
         secret_tag = $5,
         encryption_scheme = $6,
         key_id = $7,
         wrapped_dek_ciphertext = $8,
         wrapped_dek_iv = $9,
         wrapped_dek_tag = $10,
         version = version + 1,
         rotated_at = now(),
         updated_at = now()
     WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [
      input.organizationId,
      input.secretId,
      encrypted.encrypted.secretCiphertext,
      encrypted.encrypted.secretIv,
      encrypted.encrypted.secretTag,
      encrypted.encrypted.encryptionScheme,
      encrypted.encrypted.keyId,
      encrypted.encrypted.wrappedDekCiphertext,
      encrypted.encrypted.wrappedDekIv,
      encrypted.encrypted.wrappedDekTag
    ]
  );
  if (!result.rowCount) return { kind: "not_found" };
  const secret = await selectSecretById(input.organizationId, input.secretId, query);
  return secret ? { kind: "ok", secret } : { kind: "not_found" };
};

const updateSecretStatus = async (
  input: { organizationId: string; actorUserId: string; secretId: string },
  query: Query,
  sql: string
): Promise<CredentialSecretResult> => {
  if (!await isOrganizationAdmin(input.organizationId, input.actorUserId, query)) return { kind: "forbidden" };
  const result = await query<{ id: string }>(
    sql,
    [input.organizationId, input.secretId]
  );
  if (!result.rowCount) return { kind: "not_found" };
  const secret = await selectSecretById(input.organizationId, input.secretId, query);
  return secret ? { kind: "ok", secret } : { kind: "not_found" };
};

export const disableCredentialSecret = async (
  input: { organizationId: string; actorUserId: string; secretId: string },
  query: Query = defaultQuery
) => updateSecretStatus(
  input,
  query,
  `UPDATE workspace_credential_secrets
   SET disabled_at = COALESCE(disabled_at, now()), updated_at = now()
   WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL
   RETURNING id`
);

export const enableCredentialSecret = async (
  input: { organizationId: string; actorUserId: string; secretId: string },
  query: Query = defaultQuery
) => updateSecretStatus(
  input,
  query,
  `UPDATE workspace_credential_secrets
   SET disabled_at = NULL, updated_at = now()
   WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL
   RETURNING id`
);

export const deleteCredentialSecret = async (
  input: { organizationId: string; actorUserId: string; secretId: string },
  query: Query = defaultQuery
): Promise<CredentialSecretResult> => {
  if (!await isOrganizationAdmin(input.organizationId, input.actorUserId, query)) return { kind: "forbidden" };
  const result = await query<{ id: string }>(
    `UPDATE workspace_credential_secrets
     SET secret_ciphertext = NULL,
         secret_iv = NULL,
         secret_tag = NULL,
         key_id = NULL,
         wrapped_dek_ciphertext = NULL,
         wrapped_dek_iv = NULL,
         wrapped_dek_tag = NULL,
         disabled_at = COALESCE(disabled_at, now()),
         deleted_at = COALESCE(deleted_at, now()),
         updated_at = now()
     WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [input.organizationId, input.secretId]
  );
  if (!result.rowCount) return { kind: "not_found" };
  const secret = await selectSecretById(input.organizationId, input.secretId, query);
  return secret ? { kind: "ok", secret } : { kind: "not_found" };
};
