import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptCredentialEnvelope,
  encryptCredentialEnvelope,
  type EnvelopeKeyProvider
} from "./credential-envelope.js";

const keyV1 = Buffer.alloc(32, 1).toString("base64");
const keyV2 = Buffer.alloc(32, 2).toString("base64");

const keyProvider = (activeId = "key-v1"): EnvelopeKeyProvider => {
  const keys: Record<string, string> = { "key-v1": keyV1, "key-v2": keyV2 };
  return {
    activeKey: () => ({ id: activeId, value: keys[activeId] }),
    keyById: (id) => {
      if (!keys[id]) throw new Error(`missing key ${id}`);
      return { id, value: keys[id] };
    }
  };
};

test("credential envelope encrypts values with a per-secret wrapped key", () => {
  const encrypted = encryptCredentialEnvelope("workspace-secret", keyProvider());

  assert.equal(encrypted.encryptionScheme, "envelope-v1");
  assert.equal(encrypted.keyId, "key-v1");
  assert.notEqual(encrypted.secretCiphertext, "workspace-secret");
  assert.notEqual(encrypted.wrappedDekCiphertext, encrypted.secretCiphertext);
  assert.equal(decryptCredentialEnvelope(encrypted, keyProvider()), "workspace-secret");
});

test("credential envelope keeps old values readable during key rotation", () => {
  const encrypted = encryptCredentialEnvelope("workspace-secret", keyProvider("key-v1"));

  assert.equal(decryptCredentialEnvelope(encrypted, keyProvider("key-v2")), "workspace-secret");
});

test("credential envelope fails loudly for a missing or invalid wrapping key", () => {
  const encrypted = encryptCredentialEnvelope("workspace-secret", keyProvider());
  const missing: EnvelopeKeyProvider = {
    activeKey: () => ({ id: "key-v2", value: keyV2 }),
    keyById: () => {
      throw new Error("key unavailable");
    }
  };

  assert.throws(() => decryptCredentialEnvelope(encrypted, missing), /key unavailable/);
  assert.throws(
    () => decryptCredentialEnvelope({ ...encrypted, wrappedDekTag: Buffer.alloc(16).toString("base64") }, keyProvider()),
    /authenticate data/
  );
});
