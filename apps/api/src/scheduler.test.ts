import assert from "node:assert/strict";
import test from "node:test";
import { normalizeState, reconcile, shouldRunTemplateRetention, tick, type SchedulerDependencies } from "./scheduler.js";
import type { RuntimeProvider, RuntimeSandboxSummary } from "./providers/runtime/provider.js";
import { capacityFixture } from "./test-support/capacity-fixture.js";

test("normalizeState maps OpenSandbox states to Harakiri statuses", () => {
  assert.equal(normalizeState("Running"), "running");
  assert.equal(normalizeState("READY_WITH_IP"), "running");
  assert.equal(normalizeState("Pending"), "pending");
  assert.equal(normalizeState("Failed"), "error");
  assert.equal(normalizeState("Terminating"), null);
  assert.equal(normalizeState("Terminated"), "terminated");
  assert.equal(normalizeState("Paused"), "paused");
  assert.equal(normalizeState("Resuming"), "resuming");
  assert.equal(normalizeState("unknown"), null);
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
    authoritativeLifecycle: true,
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
      if (text.includes("WITH due_candidates AS")) {
        return { rows: [{ sandbox_id: "sbx_missing", organization_id: "org_test", generation: 1, reason: null }] as never[] };
      }
      if (text.includes("SELECT opensandbox_id FROM sandboxes")) return { rows: [{ opensandbox_id: "osbx_missing" }] as never[] };
      if (text.includes("FOR UPDATE")) return { rows: [{ opensandbox_id: "osbx_missing", status: "running", expires_at: new Date() }] as never[] };
      if (text.includes("SELECT clock_timestamp")) return { rows: [{ now: new Date() }] as never[] };
      return { rows: [] };
    }
  };
  Object.assign(dependencies, capacityFixture(dependencies.query!, { sandboxId: "sbx_missing", organizationId: "org_test", providerId: "osbx_missing", status: "running" }));

  await reconcile(dependencies);

  assert.ok(calls.some((call) => call.text.includes("UPDATE sandboxes SET status='terminated'") && call.params?.[0] === "sbx_missing"));
  assert.ok(calls.some((call) => call.text.includes("UPDATE sandbox_routes") && call.params?.[0] === "sbx_missing"));
});

test("tick deletes due sandboxes through an injected runtime provider", async () => {
  const deleted: string[] = [];
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const dependencies: SchedulerDependencies = {
    runtimeProvider: fakeRuntimeProvider({ deleted, get: { provider: "fake", providerSandboxId: "osbx_due", state: "running", expiresAt: "2026-01-01T00:00:00Z" } }),
    reconcileCredentialVault: async () => ({ claimed: 0, inspectionClaimed: 0, inspected: 0, refreshed: 0, rehydrated: 0, skipped: 0, failed: 0, errors: [] }),
    runTemplateRetentionIfDue: async () => null,
    query: async (text, params) => {
      calls.push({ text, params });
      if (text.includes("SELECT id, organization_id FROM sandboxes")) {
        return { rows: [] };
      }
      if (text.includes("SELECT id AS sandbox_id")) {
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
      if (text.includes("FOR UPDATE")) return { rows: [{ opensandbox_id: "osbx_due", status: "running", expires_at: "2026-01-01T00:00:00Z" }] as never[] };
      if (text.includes("SELECT clock_timestamp")) return { rows: [{ now: new Date() }] as never[] };
      return { rows: [] };
    }
  };
  Object.assign(dependencies, capacityFixture(dependencies.query!, { sandboxId: "sbx_due", organizationId: "org_due", providerId: "osbx_due", status: "running" }));

  await tick(dependencies);

  assert.deepEqual(deleted, ["osbx_due"]);
  assert.ok(!calls.some((call) => call.text.includes("UPDATE sandboxes SET status='terminated'")), "an accepted delete still reports a running runtime");
  assert.ok(!calls.some((call) => call.text.includes("UPDATE sandbox_schedules SET completed_at")), "retain expiry evidence until absence is confirmed");
});
