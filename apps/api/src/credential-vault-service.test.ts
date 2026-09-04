import assert from "node:assert/strict";
import test from "node:test";
import {
  credentialProviderPresetCatalog,
  templateCredentialSlotFromInput,
  type CredentialSecretSummary,
  type DynamicCredentialIssuerSummary,
  type CredentialVaultProviderState,
  type ExternalSecretReferenceSummary,
  type SandboxCredentialAttachmentSummary
} from "@harakiri/shared";
import type { RuntimeProvider } from "./providers/runtime/provider.js";
import type { ExternalSecretResolverRegistry } from "./providers/secrets/provider.js";
import type { DynamicCredentialIssuerRegistry } from "./providers/credentials/provider.js";
import {
  attachSandboxCredential,
  detachSandboxCredential,
  inspectSandboxCredentials,
  listSandboxCredentials,
  prepareTemplateCredentialSlotAttachment,
  refreshSandboxCredential,
  rehydrateSandboxCredentials,
  testSandboxCredential
} from "./services/credential-vault.js";

const now = new Date("2026-09-03T12:00:00.000Z");

type AttachmentRow = Omit<SandboxCredentialAttachmentSummary, "createdAt" | "updatedAt" | "injectedAt" | "detachedAt"> & {
  createdAt: Date;
  updatedAt: Date;
  injectedAt: Date | null;
  detachedAt: Date | null;
};

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
};

type ExternalReferenceRow = Omit<
  ExternalSecretReferenceSummary,
  "sourceType" | "status" | "usePolicy" | "validation" | "usage" | "capabilities" |
  "createdAt" | "updatedAt" | "disabledAt" | "deletedAt"
> & {
  memberUseAllowed: boolean;
  validationState: ExternalSecretReferenceSummary["validation"]["state"];
  validationMessage: string | null;
  resolvedVersionRef: string | null;
  validatedAt: Date | null;
  disabledAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  activeSandboxCount: number;
  attachmentCount: number;
  lastAttachedAt: Date | null;
};

type DynamicIssuerRow = {
  id: string;
  name: string;
  issuerType: "github_app_installation";
  scope: DynamicCredentialIssuerSummary["scope"];
  memberUseAllowed: boolean;
  version: number;
  fakeEnv: Record<string, string>;
  binding: DynamicCredentialIssuerSummary["binding"];
  egressDomains: string[];
  metadata: Record<string, unknown>;
  validationState: DynamicCredentialIssuerSummary["validation"]["state"];
  validationMessage: string | null;
  validatedAt: Date | null;
  lastIssuedAt: Date | null;
  createdByUserId: string | null;
  createdByLabel: string | null;
  disabledAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  activeSandboxCount: number;
  attachmentCount: number;
  lastAttachedAt: Date | null;
};

const workspaceSecret = (overrides: Partial<SecretRow> = {}): SecretRow => ({
  id: "vlt_openai",
  name: "OpenAI production",
  providerPresetId: "openai",
  customProfile: null,
  sourceType: "harakiri_encrypted",
  memberUseAllowed: false,
  version: 1,
  fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
  binding: credentialProviderPresetCatalog.openai.binding,
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
  secretCiphertext: "cipher-secret",
  secretIv: "iv-secret",
  secretTag: "tag-secret",
  ...overrides
});

const credentialAttachment = (overrides: Partial<AttachmentRow> = {}): AttachmentRow => ({
  id: "sca_openai",
  sandboxId: "sbx_test",
  displayName: "OpenAI production",
  sourceType: "harakiri_encrypted",
  sourceRef: "vlt_openai",
  credentialName: "openai-vlt_openai",
  bindingName: "openai-api-vlt_openai",
  match: credentialProviderPresetCatalog.openai.binding.match,
  auth: credentialProviderPresetCatalog.openai.binding.auth,
  fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
  status: "requires_reinjection",
  provider: "fake",
  providerRevision: 1,
  providerMetadata: {},
  sourceMetadata: {},
  expiresAt: null,
  refreshState: "not_applicable",
  refreshAttemptedAt: null,
  refreshedAt: null,
  providerState: "unknown",
  providerCheckedAt: null,
  lastError: "runtime vault state was reset",
  injectedAt: now,
  detachedAt: null,
  createdByUserId: "user_admin",
  createdByLabel: "admin@example.com",
  createdAt: now,
  updatedAt: now,
  ...overrides
});

const externalReference = (overrides: Partial<ExternalReferenceRow> = {}): ExternalReferenceRow => ({
  id: "xsr_openai",
  name: "OpenAI from cluster",
  providerPresetId: "openai",
  customProfile: null,
  resolverType: "kubernetes_secret",
  reference: { namespace: "harakiri", name: "agent-credentials", key: "OPENAI_API_KEY" },
  memberUseAllowed: true,
  version: 1,
  fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
  binding: credentialProviderPresetCatalog.openai.binding,
  egressDomains: credentialProviderPresetCatalog.openai.egressDomains,
  metadata: {},
  validationState: "unvalidated",
  validationMessage: null,
  resolvedVersionRef: null,
  validatedAt: null,
  createdByUserId: "user_admin",
  createdByLabel: "admin@example.com",
  disabledAt: null,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
  activeSandboxCount: 0,
  attachmentCount: 0,
  lastAttachedAt: null,
  ...overrides
});

const dynamicIssuer = (overrides: Partial<DynamicIssuerRow> = {}): DynamicIssuerRow => ({
  id: "dci_github",
  name: "Agent repositories",
  issuerType: "github_app_installation",
  scope: {
    installationId: "321",
    repositories: ["agent-runtime"],
    permissions: { contents: "write", metadata: "read" }
  },
  memberUseAllowed: true,
  version: 1,
  fakeEnv: credentialProviderPresetCatalog.github.fakeEnv,
  binding: credentialProviderPresetCatalog.github.binding,
  egressDomains: credentialProviderPresetCatalog.github.egressDomains,
  metadata: {},
  validationState: "valid",
  validationMessage: null,
  validatedAt: now,
  lastIssuedAt: now,
  createdByUserId: "user_admin",
  createdByLabel: "admin@example.com",
  disabledAt: null,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
  activeSandboxCount: 1,
  attachmentCount: 1,
  lastAttachedAt: now,
  ...overrides
});

