import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config } from "./config.js";

export type EncryptedSecret = {
  secretCiphertext: string;
  secretIv: string;
  secretTag: string;
};

export const hasSecretBoxKey = (key = config.controlPlaneSecretKey) => Boolean(key.trim());

const secretBoxKey = (key: string) => {
  const raw = key.trim();
  if (!raw) throw new Error("CONTROL_PLANE_SECRET_KEY is required to store encrypted control-plane secrets");
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;
  return createHash("sha256").update(raw, "utf8").digest();
};

export const encryptSecretBox = (secret: string, key = config.controlPlaneSecretKey): EncryptedSecret => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretBoxKey(key), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    secretCiphertext: ciphertext.toString("base64"),
    secretIv: iv.toString("base64"),
    secretTag: cipher.getAuthTag().toString("base64")
  };
};

export const decryptSecretBox = (encrypted: EncryptedSecret, key = config.controlPlaneSecretKey) => {
  const decipher = createDecipheriv("aes-256-gcm", secretBoxKey(key), Buffer.from(encrypted.secretIv, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.secretTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.secretCiphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
};
