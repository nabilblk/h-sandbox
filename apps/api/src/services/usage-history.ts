import { z } from "zod";
import type { UsageHistoryBucket, UsageHistoryOptions, UsageHistoryResponse, UsageOperationCounts, UsageOutcomeCounts } from "@harakiri/shared";
import { transaction as defaultTransaction, type Transaction } from "../db.js";
import { config } from "../config.js";

const dayMs = 86_400_000;
export const usageResolutionMs = { "1m": 60_000, "15m": 900_000, "1h": 3_600_000 } as const;
export const usageObserverIntervalMs = 10_000;
export const usageSourceRowLimit = 100_000;
export const usageHistoryQuery = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  resolution: z.enum(["1m", "15m", "1h"])
}).strict().superRefine((input, ctx) => {
  const from = Date.parse(input.from), to = Date.parse(input.to), step = usageResolutionMs[input.resolution];
  if (to <= from || to - from > 30 * dayMs) ctx.addIssue({ code: "custom", message: "Choose a positive time window of at most 30 days." });
  if (Math.ceil(to / step) - Math.floor(from / step) > 1_500) ctx.addIssue({ code: "custom", message: "Choose a coarser resolution; a response supports at most 1500 buckets." });
});

export class UsageHistoryError extends Error {
  readonly statusCode = 503;
  constructor(readonly code: "usage_history_unavailable" | "usage_history_limit_exceeded", message: string) { super(message); }
}

export type UsageInterval = { from: number; to: number };
export type UsageHold = { created_at: Date | string; released_at: Date | string | null };
export type UsageOperation = {
  id: string; kind: "provision" | "resume"; restored: boolean; state: string;
  created_at: Date | string; completed_at: Date | string | null;
  observation_state: string | null; first_ready_at: Date | string | null; observation_finished_at: Date | string | null;
};

const time = (value: string | Date) => new Date(value).getTime();
const iso = (value: number) => new Date(value).toISOString();
const acceptedCounts = (): UsageOperationCounts => ({ create: 0, restore: 0, resume: 0 });
const outcomeCounts = (): UsageOutcomeCounts => ({ succeeded: 0, failed: 0, canceled: 0 });

export const mergeUsageIntervals = (intervals: UsageInterval[], from: number, to: number): UsageInterval[] => {
  const result: UsageInterval[] = [];
  for (const interval of intervals.map((item) => ({ from: Math.max(from, item.from), to: Math.min(to, item.to) })).filter((item) => item.to > item.from).sort((a, b) => a.from - b.from)) {
    const previous = result.at(-1);
    if (previous && interval.from <= previous.to) previous.to = Math.max(previous.to, interval.to);
    else result.push({ ...interval });
  }
  return result;
};

const contains = (intervals: UsageInterval[], value: number) => {
  let low = 0, high = intervals.length;
  while (low < high) { const mid = (low + high) >>> 1; if (intervals[mid].from <= value) low = mid + 1; else high = mid; }
  return low > 0 && value < intervals[low - 1].to;
};

