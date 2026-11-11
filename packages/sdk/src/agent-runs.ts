import type { RequestOptions } from "./request.js";
import type {
  AgentOutcome, AgentRunResponse, AgentRunsOptions, AgentRunsResponse, CreateAgentRunBody,
  ObservabilityPolicy, TelemetryGrantResponse, TelemetryLog, TelemetryReadOptions,
  TelemetrySnapshot, TelemetrySpan
} from "./observability-types.js";

type Request = <T>(path: string, init?: RequestInit, options?: RequestOptions) => Promise<T>;
const path = (id: string) => `/v1/agent-runs/${encodeURIComponent(id)}`;
function query(input: AgentRunsOptions | TelemetryReadOptions) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return params.size ? `?${params}` : "";
}

/** Write-only credential. Logging or JSON serialization excludes its token. */
export class HarakiriTelemetryGrant {
  readonly id: string;
  readonly expiresAt: string;
  readonly capture: TelemetryGrantResponse["capture"];
  #token: string;
  #url: string;

  constructor(grant: TelemetryGrantResponse, apiUrl: string) {
    const url = new URL(apiUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new TypeError("Telemetry requires an HTTP(S) API URL without credentials, query or fragment.");
    }
    this.id = grant.id;
    this.expiresAt = grant.expiresAt;
    this.capture = grant.capture;
    this.#token = grant.token;
    this.#url = url.href.replace(/\/$/, "");
  }

  /** Explicitly reveals exporter credentials. Do not log the returned options. */
  exporterOptions(signal: "traces" | "logs") {
    if (signal !== "traces" && signal !== "logs") throw new TypeError("Unsupported telemetry signal.");
    if (!(Date.parse(this.expiresAt) > Date.now())) throw new Error("Telemetry grant expired. Request a new grant.");
    return { url: `${this.#url}/v1/telemetry/${signal}`, headers: { Authorization: `Bearer ${this.#token}` } };
  }

  toJSON() { return { id: this.id, expiresAt: this.expiresAt, capture: this.capture }; }
}

/** Control/query API only: no global provider, exporter, polling or implicit capture. */
export function createAgentRuns(request: Request, apiUrl: () => string) {
  return {
    policy: (options: RequestOptions = {}) => request<ObservabilityPolicy>("/v1/observability/policy", {}, options),
    create: (input: CreateAgentRunBody, options: RequestOptions = {}) => request<AgentRunResponse>("/v1/agent-runs", {
      method: "POST", body: JSON.stringify(input)
    }, options),
    list: (input: AgentRunsOptions = {}, options: RequestOptions = {}) => request<AgentRunsResponse>(`/v1/agent-runs${query(input)}`, {}, options),
    get: (id: string, options: RequestOptions = {}) => request<AgentRunResponse>(path(id), {}, options),
    close: (id: string, outcome: AgentOutcome, options: RequestOptions = {}) => request<AgentRunResponse>(`${path(id)}/close`, {
      method: "POST", body: JSON.stringify({ outcome })
    }, options),
    spans: (id: string, input: TelemetryReadOptions, options: RequestOptions = {}) =>
      request<TelemetrySnapshot<TelemetrySpan>>(`${path(id)}/spans${query(input)}`, {}, options),
    logs: (id: string, input: TelemetryReadOptions, options: RequestOptions = {}) =>
      request<TelemetrySnapshot<TelemetryLog>>(`${path(id)}/logs${query(input)}`, {}, options),
    grant: async (id: string, sandboxId: string, options: RequestOptions = {}) => new HarakiriTelemetryGrant(
      await request<TelemetryGrantResponse>(`${path(id)}/grants`, { method: "POST", body: JSON.stringify({ sandboxId }) }, options), apiUrl()
    ),
    revokeGrant: (id: string, grantId: string, options: RequestOptions = {}) =>
      request<{ ok: true }>(`${path(id)}/grants/${encodeURIComponent(grantId)}`, { method: "DELETE" }, options)
  };
}
