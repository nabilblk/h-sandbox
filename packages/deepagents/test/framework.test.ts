import assert from "node:assert/strict";
import test from "node:test";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { Command, MemorySaver, isInterrupted } from "@langchain/langgraph";
import { createDeepAgent } from "deepagents";
import { HarakiriSandboxBackend } from "@h-sandbox/deepagents";
import { createTaskReviewGraph } from "../examples/checkpointed-task.js";
import { fixture } from "./fixture.js";
import { ScriptedModel } from "./scripted-model.js";

process.env.LANGSMITH_TRACING = "false";
process.env.LANGCHAIN_TRACING_V2 = "false";

const call = (name: string, args: Record<string, unknown>, id: string) => new AIMessage({
  content: "", tool_calls: [{ name, args, id, type: "tool_call" }]
});

test("the real Deep Agents graph invokes remote filesystem and execute tools", async () => {
  const f = fixture();
  const model = new ScriptedModel([
    call("write_file", { file_path: "/app/hello.txt", content: "hello" }, "write_1"),
    call("edit_file", { file_path: "/app/hello.txt", old_string: "hello", new_string: "verified" }, "edit_1"),
    call("execute", { command: "cat /app/hello.txt" }, "execute_1"),
    new AIMessage("done")
  ]);
  f.state.output.stdout = "verified";
  const agent = createDeepAgent({ model, backend: new HarakiriSandboxBackend(f.sandbox), subagents: [], memory: [], skills: [] });
  const result = await agent.invoke({ messages: [{ role: "user", content: "Write, edit and verify a file." }] });
  assert.equal(new TextDecoder().decode(f.files.get("/app/hello.txt")), "verified");
  assert.equal(result.messages.at(-1)?.content, "done");
  assert.ok(result.messages.some(message => message instanceof ToolMessage && String(message.content).includes("verified")));
  assert.equal(f.commands.size, 1);
  assert.equal(f.summary.status, "running");
});

test("Deep Agents tells the model that a command timed out or was killed with no exit code", async () => {
  for (const reason of ["timeout", "killed"] as const) {
    for (const stdout of ["", "partial output"]) {
      const f = fixture(); f.state.output.stdout = stdout;
      f.state.override = request => request.method === "GET" && request.url.pathname.endsWith("/commands/cmd_1")
        ? Response.json({ command: { ...f.commands.get("cmd_1"), status: "killed", exitCode: null, finishReason: reason } }) : undefined;
      const agent = createDeepAgent({
        model: new ScriptedModel([call("execute", { command: "long task" }, "execute_1"), new AIMessage("observed")]),
        backend: new HarakiriSandboxBackend(f.sandbox, { maxOutputBytes: 1 }), subagents: [], memory: [], skills: []
      });
      const result = await agent.invoke({ messages: [{ role: "user", content: "Run the task." }] });
      const message = result.messages.find(m => m instanceof ToolMessage);
      assert.ok(message);
      assert.match(String(message.content), reason === "timeout" ? /Command timed out/ : /Command was killed/);
      assert.doesNotMatch(String(message.content), /succeeded|exit code/);
      assert.equal(f.commands.size, 1);
    }
  }
});

test("Deep Agents reports truncated grep results, including when the first match cannot fit", async () => {
  const first = "/app/a.txt:1:hello\n";
  for (const maxOutputBytes of [first.length + 19, 1]) {
    const f = fixture(); f.state.output.stdout = first + "/app/b.txt:2:hello incomplete\n";
    const agent = createDeepAgent({
      model: new ScriptedModel([call("grep", { pattern: "hello", path: "/app" }, "grep_1"), new AIMessage("observed")]),
      backend: new HarakiriSandboxBackend(f.sandbox, { maxOutputBytes }), subagents: [], memory: [], skills: []
    });
    const result = await agent.invoke({ messages: [{ role: "user", content: "Search the repository." }] });
    const message = result.messages.find(m => m instanceof ToolMessage);
    assert.ok(message);
    assert.match(String(message.content), /truncated|incomplete/i);
    assert.doesNotMatch(String(message.content), /b\.txt|No matches found/);
    if (maxOutputBytes > 1) assert.match(String(message.content), /a\.txt/);
  }
});

test("Deep Agents human approval survives graph replacement without prematurely executing", async () => {
  const f = fixture(); const checkpointer = new MemorySaver();
  const config = { configurable: { thread_id: "org-a:thread-one" } };
  const first = createDeepAgent({
    model: new ScriptedModel([call("execute", { command: "verify" }, "approval_1")]),
    backend: new HarakiriSandboxBackend(f.sandbox), checkpointer, interruptOn: { execute: true }, memory: [], skills: []
  });
  const paused = await first.invoke({ messages: [{ role: "user", content: "Verify after approval." }] }, config);
  assert.equal(f.commands.size, 0);
  assert.ok(isInterrupted(paused));
  const replacement = createDeepAgent({
    model: new ScriptedModel([new AIMessage("approved and done")]),
    backend: new HarakiriSandboxBackend(await f.client.sandboxes.connect(f.summary.id)),
    checkpointer, interruptOn: { execute: true }, memory: [], skills: []
  });
  const result = await replacement.invoke(new Command({ resume: { decisions: [{ type: "approve" }] } }), config);
  assert.equal(f.commands.size, 1);
  assert.equal(result.messages.at(-1)?.content, "approved and done");
  const checkpoint = JSON.stringify((await checkpointer.getTuple(config))?.checkpoint);
  assert.ok(!checkpoint.includes("synthetic-framework-key"));
});

test("the reference LangGraph resumes observation by IDs without repeating submission", async () => {
  const f = fixture();
  const task = await f.sandbox.processes.start({ command: "one-time report", detached: true });
  const checkpointer = new MemorySaver();
  const config = { configurable: { thread_id: "org-a:report-one" } };
  let resolved = 0;
  const resolve = async (id: string) => {
    assert.equal(id, f.summary.id, "The application's tenant/thread mapping is authoritative.");
    resolved++;
    return new HarakiriSandboxBackend(await f.client.sandboxes.connect(id));
  };
  const first = createTaskReviewGraph(resolve, checkpointer);
  await first.invoke({ reference: task.reference }, config);
  assert.equal(resolved, 0);
  const replacement = createTaskReviewGraph(resolve, checkpointer);
  const result = await replacement.invoke(new Command({ resume: true }), config);
  assert.equal(result.result.exitCode, 0);
  assert.equal(resolved, 1);
  assert.equal(f.commands.size, 1);
  const checkpoint = JSON.stringify((await checkpointer.getTuple(config))?.checkpoint);
  assert.ok(checkpoint.includes(task.id));
  assert.ok(!checkpoint.includes("synthetic-framework-key"));
  assert.ok(f.requests.every(r => r.method !== "DELETE"));
});
