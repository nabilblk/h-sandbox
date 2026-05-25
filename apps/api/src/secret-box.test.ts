import assert from "node:assert/strict";
import test from "node:test";
import { decryptSecretBox, encryptSecretBox, hasSecretBoxKey } from "./secret-box.js";

test("control-plane secret box round-trips encrypted values", () => {
  const key = "test-control-plane-key";
  const encrypted = encryptSecretBox("sandbox-env-secret", key);

  assert.notEqual(encrypted.secretCiphertext, "sandbox-env-secret");
  assert.equal(decryptSecretBox(encrypted, key), "sandbox-env-secret");
  assert.equal(hasSecretBoxKey(key), true);
  assert.equal(hasSecretBoxKey(""), false);
});
