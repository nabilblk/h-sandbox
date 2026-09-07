import assert from "node:assert/strict";
import test from "node:test";
import { credentialProviderPresetCatalog, templateCredentialSlotFromInput } from "@harakiri/shared";
import type { RuntimeProvider } from "./providers/runtime/provider.js";
import { createSandbox, deleteSandbox, listSandboxes, renewSandbox, updateSandboxSource } from "./services/sandboxes.js";
import type { RuntimeTemplate } from "./templates.js";

const readyTemplate: RuntimeTemplate = {
  id: "python-3.12",
  name: "Python 3.12",
  description: "Python runtime",
  image: "registry.example.com/python@sha256:abc",
  imageDigest: "sha256:abc",
  icon: "py",
  tags: ["python"],
  aliases: ["python"],
  bootMs: 150,
  visibility: "public",
  status: "ready",
  ownerScope: "team",
  defaultEntrypoint: ["sleep", "3600"],
  cpuCount: 2,
  memoryMb: 2048,
  workdir: "/workspace",
  defaultPorts: [3000],
  runtimeFamily: "python",
  latestVersionId: "tplv_ready",
  templateVersionId: "tplv_ready"
};

const openAiSlot = templateCredentialSlotFromInput({
  id: "llm",
  providerPresetId: "openai",
  envName: "AGENT_OPENAI_API_KEY"
});

const readyTemplateWithOpenAiSlot: RuntimeTemplate = {
  ...readyTemplate,
  id: "open-agents-dev",
  name: "Open Agents Dev",
  credentialSlots: [openAiSlot]
};

const fakeRuntimeProvider = (
  state: {
    createInput?: unknown;
    deletedRef?: unknown;
    renewedRef?: unknown;
    renewedInput?: unknown;
    egressInput?: unknown;
    createError?: Error;
  } = {}
): RuntimeProvider => ({
  kind: "fake",
  capabilities: {
    terminal: true,
    filesystem: true,
    logs: true,
    metrics: true,
    routes: true
  },
  create: async (input) => {
    state.createInput = input;
    if (state.createError) throw state.createError;
    return {
      provider: "fake",
      providerSandboxId: "provider_sbx",
      state: "running",
      expiresAt: null,
      runtimeRegistryCredentialId: "cred_runtime",
      runtimeImageAuthProvided: true
    };
  },
  list: async () => [],
  get: async () => null,
  delete: async (ref) => {
    state.deletedRef = ref;
  },
  renew: async (ref, input) => {
    state.renewedRef = ref;
    state.renewedInput = input;
  },
  run: async () => {
    throw new Error("not used");
  },
  files: async () => {
    throw new Error("not used");
  },
  logs: async () => [],
  metrics: async () => null,
  setEgressPolicy: async (_ref, policy) => {
    state.egressInput = policy;
    return {
      status: "ready",
      enforcementMode: "dns+nft",
      credentialVaultReady: true,
      policy
    };
  },
  exposeRoute: async () => {
    throw new Error("not used");
  }
});

const operationRow = (overrides: Record<string, unknown> = {}) => ({
  id: "op_test",
  organizationId: "org_sbx",
  sandboxId: "sbx_test",
  kind: "provision",
  state: "queued",
  idempotencyKey: null,
  request: {},
  result: {},
  error: null,
  attempts: 0,
  lockedAt: null,
  startedAt: null,
  completedAt: null,
  createdAt: "2026-05-24T00:00:00.000Z",
  updatedAt: "2026-05-24T00:00:00.000Z",
  ...overrides
});

const orgEgressSettingsRow = () => ({
  defaultEgressPolicy: { mode: "open", presets: [], allow: [], deny: [] },
  egressAllowedPresets: ["python-package-install", "node-package-install", "git-hosting", "llm-apis", "browser-basic"],
  egressCustomDomainsEnabled: true,
  egressMaxRules: 128,
  egressRedactDomains: false
});

test("listSandboxes builds stable filters and limit", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const sandboxes = await listSandboxes(
    {
      organizationId: "org_sbx",
      filters: {
        status: "running",
        template: "python-3.12",
        templateVersionId: "tplv_ready",
        q: "agent",
        limit: "5"
      }
    },
    {
      runtimeProvider: fakeRuntimeProvider(),
      query: async (text, params) => {
        calls.push({ text, params });
        return {
          rowCount: 1,
          rows: [{
            id: "sbx_1",
            opensandboxId: "osbx_1",
            name: "agent",
            status: "running",
            template: "python-3.12",
            ttlSeconds: 300,
            expiresAt: "2026-05-24T00:05:00.000Z",
            createdAt: "2026-05-24T00:00:00.000Z",
            templateVersionId: "tplv_ready",
            templateImageDigest: "sha256:abc",
            egressPolicy: { mode: "restricted", presets: ["python-package-install"], allow: ["api.github.com"], deny: [] },
            runtimeWorkdir: "/workspace",
            runtimeDefaultPorts: [3000, 5173],
            runtimeFamily: "python",
            runtimeExposedPorts: [{
              port: 3000,
              protocol: "http",
              accessMode: "token",
              state: "ready",
              host: "sbx-3000.example.test",
              url: "https://sbx-3000.example.test",
              labels: ["preview"]
            }]
          }] as never[]
        };
      }
    }
  );

  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /s.status = \$2/);
  assert.match(calls[0].text, /s.template_id = \$3/);
  assert.match(calls[0].text, /s.template_version_id = \$4/);
  assert.match(calls[0].text, /ILIKE \$5/);
  assert.deepEqual(calls[0].params, ["org_sbx", "running", "python-3.12", "tplv_ready", "%agent%", 5]);
  assert.equal(sandboxes[0].id, "sbx_1");
  assert.equal(sandboxes[0].runtimeMetadata.workdir, "/workspace");
  assert.equal(sandboxes[0].runtimeMetadata.template.versionId, "tplv_ready");
  assert.deepEqual(sandboxes[0].runtimeMetadata.ports.default, [3000, 5173]);
  assert.equal(sandboxes[0].runtimeMetadata.ports.exposed[0].url, "https://sbx-3000.example.test");
  assert.equal(sandboxes[0].runtimeMetadata.egress.mode, "restricted");
  assert.equal(sandboxes[0].runtimeMetadata.egress.ruleCount > 0, true);
  assert.equal(sandboxes[0].runtimeMetadata.provider.kind, "fake");
  assert.equal(sandboxes[0].runtimeMetadata.provider.capabilities.some((capability) => capability.name === "commands"), true);
});

