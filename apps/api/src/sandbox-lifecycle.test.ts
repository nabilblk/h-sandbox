import assert from "node:assert/strict";
import test from "node:test";
import type { SandboxCredentialAttachmentSummary } from "@harakiri/shared";
import type { RuntimeProvider } from "./providers/runtime/provider.js";
import { createSandboxSnapshot, deleteSandboxSnapshot, pauseSandbox, resumeSandbox } from "./services/sandbox-lifecycle.js";
import type { SandboxOperation } from "./services/sandbox-operations.js";
import type { SandboxSnapshotRow } from "./services/sandbox-snapshots.js";

const operationRow = (kind: SandboxOperation["kind"], overrides: Partial<SandboxOperation> = {}): SandboxOperation => ({
  id: `op_${kind}`,
  organizationId: "org_sbx",
  sandboxId: "sbx_lifecycle",
  kind,
  state: "queued",
  idempotencyKey: null,
  request: {},
  result: {},
  error: null,
  attempts: 0,
  lockedAt: null,
  startedAt: null,
  completedAt: null,
  createdAt: "2026-09-02T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z",
  ...overrides
});

const sandboxSummaryRow = (status: string) => ({
  id: "sbx_lifecycle",
  opensandboxId: "provider_sbx",
  name: "lifecycle",
  template: "python-3.12-data",
  status,
  cpu: 3,
  mem: 128,
  started: "00h 01m",
  owner: "sdk@test.local",
  cost: 0,
  ttlSeconds: 300,
  expiresAt: "2026-09-02T00:05:00.000Z",
  publicUrl: null,
  templateVersionId: "tplv_python",
  templateImageDigest: "sha256:abc",
  egressPolicy: { mode: "open", presets: [], allow: [], deny: [] },
  source: null,
  createdAt: "2026-09-02T00:00:00.000Z",
  runtimeWorkdir: "/workspace",
  runtimeDefaultPorts: [3000],
  runtimeFamily: "python",
  runtimeExposedPorts: []
});

const snapshotRow = (status = "ready", overrides: Partial<SandboxSnapshotRow> = {}): SandboxSnapshotRow => ({
  id: "snp_lifecycle",
  organizationId: "org_sbx",
  sourceSandboxId: "sbx_lifecycle",
  provider: "fake",
  providerSnapshotId: "provider_snapshot",
  name: "checkpoint",
  status,
  statusReason: null,
  statusMessage: null,
  template: "python-3.12-data",
  templateVersionId: "tplv_python",
  templateImageDigest: "sha256:abc",
  createdByUserId: "user_sbx",
  createdByLabel: "user@test.local",
  metadata: {},
  providerState: {},
  expiresAt: null,
  createdAt: "2026-09-02T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z",
  deletedAt: null,
  ...overrides
});

const lifecycleProvider = (state: {
  pausedRef?: unknown;
  resumedRef?: unknown;
  snapshotInput?: unknown;
  deletedSnapshotRef?: unknown;
  credentialVaultInput?: unknown;
} = {}): RuntimeProvider => ({
  kind: "fake",
  capabilities: {
    terminal: true,
    filesystem: true,
    logs: true,
    metrics: true,
    routes: true,
    credentialVault: true,
    credentialVaultPatch: true,
    pause: true,
    resume: true,
    snapshots: true
  },
  create: async () => {
    throw new Error("not used");
  },
  list: async () => [],
  get: async () => null,
  delete: async () => undefined,
  renew: async () => undefined,
  pause: async (ref) => {
    state.pausedRef = ref;
    return { ...ref, state: "paused", expiresAt: null };
  },
  resume: async (ref) => {
    state.resumedRef = ref;
    return { ...ref, state: "running", expiresAt: null };
  },
  createSnapshot: async (input) => {
    state.snapshotInput = input;
    return {
      provider: "fake",
      providerSnapshotId: "provider_snapshot",
      sourceProviderSandboxId: input.providerSandboxId,
      name: input.name ?? null,
      state: "ready",
      reason: null,
      message: null,
      metadata: input.metadata,
      providerState: { id: "provider_snapshot", status: { state: "Ready" } },
      createdAt: "2026-09-02T00:00:01.000Z"
    };
  },
  listSnapshots: async () => [],
  getSnapshot: async () => null,
  deleteSnapshot: async (ref) => {
    state.deletedSnapshotRef = ref;
  },
  run: async () => {
    throw new Error("not used");
  },
  files: async () => {
    throw new Error("not used");
  },
  logs: async () => [],
  metrics: async () => null,
  exposeRoute: async () => {
    throw new Error("not used");
  },
  applyCredentialVault: async (input) => {
    state.credentialVaultInput = input;
    return {
      revision: 7,
      credentials: input.credentials.map((credential) => ({ name: credential.name, sourceType: "runtime", revision: 7 })),
      bindings: input.bindings.map((binding) => ({ name: binding.name, revision: 7, auth: { type: binding.auth.type } }))
    };
  }
});

