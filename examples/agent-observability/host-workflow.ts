import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { HarakiriClient, HarakiriSandbox } from "@h-sandbox/sdk";
import { createRunTelemetry, observeRecordedProcess, withAgentRun, type TelemetryDiagnostic } from "@h-sandbox/sdk/telemetry";
import { orders, runOrdersAgent } from "./orders-agent.js";

type Options = {
  client: HarakiriClient;
  sandbox: HarakiriSandbox;
  model: BaseChatModel;
  capture?: "metadata" | "content";
  onDiagnostic?: (diagnostic: TelemetryDiagnostic) => void;
};

/** Borrows a disposable sandbox; owns only this short run and its telemetry. */
export async function runHostWorkflow({ client, sandbox, model, capture = "metadata", onDiagnostic }: Options) {
  await sandbox.wait({ timeoutMs: 60_000 });
  await sandbox.files.write("orders.json", JSON.stringify(orders));
  await sandbox.files.write("verify-orders.py", await readFile(new URL("./verify-orders.py", import.meta.url)));
  return withAgentRun(client, {
    name: "Real LangChain agent with sandbox tools", sandboxId: sandbox.id, capture,
    runtime: createRunTelemetry, ownership: "owned", onDiagnostic
  }, async ({ run, runtime }) => {
    const result = await runOrdersAgent({ model, telemetry: runtime,
      readOrders: () => sandbox.files.readText("orders.json"),
      submitReport: async report => {
        await sandbox.files.write("report.json", JSON.stringify(report));
        const command = await sandbox.processes.start({ command: "python3 verify-orders.py", timeoutMs: 10_000 });
        const outcome = await observeRecordedProcess(command, runtime, { includeOutput: capture === "content" });
        assert.equal(outcome.exitCode, 0, "Independent report verification failed.");
        return (await command.logs()).stdout;
      }
    });
    assert.deepEqual(JSON.parse(await sandbox.files.readText("report.json")), result.report);
    return { runId: run.id, createdAt: run.createdAt, ...result };
  });
}
