import assert from "node:assert/strict";
import { HarakiriClient } from "@h-sandbox/sdk";
import { HarakiriSandboxBackend, withHarakiriSandbox } from "@h-sandbox/deepagents";
import { Command, MemorySaver, isInterrupted } from "@langchain/langgraph";
import { createTaskReviewGraph } from "./checkpointed-task.js";

const template = process.env.HARAKIRI_TEMPLATE;
if (!template) throw new Error("Set HARAKIRI_TEMPLATE to an installed Linux template.");
const client = HarakiriClient.fromEnv();

// Both graph instances run inside this short task. A real human pause needs an
// application-owned sandbox and a persistent checkpointer, not this task helper.
await withHarakiriSandbox(client, { template, ttlSeconds: 600 }, async ({ sandbox }) => {
  const task = await sandbox.processes.start({ command: "printf 'reviewed\\n'", timeoutMs: 10_000 });
  const checkpointer = new MemorySaver();
  const config = { configurable: { thread_id: "example:review" } };
  const resolveBackend = async (id: string) => {
    // Replace with an authenticated tenant/thread lookup in your application.
    assert.equal(id, sandbox.id, "A checkpoint cannot select another sandbox.");
    return new HarakiriSandboxBackend(await client.sandboxes.connect(id));
  };
  const first = createTaskReviewGraph(resolveBackend, checkpointer);
  assert.ok(isInterrupted(await first.invoke({ reference: task.reference }, config)));
  const replacement = createTaskReviewGraph(resolveBackend, checkpointer);
  const result = await replacement.invoke(new Command({ resume: true }), config);
  assert.equal(result.result.exitCode, 0);
  console.log(result.result.output);
});
console.log("Sandbox terminated and capacity released.");
