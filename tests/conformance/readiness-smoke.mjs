import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { HarakiriClient } from "../../packages/sdk/dist/index.js";

// Opt-in: this creates billable/native runtimes. Use a dedicated test organization.
const apiUrl = process.env.HARAKIRI_API_URL;
const apiKey = process.env.HARAKIRI_API_KEY;
const template = process.env.HARAKIRI_READINESS_TEMPLATE;
if (process.env.HARAKIRI_READINESS_ACCEPTANCE !== "1" || !apiUrl || !apiKey || !template) {
  throw new Error("Set HARAKIRI_READINESS_ACCEPTANCE=1, HARAKIRI_API_URL, HARAKIRI_API_KEY and HARAKIRI_READINESS_TEMPLATE for an isolated test organization.");
}

for (const mode of ["async", "sync", "short-wait"]) test(`native execution readiness: ${mode}`, { timeout: 240_000 }, async t => {
  const calls = { create: 0, write: 0, command: 0, probes: 0 };
  const client = new HarakiriClient({ apiUrl, apiKey, fetch: async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === "/v1/sandboxes" && init?.method === "POST") calls.create++;
    if (path.endsWith("/readiness")) calls.probes++;
    if (path.endsWith("/files") && init?.method === "PUT") calls.write++;
    if (path.endsWith("/run") && init?.method === "POST") calls.command++;
    return fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(120_000) });
  } });
  const baseline = (await client.capacity()).capacity;
  assert.equal(baseline.state, "enforced");
  assert.equal(baseline.inUse, 0, "Use an isolated organization with no existing executions");
  assert.ok((baseline.available ?? 0) >= 1);
  const idempotencyKey = `readiness-${mode}-${randomUUID()}`;
  t.diagnostic(`Accepted intent key: ${idempotencyKey}`);
  let sandboxId;
  const started = Date.now();
  try {
    const accepted = await client.createSandbox({ template, name: `readiness-${mode}`, ttlSeconds: 300, idempotencyKey,
      ...(mode === "async" ? { wait: false } : mode === "short-wait" ? { waitTimeoutMs: 1 } : {}) });
    sandboxId = accepted.sandbox.id;
    t.diagnostic(`Sandbox: ${sandboxId}`);
    if (mode === "sync") assert.equal(accepted.readiness?.status, "ready");
    else await client.waitForSandbox(sandboxId, { timeoutMs: 120_000, intervalMs: 200 });
    const readyAfterMs = Date.now() - started;
    const content = `first-task-${randomUUID()}\n`;
    const path = `${accepted.sandbox.runtimeMetadata.workdir.replace(/\/$/, "")}/readiness-first.txt`;
    await client.files.write(sandboxId, { path, content, createParents: true });
    const result = await client.runSandbox(sandboxId, { command: `cat '${path.replaceAll("'", "'\\''")}'`, timeoutMs: 10_000 });
    assert.equal(result.result.exitCode, 0);
    assert.equal(result.result.stdout, content);
    assert.equal(calls.create, 1); assert.equal(calls.write, 1); assert.equal(calls.command, 1);
    assert.equal((await client.capacity()).capacity.inUse, 1);
    t.diagnostic(JSON.stringify({ mode, readyAfterMs, ...calls, firstTask: "passed" }));
  } finally {
    if (sandboxId) {
      await client.killSandbox(sandboxId);
      await client.waitForSandbox(sandboxId, { statuses: ["terminated"], timeoutMs: 120_000, intervalMs: 500 });
      assert.equal((await client.capacity()).capacity.inUse, 0, "Cleanup must release the owned execution slot");
    }
  }
});
