import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { config } from "./config.js";
import {
  decryptSecretBox,
  decryptSecretBytes,
  encryptSecretBytes,
  secretBoxKey,
  type EncryptedSecret
} from "./secret-box.js";

const ENCRYPTION_SCHEME = "envelope-v1" as const;
const PAYLOAD_AAD = Buffer.from("harakiri:credential-vault:payload:v1", "utf8");

export type EnvelopeKey = { id: string; value: string };

export type EnvelopeKeyProvider = {
  activeKey(): EnvelopeKey;
  keyById(id: string): EnvelopeKey;
};

export type EnvelopeEncryptedSecret = EncryptedSecret & {
  encryptionScheme: typeof ENCRYPTION_SCHEME;
  keyId: string;
  wrappedDekCiphertext: string;
  wrappedDekIv: string;
  wrappedDekTag: string;
};

export type StoredEncryptedSecret = EncryptedSecret & {
  encryptionScheme?: "direct-v1" | typeof ENCRYPTION_SCHEME | null;
  keyId?: string | null;
  wrappedDekCiphertext?: string | null;
  wrappedDekIv?: string | null;
  wrappedDekTag?: string | null;
};

type KeyringDocument = {
  activeKeyId: string;
  keys: Record<string, string>;
};

const requireKey = (id: string, value: unknown): EnvelopeKey => {
  if (!id.trim()) throw new Error("credential vault key id is required");
  if (typeof value !== "string" || !value.trim()) throw new Error(`credential vault key ${id} is unavailable`);
  return { id: id.trim(), value: value.trim() };
};

const readKeyring = (path: string): KeyringDocument => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("credential vault keyring file is unreadable or invalid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("credential vault keyring must be an object");
  }
  const document = parsed as Partial<KeyringDocument>;
  if (typeof document.activeKeyId !== "string" || !document.keys || typeof document.keys !== "object") {
    throw new Error("credential vault keyring requires activeKeyId and keys");
  }
  return { activeKeyId: document.activeKeyId, keys: document.keys };
};

const fileKeyProvider = (path: string): EnvelopeKeyProvider => ({
  activeKey: () => {
    const keyring = readKeyring(path);
    return requireKey(keyring.activeKeyId, keyring.keys[keyring.activeKeyId]);
  },
  keyById: (id) => requireKey(id, readKeyring(path).keys[id])
});

const environmentKeyProvider = (): EnvelopeKeyProvider => ({
  activeKey: () => requireKey(config.credentialVaultKeyId, config.credentialVaultKey),
  keyById: (id) => {
    if (id !== config.credentialVaultKeyId) throw new Error(`credential vault key ${id} is unavailable`);
    return requireKey(id, config.credentialVaultKey);
  }
});

export const configuredEnvelopeKeyProvider = (): EnvelopeKeyProvider =>
  config.credentialVaultKeyringFile
    ? fileKeyProvider(config.credentialVaultKeyringFile)
    : environmentKeyProvider();

const wrappingAad = (keyId: string) => Buffer.from(`harakiri:credential-vault:dek:${keyId}:v1`, "utf8");

const wrappedDek = (encrypted: EnvelopeEncryptedSecret): EncryptedSecret => ({
  secretCiphertext: encrypted.wrappedDekCiphertext,
  secretIv: encrypted.wrappedDekIv,
  secretTag: encrypted.wrappedDekTag
});

const requireEnvelope = (encrypted: StoredEncryptedSecret): EnvelopeEncryptedSecret => {
  if (!encrypted.keyId || !encrypted.wrappedDekCiphertext || !encrypted.wrappedDekIv || !encrypted.wrappedDekTag) {
    throw new Error("credential vault envelope metadata is incomplete");
  }
  return { ...encrypted, encryptionScheme: ENCRYPTION_SCHEME } as EnvelopeEncryptedSecret;
};

export const encryptCredentialEnvelope = (
  secret: string,
  keys: EnvelopeKeyProvider = configuredEnvelopeKeyProvider()
): EnvelopeEncryptedSecret => {
  const activeKey = keys.activeKey();
  const dek = randomBytes(32);
  try {
    const payload = encryptSecretBytes(Buffer.from(secret, "utf8"), dek, PAYLOAD_AAD);
    const wrapped = encryptSecretBytes(dek, secretBoxKey(activeKey.value), wrappingAad(activeKey.id));
    return {
      ...payload,
      encryptionScheme: ENCRYPTION_SCHEME,
      keyId: activeKey.id,
      wrappedDekCiphertext: wrapped.secretCiphertext,
      wrappedDekIv: wrapped.secretIv,
      wrappedDekTag: wrapped.secretTag
    };
  } finally {
    dek.fill(0);
  }
};

export const decryptCredentialEnvelope = (
  encrypted: StoredEncryptedSecret,
  keys: EnvelopeKeyProvider = configuredEnvelopeKeyProvider()
) => {
  if (!encrypted.encryptionScheme || encrypted.encryptionScheme === "direct-v1") {
    return decryptSecretBox(encrypted, config.controlPlaneSecretKey);
  }
  if (encrypted.encryptionScheme !== ENCRYPTION_SCHEME) {
    throw new Error(`unsupported credential vault encryption scheme: ${encrypted.encryptionScheme}`);
  }
  const envelope = requireEnvelope(encrypted);
  const key = keys.keyById(envelope.keyId);
  const dek = decryptSecretBytes(wrappedDek(envelope), secretBoxKey(key.value), wrappingAad(key.id));
  try {
    return decryptSecretBytes(envelope, dek, PAYLOAD_AAD).toString("utf8");
  } finally {
    dek.fill(0);
  }
};
