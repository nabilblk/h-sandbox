import assert from "node:assert/strict";
import test from "node:test";
import { getOrganizationSettings, updateOrganizationSettings } from "./services/org-settings.js";
import { getUsageSummary } from "./services/usage.js";
const capacityRow = { max_concurrency: 5, capacity_revision: 1, capacity_state: "enforced", active: 3, reserved: 1, releasing: 0, uncertain: 0, observed_at: new Date() };

test("getUsageSummary reports scoped record counts without manufacturing usage measurements", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const usage = await getUsageSummary(
    { organizationId: "org_usage" },
    {
      now: () => new Date("2026-09-09T00:00:00Z"),
      query: async (text, params) => {
        calls.push({ text, params });
        if (text.includes("SELECT o.max_concurrency")) return { rows: [capacityRow] as never[] };
        if (text.includes("GROUP BY status")) {
          return {
            rowCount: 2,
            rows: [
              { status: "running", count: "3" },
              { status: "terminated", count: "2" }
            ] as never[]
          };
        }
        if (text.includes("GROUP BY template_id")) {
          return {
            rowCount: 1,
            rows: [{ label: "python-3.12", value: "5" }] as never[]
          };
        }
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.deepEqual(calls.map((call) => call.params), [["org_usage"], ["org_usage"], ["org_usage"]]);
  assert.equal(usage.capacity?.inUse, 4);
  assert.equal(usage.sandboxesSpawned, 5);
  assert.equal(usage.concurrentNow, 3);
  assert.equal(usage.concurrentPeak, 0);
  assert.equal(usage.computeHours, 0);
  assert.equal(usage.avgRuntimeSeconds, 0);
  assert.equal(usage.avgColdStartMs, 0);
  assert.deepEqual(usage.series, []);
  assert.deepEqual(usage.coverage, {
    source: "control_plane_records", period: "retained_records", observedAt: "2026-09-09T00:00:00.000Z",
    unavailableMetrics: ["computeHours", "avgColdStartMs", "avgRuntimeSeconds", "concurrentPeak", "series"],
    concurrencyLimitEnforced: true
  });
  assert.deepEqual(usage.topTemplates, [{ label: "python-3.12", value: 5 }]);
  assert.deepEqual(usage.statusBreakdown, [
    { label: "running", value: 3 },
    { label: "terminated", value: 2 }
  ]);
});

test("empty organizations still report unmeasured history, not a zero-usage observation", async () => {
  const usage = await getUsageSummary(
    { organizationId: "org_empty" },
    {
      query: async (text) => {
        if (text.includes("SELECT o.max_concurrency")) return { rows: [{ ...capacityRow, active: 0, reserved: 0 }] as never[] };
        if (text.includes("GROUP BY status")) return { rowCount: 0, rows: [] as never[] };
        if (text.includes("GROUP BY template_id")) return { rowCount: 0, rows: [] as never[] };
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(usage.sandboxesSpawned, 0);
  assert.equal(usage.avgColdStartMs, 0);
  assert.equal(usage.concurrentNow, 0);
  assert.ok(usage.coverage?.unavailableMetrics.includes("series"));
  assert.deepEqual(usage.series, []);
});

test("getOrganizationSettings selects organization-scoped settings", async () => {
  const settings = await getOrganizationSettings(
    { organizationId: "org_settings" },
    async (text, params) => {
      assert.match(text, /FROM organizations WHERE id = \$1/);
      assert.deepEqual(params, ["org_settings"]);
      return {
        rowCount: 1,
        rows: [{
          id: "org_settings",
          name: "Workspace Labs",
          slug: "workspace-labs",
          defaultTemplateId: "python-3.12",
          idleTtlSeconds: 300,
          maxConcurrency: 200,
          defaultEgressPolicy: { mode: "restricted", presets: ["python-package-install"], allow: [], deny: [] },
          egressAllowedPresets: ["python-package-install"],
          egressCustomDomainsEnabled: false,
          egressMaxRules: 64,
          egressRedactDomains: true
        }] as never[]
      };
    }
  );

  assert.equal(settings.name, "Workspace Labs");
  assert.equal(settings.defaultTemplateId, "python-3.12");
});

test("updateOrganizationSettings atomically writes only supplied fields with a limit revision", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const updated = await updateOrganizationSettings(
    {
      organizationId: "org_settings",
      patch: {
        name: "Runtime Team",
        maxConcurrency: 50,
        expectedCapacityRevision: 1
      }
    },
    async (text, params) => {
      calls.push({ text, params });
      if (text.includes("UPDATE organizations")) {
        return {
          rowCount: 1,
          rows: [{
            id: "org_settings",
            name: "Runtime Team",
            slug: "workspace-labs",
            defaultTemplateId: "python-3.12",
            idleTtlSeconds: 300,
            maxConcurrency: 50,
            defaultEgressPolicy: { mode: "open", presets: [], allow: [], deny: [] },
            egressAllowedPresets: ["python-package-install", "git-hosting"],
            egressCustomDomainsEnabled: false,
            egressMaxRules: 64,
            egressRedactDomains: true
          }] as never[]
        };
      }
      throw new Error(`unexpected query: ${text}`);
    }
  );

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, ["org_settings", "Runtime Team", 50, 1]);
  assert.match(calls[0].text, /capacity_revision = \$4/);
  assert.doesNotMatch(calls[0].text.split("RETURNING")[0], /slug =|egress_max_rules =/);
  assert.equal(updated.name, "Runtime Team");
  assert.equal(updated.maxConcurrency, 50);
  assert.equal(updated.egressMaxRules, 64);
});
