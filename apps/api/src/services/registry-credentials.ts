import {
  encryptRegistrySecret,
  normalizeRegistryHost,
  sanitizedRegistryCredential,
  type EncryptedRegistrySecret,
  type RegistryCredentialRow
} from "../registry-credentials.js";
import { query as defaultQuery } from "../db.js";
import { redactRecord } from "../redaction.js";
import type { Query } from "./query.js";

export type RegistryCredentialInput = {
  name: string;
  registryHost: string;
  username?: string;
  secretRef?: string;
  secret?: string;
  purpose: "pull" | "push" | "push_pull";
  repositoryPrefix: string;
  pullSecretRef?: string;
  pushSecretRef?: string;
  metadata: Record<string, unknown>;
};

export type EncryptRegistrySecret = typeof encryptRegistrySecret;

export class RegistryCredentialEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryCredentialEncryptionError";
  }
}

export const registryCredentialSelect = `
  SELECT id, organization_id AS "organizationId", name, registry_host AS "registryHost",
         username, secret_ref AS "secretRef", purpose, repository_prefix AS "repositoryPrefix",
         pull_secret_ref AS "pullSecretRef", push_secret_ref AS "pushSecretRef",
         secret_ciphertext AS "secretCiphertext", metadata,
         last_used_at AS "lastUsedAt", revoked_at AS "revokedAt",
         created_at AS "createdAt", updated_at AS "updatedAt"
  FROM template_registry_credentials
`;

export const listRegistryCredentials = async (
  input: { organizationId: string; includeRevoked?: boolean },
  query: Query = defaultQuery
) => {
  const where = input.includeRevoked ? "WHERE organization_id = $1" : "WHERE organization_id = $1 AND revoked_at IS NULL";
  const result = await query<RegistryCredentialRow>(`${registryCredentialSelect} ${where} ORDER BY registry_host ASC, name ASC`, [
    input.organizationId
  ]);
  return result.rows.map(sanitizedRegistryCredential);
};

export const upsertRegistryCredential = async (
  input: { organizationId: string; credential: RegistryCredentialInput },
  options: { query?: Query; encryptSecret?: EncryptRegistrySecret } = {}
) => {
  const query = options.query ?? defaultQuery;
  const body = input.credential;
  const registryHost = normalizeRegistryHost(body.registryHost);
  let encrypted: EncryptedRegistrySecret | null = null;
  if (body.secret) {
    try {
      encrypted = (options.encryptSecret ?? encryptRegistrySecret)(body.secret);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new RegistryCredentialEncryptionError(message);
    }
  }

  const upserted = await query<{ id: string }>(
    `INSERT INTO template_registry_credentials
     (organization_id, name, registry_host, username, secret_ref, purpose,
      repository_prefix, pull_secret_ref, push_secret_ref, secret_ciphertext,
      secret_iv, secret_tag, metadata, revoked_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NULL)
     ON CONFLICT (organization_id, name) DO UPDATE
       SET registry_host = EXCLUDED.registry_host,
           username = EXCLUDED.username,
           secret_ref = EXCLUDED.secret_ref,
           purpose = EXCLUDED.purpose,
           repository_prefix = EXCLUDED.repository_prefix,
           pull_secret_ref = EXCLUDED.pull_secret_ref,
           push_secret_ref = EXCLUDED.push_secret_ref,
           secret_ciphertext = COALESCE(EXCLUDED.secret_ciphertext, template_registry_credentials.secret_ciphertext),
           secret_iv = COALESCE(EXCLUDED.secret_iv, template_registry_credentials.secret_iv),
           secret_tag = COALESCE(EXCLUDED.secret_tag, template_registry_credentials.secret_tag),
           metadata = EXCLUDED.metadata,
           revoked_at = NULL,
           updated_at = now()
     RETURNING id`,
    [
      input.organizationId,
      body.name,
      registryHost,
      body.username ?? null,
      body.secretRef ?? null,
      body.purpose,
      body.repositoryPrefix,
      body.pullSecretRef ?? null,
      body.pushSecretRef ?? null,
      encrypted?.secretCiphertext ?? null,
      encrypted?.secretIv ?? null,
      encrypted?.secretTag ?? null,
      redactRecord(body.metadata)
    ]
  );
  const result = await query<RegistryCredentialRow>(`${registryCredentialSelect} WHERE id = $1 AND organization_id = $2`, [
    upserted.rows[0].id,
    input.organizationId
  ]);
  return sanitizedRegistryCredential(result.rows[0]);
};

export const revokeRegistryCredential = async (
  input: { organizationId: string; credentialId: string },
  query: Query = defaultQuery
) => {
  const revoked = await query<{ id: string }>(
    `UPDATE template_registry_credentials
     SET revoked_at = COALESCE(revoked_at, now()), updated_at = now()
     WHERE id = $1 AND organization_id = $2
     RETURNING id`,
    [input.credentialId, input.organizationId]
  );
  if (!revoked.rowCount) return null;
  const result = await query<RegistryCredentialRow>(`${registryCredentialSelect} WHERE id = $1 AND organization_id = $2`, [
    input.credentialId,
    input.organizationId
  ]);
  return sanitizedRegistryCredential(result.rows[0]);
};
