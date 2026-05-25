import assert from "node:assert/strict";
import test from "node:test";
import { normalizeState, reconcile, shouldRunTemplateRetention, tick, type SchedulerDependencies } from "./scheduler.js";
import type { RuntimeProvider, RuntimeSandboxSummary } from "./providers/runtime/provider.js";

test("normalizeState maps OpenSandbox states to Harakiri statuses", () => {
  assert.equal(normalizeState("Running"), "running");
  assert.equal(normalizeState("READY_WITH_IP"), "running");
  assert.equal(normalizeState("Pending"), "pending");
  assert.equal(normalizeState("Failed"), "error");
  assert.equal(normalizeState("Terminating"), "terminated");
});

test("shouldRunTemplateRetention respects interval boundaries", () => {
  assert.equal(shouldRunTemplateRetention(0, 1000, 1000), true);
  assert.equal(shouldRunTemplateRetention(1000, 1500, 1000), false);
  assert.equal(shouldRunTemplateRetention(1000, 2000, 1000), true);
  assert.equal(shouldRunTemplateRetention(0, 10_000, 0), false);
});

const fakeRuntimeProvider = (options: {
  get?: RuntimeSandboxSummary | null;
  deleted?: string[];
} = {}): RuntimeProvider => ({
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
  get: async () => options.get ?? null,
  delete: async (ref) => {
    options.deleted?.push(ref.providerSandboxId);
  },
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
  }
});

test("reconcile runs against an injected runtime provider and marks missing sandboxes terminated", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const dependencies: SchedulerDependencies = {
    runtimeProvider: fakeRuntimeProvider({ get: null }),
    query: async (text, params) => {
      calls.push({ text, params });
      if (text.includes("SELECT id, opensandbox_id FROM sandboxes")) {
        return { rows: [{ id: "sbx_missing", opensandbox_id: "osbx_missing" }] as never[] };
      }
      return { rows: [] };
    }
  };

  await reconcile(dependencies);

  assert.ok(calls.some((call) => call.text.includes("UPDATE sandboxes SET status = 'terminated'") && call.params?.[0] === "sbx_missing"));
  assert.ok(calls.some((call) => call.text.includes("UPDATE sandbox_routes") && call.params?.[0] === "sbx_missing"));
});

test("tick deletes due sandboxes through an injected runtime provider", async () => {
  const deleted: string[] = [];
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const dependencies: SchedulerDependencies = {
    runtimeProvider: fakeRuntimeProvider({ deleted }),
    runTemplateRetentionIfDue: async () => null,
    query: async (text, params) => {
      calls.push({ text, params });
      if (text.includes("SELECT id, opensandbox_id FROM sandboxes")) {
        return { rows: [] };
      }
      if (text.includes("SELECT ss.id AS schedule_id")) {
        return {
          rows: [
            {
              schedule_id: "sched_due",
              sandbox_id: "sbx_due",
              organization_id: "org_due",
              opensandbox_id: "osbx_due"
            }
          ] as never[]
        };
      }
      return { rows: [] };
    }
  };

  await tick(dependencies);

  assert.deepEqual(deleted, ["osbx_due"]);
  assert.ok(calls.some((call) => call.text.includes("UPDATE sandboxes SET status = 'terminated'") && call.params?.[0] === "sbx_due"));
  assert.ok(calls.some((call) => call.text.includes("UPDATE sandbox_schedules SET completed_at") && call.params?.[0] === "sched_due"));
  assert.ok(calls.some((call) => call.text.includes("INSERT INTO sandbox_events") && call.params?.[0] === "sbx_due"));
});
