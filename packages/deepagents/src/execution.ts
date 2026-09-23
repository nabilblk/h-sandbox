import type { HarakiriSandbox, SandboxCommandLogsResponse, SandboxCommandSummary } from "@h-sandbox/sdk";
import type { ExecuteResponse } from "deepagents";
import { HarakiriExecutionError, type CommandReference } from "./errors.js";

export type ExecutionOptions = {
  /** Remote execution budget. Defaults to the runtime's advertised command timeout. */
  timeoutMs?: number;
  /** Command-status polling budget, excluding log download; never extends TTL. */
  observationTimeoutMs?: number;
  /** Combined UTF-8 log limit, excluding a fixed termination notice. Default 64 KiB; at most 1 MiB. */
  maxOutputBytes?: number;
  /** Must be absolute. This is a working directory, not a security boundary. */
  cwd?: string;
  /** Stops observation. It does not kill the remote command. */
  signal?: AbortSignal;
  /** Persist the acknowledged reference before waiting. Never receives credentials. */
  onCommandStarted?: (reference: CommandReference) => void | Promise<void>;
};

export type HarakiriExecuteResponse = ExecuteResponse & {
  reference: CommandReference;
  finishReason: SandboxCommandSummary["finishReason"];
};

export function positiveInteger(name: string, value: number, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${name} must be a positive integer no greater than ${maximum}.`);
  }
  return value;
}

export function executionOptions(sandbox: HarakiriSandbox, options: ExecutionOptions) {
  const cwd = options.cwd ?? sandbox.runtimeMetadata.workdir;
  if (!cwd.startsWith("/") || cwd.includes("\0")) throw new TypeError("cwd must be an absolute path without NUL characters.");
  const timeoutMs = positiveInteger("timeoutMs", options.timeoutMs ?? sandbox.runtimeMetadata.limits.commandTimeoutMs);
  return {
    ...options, cwd, timeoutMs,
    observationTimeoutMs: positiveInteger("observationTimeoutMs", options.observationTimeoutMs ?? timeoutMs + 10_000),
    maxOutputBytes: positiveInteger("maxOutputBytes", options.maxOutputBytes ?? 65_536, 1_048_576)
  };
}

export function commandOutput(logs: SandboxCommandLogsResponse, maxBytes: number) {
  const separator = logs.stdout && logs.stderr && !logs.stdout.endsWith("\n") ? "\n" : "";
  let remaining = maxBytes;
  let output = "";
  let truncated = Boolean(logs.stdoutTruncated || logs.stderrTruncated);
  for (const part of [logs.stdout, separator, logs.stderr]) {
    if (Buffer.byteLength(part) <= remaining) {
      output += part;
      remaining -= Buffer.byteLength(part);
      continue;
    }
    truncated = true;
    // Bound allocation first, then avoid splitting a UTF-8 sequence at the limit.
    const bytes = Buffer.from(part.slice(0, remaining));
    let end = Math.min(bytes.length, remaining);
    while (end > 0 && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    output += bytes.subarray(0, end).toString("utf8");
    remaining = 0;
  }
  return { output, truncated };
}

function terminationNotice(command: SandboxCommandSummary) {
  // Deep Agents displays output and numeric exit codes, not our finishReason field.
  switch (command.finishReason) {
    case "timeout": return "[Command timed out; execution did not complete normally.]";
    case "killed": return "[Command was killed; execution did not complete normally.]";
    case "error": return "[Command ended with a runtime error; execution did not complete normally.]";
    default: return command.exitCode === null
      ? "[Command ended without an exit code; normal completion is unconfirmed.]" : "";
  }
}

export async function observeCommand(
  sandbox: HarakiriSandbox, reference: CommandReference, options: ReturnType<typeof executionOptions>
): Promise<HarakiriExecuteResponse> {
  if (reference.sandboxId !== sandbox.id || !/^cmd_[A-Za-z0-9_-]+$/.test(reference.commandId)) {
    throw new TypeError("The command reference must belong to this sandbox.");
  }
  try {
    options.signal?.throwIfAborted();
    const { command } = await sandbox.processes.wait(reference.commandId, {
      statuses: ["succeeded", "failed", "killed"],
      timeoutMs: options.observationTimeoutMs,
      signal: options.signal
    });
    options.signal?.throwIfAborted();
    const logs = await sandbox.processes.logs(reference.commandId);
    options.signal?.throwIfAborted();
    const result = commandOutput(logs, options.maxOutputBytes);
    const notice = terminationNotice(command);
    return {
      ...result,
      output: notice ? `${notice}${result.output ? `\n${result.output}` : ""}` : result.output,
      exitCode: command.exitCode,
      finishReason: command.finishReason,
      reference: { ...reference }
    };
  } catch (cause) {
    throw new HarakiriExecutionError("observation", sandbox.id, { ...reference }, cause);
  }
}
