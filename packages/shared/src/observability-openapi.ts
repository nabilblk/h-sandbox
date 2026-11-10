type Schema = Record<string, unknown>;
const string = { type: "string" };
const nullableString = { type: ["string", "null"] };
const boolean = { type: "boolean" };
const integer = { type: "integer" };
const dateTime = { type: "string", format: "date-time" };
const nullableTime = { type: ["string", "null"], format: "date-time" };
const attributes = { type: "object", additionalProperties: string };
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const array = (items: Schema) => ({ type: "array", items });
const object = (properties: Record<string, Schema>, required = Object.keys(properties)): Schema => ({
  type: "object", properties, required, additionalProperties: false
});
const outcome = { type: "string", enum: ["unknown", "succeeded", "failed", "cancelled"] };
const capture = { type: "string", enum: ["metadata", "content"] };
const contentState = { type: "string", enum: ["not_captured", "hidden", "available"] };
const issues = array({ type: "string", enum: ["invalid_record", "unsupported_schema", "conflicting_span", "missing_parent", "cyclic_parent", "invalid_timing", "truncated_record", "record_limit"] });
const snapshot = (record: string) => object({
  records: array(ref(record)), window: object({ from: dateTime, to: dateTime }), readAt: dateTime,
  consistency: { const: "eventual" }, scannedRecords: integer, rejectedRecords: integer, issues,
  partial: { ...boolean, description: "Read limitations, not instrumentation completeness. Narrow the read window when record_limit is present." }
});

export const observabilitySchemas: Record<string, Schema> = {
  ObservabilityPolicy: object({ available: boolean, enabled: boolean, allowContent: boolean, retentionDays: integer,
    canConfigure: boolean, canReadContent: boolean, operatorAllowsContent: boolean }),
  UpdateObservabilityPolicyBody: object({ enabled: boolean, allowContent: boolean }),
  CreateAgentRunBody: object({ name: { type: "string", minLength: 1, maxLength: 120 }, sandboxId: string, capture }, ["name", "sandboxId"]),
  AgentRunRecord: object({ id: string, name: string, capture, reportedOutcome: outcome, sandboxIds: array(string),
    createdAt: dateTime, closedAt: nullableTime, retainedUntil: dateTime, expired: boolean, recording: boolean,
    lastAcceptedAt: { ...nullableTime, description: "Collector acknowledgement; not proof of durability, query visibility or complete capture." },
    lastRejectedAt: nullableTime, lastRejection: { type: ["string", "null"], enum: ["rate_limited", "collector_unavailable", "collector_rejected", null] } }),
  AgentRunResponse: object({ run: ref("AgentRunRecord") }),
  AgentRunsResponse: object({ runs: array(ref("AgentRunRecord")), nextCursor: nullableString }),
  TelemetryGrantResponse: object({ id: string, token: { ...string, description: "Shown once. Write-only scoped grant, valid for at most 15 minutes. Never log, persist in browser storage or place in a URL." }, expiresAt: dateTime, capture }),
  TelemetrySpan: object({
    id: string, traceId: string, spanId: string, parentSpanId: nullableString,
    parent: { type: "string", enum: ["root", "present", "missing", "cycle"] }, sandboxId: string, name: string, kind: integer,
    status: { type: "string", enum: ["unset", "ok", "error", "unknown"] }, startTimeUnixNano: string,
    endTimeUnixNano: nullableString, durationNano: nullableString, serviceName: nullableString,
    scopeName: nullableString, scopeVersion: nullableString, source: { const: "workload" }, attributes,
    content: object({ state: contentState, attributes, statusMessage: nullableString,
      events: array(object({ name: string, timeUnixNano: nullableString, attributes })),
      links: array(object({ traceId: string, spanId: string, attributes })) }), deliveries: integer, issues
  }),
  TelemetryLog: object({ id: string, time: string, observedTimeUnixNano: nullableString, sandboxId: string,
    traceId: nullableString, spanId: nullableString, severity: string, severityNumber: { type: ["integer", "null"] },
    serviceName: nullableString, source: { const: "workload" }, attributes,
    content: object({ state: contentState, body: nullableString, attributes }), issues }),
  TelemetrySpansResponse: snapshot("TelemetrySpan"),
  TelemetryLogsResponse: snapshot("TelemetryLog")
};

