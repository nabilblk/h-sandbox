import assert from "node:assert/strict";
import test from "node:test";
import { withHarakiriSandbox, HarakiriTaskCleanupError, type OwnedSandboxInput } from "../src/index.js";
import { fixture, apiError } from "./fixture.js";

test("owned tasks wait for readiness, return the task value and confirm individual capacity release", async () => {
  const f = fixture();
  const result = await withHarakiriSandbox(f.client, { template: "node-20", ttlSeconds: 120 }, async ({ backend, sandbox }) => {
    assert.equal(backend.id, sandbox.id);
    assert.ok(f.requests.some(r => r.url.pathname.endsWith("/readiness")));
    return 42;
  });
  assert.equal(result, 42);
  assert.equal(f.requests[0].body.wait, false);
  assert.equal(f.requests.filter(r => r.method === "DELETE").length, 1);
  assert.equal(f.requests.at(-1)?.method, "GET");
  assert.equal(f.summary.capacityPhase, "released");
});

test("readiness failure still cleans up the accepted sandbox", async () => {
  const f = fixture();
  f.state.override = r => r.url.pathname.endsWith("/readiness") ? apiError("forbidden", 403) : undefined;
  let called = false;
  await assert.rejects(withHarakiriSandbox(f.client, {}, async () => { called = true; }));
  assert.equal(called, false);
  assert.equal(f.summary.status, "terminated");
});

test("cleanup failure retains both causes and a recovery ID; never reports success", async () => {
  const f = fixture();
  const cause = new Error("workload failed");
  f.state.override = r => r.method === "DELETE" ? apiError("runtime_command_unavailable", 503) : undefined;
  await assert.rejects(withHarakiriSandbox(f.client, {}, async () => { throw cause; }), error => {
    assert.ok(error instanceof HarakiriTaskCleanupError);
    assert.equal(error.sandboxId, f.summary.id);
    assert.equal(error.errors.length, 2);
    assert.equal(error.errors[0], cause);
    return true;
  });
});

test("a DELETE acknowledgement alone is not confirmed cleanup", async () => {
  const f = fixture();
  f.state.override = r => r.method === "DELETE" ? Response.json({ ok: true }) : undefined;
  await assert.rejects(withHarakiriSandbox(f.client, {}, async () => "success", { cleanupTimeoutMs: 10 }), HarakiriTaskCleanupError);
  assert.equal(f.requests.filter(r => r.method === "DELETE").length, 1);
});

test("cancellation does not prevent owned cleanup and non-Error throws are preserved", async () => {
  const f = fixture(); const controller = new AbortController();
  let rejected = false;
  try {
    await withHarakiriSandbox(f.client, {}, async () => { controller.abort(); throw undefined; }, { backend: { signal: controller.signal } });
  } catch (error) { rejected = true; assert.equal(error, undefined); }
  assert.equal(rejected, true);
  assert.equal(f.summary.status, "terminated");
});

test("caller idempotency and Git bootstrap cannot silently transfer ownership", async () => {
  const f = fixture();
  for (const input of [{ idempotencyKey: "existing" }, { source: { type: "git" } }, { wait: true }]) {
    await assert.rejects(withHarakiriSandbox(f.client, input as OwnedSandboxInput, async () => {}), TypeError);
  }
  assert.equal(f.requests.length, 0);
});
