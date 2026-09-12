import type { Command } from "commander";
import { HarakiriApiError, type UsageHistoryOptions, type UsageHistoryResponse } from "@h-sandbox/sdk";
import { apiClient } from "../config.js";

export const usagePeriod = (period: string, now = Date.now()): UsageHistoryOptions => {
  const choice = period === "24h" ? { days: 1, resolution: "1m" as const } : period === "7d" ? { days: 7, resolution: "15m" as const } : period === "30d" ? { days: 30, resolution: "1h" as const } : null;
  if (!choice) throw new Error("Choose --period 24h, 7d or 30d.");
  return { from: new Date(now - choice.days * 86_400_000).toISOString(), to: new Date(now).toISOString(), resolution: choice.resolution };
};

export const formatUsageHistory = (history: UsageHistoryResponse) => {
  const { summary, coverage } = history;
  const accepted = summary.acceptedOperations;
  return [
    `Window: ${history.window.from} to ${history.window.to} (UTC)`,
    `Coverage: ${coverage.status}; observer ${coverage.observer}; ${(summary.coveredSeconds / 3_600).toFixed(2)} hours observed`,
    `Last observation: ${coverage.lastObservedAt ?? "unavailable"}`,
    `Accepted: ${accepted ? `${accepted.create} creates, ${accepted.restore} restores, ${accepted.resume} resumes` : "unavailable"}`,
    `Held slot-hours: ${summary.heldSlotSeconds === null ? "unavailable" : (summary.heldSlotSeconds / 3_600).toFixed(2)}`,
    `Peak held slots: ${summary.peakHeldSlots ?? "unavailable"}`,
    `Observed readiness p95: ${summary.readiness.p95Ms === null ? "unavailable" : `${summary.readiness.p95Ms} ms`} (${summary.readiness.sampleCount} samples, ${summary.readiness.unobservedCount} unobserved, ${summary.readiness.unsupportedCount} unsupported)`,
    "Slot occupancy is not CPU consumption or billable compute."
  ].join("\n");
};

export function registerUsageCommands(program: Command) {
  program.command("usage").description("Read organization usage observations (requires org:read)")
    .option("--period <period>", "24h, 7d or 30d", "24h").option("--json", "print structured history including coverage and buckets")
    .action(async (options: { period: string; json?: boolean }) => {
      const window = usagePeriod(options.period);
      try {
        const result = await (await apiClient()).usageHistory(window);
        console.log(options.json ? JSON.stringify(result, null, 2) : formatUsageHistory(result));
      } catch (error) {
        if (error instanceof HarakiriApiError) {
          if (options.json) { console.error(JSON.stringify({ ...error.details, status: error.status })); process.exitCode = 1; return; }
          if (error.status === 404) throw new Error("Usage history is unavailable on this server. Upgrade to a release that supports historical observations.");
        }
        throw error;
      }
    });
}
