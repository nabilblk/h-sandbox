import assert from "node:assert/strict";
import test from "node:test";
import { decryptRegistrySecret, encryptRegistrySecret, normalizeRegistryHost, sanitizedRegistryCredential } from "./registry-credentials.js";

test("registry credential secret encryption round-trips with AES-GCM", () => {
  const key = "test-registry-credential-key";
  const encrypted = encryptRegistrySecret("s3cr3t-token", key);

  assert.notEqual(encrypted.secretCiphertext, "s3cr3t-token");
  assert.equal(decryptRegistrySecret(encrypted, key), "s3cr3t-token");
});

test("normalizeRegistryHost strips schemes and trailing slashes", () => {
  assert.equal(normalizeRegistryHost("https://Registry.EXAMPLE.com/team/"), "registry.example.com/team");
});

test("sanitizedRegistryCredential exposes metadata without secret material", () => {
  const visible = sanitizedRegistryCredential({
    id: "11111111-1111-1111-1111-111111111111",
    organizationId: "org",
    name: "prod",
    registryHost: "registry.example.com",
    username: "robot",
    secretRef: "prod-registry",
    purpose: "push_pull",
    repositoryPrefix: "harakiri/templates/org",
    pullSecretRef: "prod-pull",
    pushSecretRef: "prod-push",
    secretCiphertext: "cipher",
    metadata: { password: "leak", owner: "platform" },
    lastUsedAt: null,
    revokedAt: null,
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z"
  });

  assert.equal(visible.hasEncryptedSecret, true);
  assert.equal(visible.metadata.password, "[redacted]");
  assert.equal(visible.metadata.owner, "platform");
  assert(!("secretCiphertext" in visible));
});
