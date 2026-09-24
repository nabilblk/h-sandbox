import { HarakiriClient } from "@h-sandbox/sdk";
import { TextToolChatOllama } from "./text-tool-model.mjs";
import { repairRepository } from "./run-repair.js";
import { writeFileSync } from "node:fs";
import { modelFailure, modelObserver } from "./model-failure.mjs";
import assert from "node:assert/strict";

if (process.env.HARAKIRI_DEEPAGENTS_ACCEPTANCE !== "disposable-runtime" || !process.env.HARAKIRI_TEMPLATE) {
  throw new Error("Use only the explicit disposable acceptance environment.");
}
const observer = modelObserver();
const model = new TextToolChatOllama({
  baseUrl: "http://127.0.0.1:11434", model: "qwen3:4b-instruct", temperature: 0,
  think: false, numCtx: 8192, numPredict: 1024, numThread: 3,
  callbacks: [{ name: "acceptance-metadata", handleLLMEnd: observer.handleLLMEnd }]
});
try {
  // The JavaScript integration uses `think`, not Python's `reasoning` option.
  assert.equal(model.invocationParams().think, false, "Acceptance must disable extended thinking on the wire.");
  await repairRepository(HarakiriClient.fromEnv(), model, process.env.HARAKIRI_TEMPLATE);
  writeFileSync("model-result.json", JSON.stringify({ status: "verified", model: observer.snapshot() }), { mode: 0o600 });
  console.log("Real-model repair passed: original tests unchanged, independent tests passed, patch present, cleanup confirmed.");
} catch (error) {
  // Only bounded codes/coordinates leave the runner; never model output or raw causes.
  writeFileSync("model-failure.json", JSON.stringify({ ...modelFailure(error), model: observer.snapshot() }), { mode: 0o600 });
  process.exitCode = 1;
}
