import assert from "node:assert/strict";
import test from "node:test";
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace";
import { CaptureSpanProcessor } from "./telemetry/privacy.js";

test("OpenInference payloads are content-only, bounded before batching, and do not mutate borrowed spans", async () => {
  for (const capture of ["metadata", "content"] as const) {
    const safe = new InMemorySpanExporter(), original = new InMemorySpanExporter();
    const provider = new TracerProvider({ spanLimits: { attributeValueLengthLimit: 12000 }, spanProcessors: [
      new CaptureSpanProcessor(new SimpleSpanProcessor({ exporter: safe }), capture),
      new SimpleSpanProcessor({ exporter: original })
    ] });
    try {
      provider.getTracer("test").startSpan("Framework", { attributes: {
        "input.value": "x".repeat(10000), "output.value": "PRIVATE output", "api.key": "PRIVATE key"
      } }).end();
      const captured = safe.getFinishedSpans()[0].attributes;
      assert.equal(captured["output.value"], capture === "content" ? "PRIVATE output" : undefined);
      assert.equal(captured["input.value"], capture === "content" ? "x".repeat(8192) : undefined);
      assert.equal(captured["harakiri.content.truncated"], capture === "content" ? true : undefined);
      assert.equal(captured["api.key"], undefined);
      assert.equal(original.getFinishedSpans()[0].attributes["input.value"], "x".repeat(10000));
    } finally { await provider.shutdown(); }
  }
});
