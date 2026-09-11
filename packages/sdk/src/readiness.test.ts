import assert from "node:assert/strict";
import test from "node:test";
import { HarakiriClient, HarakiriWaitTimeoutError } from "./index.js";

const health = (status: string, lifecycle = "running") => ({
  sandbox: { id: "sbx_cold", status: lifecycle },
  readiness: { status, checkedAt: new Date().toISOString() }
});

test("already canceled or zero-budget waits make no requests", async () => {
  const client = new HarakiriClient({ apiUrl: "https://sandbox.test", apiKey: "test", fetch: async () => { throw new Error("must not fetch"); } });
  const signal = AbortSignal.abort(new Error("already canceled"));
  await assert.rejects(client.waitForSandbox("sbx_cold", { signal }), /already canceled/);
  await assert.rejects(client.waitForSandbox("sbx_cold", { timeoutMs: 0 }), HarakiriWaitTimeoutError);
});

test("default create waits through cold start before the first file write and command, each sent once", async () => {
  const calls: string[] = [];
  let probes = 0;
  const client = new HarakiriClient({ apiUrl: "https://sandbox.test", apiKey: "test", fetch: async (url, init) => {
    const path = new URL(String(url)).pathname;
    const method = init?.method ?? "GET";
    calls.push(`${method} ${path}`);
    if (path === "/v1/sandboxes") return Response.json({ ...health("starting"), status: "pending" }, { status: 202 });
    if (path.endsWith("/readiness")) return Response.json(health(++probes === 2 ? "ready" : "starting"));
    assert.equal(probes, 2, "no workload before readiness");
    if (path.endsWith("/files")) return Response.json({ file: { path: "/tmp/first.txt" } });
    if (path.endsWith("/run")) return Response.json({ result: { exitCode: 0, stdout: "first" } });
    throw new Error(`Unexpected request ${method} ${path}`);
  } });
  const created = await client.createSandbox();
  await client.files.write(created.sandbox.id, { path: "/tmp/first.txt", content: "first" });
  await client.runSandbox(created.sandbox.id, { command: "cat /tmp/first.txt" });
  assert.deepEqual(calls, ["POST /v1/sandboxes", "GET /v1/sandboxes/sbx_cold/readiness", "GET /v1/sandboxes/sbx_cold/readiness", "PUT /v1/sandboxes/sbx_cold/files", "POST /v1/sandboxes/sbx_cold/run"]);
});

test("explicit async or time-limited creation preserves acceptance without additional waiting", async () => {
  for (const options of [{ wait: false }, { waitTimeoutMs: 10 }]) {
    let calls = 0;
    const client = new HarakiriClient({ apiUrl: "https://sandbox.test", apiKey: "test", fetch: async (_url, init) => {
      assert.equal(init?.method, "POST"); calls++;
      return Response.json({ ...health("starting"), status: "pending" }, { status: 202 });
    } });
    const accepted = await client.createSandbox(options);
    assert.equal(accepted.sandbox.id, "sbx_cold");
    assert.equal(accepted.status, "pending");
    assert.equal(calls, 1);
  }
});

test("non-executing lifecycle waits remain read-only inventory waits", async () => {
  const client = new HarakiriClient({ apiUrl: "https://sandbox.test", apiKey: "test", fetch: async (url) => {
    assert.equal(new URL(String(url)).pathname, "/v1/sandboxes/sbx_cold");
    return Response.json({ sandbox: { id: "sbx_cold", status: "terminated" } });
  } });
  assert.equal((await client.waitForSandbox("sbx_cold", { statuses: ["terminated"] })).sandbox.status, "terminated");
});

test("explicit running waits still require health, and timeout retains the accepted ID", async () => {
  let calls = 0;
  const client = new HarakiriClient({ apiUrl: "https://sandbox.test", apiKey: "test", fetch: async (url) => {
    assert.match(String(url), /\/readiness$/); calls++;
    return Response.json(health("unavailable"));
  } });
  await assert.rejects(client.waitForSandbox("sbx_cold", { statuses: ["running"], timeoutMs: 20, intervalMs: 1 }), error => {
    assert.ok(error instanceof HarakiriWaitTimeoutError);
    assert.equal(error.id, "sbx_cold");
    assert.equal(error.lastStatus, "running");
    assert.match(error.message, /execution unavailable/);
    return true;
  });
  assert.ok(calls >= 1);
});

test("an in-flight read is canceled by the wait deadline or caller signal", async () => {
  for (const callerAbort of [false, true]) {
    const controller = new AbortController();
    let canceled = false;
    const client = new HarakiriClient({ apiUrl: "https://sandbox.test", apiKey: "test", fetch: async (_url, init) => new Promise((_resolve, reject) => {
      assert.ok(init?.signal);
      init.signal.addEventListener("abort", () => { canceled = true; reject(init.signal!.reason); }, { once: true });
    }) });
    const timer = setTimeout(() => controller.abort(new Error("caller stopped waiting")), callerAbort ? 5 : 1000);
    try {
      await assert.rejects(client.waitForSandbox("sbx_cold", { timeoutMs: 20, signal: controller.signal }), callerAbort ? /caller stopped waiting/ : HarakiriWaitTimeoutError);
      assert.equal(canceled, true);
    } finally { clearTimeout(timer); }
  }
});

test("unsupported or old health responses cannot silently turn running into ready", async () => {
  for (const response of [health("unsupported"), { sandbox: { id: "sbx_cold", status: "running" } }]) {
    const client = new HarakiriClient({ apiUrl: "https://sandbox.test", apiKey: "test", fetch: async () => Response.json(response) });
    await assert.rejects(client.waitForSandbox("sbx_cold"), /readiness is not supported/);
  }
});

test("a failed first mutation is not automatically retried", async () => {
  for (const writeFile of [true, false]) {
    let writes = 0;
    const client = new HarakiriClient({ apiUrl: "https://sandbox.test", apiKey: "test", fetch: async (url) => {
      if (String(url).endsWith("/readiness")) return Response.json(health("ready"));
      writes++;
      return Response.json({ error: "runtime_files_unavailable" }, { status: 502 });
    } });
    await client.waitForSandbox("sbx_cold");
    await assert.rejects(writeFile
      ? client.files.write("sbx_cold", { path: "/tmp/first.txt", content: "first" })
      : client.runSandbox("sbx_cold", { command: "echo first" }));
    assert.equal(writes, 1);
  }
});
