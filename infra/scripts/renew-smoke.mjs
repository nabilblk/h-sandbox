import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { HarakiriClient } from "../../packages/sdk/dist/index.js";

export const runRenewSmoke = async ({
  apiUrl = process.env.HARAKIRI_API_URL ?? "http://127.0.0.1:18082",
  apiKey = process.env.HARAKIRI_API_KEY,
  template = process.env.HARAKIRI_RENEW_SMOKE_TEMPLATE ?? "python-3.12"
} = {}) => {
  assert.ok(apiKey, "HARAKIRI_API_KEY is required");
  const client = new HarakiriClient({ apiUrl, apiKey });
  const owned = new Set();
  const get = async (id) => (await client.getSandbox(id)).sandbox;
  const until = async (time) => delay(Math.max(0, time - Date.now()));
  const create = async (ttlSeconds) => {
    const { sandbox } = await client.createSandbox({ template, name: `renew-smoke-${Date.now()}`, ttlSeconds });
    owned.add(sandbox.id);
    await client.waitForSandbox(sandbox.id);
    return get(sandbox.id);
  };
  const waitForExpiry = async (id, deadline) => {
    while (Date.now() < deadline + 35_000) {
      if ((await get(id)).status === "terminated") return;
      await delay(2000);
    }
    assert.fail(`Sandbox ${id} did not terminate after its final deadline`);
  };
  try {
    const sandbox = await create(60);
    const original = Date.parse(sandbox.expiresAt);
    assert.ok(original > Date.now() + 30_000, "runtime startup left too little time for a meaningful renewal test");
    console.log(JSON.stringify({ step: "created", sandboxId: sandbox.id, originalExpiresAt: sandbox.expiresAt }));
    await until(original - 25_000);
    await client.renewSandbox(sandbox.id);
    const renewed = await get(sandbox.id);
    assert.ok(Date.parse(renewed.expiresAt) > original + 20_000, "renewal must meaningfully extend the deadline");
    console.log(JSON.stringify({ step: "renewed", expiresAt: renewed.expiresAt }));
    // No commands or terminal activity before this check: they could mask a broken renewal.
    await until(original + 12_000);
    assert.equal((await get(sandbox.id)).status, "running");
    const run = await client.runSandbox(sandbox.id, { command: "printf 'renewal-alive\\n'", cwd: "/tmp", timeoutMs: 10_000 });
    assert.equal(run.result.exitCode, 0);
    assert.match(run.result.stdout, /renewal-alive/);
    console.log(JSON.stringify({ step: "executed-beyond-original-deadline", sandboxId: sandbox.id }));
    const afterActivity = await get(sandbox.id);
    assert.ok(Date.parse(afterActivity.expiresAt) > Date.parse(renewed.expiresAt), "command activity must renew the native lease too");
    await waitForExpiry(sandbox.id, Date.parse(afterActivity.expiresAt));
    console.log(JSON.stringify({ step: "final-expiration", sandboxId: sandbox.id }));

    const short = await create(10);
    await waitForExpiry(short.id, Date.parse(short.expiresAt));
    console.log(JSON.stringify({ step: "short-ttl-expiration", sandboxId: short.id }));
    return { renewedSandboxId: sandbox.id, shortTtlSandboxId: short.id, originalExpiresAt: sandbox.expiresAt, renewedExpiresAt: renewed.expiresAt, activityExpiresAt: afterActivity.expiresAt };
  } finally {
    const failures = [];
    for (const id of owned) {
      try { await client.killSandbox(id); } catch { failures.push(id); }
    }
    if (failures.length) throw new Error(`Smoke cleanup failed for ${failures.join(", ")}`);
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runRenewSmoke();
  console.log("renew smoke passed");
}
