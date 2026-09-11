import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { HarakiriApiError, HarakiriClient } from "@h-sandbox/sdk";

const apiUrl = process.env.HARAKIRI_API_URL;
const apiKey = process.env.HARAKIRI_API_KEY;
assert.ok(apiUrl && apiKey, "Set HARAKIRI_API_URL and HARAKIRI_API_KEY for a dedicated test organization");
const client = new HarakiriClient({ apiUrl, apiKey });
const { capacity: before } = await client.capacity();
assert.equal(before.state, "enforced", "Ask the operator to verify inventory first");
assert.equal(before.limit, 1, "An admin must set this test organization's execution slot limit to 1");
assert.equal(before.inUse, 0, "Use an empty dedicated organization; this example never stops existing work");

const owned = new Set<string>();
const firstIntent = { template: process.env.HARAKIRI_TEMPLATE ?? "python-3.12", ttlSeconds: 180, idempotencyKey: randomUUID() };
const secondIntent = { ...firstIntent, idempotencyKey: randomUUID() };
const waitUntilEmpty = async () => {
  const deadline = Date.now() + 90_000;
  while ((await client.capacity()).capacity.inUse !== 0) {
    assert.ok(Date.now() < deadline, "Cleanup remains unconfirmed; inspect harakiri capacity and retain the sandbox IDs");
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
};

try {
  console.log(`First request key: ${firstIntent.idempotencyKey}`);
  const first = await client.createSandbox(firstIntent);
  owned.add(first.sandbox.id);
  console.log(`Accepted ${first.sandbox.id}; one execution slot is occupied`);
  const replay = await client.createSandbox(firstIntent);
  owned.add(replay.sandbox.id);
  assert.equal(replay.sandbox.id, first.sandbox.id, "A retry must return the original accepted sandbox");

  console.log(`Second request key: ${secondIntent.idempotencyKey}`);
  try {
    const unexpected = await client.createSandbox(secondIntent);
    owned.add(unexpected.sandbox.id);
    assert.fail("A second execution must not be admitted while the limit is full");
  } catch (error) {
    if (!(error instanceof HarakiriApiError) || error.code !== "organization_capacity_exceeded") throw error;
    assert.equal(error.status, 409);
    console.log("Expected 409: no second execution admitted");
  }

  await client.killSandbox(first.sandbox.id);
  await waitUntilEmpty(); // Delete acceptance alone does not release capacity.
  owned.delete(first.sandbox.id);
  const second = await client.createSandbox(secondIntent);
  owned.add(second.sandbox.id);
  console.log(`After confirmed cleanup, accepted ${second.sandbox.id}`);
} finally {
  const failures: unknown[] = [];
  for (const id of owned) {
    try { await client.killSandbox(id); }
    catch (error) { failures.push(error); console.error(`Cleanup needs review for ${id}`); }
  }
  if (failures.length) throw new AggregateError(failures, "Could not request all owned cleanup");
  await waitUntilEmpty();
}
console.log("Verified: full-capacity denial, same-key replay, confirmed release and successful retry; no owned executions remain");
