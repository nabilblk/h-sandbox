import assert from "node:assert/strict";
import test from "node:test";
import type { RuntimeProvider } from "./providers/runtime/provider.js";
import { createSandbox, deleteSandbox, listSandboxes, renewSandbox } from "./services/sandboxes.js";
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

const fakeRuntimeProvider = (
  state: { createInput?: unknown; deletedRef?: unknown; renewedRef?: unknown; renewedInput?: unknown; createError?: Error } = {}
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
    async (text, params) => {
      calls.push({ text, params });
      return {
        rowCount: 1,
        rows: [{ id: "sbx_1", name: "agent", status: "running", template: "python-3.12" }] as never[]
      };
    }
  );

  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /s.status = \$2/);
  assert.match(calls[0].text, /s.template_id = \$3/);
  assert.match(calls[0].text, /s.template_version_id = \$4/);
  assert.match(calls[0].text, /ILIKE \$5/);
  assert.deepEqual(calls[0].params, ["org_sbx", "running", "python-3.12", "tplv_ready", "%agent%", 5]);
  assert.equal(sandboxes[0].id, "sbx_1");
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
      env: { HARAKIRI_ENV_SMOKE: "ok" }
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
  const insert = calls.find((call) => call.text.includes("INSERT INTO sandboxes"));
  assert.ok(insert);
  assert.deepEqual(insert.params?.slice(0, 5), ["sbx_test", "org_sbx", "python-3.12", "agent-runner", "user_sbx"]);
  assert(calls.some((call) => call.text.includes("INSERT INTO sandbox_operations")));
  assert(calls.some((call) => call.text.includes("UPDATE sandboxes") && call.params?.[1] === "provider_sbx"));
  assert.equal(events[0].type, "created");
  assert.equal(events[0].metadata?.runtimeWorkdir, "/workspace");
  assert.equal(events[0].metadata?.operationId, "op_test");
  assert.equal(audits[0].action, "sandbox.create");
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

test("deleteSandbox and renewSandbox use injected provider refs", async () => {
  const runtimeState: { deletedRef?: any; renewedRef?: any; renewedInput?: any } = {};
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const query = async (text: string, params?: unknown[]) => {
    calls.push({ text, params });
    if (text.includes("SELECT opensandbox_id, ttl_seconds")) {
      return { rowCount: 1, rows: [{ opensandbox_id: "provider_sbx", ttl_seconds: 300 }] as never[] };
    }
    if (text.includes("SELECT opensandbox_id FROM sandboxes")) {
      return { rowCount: 1, rows: [{ opensandbox_id: "provider_sbx" }] as never[] };
    }
    if (text.includes("INSERT INTO sandbox_operations")) return { rowCount: 1, rows: [operationRow()] as never[] };
    if (text.includes("FROM sandbox_operations") && text.includes("FOR UPDATE")) return { rowCount: 1, rows: [operationRow()] as never[] };
    if (text.includes("UPDATE sandbox_operations")) {
      return { rowCount: 1, rows: [operationRow({ state: text.includes("succeeded") ? "succeeded" : "running" })] as never[] };
    }
    return { rowCount: 1, rows: [] as never[] };
  };

  const runtimeProvider = fakeRuntimeProvider(runtimeState);
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
