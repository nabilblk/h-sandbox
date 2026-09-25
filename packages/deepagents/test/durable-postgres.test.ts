import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Pool } from "pg";
import { WorkflowStore } from "../examples/durable-store.js";
import { fixture } from "./fixture.js";

const databaseUrl = process.env.HARAKIRI_WORKFLOW_TEST_DATABASE_URL;
if (process.env.HARAKIRI_WORKFLOW_TEST_REQUIRED === "1" && !databaseUrl) throw new Error("Persistent workflow tests require their disposable PostgreSQL URL.");
const exec = promisify(execFile);
const require = createRequire(import.meta.url);

test("persistent workflows survive separate workers, approval, crashes and expiry", { skip: !databaseUrl, timeout: 90_000 }, async t => {
  const endpoint = new URL(databaseUrl!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname), "Tests require a disposable loopback PostgreSQL instance.");
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const name = `hs_framework_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE DATABASE ${name}`);
  endpoint.pathname = `/${name}`;
  const store = new WorkflowStore(endpoint.toString());
  const f = fixture();
  Object.assign(f.summary, { template: "fixture", workspaceId: "ws_retained" });
  let workspaceStatus = "available";
  f.state.override = r => {
    if (r.url.pathname === "/v1/workspaces/ws_retained") return Response.json({ workspace: { id: "ws_retained", status: workspaceStatus } });
    if (r.url.pathname === "/v1/sandboxes" && r.method === "POST") {
      return Response.json({ sandbox: { ...f.summary, id: "sbx_replacement", status: "pending" } });
    }
    return undefined;
  };
  const server = createServer(async (req, res) => {
    try {
      let body = "";
      for await (const chunk of req) body += chunk;
      // Use the same protocol fixture as installed-package tests, behind a real HTTP boundary.
      const response = await f.fetch(
        `https://harakiri.example.invalid${req.url}`, {
          method: req.method, headers: { "x-api-key": String(req.headers["x-api-key"] ?? "") }, body: body || undefined
        });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    } catch { res.writeHead(500); res.end('{"error":"fixture_failed"}'); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const apiUrl = `http://127.0.0.1:${address.port}`;
  const worker = async (action: string, thread: string, extra: Record<string, string> = {}, expectedCode = 0) => {
    let code = 0, stdout = "";
    try {
      ({ stdout } = await exec(process.execPath, ["--import", require.resolve("tsx"), fileURLToPath(new URL("durable-worker.ts", import.meta.url)), action], {
        timeout: 15_000, killSignal: "SIGKILL", maxBuffer: 1_048_576,
        env: { PATH: process.env.PATH, HOME: process.env.HOME, HARAKIRI_WORKFLOW_TEST_WORKER: "1",
          WORKFLOW_DATABASE_URL: endpoint.toString(), WORKFLOW_TENANT_ID: "tenant-one", WORKFLOW_THREAD_ID: thread,
          HARAKIRI_API_URL: apiUrl, HARAKIRI_API_KEY: "synthetic-framework-key", LANGSMITH_TRACING: "false", LANGCHAIN_TRACING_V2: "false", ...extra }
      }));
    } catch (error) {
      const failure = error as Error & { code: number; stdout: string; stderr: string };
      code = failure.code; stdout = failure.stdout;
      assert.equal(code, expectedCode, failure.stderr || stdout);
    }
    assert.equal(code, expectedCode, stdout);
    return stdout ? JSON.parse(stdout) : null;
  };
  try {
    await store.setup();
    await t.test("human approval resumes in a fresh process and rejects another tenant", async () => {
      await worker("bind", "approved");
      const paused = await worker("start", "approved");
      assert.equal(paused.phase, "approval");
      assert.ok(paused.checkpointId);
      assert.match(JSON.stringify(paused.review), /printf/);
      assert.equal(f.commands.size, 0);
      const before = f.requests.length;
      const denied = await worker("approve", "approved", { WORKFLOW_TENANT_ID: "tenant-other" }, 1);
      assert.match(denied.error, /authenticated tenant/);
      assert.equal(f.requests.length, before);
      assert.match((await worker("approve", "approved", { WORKFLOW_CHECKPOINT_ID: "stale" }, 1)).error, /checkpoint changed/);
      assert.equal(f.commands.size, 0);
      assert.equal((await worker("approve", "approved")).phase, "complete");
      assert.equal(f.commands.size, 1);
    });
    await t.test("rejection performs no approved tool effects", async () => {
      await worker("bind", "rejected"); await worker("start", "rejected");
      const before = f.commands.size;
      assert.equal((await worker("reject", "rejected")).phase, "complete");
      assert.equal(f.commands.size, before);
    });
    await t.test("forced process death after acknowledgement permits observation, never blind replay", async () => {
      await worker("bind", "crashed"); await worker("start", "crashed");
      const before = f.commands.size;
      await worker("crash", "crashed", {}, 75);
      const identity = { tenantId: "tenant-one", threadId: "crashed" };
      const run = await store.get(identity);
      assert.equal(run.phase, "invoking");
      const [reference] = await store.commands(run); assert.ok(reference);
      assert.equal(f.commands.size, before + 1);
      const replay = await worker("approve", "crashed", {}, 1);
      assert.equal(replay.name, "WorkflowRecoveryRequired");
      const observed = await worker("observe", "crashed", { WORKFLOW_COMMAND_ID: reference.commandId });
      assert.equal(observed.exitCode, 0);
      assert.deepEqual(observed.reference, reference);
      assert.equal(f.commands.size, before + 1);
      const denied = await worker("observe", "approved", { WORKFLOW_COMMAND_ID: reference.commandId }, 1);
      assert.match(denied.error, /does not belong/);
    });
    await t.test("concurrent workers cannot invoke one workflow twice", async () => {
      await worker("bind", "locked");
      await store.exclusive({ tenantId: "tenant-one", threadId: "locked" }, async () => {
        assert.match((await worker("start", "locked", {}, 1)).error, /Another worker/);
      });
    });
    await t.test("expiry requires explicit file recovery and never rebinds old commands", async () => {
      await worker("bind", "expired"); await worker("start", "expired");
      f.summary.status = "terminated"; f.summary.capacityPhase = "released";
      const before = f.requests.filter(r => r.method === "POST").length;
      assert.equal((await worker("approve", "expired", {}, 1)).name, "WorkflowRecoveryRequired");
      assert.equal(f.requests.filter(r => r.method === "POST").length, before);
      workspaceStatus = "recovery_required";
      assert.equal((await worker("recover-files", "expired", {}, 1)).name, "WorkflowRecoveryRequired");
      workspaceStatus = "available";
      const recovered = await worker("recover-files", "expired");
      assert.equal(recovered.sandboxId, "sbx_replacement");
      assert.equal(recovered.workspaceId, "ws_retained");
      const run = await store.get({ tenantId: "tenant-one", threadId: "expired" });
      assert.equal(run.sandboxId, f.summary.id);
      assert.equal(f.requests.at(-1)?.body.idempotencyKey, `framework-files-${run.id}`);
    });
    const { rows } = await store.pool.query("SELECT row_to_json(c)::text AS data FROM checkpoints c");
    assert.ok(rows.length > 0);
    assert.ok(!JSON.stringify(rows).includes("synthetic-framework-key"));
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await store.close();
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end();
  }
});