const successfulExternalResolvers: ExternalSecretResolverRegistry = {
  kubernetes_secret: {
    type: "kubernetes_secret",
    resolve: async () => ({ kind: "ok", value: "external-real-secret", versionRef: "rv-42" })
  }
};

const createHarness = (options: {
  providerFails?: boolean;
  egressFails?: boolean;
  egressUnsafe?: boolean;
  egressPolicy?: { mode: "open" | "restricted" | "blocked" | "custom"; allow?: string[] };
  runFails?: boolean;
  providerReadFails?: boolean;
  providerVault?: CredentialVaultProviderState | null;
  sandboxStatus?: string;
  role?: string;
} = {}) => {
  const attachments = new Map<string, AttachmentRow>();
  const secrets = new Map<string, SecretRow>();
  const externalReferences = new Map<string, ExternalReferenceRow>();
  const dynamicIssuers = new Map<string, DynamicIssuerRow>();
  const calls: Array<{ credentials: Array<{ name: string; value: string }>; bindings: unknown[] }> = [];
  const egressCalls: unknown[] = [];
  const databaseParams: unknown[][] = [];
  const runCalls: string[] = [];
  const vault: CredentialVaultProviderState = {
    revision: 3,
    credentials: [{ name: "cred_api", sourceType: "inline", revision: 3 }],
    bindings: [{ name: "api-header", revision: 3, auth: { type: "apiKey", name: "x-api-key" } }]
  };
  const provider: RuntimeProvider = {
    kind: "fake",
    capabilities: {
      terminal: true,
      filesystem: true,
      logs: true,
      metrics: true,
      routes: true,
      egress: true,
      credentialVault: true,
      credentialVaultPatch: true,
      credentialVaultSanitizedRead: true
    },
    create: async () => {
      throw new Error("not used");
    },
    list: async () => [],
    get: async () => null,
    delete: async () => undefined,
    renew: async () => undefined,
    run: async (input) => {
      runCalls.push(input.command);
      if (options.runFails) throw new Error("provider timeout with bearer real-secret");
      return {
        sandboxId: input.controlPlaneSandboxId,
        command: input.command,
        stdout: "http_status=200\n",
        stderr: "",
        exitCode: 0,
        durationMs: 18
      };
    },
    files: async () => {
      throw new Error("not used");
    },
    logs: async () => [],
    metrics: async () => null,
    exposeRoute: async () => {
      throw new Error("not used");
    },
    setEgressPolicy: async (_ref, policy) => {
      if (options.egressFails) throw new Error("egress sidecar unavailable");
      egressCalls.push(policy);
      return {
        status: "ready",
        enforcementMode: options.egressUnsafe ? "dns" : "dns+nft",
        credentialVaultReady: !options.egressUnsafe,
        policy
      };
    },
    applyCredentialVault: async (input) => {
      calls.push({ credentials: input.credentials, bindings: input.bindings });
      if (options.providerFails) throw new Error("provider rejected api-key=real-secret");
      return vault;
    },
    getCredentialVault: async () => {
      if (options.providerReadFails) throw new Error("provider read failed with real-secret");
      return options.providerVault === undefined ? vault : options.providerVault;
    },
    deleteCredentialVaultEntries: async () => ({ revision: 4, credentials: [], bindings: [] })
  };
  const query = async (text: string, params: unknown[] = []) => {
    databaseParams.push(params);
    if (text.includes("SELECT role FROM memberships")) {
      const role = options.role ?? "admin";
      return { rowCount: role ? 1 : 0, rows: role ? [{ role }] as never[] : [] };
    }
    if (text.includes("FROM organizations WHERE id = $1")) {
      return {
        rowCount: 1,
        rows: [{
          defaultEgressPolicy: { mode: "open" },
          egressAllowedPresets: ["python-packages", "node-packages", "git-hosting", "llm-apis", "browser-basic"],
          egressCustomDomainsEnabled: true,
          egressMaxRules: 128,
          egressRedactDomains: false
        }] as never[]
      };
    }
    if (text.includes("FROM workspace_credential_secrets")) {
      const row = secrets.get(params[1] as string);
      return { rowCount: row ? 1 : 0, rows: row && !row.deletedAt ? [row] as never[] : [] };
    }
    if (text.includes("SET validation_state") && text.includes("external_secret_references")) {
      const row = externalReferences.get(params[1] as string);
      if (!row) return { rowCount: 0, rows: [] };
      row.validationState = params[2] as ExternalReferenceRow["validationState"];
      row.validationMessage = params[3] as string | null;
      row.resolvedVersionRef = params[4] as string | null;
      row.validatedAt = now;
      row.updatedAt = now;
      return { rowCount: 1, rows: [] };
    }
    if (text.includes("FROM external_secret_references external_reference")) {
      const row = externalReferences.get(params[1] as string);
      return { rowCount: row && !row.deletedAt ? 1 : 0, rows: row && !row.deletedAt ? [row] as never[] : [] };
    }
    if (text.includes("UPDATE dynamic_credential_issuers") && text.includes("SET validation_state")) {
      const row = dynamicIssuers.get(params[1] as string);
      if (row) {
        row.validationState = params[2] as DynamicIssuerRow["validationState"];
        row.validationMessage = params[3] as string | null;
        row.validatedAt = now;
        if (params[4]) row.lastIssuedAt = now;
      }
      return { rowCount: row ? 1 : 0, rows: [] };
    }
    if (text.includes("FROM dynamic_credential_issuers dynamic_issuer")) {
      const row = dynamicIssuers.get(params[1] as string);
      return { rowCount: row && !row.deletedAt ? 1 : 0, rows: row && !row.deletedAt ? [row] as never[] : [] };
    }
    if (text.includes("FROM sandboxes WHERE id = $1 AND organization_id = $2")) {
      if (params[0] !== "sbx_test" || params[1] !== "org_test") return { rowCount: 0, rows: [] };
      return {
        rowCount: 1,
        rows: [{
          id: "sbx_test",
          opensandboxId: "provider_sbx",
          status: options.sandboxStatus ?? "running",
          egressPolicy: options.egressPolicy ?? { mode: "open" }
        }] as never[]
      };
    }
    if (text.includes("UPDATE sandboxes") && text.includes("egress_compiled_policy")) {
      return { rowCount: 1, rows: [] };
    }
    if (text.includes("SET provider_state = $4")) {
      const ids = new Set(params[2] as string[]);
      const state = params[3] as AttachmentRow["providerState"];
      for (const attachment of attachments.values()) {
        if (!ids.has(attachment.id) || attachment.detachedAt) continue;
        attachment.providerState = state;
        attachment.providerCheckedAt = now.toISOString();
        if (params[4] !== null) {
          attachment.providerRevision = params[4] as number;
          attachment.providerMetadata = JSON.parse(params[5] as string);
        }
        if (state === "missing") {
          attachment.status = "requires_reinjection";
          attachment.lastError = params[7] as string;
        } else if (state === "present") {
          attachment.status = "injected";
          attachment.lastError = null;
        }
        attachment.updatedAt = now;
      }
      return { rowCount: ids.size, rows: [] };
    }
    if (text.includes("FROM sandbox_credential_attachments") && text.includes("credential_name") && text.includes("binding_name") && text.includes("LIMIT 1")) {
      const duplicate = [...attachments.values()].find((attachment) =>
        attachment.sandboxId === params[0]
          && !attachment.detachedAt
          && (attachment.bindingName === params[1] || attachment.credentialName === params[2])
      );
      return {
        rowCount: duplicate ? 1 : 0,
        rows: duplicate
          ? [{ id: duplicate.id, credentialName: duplicate.credentialName, bindingName: duplicate.bindingName }] as never[]
          : []
      };
    }
    if (text.includes("INSERT INTO sandbox_credential_attachments")) {
      const [
        id,
        _organizationId,
        sandboxId,
        providerName,
        sourceType,
        sourceRef,
        credentialName,
        displayName,
        bindingName,
        match,
        auth,
        fakeEnv,
        sourceMetadata,
        expiresAt,
        actorUserId,
        actorLabel
      ] = params as string[];
      attachments.set(id, {
        id,
        sandboxId,
        displayName,
        sourceType: sourceType as AttachmentRow["sourceType"],
        sourceRef: sourceRef || null,
        credentialName,
        bindingName,
        match: JSON.parse(match),
        auth: JSON.parse(auth),
        fakeEnv: JSON.parse(fakeEnv),
        status: "pending",
        provider: providerName,
        providerRevision: null,
        providerMetadata: {},
        sourceMetadata: JSON.parse(sourceMetadata),
        expiresAt: expiresAt || null,
        refreshState: sourceType === "dynamic" ? "current" : "not_applicable",
        refreshAttemptedAt: null,
        refreshedAt: null,
        providerState: "unknown",
        providerCheckedAt: null,
        lastError: null,
        injectedAt: null,
        detachedAt: null,
        createdByUserId: actorUserId,
        createdByLabel: actorLabel,
        createdAt: now,
        updatedAt: now
      });
      return { rowCount: 1, rows: [] };
    }
    if (text.includes("SET status = 'failed'")) {
      const attachment = attachments.get(params[0] as string);
      assert.ok(attachment);
      attachment.status = "failed";
      attachment.lastError = params[1] as string;
      attachment.updatedAt = now;
      return { rowCount: 1, rows: [attachment] as never[] };
    }
    if (text.includes("SET status = 'requires_reinjection'")) {
      const attachment = attachments.get(params[0] as string);
      assert.ok(attachment);
      attachment.status = "requires_reinjection";
      attachment.lastError = params[3] as string;
      attachment.updatedAt = now;
      return { rowCount: 1, rows: [attachment] as never[] };
    }
    if (text.includes("SET status = CASE") && text.includes("refresh_attempted_at = now()")) {
      const attachment = attachments.get(params[0] as string);
      assert.ok(attachment);
      if (attachment.expiresAt && new Date(attachment.expiresAt).getTime() <= Date.now()) {
        attachment.status = "requires_reinjection";
      }
      attachment.refreshAttemptedAt = now.toISOString();
      attachment.lastError = params[3] as string;
      attachment.updatedAt = now;
      return { rowCount: 1, rows: [attachment] as never[] };
    }
    if (text.includes("SET status = 'injected'")) {
      const attachment = attachments.get(params[0] as string);
      assert.ok(attachment);
      attachment.status = "injected";
      attachment.providerState = "present";
      attachment.providerCheckedAt = now.toISOString();
      const revisionIndex = text.includes("provider_revision = $4") ? 3 : 1;
      attachment.providerRevision = params[revisionIndex] as number;
      attachment.providerMetadata = JSON.parse(params[revisionIndex + 1] as string);
      if (params[revisionIndex + 2]) {
        attachment.sourceMetadata = JSON.parse(params[revisionIndex + 2] as string);
        attachment.expiresAt = params[revisionIndex + 3] as string | null;
      }
      if (text.includes("refreshed_at = now()")) attachment.refreshedAt = now.toISOString();
      if (text.includes("refresh_attempted_at = now()")) attachment.refreshAttemptedAt = now.toISOString();
      attachment.injectedAt = now;
      attachment.lastError = null;
      attachment.updatedAt = now;
      return { rowCount: 1, rows: [attachment] as never[] };
    }
    if (text.includes("SET status = 'detached'")) {
      const attachment = attachments.get(params[0] as string);
      assert.ok(attachment);
      attachment.status = "detached";
      attachment.providerState = "missing";
      attachment.providerCheckedAt = now.toISOString();
      attachment.providerRevision = params[1] as number;
      attachment.providerMetadata = JSON.parse(params[2] as string);
      attachment.detachedAt = now;
      attachment.lastError = null;
      attachment.updatedAt = now;
      return { rowCount: 1, rows: [attachment] as never[] };
    }
    if (text.includes("FROM sandbox_credential_attachments")) {
      if (text.includes("status = 'requires_reinjection'")) {
        const rows = [...attachments.values()].filter((attachment) =>
          attachment.sandboxId === params[1] &&
          !attachment.detachedAt &&
          attachment.status === "requires_reinjection"
        );
        return { rowCount: rows.length, rows: rows as never[] };
      }
      if (text.includes("id = $3")) {
        const attachment = attachments.get(params[2] as string);
        return { rowCount: attachment ? 1 : 0, rows: attachment && !attachment.detachedAt ? [attachment] as never[] : [] };
      }
      return { rowCount: attachments.size, rows: [...attachments.values()] as never[] };
    }
    throw new Error(`unexpected query: ${text}`);
  };
  return { attachments, calls, databaseParams, dynamicIssuers, egressCalls, externalReferences, provider, query, runCalls, secrets };
};

