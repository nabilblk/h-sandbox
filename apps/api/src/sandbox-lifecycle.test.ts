import assert from "node:assert/strict";
import test from "node:test";
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
} = {}): RuntimeProvider => ({
  kind: "fake",
  capabilities: {
    terminal: true,
    filesystem: true,
    logs: true,
    metrics: true,
    routes: true,
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
