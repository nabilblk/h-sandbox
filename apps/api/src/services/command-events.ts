import { setTimeout as delay } from "node:timers/promises";
import type { SandboxCommandEvent, SandboxCommandLogsResponse, SandboxCommandSummary } from "@harakiri/shared";

export const commandCursor = (commandId: string, offset: number, stored = false) => `v1:${commandId}:${stored ? "s" : "p"}:${offset}`;
export const parseCommandCursor = (commandId: string, cursor?: string) => {
  if (!cursor) return { offset: 0, stored: false };
  const parts = cursor.split(":");
  const offset = Number(parts[3]);
  if (parts.length !== 4 || parts[0] !== "v1" || parts[1] !== commandId || !["s", "p"].includes(parts[2])
    || !/^\d+$/.test(parts[3]) || !Number.isSafeInteger(offset) || offset < 0 || (parts[2] === "s" && offset > 1)) {
    throw Object.assign(new Error("Cursor is invalid or belongs to another command"), { statusCode: 400, code: "invalid_command_cursor" });
  }
  return { offset, stored: parts[2] === "s" };
};

type Options = {
  commandId: string; cursor?: string; signal: AbortSignal;
  readCommand: () => Promise<SandboxCommandSummary | null>;
  readLogs: (offset: number) => Promise<SandboxCommandLogsResponse | null>;
  authorize: () => Promise<boolean>;
  pollMs?: number; maxDurationMs?: number;
};

export async function* commandEvents(options: Options): AsyncGenerator<SandboxCommandEvent | "heartbeat"> {
  let { offset, stored } = parseCommandCursor(options.commandId, options.cursor);
  let cursor = options.cursor || commandCursor(options.commandId, offset);
  let status = "";
  const deadline = Date.now() + (options.maxDurationMs ?? 60000);
  const base = () => ({ commandId: options.commandId, cursor });
  try {
    while (!options.signal.aborted && Date.now() < deadline) {
      if (!await options.authorize()) { yield { ...base(), type: "error", code: "unauthorized", message: "Session expired or access was revoked. Sign in again to reconnect." }; return; }
      const command = await options.readCommand();
      if (!command) { yield { ...base(), type: "error", code: "command_not_found", message: "Command is no longer available" }; return; }
      const terminal = !["running", "queued"].includes(command.status);
      const providerLogs = Boolean(command.detached && command.providerCommandId);
      if (options.cursor && stored === providerLogs) throw new Error("Cursor source changed");
      if (!providerLogs && !terminal) throw new Error("Live output requires a detached command");
      if (providerLogs || offset === 0) {
        const logs = await options.readLogs(offset);
        if (!logs) throw new Error("Log record unavailable");
        if (Buffer.byteLength(logs.stdout) + Buffer.byteLength(logs.stderr) > 1024 * 1024) throw new Error("Log replay exceeds the stream frame limit");
        const next = providerLogs ? logs.cursor : 1;
        if (next === undefined || !Number.isSafeInteger(next) || next < offset || (providerLogs && next === offset && (logs.stdout || logs.stderr))) {
          yield { ...base(), type: "error", code: "command_cursor_unavailable", message: "Provider log history changed or cannot be resumed. Read logs explicitly before starting a new viewer." }; return;
        }
        offset = next; stored = !providerLogs;
        cursor = commandCursor(options.commandId, offset, stored);
        if (logs.stdout || logs.stderr) yield { ...base(), type: "output", stdout: logs.stdout, stderr: logs.stderr };
      }
      if (options.signal.aborted) return;
      if (status !== command.status) { status = command.status; yield { ...base(), type: "status", status: command.status, exitCode: command.exitCode }; }
      if (terminal) { yield { ...base(), type: "complete", status: command.status, exitCode: command.exitCode }; return; }
      yield "heartbeat";
      await delay(options.pollMs ?? 1000, undefined, { signal: options.signal });
    }
    if (!options.signal.aborted) yield { ...base(), type: "reconnect" };
  } catch {
    if (!options.signal.aborted) yield { ...base(), type: "error", code: "command_stream_unavailable", message: "Live output is unavailable. The command was not restarted or cancelled; reconnect with the last cursor or inspect its status." };
  }
}

export const encodeCommandEvent = (event: SandboxCommandEvent | "heartbeat") => event === "heartbeat" ? ": heartbeat\n\n" : `id: ${event.cursor}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
