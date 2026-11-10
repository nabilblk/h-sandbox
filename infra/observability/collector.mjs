// This is a candidate profile, not a production installation default.
// The gateway owns these headers. Direct workload access is never supported.
const metadataOnly = 'otelcol.client.metadata["x-harakiri-capture"][0] != "content"';
const metadataAttributes = [
  "gen_ai.operation.name", "gen_ai.provider.name", "gen_ai.system",
  "gen_ai.request.model", "gen_ai.response.model", "gen_ai.usage.input_tokens",
  "gen_ai.usage.output_tokens", "gen_ai.tool.name", "error.type",
  "gen_ai.request.temperature", "gen_ai.request.top_p", "gen_ai.request.max_tokens",
  "gen_ai.response.finish_reasons", "gen_ai.response.id", "gen_ai.tool.call.id",
  "gen_ai.usage.cache_read.input_tokens", "gen_ai.usage.cache_creation.input_tokens",
  "gen_ai.usage.reasoning.output_tokens",
  "harakiri.llm.first_token_ms",
  "harakiri.command.id", "harakiri.step.kind", "harakiri.attempt", "harakiri.content.truncated",
  "openinference.span.kind", "llm.model_name", "llm.token_count.prompt", "llm.token_count.completion", "tool.name"
];
const contentAttributes = [
  ...metadataAttributes, "gen_ai.input.messages", "gen_ai.output.messages",
  "gen_ai.tool.call.arguments", "gen_ai.tool.call.result", "gen_ai.system_instructions", "gen_ai.tool.definitions"
];

function bindingStatements() {
  return [
    'keep_keys(resource.attributes, ["service.name", "service.version", "telemetry.sdk.language", "telemetry.sdk.version"])',
    'truncate_all(resource.attributes, 128)',
    'keep_keys(scope.attributes, [])',
    'set(resource.attributes["harakiri.org.id"], otelcol.client.metadata["x-harakiri-org"][0])',
    'set(resource.attributes["harakiri.run.id"], otelcol.client.metadata["x-harakiri-run"][0])',
    'set(resource.attributes["harakiri.sandbox.id"], otelcol.client.metadata["x-harakiri-sandbox"][0])',
    'set(resource.attributes["harakiri.capture"], otelcol.client.metadata["x-harakiri-capture"][0])',
    'set(resource.attributes["harakiri.source"], "workload")',
    'set(resource.attributes["harakiri.schema.version"], "1")'
  ];
}

function attributesStatements(target) {
  return [
    `delete_key(${target}.attributes, "harakiri.content.truncated") where ${target}.attributes["harakiri.content.truncated"] != true`,
    `keep_keys(${target}.attributes, ${JSON.stringify(contentAttributes)})`,
    `keep_keys(${target}.attributes, ${JSON.stringify(metadataAttributes)}) where ${metadataOnly}`,
    ...contentAttributes.filter((key) => !metadataAttributes.includes(key)).map((key) =>
      `set(${target}.attributes["harakiri.content.truncated"], true) where IsString(${target}.attributes["${key}"]) and Len(${target}.attributes["${key}"]) > 32768`),
    `truncate_all(${target}.attributes, 32768)`
  ];
}

