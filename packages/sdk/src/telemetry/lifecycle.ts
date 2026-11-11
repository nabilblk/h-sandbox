import type { HarakiriClient } from "../index.js";
import type { AgentOutcome, AgentRunRecord, CreateAgentRunBody } from "../observability-types.js";
import type { HarakiriTelemetryGrant } from "../agent-runs.js";

export type TelemetryDiagnostic = {
  code: "flush_failed" | "shutdown_failed" | "close_failed" | "revoke_failed";
};

/** A borrowed provider is flushed, never shut down. No global registration. */
export type TelemetryRuntime = {
  forceFlush(): Promise<unknown>;
  shutdown?(): Promise<unknown>;
};

export type RecordingOptions<Runtime extends TelemetryRuntime> = CreateAgentRunBody & {
  /** Must return a run-scoped runtime. The helper owns only runtimes marked owned. */
  runtime: (grant: HarakiriTelemetryGrant) => Runtime | Promise<Runtime>;
  ownership?: "owned" | "borrowed";
  cleanupTimeoutMs?: number;
  signal?: AbortSignal;
  onDiagnostic?: (diagnostic: TelemetryDiagnostic) => void;
};

export type AgentRecording<Runtime> = { run: AgentRunRecord; runtime: Runtime };

function timeout(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 30_000) {
    throw new RangeError("cleanupTimeoutMs must be an integer between 1 and 30000.");
  }
  return value;
}

/** Bounded observation of cleanup, including synchronous throws and late rejections. */
async function bounded(action: () => unknown, milliseconds: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(action),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Telemetry cleanup timed out")), milliseconds); })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Owns the run and grant, never the sandbox. Callback completion is a reported
 * outcome, not proof that detached work or every instrumented step succeeded.
 */
export async function withAgentRun<Runtime extends TelemetryRuntime, Result>(
  client: Pick<HarakiriClient, "agentRuns">,
  options: RecordingOptions<Runtime>,
  action: (recording: AgentRecording<Runtime>) => Promise<Result>
): Promise<Result> {
  const cleanupTimeoutMs = timeout(options.cleanupTimeoutMs ?? 5_000);
  options.signal?.throwIfAborted();
  const { run } = await client.agentRuns.create({ name: options.name, sandboxId: options.sandboxId,
    capture: options.capture ?? "metadata" }, { signal: options.signal });
  let grant: HarakiriTelemetryGrant | undefined;
  let runtime: Runtime | undefined;
  let outcome: AgentOutcome = "unknown";
  const diagnose = (code: TelemetryDiagnostic["code"]) => {
    // Diagnostic hooks are advisory; neither their errors nor payloads escape.
    try { options.onDiagnostic?.({ code }); } catch { /* preserve execution */ }
  };
  try {
    grant = await client.agentRuns.grant(run.id, options.sandboxId, { signal: options.signal });
    runtime = await options.runtime(grant);
    options.signal?.throwIfAborted();
    const result = await action({ run, runtime });
    outcome = options.signal?.aborted ? "cancelled" : "succeeded";
    return result;
  } catch (error) {
    outcome = options.signal?.aborted ? "cancelled" : "failed";
    throw error;
  } finally {
    // Never reuse the work's cancelled signal for final-flush and credential cleanup.
    const acquired = runtime;
    if (acquired) {
      try { await bounded(() => acquired.forceFlush(), cleanupTimeoutMs); } catch { diagnose("flush_failed"); }
      if (options.ownership === "owned" && acquired.shutdown) {
        try { await bounded(() => acquired.shutdown!(), cleanupTimeoutMs); } catch { diagnose("shutdown_failed"); }
      }
    }
    const requestOptions = { requestTimeoutMs: cleanupTimeoutMs };
    try { await client.agentRuns.close(run.id, outcome, requestOptions); } catch { diagnose("close_failed"); }
    if (grant) {
      try { await client.agentRuns.revokeGrant(run.id, grant.id, requestOptions); } catch { diagnose("revoke_failed"); }
    }
  }
}
