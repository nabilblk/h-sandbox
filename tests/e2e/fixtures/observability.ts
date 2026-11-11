import type { Page } from "@playwright/test";
import type { AgentRunRecord, ObservabilityPolicy, TelemetrySpan, TelemetryLog } from "../../../packages/shared/src/observability";
import { setupSandboxDetail } from "./sandbox-detail";

export const traceId = "a".repeat(32);
const start = 1794225600000000000n;
export function spanFixture(index: number, patch: Partial<TelemetrySpan> = {}): TelemetrySpan {
  const spanId = (index + 1).toString(16).padStart(16, "0");
  const offset = BigInt(index) * 400_000_000n;
  const duration = index === 0 ? 8_000_000_000n : 300_000_000n;
  return {
    id: `${traceId}:${spanId}`, traceId, spanId, parentSpanId: index ? "0000000000000001" : null,
    parent: index ? "present" : "root", sandboxId: "sbx_python",
    name: ["Repair the CSV parser", "Inspect repository", "Plan the repair", "Run regression tests", "Apply fix", "Verify original contract"][index] ?? `Tool step ${index}`,
    kind: 1, status: index === 3 ? "error" : "ok", startTimeUnixNano: (start + offset).toString(),
    endTimeUnixNano: (start + offset + duration).toString(), durationNano: duration.toString(),
    serviceName: "repair-agent", scopeName: "openinference.langchain", scopeVersion: "4.1.5", source: "workload",
    attributes: { "openinference.span.kind": index === 0 ? "AGENT" : index === 2 ? "LLM" : "TOOL",
      ...(index === 2 ? { "llm.model_name": "fixture-model", "llm.token_count.prompt": "640", "llm.token_count.completion": "126" } : {}),
      ...(index === 3 ? { "harakiri.command.id": "cmd_example" } : {}) },
    content: { state: "hidden", attributes: {}, statusMessage: null, events: [], links: [] }, deliveries: 1, issues: [], ...patch
  };
}

export async function setupObservability(page: Page) {
  await setupSandboxDetail(page);
  const run: AgentRunRecord = { id: "run_fixture", name: "Repair CSV parser / UI fixture", capture: "content", reportedOutcome: "succeeded",
    sandboxIds: ["sbx_python"], createdAt: "2026-11-09T12:00:00.000Z", closedAt: "2026-11-09T12:00:08.000Z",
    retainedUntil: "2026-11-16T12:00:00.000Z", expired: false, recording: false,
    lastAcceptedAt: "2026-11-09T12:00:09.000Z", lastRejectedAt: null, lastRejection: null };
  const policy: ObservabilityPolicy = { available: true, enabled: true, allowContent: true, retentionDays: 7,
    canConfigure: true, canReadContent: true, operatorAllowsContent: true };
  const state = { run, policy, spans: Array.from({ length: 8 }, (_, index) => spanFixture(index)), logsStatus: 200, spansStatus: 200,
    requests: [] as string[], logCount: 3, frameworkPayload: false,
    input: '<script>window.traceAttack=true</script><img src=x onerror="alert(1)">', output: "" };
  await page.route("**/v1/observability/policy", (route) => {
    if (route.request().method() === "PATCH") Object.assign(state.policy, route.request().postDataJSON());
    return route.fulfill({ json: state.policy });
  });
  await page.route("**/v1/agent-runs**", (route) => {
    const url = new URL(route.request().url()); state.requests.push(url.pathname + url.search);
    const content = url.searchParams.get("includeContent") === "true";
    const snapshot = { window: { from: url.searchParams.get("from"), to: url.searchParams.get("to") },
      readAt: "2026-11-09T12:00:12.000Z", consistency: "eventual", rejectedRecords: 0, issues: [], partial: false };
    if (url.pathname.endsWith("/spans")) return route.fulfill({ status: state.spansStatus, json: state.spansStatus === 200
      ? { ...snapshot, scannedRecords: state.spans.length, records: state.spans.map((span) => ({ ...span,
        content: content ? { ...span.content, state: "available", attributes: { [state.frameworkPayload ? "input.value" : "gen_ai.input.messages"]: state.input,
          ...(state.output ? { [state.frameworkPayload ? "output.value" : "gen_ai.output.messages"]: state.output } : {}) } } : span.content })) }
      : { error: "forbidden", message: "Telemetry access denied." } });
    if (url.pathname.endsWith("/logs")) {
      const records: TelemetryLog[] = Array.from({ length: Math.min(500, state.logCount) }, (_, index) => ({
        id: `log_${index}`, time: "2026-11-09T12:00:02.000000001Z", observedTimeUnixNano: null,
        sandboxId: "sbx_python", traceId, spanId: url.searchParams.get("spanId"), severity: index === 1 ? "WARN" : "INFO", severityNumber: 9,
        serviceName: "repair-agent", source: "workload", attributes: {}, issues: [],
        content: { state: content ? "available" : "hidden", body: content ? `Fixture output ${index}: 4 tests passed` : null, attributes: {} }
      }));
      return route.fulfill({ status: state.logsStatus, json: state.logsStatus === 200
        ? { ...snapshot, records, scannedRecords: records.length, partial: state.logCount > 500, issues: state.logCount > 500 ? ["record_limit"] : [] }
        : { error: "telemetry_query_unavailable", message: "Log storage is unavailable." } });
    }
    if (url.pathname === "/v1/agent-runs") {
      const matches = !url.searchParams.get("search") || run.name.toLowerCase().includes(url.searchParams.get("search")!.toLowerCase());
      return route.fulfill({ json: { runs: matches ? [run] : [], nextCursor: null } });
    }
    return route.fulfill({ json: { run } });
  });
  return state;
}
