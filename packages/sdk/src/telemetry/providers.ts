import { resourceFromAttributes } from "@opentelemetry/resources";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { BatchSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace";
import type { HarakiriTelemetryGrant } from "../agent-runs.js";
import { CaptureSpanProcessor } from "./privacy.js";

/**
 * Explicit, run-local provider. It exports only spans created through this
 * provider, does not read OTEL_RESOURCE_ATTRIBUTES and never registers globals.
 * Grants expire: finish within their lifetime or supply an application-owned
 * exporter with controlled renewal for long-lived work.
 */
export function createRunTracerProvider(grant: HarakiriTelemetryGrant, serviceName = "harakiri-agent") {
  if (!serviceName.trim() || serviceName.length > 128) throw new TypeError("serviceName must contain 1-128 characters.");
  const exporter = new OTLPTraceExporter({
    // forceFlush exports queued batches concurrently in the pinned OTel SDK.
    ...grant.exporterOptions("traces"), timeoutMillis: 2_000, concurrencyLimit: 10
  });
  return new TracerProvider({
    resource: resourceFromAttributes({ "service.name": serviceName, "harakiri.schema.version": "1" }),
    // Keep one extra character so the privacy processor can report clipping.
    spanLimits: { attributeCountLimit: 64, attributeValueLengthLimit: 8193, eventCountLimit: 32, linkCountLimit: 32 },
    spanProcessors: [new CaptureSpanProcessor(new BatchSpanProcessor({
      exporter, maxQueueSize: 64, maxExportBatchSize: 8, scheduledDelayMillis: 500, exportTimeoutMillis: 3_000
    }), grant.capture, () => exporter.forceFlush())]
  });
}
