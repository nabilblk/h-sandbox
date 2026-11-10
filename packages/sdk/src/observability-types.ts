// Public package copy of packages/shared/src/observability.ts; parity is tested.
export type AgentCapture = "metadata" | "content";
export type AgentOutcome = "unknown" | "succeeded" | "failed" | "cancelled";

export type AgentRunRecord = {
  id: string;
  name: string;
  capture: AgentCapture;
  reportedOutcome: AgentOutcome;
  sandboxIds: string[];
  createdAt: string;
  closedAt: string | null;
  retainedUntil: string;
  expired: boolean;
  recording: boolean;
  /** Collector acknowledgement only; not proof of persistence or complete instrumentation. */
  lastAcceptedAt: string | null;
  lastRejectedAt: string | null;
  lastRejection: "rate_limited" | "collector_unavailable" | "collector_rejected" | null;
};

export type ObservabilityPolicy = {
  available: boolean;
  enabled: boolean;
  allowContent: boolean;
  retentionDays: number;
  canConfigure: boolean;
  canReadContent: boolean;
  operatorAllowsContent: boolean;
};
export type UpdateObservabilityPolicyBody = { enabled: boolean; allowContent: boolean };
export type CreateAgentRunBody = { name: string; sandboxId: string; capture?: AgentCapture };
export type AgentRunsOptions = { sandboxId?: string; outcome?: AgentOutcome; search?: string; limit?: number; cursor?: string };
export type AgentRunsResponse = { runs: AgentRunRecord[]; nextCursor: string | null };
export type AgentRunResponse = { run: AgentRunRecord };
export type TelemetryGrantResponse = {
  id: string;
  /** Shown once. Never store in browser persistence, URLs or trace attributes. */
  token: string;
  expiresAt: string;
  capture: AgentCapture;
};

export type TelemetryWindow = { from: string; to: string };
export type TelemetryReadOptions = TelemetryWindow & {
  limit?: number;
  traceId?: string;
  spanId?: string;
  includeContent?: boolean;
};
export type TelemetryContentState = "not_captured" | "hidden" | "available";
export type TelemetryIssue = "invalid_record" | "unsupported_schema" | "conflicting_span"
  | "missing_parent" | "cyclic_parent" | "invalid_timing" | "truncated_record" | "record_limit";

export type TelemetrySpan = {
  id: string;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  parent: "root" | "present" | "missing" | "cycle";
  sandboxId: string;
  name: string;
  kind: number;
  status: "unset" | "ok" | "error" | "unknown";
  startTimeUnixNano: string;
  endTimeUnixNano: string | null;
  durationNano: string | null;
  serviceName: string | null;
  scopeName: string | null;
  scopeVersion: string | null;
  source: "workload";
  attributes: Record<string, string>;
  content: {
    state: TelemetryContentState;
    attributes: Record<string, string>;
    statusMessage: string | null;
    events: { name: string; timeUnixNano: string | null; attributes: Record<string, string> }[];
    links: { traceId: string; spanId: string; attributes: Record<string, string> }[];
  };
  deliveries: number;
  issues: TelemetryIssue[];
};

export type TelemetryLog = {
  id: string;
  time: string;
  observedTimeUnixNano: string | null;
  sandboxId: string;
  traceId: string | null;
  spanId: string | null;
  severity: string;
  severityNumber: number | null;
  serviceName: string | null;
  source: "workload";
  attributes: Record<string, string>;
  content: { state: TelemetryContentState; body: string | null; attributes: Record<string, string> };
  issues: TelemetryIssue[];
};

/** A bounded, eventually consistent read. Narrow its window when record_limit is reported. */
export type TelemetrySnapshot<T> = {
  records: T[];
  window: TelemetryWindow;
  readAt: string;
  consistency: "eventual";
  scannedRecords: number;
  rejectedRecords: number;
  issues: TelemetryIssue[];
  /** Read limitations, never a statement that the agent was fully instrumented. */
  partial: boolean;
};
