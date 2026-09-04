import assert from "node:assert/strict";
import test from "node:test";
import type { CredentialSecretSummary } from "@harakiri/shared";
import type { EnvelopeEncryptedSecret } from "./credential-envelope.js";
import {
  createCredentialSecret,
  deleteCredentialSecret,
  disableCredentialSecret,
  enableCredentialSecret,
  getCredentialSecret,
  listCredentialSecrets,
  resolveCredentialSecretMaterial,
  rotateCredentialSecret,
  updateCredentialSecret
} from "./services/workspace-credential-secrets.js";

type SecretRow = Omit<CredentialSecretSummary, "status" | "usePolicy" | "usage" | "capabilities" | "createdAt" | "updatedAt" | "rotatedAt" | "disabledAt" | "deletedAt"> & {
  memberUseAllowed: boolean;
  rotatedAt: Date | null;
  disabledAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  activeSandboxCount: number;
  attachmentCount: number;
  lastAttachedAt: Date | null;
  secretCiphertext: string | null;
  secretIv: string | null;
  secretTag: string | null;
  encryptionScheme: "direct-v1" | "envelope-v1";
  keyId: string | null;
  wrappedDekCiphertext: string | null;
  wrappedDekIv: string | null;
  wrappedDekTag: string | null;
};

const now = new Date("2026-09-03T12:00:00.000Z");

const baseRow = (overrides: Partial<SecretRow> = {}): SecretRow => ({
  id: "vlt_existing",
  name: "OpenAI production",
  providerPresetId: "openai",
  customProfile: null,
  sourceType: "harakiri_encrypted",
  memberUseAllowed: false,
  version: 1,
  fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
  binding: {
    name: "openai-api",
    match: { schemes: ["https"], hosts: ["api.openai.com"], methods: ["GET", "POST"], paths: ["/v1/*"] },
    auth: { type: "bearer" }
  },
  egressDomains: ["api.openai.com"],
  hasEncryptedSecret: true,
  metadata: {},
  createdByUserId: "user_admin",
  createdByLabel: "admin@example.com",
  rotatedAt: null,
  disabledAt: null,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
  activeSandboxCount: 0,
  attachmentCount: 0,
  lastAttachedAt: null,
  secretCiphertext: "cipher-old",
  secretIv: "iv-old",
  secretTag: "tag-old",
  encryptionScheme: "direct-v1",
  keyId: null,
  wrappedDekCiphertext: null,
  wrappedDekIv: null,
  wrappedDekTag: null,
  ...overrides
});

const envelope = (prefix: string): EnvelopeEncryptedSecret => ({
  secretCiphertext: `${prefix}-cipher`,
  secretIv: `${prefix}-iv`,
  secretTag: `${prefix}-tag`,
  encryptionScheme: "envelope-v1",
  keyId: "key-v1",
  wrappedDekCiphertext: `${prefix}-wrapped-cipher`,
  wrappedDekIv: `${prefix}-wrapped-iv`,
  wrappedDekTag: `${prefix}-wrapped-tag`
});

const mapRow = (row: SecretRow) => ({
  ...row,
  hasEncryptedSecret: Boolean(row.secretCiphertext && row.secretIv && row.secretTag)
});