test("pauseSandbox persists provider lifecycle state", async () => {
  const runtimeState: { pausedRef?: unknown } = {};
  let persistedStatus = "running";
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const result = await pauseSandbox(
    {
      organizationId: "org_sbx",
      userId: "user_sbx",
      actorLabel: "user@test.local",
      sandboxId: "sbx_lifecycle"
    },
    {
      runtimeProvider: lifecycleProvider(runtimeState),
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      query: async (text, params) => {
        calls.push({ text, params });
        if (text.includes("FROM sandboxes s")) return { rowCount: 1, rows: [sandboxSummaryRow(persistedStatus)] as never[] };
        if (text.includes("FROM sandboxes") && text.includes("opensandbox_id AS")) {
          return { rowCount: 1, rows: [{ id: "sbx_lifecycle", opensandboxId: "provider_sbx", status: "running", template: "python-3.12-data", templateVersionId: "tplv_python", templateImageDigest: "sha256:abc" }] as never[] };
        }
        if (text.includes("INSERT INTO sandbox_operations")) return { rowCount: 1, rows: [operationRow("pause")] as never[] };
        if (text.includes("UPDATE sandbox_operations") && text.includes("state = 'running'")) return { rowCount: 1, rows: [operationRow("pause", { state: "running" })] as never[] };
        if (text.includes("UPDATE sandbox_operations") && text.includes("state = 'succeeded'")) return { rowCount: 1, rows: [operationRow("pause", { state: "succeeded" })] as never[] };
        if (text.includes("UPDATE sandboxes SET status =")) {
          if (params && params.length > 2) persistedStatus = String(params[2]);
          return { rowCount: 1, rows: [] as never[] };
        }
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "ok");
  if (result.kind === "ok") assert.equal(result.sandbox.status, "paused");
  assert.deepEqual(runtimeState.pausedRef, { provider: "fake", providerSandboxId: "provider_sbx" });
  assert(calls.some((call) => call.text.includes("INSERT INTO sandbox_operations") && call.params?.[3] === "pause"));
});

test("resumeSandbox is idempotent when a sandbox is already running", async () => {
  const runtimeState: { resumedRef?: unknown } = {};
  const result = await resumeSandbox(
    {
      organizationId: "org_sbx",
      userId: "user_sbx",
      actorLabel: "user@test.local",
      sandboxId: "sbx_lifecycle"
    },
    {
      runtimeProvider: lifecycleProvider(runtimeState),
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      query: async (text) => {
        if (text.includes("FROM sandbox_operations")) return { rowCount: 0, rows: [] as never[] };
        if (text.includes("FROM sandboxes s")) return { rowCount: 1, rows: [sandboxSummaryRow("running")] as never[] };
        if (text.includes("FROM sandboxes") && text.includes("opensandbox_id AS")) {
          return { rowCount: 1, rows: [{ id: "sbx_lifecycle", opensandboxId: "provider_sbx", status: "running", template: "python-3.12-data", templateVersionId: "tplv_python", templateImageDigest: "sha256:abc" }] as never[] };
        }
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "ok");
  if (result.kind === "ok") assert.equal(result.sandbox.status, "running");
  assert.equal(runtimeState.resumedRef, undefined);
});

test("resumeSandbox marks credentials stale and rehydrates stored attachments", async () => {
  const runtimeState: { resumedRef?: unknown; credentialVaultInput?: unknown } = {};
  let persistedStatus = "paused";
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const events: Array<{ type: string; metadata: Record<string, unknown> }> = [];
  const audits: Array<{ action: string; metadata: Record<string, unknown> }> = [];
  const staleAttachments: SandboxCredentialAttachmentSummary[] = [{
    id: "sca_stored",
    sandboxId: "sbx_lifecycle",
    displayName: "OpenAI production",
    sourceType: "harakiri_encrypted",
    sourceRef: "vlt_openai",
    credentialName: "openai-vlt_openai",
    bindingName: "openai-api-vlt_openai",
    match: { schemes: ["https"], hosts: ["api.openai.com"], methods: ["GET", "POST"] },
    auth: { type: "bearer", credential: "openai-vlt_openai" },
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
    providerState: "present",
    providerCheckedAt: "2026-09-02T00:00:00.000Z",
    lastError: "runtime vault state was reset",
    injectedAt: "2026-09-02T00:00:00.000Z",
    detachedAt: null,
    createdByUserId: "user_sbx",
    createdByLabel: "user@test.local",
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z"
  }, {
    id: "sca_inline",
    sandboxId: "sbx_lifecycle",
    displayName: "Ephemeral API",
    sourceType: "inline_ephemeral",
    sourceRef: null,
    credentialName: "inline-api",
    bindingName: "inline-api",
    match: { schemes: ["https"], hosts: ["api.example.com"] },
    auth: { type: "apiKey", name: "x-api-key", credential: "inline-api" },
    fakeEnv: { API_KEY: "fake-key" },
    status: "requires_reinjection",
    provider: "fake",
    providerRevision: 1,
    providerMetadata: {},
    sourceMetadata: {},
    expiresAt: null,
    refreshState: "not_applicable",
    refreshAttemptedAt: null,
    refreshedAt: null,
    providerState: "present",
    providerCheckedAt: "2026-09-02T00:00:00.000Z",
    lastError: "runtime vault state was reset",
    injectedAt: "2026-09-02T00:00:00.000Z",
    detachedAt: null,
    createdByUserId: "user_sbx",
    createdByLabel: "user@test.local",
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z"
  }];
  const result = await resumeSandbox(
    {
      organizationId: "org_sbx",
      userId: "user_sbx",
      actorLabel: "user@test.local",
      sandboxId: "sbx_lifecycle"
    },
    {
      runtimeProvider: lifecycleProvider(runtimeState),
      decryptSecret: () => "stored-real-secret",
      recordEvent: async (_orgId, _sandboxId, type, _message, metadata) => {
        events.push({ type, metadata: metadata ?? {} });
      },
      recordAudit: async (_orgId, _userId, _actorLabel, action, _resourceType, _resourceId, metadata) => {
        audits.push({ action, metadata: metadata ?? {} });
      },
      query: async (text, params) => {
        calls.push({ text, params });
        if (text.includes("FROM sandboxes s")) return { rowCount: 1, rows: [sandboxSummaryRow(persistedStatus)] as never[] };
        if (text.includes("FROM sandboxes") && text.includes("opensandbox_id AS")) {
          return { rowCount: 1, rows: [{ id: "sbx_lifecycle", opensandboxId: "provider_sbx", status: persistedStatus, template: "python-3.12-data", templateVersionId: "tplv_python", templateImageDigest: "sha256:abc" }] as never[] };
        }
        if (text.includes("INSERT INTO sandbox_operations")) return { rowCount: 1, rows: [operationRow("resume")] as never[] };
        if (text.includes("UPDATE sandbox_operations") && text.includes("state = 'running'")) return { rowCount: 1, rows: [operationRow("resume", { state: "running" })] as never[] };
        if (text.includes("UPDATE sandbox_operations") && text.includes("state = 'succeeded'")) return { rowCount: 1, rows: [operationRow("resume", { state: "succeeded" })] as never[] };
        if (text.includes("FROM workspace_credential_secrets")) {
          return {
            rowCount: 1,
            rows: [{
              id: "vlt_openai",
              name: "OpenAI production",
              providerPresetId: "openai",
              sourceType: "harakiri_encrypted",
              version: 1,
              fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
              binding: { name: "openai-api", match: { schemes: ["https"], hosts: ["api.openai.com"] }, auth: { type: "bearer" } },
              egressDomains: ["api.openai.com"],
              hasEncryptedSecret: true,
              metadata: {},
              createdByUserId: "user_sbx",
              createdByLabel: "user@test.local",
              rotatedAt: null,
              disabledAt: null,
              deletedAt: null,
              createdAt: "2026-09-02T00:00:00.000Z",
              updatedAt: "2026-09-02T00:00:00.000Z",
              secretCiphertext: "cipher",
              secretIv: "iv",
              secretTag: "tag"
            }] as never[]
          };
        }
        if (text.includes("UPDATE sandbox_credential_attachments") && text.includes("AND status = 'injected'")) {
          return { rowCount: 2, rows: [{ id: "sca_inline" }, { id: "sca_stored" }] as never[] };
        }
        if (text.includes("FROM sandbox_credential_attachments") && text.includes("status = 'requires_reinjection'")) {
          return { rowCount: staleAttachments.length, rows: staleAttachments as never[] };
        }
        if (text.includes("UPDATE sandbox_credential_attachments") && text.includes("status = 'injected'")) {
          staleAttachments[0] = { ...staleAttachments[0], status: "injected", lastError: null, providerRevision: 7 };
          return { rowCount: 1, rows: [staleAttachments[0]] as never[] };
        }
        if (text.includes("UPDATE sandbox_credential_attachments") && text.includes("status = 'requires_reinjection'")) {
          staleAttachments[1] = { ...staleAttachments[1], lastError: params?.[3] as string };
          return { rowCount: 1, rows: [staleAttachments[1]] as never[] };
        }
        if (text.includes("UPDATE sandboxes SET status =")) {
          if (params && params.length > 2) persistedStatus = String(params[2]);
          return { rowCount: 1, rows: [] as never[] };
        }
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "ok");
  if (result.kind === "ok") assert.equal(result.sandbox.status, "running");
  assert.deepEqual(runtimeState.resumedRef, { provider: "fake", providerSandboxId: "provider_sbx" });
  assert.deepEqual((runtimeState.credentialVaultInput as { credentials: unknown[] } | undefined)?.credentials, [
    { name: "openai-vlt_openai", value: "stored-real-secret" }
  ]);
  assert(calls.some((call) =>
    call.text.includes("UPDATE sandbox_credential_attachments") &&
    call.text.includes("status = 'requires_reinjection'")
  ));
  const lifecycleEvent = events.find((event) => event.type === "resumed");
  const lifecycleAudit = audits.find((audit) => audit.action === "sandbox.resume");
  assert.equal(lifecycleEvent?.metadata.credentialsNeedingReinjection, 2);
  assert.equal(lifecycleEvent?.metadata.credentialsRehydrated, 1);
  assert.equal(lifecycleEvent?.metadata.credentialsRehydrateSkipped, 1);
  assert.equal(lifecycleAudit?.metadata.credentialsRehydrated, 1);
});

test("createSandboxSnapshot persists Harakiri and provider snapshot ids", async () => {
  const runtimeState: { snapshotInput?: unknown } = {};
  let persistedSnapshot = snapshotRow("creating", { providerSnapshotId: null });
  const result = await createSandboxSnapshot(
    {
      organizationId: "org_sbx",
      userId: "user_sbx",
      actorLabel: "user@test.local",
      sandboxId: "sbx_lifecycle",
      name: "checkpoint",
      metadata: { reason: "test" }
    },
    {
      runtimeProvider: lifecycleProvider(runtimeState),
      idFactory: () => "snp_lifecycle",
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      query: async (text, params) => {
        if (text.includes("FROM sandboxes") && text.includes("opensandbox_id AS")) {
          return { rowCount: 1, rows: [{ id: "sbx_lifecycle", opensandboxId: "provider_sbx", status: "running", template: "python-3.12-data", templateVersionId: "tplv_python", templateImageDigest: "sha256:abc" }] as never[] };
        }
        if (text.includes("INSERT INTO sandbox_snapshots")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("INSERT INTO sandbox_operations")) return { rowCount: 1, rows: [operationRow("snapshot")] as never[] };
        if (text.includes("UPDATE sandbox_operations") && text.includes("state = 'running'")) return { rowCount: 1, rows: [operationRow("snapshot", { state: "running" })] as never[] };
        if (text.includes("UPDATE sandbox_operations") && text.includes("state = 'succeeded'")) return { rowCount: 1, rows: [operationRow("snapshot", { state: "succeeded" })] as never[] };
        if (text.includes("UPDATE sandbox_snapshots") && text.includes("provider_snapshot_id")) {
          persistedSnapshot = snapshotRow("ready", {
            providerSnapshotId: "provider_snapshot",
            providerState: JSON.parse(String(params?.[6] ?? "{}"))
          });
          return { rowCount: 1, rows: [] as never[] };
        }
        if (text.includes("FROM sandbox_snapshots") && text.includes("WHERE id = $1")) {
          return { rowCount: 1, rows: [persistedSnapshot] as never[] };
        }
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "ok");
  if (result.kind === "ok") assert.equal(result.snapshot.id, "snp_lifecycle");
  assert.deepEqual(runtimeState.snapshotInput, {
    provider: "fake",
    providerSandboxId: "provider_sbx",
    name: "checkpoint",
    metadata: {
      "harakiri.snapshot": "snp_lifecycle",
      "harakiri.sandbox": "sbx_lifecycle",
      "harakiri.org": "org_sbx",
      reason: "test"
    }
  });
});

test("deleteSandboxSnapshot delegates provider delete and tombstones the row", async () => {
  const runtimeState: { deletedSnapshotRef?: unknown } = {};
  const result = await deleteSandboxSnapshot(
    {
      organizationId: "org_sbx",
      userId: "user_sbx",
      actorLabel: "user@test.local",
      snapshotId: "snp_lifecycle"
    },
    {
      runtimeProvider: lifecycleProvider(runtimeState),
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      query: async (text) => {
        if (text.includes("FROM sandbox_snapshots") && text.includes("deleted_at IS NULL")) {
          return { rowCount: 1, rows: [snapshotRow()] as never[] };
        }
        if (text.includes("INSERT INTO sandbox_operations")) return { rowCount: 1, rows: [operationRow("snapshot_delete")] as never[] };
        if (text.includes("UPDATE sandbox_operations") && text.includes("state = 'running'")) return { rowCount: 1, rows: [operationRow("snapshot_delete", { state: "running" })] as never[] };
        if (text.includes("UPDATE sandbox_operations") && text.includes("state = 'succeeded'")) return { rowCount: 1, rows: [operationRow("snapshot_delete", { state: "succeeded" })] as never[] };
        if (text.includes("UPDATE sandbox_snapshots")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("FROM sandbox_snapshots") && text.includes("includeDeleted")) return { rowCount: 0, rows: [] as never[] };
        if (text.includes("FROM sandbox_snapshots")) return { rowCount: 1, rows: [snapshotRow("deleted", { deletedAt: "2026-09-02T00:01:00.000Z" })] as never[] };
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "ok");
  assert.deepEqual(runtimeState.deletedSnapshotRef, { provider: "fake", providerSnapshotId: "provider_snapshot" });
});
