import { z } from "zod";
import type { ObservabilityLimits } from "./control-model.js";

export type ObservabilitySettings = ObservabilityLimits & {
  collectorUrl: string;
  collectorToken: string;
  logsUrl: string;
  tracesUrl: string;
};

const flag = z.enum(["0", "1"]).default("0").transform((value) => value === "1");
const origin = z.string().url().refine((value) => {
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && url.pathname === "/"
    && !url.username && !url.password && !url.hash && !url.search;
}, "Expected a private HTTP(S) origin without credentials or a path");

/** Disabled means no connection to, or dependency on, a telemetry backend. */
export function readObservabilitySettings(env: NodeJS.ProcessEnv = process.env): ObservabilitySettings | null {
  if (!flag.parse(env.OBSERVABILITY_ENABLED)) return null;
  return z.object({
    enabled: z.literal(true),
    allowContent: flag,
    retentionDays: z.coerce.number().int().min(1).max(30),
    requestsPerMinute: z.coerce.number().int().min(1).max(6000),
    bytesPerMinute: z.coerce.number().int().min(1).max(1024 * 1024 * 1024),
    activeRunsPerOrganization: z.coerce.number().int().min(1).max(1000),
    grantsPerRun: z.coerce.number().int().min(1).max(64),
    collectorUrl: origin,
    collectorToken: z.string().min(32).max(256).regex(/^[A-Za-z0-9_-]+$/),
    logsUrl: origin,
    tracesUrl: origin
  }).parse({
    enabled: true, allowContent: env.OBSERVABILITY_ALLOW_CONTENT,
    retentionDays: env.OBSERVABILITY_RETENTION_DAYS ?? 7,
    requestsPerMinute: env.OBSERVABILITY_REQUESTS_PER_MINUTE ?? 600,
    bytesPerMinute: env.OBSERVABILITY_BYTES_PER_MINUTE ?? 16 * 1024 * 1024,
    activeRunsPerOrganization: env.OBSERVABILITY_ACTIVE_RUNS_PER_ORG ?? 100,
    grantsPerRun: env.OBSERVABILITY_GRANTS_PER_RUN ?? 8,
    collectorUrl: env.OBSERVABILITY_COLLECTOR_URL, collectorToken: env.OBSERVABILITY_COLLECTOR_TOKEN,
    logsUrl: env.OBSERVABILITY_LOGS_URL, tracesUrl: env.OBSERVABILITY_TRACES_URL
  });
}