export const aggregateUsageHistory = (input: {
  window: UsageHistoryOptions; availableFrom: number; observedAt: number | null; observerEnabled: boolean;
  now: number; retentionDays: number; windows: UsageInterval[]; holds: UsageHold[]; operations: UsageOperation[];
}): UsageHistoryResponse => {
  const from = time(input.window.from), to = time(input.window.to), step = usageResolutionMs[input.window.resolution];
  const windows = mergeUsageIntervals(input.windows, Math.max(from, input.availableFrom), Math.min(to, input.now));
  const gaps: UsageInterval[] = [];
  let cursor = from;
  for (const range of windows) { if (range.from > cursor) gaps.push({ from: cursor, to: range.from }); cursor = range.to; }
  if (cursor < to) gaps.push({ from: cursor, to });
  const points = new Map<number, number>([[from, 0], [to, 0]]);
  const buckets: UsageHistoryBucket[] = [];
  const starts: number[] = [];
  for (let start = from; start < to;) {
    const end = Math.min(to, (Math.floor(start / step) + 1) * step);
    starts.push(start); points.set(start, 0); points.set(end, 0);
    buckets.push({ from: iso(start), to: iso(end), coverage: "unavailable", coveredSeconds: 0,
      heldSlotSeconds: 0, averageHeldSlots: null, peakHeldSlots: 0, acceptedOperations: acceptedCounts(), outcomes: outcomeCounts() });
    start = end;
  }
  for (const range of windows) { points.set(range.from, 0); points.set(range.to, 0); }
  for (const hold of input.holds) {
    const start = Math.max(from, time(hold.created_at)), end = Math.min(to, hold.released_at ? time(hold.released_at) : input.now);
    if (end <= start) continue;
    points.set(start, (points.get(start) ?? 0) + 1);
    points.set(end, (points.get(end) ?? 0) - 1);
  }
  const ordered = [...points].filter(([at]) => at >= from && at <= to).sort(([a], [b]) => a - b);
  let held = 0, bucketIndex = 0;
  for (let index = 0; index < ordered.length - 1; index++) {
    const [at, delta] = ordered[index]; held += delta;
    while (bucketIndex + 1 < buckets.length && starts[bucketIndex + 1] <= at) bucketIndex++;
    if (!contains(windows, at)) continue;
    const seconds = (ordered[index + 1][0] - at) / 1_000;
    const bucket = buckets[bucketIndex];
    bucket.coveredSeconds += seconds;
    bucket.heldSlotSeconds! += held * seconds;
    bucket.peakHeldSlots = Math.max(bucket.peakHeldSlots!, held);
  }
  const findBucket = (at: number) => {
    if (at < from || at >= to || !contains(windows, at)) return null;
    return buckets[Math.floor(at / step) - Math.floor(from / step)];
  };
  const samples: number[] = [];
  let unobservedCount = 0, unsupportedCount = 0;
  for (const operation of input.operations) {
    const acceptedAt = time(operation.created_at), accepted = findBucket(acceptedAt);
    if (accepted) {
      accepted.acceptedOperations![operation.kind === "resume" ? "resume" : operation.restored ? "restore" : "create"]++;
      const ready = operation.first_ready_at ? time(operation.first_ready_at) : null;
      if (ready !== null && ready >= acceptedAt && ready < to && ready <= input.now && contains(windows, ready)) samples.push(ready - acceptedAt);
      else if (operation.observation_state === "unsupported" && operation.observation_finished_at &&
        time(operation.observation_finished_at) >= acceptedAt && time(operation.observation_finished_at) <= input.now && time(operation.observation_finished_at) < to) unsupportedCount++;
      else unobservedCount++;
    }
    if (operation.completed_at && ["succeeded", "failed", "canceled"].includes(operation.state)) {
      const completed = findBucket(time(operation.completed_at));
      if (completed) completed.outcomes![operation.state as keyof UsageOutcomeCounts]++;
    }
  }
  const accepted = acceptedCounts(), outcomes = outcomeCounts();
  let coveredSeconds = 0, heldSlotSeconds = 0, peak = 0;
  for (const bucket of buckets) {
    const duration = (time(bucket.to) - time(bucket.from)) / 1_000;
    if (!bucket.coveredSeconds) {
      bucket.heldSlotSeconds = null; bucket.peakHeldSlots = null; bucket.acceptedOperations = null; bucket.outcomes = null;
      continue;
    }
    bucket.coverage = Math.abs(bucket.coveredSeconds - duration) < 0.000_001 ? "complete" : "partial";
    bucket.averageHeldSlots = bucket.heldSlotSeconds! / bucket.coveredSeconds;
    coveredSeconds += bucket.coveredSeconds; heldSlotSeconds += bucket.heldSlotSeconds!; peak = Math.max(peak, bucket.peakHeldSlots!);
    for (const key of Object.keys(accepted) as (keyof UsageOperationCounts)[]) accepted[key] += bucket.acceptedOperations![key];
    for (const key of Object.keys(outcomes) as (keyof UsageOutcomeCounts)[]) outcomes[key] += bucket.outcomes![key];
  }
  samples.sort((a, b) => a - b);
  const percentile = (fraction: number) => samples.length ? samples[Math.max(0, Math.ceil(samples.length * fraction) - 1)] : null;
  const status = !coveredSeconds ? "unavailable" : gaps.length ? "partial" : "complete";
  return {
    window: { from: iso(from), to: iso(to), resolution: input.window.resolution, timezone: "UTC" },
    coverage: { status, source: "reservation_intervals_and_operations", availableFrom: iso(input.availableFrom),
      lastObservedAt: input.observedAt === null ? null : iso(input.observedAt), retentionDays: input.retentionDays,
      observer: !input.observerEnabled ? "disabled" : input.observedAt === null ? "not_started" : input.now - input.observedAt > 30_000 ? "stale" : "active",
      gaps: gaps.map((gap) => ({ from: iso(gap.from), to: iso(gap.to) })) },
    summary: { coveredSeconds, heldSlotSeconds: coveredSeconds ? heldSlotSeconds : null, peakHeldSlots: coveredSeconds ? peak : null,
      acceptedOperations: coveredSeconds ? accepted : null, outcomes: coveredSeconds ? outcomes : null,
      readiness: { coverage: !samples.length ? "unavailable" : status !== "complete" || unobservedCount || unsupportedCount ? "partial" : "complete",
        sampleCount: samples.length, unobservedCount, unsupportedCount, p50Ms: percentile(0.5), p95Ms: percentile(0.95), observationIntervalMs: usageObserverIntervalMs } },
    buckets
  };
};

