import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { HarakiriClient } from "@h-sandbox/sdk";
import { runHostWorkflow } from "./host-workflow.js";
import { localModel } from "./local-model.js";
import { agentFailure } from "./agent-failure.js";

const config = JSON.parse(await readFile(process.argv[2], "utf8")) as {
  apiUrl: string; apiKey: string; sandboxId: string; modelUrl: string; model: string; resultPath: string;
};
assert.equal(new URL(config.apiUrl).hostname, "127.0.0.1");
assert.equal(new URL(config.modelUrl).hostname, "127.0.0.1");
const client = new HarakiriClient({ apiUrl: config.apiUrl, apiKey: config.apiKey });
const diagnostics: string[] = [];
try {
  const sandbox = await client.sandboxes.connect(config.sandboxId);
  const evidence = await runHostWorkflow({ client, sandbox, model: localModel(config.modelUrl, config.model),
    capture: "content", onDiagnostic: ({ code }) => diagnostics.push(code)
  });
  assert.deepEqual(diagnostics, [], "Recording cleanup must complete without diagnostic failures.");
  await writeFile(config.resultPath, JSON.stringify(evidence), { mode: 0o600 });
} catch (error) {
  await writeFile(config.resultPath, JSON.stringify({ failure: agentFailure(error) }), { mode: 0o600 });
  throw error;
}
