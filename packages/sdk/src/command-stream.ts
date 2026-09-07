import { EventSourceParserStream } from "eventsource-parser/stream";
import type { SandboxCommandEvent } from "./command-events.js";

export type CommandStreamOptions = { cursor?: string; signal?: AbortSignal; maxReconnects?: number; reconnectDelayMs?: number };
export class CommandStreamError extends Error {
  constructor(public readonly code: string, message: string, public readonly cursor?: string) { super(message); this.name = "CommandStreamError"; }
}

export async function* readCommandEvents(response: Response): AsyncGenerator<SandboxCommandEvent> {
  if (!response.ok) throw Object.assign(new Error(`Command stream HTTP ${response.status}`), { status: response.status });
  if (!response.headers.get("content-type")?.startsWith("text/event-stream") || !response.body) throw new CommandStreamError("invalid_command_stream", "Expected a server-sent event stream");
  const reader = response.body.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream({ maxBufferSize: 2 * 1024 * 1024 })).getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return;
      let event: SandboxCommandEvent;
      try { event = JSON.parse(value.data) as SandboxCommandEvent; }
      catch { throw new CommandStreamError("invalid_command_event", "Invalid command event JSON"); }
      if (!event || typeof event.commandId !== "string" || typeof event.cursor !== "string" || value.id !== event.cursor || value.event !== event.type
        || !["output", "status", "complete", "error", "reconnect"].includes(event.type)
        || !/^v1:[^:]+:[ps]:\d+$/.test(event.cursor)
        || event.cursor.split(":")[1] !== event.commandId
        || (event.type === "output" && (typeof event.stdout !== "string" || typeof event.stderr !== "string"))
        || ((event.type === "status" || event.type === "complete") && (!["queued", "running", "succeeded", "failed", "killed"].includes(event.status) || !(event.exitCode === null || Number.isInteger(event.exitCode))))
        || (event.type === "complete" && !["succeeded", "failed", "killed"].includes(event.status))
        || (event.type === "error" && (typeof event.code !== "string" || typeof event.message !== "string"))) {
        throw new CommandStreamError("invalid_command_event", "Invalid command event received");
      }
      yield event;
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  signal.throwIfAborted();
  const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); };
  const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
  signal.addEventListener("abort", abort, { once: true });
});

export async function* observeCommandStream(
  connect: (cursor: string | undefined, signal: AbortSignal) => Promise<Response>,
  commandId: string, options: CommandStreamOptions = {}
): AsyncGenerator<SandboxCommandEvent> {
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
  let cursor = options.cursor;
  let retries = 0;
  const maxRetries = options.maxReconnects ?? 5;
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 100) throw new Error("maxReconnects must be between 0 and 100");
  const delay = options.reconnectDelayMs ?? 500;
  if (!Number.isFinite(delay) || delay < 0 || delay > 60_000) throw new Error("reconnectDelayMs must be between 0 and 60000");
  try {
    while (true) {
      signal.throwIfAborted();
      let rotate = false;
      try {
        const response = await connect(cursor, signal);
        for await (const event of readCommandEvents(response)) {
          if (event.commandId !== commandId) throw new CommandStreamError("invalid_command_event", "Event belongs to a different command", cursor);
          if (event.type === "error") throw new CommandStreamError(event.code, event.message, cursor);
          if (event.type === "reconnect") { cursor = event.cursor; rotate = true; break; }
          cursor = event.cursor;
          yield event;
          if (event.type === "complete") return;
        }
      } catch (error) {
        signal.throwIfAborted();
        if (error instanceof CommandStreamError || (typeof (error as { status?: number }).status === "number" && (error as { status: number }).status < 500)) throw error;
      }
      if (!rotate && retries++ >= maxRetries) throw new CommandStreamError("command_stream_disconnected", "Command output disconnected; reconnect with the last cursor. The command was not restarted.", cursor);
      await wait(rotate ? 0 : delay, signal);
    }
  } finally { controller.abort(); }
}
