import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { credentialSecretCreateSchema, credentialSecretUpdateSchema } from "./routes/credential-secrets.schema.js";
import {
  externalSecretReferenceCreateSchema,
  externalSecretReferenceUpdateSchema
} from "./routes/external-secret-references.schema.js";
import { credentialAttachSchema } from "./routes/sandbox-runtime.schema.js";
import { createSandboxSchema } from "./routes/sandboxes.schema.js";
import { templateCredentialSlotInputSchema } from "./routes/templates.schema.js";

test("create sandbox credentials accept inline and stored sources", () => {
  const inline = createSandboxSchema.parse({
    template: "python-3.12-data",
    credentials: [{
      value: "real-secret",
      binding: {
        match: { hosts: ["api.example.com"] },
        auth: { type: "bearer" }
      }
    }]
  });
  const inlineCredential = inline.credentials?.[0];
  assert.ok(inlineCredential && "value" in inlineCredential);
  assert.equal(inlineCredential.value, "real-secret");

  const stored = createSandboxSchema.parse({
    template: "python-3.12-data",
    credentials: [{
      sourceType: "harakiri_encrypted",
      secretId: "vlt_openai"
    }]
  });
  assert.equal(stored.credentials?.[0]?.sourceType, "harakiri_encrypted");
});

test("create sandbox credentials accept template slot mappings", () => {
  const inline = createSandboxSchema.parse({
    template: "open-agents-dev",
    credentialMappings: [{
      slotId: "llm",
      source: {
        value: "real-secret",
        fakeEnv: { OPENAI_API_KEY: "fake-openai-key" }
      }
    }]
  });
  assert.equal(inline.credentialMappings?.[0]?.slotId, "llm");
  assert.equal(inline.credentialMappings?.[0]?.source.sourceType, undefined);

  const stored = createSandboxSchema.parse({
    template: "open-agents-dev",
    credentialMappings: [{
      providerPresetId: "openai",
      source: {
        sourceType: "harakiri_encrypted",
        secretId: "vlt_openai"
      }
    }]
  });
  assert.equal(stored.credentialMappings?.[0]?.providerPresetId, "openai");
  assert.equal(stored.credentialMappings?.[0]?.source.sourceType, "harakiri_encrypted");
});

test("create sandbox credential mappings require a slot selector", () => {
  assert.throws(
    () => createSandboxSchema.parse({
      template: "open-agents-dev",
      credentialMappings: [{
        source: { value: "real-secret" }
      }]
    }),
    /credential mapping requires slotId or providerPresetId/
  );
});

test("create sandbox credentials enforce one total launch limit", () => {
  assert.throws(
    () => createSandboxSchema.parse({
      template: "open-agents-dev",
      credentials: Array.from({ length: 16 }, (_, index) => ({
        value: `real-secret-${index}`,
        binding: {
          match: { hosts: [`api-${index}.example.com`] },
          auth: { type: "bearer" }
        }
      })),
      credentialMappings: [{
        slotId: "llm",
        source: { value: "real-secret" }
      }]
    }),
    /at most 16 create-time credentials/
  );
});

test("running sandbox credential attachment accepts encrypted workspace secret references", () => {
  const result = credentialAttachSchema.parse({
    sourceType: "harakiri_encrypted",
    secretId: "vlt_openai",
    displayName: "OpenAI production"
  });
  assert.equal(result.sourceType, "harakiri_encrypted");
  assert.equal(result.secretId, "vlt_openai");
});

test("sandbox credentials and template mappings accept external references", () => {
  const attachment = credentialAttachSchema.parse({
    sourceType: "external_ref",
    referenceId: "xsr_openai"
  });
  assert.equal(attachment.sourceType, "external_ref");

  const created = createSandboxSchema.parse({
    template: "open-agents-dev",
    credentialMappings: [{
      slotId: "llm",
      source: { sourceType: "external_ref", referenceId: "xsr_openai" }
    }]
  });
  assert.equal(created.credentialMappings?.[0]?.source.sourceType, "external_ref");
});