test("attachSandboxCredential injects an ephemeral value and persists only sanitized metadata", async () => {
  const harness = createHarness();
  const result = await attachSandboxCredential(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      actorUserId: "user_test",
      actorLabel: "test@example.com",
      body: {
        displayName: "Private API",
        credentialName: "cred_api",
        value: "real-secret",
        fakeEnv: { PRIVATE_API_KEY: "fake-key" },
        binding: {
          name: "api-header",
          match: { hosts: ["API.EXAMPLE.COM."], methods: ["get"], paths: ["/v1/*"] },
          auth: { type: "apiKey", name: "x-api-key" }
        }
      }
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      idFactory: (prefix) => `${prefix}_fixed`
    }
  );

  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  assert.equal(harness.calls.length, 1);
  assert.deepEqual(harness.calls[0]?.credentials, [{ name: "cred_api", value: "real-secret" }]);
  assert.deepEqual(harness.egressCalls, [{
    defaultAction: "deny",
    egress: [{ action: "allow", target: "api.example.com" }]
  }]);
  assert.equal(result.attachment.status, "injected");
  assert.equal(result.attachment.providerRevision, 3);
  assert.deepEqual(result.attachment.match.hosts, ["api.example.com"]);
  assert.deepEqual(result.attachment.fakeEnv, { PRIVATE_API_KEY: "fake-key" });
  assert.equal(JSON.stringify(result.attachment).includes("real-secret"), false);

  const list = await listSandboxCredentials({ organizationId: "org_test", sandboxId: "sbx_test" }, harness.query);
  assert.equal(list.kind, "ok");
  if (list.kind === "ok") assert.equal(list.attachments.length, 1);
});

