import { HarakiriClient } from "@h-sandbox/sdk";
import { createRunTelemetry, observeRecordedProcess, withAgentRun } from "@h-sandbox/sdk/telemetry";

const sandboxId = process.env.HARAKIRI_SANDBOX_ID;
if (!sandboxId) throw new Error("Set HARAKIRI_SANDBOX_ID to an existing disposable sandbox.");

const client = HarakiriClient.fromEnv();
const sandbox = await client.sandboxes.connect(sandboxId);
await sandbox.wait({ timeoutMs: 60_000 });

await withAgentRun(client, {
  name: "First recorded command",
  sandboxId,
  capture: "metadata",
  runtime: createRunTelemetry,
  ownership: "owned",
  onDiagnostic: ({ code }) => console.warn(`Telemetry: ${code}`)
}, async ({ run, runtime }) => {
  console.log(`Run: ${run.id}`);
  const command = await sandbox.processes.start({ command: "printf 'Hello from Harakiri\\n'", timeoutMs: 10_000 });
  console.log(`Command: ${command.id}`);
  await observeRecordedProcess(command, runtime, { timeoutMs: 30_000 });
});

// connect() borrowed this sandbox. Recording does not delete it or resubmit commands.
