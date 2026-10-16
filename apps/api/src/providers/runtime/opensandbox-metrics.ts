import { callExecd } from "./opensandbox-execd.js";
import type { SandboxMetricsSnapshot } from "./opensandbox-types.js";

export const sandboxMetrics = async (opensandboxId: string): Promise<SandboxMetricsSnapshot> => {
  const body = await callExecd(opensandboxId, "/metrics");
  const metric = JSON.parse(body) as {
    cpu_count?: number;
    cpu_used_pct?: number;
    mem_total_mib?: number;
    mem_used_mib?: number;
    timestamp?: number;
  };
  if (typeof metric.cpu_used_pct !== "number" || !Number.isFinite(metric.cpu_used_pct) || metric.cpu_used_pct < 0 ||
      typeof metric.mem_used_mib !== "number" || !Number.isFinite(metric.mem_used_mib) || metric.mem_used_mib < 0) {
    throw new Error("Provider returned invalid CPU or memory measurements.");
  }
  const date = typeof metric.timestamp === "number" ? new Date(metric.timestamp) : null;
  const ts = date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
  const cpu = Math.round(metric.cpu_used_pct);
  const mem = Math.round(metric.mem_used_mib);
  const cpuCount = Number.isSafeInteger(metric.cpu_count) && metric.cpu_count! > 0 ? metric.cpu_count : undefined;
  const memTotal = typeof metric.mem_total_mib === "number" && Number.isFinite(metric.mem_total_mib) && metric.mem_total_mib > 0 ? Math.round(metric.mem_total_mib) : undefined;
  return {
    observedAt: ts,
    availableFields: ["cpu", "mem", ...(cpuCount ? ["cpuCount" as const] : []), ...(memTotal ? ["memTotal" as const] : [])],
    current: {
      cpu,
      mem,
      diskIo: 0,
      networkOut: 0,
      cpuCount,
      memTotal
    },
    series: ts ? [{ ts, cpu, mem }] : []
  };
};
