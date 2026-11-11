import type { AgentRunResponse, AgentRunsOptions, AgentRunsResponse, ObservabilityPolicy,
  TelemetryReadOptions, TelemetrySnapshot, TelemetrySpan, TelemetryLog, UpdateObservabilityPolicyBody } from "@harakiri/shared";
import { boundedRequest, request } from "./request";

const query = (options: object) => new URLSearchParams(Object.entries(options)
  .filter(([, value]) => value !== undefined && value !== "").map(([key, value]) => [key, String(value)])).toString();

export const observabilityApi = {
  policy: (signal?: AbortSignal) => request<ObservabilityPolicy>("/v1/observability/policy", { signal }),
  configure: (body: UpdateObservabilityPolicyBody) => request<ObservabilityPolicy>("/v1/observability/policy", { method: "PATCH", body: JSON.stringify(body) }),
  runs: (options: AgentRunsOptions, signal?: AbortSignal) => boundedRequest<AgentRunsResponse>(`/v1/agent-runs?${query(options)}`, 512 * 1024, { signal }),
  run: (id: string, signal?: AbortSignal) => request<AgentRunResponse>(`/v1/agent-runs/${encodeURIComponent(id)}`, { signal }),
  spans: (id: string, options: TelemetryReadOptions, signal?: AbortSignal) => boundedRequest<TelemetrySnapshot<TelemetrySpan>>(
    `/v1/agent-runs/${encodeURIComponent(id)}/spans?${query(options)}`, 18 * 1024 * 1024, { signal }),
  logs: (id: string, options: TelemetryReadOptions, signal?: AbortSignal) => boundedRequest<TelemetrySnapshot<TelemetryLog>>(
    `/v1/agent-runs/${encodeURIComponent(id)}/logs?${query(options)}`, 18 * 1024 * 1024, { signal })
};
