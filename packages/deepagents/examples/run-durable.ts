import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { HarakiriClient } from "@h-sandbox/sdk";
import { initChatModel } from "langchain/chat_models/universal";
import { WorkflowStore } from "./durable-store.js";
import { bindWorkflow, observeWorkflowCommand, recoverWorkflowFiles, runWorkflow } from "./durable-workflow.js";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}.`);
  return value;
};

async function main() {
  const action = process.argv[2];
  if (!action || !["setup", "bind", "inspect", "start", "approve", "reject", "observe", "recover-files"].includes(action)) {
    throw new Error("Choose setup, bind, inspect, start, approve, reject, observe or recover-files.");
  }
  const store = new WorkflowStore(required("WORKFLOW_DATABASE_URL"));
  try {
    if (action === "setup") { await store.setup(); console.log("Workflow database ready."); return; }
    // CLI operator input only. A server must derive these from its authenticated context.
    const identity = { tenantId: required("WORKFLOW_TENANT_ID"), threadId: required("WORKFLOW_THREAD_ID") };
    const client = HarakiriClient.fromEnv({ requestTimeoutMs: 30_000 });
    if (action === "bind") {
      console.log(await bindWorkflow(store, client, identity, required("HARAKIRI_SANDBOX_ID")));
    } else if (action === "inspect") {
      const run = await store.get(identity);
      const checkpoint = await store.checkpointer.getTuple({ configurable: { thread_id: run.id } });
      console.dir({ run, commands: await store.commands(run), checkpointId: checkpoint?.config.configurable?.checkpoint_id,
        review: checkpoint?.pendingWrites?.filter(([, channel]) => channel === "__interrupt__").map(([, , value]) => value) }, { depth: 8 });
    } else if (action === "observe") {
      console.log(await observeWorkflowCommand(store, client, identity, required("WORKFLOW_COMMAND_ID")));
    } else if (action === "recover-files") {
      console.log(await recoverWorkflowFiles(store, client, identity));
    } else {
      const model = await initChatModel(required("HARAKIRI_AGENT_MODEL"));
      const request = action === "start" ? { type: "start" as const, prompt: required("WORKFLOW_PROMPT") }
        : { type: action as "approve" | "reject", checkpointId: required("WORKFLOW_CHECKPOINT_ID") };
      console.dir(await runWorkflow(store, client, identity, model, request), { depth: 5 });
    }
  } finally { await store.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
