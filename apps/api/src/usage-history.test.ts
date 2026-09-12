import assert from "node:assert/strict";
import test from "node:test";
import type { Query } from "./services/query.js";
import { aggregateUsageHistory, getUsageHistory, mergeUsageIntervals, usageHistoryQuery, type UsageOperation } from "./services/usage-history.js";

const start = Date.parse("2026-09-12T10:00:00Z");
const date = (seconds: number) => new Date(start + seconds * 1_000).toISOString();
const operation = (patch: Partial<UsageOperation> = {}): UsageOperation => ({ id: "op_1", kind: "provision", restored: false, state: "succeeded",
  created_at: date(10), completed_at: date(20), observation_state: "ready", first_ready_at: date(22), observation_finished_at: date(22), ...patch });
const input = () => ({ window: { from: date(0), to: date(180), resolution: "1m" as const }, availableFrom: start,
  observedAt: start + 180_000, observerEnabled: true, now: start + 180_000, retentionDays: 30,
  windows: [{ from: start, to: start + 180_000 }], holds: [] as { created_at: string; released_at: string | null }[], operations: [] as UsageOperation[] });

test("covered empty history is zero, absent collection is unavailable rather than zero", () => {
  const covered = aggregateUsageHistory(input());
  assert.equal(covered.coverage.status, "complete");
  assert.equal(covered.summary.heldSlotSeconds, 0);
  assert.equal(covered.summary.readiness.p50Ms, null);
  const missing = aggregateUsageHistory({ ...input(), windows: [], observedAt: null });
  assert.equal(missing.coverage.observer, "not_started");
  assert.equal(missing.summary.heldSlotSeconds, null);
  assert.ok(missing.buckets.every((bucket) => bucket.averageHeldSlots === null && bucket.acceptedOperations === null));
});

test("slot sweep handles carry-in, simultaneous boundaries, open/uncertain holds and gaps", () => {
  const result = aggregateUsageHistory({ ...input(), windows: [{ from: start, to: start + 60_000 }, { from: start + 120_000, to: start + 180_000 }],
    holds: [{ created_at: date(-30), released_at: date(60) }, { created_at: date(60), released_at: null }, { created_at: date(150), released_at: date(180) }] });
  assert.equal(result.summary.heldSlotSeconds, 150);
  assert.equal(result.summary.coveredSeconds, 120);
  assert.equal(result.summary.peakHeldSlots, 2);
  assert.equal(result.buckets[1].heldSlotSeconds, null);
  assert.equal(result.buckets[2].averageHeldSlots, 1.5);
  assert.deepEqual(result.coverage.gaps, [{ from: date(60), to: date(120) }]);
});

test("admission kinds, terminal-time outcomes and readiness cohorts are not conflated", () => {
  const result = aggregateUsageHistory({ ...input(), operations: [operation(), operation({ id: "op_2", restored: true, first_ready_at: null, observation_state: "censored" }),
    operation({ id: "op_3", kind: "resume", first_ready_at: null, observation_state: "unsupported" }),
    operation({ id: "op_4", created_at: date(-100), state: "failed", first_ready_at: null })] });
  assert.deepEqual(result.summary.acceptedOperations, { create: 1, restore: 1, resume: 1 });
  assert.deepEqual(result.summary.outcomes, { succeeded: 3, failed: 1, canceled: 0 });
  assert.equal(result.summary.readiness.sampleCount, 1);
  assert.equal(result.summary.readiness.unobservedCount, 1);
  assert.equal(result.summary.readiness.unsupportedCount, 1);
  assert.equal(result.summary.readiness.p95Ms, 12_000);
  assert.equal(result.summary.readiness.coverage, "partial");
});

test("percentiles use the observed samples and never average bucket percentiles", () => {
  const result = aggregateUsageHistory({ ...input(), operations: [1, 2, 3, 100].map((seconds, i) => operation({ id: `op_${i}`, first_ready_at: date(10 + seconds) })) });
  assert.equal(result.summary.readiness.p50Ms, 2_000);
  assert.equal(result.summary.readiness.p95Ms, 100_000);
});

