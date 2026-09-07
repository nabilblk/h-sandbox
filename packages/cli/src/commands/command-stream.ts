import type { HarakiriClient } from "@h-sandbox/sdk";
import { once } from "node:events";

const writeOutput = async (stream: NodeJS.WriteStream, value: string, signal: AbortSignal) => {
  if (!stream.write(value)) await once(stream, "drain", { signal });
};

export async function followCommand(client: HarakiriClient, sandboxId: string, commandId: string, options: { cursor?: string; json?: boolean } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGINT", abort); process.once("SIGTERM", abort);
  let cursor = options.cursor;
  let completed = false;
  try {
    for await (const event of client.commands.stream(sandboxId, commandId, { cursor, signal: controller.signal })) {
      cursor = event.cursor;
      if (options.json) await writeOutput(process.stdout, `${JSON.stringify(event)}\n`, controller.signal);
      else if (event.type === "output") { await writeOutput(process.stdout, event.stdout, controller.signal); await writeOutput(process.stderr, event.stderr, controller.signal); }
      if (event.type === "complete") { completed = true; process.exitCode = event.exitCode ?? (event.status === "succeeded" ? 0 : 1); }
    }
  } catch (error) {
    if (!controller.signal.aborted) throw error;
    process.exitCode = 130;
    console.error(`Stopped viewing. Command ${commandId} was not cancelled.`);
  } finally {
    controller.abort(); process.off("SIGINT", abort); process.off("SIGTERM", abort);
    if (!completed && cursor) console.error(`Resume: harakiri command follow ${sandboxId} ${commandId} --cursor ${cursor}`);
  }
}