test("attachSandboxCredential fails before injection when credential egress cannot be enforced", async () => {
  const body = {
    value: "real-secret",
    binding: {
      match: { hosts: ["api.example.com"] },
      auth: { type: "bearer" as const }
    }
  };
  for (const harness of [
    createHarness({ egressPolicy: { mode: "blocked" } }),
    createHarness({ egressFails: true }),
    createHarness({ egressUnsafe: true })
  ]) {
    const result = await attachSandboxCredential(
      {
        organizationId: "org_test",
        sandboxId: "sbx_test",
        actorUserId: "user_test",
        actorLabel: "test@example.com",
        body
      },
      {
        query: harness.query,
        runtimeProvider: harness.provider,
        recordEvent: async () => undefined,
        recordAudit: async () => undefined
      }
    );

    assert.equal(result.kind, "egress_conflict");
    assert.equal(harness.calls.length, 0);
    assert.equal(harness.attachments.size, 0);
  }
});

test("attachSandboxCredential rejects a terminated sandbox before source resolution", async () => {
  const harness = createHarness({ sandboxStatus: "terminated" });
  const result = await attachSandboxCredential(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      actorUserId: "user_test",
      actorLabel: "test@example.com",
      body: {
        value: "never-injected-secret",
        binding: {
          match: { hosts: ["api.example.com"] },
          auth: { type: "bearer" }
        }
      }
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined
    }
  );

  assert.deepEqual(result, { kind: "sandbox_not_running", status: "terminated" });
  assert.equal(harness.calls.length, 0);
  assert.equal(harness.attachments.size, 0);
  assert.equal(JSON.stringify(harness.databaseParams).includes("never-injected-secret"), false);
});

test("attachSandboxCredential resolves an encrypted workspace secret for provider injection", async () => {
  const harness = createHarness();
  harness.secrets.set("vlt_openai", workspaceSecret());

  const result = await attachSandboxCredential(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      actorUserId: "user_admin",
      actorLabel: "admin@example.com",
      body: {
        sourceType: "harakiri_encrypted",
        secretId: "vlt_openai"
      }
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      decryptSecret: (encrypted) => {
        assert.equal(encrypted.secretCiphertext, "cipher-secret");
        return "stored-real-secret";
      },
      idFactory: (prefix) => `${prefix}_stored`
    }
  );

  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  assert.deepEqual(harness.calls[0]?.credentials, [{ name: "openai-vlt_openai", value: "stored-real-secret" }]);
  assert.equal(result.attachment.sourceType, "harakiri_encrypted");
  assert.equal(result.attachment.sourceRef, "vlt_openai");
  assert.equal(result.attachment.displayName, "OpenAI production");
  assert.equal(result.attachment.bindingName, "openai-api-vlt_openai");
  assert.deepEqual(result.attachment.sourceMetadata, { providerPresetId: "openai", version: 1 });
  assert.equal(JSON.stringify(result.attachment).includes("stored-real-secret"), false);
});