const parameter = (name: string, location: "path" | "query", schema: Schema, required = location === "path") => ({
  name, in: location, schema, required
});
const runId = parameter("runId", "path", string);
const json = (schema: Schema) => ({ "application/json": { schema } });
const body = (schema: Schema) => ({ required: true, content: json(schema) });
const response = (schema: string) => ({ description: schema, content: json(ref(schema)) });
const errors = Object.fromEntries([400, 401, 403, 404, 409, 410, 413, 422, 429, 503].map((code) => [String(code), response("ApiErrorResponse")]));
const operation = (operationId: string, summary: string, schema: string, options: Record<string, unknown> = {}) => ({
  tags: ["Agent Observability"], operationId, summary,
  security: [{ apiKey: [] }, { bearerAuth: [] }], responses: { "200": response(schema), ...errors }, ...options
});
const telemetryRead = (signal: "Spans" | "Logs") => operation(`getAgentRun${signal}`, `Read a bounded ${signal.toLowerCase()} snapshot`, `Telemetry${signal}Response`, {
  description: "Requires runs:read; includeContent=true additionally requires runs:content. UTC half-open window, at most 31 days and 1000 raw records. Late/duplicate deliveries are possible. partial describes read limitations, not capture completeness. All storage queries are scoped to the authenticated organization and authorized run. No raw query language is accepted.",
  parameters: [runId, parameter("from", "query", dateTime, true), parameter("to", "query", dateTime, true),
    parameter("limit", "query", { type: "integer", minimum: 1, maximum: 1000, default: 500 }),
    parameter("traceId", "query", { ...string, pattern: "^[0-9a-f]{32}$" }),
    parameter("spanId", "query", { ...string, pattern: "^[0-9a-f]{16}$", description: "Requires traceId" }),
    parameter("includeContent", "query", { ...boolean, default: false })]
});
const ingest = (signal: "Traces" | "Logs") => ({
  tags: ["Agent Observability"], operationId: `ingestAgent${signal}`, summary: `Accept OTLP ${signal.toLowerCase()}`,
  description: "Write-only grant authentication occurs before body parsing. JSON or protobuf, optional gzip, at most 1 MiB compressed and decompressed. Identity and capture policy are resolved by the server; client tenant headers are ignored. Acknowledgements, including partial success, are Collector responses and do not prove durable storage. Configure the official exporter with this complete signal endpoint.",
  security: [{ telemetryGrant: [] }], requestBody: { required: true, content: {
    "application/json": { schema: { type: "object", additionalProperties: true } },
    "application/x-protobuf": { schema: { type: "string", format: "binary" } }
  } }, responses: { ...errors, "415": response("ApiErrorResponse"), "200": {
    description: "OTLP ExportResponse, including protocol partial-success information", content: {
      "application/json": { schema: { type: "object", additionalProperties: true } },
      "application/x-protobuf": { schema: { type: "string", format: "binary" } }
    }
  } }
});

export const observabilityPaths = {
  "/v1/observability/policy": {
    get: operation("getObservabilityPolicy", "Read capture policy and installation availability", "ObservabilityPolicy"),
    patch: operation("updateObservabilityPolicy", "Update organization capture policy", "ObservabilityPolicy", {
      description: "Human administrator only. Operator policy is a ceiling. Disabling capture revokes grants, but does not erase previously accepted data.",
      security: [{ bearerAuth: [] }], requestBody: body(ref("UpdateObservabilityPolicyBody"))
    })
  },
  "/v1/agent-runs": {
    get: operation("listAgentRuns", "List retained runs", "AgentRunsResponse", {
      parameters: [parameter("sandboxId", "query", string), parameter("outcome", "query", outcome), parameter("search", "query", { ...string, maxLength: 120 }),
        parameter("limit", "query", { type: "integer", minimum: 1, maximum: 100, default: 50 }), parameter("cursor", "query", { ...string, maxLength: 1024 })],
      description: "Requires runs:read. Newest first, keyset pagination. Preserve filters when following nextCursor. This is run metadata, not a completeness or success claim."
    }),
    post: operation("createAgentRun", "Create a run bound to an owned sandbox", "AgentRunResponse", {
      description: "Requires runs:write and sandboxes:write. Content capture also requires runs:content and both operator and organization opt-in. Creating a run does not instrument arbitrary code. No automatic retries.",
      requestBody: body(ref("CreateAgentRunBody")), responses: { "201": response("AgentRunResponse"), ...errors }
    })
  },
  "/v1/agent-runs/{runId}": { get: operation("getAgentRun", "Read retained run metadata", "AgentRunResponse", { parameters: [runId] }) },
  "/v1/agent-runs/{runId}/close": { post: operation("closeAgentRun", "Record caller-reported outcome", "AgentRunResponse", {
    parameters: [runId], requestBody: body(object({ outcome })), description: "Requires runs:write. Idempotent for the same outcome. Does not stop a sandbox or attest workload success. Existing grants receive at most two minutes for a final flush; no new grants can be issued."
  }) },
  "/v1/agent-runs/{runId}/grants": { post: operation("issueTelemetryGrant", "Issue a write-only telemetry grant", "TelemetryGrantResponse", {
    parameters: [runId], requestBody: body(object({ sandboxId: string })), responses: { "201": response("TelemetryGrantResponse"), ...errors },
    description: "Requires runs:write and sandboxes:write. Scope and issuer privileges are revalidated on ingestion. New grant issuance requires an open run and an owned active sandbox."
  }) },
  "/v1/agent-runs/{runId}/grants/{grantId}": { delete: operation("revokeTelemetryGrant", "Revoke a telemetry grant", "OkResponse", {
    parameters: [runId, parameter("grantId", "path", { ...string, format: "uuid" })]
  }) },
  "/v1/agent-runs/{runId}/spans": { get: telemetryRead("Spans") },
  "/v1/agent-runs/{runId}/logs": { get: telemetryRead("Logs") },
  "/v1/telemetry/traces": { post: ingest("Traces") },
  "/v1/telemetry/logs": { post: ingest("Logs") }
};
