import assert from "node:assert/strict";
import { TracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { instrumentDeepAgents } from "./instrumentation.js";
import { invoke } from "./deepagents-fixture.js";

process.env.LANGSMITH_TRACING = "false";
process.env.LANGCHAIN_TRACING_V2 = "false";
process.env.LANGCHAIN_CALLBACKS_BACKGROUND = "false";
const endpoint = process.env.HARAKIRI_QUALIFICATION_ENDPOINT;
assert.ok(endpoint && new URL(endpoint).hostname === "127.0.0.1");
const instrumentation = instrumentDeepAgents();
const providers = ["A", "B"].map((name) => {
  const token = process.env[`HARAKIRI_QUALIFICATION_TOKEN_${name}`];
  assert.ok(token && /^htg_[A-Za-z0-9_-]{43}$/.test(token));
  return new TracerProvider({ resource: resourceFromAttributes({ "service.name": "deepagents-qualification" }),
    spanProcessors: [new BatchSpanProcessor({ exporter: new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`, headers: { Authorization: `Bearer ${token}` }, timeoutMillis: 3000
    }), maxQueueSize: 256, maxExportBatchSize: 64, exportTimeoutMillis: 4000 })]
  });
});
try {
  await invoke("unrelated");
  await Promise.all(providers.map((provider, index) => instrumentation.router.run(provider, () => invoke(`tenant-${index}`))));
  for (const provider of providers) await provider.forceFlush();
} finally {
  await instrumentation.shutdown();
  for (const provider of providers) await provider.shutdown();
}