test("custom workspace credentials satisfy only template slots with the same private API scope", async () => {
  const harness = createHarness();
  const sourceSlot = templateCredentialSlotFromInput({
    id: "internal-api",
    providerPresetId: "custom",
    customProfile: {
      host: "api.internal.example.com",
      authType: "apiKey",
      headerName: "X-Internal-Key",
      methods: ["GET"],
      paths: ["/v1/*"]
    }
  });
  harness.secrets.set("vlt_internal", workspaceSecret({
    id: "vlt_internal",
    name: "Internal API",
    providerPresetId: "custom",
    customProfile: sourceSlot.customProfile,
    fakeEnv: sourceSlot.fakeEnv,
    binding: sourceSlot.binding,
    egressDomains: sourceSlot.egressDomains
  }));
  const dependencies = {
    query: harness.query,
    decryptSecret: () => "internal-real-secret",
    idFactory: (prefix: string) => `${prefix}_custom`
  };

  const matching = await prepareTemplateCredentialSlotAttachment({
    organizationId: "org_test",
    actorUserId: "user_admin",
    slot: sourceSlot,
    body: { slotId: sourceSlot.id, source: { sourceType: "harakiri_encrypted", secretId: "vlt_internal" } }
  }, dependencies);
  assert.equal(matching.kind, "ok");
  if (matching.kind === "ok") {
    assert.equal(matching.attachment.credentialName, "internal-api");
    assert.deepEqual(matching.attachment.binding.match.hosts, ["api.internal.example.com"]);
  }

  const otherSlot = templateCredentialSlotFromInput({
    id: "billing-api",
    providerPresetId: "custom",
    customProfile: { host: "billing.internal.example.com", authType: "bearer" }
  });
  const mismatch = await prepareTemplateCredentialSlotAttachment({
    organizationId: "org_test",
    actorUserId: "user_admin",
    slot: otherSlot,
    body: { slotId: otherSlot.id, source: { sourceType: "harakiri_encrypted", secretId: "vlt_internal" } }
  }, dependencies);
  assert.deepEqual(mismatch, {
    kind: "invalid_binding",
    message: "custom credential source scope cannot satisfy template slot billing-api"
  });
});

test("attachSandboxCredential resolves an external reference without persisting its value", async () => {
  const harness = createHarness({ role: "member" });
  harness.externalReferences.set("xsr_openai", externalReference());

  const result = await attachSandboxCredential(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      actorUserId: "user_member",
      actorLabel: "member@example.com",
      body: { sourceType: "external_ref", referenceId: "xsr_openai" }
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      externalSecretResolvers: successfulExternalResolvers,
      idFactory: (prefix) => `${prefix}_external`
    }
  );

  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  assert.deepEqual(harness.calls[0]?.credentials, [{ name: "openai-xsr_openai", value: "external-real-secret" }]);
  assert.equal(result.attachment.sourceType, "external_ref");
  assert.equal(result.attachment.sourceRef, "xsr_openai");
  assert.equal(result.attachment.displayName, "OpenAI from cluster");
  assert.equal(JSON.stringify(result.attachment).includes("external-real-secret"), false);
  assert.equal(JSON.stringify([...harness.attachments.values()]).includes("external-real-secret"), false);
});

test("attachSandboxCredential fails loudly when an external resolver is unavailable", async () => {
  const harness = createHarness();
  harness.externalReferences.set("xsr_openai", externalReference());

  const result = await attachSandboxCredential(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      actorUserId: "user_admin",
      actorLabel: "admin@example.com",
      body: { sourceType: "external_ref", referenceId: "xsr_openai" }
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      externalSecretResolvers: {}
    }
  );

  assert.equal(result.kind, "external_resolver_unavailable");
  assert.equal(harness.calls.length, 0);
  assert.equal(harness.attachments.size, 0);
});

test("rehydrateSandboxCredentials restores encrypted workspace secret attachments", async () => {
  const harness = createHarness({ role: "member" });
  const events: string[] = [];
  const audits: string[] = [];
  harness.secrets.set("vlt_openai", workspaceSecret());
  harness.attachments.set("sca_openai", credentialAttachment());

  const result = await rehydrateSandboxCredentials(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      actorUserId: "user_member",
      actorLabel: "member@example.com"
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async (_orgId, _sandboxId, type) => {
        events.push(type);
      },
      recordAudit: async (_orgId, _userId, _actorLabel, action) => {
        audits.push(action);
      },
      decryptSecret: (encrypted) => {
        assert.equal(encrypted.secretCiphertext, "cipher-secret");
        return "stored-real-secret";
      }
    }
  );

  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  assert.equal(result.rehydrated, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.skipped, 0);
  assert.deepEqual(harness.calls[0]?.credentials, [{ name: "openai-vlt_openai", value: "stored-real-secret" }]);
  assert.equal(result.attachments[0]?.status, "injected");
  assert.deepEqual(result.attachments[0]?.sourceMetadata, { providerPresetId: "openai", version: 1 });
  assert.equal(result.attachments[0]?.lastError, null);
  assert.equal(JSON.stringify(result.attachments).includes("stored-real-secret"), false);
  assert.deepEqual(events, ["credential.rehydrated"]);
  assert.deepEqual(audits, ["sandbox.credential.rehydrated"]);
});