test("outcomes follow the latest terminal record while a retried operation stays one admission", () => {
  const failed = aggregateUsageHistory({ ...input(), operations: [operation({ state: "failed", first_ready_at: null })] });
  const retried = aggregateUsageHistory({ ...input(), operations: [operation({ state: "running", completed_at: null, first_ready_at: null })] });
  const completed = aggregateUsageHistory({ ...input(), operations: [operation({ state: "succeeded", completed_at: date(100) })] });
  for (const result of [failed, retried, completed]) assert.equal(result.summary.acceptedOperations?.create, 1);
  assert.equal(failed.summary.outcomes?.failed, 1);
  assert.deepEqual(retried.summary.outcomes, { succeeded: 0, failed: 0, canceled: 0 });
  assert.deepEqual(completed.summary.outcomes, { succeeded: 1, failed: 0, canceled: 0 });
});

test("retention and incomplete boundary buckets expose covered extent", () => {
  const result = aggregateUsageHistory({ ...input(), availableFrom: start + 30_000, holds: [{ created_at: date(-100), released_at: null }] });
  assert.equal(result.buckets[0].coverage, "partial");
  assert.equal(result.buckets[0].heldSlotSeconds, 30);
  assert.equal(result.buckets[0].coveredSeconds, 30);
  assert.equal(result.summary.heldSlotSeconds, 150);
  assert.equal(result.coverage.status, "partial");
});

test("bucket alignment is UTC-based for non-aligned and offset requests", () => {
  const result = aggregateUsageHistory({ ...input(), window: { from: date(30), to: date(150), resolution: "1m" } });
  assert.deepEqual(result.buckets.map((bucket) => bucket.coveredSeconds), [30, 60, 30]);
  const parsed = usageHistoryQuery.parse({ from: "2026-09-12T11:00:00+01:00", to: date(180), resolution: "1m" });
  assert.equal(Date.parse(parsed.from), start);
});

test("interval merging does not invent time between separate collector windows", () => {
  assert.deepEqual(mergeUsageIntervals([{ from: 0, to: 3 }, { from: 2, to: 4 }, { from: 7, to: 9 }], 1, 8), [{ from: 1, to: 4 }, { from: 7, to: 8 }]);
});

test("invalid windows, excessive buckets and unknown query fields are rejected before database access", async () => {
  for (const options of [{ ...input().window, to: date(0) }, { ...input().window, to: date(86_400 * 31) },
    { ...input().window, to: date(86_400 * 2) }, { ...input().window, organizationId: "another-org" }]) {
    assert.equal(usageHistoryQuery.safeParse(options).success, false);
  }
  let called = false;
  await assert.rejects(getUsageHistory("org", { ...input().window, to: date(0) }, { transaction: async () => { called = true; throw new Error("must not query"); } }));
  assert.equal(called, false);
});

test("database errors do not leak SQL, hosts or connection information", async () => {
  await assert.rejects(getUsageHistory("org", input().window, { transaction: async () => { throw new Error("private-db-host: secret credentials"); } }), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /query budget/);
    assert.doesNotMatch(error.message, /private-db-host|credentials/);
    return true;
  });
});

test("oversized source results fail explicitly instead of returning truncated totals", async () => {
  const query = (async (sql: string) => {
    const rows = sql.includes("CROSS JOIN organizations") ? [{ available_from: new Date(start), last_observed_at: new Date(start), now: new Date(start + 180_000) }] :
      sql.includes("FROM sandbox_capacity_reservations") ? Array.from({ length: 100_001 }, () => ({ created_at: date(0), released_at: null })) : [];
    return { rows, rowCount: rows.length };
  }) as Query;
  await assert.rejects(getUsageHistory("org", input().window, { transaction: (work) => work(query) }),
    (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "usage_history_limit_exceeded"));
});

test("slot integral agrees with a deterministic per-second reference", () => {
  const holds = Array.from({ length: 100 }, (_, i) => ({ created_at: date((i * 17) % 160 - 20), released_at: date((i * 17) % 160 + 20) }));
  const result = aggregateUsageHistory({ ...input(), holds });
  let expected = 0, peak = 0;
  for (let second = 0; second < 180; second++) {
    const n = holds.filter((hold) => Date.parse(hold.created_at) <= start + second * 1_000 && Date.parse(hold.released_at) > start + second * 1_000).length;
    expected += n; peak = Math.max(peak, n);
  }
  assert.equal(result.summary.heldSlotSeconds, expected);
  assert.equal(result.summary.peakHeldSlots, peak);
});