export const getUsageHistory = async (organizationId: string, options: UsageHistoryOptions, dependencies: {
  transaction?: Transaction; retentionDays?: number; observerEnabled?: boolean;
} = {}): Promise<UsageHistoryResponse> => {
  const window = usageHistoryQuery.parse(options);
  try {
    const retentionDays = z.number().int().min(1).max(30).parse(dependencies.retentionDays ?? config.usageRetentionDays);
    return await (dependencies.transaction ?? defaultTransaction)(async (query) => {
      await query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      await query("SET LOCAL statement_timeout = '2s'");
      const { rows: meta } = await query<{ available_from: Date; last_observed_at: Date | null; now: Date }>(
        `SELECT GREATEST(u.available_from,o.created_at,clock_timestamp()-($2::int * interval '1 day')) AS available_from,
         u.last_observed_at, clock_timestamp() AS now FROM usage_collection_state u CROSS JOIN organizations o WHERE o.id=$1`, [organizationId, retentionDays]);
      if (!meta[0]) throw new UsageHistoryError("usage_history_unavailable", "Usage history is not initialized for this organization.");
      const range = [organizationId, window.from, window.to, usageSourceRowLimit + 1];
      const { rows: holds } = await query<UsageHold>(`SELECT created_at, released_at FROM sandbox_capacity_reservations
        WHERE organization_id=$1 AND created_at < $3::timestamptz AND (released_at IS NULL OR released_at > $2::timestamptz) LIMIT $4`, range);
      const { rows: operations } = await query<UsageOperation>(`SELECT o.id,o.kind,o.state,o.created_at,o.completed_at,
        (o.request ? 'restoreSnapshotId') AS restored, r.state AS observation_state,r.first_ready_at,r.finished_at AS observation_finished_at
        FROM sandbox_operations o LEFT JOIN usage_readiness_observations r ON r.operation_id=o.id AND r.organization_id=o.organization_id
        WHERE o.organization_id=$1 AND o.kind IN ('provision','resume') AND
          ((o.created_at >= $2::timestamptz AND o.created_at < $3::timestamptz) OR
           (o.completed_at >= $2::timestamptz AND o.completed_at < $3::timestamptz)) LIMIT $4`, range);
      const { rows: windows } = await query<{ started_at: Date; observed_through: Date }>(`SELECT started_at,observed_through FROM usage_observer_windows
        WHERE observed_through > $1::timestamptz AND started_at < $2::timestamptz ORDER BY started_at LIMIT $3`, [window.from, window.to, usageSourceRowLimit + 1]);
      if ([holds, operations, windows].some((rows) => rows.length > usageSourceRowLimit)) throw new UsageHistoryError("usage_history_limit_exceeded", "This window exceeds the history query budget. Choose a shorter period.");
      return aggregateUsageHistory({ window, availableFrom: time(meta[0].available_from), observedAt: meta[0].last_observed_at ? time(meta[0].last_observed_at) : null,
        observerEnabled: dependencies.observerEnabled ?? config.usageObserverEnabled, now: time(meta[0].now), retentionDays,
        windows: windows.map((item) => ({ from: time(item.started_at), to: time(item.observed_through) })), holds, operations });
    });
  } catch (error) {
    if (error instanceof UsageHistoryError) throw error;
    throw new UsageHistoryError("usage_history_unavailable", "Usage history could not be read within its query budget. Retry or choose a shorter period.");
  }
};
