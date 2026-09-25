import { HarakiriClient } from "@h-sandbox/sdk";
import { AIMessage } from "@langchain/core/messages";
import { WorkflowStore } from "../examples/durable-store.js";
import { bindWorkflow, observeWorkflowCommand, recoverWorkflowFiles, runWorkflow } from "../examples/durable-workflow.js";
import { ScriptedModel } from "./scripted-model.js";

// Scripted decisions through the real framework. Only the harness selects an API/runtime.
if (process.env.HARAKIRI_WORKFLOW_TEST_WORKER !== "1") throw new Error("Test worker requires explicit harness configuration.");
const store = new WorkflowStore(process.env.WORKFLOW_DATABASE_URL!);
const identity = { tenantId: process.env.WORKFLOW_TENANT_ID!, threadId: process.env.WORKFLOW_THREAD_ID! };
const client = HarakiriClient.fromEnv({ requestTimeoutMs: 3000 });
const action = process.argv[2];
try {
  let result: unknown;
  if (action === "bind") result = await bindWorkflow(store, client, identity, process.env.HARAKIRI_SANDBOX_ID ?? "sbx_framework");
  else if (action === "observe") result = await observeWorkflowCommand(store, client, identity, process.env.WORKFLOW_COMMAND_ID!);
  else if (action === "recover-files") result = await recoverWorkflowFiles(store, client, identity);
  else {
    const run = await store.get(identity);
    const checkpoint = await store.checkpointer.getTuple({ configurable: { thread_id: run.id } });
    const model = new ScriptedModel(action === "start" ? [new AIMessage({
      content: "", tool_calls: [{ name: "execute", args: { command: process.env.WORKFLOW_TEST_COMMAND ?? "printf 'verified\\n'" }, id: "durable_call", type: "tool_call" }]
    })] : [new AIMessage("finished")]);
    result = await runWorkflow(store, client, identity, model, action === "start"
      ? { type: "start", prompt: "Verify the task after approval." }
      : { type: action === "reject" ? "reject" : "approve",
        checkpointId: process.env.WORKFLOW_CHECKPOINT_ID ?? checkpoint?.config.configurable?.checkpoint_id }, {
      onAcknowledged: async () => { if (action === "crash") process.exit(75); }
    });
  }
  console.log(JSON.stringify(result));
} catch (error) {
  console.log(JSON.stringify({ error: error instanceof Error ? error.message : "unknown", name: error instanceof Error ? error.name : "unknown" }));
  process.exitCode = 1;
} finally { await store.close(); }
