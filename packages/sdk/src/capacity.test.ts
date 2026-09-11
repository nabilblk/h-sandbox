import assert from "node:assert/strict";
import test from "node:test";
import { HarakiriClient, HarakiriConflictError, HarakiriProviderUnavailableError } from "./index.js";

const capacity = { state: "enforced", limit: 2, revision: 1, inUse: 2, available: 0, overLimit: 0,
  breakdown: { active: 1, reserved: 0, releasing: 0, uncertain: 1 }, observedAt: new Date().toISOString() };

test("capacity reads the authenticated organization and preserves unknown counts", async () => {
  const client = new HarakiriClient({ apiUrl: "https://sandbox.test", apiKey: "test", fetch: async (url) => {
    assert.equal(String(url), "https://sandbox.test/v1/org/capacity");
    return Response.json({ capacity: { ...capacity, state: "reconciling", inUse: null, available: null, breakdown: null } });
  } });
  const result = await client.capacity();
  assert.equal(result.capacity.inUse, null);
  assert.equal(result.capacity.state, "reconciling");
});

test("capacity conflicts preserve counts and never trigger automatic retries", async () => {
  for (const status of [409, 503]) {
    let calls = 0;
    const code = status === 409 ? "organization_capacity_exceeded" : "organization_capacity_unavailable";
    const client = new HarakiriClient({ apiUrl: "https://sandbox.test", apiKey: "test", fetch: async () => {
      calls++;
      return Response.json({ error: code, message: "Execution not admitted", capacity }, { status });
    } });
    await assert.rejects(client.createSandbox({ template: "test" }), (error: unknown) => {
      assert.ok(status === 409 ? error instanceof HarakiriConflictError : error instanceof HarakiriProviderUnavailableError);
      assert.equal(error.code, code);
      assert.deepEqual(error.details?.capacity, capacity);
      if (status === 409) assert.equal(error.retryable, false);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test("create uses one key per invocation and preserves explicit retry keys", async () => {
  const requests: Record<string, unknown>[] = [];
  const client = new HarakiriClient({ apiUrl: "https://sandbox.test", apiKey: "test", fetch: async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({ sandbox: { id: "sbx_test" } });
  } });
  await client.createSandbox({ template: "test" });
  await client.createSandbox({ template: "test" });
  assert.match(String(requests[0].idempotencyKey), /^[a-f0-9-]{36}$/);
  assert.notEqual(requests[0].idempotencyKey, requests[1].idempotencyKey);
  await client.createSandbox({ template: "test", idempotencyKey: "job-123" });
  await client.createSandbox({ template: "test", idempotencyKey: "job-123" });
  assert.equal(requests[2].idempotencyKey, requests[3].idempotencyKey);
});

test("resume forwards a reusable key through the public client", async () => {
  const client = new HarakiriClient({ apiUrl: "https://sandbox.test", apiKey: "test", fetch: async (url, init) => {
    assert.equal(String(url), "https://sandbox.test/v1/sandboxes/sbx_test/resume");
    assert.equal(new Headers(init?.headers).get("idempotency-key"), "resume-123");
    return Response.json({ sandbox: { id: "sbx_test" } });
  } });
  await client.resumeSandbox("sbx_test", { idempotencyKey: "resume-123" });
});