export function collectorConfig({ logsEndpoint, tracesEndpoint, externalEndpoint }) {
  for (const endpoint of [logsEndpoint, tracesEndpoint, ...(externalEndpoint ? [externalEndpoint] : [])]) {
    const url = new URL(endpoint);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error("Collector destination must be an operator-owned HTTP(S) endpoint without credentials or query parameters");
    }
  }
  const exporter = (endpoint) => ({
    endpoint, auth: { authenticator: "headers_setter/tenant" },
    timeout: "5s",
    retry_on_failure: { initial_interval: "1s", max_interval: "5s", max_elapsed_time: "60s" },
    sending_queue: {
      storage: "file_storage/queue", sizer: "bytes", queue_size: 8 * 1024 * 1024,
      num_consumers: 2, block_on_overflow: false
    }
  });
  const missingBinding = ["tenant", "org", "run", "sandbox", "capture"]
    .flatMap((key) => [
      `otelcol.client.metadata["x-harakiri-${key}"] == nil`,
      `Len(otelcol.client.metadata["x-harakiri-${key}"]) != 1`
    ]);
  const invalidBinding = [
    ...missingBinding,
    'not IsMatch(otelcol.client.metadata["x-harakiri-tenant"][0], "^[1-9][0-9]{0,8}$")',
    'not IsMatch(otelcol.client.metadata["x-harakiri-run"][0], "^run_[A-Za-z0-9_-]{1,64}$")',
    'not IsMatch(otelcol.client.metadata["x-harakiri-sandbox"][0], "^sbx_[A-Za-z0-9_-]{1,64}$")',
    'otelcol.client.metadata["x-harakiri-capture"][0] != "metadata" and otelcol.client.metadata["x-harakiri-capture"][0] != "content"'
  ];
  return {
    extensions: {
      "bearertokenauth/ingress": { token: "${env:HARAKIRI_COLLECTOR_TOKEN}" },
      "headers_setter/tenant": { headers: [
        { key: "AccountID", from_context: "x-harakiri-tenant" },
        { key: "ProjectID", value: "0" }
      ] },
      "file_storage/queue": {
        directory: "/var/lib/otelcol/queue", create_directory: true,
        fsync: true, max_size: 32 * 1024 * 1024
      },
      health_check: { endpoint: "0.0.0.0:13133" }
    },
    receivers: { otlp: { protocols: { http: {
      endpoint: "0.0.0.0:4318", include_metadata: true,
      max_request_body_size: 1024 * 1024,
      auth: { authenticator: "bearertokenauth/ingress" }
    } } } },
    processors: {
      memory_limiter: { check_interval: "1s", limit_mib: 192, spike_limit_mib: 32 },
      "filter/binding": {
        error_mode: "propagate",
        traces: { span: invalidBinding }, logs: { log_record: invalidBinding }
      },
      "transform/privacy": {
        error_mode: "propagate",
        trace_statements: [{ context: "span", statements: [
          ...bindingStatements(), ...attributesStatements("span"),
          'set(span.trace_state, "")',
          `set(span.status.message, "") where ${metadataOnly}`,
          `set(span.events, nil) where ${metadataOnly}`,
          `set(span.links, nil) where ${metadataOnly}`
        ] }],
        log_statements: [{ context: "log", statements: [
          ...bindingStatements(), ...attributesStatements("log"),
          `set(log.body, "") where ${metadataOnly}`,
          // VictoriaLogs flattens map bodies into top-level fields. Serialize
          // them first so content cannot shadow trusted run/tenant attributes.
          'set(log.body, String(log.body))',
          'set(log.attributes["harakiri.content.truncated"], true) where Len(log.body) > 16384',
          'set(log.body, Substring(log.body, 0, 16384)) where Len(log.body) > 16384'
        ] }]
      },
      // Batch creates a fresh context containing ONLY these keys. In particular,
      // Authorization must not be serialized into the durable exporter queue.
      // Partition by tenant, not run: the processor retains partitions for life.
      "batch/tenant": {
        metadata_keys: ["x-harakiri-tenant"], metadata_cardinality_limit: 128,
        timeout: "200ms", send_batch_size: 128, send_batch_max_size: 256
      }
    },
    exporters: {
      "otlp_http/logs": { ...exporter(logsEndpoint), headers: { "VL-Stream-Fields": "service.name" } },
      "otlp_http/traces": exporter(tracesEndpoint),
      ...(externalEndpoint ? { "otlp_http/external": {
        ...exporter(externalEndpoint), auth: undefined,
        headers: { Authorization: "${env:HARAKIRI_EXTERNAL_OTLP_AUTHORIZATION}" }
      } } : {})
    },
    service: {
      extensions: ["bearertokenauth/ingress", "headers_setter/tenant", "file_storage/queue", "health_check"],
      telemetry: {
        logs: { level: "error" },
        metrics: { readers: [{ pull: { exporter: { prometheus: { host: "0.0.0.0", port: 8888 } } } }] }
      },
      pipelines: Object.fromEntries(["logs", "traces"].map((signal) => [signal, {
        receivers: ["otlp"], processors: ["memory_limiter", "filter/binding", "transform/privacy", "batch/tenant"],
        exporters: [`otlp_http/${signal}`, ...(externalEndpoint ? ["otlp_http/external"] : [])]
      }]))
    }
  };
}