test("rehydrateSandboxCredentials refuses a source whose credential profile changed", async () => {
  const harness = createHarness();
  harness.secrets.set("vlt_openai", workspaceSecret());
  harness.attachments.set("sca_openai", credentialAttachment({
    sourceMetadata: { providerPresetId: "github", version: 1 }
  }));

  const result = await rehydrateSandboxCredentials(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      actorUserId: "user_admin",
      actorLabel: "admin@example.com"
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      decryptSecret: () => "stored-real-secret"
    }
  );

  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  assert.equal(result.rehydrated, 0);
  assert.equal(result.failed, 1);
  assert.match(result.attachments[0]?.lastError ?? "", /profile changed from github to openai/);
  assert.equal(harness.calls.length, 0);
});

test("rehydrateSandboxCredentials resolves external references again after resume", async () => {
  const harness = createHarness();
  harness.externalReferences.set("xsr_openai", externalReference());
  harness.attachments.set("sca_external", credentialAttachment({
    id: "sca_external",
    sourceType: "external_ref",
    sourceRef: "xsr_openai",
    credentialName: "openai-xsr_openai",
    bindingName: "openai-api-xsr_openai"
  }));

  const result = await rehydrateSandboxCredentials(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      actorUserId: "user_admin",
      actorLabel: "admin@example.com"
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      externalSecretResolvers: successfulExternalResolvers
    }
  );

  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  assert.equal(result.rehydrated, 1);
  assert.deepEqual(harness.calls[0]?.credentials, [{ name: "openai-xsr_openai", value: "external-real-secret" }]);
  assert.equal(result.attachments[0]?.status, "injected");
  assert.equal(JSON.stringify(result.attachments).includes("external-real-secret"), false);
});

test("refreshSandboxCredential replaces a dynamic token without persisting or auditing its value", async () => {
  const harness = createHarness();
  const events: unknown[] = [];
  const audits: unknown[] = [];
  harness.dynamicIssuers.set("dci_github", dynamicIssuer());
  harness.attachments.set("sca_dynamic", credentialAttachment({
    id: "sca_dynamic",
    sourceType: "dynamic",
    sourceRef: "dci_github",
    credentialName: "github-dci_github",
    bindingName: "github-api-dci_github",
    expiresAt: "2099-01-01T00:00:00.000Z",
    refreshState: "current",
    status: "injected"
  }));
  const issuers: DynamicCredentialIssuerRegistry = {
    github_app_installation: {
      type: "github_app_installation",
      validate: async () => ({ kind: "ok" }),
      issue: async () => ({
        kind: "ok",
        value: "ghs_new_transient_token",
        expiresAt: "2099-01-01T01:00:00.000Z",
        metadata: { installationId: "321", repositories: ["agent-runtime"] }
      })
    }
  };

  const result = await refreshSandboxCredential(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      attachmentId: "sca_dynamic",
      actorUserId: "user_admin",
      actorLabel: "admin@example.com"
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      dynamicCredentialIssuers: issuers,
      recordEvent: async (...args) => { events.push(args); },
      recordAudit: async (...args) => { audits.push(args); }
    }
  );

  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  assert.deepEqual(harness.calls[0]?.credentials, [{ name: "github-dci_github", value: "ghs_new_transient_token" }]);
  assert.equal(result.attachment.expiresAt, "2099-01-01T01:00:00.000Z");
  assert.equal(result.attachment.refreshState, "current");
  assert.equal(JSON.stringify(harness.databaseParams).includes("ghs_new_transient_token"), false);
  assert.equal(JSON.stringify(events).includes("ghs_new_transient_token"), false);
  assert.equal(JSON.stringify(audits).includes("ghs_new_transient_token"), false);
  assert.equal(JSON.stringify(result).includes("ghs_new_transient_token"), false);
});

test("refreshSandboxCredential preserves an injected attachment when early renewal fails", async () => {
  const harness = createHarness();
  harness.dynamicIssuers.set("dci_github", dynamicIssuer());
  harness.attachments.set("sca_dynamic", credentialAttachment({
    id: "sca_dynamic",
    sourceType: "dynamic",
    sourceRef: "dci_github",
    credentialName: "github-dci_github",
    bindingName: "github-api-dci_github",
    expiresAt: "2099-01-01T00:00:00.000Z",
    refreshState: "current",
    status: "injected"
  }));
  const issuers: DynamicCredentialIssuerRegistry = {
    github_app_installation: {
      type: "github_app_installation",
      validate: async () => ({ kind: "ok" }),
      issue: async () => ({ kind: "unavailable", message: "GitHub API unavailable" })
    }
  };

  const result = await refreshSandboxCredential(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      attachmentId: "sca_dynamic",
      actorUserId: "user_admin",
      actorLabel: "admin@example.com"
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      dynamicCredentialIssuers: issuers,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined
    }
  );

  assert.equal(result.kind, "source_unavailable");
  if (result.kind !== "source_unavailable") return;
  assert.equal(result.attachment.status, "injected");
  assert.equal(result.attachment.refreshState, "refresh_failed");
  assert.match(result.message, /GitHub API unavailable/);
  assert.equal(harness.calls.length, 0);
});

test("rehydrateSandboxCredentials leaves ephemeral attachments requiring reinjection", async () => {
  const harness = createHarness();
  harness.attachments.set("sca_inline", credentialAttachment({
    id: "sca_inline",
    sourceType: "inline_ephemeral",
    sourceRef: null,
    credentialName: "cred_inline",
    bindingName: "api-header"
  }));

  const result = await rehydrateSandboxCredentials(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      actorUserId: "user_test",
      actorLabel: "test@example.com"
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined
    }
  );

  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  assert.equal(result.rehydrated, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.failed, 0);
  assert.equal(harness.calls.length, 0);
  assert.equal(result.attachments[0]?.status, "requires_reinjection");
  assert.match(result.attachments[0]?.lastError ?? "", /cannot be rehydrated/);
});

