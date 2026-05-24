import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanupTemplateBuilderJobs,
  cleanupTemplateRetention,
  shouldDeleteTemplateBuilderJob,
  type TemplateRetentionPolicy
} from "./template-retention.js";

const policy: TemplateRetentionPolicy = {
  enabled: true,
  buildRetentionDays: 30,
  buildLogRetentionDays: 14,
  buildContextRetentionDays: 7,
  versionRetentionDays: 90,
  builderJobRetentionDays: 1,
  deleteBuilderJobs: true
};

test("cleanupTemplateRetention prunes logs, contexts, unversioned builds, and retires old versions", async () => {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const db = {
    async query<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
      calls.push({ text, params });
      if (text.includes("DELETE FROM template_build_logs")) return { rowCount: 2, rows: [] as T[] };
      if (text.includes("DELETE FROM template_build_contexts")) return { rowCount: 3, rows: [] as T[] };
      if (text.includes("DELETE FROM template_builds")) return { rowCount: 4, rows: [] as T[] };
      if (text.includes("UPDATE template_versions")) return { rowCount: 1, rows: [{ id: "tplv_old", organization_id: "org_old" }] as T[] };
      return { rowCount: 1, rows: [] as T[] };
    }
  };
  const deletedJobs: string[] = [];
  const batch = {
    async listNamespacedJob() {
      return {
        items: [
          { metadata: { name: "hkbld-old" }, status: { completionTime: new Date("2026-05-22T00:00:00Z") } },
          { metadata: { name: "hkbld-new" }, status: { completionTime: new Date("2026-05-24T11:00:00Z") } }
        ]
      };
    },
    async deleteNamespacedJob(input: { name: string }) {
      deletedJobs.push(input.name);
    }
  };

  const report = await cleanupTemplateRetention({
    policy,
    now: new Date("2026-05-24T12:00:00Z"),
    db,
    batch
  });

  assert.deepEqual(report, {
    logsDeleted: 2,
    contextsDeleted: 3,
    buildsDeleted: 4,
    versionsRetired: 1,
    builderJobsDeleted: 1
  });
  assert(calls.some((call) => call.text.includes("DELETE FROM template_build_logs")));
  assert(calls.some((call) => call.text.includes("DELETE FROM template_build_contexts")));
  assert(calls.some((call) => call.text.includes("NOT EXISTS") && call.text.includes("template_versions")));
  assert(calls.some((call) => call.params.includes("template.version.retired")));
  assert.deepEqual(deletedJobs, ["hkbld-old"]);
});

test("cleanupTemplateRetention can be disabled by policy", async () => {
  const calls: unknown[] = [];
  const report = await cleanupTemplateRetention({
    policy: { ...policy, enabled: false },
    db: {
      async query() {
        calls.push("query");
        return { rowCount: 0, rows: [] };
      }
    },
    batch: {
      async listNamespacedJob() {
        calls.push("jobs");
        return { items: [] };
      },
      async deleteNamespacedJob() {
        calls.push("delete");
      }
    }
  });

  assert.deepEqual(report, {
    logsDeleted: 0,
    contextsDeleted: 0,
    buildsDeleted: 0,
    versionsRetired: 0,
    builderJobsDeleted: 0
  });
  assert.deepEqual(calls, []);
});

test("shouldDeleteTemplateBuilderJob only deletes finished jobs older than cutoff", () => {
  const cutoff = new Date("2026-05-24T12:00:00Z");

  assert.equal(
    shouldDeleteTemplateBuilderJob(
      { metadata: { name: "hkbld-old" }, status: { completionTime: new Date("2026-05-23T00:00:00Z") } },
      cutoff
    ),
    true
  );
  assert.equal(
    shouldDeleteTemplateBuilderJob(
      { metadata: { name: "hkbld-failed" }, status: { conditions: [{ type: "Failed", status: "True", lastTransitionTime: new Date("2026-05-23T00:00:00Z") }] } },
      cutoff
    ),
    true
  );
  assert.equal(
    shouldDeleteTemplateBuilderJob(
      { metadata: { name: "hkbld-running" }, status: {} },
      cutoff
    ),
    false
  );
  assert.equal(
    shouldDeleteTemplateBuilderJob(
      { metadata: { name: "hkbld-new" }, status: { completionTime: new Date("2026-05-24T12:30:00Z") } },
      cutoff
    ),
    false
  );
});

test("cleanupTemplateBuilderJobs skips Kubernetes when builder job retention is off", async () => {
  const report = await cleanupTemplateBuilderJobs(
    { builderJobRetentionDays: 0, deleteBuilderJobs: true },
    {
      batch: {
        async listNamespacedJob() {
          throw new Error("should not list jobs");
        },
        async deleteNamespacedJob() {
          throw new Error("should not delete jobs");
        }
      }
    }
  );

  assert.equal(report, 0);
});
