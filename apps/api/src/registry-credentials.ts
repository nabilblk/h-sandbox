import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config } from "./config.js";
import { withClient } from "./db.js";
import { parseImageReference } from "./registry.js";
import { redactRecord } from "./redaction.js";

export type RegistryCredentialPurpose = "pull" | "push" | "push_pull";

export type EncryptedRegistrySecret = {
  secretCiphertext: string;
  secretIv: string;
  secretTag: string;
};

export type RegistryCredentialRow = {
  id: string;
  organizationId: string;
  name: string;
  registryHost: string;
  username: string | null;
  secretRef: string | null;
  purpose: RegistryCredentialPurpose;
  repositoryPrefix: string;
  pullSecretRef: string | null;
  pushSecretRef: string | null;
  secretCiphertext: string | null;
  metadata: Record<string, unknown>;
  lastUsedAt: Date | string | null;
  revokedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type RegistryCredentialRef = {
  id: string;
  purpose: RegistryCredentialPurpose;
  repositoryPrefix: string;
  username?: string | null;
  secretRef: string | null;
  pullSecretRef: string | null;
  pushSecretRef: string | null;
  secretCiphertext?: string | null;
  secretIv?: string | null;
  secretTag?: string | null;
};

export type RegistryImageAuth = {
  username: string;
  password: string;
};

export const normalizeRegistryHost = (value: string) =>
  value
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/g, "")
    .toLowerCase();

const registryCredentialKey = (key: string) => {
  const raw = key.trim();
  if (!raw) throw new Error("TEMPLATE_REGISTRY_CREDENTIAL_KEY is required to store encrypted registry secrets");
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;
  return createHash("sha256").update(raw, "utf8").digest();
};

export const encryptRegistrySecret = (secret: string, key = config.templateRegistryCredentialKey): EncryptedRegistrySecret => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", registryCredentialKey(key), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    secretCiphertext: ciphertext.toString("base64"),
    secretIv: iv.toString("base64"),
    secretTag: cipher.getAuthTag().toString("base64")
  };
};

export const decryptRegistrySecret = (encrypted: EncryptedRegistrySecret, key = config.templateRegistryCredentialKey) => {
  const decipher = createDecipheriv("aes-256-gcm", registryCredentialKey(key), Buffer.from(encrypted.secretIv, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.secretTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.secretCiphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
};

export const sanitizedRegistryCredential = (row: RegistryCredentialRow) => ({
  id: row.id,
  name: row.name,
  registryHost: row.registryHost,
  username: row.username,
  secretRef: row.secretRef,
  purpose: row.purpose,
  repositoryPrefix: row.repositoryPrefix,
  pullSecretRef: row.pullSecretRef,
  pushSecretRef: row.pushSecretRef,
  hasEncryptedSecret: Boolean(row.secretCiphertext),
  metadata: redactRecord(row.metadata ?? {}),
  lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt).toISOString() : null,
  revokedAt: row.revokedAt ? new Date(row.revokedAt).toISOString() : null,
  createdAt: new Date(row.createdAt).toISOString(),
  updatedAt: new Date(row.updatedAt).toISOString()
});

export const registryCredentialForImage = async (
  organizationId: string,
  imageRef: string,
  purpose: "pull" | "push"
): Promise<RegistryCredentialRef | null> => {
  let image;
  try {
    image = parseImageReference(imageRef);
  } catch {
    return null;
  }
  const registryHost = normalizeRegistryHost(image.displayRegistry);
  return withClient(async (client) => {
    const result = await client.query<RegistryCredentialRef>(
      `SELECT id, purpose, repository_prefix AS "repositoryPrefix",
              username, secret_ref AS "secretRef",
              pull_secret_ref AS "pullSecretRef",
              push_secret_ref AS "pushSecretRef",
              secret_ciphertext AS "secretCiphertext",
              secret_iv AS "secretIv",
              secret_tag AS "secretTag"
       FROM template_registry_credentials
       WHERE organization_id = $1
         AND revoked_at IS NULL
         AND registry_host = $2
         AND purpose = ANY($3::text[])
         AND (repository_prefix = '' OR $4 = repository_prefix OR $4 LIKE repository_prefix || '/%')
       ORDER BY length(repository_prefix) DESC, updated_at DESC
       LIMIT 1`,
      [organizationId, registryHost, purpose === "pull" ? ["pull", "push_pull"] : ["push", "push_pull"], image.repository]
    );
    const credential = result.rows[0] ?? null;
    if (credential) {
      await client.query("UPDATE template_registry_credentials SET last_used_at = now() WHERE id = $1", [credential.id]);
    }
    return credential;
  });
};

export const registryImageAuthForImage = async (
  organizationId: string,
  imageRef: string,
  purpose: "pull" | "push" = "pull"
): Promise<{ credentialId: string; auth: RegistryImageAuth | null } | null> => {
  const credential = await registryCredentialForImage(organizationId, imageRef, purpose);
  if (!credential) return null;
  if (!credential.username || !credential.secretCiphertext || !credential.secretIv || !credential.secretTag) {
    return { credentialId: credential.id, auth: null };
  }
  return {
    credentialId: credential.id,
    auth: {
      username: credential.username,
      password: decryptRegistrySecret({
        secretCiphertext: credential.secretCiphertext,
        secretIv: credential.secretIv,
        secretTag: credential.secretTag
      })
    }
  };
};