const createHarness = (role = "admin") => {
  const rows = new Map<string, SecretRow>();
  const inserts: unknown[][] = [];
  const query = async (text: string, params: unknown[] = []) => {
    if (text.includes("SELECT role FROM memberships")) {
      return { rowCount: role ? 1 : 0, rows: role ? [{ role }] as never[] : [] };
    }
    if (text.includes("SELECT id FROM workspace_credential_secrets")) {
      const name = String(params[1]).toLowerCase();
      const duplicate = [...rows.values()].find((row) => row.name.toLowerCase() === name && !row.deletedAt);
      return { rowCount: duplicate ? 1 : 0, rows: duplicate ? [{ id: duplicate.id }] as never[] : [] };
    }
    if (text.includes("INSERT INTO workspace_credential_secrets")) {
      inserts.push(params);
      rows.set(params[0] as string, baseRow({
        id: params[0] as string,
        name: params[2] as string,
        providerPresetId: params[3] as SecretRow["providerPresetId"],
        secretCiphertext: params[4] as string,
        secretIv: params[5] as string,
        secretTag: params[6] as string,
        encryptionScheme: params[7] as SecretRow["encryptionScheme"],
        keyId: params[8] as string,
        wrappedDekCiphertext: params[9] as string,
        wrappedDekIv: params[10] as string,
        wrappedDekTag: params[11] as string,
        customProfile: JSON.parse(String(params[12])) as SecretRow["customProfile"],
        fakeEnv: JSON.parse(String(params[13])) as Record<string, string>,
        binding: JSON.parse(String(params[14])) as SecretRow["binding"],
        egressDomains: JSON.parse(String(params[15])) as string[],
        metadata: JSON.parse(String(params[16])) as Record<string, unknown>,
        createdByUserId: params[17] as string,
        createdByLabel: params[18] as string,
        memberUseAllowed: params[19] as boolean
      }));
      return { rowCount: 1, rows: [{ id: params[0] }] as never[] };
    }
    if (text.includes("version = version + 1")) {
      const row = rows.get(params[1] as string);
      if (!row || row.deletedAt) return { rowCount: 0, rows: [] };
      row.secretCiphertext = params[2] as string;
      row.secretIv = params[3] as string;
      row.secretTag = params[4] as string;
      row.encryptionScheme = params[5] as SecretRow["encryptionScheme"];
      row.keyId = params[6] as string;
      row.wrappedDekCiphertext = params[7] as string;
      row.wrappedDekIv = params[8] as string;
      row.wrappedDekTag = params[9] as string;
      row.version += 1;
      row.rotatedAt = now;
      row.updatedAt = now;
      return { rowCount: 1, rows: [{ id: row.id }] as never[] };
    }
    if (text.includes("SET disabled_at = COALESCE")) {
      const row = rows.get(params[1] as string);
      if (!row || row.deletedAt) return { rowCount: 0, rows: [] };
      row.disabledAt = now;
      row.updatedAt = now;
      return { rowCount: 1, rows: [{ id: row.id }] as never[] };
    }
    if (text.includes("SET disabled_at = NULL")) {
      const row = rows.get(params[1] as string);
      if (!row || row.deletedAt) return { rowCount: 0, rows: [] };
      row.disabledAt = null;
      row.updatedAt = now;
      return { rowCount: 1, rows: [{ id: row.id }] as never[] };
    }
    if (text.includes("SET secret_ciphertext = NULL")) {
      const row = rows.get(params[1] as string);
      if (!row || row.deletedAt) return { rowCount: 0, rows: [] };
      row.secretCiphertext = null;
      row.secretIv = null;
      row.secretTag = null;
      row.keyId = null;
      row.wrappedDekCiphertext = null;
      row.wrappedDekIv = null;
      row.wrappedDekTag = null;
      row.disabledAt = now;
      row.deletedAt = now;
      row.updatedAt = now;
      return { rowCount: 1, rows: [{ id: row.id }] as never[] };
    }
    if (text.includes("SET member_use_allowed = $3")) {
      const row = rows.get(params[1] as string);
      if (!row || row.deletedAt) return { rowCount: 0, rows: [] };
      row.memberUseAllowed = params[2] as boolean;
      row.updatedAt = now;
      return { rowCount: 1, rows: [{ id: row.id }] as never[] };
    }
    if (text.includes("FROM workspace_credential_secrets")) {
      if (text.includes("id = $2")) {
        const row = rows.get(params[1] as string);
        return { rowCount: row ? 1 : 0, rows: row ? [mapRow(row)] as never[] : [] };
      }
      const includeDeleted = !text.includes("deleted_at IS NULL");
      const memberUseOnly = text.includes("member_use_allowed = true");
      const found = [...rows.values()]
        .filter((row) => includeDeleted || !row.deletedAt)
        .filter((row) => !memberUseOnly || row.memberUseAllowed)
        .map(mapRow);
      return { rowCount: found.length, rows: found as never[] };
    }
    throw new Error(`unexpected query: ${text}`);
  };
  return { rows, inserts, query };
};

