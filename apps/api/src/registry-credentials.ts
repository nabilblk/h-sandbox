import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config } from "./config.js";
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