test("rehydrateSandboxCredentials preserves stale state and redacts provider failures", async () => {
  const harness = createHarness({ providerFails: true });
  harness.secrets.set("vlt_openai", workspaceSecret());
  harness.attachments.set("sca_openai", credentialAttachment());

  const result = await rehydrateSandboxCredentials(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      actorUserId: "user_admin",
      actorLabel: "admin@example.com"
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      decryptSecret: () => "real-secret"
    }
  );

  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  assert.equal(result.rehydrated, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.attachments[0]?.status, "requires_reinjection");
  assert.equal(result.attachments[0]?.lastError?.includes("real-secret"), false);
});

test("attachSandboxCredential rejects duplicate provider credential names", async () => {
  const harness = createHarness();
  const base = {
    organizationId: "org_test",
    sandboxId: "sbx_test",
    actorUserId: "user_test",
    actorLabel: "test@example.com"
  };
  const first = await attachSandboxCredential(
    {
      ...base,
      body: {
        displayName: "Private API",
        credentialName: "cred_api",
        value: "real-secret",
        binding: {
          name: "api-header",
          match: { hosts: ["api.example.com"] },
          auth: { type: "bearer" }
        }
      }
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined
    }
  );
  assert.equal(first.kind, "ok");

  const duplicate = await attachSandboxCredential(
    {
      ...base,
      body: {
        displayName: "Other API",
        credentialName: "cred_api",
        value: "other-secret",
        binding: {
          name: "other-header",
          match: { hosts: ["other.example.com"] },
          auth: { type: "bearer" }
        }
      }
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined
    }
  );

  assert.equal(duplicate.kind, "invalid_binding");
  assert.match(duplicate.kind === "invalid_binding" ? duplicate.message : "", /credential cred_api is already attached/);
  assert.equal(harness.calls.length, 1);
});

test("attachSandboxCredential rejects member use of an admin-only workspace secret", async () => {
  const harness = createHarness({ role: "member" });
  harness.secrets.set("vlt_openai", workspaceSecret());

  const result = await attachSandboxCredential(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      actorUserId: "user_member",
      actorLabel: "member@example.com",
      body: {
        sourceType: "harakiri_encrypted",
        secretId: "vlt_openai"
      }
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      decryptSecret: () => {
        throw new Error("decryption should not run for non-admin users");
      }
    }
  );

  assert.equal(result.kind, "secret_forbidden");
  assert.equal(harness.calls.length, 0);
});

test("attachSandboxCredential lets members use an explicitly shared workspace secret", async () => {
  const harness = createHarness({ role: "member" });
  harness.secrets.set("vlt_openai", workspaceSecret({ memberUseAllowed: true }));

  const result = await attachSandboxCredential(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      actorUserId: "user_member",
      actorLabel: "member@example.com",
      body: { sourceType: "harakiri_encrypted", secretId: "vlt_openai" }
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      decryptSecret: () => "shared-real-secret",
      idFactory: (prefix) => `${prefix}_shared`
    }
  );

  assert.equal(result.kind, "ok");
  assert.deepEqual(harness.calls[0]?.credentials, [{ name: "openai-vlt_openai", value: "shared-real-secret" }]);
  assert.equal(JSON.stringify(result).includes("shared-real-secret"), false);
});

test("attachSandboxCredential rejects disabled workspace secrets before provider injection", async () => {
  const harness = createHarness();
  harness.secrets.set("vlt_openai", workspaceSecret({ disabledAt: now }));

  const result = await attachSandboxCredential(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      actorUserId: "user_admin",
      actorLabel: "admin@example.com",
      body: {
        sourceType: "harakiri_encrypted",
        secretId: "vlt_openai"
      }
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      decryptSecret: () => {
        throw new Error("decryption should not run for disabled secrets");
      }
    }
  );

  assert.equal(result.kind, "secret_disabled");
  assert.equal(harness.calls.length, 0);
});

test("attachSandboxCredential rejects missing workspace secrets before provider injection", async () => {
  const harness = createHarness();

  const result = await attachSandboxCredential(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      actorUserId: "user_admin",
      actorLabel: "admin@example.com",
      body: {
        sourceType: "harakiri_encrypted",
        secretId: "vlt_missing"
      }
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      decryptSecret: () => {
        throw new Error("decryption should not run for missing secrets");
      }
    }
  );

  assert.equal(result.kind, "secret_not_found");
  assert.equal(harness.calls.length, 0);
});

test("attachSandboxCredential rejects undecryptable workspace secrets before provider injection", async () => {
  const harness = createHarness();
  harness.secrets.set("vlt_openai", workspaceSecret());

  const result = await attachSandboxCredential(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      actorUserId: "user_admin",
      actorLabel: "admin@example.com",
      body: {
        sourceType: "harakiri_encrypted",
        secretId: "vlt_openai"
      }
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      decryptSecret: () => {
        throw new Error("wrong key");
      }
    }
  );

  assert.equal(result.kind, "secret_decryption_unavailable");
  assert.equal(harness.calls.length, 0);
});

test("attachSandboxCredential rejects fake env values that equal the real credential", async () => {
  const harness = createHarness();
  const result = await attachSandboxCredential(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      actorUserId: "user_test",
      actorLabel: "test@example.com",
      body: {
        value: "real-secret",
        fakeEnv: { PRIVATE_API_KEY: "real-secret" },
        binding: {
          match: { hosts: ["api.example.com"] },
          auth: { type: "bearer" }
        }
      }
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined
    }
  );

  assert.equal(result.kind, "invalid_binding");
  assert.equal(harness.calls.length, 0);
});

test("attachSandboxCredential records a failed metadata row when the provider rejects injection", async () => {
  const harness = createHarness({ providerFails: true });
  const result = await attachSandboxCredential(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      actorUserId: "user_test",
      actorLabel: "test@example.com",
      body: {
        credentialName: "cred_api",
        value: "real-secret",
        binding: {
          name: "api-header",
          match: { hosts: ["api.example.com"] },
          auth: { type: "apiKey", name: "x-api-key" }
        }
      }
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined
    }
  );

  assert.equal(result.kind, "provider_unavailable");
  if (result.kind === "provider_unavailable") {
    assert.equal(result.attachment.status, "failed");
    assert.equal(result.attachment.lastError?.includes("real-secret"), false);
  }
});

