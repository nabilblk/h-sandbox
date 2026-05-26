import assert from "node:assert/strict";
import test from "node:test";
import { getOrganizationSettings, updateOrganizationSettings } from "./services/org-settings.js";
import { getUsageSummary } from "./services/usage.js";

test("getUsageSummary aggregates counts, runtime totals, templates, and cold starts", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const usage = await getUsageSummary(
    { organizationId: "org_usage" },
    {
      averageTemplateBootMs: async (organizationId) => {
        assert.equal(organizationId, "org_usage");
        return 137;
      },
      query: async (text, params) => {
        calls.push({ text, params });
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
        if (text.includes("avg_runtime_seconds")) {
          return {
            rowCount: 1,
            rows: [{ compute_hours: "12.50", avg_runtime_seconds: "42.25" }] as never[]
          };
        }
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.deepEqual(calls.map((call) => call.params), [["org_usage"], ["org_usage"], ["org_usage"]]);
  assert.equal(usage.sandboxesSpawned, 5);
  assert.equal(usage.concurrentNow, 3);
  assert.equal(usage.concurrentPeak, 3);
  assert.equal(usage.computeHours, 12.5);
  assert.equal(usage.avgRuntimeSeconds, 42.25);
  assert.equal(usage.avgColdStartMs, 137);
  assert.equal(usage.series.length, 14 * 24);
  assert.deepEqual(usage.topTemplates, [{ label: "python-3.12", value: 5 }]);
  assert.deepEqual(usage.statusBreakdown, [
    { label: "running", value: 3 },
    { label: "terminated", value: 2 }
  ]);
});

test("getUsageSummary skips cold start lookup when there are no sandboxes", async () => {
  const usage = await getUsageSummary(
    { organizationId: "org_empty" },
    {
      averageTemplateBootMs: async () => {
        throw new Error("averageTemplateBootMs should not run");
      },
      query: async (text) => {
        if (text.includes("GROUP BY status")) return { rowCount: 0, rows: [] as never[] };
        if (text.includes("GROUP BY template_id")) return { rowCount: 0, rows: [] as never[] };
        if (text.includes("avg_runtime_seconds")) {
          return { rowCount: 1, rows: [{ compute_hours: "0.00", avg_runtime_seconds: "0.00" }] as never[] };
        }
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(usage.sandboxesSpawned, 0);
  assert.equal(usage.avgColdStartMs, 0);
  assert.equal(usage.concurrentNow, 0);
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

test("updateOrganizationSettings merges partial patches with current settings", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const updated = await updateOrganizationSettings(
    {
      organizationId: "org_settings",
      patch: {
        name: "Runtime Team",
        maxConcurrency: 50
      }
    },
    async (text, params) => {
      calls.push({ text, params });
      if (text === "SELECT * FROM organizations WHERE id = $1") {
        return {
          rowCount: 1,
          rows: [{
            name: "Workspace Labs",
            slug: "workspace-labs",
            default_template_id: "python-3.12",
            idle_ttl_seconds: 300,
            max_concurrency: 200,
            default_egress_policy: { mode: "open", presets: [], allow: [], deny: [] },
            egress_allowed_presets: ["python-package-install", "git-hosting"],
            egress_custom_domains_enabled: false,
            egress_max_rules: 64,
            egress_redact_domains: true
          }] as never[]
        };
      }
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

  assert.deepEqual(calls[1].params, [
    "org_settings",
    "Runtime Team",
    "workspace-labs",
    "python-3.12",
    300,
    50,
    "{\"mode\":\"open\",\"presets\":[],\"allow\":[],\"deny\":[]}",
    ["python-package-install", "git-hosting"],
    false,
    64,
    true
  ]);
  assert.equal(updated.name, "Runtime Team");
  assert.equal(updated.maxConcurrency, 50);
  assert.equal(updated.egressMaxRules, 64);
});
