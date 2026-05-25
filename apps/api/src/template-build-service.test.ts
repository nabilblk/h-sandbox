import assert from "node:assert/strict";
import test from "node:test";
import {
  enqueueTemplateBuild,
  getTemplateBuildLogs,
  listTemplateBuilds,
  uploadTemplateBuildContext
} from "./services/template-builds.js";

test("listTemplateBuilds builds filters and redacts returned rows", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const builds = await listTemplateBuilds(
    {
      organizationId: "org_service",
      status: "failed",
      q: "agent",
      template: "tpl_service",
      limit: "5"
    },
    async (text, params) => {
      calls.push({ text, params });
      return {
        rowCount: 1,
        rows: [{
          id: "bld_service",
          buildArgs: { password: "secret-value" },
          metadata: { registry_token: "secret-value" },
          error: "failed token=secret-value",
          context: { metadata: { apiKey: "secret-value" } }
        }] as never[]
      };
    }
  );

  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /status = \$2/);
  assert.match(calls[0].text, /template_id = \$3/);
  assert.match(calls[0].text, /ILIKE \$4/);
  assert.deepEqual(calls[0].params, ["org_service", "failed", "tpl_service", "%agent%", 5]);
  assert.equal(builds[0].buildArgs.password, "[redacted]");
  assert.equal(builds[0].metadata.registry_token, "[redacted]");
  assert.equal(builds[0].error, "failed token=[redacted]");
  assert.equal(builds[0].context?.metadata?.apiKey, "[redacted]");
});

test("enqueueTemplateBuild uses an advisory slot and redacts persisted inputs", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const client = {
    async query<T>(text: string, params: unknown[] = []) {
      calls.push({ text, params });
      if (text.includes("count(*)::text")) return { rowCount: 1, rows: [{ count: "1" }] as T[] };
      return { rowCount: 1, rows: [] as T[] };
    }
  };

  const result = await enqueueTemplateBuild(
    {
      organizationId: "org_service",
      templateId: "tpl_service",
      sourceType: "dockerfile",
      dockerfilePath: "Dockerfile",
      buildArgs: { password: "secret-value" },
      imageDestination: null,
      metadata: { token: "secret-value" }
    },
    {
      idFactory: () => "bld_service",
      maxActivePerOrg: 3,
      withClientFn: async (fn) => fn(client as never)
    }
  );

  assert.deepEqual(result, { ok: true, buildId: "bld_service" });
  const insert = calls.find((call) => call.text.includes("INSERT INTO template_builds"));
  assert.ok(insert);
  assert.equal((insert.params?.[6] as Record<string, unknown>).password, "[redacted]");
  assert.equal((insert.params?.[8] as Record<string, unknown>).token, "[redacted]");
  assert(calls.some((call) => call.text === "COMMIT"));
});

test("enqueueTemplateBuild returns a concurrency error before inserting", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const client = {
    async query<T>(text: string, params: unknown[] = []) {
      calls.push({ text, params });
      if (text.includes("count(*)::text")) return { rowCount: 1, rows: [{ count: "3" }] as T[] };
      return { rowCount: 1, rows: [] as T[] };
    }
  };

  const result = await enqueueTemplateBuild(
    {
      organizationId: "org_service",
      templateId: "tpl_service",
      sourceType: "image",
      dockerfilePath: null,
      buildArgs: {},
      imageDestination: "ubuntu:24.04",
      metadata: {}
    },
    {
      idFactory: () => "bld_service",
      maxActivePerOrg: 3,
      withClientFn: async (fn) => fn(client as never)
    }
  );

  assert.deepEqual(result, {
    ok: false,
    error: "template_build_concurrency_limit_exceeded",
    limit: 3,
    activeBuilds: 3
  });
  assert(!calls.some((call) => call.text.includes("INSERT INTO template_builds")));
  assert(calls.some((call) => call.text === "ROLLBACK"));
});

test("getTemplateBuildLogs checks ownership before listing logs", async () => {
  const logs = await getTemplateBuildLogs(
    { organizationId: "org_service", buildId: "bld_service" },
    {
      query: async () => ({ rowCount: 1, rows: [{ id: "bld_service" }] as never[] }),
      buildLogStore: {
        kind: "test",
        async append() {
          throw new Error("should not append");
        },
        async list(buildId) {
          return [{ lineNo: 1, stream: "stdout", message: `logs for ${buildId}`, createdAt: "2026-05-24T12:00:00.000Z" }];
        },
        async delete() {
          return 0;
        }
      }
    }
  );

  assert.deepEqual(logs, [{ lineNo: 1, stream: "stdout", message: "logs for bld_service", createdAt: "2026-05-24T12:00:00.000Z" }]);
});

test("uploadTemplateBuildContext stores context through a transaction", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const client = {
    async query<T>(text: string, params: unknown[] = []) {
      calls.push({ text, params });
      if (text.includes("FROM template_builds") && text.includes("FOR UPDATE")) {
        return {
          rowCount: 1,
          rows: [{ id: "bld_service", source_type: "git", status: "queued", dockerfile_path: null }] as T[]
        };
      }
      if (text.includes("SELECT COALESCE(MAX(line_no)")) return { rowCount: 1, rows: [{ next: 1 }] as T[] };
      if (text.includes("RETURNING created_at")) return { rowCount: 1, rows: [{ created_at: "2026-05-24T12:00:00.000Z" }] as T[] };
      return { rowCount: 1, rows: [] as T[] };
    }
  };

  const result = await uploadTemplateBuildContext(
    {
      organizationId: "org_service",
      buildId: "bld_service",
      context: {
        archive: Buffer.from("not-a-real-tar-for-git-source"),
        sha256: "sha256:context",
        sizeBytes: 29,
        format: "tar+gzip",
        fileCount: 2,
        metadata: { token: "secret-value" }
      }
    },
    { withClientFn: async (fn) => fn(client as never) }
  );

  assert.equal(result.kind, "stored");
  assert(calls.some((call) => call.text === "BEGIN"));
  assert(calls.some((call) => call.text.includes("INSERT INTO template_build_contexts")));
  assert(calls.some((call) => call.text.includes("UPDATE template_builds")));
  assert(calls.some((call) => call.text.includes("INSERT INTO template_build_logs")));
  assert(calls.some((call) => call.text === "COMMIT"));
  const contextInsert = calls.find((call) => call.text.includes("INSERT INTO template_build_contexts"));
  assert.equal((contextInsert?.params?.[7] as Record<string, unknown>).token, "[redacted]");
});
