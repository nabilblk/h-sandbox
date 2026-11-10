import { ROOT_CONTEXT } from "@opentelemetry/api";
import { HarakiriClient, type HarakiriProcess } from "@h-sandbox/sdk";
import { createRunTelemetry, observeRecordedProcess, withAgentRun } from "@h-sandbox/sdk/telemetry";

declare const process: HarakiriProcess;
const client = new HarakiriClient({ apiUrl: "https://api.example.test", apiKey: "fixture" });

const result: number | null = await withAgentRun(client, {
  name: "Recorded command",
  sandboxId: process.sandboxId,
  runtime: createRunTelemetry,
  ownership: "owned",
  onDiagnostic: ({ code }) => console.warn(code)
}, async ({ runtime }) => {
  const command = await observeRecordedProcess(process, runtime, { parent: ROOT_CONTEXT });
  return command.exitCode;
});
void result;
