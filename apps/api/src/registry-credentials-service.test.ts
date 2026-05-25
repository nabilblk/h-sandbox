import assert from "node:assert/strict";
import test from "node:test";
import {
  listRegistryCredentials,
  RegistryCredentialEncryptionError,
  revokeRegistryCredential,
  upsertRegistryCredential
} from "./services/registry-credentials.js";

const registryRow = (overrides: Record<string, unknown> = {}) => ({
  id: "cred_1",
  organizationId: "org_registry",
  name: "prod",
  registryHost: "registry.example.com",
  username: "robot",
  secretRef: null,
  purpose: "push_pull",
  repositoryPrefix: "team/templates",
  pullSecretRef: "pull-secret",
  pushSecretRef: "push-secret",
  secretCiphertext: "cipher",
  metadata: { owner: "platform", password: "secret-value" },
  lastUsedAt: null,
  revokedAt: null,
  createdAt: "2026-05-24T12:00:00.000Z",
  updatedAt: "2026-05-24T12:00:00.000Z",
  ...overrides
});

test("listRegistryCredentials excludes revoked records by default", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const credentials = await listRegistryCredentials(
    { organizationId: "org_registry" },
    async (text, params) => {
      calls.push({ text, params });
      return { rowCount: 1, rows: [registryRow()] as never[] };
    }
  );

  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /revoked_at IS NULL/);
  assert.deepEqual(calls[0].params, ["org_registry"]);
  assert.equal(credentials[0].hasEncryptedSecret, true);
  assert.equal(credentials[0].metadata.password, "[redacted]");
});

test("upsertRegistryCredential normalizes host, encrypts secret, and redacts metadata", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const credential = await upsertRegistryCredential(
    {
      organizationId: "org_registry",
      credential: {
        name: "prod",
        registryHost: "https://Registry.EXAMPLE.com/",
        username: "robot",
        secret: "plain-secret",
        purpose: "push_pull",
        repositoryPrefix: "team/templates",
        pullSecretRef: "pull-secret",
        pushSecretRef: "push-secret",
        metadata: { password: "secret-value", owner: "platform" }
      }
    },
    {
      encryptSecret: (secret) => {
        assert.equal(secret, "plain-secret");
        return { secretCiphertext: "cipher", secretIv: "iv", secretTag: "tag" };
      },
      query: async (text, params) => {
        calls.push({ text, params });
        if (text.includes("INSERT INTO template_registry_credentials")) {
          return { rowCount: 1, rows: [{ id: "cred_1" }] as never[] };
        }
        if (text.includes("WHERE id = $1 AND organization_id = $2")) {
          return { rowCount: 1, rows: [registryRow()] as never[] };
        }
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  const insert = calls.find((call) => call.text.includes("INSERT INTO template_registry_credentials"));
  assert.ok(insert);
  assert.equal(insert.params?.[2], "registry.example.com");
  assert.equal(insert.params?.[9], "cipher");
  assert.equal(insert.params?.[10], "iv");
  assert.equal(insert.params?.[11], "tag");
  assert.deepEqual(insert.params?.[12], { password: "[redacted]", owner: "platform" });
  assert.equal(credential.id, "cred_1");
  assert.equal(credential.hasEncryptedSecret, true);
});

test("upsertRegistryCredential reports encryption failures", async () => {
  await assert.rejects(
    () =>
      upsertRegistryCredential(
        {
          organizationId: "org_registry",
          credential: {
            name: "prod",
            registryHost: "registry.example.com",
            secret: "plain-secret",
            purpose: "pull",
            repositoryPrefix: "team/templates",
            metadata: {}
          }
        },
        {
          encryptSecret: () => {
            throw new Error("missing key");
          },
          query: async () => {
            throw new Error("query should not run");
          }
        }
      ),
    RegistryCredentialEncryptionError
  );
});

test("revokeRegistryCredential returns the sanitized revoked row", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const credential = await revokeRegistryCredential(
    { organizationId: "org_registry", credentialId: "cred_1" },
    async (text, params) => {
      calls.push({ text, params });
      if (text.includes("UPDATE template_registry_credentials")) {
        return { rowCount: 1, rows: [{ id: "cred_1" }] as never[] };
      }
      if (text.includes("WHERE id = $1 AND organization_id = $2")) {
        return { rowCount: 1, rows: [registryRow({ revokedAt: "2026-05-24T12:30:00.000Z" })] as never[] };
      }
      throw new Error(`unexpected query: ${text}`);
    }
  );

  assert.equal(calls[0].params?.[0], "cred_1");
  assert.equal(calls[0].params?.[1], "org_registry");
  assert.equal(credential?.revokedAt, "2026-05-24T12:30:00.000Z");
});
