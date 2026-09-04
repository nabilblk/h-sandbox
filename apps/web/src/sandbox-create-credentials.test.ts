import assert from "node:assert/strict";
import test from "node:test";
import {
  credentialSourceCapabilities,
  templateCredentialSlotsFromInputs,
  type CredentialSecretSummary,
  type DynamicCredentialIssuerSummary
} from "@harakiri/shared";
import {
  assertNoCredentialEnvConflict,
  buildCreateSandboxBody,
  buildCredentialMappings,
  createCredentialSlotDrafts,
  parseSandboxEnvText
} from "./routes/sandboxes.js";

const [openAiSlot, githubSlot] = templateCredentialSlotsFromInputs([
  { id: "llm", providerPresetId: "openai" },
  { id: "github", providerPresetId: "github", required: false }
]);

const workspaceSecret = (overrides: Partial<CredentialSecretSummary> = {}): CredentialSecretSummary => ({
  id: "vlt_openai",
  name: "openai-prod",
  providerPresetId: "openai",
  customProfile: null,
  sourceType: "harakiri_encrypted",
  status: "active",
  usePolicy: "admins_only",
  version: 3,
  fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
  binding: openAiSlot.binding,
  egressDomains: openAiSlot.egressDomains,
  hasEncryptedSecret: true,
  metadata: {},
  createdByUserId: "usr_admin",
  createdByLabel: "admin@example.com",
  rotatedAt: null,
  disabledAt: null,
  deletedAt: null,
  createdAt: "2026-09-03T00:00:00.000Z",
  updatedAt: "2026-09-03T00:00:00.000Z",
  usage: { activeSandboxCount: 0, attachmentCount: 0, lastAttachedAt: null },
  capabilities: credentialSourceCapabilities.harakiri_encrypted,
  ...overrides
});

const dynamicIssuer = (): DynamicCredentialIssuerSummary => ({
  id: "dci_github",
  name: "agent-repositories",
  providerPresetId: "github",
  sourceType: "dynamic",
  issuerType: "github_app_installation",
  scope: { installationId: "321", repositories: ["agent-runtime"], permissions: { contents: "write", metadata: "read" } },
  status: "active",
  usePolicy: "organization_members",
  version: 1,
  fakeEnv: { GITHUB_TOKEN: "fake-github-token" },
  binding: githubSlot.binding,
  egressDomains: githubSlot.egressDomains,
  metadata: {},
  createdByUserId: "usr_admin",
  createdByLabel: "admin@example.com",
  disabledAt: null,
  deletedAt: null,
  createdAt: "2026-09-03T00:00:00.000Z",
  updatedAt: "2026-09-03T00:00:00.000Z",
  lastIssuedAt: null,
  validation: { state: "valid", message: null, checkedAt: "2026-09-03T00:00:00.000Z" },
  usage: { activeSandboxCount: 0, attachmentCount: 0, lastAttachedAt: null },
  capabilities: credentialSourceCapabilities.dynamic
});

test("createCredentialSlotDrafts selects a matching active workspace secret", () => {
  const drafts = createCredentialSlotDrafts([openAiSlot, githubSlot], [workspaceSecret()]);

  assert.equal(drafts[0].sourceMode, "workspace");
  assert.equal(drafts[0].sourceRef, "vlt_openai");
  assert.equal(drafts[1].sourceMode, "empty");
});

test("createCredentialSlotDrafts suggests only custom secrets with the same private API scope", () => {
  const [slot] = templateCredentialSlotsFromInputs([{
    id: "internal-api",
    providerPresetId: "custom",
    customProfile: { host: "api.internal.example.com", authType: "bearer", paths: ["/v1/*"] }
  }]);
  const [wrongSlot] = templateCredentialSlotsFromInputs([{
    id: "billing-api",
    providerPresetId: "custom",
    customProfile: { host: "billing.internal.example.com", authType: "bearer", paths: ["/v1/*"] }
  }]);
  const wrong = workspaceSecret({
    id: "vlt_wrong",
    providerPresetId: "custom",
    customProfile: wrongSlot.customProfile,
    binding: wrongSlot.binding,
    egressDomains: wrongSlot.egressDomains
  });
  const matching = workspaceSecret({
    id: "vlt_internal",
    providerPresetId: "custom",
    customProfile: slot.customProfile,
    binding: slot.binding,
    egressDomains: slot.egressDomains
  });

  const [draft] = createCredentialSlotDrafts([slot], [wrong, matching]);
  assert.equal(draft.sourceMode, "workspace");
  assert.equal(draft.sourceRef, "vlt_internal");
});

