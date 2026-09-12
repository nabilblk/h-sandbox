import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { HarakiriClient, type UsageHistoryResponse } from "@h-sandbox/sdk";

const apiUrl = process.env.HARAKIRI_API_URL, apiKey = process.env.HARAKIRI_API_KEY, template = process.env.HARAKIRI_TEMPLATE;
assert.ok(apiUrl && apiKey && template, "Set HARAKIRI_API_URL, HARAKIRI_API_KEY and HARAKIRI_TEMPLATE privately");
const client = new HarakiriClient({ apiUrl, apiKey });
const { capacity } = await client.capacity();
assert.equal(capacity.state, "enforced");
assert.equal(capacity.inUse, 0, "Use a dedicated empty organization, with no other workload creating sandboxes");
const { template: installed } = await client.getTemplate(template);
assert.equal(installed.status, "ready");
const before = await client.usageHistory({ from: new Date(Date.now() - 60_000).toISOString(), to: new Date().toISOString(), resolution: "1m" });
assert.equal(before.coverage.observer, "active", "The observer must be active before the task starts");
const from = new Date().toISOString(), intent = randomUUID();
console.log("Create intent:", intent);
const input = { template, name: "usage-observation-check", ttlSeconds: 600, idempotencyKey: intent, wait: false };
const owned = new Set<string>();
try {
  const created = await client.createSandbox(input);
  owned.add(created.sandbox.id); console.log("Owned sandbox:", created.sandbox.id);
  const replay = await client.createSandbox(input);
  owned.add(replay.sandbox.id);
  assert.equal(replay.sandbox.id, created.sandbox.id, "A retry must reuse the accepted execution");
  await client.waitForSandbox(created.sandbox.id, { timeoutMs: 300_000 });
  const { result } = await client.runSandbox(created.sandbox.id, { command: "printf 'usage-observed\\n'", cwd: installed.workdir, timeoutMs: 15_000 });
  assert.equal(result.exitCode, 0); assert.equal(result.stdout.trim(), "usage-observed");
  let history: UsageHistoryResponse | undefined;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    history = await client.usageHistory({ from, to: new Date().toISOString(), resolution: "1m" });
    if (history.summary.readiness.sampleCount === 1 || history.summary.readiness.unsupportedCount === 1) break;
    await delay(2000);
  }
  assert.ok(history);
  assert.equal(history.summary.acceptedOperations?.create, 1);
  assert.ok(history.summary.heldSlotSeconds! > 0);
  assert.equal(history.summary.peakHeldSlots, 1);
  assert.equal(history.summary.readiness.sampleCount + history.summary.readiness.unsupportedCount, 1, "Readiness was not independently observed within the tutorial budget");
  console.log(JSON.stringify({ coverage: history.coverage, summary: history.summary }, null, 2));
} finally {
  const cleanupErrors: unknown[] = [];
  for (const id of owned) {
    try {
      await client.killSandbox(id);
      await client.waitForSandbox(id, { statuses: ["terminated"], timeoutMs: 180_000 });
    } catch (error) { cleanupErrors.push(error); console.error("Cleanup needs inspection for owned sandbox:", id); }
  }
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Some owned sandboxes could not be confirmed terminated");
}
assert.equal((await client.capacity()).capacity.inUse, 0);
console.log("Verified one accepted create, same-intent replay, real occupancy and confirmed cleanup.");
