import assert from "node:assert/strict";
import test from "node:test";
import type { UsageHistoryResponse } from "@h-sandbox/sdk";
import { usagePeriod, formatUsageHistory } from "./commands/usage.js";

test("usage presets produce bounded UTC windows and appropriate resolutions", () => {
  const now = Date.parse("2026-09-12T12:00:00Z");
  for (const [period, days, resolution] of [["24h", 1, "1m"], ["7d", 7, "15m"], ["30d", 30, "1h"]] as const) {
    const result = usagePeriod(period, now);
    assert.equal(Date.parse(result.to) - Date.parse(result.from), days * 86_400_000);
    assert.equal(result.resolution, resolution);
  }
  assert.throws(() => usagePeriod("all"), /Choose --period/);
});

test("human usage output never converts missing observations into zero", () => {
  const result = formatUsageHistory({ window: usagePeriod("24h"), coverage: { status: "unavailable", observer: "disabled", lastObservedAt: null },
    summary: { coveredSeconds: 0, heldSlotSeconds: null, peakHeldSlots: null, acceptedOperations: null,
      readiness: { p95Ms: null, sampleCount: 0, unobservedCount: 0, unsupportedCount: 0 } } } as UsageHistoryResponse);
  assert.match(result, /Held slot-hours: unavailable/);
  assert.match(result, /Peak held slots: unavailable/);
  assert.match(result, /not CPU consumption/);
});
