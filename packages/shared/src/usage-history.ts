export type UsageHistoryResolution = "1m" | "15m" | "1h";
export type UsageHistoryOptions = { from: string; to: string; resolution: UsageHistoryResolution };
export type UsageCoverageStatus = "complete" | "partial" | "unavailable";
export type UsageTimeRange = { from: string; to: string };
export type UsageOperationCounts = { create: number; restore: number; resume: number };
// Latest terminal operation records, not an append-only attempt/event log.
export type UsageOutcomeCounts = { succeeded: number; failed: number; canceled: number };
export type UsageHistoryBucket = UsageTimeRange & {
  coverage: UsageCoverageStatus;
  coveredSeconds: number;
  heldSlotSeconds: number | null;
  averageHeldSlots: number | null;
  peakHeldSlots: number | null;
  acceptedOperations: UsageOperationCounts | null;
  outcomes: UsageOutcomeCounts | null;
};
export type UsageHistoryResponse = {
  window: UsageHistoryOptions & { timezone: "UTC" };
  coverage: {
    status: UsageCoverageStatus;
    source: "reservation_intervals_and_operations";
    availableFrom: string;
    lastObservedAt: string | null;
    retentionDays: number;
    observer: "active" | "stale" | "disabled" | "not_started";
    gaps: UsageTimeRange[];
  };
  summary: {
    coveredSeconds: number;
    heldSlotSeconds: number | null;
    peakHeldSlots: number | null;
    acceptedOperations: UsageOperationCounts | null;
    outcomes: UsageOutcomeCounts | null;
    readiness: {
      coverage: UsageCoverageStatus;
      sampleCount: number;
      unobservedCount: number;
      unsupportedCount: number;
      p50Ms: number | null;
      p95Ms: number | null;
      observationIntervalMs: number;
    };
  };
  buckets: UsageHistoryBucket[];
};
