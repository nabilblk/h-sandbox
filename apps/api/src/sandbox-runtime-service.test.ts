import assert from "node:assert/strict";
import test from "node:test";
import type { RuntimeProvider } from "./providers/runtime/provider.js";
import {
  createSandboxRoute,
  getSandboxMetrics,
  listSandboxFiles,
  listSandboxLogs,
  testSandboxEgress
} from "./services/sandbox-runtime.js";

const fakeRuntimeProvider = (overrides: Partial<RuntimeProvider> = {}): RuntimeProvider => ({
  kind: "fake",
  capabilities: {
    terminal: true,
    filesystem: true,
    logs: true,
    metrics: true,
    routes: true
  },
  create: async () => {
    throw new Error("not used");
  },
  list: async () => [],
  get: async () => null,
  delete: async () => undefined,
  renew: async () => undefined,
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
  ...overrides
});

test("listSandboxFiles uses the template workdir and preserves provider unavailable state", async () => {
  const seenProviders: string[] = [];
  const ok = await listSandboxFiles(
    { organizationId: "org_runtime", sandboxId: "sbx_runtime" },
    {
      runtimeProvider: fakeRuntimeProvider({
        files: async (input) => {
          seenProviders.push(input.provider);
          return {
            ok: true,
            cwd: input.path ?? input.defaultCwd,
            defaultCwd: input.defaultCwd,
            source: "fake",
            files: [{ path: "/workspace/agent.py", name: "agent.py", type: "file", size: 12 }]
          };
        }
      }),
      query: async (text, params) => {
        assert.match(text, /COALESCE\(v\.workdir, t\.workdir/);
        assert.deepEqual(params, ["sbx_runtime", "org_runtime"]);
        return { rowCount: 1, rows: [{ opensandbox_id: "provider_sbx", workdir: "/workspace" }] as never[] };
      }
    }
  );

  assert.deepEqual(ok, {
    kind: "ok",
    cwd: "/workspace",
    files: [{ path: "/workspace/agent.py", name: "agent.py", type: "file", size: 12 }]
  });
  assert.deepEqual(seenProviders, ["fake"]);

  const unavailable = await listSandboxFiles(
    { organizationId: "org_runtime", sandboxId: "sbx_runtime", path: "/" },
    {
      runtimeProvider: fakeRuntimeProvider({
        files: async (input) => ({
          ok: false,
          cwd: input.path ?? input.defaultCwd,
          defaultCwd: input.defaultCwd,
          files: [],
          error: {
            code: "runtime_files_unavailable",
            message: "provider down",
            recoverable: true
          }
        })
      }),
      query: async () => ({ rowCount: 1, rows: [{ opensandbox_id: "provider_sbx", workdir: "/workspace" }] as never[] })
    }
  );

  assert.equal(unavailable.kind, "unavailable");
  if (unavailable.kind === "unavailable") {
    assert.equal(unavailable.files.cwd, "/");
    assert.equal(unavailable.files.ok, false);
    if (!unavailable.files.ok) assert.equal(unavailable.files.error.code, "runtime_files_unavailable");
  }
});

test("listSandboxLogs merges control-plane and provider logs chronologically", async () => {
  const logs = await listSandboxLogs(
    { organizationId: "org_runtime", sandboxId: "sbx_runtime" },
    {
      runtimeProvider: fakeRuntimeProvider({
        logs: async () => [{ ts: "2026-05-24T12:00:02.000Z", lvl: "runtime", msg: "sandbox log", source: "sandbox" }]
      }),
      query: async (text) => {
        if (text.includes("FROM sandboxes")) return { rowCount: 1, rows: [{ opensandbox_id: "provider_sbx" }] as never[] };
        if (text.includes("FROM sandbox_events")) {
          return {
            rowCount: 1,
            rows: [{ ts: new Date("2026-05-24T12:00:01.000Z"), lvl: "created", msg: "control-plane log" }] as never[]
          };
        }
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.deepEqual(logs, [
    { ts: "2026-05-24T12:00:01.000Z", lvl: "created", msg: "control-plane log", source: "control-plane" },
    { ts: "2026-05-24T12:00:02.000Z", lvl: "runtime", msg: "sandbox log", source: "sandbox" }
  ]);
});

test("getSandboxMetrics returns persisted metrics when provider metrics are unavailable", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const metrics = await getSandboxMetrics(
    { organizationId: "org_runtime", sandboxId: "sbx_runtime" },
    {
      runtimeProvider: fakeRuntimeProvider({ metrics: async () => null }),
      query: async (text, params) => {
        calls.push({ text, params });
        return { rowCount: 1, rows: [{ opensandbox_id: "provider_sbx", cpu_pct: 19, memory_mb: 512 }] as never[] };
      }
    }
  );

  assert.equal(metrics?.current.cpu, 19);
  assert.equal(metrics?.current.mem, 512);
  assert(!calls.some((call) => call.text.includes("UPDATE sandboxes SET cpu_pct")));
});

test("testSandboxEgress sends a newline-safe shell command to the runtime", async () => {
  let runInput: Parameters<RuntimeProvider["run"]>[0] | undefined;
  const result = await testSandboxEgress(
    { organizationId: "org_runtime", sandboxId: "sbx_runtime", target: "https://api.github.com" },
    {
      runtimeProvider: fakeRuntimeProvider({
        run: async (input) => {
          runInput = input;
          return {
            sandboxId: input.controlPlaneSandboxId,
            command: input.command,
            stdout: "",
            stderr: "",
            exitCode: 0,
            durationMs: 9
          };
        }
      }),
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      actorUserId: "user_runtime",
      actorLabel: "runtime@test.local",
      query: async (text, params) => {
        assert.match(text, /SELECT id, opensandbox_id, status FROM sandboxes/);
        assert.deepEqual(params, ["sbx_runtime", "org_runtime"]);
        return { rowCount: 1, rows: [{ id: "sbx_runtime", opensandbox_id: "provider_sbx", status: "running" }] as never[] };
      }
    }
  );

  assert.equal(result.kind, "ok");
  assert.ok(runInput);
  assert.equal(runInput.providerSandboxId, "provider_sbx");
  assert.equal(runInput.controlPlaneSandboxId, "sbx_runtime");
  assert.match(runInput.command, /^HARAKIRI_EGRESS_TEST_TARGET='https:\/\/api\.github\.com\/' sh -lc '/);
  assert.match(runInput.command, /\ntarget="\$HARAKIRI_EGRESS_TEST_TARGET"/);
  assert.doesNotMatch(runInput.command, /sh -lc "\\n/);
  if (result.kind === "ok") assert.equal(result.response.status, "reachable");
});

test("createSandboxRoute exposes through the runtime provider and records audit/event", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const events: Array<{ type: string; message: string; metadata?: Record<string, unknown> }> = [];
  const audits: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
  const result = await createSandboxRoute(
    {
      organizationId: "org_runtime",
      actorUserId: "user_runtime",
      actorLabel: "runtime@test.local",
      sandboxId: "sbx_runtime",
      port: 3000,
      protocol: "http"
    },
    {
      runtimeProvider: fakeRuntimeProvider({
        exposeRoute: async (input) => {
          assert.equal(input.provider, "fake");
          assert.equal(input.providerSandboxId, "provider_sbx");
          return {
            routeKey: "provider-route",
            host: "provider-route.example.test",
            url: "https://provider-route.example.test",
            targetUrl: "http://provider-route:3000",
            provider: "fake",
            providerRouteId: "route_provider",
            state: "ready"
          };
        }
      }),
      recordEvent: async (_organizationId, _sandboxId, type, message, metadata) => {
        events.push({ type, message, metadata });
      },
      recordAudit: async (_organizationId, _actorUserId, _actorLabel, action, _targetType, _targetId, metadata) => {
        audits.push({ action, metadata });
      },
      query: async (text, params) => {
        calls.push({ text, params });
        if (text.includes("SELECT id, opensandbox_id, status FROM sandboxes")) {
          return { rowCount: 1, rows: [{ id: "sbx_runtime", opensandbox_id: "provider_sbx", status: "running" }] as never[] };
        }
        if (text.includes("FROM sandbox_routes") && text.includes("AND port = $3") && !text.includes("SELECT count(*)")) {
          if (calls.filter((call) => call.text.includes("FROM sandbox_routes") && call.text.includes("AND port = $3")).length === 1) {
            return { rowCount: 0, rows: [] as never[] };
          }
          return {
            rowCount: 1,
            rows: [{
              port: 3000,
              protocol: "http",
              routeKey: "provider-route",
              host: "provider-route.example.test",
              url: "https://provider-route.example.test",
              targetUrl: "http://provider-route:3000",
              state: "ready",
              provider: "fake",
              providerRouteId: "route_provider"
            }] as never[]
          };
        }
        if (text.includes("SELECT count(*)")) return { rowCount: 1, rows: [{ count: "0" }] as never[] };
        if (text.includes("INSERT INTO sandbox_operations")) {
          return {
            rowCount: 1,
            rows: [{ id: "op_route", sandboxId: "sbx_runtime", kind: "route_expose", state: "queued", request: {}, result: {} }] as never[]
          };
        }
        if (text.includes("FROM sandbox_operations") && text.includes("FOR UPDATE")) {
          return {
            rowCount: 1,
            rows: [{ id: "op_route", sandboxId: "sbx_runtime", kind: "route_expose", state: "queued", request: {}, result: {} }] as never[]
          };
        }
        if (text.includes("UPDATE sandbox_operations")) {
          return {
            rowCount: 1,
            rows: [{ id: "op_route", sandboxId: "sbx_runtime", kind: "route_expose", state: "succeeded", request: {}, result: {} }] as never[]
          };
        }
        if (text.includes("INSERT INTO sandbox_routes")) return { rowCount: 1, rows: [] as never[] };
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "created");
  if (result.kind === "created") assert.equal(result.route.routeKey, "provider-route");
  const insert = calls.find((call) => call.text.includes("INSERT INTO sandbox_routes"));
  assert.ok(insert);
  assert.deepEqual(insert.params?.slice(0, 6), ["sbx_runtime", "org_runtime", 3000, "http", "provider-route", "provider-route.example.test"]);
  assert(calls.some((call) => call.text.includes("INSERT INTO sandbox_operations")));
  assert.equal(events[0].type, "route.created");
  assert.equal(events[0].metadata?.operationId, "op_route");
  assert.equal(audits[0].action, "sandbox.route.create");
});