test("detachSandboxCredential removes provider entries and marks the attachment detached", async () => {
  const harness = createHarness();
  const attached = await attachSandboxCredential(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      actorUserId: "user_test",
      actorLabel: "test@example.com",
      body: {
        credentialName: "cred_api",
        value: "real-secret",
        binding: {
          name: "api-header",
          match: { hosts: ["api.example.com"] },
          auth: { type: "apiKey", name: "x-api-key" }
        }
      }
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined
    }
  );
  assert.equal(attached.kind, "ok");
  if (attached.kind !== "ok") return;

  const detached = await detachSandboxCredential(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      attachmentId: attached.attachment.id,
      actorUserId: "user_test",
      actorLabel: "test@example.com"
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined
    }
  );

  assert.equal(detached.kind, "ok");
  if (detached.kind === "ok") {
    assert.equal(detached.attachment.status, "detached");
    assert.equal(detached.attachment.providerState, "missing");
    assert.equal(detached.vault?.revision, 4);
  }
});

test("testSandboxCredential runs a matching request without exposing secret values", async () => {
  const harness = createHarness();
  const attached = await attachSandboxCredential(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      actorUserId: "user_test",
      actorLabel: "test@example.com",
      body: {
        displayName: "Private API",
        credentialName: "cred_api",
        value: "real-secret",
        binding: {
          name: "api-header",
          match: { hosts: ["api.example.com"], methods: ["GET"], paths: ["/v1/*"] },
          auth: { type: "apiKey", name: "x-api-key" }
        }
      }
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined
    }
  );
  assert.equal(attached.kind, "ok");
  if (attached.kind !== "ok") return;

  const result = await testSandboxCredential(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      attachmentId: attached.attachment.id,
      actorUserId: "user_test",
      actorLabel: "test@example.com",
      body: { target: "https://api.example.com/v1/health" }
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined
    }
  );

  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  assert.equal(result.response.ok, true);
  assert.equal(result.response.status, "reachable");
  assert.equal(result.response.httpStatus, 200);
  assert.equal(harness.runCalls.length, 1);
  assert.equal(harness.runCalls[0]?.includes("real-secret"), false);
});

test("testSandboxCredential returns a diagnostic mismatch without running commands", async () => {
  const harness = createHarness();
  const attached = await attachSandboxCredential(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      actorUserId: "user_test",
      actorLabel: "test@example.com",
      body: {
        credentialName: "cred_api",
        value: "real-secret",
        binding: {
          name: "api-header",
          match: { hosts: ["api.example.com"], methods: ["POST"] },
          auth: { type: "bearer" }
        }
      }
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined
    }
  );
  assert.equal(attached.kind, "ok");
  if (attached.kind !== "ok") return;

  const result = await testSandboxCredential(
    {
      organizationId: "org_test",
      sandboxId: "sbx_test",
      attachmentId: attached.attachment.id,
      actorUserId: "user_test",
      actorLabel: "test@example.com",
      body: { target: "https://other.example.com", method: "POST" }
    },
    {
      query: harness.query,
      runtimeProvider: harness.provider,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined
    }
  );

  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  assert.equal(result.response.ok, false);
  assert.equal(result.response.status, "binding_mismatch");
  assert.equal(harness.runCalls.length, 0);
});

test("inspectSandboxCredentials confirms attachments present in sanitized provider state", async () => {
  const harness = createHarness({
    providerVault: {
      revision: 8,
      credentials: [{ name: "openai-vlt_openai", sourceType: "managed", revision: 8 }],
      bindings: [{ name: "openai-api-vlt_openai", revision: 8, auth: { type: "bearer" } }]
    }
  });
  harness.attachments.set("sca_openai", credentialAttachment());

  const result = await inspectSandboxCredentials(
    { organizationId: "org_test", sandboxId: "sbx_test" },
    { query: harness.query, runtimeProvider: harness.provider }
  );

  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  assert.equal(result.attachments[0]?.providerState, "present");
  assert.equal(result.attachments[0]?.status, "injected");
  assert.equal(result.attachments[0]?.providerRevision, 8);
});

test("inspectSandboxCredentials marks provider entries missing without exposing values", async () => {
  const harness = createHarness({ providerVault: { revision: 9, credentials: [], bindings: [] } });
  harness.attachments.set("sca_openai", credentialAttachment({ status: "injected" }));

  const result = await inspectSandboxCredentials(
    { organizationId: "org_test", sandboxId: "sbx_test" },
    { query: harness.query, runtimeProvider: harness.provider }
  );

  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  assert.equal(result.attachments[0]?.providerState, "missing");
  assert.equal(result.attachments[0]?.status, "requires_reinjection");
  assert.match(result.attachments[0]?.lastError ?? "", /requires reinjection/);
  assert.equal(JSON.stringify(result).includes("real-secret"), false);
});

test("inspectSandboxCredentials preserves metadata and redacts provider-read failures", async () => {
  const harness = createHarness({ providerReadFails: true });
  harness.attachments.set("sca_openai", credentialAttachment({
    providerRevision: 7,
    providerMetadata: { credentialCount: 1 }
  }));

  const result = await inspectSandboxCredentials(
    { organizationId: "org_test", sandboxId: "sbx_test" },
    { query: harness.query, runtimeProvider: harness.provider }
  );

  assert.equal(result.kind, "provider_unavailable");
  if (result.kind !== "provider_unavailable") return;
  assert.equal(result.attachments[0]?.providerState, "unavailable");
  assert.equal(result.attachments[0]?.providerRevision, 7);
  assert.deepEqual(result.attachments[0]?.providerMetadata, { credentialCount: 1 });
  assert.equal(JSON.stringify(result).includes("real-secret"), false);
});
