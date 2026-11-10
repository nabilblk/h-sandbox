import type { Context, Tracer } from "@opentelemetry/api";
import type { TracerProvider } from "@opentelemetry/sdk-trace";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { BatchLogRecordProcessor, LoggerProvider, type LogRecordProcessor, type ReadWriteLogRecord } from "@opentelemetry/sdk-logs";
import type { HarakiriTelemetryGrant } from "../agent-runs.js";
import { metadataAttributes } from "./privacy.js";
import { createRunTracerProvider } from "./providers.js";
import type { AgentCapture } from "../observability-types.js";

export type RunTelemetry = {
  capture: AgentCapture;
  tracerProvider: TracerProvider;
  tracer: Tracer;
  logger: ReturnType<LoggerProvider["getLogger"]>;
  forceFlush(): Promise<void>;
  shutdown(): Promise<void>;
};

class CaptureLogProcessor implements LogRecordProcessor {
  constructor(private readonly next: LogRecordProcessor, private readonly captureContent: boolean,
    private readonly drain: () => Promise<void>) {}
  onEmit(record: ReadWriteLogRecord, context?: Context) {
    // This private provider has one processor. Mutating its writable log record
    // cannot alter records owned by the application's other logger providers.
    for (const key of Object.keys(record.attributes)) if (!metadataAttributes.has(key)) delete record.attributes[key];
    record.eventName = undefined;
    if (record.spanContext) record.spanContext = { ...record.spanContext, traceState: undefined };
    if (!this.captureContent) record.body = "";
    else if (typeof record.body === "string" && record.body.length > 4096) record.body = `${record.body.slice(0, 4096)}\n[output truncated]`;
    else if (typeof record.body !== "string") record.body = "[non-text log body omitted]";
    this.next.onEmit(record, context);
  }
  async forceFlush() {
    try { await this.next.forceFlush(); } finally { await this.drain(); }
  }
  shutdown() { return this.next.shutdown(); }
}

/** Dedicated logs/traces, never global console capture or provider registration. */
export function createRunTelemetry(grant: HarakiriTelemetryGrant, serviceName = "harakiri-agent"): RunTelemetry {
  const logOptions = grant.exporterOptions("logs");
  const exporter = new OTLPLogExporter({ ...logOptions, timeoutMillis: 2_000, concurrencyLimit: 10 });
  const tracerProvider = createRunTracerProvider(grant, serviceName);
  const loggerProvider = new LoggerProvider({
    resource: resourceFromAttributes({ "service.name": serviceName }),
    logRecordLimits: { attributeCountLimit: 32, attributeValueLengthLimit: 1024 },
    processors: [new CaptureLogProcessor(new BatchLogRecordProcessor({
      exporter,
      maxQueueSize: 64, maxExportBatchSize: 8, scheduledDelayMillis: 500, exportTimeoutMillis: 3_000
    }), grant.capture === "content", () => exporter.forceFlush())]
  });
  return {
    capture: grant.capture,
    tracerProvider,
    logger: loggerProvider.getLogger("harakiri.commands", "1"),
    tracer: tracerProvider.getTracer("harakiri.commands", "1"),
    // Flush signals sequentially: each official batch processor can fan out.
    async forceFlush() { try { await tracerProvider.forceFlush(); } finally { await loggerProvider.forceFlush(); } },
    async shutdown() { try { await tracerProvider.shutdown(); } finally { await loggerProvider.shutdown(); } }
  };
}
