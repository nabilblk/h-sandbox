import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { Counter, Gauge, Histogram, Registry } from "@prometheus-io/client";
import { config } from "./config.js";
import type { UsageObserverReport } from "./services/usage-observer.js";

const reasons = ["organization_capacity_exceeded", "organization_capacity_unavailable", "organization_capacity_settings_conflict", "sandbox_transition_in_progress", "idempotency_conflict"];
const statuses = ["ready", "starting", "not_running", "unsupported", "unavailable"];

export function createOperatorMetrics() {
  const registry = new Registry();
  const registers = [registry];
  const denials = new Counter({ name: "harakiri_admission_denial_attempts_total", help: "HTTP capacity errors, not unique rejected operations.", labelNames: ["reason"] as const, registers });
  const errors = new Counter({ name: "harakiri_observer_errors_total", help: "Failed collection passes or observation writes since process start.", registers });
  const lastObserved = new Gauge({ name: "harakiri_observer_last_success_timestamp_seconds", help: "Time the process last completed a collection pass, not a historical usage measurement.", registers });
  const pending = new Gauge({ name: "harakiri_observer_pending", help: "Pending first-readiness observations at the last successful pass.", registers });
  const oldest = new Gauge({ name: "harakiri_observer_oldest_pending_timestamp_seconds", help: "Oldest pending observation, or zero when none remain.", registers });
  const probes = new Histogram({ name: "harakiri_readiness_probe_duration_seconds", help: "Read-only observer probe duration, not sandbox startup latency.", labelNames: ["status"] as const, buckets: [.05, .1, .25, .5, 1, 2.5, 5], registers });
  const reconciliation = new Gauge({ name: "harakiri_scheduler_last_success_timestamp_seconds", help: "Time of the last completed scheduler maintenance pass.", registers });
  const maintenanceErrors = new Counter({ name: "harakiri_scheduler_errors_total", help: "Failed scheduler maintenance passes since process start.", registers });
  const enabled = new Gauge({ name: "harakiri_observer_enabled", help: "Whether this scheduler is configured to observe readiness.", registers });
  lastObserved.set(0); pending.set(0); oldest.set(0); reconciliation.set(0); enabled.set(0);
  return {
    registry,
    configure: (component: "api" | "scheduler", observerEnabled: boolean) => { registry.setDefaultLabels({ component }); enabled.set(component === "scheduler" && observerEnabled ? 1 : 0); },
    denial: (reason: string) => { if (reasons.includes(reason)) denials.inc({ reason }); },
    observerError: () => errors.inc(),
    observerReport: (report: UsageObserverReport) => {
      lastObserved.set(Date.now() / 1_000); pending.set(report.pending); oldest.set(report.oldestPendingAtSeconds);
      if (report.failed) errors.inc(report.failed);
    },
    probe: (status: string, seconds: number) => { if (statuses.includes(status) && Number.isFinite(seconds) && seconds >= 0) probes.observe({ status }, seconds); },
    maintenance: (success: boolean) => { if (success) reconciliation.set(Date.now() / 1_000); else maintenanceErrors.inc(); }
  };
}

export const operatorMetrics = createOperatorMetrics();
const digest = (value: string) => createHash("sha256").update(value).digest();

export async function startOperatorMetrics(component: "api" | "scheduler", options = {
  enabled: config.operatorMetricsEnabled, host: config.operatorMetricsHost, port: config.operatorMetricsPort,
  token: config.operatorMetricsToken, metrics: operatorMetrics, observerEnabled: config.usageObserverEnabled
}) {
  if (!options.enabled) return null;
  if (!options.token || options.token.length < 32 || /\s/.test(options.token)) throw new Error("Private metrics requires a dedicated token of at least 32 non-whitespace characters");
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) throw new Error("Invalid private metrics port");
  const expected = digest(`Bearer ${options.token}`);
  options.metrics.configure(component, options.observerEnabled);
  const server = createServer({ maxHeaderSize: 8192, requestTimeout: 5000, headersTimeout: 5000 }, async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (!timingSafeEqual(expected, digest(request.headers.authorization ?? ""))) {
      response.writeHead(401); response.end(); return;
    }
    if (request.method !== "GET" || request.url !== "/metrics") { response.writeHead(404); response.end(); return; }
    try {
      const body = await options.metrics.registry.metrics();
      response.writeHead(200, { "Content-Type": options.metrics.registry.contentType }); response.end(body);
    } catch { response.writeHead(503); response.end(); }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => { server.off("error", reject); resolve(); });
  });
  return { address: server.address(), close: () => new Promise<void>((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); server.closeIdleConnections(); }) };
}