test("createCredentialSecret stores encrypted value and returns sanitized metadata", async () => {
  const harness = createHarness();
  const result = await createCredentialSecret(
    {
      organizationId: "org_test",
      actorUserId: "user_admin",
      actorLabel: "admin@example.com",
      body: {
        name: "OpenAI production",
        providerPresetId: "openai",
        value: "real-secret",
        usePolicy: "organization_members",
        metadata: { owner: "agents", token: "must-redact" }
      }
    },
    {
      query: harness.query,
      idFactory: () => "vlt_created",
      encryptSecret: (value) => {
        assert.equal(value, "real-secret");
        return envelope("new");
      }
    }
  );

  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  assert.equal(harness.inserts[0]?.[4], "new-cipher");
  assert.equal(harness.inserts[0]?.[7], "envelope-v1");
  assert.equal(harness.inserts[0]?.[12], "null");
  assert.equal(harness.inserts[0]?.[15], '["api.openai.com"]');
  assert.equal(typeof harness.inserts[0]?.[14], "string");
  assert.equal(harness.inserts[0]?.[19], true);
  assert.equal(JSON.stringify(result.secret).includes("real-secret"), false);
  assert.equal(result.secret.hasEncryptedSecret, true);
  assert.equal(result.secret.usePolicy, "organization_members");
  assert.deepEqual(result.secret.usage, { activeSandboxCount: 0, attachmentCount: 0, lastAttachedAt: null });
  assert.deepEqual(result.secret.metadata, { owner: "agents", token: "[redacted]" });
});

test("members can discover and resolve only explicitly shared secrets", async () => {
  const harness = createHarness("member");
  harness.rows.set("vlt_private", baseRow({ id: "vlt_private", name: "Private" }));
  harness.rows.set("vlt_shared", baseRow({ id: "vlt_shared", name: "Shared", memberUseAllowed: true }));

  const listed = await listCredentialSecrets({ organizationId: "org_test", actorUserId: "user_member" }, harness.query);
  assert.equal(listed.kind, "ok");
  if (listed.kind !== "ok") return;
  assert.deepEqual(listed.secrets.map((secret) => secret.id), ["vlt_shared"]);
  assert.equal(listed.secrets[0]?.usePolicy, "organization_members");

  const privateMetadata = await getCredentialSecret(
    { organizationId: "org_test", actorUserId: "user_member", secretId: "vlt_private" },
    harness.query
  );
  assert.equal(privateMetadata.kind, "forbidden");

  const privateMaterial = await resolveCredentialSecretMaterial(
    { organizationId: "org_test", actorUserId: "user_member", secretId: "vlt_private" },
    { query: harness.query, decryptSecret: () => "private-value" }
  );
  assert.equal(privateMaterial.kind, "forbidden");

  const sharedMaterial = await resolveCredentialSecretMaterial(
    { organizationId: "org_test", actorUserId: "user_member", secretId: "vlt_shared" },
    { query: harness.query, decryptSecret: () => "shared-value" }
  );
  assert.equal(sharedMaterial.kind, "ok");
  if (sharedMaterial.kind === "ok") assert.equal(sharedMaterial.secretValue, "shared-value");
});

test("only admins can change workspace secret use policy", async () => {
  const memberHarness = createHarness("member");
  memberHarness.rows.set("vlt_existing", baseRow());
  const forbidden = await updateCredentialSecret(
    {
      organizationId: "org_test",
      actorUserId: "user_member",
      secretId: "vlt_existing",
      body: { usePolicy: "organization_members" }
    },
    memberHarness.query
  );
  assert.equal(forbidden.kind, "forbidden");

  const adminHarness = createHarness();
  adminHarness.rows.set("vlt_existing", baseRow());
  const shared = await updateCredentialSecret(
    {
      organizationId: "org_test",
      actorUserId: "user_admin",
      secretId: "vlt_existing",
      body: { usePolicy: "organization_members" }
    },
    adminHarness.query
  );
  assert.equal(shared.kind, "ok");
  if (shared.kind === "ok") assert.equal(shared.secret.usePolicy, "organization_members");
});

