import { HarakiriClient } from "@h-sandbox/sdk";
import { runHostWorkflow } from "./host-workflow.js";
import { localModel } from "./local-model.js";

const sandboxId = process.env.HARAKIRI_SANDBOX_ID;
if (!sandboxId) throw new Error("Set HARAKIRI_SANDBOX_ID to a disposable sandbox with Python 3.");
const capture = process.env.HARAKIRI_CAPTURE ?? "metadata";
if (capture !== "metadata" && capture !== "content") throw new Error("HARAKIRI_CAPTURE must be metadata or content.");

const client = HarakiriClient.fromEnv();
const sandbox = await client.sandboxes.connect(sandboxId);
const result = await runHostWorkflow({
  client, sandbox, capture,
  model: localModel(process.env.OLLAMA_URL ?? "http://127.0.0.1:11434", process.env.OLLAMA_MODEL ?? "qwen3:4b-instruct"),
  onDiagnostic: ({ code }) => console.warn(`Telemetry: ${code}`)
});

console.log(`Run: ${result.runId}`);
console.log(result.report);
// This recipe borrowed the sandbox. Stop it separately after inspecting the report.
