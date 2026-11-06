import assert from "node:assert/strict";
import test from "node:test";
import { verifyRuntime } from "./verify.mjs";

function fixture(overrides = {}) {
  const calls = [];
  let contents;
  const sandbox = {
    id: "sbx-owned", wait: async () => { calls.push("wait"); }, run: async () => ({ exitCode: 0, stdout: "1000700000\n" }),
    files: { write: async (_path, bytes) => { contents = bytes; }, readBytes: async () => contents },
    kill: async (options) => { assert.equal(options.wait, true); calls.push("kill"); }, ...overrides
  };
  const client = {
    getRuntimeCapabilities: async () => ({ capabilities: ["egressPolicy", "credentialVault", "credentialVaultPatch", "credentialVaultSanitizedRead", "lifecyclePause", "lifecycleResume", "lifecycleSnapshot", "createFromSnapshot"].map((name) => ({ name, state: "unavailable" })) }),
    sandboxes: { create: async (input) => { assert.equal(input.wait, false); assert.ok(input.idempotencyKey); calls.push("create"); return sandbox; } }
  };
  return { client, calls };
}

test("API smoke records evidence only after owned runtime termination", async () => {
  const { client, calls } = fixture();
  const events = [];
  const result = await verifyRuntime(client, { template: "checked-image", record: (event) => events.push(event) });
  assert.equal(result.apiSmoke, "passed");
  assert.equal(result.qualification, "pending-browser-admission-and-isolation-checks");
  assert.deepEqual(calls, ["create", "wait", "kill"]);
  assert.equal(events.at(-1).stage, "terminated");
});

test("readiness and execution failures still clean up the owned sandbox", async () => {
  for (const overrides of [{ wait: async () => { throw new Error("timeout"); } }, { run: async () => ({ exitCode: 0, stdout: "0" }) }]) {
    const { client, calls } = fixture(overrides);
    await assert.rejects(verifyRuntime(client, { template: "checked-image" }));
    assert.ok(calls.includes("kill"));
  }
});

test("ambiguous cleanup is not reported as success; unrelated resources are untouched", async () => {
  const { client } = fixture({ kill: async () => { throw new Error("provider unavailable"); } });
  const events = [];
  await assert.rejects(verifyRuntime(client, { template: "checked-image", record: (event) => events.push(event) }), /Cleanup unconfirmed for sbx-owned/);
  assert.equal(events.at(-1).stage, "cleanup-unconfirmed");
  client.getRuntimeCapabilities = async () => ({ capabilities: [] });
  client.sandboxes.create = async () => { throw new Error("must not create before checking policy"); };
  await assert.rejects(verifyRuntime(client, { template: "checked-image" }), /must be unavailable/);
});