test("createCredentialSecret requires an organization admin", async () => {
  const harness = createHarness("member");
  const result = await createCredentialSecret(
    {
      organizationId: "org_test",
      actorUserId: "user_member",
      actorLabel: "member@example.com",
      body: { name: "OpenAI production", providerPresetId: "openai", value: "real-secret" }
    },
    {
      query: harness.query,
      encryptSecret: () => {
        throw new Error("encryption should not run");
      }
    }
  );

  assert.equal(result.kind, "forbidden");
  assert.equal(harness.inserts.length, 0);
});

test("createCredentialSecret rejects duplicate active names", async () => {
  const harness = createHarness();
  harness.rows.set("vlt_existing", baseRow());

  const result = await createCredentialSecret(
    {
      organizationId: "org_test",
      actorUserId: "user_admin",
      actorLabel: "admin@example.com",
      body: { name: "openai PRODUCTION", providerPresetId: "openai", value: "real-secret" }
    },
    {
      query: harness.query,
      encryptSecret: () => {
        throw new Error("encryption should not run for duplicate names");
      }
    }
  );

  assert.equal(result.kind, "duplicate");
});

test("createCredentialSecret reports encryption failures", async () => {
  const harness = createHarness();
  const result = await createCredentialSecret(
    {
      organizationId: "org_test",
      actorUserId: "user_admin",
      actorLabel: "admin@example.com",
      body: { name: "OpenAI production", providerPresetId: "openai", value: "real-secret" }
    },
    {
      query: harness.query,
      encryptSecret: () => {
        throw new Error("missing CONTROL_PLANE_SECRET_KEY");
      }
    }
  );

  assert.equal(result.kind, "encryption_unavailable");
  assert.equal(harness.inserts.length, 0);
});

test("rotate, disable, enable, and deleteCredentialSecret keep value write-only", async () => {
  const harness = createHarness();
  harness.rows.set("vlt_existing", baseRow());

  const rotated = await rotateCredentialSecret(
    { organizationId: "org_test", actorUserId: "user_admin", secretId: "vlt_existing", body: { value: "new-secret" } },
    {
      query: harness.query,
      encryptSecret: () => envelope("rotated")
    }
  );
  assert.equal(rotated.kind, "ok");
  if (rotated.kind !== "ok") return;
  assert.equal(rotated.secret.version, 2);
  assert.equal(JSON.stringify(rotated.secret).includes("new-secret"), false);

  const disabled = await disableCredentialSecret({ organizationId: "org_test", actorUserId: "user_admin", secretId: "vlt_existing" }, harness.query);
  assert.equal(disabled.kind, "ok");
  if (disabled.kind !== "ok") return;
  assert.equal(disabled.secret.status, "disabled");

  const enabled = await enableCredentialSecret({ organizationId: "org_test", actorUserId: "user_admin", secretId: "vlt_existing" }, harness.query);
  assert.equal(enabled.kind, "ok");
  if (enabled.kind !== "ok") return;
  assert.equal(enabled.secret.status, "active");

  const deleted = await deleteCredentialSecret({ organizationId: "org_test", actorUserId: "user_admin", secretId: "vlt_existing" }, harness.query);
  assert.equal(deleted.kind, "ok");
  if (deleted.kind !== "ok") return;
  assert.equal(deleted.secret.status, "deleted");
  assert.equal(deleted.secret.hasEncryptedSecret, false);

  const listed = await listCredentialSecrets({ organizationId: "org_test", actorUserId: "user_admin", includeDeleted: true }, harness.query);
  assert.equal(listed.kind, "ok");
  if (listed.kind === "ok" && "secrets" in listed) assert.equal(listed.secrets[0]?.status, "deleted");
});