test("external reference schemas require a typed Kubernetes locator", () => {
  const created = externalSecretReferenceCreateSchema.parse({
    name: "OpenAI from cluster",
    providerPresetId: "openai",
    resolverType: "kubernetes_secret",
    reference: { namespace: "harakiri", name: "agent-credentials", key: "OPENAI_API_KEY" }
  });
  assert.equal(created.usePolicy, "admins_only");
  assert.deepEqual(externalSecretReferenceUpdateSchema.parse({ usePolicy: "organization_members" }), {
    usePolicy: "organization_members"
  });
  assert.throws(() => externalSecretReferenceUpdateSchema.parse({}), /at least one/);
});

test("workspace secret schemas default to admin use and accept explicit sharing", () => {
  const created = credentialSecretCreateSchema.parse({
    name: "openai-prod",
    providerPresetId: "openai",
    value: "real-secret"
  });
  assert.equal(created.usePolicy, "admins_only");
  assert.deepEqual(credentialSecretUpdateSchema.parse({
    usePolicy: "organization_members"
  }), {
    usePolicy: "organization_members"
  });
  assert.throws(
    () => credentialSecretUpdateSchema.parse({ usePolicy: "public" }),
    /Invalid option/
  );
});

test("custom private API profiles require an exact host and matching auth fields", () => {
  const customProfile = {
    host: "api.internal.example.com",
    authType: "apiKey" as const,
    headerName: "X-Internal-Key",
    methods: ["GET", "POST"],
    paths: ["/v1/*"],
    envName: "INTERNAL_API_KEY",
    testPath: "/v1/health"
  };
  const secret = credentialSecretCreateSchema.parse({
    name: "internal-api",
    providerPresetId: "custom",
    customProfile,
    value: "real-secret"
  });
  const slot = templateCredentialSlotInputSchema.parse({
    id: "internal-api",
    providerPresetId: "custom",
    customProfile
  });

  assert.equal(secret.customProfile?.host, customProfile.host);
  assert.equal(slot.customProfile?.headerName, customProfile.headerName);
  assert.throws(
    () => credentialSecretCreateSchema.parse({
      name: "missing-profile",
      providerPresetId: "custom",
      value: "real-secret"
    }),
    /customProfile is required/
  );
  assert.throws(
    () => templateCredentialSlotInputSchema.parse({
      providerPresetId: "openai",
      customProfile
    }),
    /only valid when providerPresetId is custom/
  );
});

test("custom credential profile migration adds metadata without plaintext custody", () => {
  const migrationPath = fileURLToPath(new URL("../../../db/migrations/034_custom_credential_profiles.sql", import.meta.url));
  const migration = readFileSync(migrationPath, "utf8");
  assert.match(migration, /workspace_credential_secrets[\s\S]*custom_profile JSONB/);
  assert.match(migration, /external_secret_references[\s\S]*custom_profile JSONB/);
  assert.doesNotMatch(migration, /secret_value|plaintext/);
});

test("workspace secret access migration is additive and indexed", () => {
  const migrationPath = fileURLToPath(new URL("../../../db/migrations/028_workspace_credential_secret_access.sql", import.meta.url));
  const migration = readFileSync(migrationPath, "utf8");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS member_use_allowed BOOLEAN NOT NULL DEFAULT false/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS workspace_credential_secrets_member_use_idx/);
  assert.match(migration, /WHERE deleted_at IS NULL/);
});

test("workspace secret envelope migration stores wrapped keys without replacing legacy rows", () => {
  const migrationPath = fileURLToPath(new URL("../../../db/migrations/032_workspace_credential_envelope.sql", import.meta.url));
  const migration = readFileSync(migrationPath, "utf8");
  assert.match(migration, /encryption_scheme TEXT NOT NULL DEFAULT 'direct-v1'/);
  assert.match(migration, /wrapped_dek_ciphertext TEXT/);
  assert.match(migration, /encryption_scheme = 'envelope-v1'/);
  assert.doesNotMatch(migration, /UPDATE workspace_credential_secrets/);
});

test("external reference migration stores references without plaintext values", () => {
  const migrationPath = fileURLToPath(new URL("../../../db/migrations/029_external_secret_references.sql", import.meta.url));
  const migration = readFileSync(migrationPath, "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS external_secret_references/);
  assert.match(migration, /reference JSONB NOT NULL/);
  assert.match(migration, /resolver_type TEXT NOT NULL/);
  assert.doesNotMatch(migration, /secret_ciphertext|secret_value|plaintext/);
});
