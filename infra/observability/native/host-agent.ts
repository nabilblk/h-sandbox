import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { HarakiriClient } from "@h-sandbox/sdk";
import { createRunTelemetry, observeRecordedProcess, withAgentRun } from "@h-sandbox/sdk/telemetry";
import { orders, runOrdersAgent } from "./orders-agent.js";
import { localModel } from "./local-model.js";

const config = JSON.parse(await readFile(process.argv[2], "utf8")) as {
  apiUrl: string; apiKey: string; sandboxId: string; modelUrl: string; model: string; resultPath: string;
};
assert.equal(new URL(config.apiUrl).hostname, "127.0.0.1");
assert.equal(new URL(config.modelUrl).hostname, "127.0.0.1");
const client = new HarakiriClient({ apiUrl: config.apiUrl, apiKey: config.apiKey });
const sandbox = await client.sandboxes.connect(config.sandboxId);
await sandbox.files.write("orders.json", JSON.stringify(orders));
const diagnostics: string[] = [];
const evidence = await withAgentRun(client, {
  name: "Real LangChain agent with sandbox tools", sandboxId: sandbox.id, capture: "content",
  runtime: createRunTelemetry, ownership: "owned", onDiagnostic: ({ code }) => diagnostics.push(code)
}, async ({ run, runtime }) => {
  const result = await runOrdersAgent({ model: localModel(config.modelUrl, config.model), telemetry: runtime,
    readOrders: () => sandbox.files.readText("orders.json"),
    submitReport: async (report) => {
      await sandbox.files.write("report.json", JSON.stringify(report));
      const command = await sandbox.processes.start({ command: "python3 verify-orders.py", timeoutMs: 10_000 });
      await observeRecordedProcess(command, runtime, { includeOutput: true });
      return (await command.logs()).stdout;
    }
  });
  assert.deepEqual(JSON.parse(await sandbox.files.readText("report.json")), result.report);
  return { runId: run.id, createdAt: run.createdAt, ...result };
});
assert.deepEqual(diagnostics, [], "Recording cleanup must complete without diagnostic failures.");
await writeFile(config.resultPath, JSON.stringify(evidence), { mode: 0o600 });
