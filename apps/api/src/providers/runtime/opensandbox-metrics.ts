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
  const ts = new Date(metric.timestamp ?? Date.now()).toISOString();
  const cpu = Math.round(metric.cpu_used_pct ?? 0);
  const mem = Math.round(metric.mem_used_mib ?? 0);
  return {
    current: {
      cpu,
      mem,
      diskIo: 0,
      networkOut: 0,
      cpuCount: metric.cpu_count,
      memTotal: metric.mem_total_mib ? Math.round(metric.mem_total_mib) : undefined
    },
    series: [{ ts, cpu, mem }]
  };
};
