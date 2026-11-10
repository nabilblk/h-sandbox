import { ROOT_CONTEXT, SpanStatusCode, trace, type Context } from "@opentelemetry/api";
import type { HarakiriProcess } from "../process.js";
import type { WaitForCommandOptions } from "../index.js";
import type { RunTelemetry } from "./logs.js";

export type ObserveRecordedProcessOptions = WaitForCommandOptions & {
  /** Explicit parent context. No implicit adoption of unrelated global traces. */
  parent?: Context;
  /** Bounded stdout/stderr snapshot; requires the run's content opt-in as well. */
  includeOutput?: boolean;
  onDiagnostic?: (diagnostic: { code: "command_output_unavailable" }) => void;
};

/** Read-only observation. Never resubmits/kills work; original recovery errors survive. */
export async function observeRecordedProcess(
  process: Pick<HarakiriProcess, "id" | "wait" | "logs">,
  telemetry: RunTelemetry,
  options: ObserveRecordedProcessOptions = {}
) {
  const { parent = ROOT_CONTEXT, includeOutput = false, onDiagnostic, ...waitOptions } = options;
  const span = telemetry.tracer.startSpan("Observe sandbox command", {
    attributes: { "harakiri.command.id": process.id, "harakiri.step.kind": "command" }
  }, parent);
  try {
    const result = await process.wait(waitOptions);
    span.setStatus({ code: result.status === "succeeded" && result.exitCode === 0 ? SpanStatusCode.OK : SpanStatusCode.ERROR });
    if (result.status !== "succeeded" || result.exitCode !== 0) span.setAttribute("error.type", "command_not_successful");
    return result;
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR });
    span.setAttribute("error.type", waitOptions.signal?.aborted ? "observation_cancelled" : "observation_interrupted");
    throw error;
  } finally {
    if (includeOutput && telemetry.capture === "content" && !waitOptions.signal?.aborted) {
      try {
        const logs = await process.logs({ tail: 200, requestTimeoutMs: 1_000 });
        for (const stream of ["stdout", "stderr"] as const) {
          if (!logs[stream]) continue;
          const clipped = logs[stream].slice(0, 4000);
          const truncated = logs[`${stream}Truncated`] || clipped.length < logs[stream].length;
          telemetry.logger.emit({ context: trace.setSpan(parent, span),
            // A stream name is not evidence of severity; exit status belongs to the span.
            severityText: "INFO", severityNumber: 9,
            body: `${stream}: ${clipped}${truncated ? "\n[output truncated]" : ""}`,
            attributes: { "harakiri.command.id": process.id, "harakiri.step.kind": "command" }
          });
        }
      } catch {
        try { onDiagnostic?.({ code: "command_output_unavailable" }); } catch { /* preserve execution */ }
      }
    }
    span.end();
  }
}