test("createSandbox creates provider sandbox, persists schedule, and records metadata", async () => {
  const runtimeState: { createInput?: any } = {};
  const events: Array<{ type: string; metadata?: Record<string, unknown> }> = [];
  const audits: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const result = await createSandbox(
    {
      organizationId: "org_sbx",
      userId: "user_sbx",
      actorLabel: "user@test.local",
      templateRef: "python-3.12",
      name: "agent-runner",
      ttlSeconds: 300,
      env: { HARAKIRI_ENV_SMOKE: "ok" },
      source: {
        type: "git",
        url: "https://oauth2:ghp_secret@github.com/acme/private.git",
        branch: "main",
        targetPath: "/workspace/project",
        credentialPersistence: "one-shot"
      }
    },
    {
      runtimeProvider: fakeRuntimeProvider(runtimeState),
      idFactory: () => "sbx_test",
      resolveTemplateFn: async () => readyTemplate,
      ensureTemplateImageDigestFn: async (template) => template,
      recordEvent: async (_organizationId, _sandboxId, type, _message, metadata) => {
        events.push({ type, metadata });
      },
      recordAudit: async (_organizationId, _userId, _actorLabel, action, _targetType, _targetId, metadata) => {
        audits.push({ action, metadata });
      },
      query: async (text, params) => {
        calls.push({ text, params });
        if (text.includes("INSERT INTO sandboxes")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("INSERT INTO sandbox_operations")) {
          return { rowCount: 1, rows: [operationRow()] as never[] };
        }
        if (text.includes("FROM sandbox_operations") && text.includes("FOR UPDATE")) {
          return { rowCount: 1, rows: [operationRow()] as never[] };
        }
        if (text.includes("UPDATE sandbox_operations")) {
          return { rowCount: 1, rows: [operationRow({ state: text.includes("succeeded") ? "succeeded" : "running" })] as never[] };
        }
        if (text.includes("UPDATE sandboxes")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("default_egress_policy")) return { rowCount: 1, rows: [orgEgressSettingsRow()] as never[] };
        if (text.includes("INSERT INTO sandbox_schedules")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("FROM sandboxes s") && text.includes("WHERE s.id = $1")) {
          return {
            rowCount: 1,
            rows: [{ id: "sbx_test", name: "agent-runner", template: "python-3.12", status: "running" }] as never[]
          };
        }
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "created");
  if (result.kind === "created") assert.equal(result.sandbox.id, "sbx_test");
  assert.equal(runtimeState.createInput?.template.id, "python-3.12");
  assert.equal(runtimeState.createInput?.env.HARAKIRI_ENV_SMOKE, "ok");
  assert.equal(runtimeState.createInput?.metadata["harakiri.sandbox"], "sbx_test");
  assert.deepEqual(runtimeState.createInput?.egressPolicy, { defaultAction: "allow", egress: [] });
  const insert = calls.find((call) => call.text.includes("INSERT INTO sandboxes"));
  assert.ok(insert);
  assert.deepEqual(insert.params?.slice(0, 5), ["sbx_test", "org_sbx", "python-3.12", "agent-runner", "user_sbx"]);
  assert.deepEqual(JSON.parse(String(insert.params?.[11])), { defaultAction: "allow", egress: [] });
  assert.deepEqual(JSON.parse(String(insert.params?.[12])), {
    type: "git",
    url: "https://github.com/acme/private.git",
    branch: "main",
    targetPath: "/workspace/project",
    credentialPersistence: "one-shot",
    status: "requested"
  });
  const operationInsert = calls.find((call) => call.text.includes("INSERT INTO sandbox_operations"));
  assert.ok(operationInsert);
  assert.equal(JSON.stringify(operationInsert.params).includes("ghp_secret"), false);
  assert.deepEqual(JSON.parse(String(operationInsert.params?.[5])).source, {
    type: "git",
    url: "https://github.com/acme/private.git",
    branch: "main",
    targetPath: "/workspace/project",
    credentialPersistence: "one-shot",
    status: "requested"
  });
  assert(calls.some((call) => call.text.includes("UPDATE sandboxes") && call.params?.[1] === "provider_sbx"));
  assert.equal(events[0].type, "created");
  assert.equal(events[0].metadata?.runtimeWorkdir, "/workspace");
  assert.equal(events[0].metadata?.operationId, "op_test");
  assert.equal(JSON.stringify(events[0].metadata).includes("ghp_secret"), false);
  assert.deepEqual(events[0].metadata?.source, {
    type: "git",
    url: "https://github.com/acme/private.git",
    branch: "main",
    targetPath: "/workspace/project",
    credentialPersistence: "one-shot",
    status: "requested"
  });
  assert.equal(audits[0].action, "sandbox.create");
});

test("createSandbox attaches create-time credentials without persisting plaintext", async () => {
  const runtimeState: { createInput?: any } = {};
  const vaultCalls: Array<{ credentials: Array<{ name: string; value: string }>; bindings: unknown[] }> = [];
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const now = new Date("2026-09-03T12:00:00.000Z");
  const attachment: Record<string, unknown> = {};
  const provider: RuntimeProvider = {
    ...fakeRuntimeProvider(runtimeState),
    capabilities: {
      ...fakeRuntimeProvider().capabilities,
      credentialVault: true,
      credentialVaultPatch: true,
      credentialVaultSanitizedRead: true
    },
    applyCredentialVault: async (input) => {
      vaultCalls.push({ credentials: input.credentials, bindings: input.bindings });
      return {
        revision: 2,
        credentials: [{ name: "cred_openai", sourceType: "inline", revision: 2 }],
        bindings: [{ name: "openai-api", revision: 2, auth: { type: "bearer" } }]
      };
    }
  };
  const result = await createSandbox(
    {
      organizationId: "org_sbx",
      userId: "user_sbx",
      actorLabel: "user@test.local",
      templateRef: "python-3.12",
      name: "agent-runner",
      ttlSeconds: 300,
      env: { SAFE_ENV: "ok" },
      credentials: [{
        displayName: "OpenAI",
        credentialName: "cred_openai",
        value: "real-secret",
        fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
        binding: {
          name: "openai-api",
          match: { hosts: ["api.openai.com"], methods: ["GET", "POST"], paths: ["/v1/*"] },
          auth: { type: "bearer" }
        }
      }]
    },
    {
      runtimeProvider: provider,
      idFactory: (prefix) => prefix === "sbx" ? "sbx_vault_create" : `${prefix}_vault`,
      resolveTemplateFn: async () => readyTemplate,
      ensureTemplateImageDigestFn: async (template) => template,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      query: async (text, params) => {
        calls.push({ text, params });
        if (text.includes("INSERT INTO sandboxes")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("INSERT INTO sandbox_operations")) {
          return { rowCount: 1, rows: [operationRow({ id: "op_vault", sandboxId: "sbx_vault_create" })] as never[] };
        }
        if (text.includes("FROM sandbox_operations") && text.includes("FOR UPDATE")) {
          return { rowCount: 1, rows: [operationRow({ id: "op_vault", sandboxId: "sbx_vault_create" })] as never[] };
        }
        if (text.includes("UPDATE sandbox_operations")) {
          return { rowCount: 1, rows: [operationRow({ id: "op_vault", sandboxId: "sbx_vault_create", state: text.includes("succeeded") ? "succeeded" : "running" })] as never[] };
        }
        if (text.includes("UPDATE sandboxes")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("default_egress_policy")) return { rowCount: 1, rows: [orgEgressSettingsRow()] as never[] };
        if (text.includes("INSERT INTO sandbox_schedules")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("FROM sandboxes WHERE id = $1 AND organization_id = $2")) {
          return { rowCount: 1, rows: [{ id: "sbx_vault_create", opensandboxId: "provider_sbx", status: "running" }] as never[] };
        }
        if (text.includes("FROM sandboxes s") && text.includes("WHERE s.id = $1")) {
          return {
            rowCount: 1,
            rows: [{ id: "sbx_vault_create", name: "agent-runner", template: "python-3.12", status: "running" }] as never[]
          };
        }
        if (text.includes("FROM sandbox_credential_attachments") && text.includes("LIMIT 1")) return { rowCount: 0, rows: [] as never[] };
        if (text.includes("INSERT INTO sandbox_credential_attachments")) {
          Object.assign(attachment, {
            id: params?.[0],
            sandboxId: params?.[2],
            sourceType: params?.[4],
            sourceRef: params?.[5] ?? null,
            provider: params?.[3],
            credentialName: params?.[6],
            displayName: params?.[7],
            bindingName: params?.[8],
            match: JSON.parse(String(params?.[9])),
            auth: JSON.parse(String(params?.[10])),
            fakeEnv: JSON.parse(String(params?.[11])),
            status: "pending",
            providerRevision: null,
            providerMetadata: {},
            lastError: null,
            injectedAt: null,
            detachedAt: null,
            createdByUserId: params?.[10],
            createdByLabel: params?.[11],
            createdAt: now,
            updatedAt: now
          });
          return { rowCount: 1, rows: [] as never[] };
        }
        if (text.includes("SET status = 'injected'")) {
          assert.match(text, /RETURNING[\s\S]+"updatedAt"[\s\S]+SELECT \* FROM updated/);
          Object.assign(attachment, {
            status: "injected",
            providerRevision: params?.[1],
            providerMetadata: JSON.parse(String(params?.[2])),
            injectedAt: now,
            updatedAt: now
          });
          return { rowCount: 1, rows: [attachment] as never[] };
        }
        if (text.includes("sandbox_operation_secrets")) return { rowCount: 1, rows: [] as never[] };
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "created");
  if (result.kind !== "created") return;
  assert.equal(result.credentialAttachments?.length, 1);
  assert.equal(result.credentialAttachments?.[0]?.status, "injected");
  assert.equal(JSON.stringify(result.credentialAttachments).includes("real-secret"), false);
  assert.deepEqual(vaultCalls[0]?.credentials, [{ name: "cred_openai", value: "real-secret" }]);
  assert.deepEqual(runtimeState.createInput?.env, { SAFE_ENV: "ok", OPENAI_API_KEY: "fake-openai-key" });
  assert.deepEqual(runtimeState.createInput?.egressPolicy, {
    defaultAction: "deny",
    egress: [{ action: "allow", target: "api.openai.com" }]
  });
  assert.equal(JSON.stringify(calls.map((call) => call.params)).includes("real-secret"), false);
});

test("createSandbox rolls back when runtime egress is unsafe for credentials", async () => {
  const runtimeState: { createInput?: unknown; deletedRef?: unknown } = {};
  const databaseCalls: Array<{ text: string; params?: unknown[] }> = [];
  const events: Array<{ type: string; metadata?: Record<string, unknown> }> = [];
  const audits: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
  let applyCalls = 0;
  let sandboxStatus = "running";
  const provider: RuntimeProvider = {
    ...fakeRuntimeProvider(runtimeState),
    applyCredentialVault: async () => {
      applyCalls += 1;
      throw new Error("credential injection must not run");
    },
    setEgressPolicy: async (_ref, policy) => ({
      status: "ready",
      enforcementMode: "dns",
      credentialVaultReady: false,
      policy
    })
  };

  const result = await createSandbox(
    {
      organizationId: "org_sbx",
      userId: "user_sbx",
      actorLabel: "user@test.local",
      templateRef: "python-3.12",
      ttlSeconds: 300,
      env: {},
      credentials: [{
        value: "never-store-this-secret",
        binding: {
          match: { hosts: ["api.example.com"] },
          auth: { type: "bearer" }
        }
      }]
    },
    {
      runtimeProvider: provider,
      idFactory: (prefix) => prefix === "sbx" ? "sbx_unsafe" : `${prefix}_unsafe`,
      resolveTemplateFn: async () => readyTemplate,
      ensureTemplateImageDigestFn: async (template) => template,
      recordEvent: async (_organizationId, _sandboxId, type, _message, metadata) => {
        events.push({ type, metadata });
      },
      recordAudit: async (_organizationId, _userId, _actorLabel, action, _targetType, _targetId, metadata) => {
        audits.push({ action, metadata });
      },
      query: async (text, params) => {
        databaseCalls.push({ text, params });
        if (text.includes("INSERT INTO sandboxes")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("INSERT INTO sandbox_operations")) {
          return { rowCount: 1, rows: [operationRow({ id: "op_unsafe", sandboxId: "sbx_unsafe" })] as never[] };
        }
        if (text.includes("FROM sandbox_operations") && text.includes("FOR UPDATE")) {
          return { rowCount: 1, rows: [operationRow({ id: "op_unsafe", sandboxId: "sbx_unsafe", state: "running" })] as never[] };
        }
        if (text.includes("UPDATE sandbox_operations")) {
          return { rowCount: 1, rows: [operationRow({ id: "op_unsafe", sandboxId: "sbx_unsafe", state: "failed" })] as never[] };
        }
        if (text.includes("UPDATE sandboxes") && text.includes("status = 'error'")) {
          sandboxStatus = "error";
          return { rowCount: 1, rows: [] as never[] };
        }
        if (text.includes("UPDATE sandboxes")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("UPDATE sandbox_schedules")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("UPDATE sandbox_credential_attachments")) return { rowCount: 0, rows: [] as never[] };
        if (text.includes("INSERT INTO sandbox_schedules")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("default_egress_policy")) return { rowCount: 1, rows: [orgEgressSettingsRow()] as never[] };
        if (text.includes("FROM sandboxes WHERE id = $1 AND organization_id = $2")) {
          return {
            rowCount: 1,
            rows: [{ id: "sbx_unsafe", opensandboxId: "provider_sbx", status: sandboxStatus, egressPolicy: { mode: "restricted", allow: ["api.example.com"] } }] as never[]
          };
        }
        if (text.includes("FROM sandboxes s") && text.includes("WHERE s.id = $1")) {
          return {
            rowCount: 1,
            rows: [{ id: "sbx_unsafe", name: "python-3.12-runner", template: "python-3.12", status: sandboxStatus }] as never[]
          };
        }
        if (text.includes("FROM sandbox_credential_attachments") && text.includes("LIMIT 1")) {
          return { rowCount: 0, rows: [] as never[] };
        }
        if (text.includes("sandbox_operation_secrets")) return { rowCount: 1, rows: [] as never[] };
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "credential_vault_invalid_binding");
  assert.equal(applyCalls, 0);
  assert.deepEqual(runtimeState.deletedRef, { provider: "fake", providerSandboxId: "provider_sbx" });
  assert.equal(sandboxStatus, "error");
  assert(databaseCalls.some((call) => call.text.includes("SET state = 'failed'")));
  assert(events.some((event) => event.type === "error"));
  assert(audits.some((audit) => audit.action === "sandbox.create.credential_failed"));
  assert.equal(JSON.stringify(databaseCalls).includes("never-store-this-secret"), false);
  assert.equal(JSON.stringify(events).includes("never-store-this-secret"), false);
  assert.equal(JSON.stringify(audits).includes("never-store-this-secret"), false);
});

test("createSandbox attaches stored workspace secrets at create time", async () => {
  const runtimeState: { createInput?: any } = {};
  const vaultCalls: Array<{ credentials: Array<{ name: string; value: string }>; bindings: unknown[] }> = [];
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const now = new Date("2026-09-03T12:00:00.000Z");
  const attachment: Record<string, unknown> = {};
  const storedSecret = {
    id: "vlt_openai",
    name: "OpenAI production",
    providerPresetId: "openai",
    sourceType: "harakiri_encrypted",
    version: 1,
    fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
    binding: credentialProviderPresetCatalog.openai.binding,
    egressDomains: ["api.openai.com"],
    hasEncryptedSecret: true,
    metadata: {},
    createdByUserId: "user_sbx",
    createdByLabel: "user@test.local",
    rotatedAt: null,
    disabledAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    secretCiphertext: "ciphertext",
    secretIv: "iv",
    secretTag: "tag"
  };
  const provider: RuntimeProvider = {
    ...fakeRuntimeProvider(runtimeState),
    capabilities: {
      ...fakeRuntimeProvider().capabilities,
      credentialVault: true,
      credentialVaultPatch: true,
      credentialVaultSanitizedRead: true
    },
    applyCredentialVault: async (input) => {
      vaultCalls.push({ credentials: input.credentials, bindings: input.bindings });
      return {
        revision: 2,
        credentials: [{ name: "openai-vlt_openai", sourceType: "inline", revision: 2 }],
        bindings: [{ name: "openai-api-vlt_openai", revision: 2, auth: { type: "bearer" } }]
      };
    }
  };
  const result = await createSandbox(
    {
      organizationId: "org_sbx",
      userId: "user_sbx",
      actorLabel: "user@test.local",
      templateRef: "python-3.12",
      name: "stored-runner",
      ttlSeconds: 300,
      env: {},
      credentials: [{
        sourceType: "harakiri_encrypted",
        secretId: "vlt_openai"
      }]
    },
    {
      runtimeProvider: provider,
      idFactory: (prefix) => prefix === "sbx" ? "sbx_stored_create" : `${prefix}_stored`,
      resolveTemplateFn: async () => readyTemplate,
      ensureTemplateImageDigestFn: async (template) => template,
      decryptSecret: () => "stored-real-secret",
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      query: async (text, params) => {
        calls.push({ text, params });
        if (text.includes("SELECT role FROM memberships")) return { rowCount: 1, rows: [{ role: "admin" }] as never[] };
        if (text.includes("FROM workspace_credential_secrets")) return { rowCount: 1, rows: [storedSecret] as never[] };
        if (text.includes("INSERT INTO sandboxes")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("INSERT INTO sandbox_operations")) {
          return { rowCount: 1, rows: [operationRow({ id: "op_stored", sandboxId: "sbx_stored_create" })] as never[] };
        }
        if (text.includes("FROM sandbox_operations") && text.includes("FOR UPDATE")) {
          return { rowCount: 1, rows: [operationRow({ id: "op_stored", sandboxId: "sbx_stored_create" })] as never[] };
        }
        if (text.includes("UPDATE sandbox_operations")) {
          return { rowCount: 1, rows: [operationRow({ id: "op_stored", sandboxId: "sbx_stored_create", state: text.includes("succeeded") ? "succeeded" : "running" })] as never[] };
        }
        if (text.includes("UPDATE sandboxes")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("default_egress_policy")) return { rowCount: 1, rows: [orgEgressSettingsRow()] as never[] };
        if (text.includes("INSERT INTO sandbox_schedules")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("FROM sandboxes WHERE id = $1 AND organization_id = $2")) {
          return { rowCount: 1, rows: [{ id: "sbx_stored_create", opensandboxId: "provider_sbx", status: "running" }] as never[] };
        }
        if (text.includes("FROM sandboxes s") && text.includes("WHERE s.id = $1")) {
          return {
            rowCount: 1,
            rows: [{ id: "sbx_stored_create", name: "stored-runner", template: "python-3.12", status: "running" }] as never[]
          };
        }
        if (text.includes("FROM sandbox_credential_attachments") && text.includes("LIMIT 1")) return { rowCount: 0, rows: [] as never[] };
        if (text.includes("INSERT INTO sandbox_credential_attachments")) {
          Object.assign(attachment, {
            id: params?.[0],
            sandboxId: params?.[2],
            sourceType: params?.[4],
            sourceRef: params?.[5] ?? null,
            provider: params?.[3],
            credentialName: params?.[6],
            displayName: params?.[7],
            bindingName: params?.[8],
            match: JSON.parse(String(params?.[9])),
            auth: JSON.parse(String(params?.[10])),
            fakeEnv: JSON.parse(String(params?.[11])),
            status: "pending",
            providerRevision: null,
            providerMetadata: {},
            lastError: null,
            injectedAt: null,
            detachedAt: null,
            createdByUserId: params?.[12],
            createdByLabel: params?.[13],
            createdAt: now,
            updatedAt: now
          });
          return { rowCount: 1, rows: [] as never[] };
        }
        if (text.includes("SET status = 'injected'")) {
          Object.assign(attachment, {
            status: "injected",
            providerRevision: params?.[1],
            providerMetadata: JSON.parse(String(params?.[2])),
            injectedAt: now,
            updatedAt: now
          });
          return { rowCount: 1, rows: [attachment] as never[] };
        }
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "created");
  if (result.kind !== "created") return;
  assert.equal(result.credentialAttachments?.[0]?.sourceType, "harakiri_encrypted");
  assert.equal(result.credentialAttachments?.[0]?.sourceRef, "vlt_openai");
  assert.deepEqual(vaultCalls[0]?.credentials, [{ name: "openai-vlt_openai", value: "stored-real-secret" }]);
  assert.deepEqual(runtimeState.createInput?.env, { OPENAI_API_KEY: "fake-openai-key" });
  assert.deepEqual(runtimeState.createInput?.egressPolicy, {
    defaultAction: "deny",
    egress: [{ action: "allow", target: "api.openai.com" }]
  });
  const secretLookupIndex = calls.findIndex((call) => call.text.includes("FROM workspace_credential_secrets"));
  const sandboxInsertIndex = calls.findIndex((call) => call.text.includes("INSERT INTO sandboxes"));
  assert.notEqual(secretLookupIndex, -1);
  assert.notEqual(sandboxInsertIndex, -1);
  assert(secretLookupIndex < sandboxInsertIndex);
  assert.equal(JSON.stringify(calls.map((call) => call.params)).includes("stored-real-secret"), false);
});

test("createSandbox restores a snapshot with an explicit stored template-slot mapping", async () => {
  const runtimeState: { createInput?: any } = {};
  const vaultCalls: Array<{ credentials: Array<{ name: string; value: string }>; bindings: Array<{ name: string }> }> = [];
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const now = new Date("2026-09-03T12:00:00.000Z");
  const attachment: Record<string, unknown> = {};
  const storedSecret = {
    id: "vlt_openai",
    name: "OpenAI production",
    providerPresetId: "openai",
    sourceType: "harakiri_encrypted",
    version: 1,
    fakeEnv: { OPENAI_API_KEY: "stored-fake-value" },
    binding: credentialProviderPresetCatalog.openai.binding,
    egressDomains: ["api.openai.com"],
    hasEncryptedSecret: true,
    metadata: {},
    createdByUserId: "user_sbx",
    createdByLabel: "user@test.local",
    rotatedAt: null,
    disabledAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    secretCiphertext: "ciphertext",
    secretIv: "iv",
    secretTag: "tag"
  };
  const provider: RuntimeProvider = {
    ...fakeRuntimeProvider(runtimeState),
    capabilities: {
      ...fakeRuntimeProvider().capabilities,
      credentialVault: true,
      credentialVaultPatch: true,
      credentialVaultSanitizedRead: true
    },
    applyCredentialVault: async (input) => {
      vaultCalls.push({ credentials: input.credentials, bindings: input.bindings });
      return {
        revision: 2,
        credentials: [{ name: "openai", sourceType: "inline", revision: 2 }],
        bindings: [{ name: "openai-api", revision: 2, auth: { type: "bearer" } }]
      };
    }
  };
  const result = await createSandbox(
    {
      organizationId: "org_sbx",
      userId: "user_sbx",
      actorLabel: "user@test.local",
      snapshotId: "snp_ready",
      templateRef: "open-agents-dev",
      name: "slot-runner",
      ttlSeconds: 300,
      env: {},
      credentialMappings: [{
        slotId: "llm",
        source: {
          sourceType: "harakiri_encrypted",
          secretId: "vlt_openai"
        }
      }]
    },
    {
      runtimeProvider: provider,
      idFactory: (prefix) => prefix === "sbx" ? "sbx_slot_create" : `${prefix}_slot`,
      resolveTemplateFn: async () => readyTemplateWithOpenAiSlot,
      ensureTemplateImageDigestFn: async (template) => template,
      decryptSecret: () => "stored-real-secret",
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      query: async (text, params) => {
        calls.push({ text, params });
        if (text.includes("FROM sandbox_snapshots")) {
          return {
            rowCount: 1,
            rows: [{
              id: "snp_ready",
              provider: "fake",
              providerSnapshotId: "provider_snp",
              template: "open-agents-dev",
              templateVersionId: "tplv_ready",
              templateImageDigest: "sha256:abc",
              status: "ready"
            }] as never[]
          };
        }
        if (text.includes("SELECT role FROM memberships")) return { rowCount: 1, rows: [{ role: "admin" }] as never[] };
        if (text.includes("FROM workspace_credential_secrets")) return { rowCount: 1, rows: [storedSecret] as never[] };
        if (text.includes("INSERT INTO sandboxes")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("INSERT INTO sandbox_operations")) {
          return { rowCount: 1, rows: [operationRow({ id: "op_slot", sandboxId: "sbx_slot_create" })] as never[] };
        }
        if (text.includes("FROM sandbox_operations") && text.includes("FOR UPDATE")) {
          return { rowCount: 1, rows: [operationRow({ id: "op_slot", sandboxId: "sbx_slot_create" })] as never[] };
        }
        if (text.includes("UPDATE sandbox_operations")) {
          return { rowCount: 1, rows: [operationRow({ id: "op_slot", sandboxId: "sbx_slot_create", state: text.includes("succeeded") ? "succeeded" : "running" })] as never[] };
        }
        if (text.includes("UPDATE sandboxes")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("default_egress_policy")) return { rowCount: 1, rows: [orgEgressSettingsRow()] as never[] };
        if (text.includes("INSERT INTO sandbox_schedules")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("FROM sandboxes WHERE id = $1 AND organization_id = $2")) {
          return { rowCount: 1, rows: [{ id: "sbx_slot_create", opensandboxId: "provider_sbx", status: "running" }] as never[] };
        }
        if (text.includes("FROM sandboxes s") && text.includes("WHERE s.id = $1")) {
          return {
            rowCount: 1,
            rows: [{ id: "sbx_slot_create", name: "slot-runner", template: "open-agents-dev", status: "running" }] as never[]
          };
        }
        if (text.includes("FROM sandbox_credential_attachments") && text.includes("LIMIT 1")) return { rowCount: 0, rows: [] as never[] };
        if (text.includes("INSERT INTO sandbox_credential_attachments")) {
          Object.assign(attachment, {
            id: params?.[0],
            sandboxId: params?.[2],
            sourceType: params?.[4],
            sourceRef: params?.[5] ?? null,
            provider: params?.[3],
            credentialName: params?.[6],
            displayName: params?.[7],
            bindingName: params?.[8],
            match: JSON.parse(String(params?.[9])),
            auth: JSON.parse(String(params?.[10])),
            fakeEnv: JSON.parse(String(params?.[11])),
            status: "pending",
            providerRevision: null,
            providerMetadata: {},
            lastError: null,
            injectedAt: null,
            detachedAt: null,
            createdByUserId: params?.[12],
            createdByLabel: params?.[13],
            createdAt: now,
            updatedAt: now
          });
          return { rowCount: 1, rows: [] as never[] };
        }
        if (text.includes("SET status = 'injected'")) {
          Object.assign(attachment, {
            status: "injected",
            providerRevision: params?.[1],
            providerMetadata: JSON.parse(String(params?.[2])),
            injectedAt: now,
            updatedAt: now
          });
          return { rowCount: 1, rows: [attachment] as never[] };
        }
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "created");
  if (result.kind !== "created") return;
  assert.equal(result.credentialAttachments?.[0]?.sourceRef, "vlt_openai");
  assert.equal(result.credentialAttachments?.[0]?.credentialName, "openai");
  assert.equal(result.credentialAttachments?.[0]?.bindingName, "openai-api");
  assert.deepEqual(vaultCalls[0]?.credentials, [{ name: "openai", value: "stored-real-secret" }]);
  assert.deepEqual(runtimeState.createInput?.snapshot, { provider: "fake", providerSnapshotId: "provider_snp" });
  assert.deepEqual(runtimeState.createInput?.env, { AGENT_OPENAI_API_KEY: "fake-openai-key" });
  assert.deepEqual(runtimeState.createInput?.egressPolicy, {
    defaultAction: "deny",
    egress: [{ action: "allow", target: "api.openai.com" }]
  });
  assert.equal(JSON.stringify(calls.map((call) => call.params)).includes("stored-real-secret"), false);
});

test("createSandbox rejects mapped stored secrets with the wrong provider preset", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const result = await createSandbox(
    {
      organizationId: "org_sbx",
      userId: "user_sbx",
      actorLabel: "user@test.local",
      templateRef: "open-agents-dev",
      name: "slot-runner",
      ttlSeconds: 300,
      env: {},
      credentialMappings: [{
        slotId: "llm",
        source: {
          sourceType: "harakiri_encrypted",
          secretId: "vlt_github"
        }
      }]
    },
    {
      runtimeProvider: {
        ...fakeRuntimeProvider(),
        applyCredentialVault: async () => {
          throw new Error("provider should not be called");
        }
      },
      resolveTemplateFn: async () => readyTemplateWithOpenAiSlot,
      ensureTemplateImageDigestFn: async (template) => template,
      decryptSecret: () => "github-secret",
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      query: async (text, params) => {
        calls.push({ text, params });
        if (text.includes("SELECT role FROM memberships")) return { rowCount: 1, rows: [{ role: "admin" }] as never[] };
        if (text.includes("FROM workspace_credential_secrets")) {
          return {
            rowCount: 1,
            rows: [{
              id: "vlt_github",
              name: "GitHub",
              providerPresetId: "github",
              sourceType: "harakiri_encrypted",
              version: 1,
              fakeEnv: { GITHUB_TOKEN: "fake-github-token" },
              binding: credentialProviderPresetCatalog.github.binding,
              egressDomains: ["github.com"],
              hasEncryptedSecret: true,
              metadata: {},
              createdByUserId: "user_sbx",
              createdByLabel: "user@test.local",
              rotatedAt: null,
              disabledAt: null,
              deletedAt: null,
              createdAt: new Date("2026-09-03T12:00:00.000Z"),
              updatedAt: new Date("2026-09-03T12:00:00.000Z"),
              secretCiphertext: "ciphertext",
              secretIv: "iv",
              secretTag: "tag"
            }] as never[]
          };
        }
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "credential_vault_invalid_binding");
  assert.match(result.kind === "credential_vault_invalid_binding" ? result.message : "", /cannot satisfy template slot/);
  assert.equal(calls.some((call) => call.text.includes("INSERT INTO sandboxes")), false);
});

test("createSandbox rejects unsatisfied required template credential slots before DB writes", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const runtimeState: { createInput?: unknown } = {};
  const result = await createSandbox(
    {
      organizationId: "org_sbx",
      userId: "user_sbx",
      actorLabel: "user@test.local",
      templateRef: "open-agents-dev",
      name: "slot-runner",
      ttlSeconds: 300,
      env: {}
    },
    {
      runtimeProvider: fakeRuntimeProvider(runtimeState),
      resolveTemplateFn: async () => readyTemplateWithOpenAiSlot,
      ensureTemplateImageDigestFn: async (template) => template,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      query: async (text, params) => {
        calls.push({ text, params });
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "credential_vault_required_slot_missing");
  assert.match(result.kind === "credential_vault_required_slot_missing" ? result.message : "", /requires credential slot: llm/);
  assert.deepEqual(result.kind === "credential_vault_required_slot_missing" ? result.missingSlots : [], ["llm"]);
  assert.equal(calls.length, 0);
  assert.equal(runtimeState.createInput, undefined);
});

test("createSandbox rejects missing mapped template slots before DB writes", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const result = await createSandbox(
    {
      organizationId: "org_sbx",
      userId: "user_sbx",
      actorLabel: "user@test.local",
      templateRef: "python-3.12",
      name: "slot-runner",
      ttlSeconds: 300,
      env: {},
      credentialMappings: [{
        slotId: "llm",
        source: {
          sourceType: "harakiri_encrypted",
          secretId: "vlt_openai"
        }
      }]
    },
    {
      runtimeProvider: {
        ...fakeRuntimeProvider(),
        applyCredentialVault: async () => {
          throw new Error("provider should not be called");
        }
      },
      resolveTemplateFn: async () => readyTemplate,
      ensureTemplateImageDigestFn: async (template) => template,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      query: async (text, params) => {
        calls.push({ text, params });
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "credential_vault_invalid_binding");
  assert.match(result.kind === "credential_vault_invalid_binding" ? result.message : "", /was not found/);
  assert.equal(calls.length, 0);
});

test("createSandbox rejects disabled stored credentials before DB writes", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const result = await createSandbox(
    {
      organizationId: "org_sbx",
      userId: "user_sbx",
      actorLabel: "user@test.local",
      templateRef: "python-3.12",
      name: "stored-runner",
      ttlSeconds: 300,
      env: {},
      credentials: [{
        sourceType: "harakiri_encrypted",
        secretId: "vlt_disabled"
      }]
    },
    {
      runtimeProvider: {
        ...fakeRuntimeProvider(),
        applyCredentialVault: async () => {
          throw new Error("provider should not be called");
        }
      },
      resolveTemplateFn: async () => readyTemplate,
      ensureTemplateImageDigestFn: async (template) => template,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      query: async (text, params) => {
        calls.push({ text, params });
        if (text.includes("SELECT role FROM memberships")) return { rowCount: 1, rows: [{ role: "admin" }] as never[] };
        if (text.includes("FROM workspace_credential_secrets")) {
          return {
            rowCount: 1,
            rows: [{
              id: "vlt_disabled",
              name: "OpenAI disabled",
              providerPresetId: "openai",
              sourceType: "harakiri_encrypted",
              version: 1,
              fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
              binding: credentialProviderPresetCatalog.openai.binding,
              egressDomains: ["api.openai.com"],
              hasEncryptedSecret: true,
              metadata: {},
              createdByUserId: "user_sbx",
              createdByLabel: "user@test.local",
              rotatedAt: null,
              disabledAt: new Date("2026-09-03T12:00:00.000Z"),
              deletedAt: null,
              createdAt: new Date("2026-09-03T12:00:00.000Z"),
              updatedAt: new Date("2026-09-03T12:00:00.000Z"),
              secretCiphertext: "ciphertext",
              secretIv: "iv",
              secretTag: "tag"
            }] as never[]
          };
        }
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "credential_secret_disabled");
  assert.equal(calls.some((call) => call.text.includes("INSERT INTO sandboxes")), false);
});

test("createSandbox rejects create-time credentials on async create before DB writes", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const result = await createSandbox(
    {
      organizationId: "org_sbx",
      userId: "user_sbx",
      actorLabel: "user@test.local",
      templateRef: "python-3.12",
      name: "agent-runner",
      ttlSeconds: 300,
      env: {},
      wait: false,
      credentials: [{
        value: "real-secret",
        binding: {
          match: { hosts: ["api.openai.com"] },
          auth: { type: "bearer" }
        }
      }]
    },
    {
      runtimeProvider: fakeRuntimeProvider(),
      resolveTemplateFn: async () => readyTemplate,
      ensureTemplateImageDigestFn: async (template) => template,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      query: async (text, params) => {
        calls.push({ text, params });
        return { rowCount: 0, rows: [] as never[] };
      }
    }
  );

  assert.equal(result.kind, "credential_vault_create_requires_sync");
  assert.equal(calls.length, 0);
});

test("createSandbox rejects create-time fake env conflicts before DB writes", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const result = await createSandbox(
    {
      organizationId: "org_sbx",
      userId: "user_sbx",
      actorLabel: "user@test.local",
      templateRef: "python-3.12",
      name: "agent-runner",
      ttlSeconds: 300,
      env: { OPENAI_API_KEY: "already-set" },
      credentials: [{
        value: "real-secret",
        fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
        binding: {
          match: { hosts: ["api.openai.com"] },
          auth: { type: "bearer" }
        }
      }]
    },
    {
      runtimeProvider: {
        ...fakeRuntimeProvider(),
        applyCredentialVault: async () => {
          throw new Error("provider should not be called");
        }
      },
      idFactory: (prefix) => `${prefix}_fixed`,
      resolveTemplateFn: async () => readyTemplate,
      ensureTemplateImageDigestFn: async (template) => template,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      query: async (text, params) => {
        calls.push({ text, params });
        return { rowCount: 0, rows: [] as never[] };
      }
    }
  );

  assert.equal(result.kind, "credential_vault_invalid_binding");
  assert.match(result.kind === "credential_vault_invalid_binding" ? result.message : "", /conflicts/);
  assert.equal(calls.length, 0);
});

test("createSandbox rejects duplicate create-time credential names before DB writes", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const result = await createSandbox(
    {
      organizationId: "org_sbx",
      userId: "user_sbx",
      actorLabel: "user@test.local",
      templateRef: "python-3.12",
      name: "agent-runner",
      ttlSeconds: 300,
      env: {},
      credentials: [
        {
          credentialName: "dup",
          binding: {
            name: "one",
            match: { hosts: ["api-one.example.com"] },
            auth: { type: "bearer" }
          },
          value: "real-secret-one"
        },
        {
          credentialName: "dup",
          binding: {
            name: "two",
            match: { hosts: ["api-two.example.com"] },
            auth: { type: "bearer" }
          },
          value: "real-secret-two"
        }
      ]
    },
    {
      runtimeProvider: {
        ...fakeRuntimeProvider(),
        applyCredentialVault: async () => {
          throw new Error("provider should not be called");
        }
      },
      resolveTemplateFn: async () => readyTemplate,
      ensureTemplateImageDigestFn: async (template) => template,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      query: async (text, params) => {
        calls.push({ text, params });
        return { rowCount: 0, rows: [] as never[] };
      }
    }
  );

  assert.equal(result.kind, "credential_vault_invalid_binding");
  assert.match(result.kind === "credential_vault_invalid_binding" ? result.message : "", /credential dup is already declared/);
  assert.equal(calls.length, 0);
});

test("createSandbox restores a ready snapshot through the provider snapshot ref", async () => {
  const runtimeState: { createInput?: any } = {};
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const result = await createSandbox(
    {
      organizationId: "org_sbx",
      userId: "user_sbx",
      actorLabel: "user@test.local",
      snapshotId: "snp_ready",
      name: "restored-runner",
      ttlSeconds: 300,
      env: {}
    },
    {
      runtimeProvider: fakeRuntimeProvider(runtimeState),
      idFactory: () => "sbx_restored",
      resolveTemplateFn: async (templateRef) => {
        assert.equal(templateRef, "python-3.12");
        return readyTemplate;
      },
      ensureTemplateImageDigestFn: async (template) => template,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      query: async (text, params) => {
        calls.push({ text, params });
        if (text.includes("FROM sandbox_snapshots")) {
          return {
            rowCount: 1,
            rows: [{
              id: "snp_ready",
              provider: "fake",
              providerSnapshotId: "provider_snp",
              template: "python-3.12",
              templateVersionId: "tplv_ready",
              templateImageDigest: "sha256:abc",
              status: "ready"
            }] as never[]
          };
        }
        if (text.includes("INSERT INTO sandboxes")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("INSERT INTO sandbox_operations")) {
          return { rowCount: 1, rows: [operationRow({ id: "op_restore", sandboxId: "sbx_restored" })] as never[] };
        }
        if (text.includes("FROM sandbox_operations") && text.includes("FOR UPDATE")) {
          return { rowCount: 1, rows: [operationRow({ id: "op_restore", sandboxId: "sbx_restored" })] as never[] };
        }
        if (text.includes("UPDATE sandbox_operations")) {
          return { rowCount: 1, rows: [operationRow({ id: "op_restore", sandboxId: "sbx_restored", state: text.includes("succeeded") ? "succeeded" : "running" })] as never[] };
        }
        if (text.includes("UPDATE sandboxes")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("default_egress_policy")) return { rowCount: 1, rows: [orgEgressSettingsRow()] as never[] };
        if (text.includes("INSERT INTO sandbox_schedules")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("FROM sandboxes s") && text.includes("WHERE s.id = $1")) {
          return {
            rowCount: 1,
            rows: [{ id: "sbx_restored", name: "restored-runner", template: "python-3.12", status: "running" }] as never[]
          };
        }
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "created");
  assert.deepEqual(runtimeState.createInput?.snapshot, { provider: "fake", providerSnapshotId: "provider_snp" });
  assert.equal(runtimeState.createInput?.metadata["harakiri.restore_snapshot"], "snp_ready");
  const operationInsert = calls.find((call) => call.text.includes("INSERT INTO sandbox_operations"));
  assert.ok(operationInsert);
  assert.equal(JSON.parse(String(operationInsert.params?.[5])).restoreSnapshotId, "snp_ready");
  assert.equal(JSON.parse(String(operationInsert.params?.[5])).providerSnapshotId, "provider_snp");
});

test("createSandbox can enqueue async provision and return a pending sandbox", async () => {
  const runtimeState: { createInput?: any } = {};
  const events: Array<{ type: string; metadata?: Record<string, unknown> }> = [];
  const audits: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const result = await createSandbox(
    {
      organizationId: "org_sbx",
      userId: "user_sbx",
      actorLabel: "user@test.local",
      templateRef: "python-3.12",
      name: "agent-runner",
      ttlSeconds: 300,
      env: {},
      wait: false
    },
    {
      runtimeProvider: fakeRuntimeProvider(runtimeState),
      idFactory: () => "sbx_async",
      resolveTemplateFn: async () => readyTemplate,
      ensureTemplateImageDigestFn: async (template) => template,
      recordEvent: async (_organizationId, _sandboxId, type, _message, metadata) => {
        events.push({ type, metadata });
      },
      recordAudit: async (_organizationId, _userId, _actorLabel, action, _targetType, _targetId, metadata) => {
        audits.push({ action, metadata });
      },
      query: async (text, params) => {
        calls.push({ text, params });
        if (text.includes("INSERT INTO sandboxes")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("INSERT INTO sandbox_operations")) {
          return { rowCount: 1, rows: [operationRow({ id: "op_async", sandboxId: "sbx_async" })] as never[] };
        }
        if (text.includes("default_egress_policy")) return { rowCount: 1, rows: [orgEgressSettingsRow()] as never[] };
        if (text.includes("FROM sandboxes s") && text.includes("WHERE s.id = $1")) {
          return {
            rowCount: 1,
            rows: [{ id: "sbx_async", name: "agent-runner", template: "python-3.12", status: "pending" }] as never[]
          };
        }
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "pending");
  if (result.kind === "pending") {
    assert.equal(result.sandbox.id, "sbx_async");
    assert.equal(result.operation.id, "op_async");
    assert.equal(result.operation.state, "queued");
  }
  assert.equal(runtimeState.createInput, undefined);
  const insert = calls.find((call) => call.text.includes("INSERT INTO sandboxes"));
  assert.ok(insert);
  assert.deepEqual(JSON.parse(String(insert.params?.[11])), { defaultAction: "allow", egress: [] });
  assert(!calls.some((call) => call.text.includes("FOR UPDATE")));
  assert.equal(events[0].type, "queued");
  assert.equal(audits[0].action, "sandbox.create.queued");
});

test("createSandbox returns pending when synchronous provision exceeds wait timeout", async () => {
  const runtimeState: { createInput?: any } = {};
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const result = await createSandbox(
    {
      organizationId: "org_sbx",
      userId: "user_sbx",
      actorLabel: "user@test.local",
      templateRef: "python-3.12",
      name: "agent-runner",
      ttlSeconds: 300,
      env: {},
      waitTimeoutMs: 1
    },
    {
      runtimeProvider: {
        ...fakeRuntimeProvider(runtimeState),
        create: async (input) => {
          runtimeState.createInput = input;
          return new Promise<never>(() => undefined);
        }
      },
      idFactory: () => "sbx_timeout",
      resolveTemplateFn: async () => readyTemplate,
      ensureTemplateImageDigestFn: async (template) => template,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      query: async (text, params) => {
        calls.push({ text, params });
        if (text.includes("INSERT INTO sandboxes")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("INSERT INTO sandbox_operations")) {
          return { rowCount: 1, rows: [operationRow({ id: "op_timeout", sandboxId: "sbx_timeout" })] as never[] };
        }
        if (text.includes("UPDATE sandbox_operations") && text.includes("state = 'running'")) {
          return { rowCount: 1, rows: [operationRow({ id: "op_timeout", sandboxId: "sbx_timeout", state: "running", attempts: 1 })] as never[] };
        }
        if (text.includes("default_egress_policy")) return { rowCount: 1, rows: [orgEgressSettingsRow()] as never[] };
        if (text.includes("FROM sandboxes s") && text.includes("WHERE s.id = $1")) {
          return {
            rowCount: 1,
            rows: [{ id: "sbx_timeout", name: "agent-runner", template: "python-3.12", status: "pending" }] as never[]
          };
        }
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "pending");
  if (result.kind === "pending") {
    assert.equal(result.sandbox.id, "sbx_timeout");
    assert.equal(result.operation.id, "op_timeout");
    assert.equal(result.operation.state, "running");
    assert.match(result.message, /still running/);
  }
  assert.equal(runtimeState.createInput?.metadata["harakiri.sandbox"], "sbx_timeout");
  assert(calls.some((call) => call.text.includes("state IN ('queued', 'failed')")));
  assert(!calls.some((call) => call.text.includes("state = 'succeeded'")));
});

test("createSandbox records a failed operation when provider provisioning fails", async () => {
  const runtimeState: { createInput?: any; createError?: Error } = { createError: new Error("provider unavailable") };
  const events: Array<{ type: string; message: string; metadata?: Record<string, unknown> }> = [];
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const result = await createSandbox(
    {
      organizationId: "org_sbx",
      userId: "user_sbx",
      actorLabel: "user@test.local",
      templateRef: "python-3.12",
      name: "agent-runner",
      ttlSeconds: 300,
      env: {}
    },
    {
      runtimeProvider: fakeRuntimeProvider(runtimeState),
      idFactory: () => "sbx_test",
      resolveTemplateFn: async () => readyTemplate,
      ensureTemplateImageDigestFn: async (template) => template,
      recordEvent: async (_organizationId, _sandboxId, type, message, metadata) => {
        events.push({ type, message, metadata });
      },
      recordAudit: async () => undefined,
      query: async (text, params) => {
        calls.push({ text, params });
        if (text.includes("INSERT INTO sandboxes")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("INSERT INTO sandbox_operations")) return { rowCount: 1, rows: [operationRow()] as never[] };
        if (text.includes("FROM sandbox_operations") && text.includes("FOR UPDATE")) return { rowCount: 1, rows: [operationRow()] as never[] };
        if (text.includes("UPDATE sandbox_operations")) return { rowCount: 1, rows: [operationRow({ state: "failed", error: "provider unavailable" })] as never[] };
        if (text.includes("UPDATE sandboxes SET status = 'error'")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("default_egress_policy")) return { rowCount: 1, rows: [orgEgressSettingsRow()] as never[] };
        if (text.includes("FROM sandboxes s") && text.includes("WHERE s.id = $1")) {
          return {
            rowCount: 1,
            rows: [{ id: "sbx_test", name: "agent-runner", template: "python-3.12", status: "error" }] as never[]
          };
        }
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "sandbox_provision_failed");
  assert(calls.some((call) => call.text.includes("INSERT INTO sandboxes")));
  assert(calls.some((call) => call.text.includes("INSERT INTO sandbox_operations")));
  assert(calls.some((call) => call.text.includes("UPDATE sandboxes SET status = 'error'")));
  assert(calls.some((call) => call.text.includes("state = 'failed'")));
  assert.equal(events[0].type, "error");
  assert.match(events[0].message, /provider unavailable/);
});

test("updateSandboxSource stores sanitized source provenance and records audit metadata", async () => {
  const events: Array<{ type: string; message: string; metadata?: Record<string, unknown> }> = [];
  const audits: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const source = {
    type: "git" as const,
    url: "https://oauth2:ghp_secret@github.com/acme/private.git",
    branch: "main",
    targetPath: "/workspace/project",
    credentialPersistence: "one-shot" as const,
    status: "failed" as const,
    failureReason: "fatal token=ghp_secret"
  };
  const result = await updateSandboxSource(
    {
      organizationId: "org_sbx",
      userId: "user_sbx",
      actorLabel: "user@test.local",
      sandboxId: "sbx_source",
      source
    },
    {
      recordEvent: async (_organizationId, _sandboxId, type, message, metadata) => events.push({ type, message, metadata }),
      recordAudit: async (_organizationId, _userId, _actorLabel, action, _targetType, _targetId, metadata) => audits.push({ action, metadata }),
      query: async (text, params) => {
        calls.push({ text, params });
        if (text.includes("UPDATE sandboxes") && text.includes("source_provenance")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("FROM sandboxes s") && text.includes("WHERE s.id = $1")) {
          return {
            rowCount: 1,
            rows: [{
              id: "sbx_source",
              opensandboxId: "provider_source",
              name: "source-runner",
              template: "python-3.12",
              status: "running",
              cpu: 3,
              mem: 128,
              started: "00h 01m",
              owner: "user@test.local",
              cost: 0,
              ttlSeconds: 300,
              expiresAt: null,
              publicUrl: null,
              source: JSON.parse(String(calls[0].params?.[2])),
              createdAt: new Date("2026-06-04T00:00:00Z")
            }] as never[]
          };
        }
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.ok(result);
  assert.equal(result?.source?.status, "failed");
  assert.equal(result?.source?.url, "https://github.com/acme/private.git");
  assert.equal(JSON.stringify(calls[0].params).includes("ghp_secret"), false);
  assert.equal(events[0].type, "source.failed");
  assert.equal(audits[0].action, "sandbox.source.update");
  assert.equal(JSON.stringify(events[0].metadata).includes("ghp_secret"), false);
});

test("deleteSandbox and renewSandbox use injected provider refs", async () => {
  const runtimeState: { deletedRef?: any; renewedRef?: any; renewedInput?: any } = {};
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const query = async (text: string, params?: unknown[]) => {
    calls.push({ text, params });
    if (text.includes("SELECT opensandbox_id, ttl_seconds")) {
      return { rowCount: 1, rows: [{ opensandbox_id: "provider_sbx", ttl_seconds: 300, status: "running", expires_at: null }] as never[] };
    }
    if (text.includes("SELECT clock_timestamp")) return { rows: [{ now: new Date() }] as never[] };
    if (text.includes("SELECT opensandbox_id, workspace_id, status FROM sandboxes")) {
      return { rowCount: 1, rows: [{ opensandbox_id: "provider_sbx", workspace_id: null, status: "running" }] as never[] };
    }
    if (text.includes("INSERT INTO sandbox_operations")) return { rowCount: 1, rows: [operationRow()] as never[] };
    if (text.includes("FROM sandbox_operations") && text.includes("FOR UPDATE")) return { rowCount: 1, rows: [operationRow({ state: "running" })] as never[] };
    if (text.includes("UPDATE sandbox_operations")) {
      return { rowCount: 1, rows: [operationRow({ state: text.includes("succeeded") ? "succeeded" : "running" })] as never[] };
    }
    return { rowCount: 1, rows: [] as never[] };
  };

  const runtimeProvider = fakeRuntimeProvider(runtimeState);
  runtimeProvider.get = async () => ({ provider: "fake", providerSandboxId: "provider_sbx", state: "running", expiresAt: null });
  const deleted = await deleteSandbox(
    { organizationId: "org_sbx", userId: "user_sbx", actorLabel: "user@test.local", sandboxId: "sbx_test" },
    {
      query,
      runtimeProvider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined
    }
  );
  const renewed = await renewSandbox(
    { organizationId: "org_sbx", sandboxId: "sbx_test" },
    {
      query,
      transaction: (fn) => fn(query),
      runtimeProvider,
      recordEvent: async () => undefined
    }
  );

  assert.equal(deleted, true);
  assert.equal(renewed, true);
  assert.deepEqual(runtimeState.deletedRef, { provider: "fake", providerSandboxId: "provider_sbx" });
  assert.deepEqual(runtimeState.renewedRef, { provider: "fake", providerSandboxId: "provider_sbx" });
  assert.match(runtimeState.renewedInput.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
  assert(calls.filter((call) => call.text.includes("INSERT INTO sandbox_operations")).length >= 2);
  assert(calls.some((call) => call.text.includes("UPDATE sandboxes SET status = 'terminated'")));
  assert(calls.some((call) => call.text.includes("UPDATE sandboxes SET expires_at")));
});