test("buildCredentialMappings emits stored and inline template-slot mappings", () => {
  const mappings = buildCredentialMappings([openAiSlot, githubSlot], [
    { slotId: "llm", sourceMode: "workspace", sourceRef: "vlt_openai", value: "", displayName: "OpenAI production" },
    { slotId: "github", sourceMode: "inline", sourceRef: "", value: "ghp_secret", displayName: "GitHub one-shot" }
  ]);

  assert.deepEqual(mappings, [
    { slotId: "llm", source: { sourceType: "harakiri_encrypted", secretId: "vlt_openai", displayName: "OpenAI production" } },
    { slotId: "github", source: { sourceType: "inline_ephemeral", value: "ghp_secret", displayName: "GitHub one-shot" } }
  ]);
});

test("buildCredentialMappings emits external template slot mappings", () => {
  const mappings = buildCredentialMappings([openAiSlot], [{
    slotId: "llm",
    sourceMode: "external",
    sourceRef: "xsr_openai",
    value: "",
    displayName: "OpenAI from cluster"
  }]);
  assert.deepEqual(mappings, [{
    slotId: "llm",
    source: { sourceType: "external_ref", referenceId: "xsr_openai", displayName: "OpenAI from cluster" }
  }]);
});

test("create flow discovers and maps a validated dynamic issuer", () => {
  const drafts = createCredentialSlotDrafts([githubSlot], [], [], [dynamicIssuer()]);
  assert.equal(drafts[0].sourceMode, "dynamic");
  assert.equal(drafts[0].sourceRef, "dci_github");
  assert.deepEqual(buildCredentialMappings([githubSlot], drafts), [{
    slotId: "github",
    source: { sourceType: "dynamic", issuerId: "dci_github", displayName: "GitHub" }
  }]);
});

test("buildCredentialMappings rejects missing required slot values", () => {
  assert.throws(
    () => buildCredentialMappings([openAiSlot], [{ slotId: "llm", sourceMode: "empty", sourceRef: "", value: "", displayName: "OpenAI API" }]),
    /OpenAI API credential is required/
  );
});

test("parseSandboxEnvText parses explicit environment and rejects invalid keys", () => {
  assert.deepEqual(parseSandboxEnvText("A=1\n# comment\nB=value=with-equals"), {
    A: "1",
    B: "value=with-equals"
  });
  assert.throws(() => parseSandboxEnvText("1_BAD=value"), /not a valid environment key/);
});

test("assertNoCredentialEnvConflict rejects env keys owned by selected slots", () => {
  const mappings = buildCredentialMappings([openAiSlot], [
    { slotId: "llm", sourceMode: "inline", sourceRef: "", value: "sk_secret", displayName: "OpenAI API" }
  ]);

  assert.throws(
    () => assertNoCredentialEnvConflict({ OPENAI_API_KEY: "real-or-fake" }, [openAiSlot], mappings),
    /OPENAI_API_KEY is reserved by credential slot OpenAI API/
  );
});

test("buildCreateSandboxBody includes slot mappings and explicit egress", () => {
  const body = buildCreateSandboxBody({
    allowTarget: "api.internal.example.com",
    credentialSlots: [openAiSlot],
    egressMode: "restricted",
    egressPresets: ["llm-apis"],
    envText: "HARAKIRI_ENV=dev",
    name: "agent-runner",
    slotDrafts: [{ slotId: "llm", sourceMode: "workspace", sourceRef: "vlt_openai", value: "", displayName: "OpenAI production" }],
    template: "open-agents-dev",
    ttlSeconds: 300
  });

  assert.deepEqual(body.credentialMappings, [
    { slotId: "llm", source: { sourceType: "harakiri_encrypted", secretId: "vlt_openai", displayName: "OpenAI production" } }
  ]);
  assert.deepEqual(body.egress, {
    mode: "restricted",
    presets: ["llm-apis"],
    allow: ["api.internal.example.com"]
  });
  assert.deepEqual(body.env, { HARAKIRI_ENV: "dev" });
});
