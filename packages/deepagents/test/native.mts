import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { HarakiriClient } from "@h-sandbox/sdk";
import { HarakiriSandboxBackend, withHarakiriSandbox } from "@h-sandbox/deepagents";
import { AIMessage } from "@langchain/core/messages";
import { createDeepAgent } from "deepagents";
import { ScriptedModel } from "./scripted-model.js";

if (process.env.HARAKIRI_DEEPAGENTS_ACCEPTANCE !== "disposable-runtime") {
  throw new Error("Set HARAKIRI_DEEPAGENTS_ACCEPTANCE=disposable-runtime only for your explicit disposable test installation.");
}
const template = process.env.HARAKIRI_TEMPLATE;
if (!template) throw new Error("Set HARAKIRI_TEMPLATE to a Linux template with bash, GNU file tools and Python 3.");
const client = HarakiriClient.fromEnv();
process.env.LANGSMITH_TRACING = "false";
process.env.LANGCHAIN_TRACING_V2 = "false";
const cwd = `/tmp/harakiri-framework-${randomUUID()}`;
const call = (name: string, args: Record<string, unknown>, id: string) => new AIMessage({
  content: "", tool_calls: [{ name, args, id, type: "tool_call" }]
});

await withHarakiriSandbox(client, { template, name: "deepagents-acceptance", ttlSeconds: 300 }, async ({ sandbox, backend }) => {
  await sandbox.files.mkdir({ path: cwd, recursive: true });
  const agent = createDeepAgent({
    model: new ScriptedModel([
      call("write_file", { file_path: `${cwd}/proof.txt`, content: "before" }, "write"),
      call("edit_file", { file_path: `${cwd}/proof.txt`, old_string: "before", new_string: "after" }, "edit"),
      call("execute", { command: "cat proof.txt" }, "verify"),
      new AIMessage("finished")
    ]),
    backend, subagents: [], memory: [], skills: []
  });
  await agent.invoke({ messages: [{ role: "user", content: "Exercise the remote tool contract." }] });
  assert.equal(await sandbox.files.readText(`${cwd}/proof.txt`), "after");
  assert.ok((await backend.ls(cwd)).files?.some(file => file.path.endsWith("proof.txt")));
  assert.ok((await backend.glob("*.txt", cwd)).files?.length);
  assert.ok((await backend.grep("after", cwd)).matches?.length);
  assert.match(String((await backend.read(`${cwd}/proof.txt`)).content), /after/);
  const bytes = new Uint8Array([0, 128, 255, 10]);
  assert.equal((await backend.uploadFiles([["proof.bin", bytes]]))[0].error, null);
  assert.deepEqual((await backend.downloadFiles(["proof.bin"]))[0].content, bytes);
  const nonzero = await backend.execute("printf 'intentional failure' >&2; exit 7");
  assert.equal(nonzero.exitCode, 7);
  const reconnected = new HarakiriSandboxBackend(await client.sandboxes.connect(sandbox.id), { cwd });
  assert.equal((await reconnected.observe(nonzero.reference)).exitCode, 7);
  console.log(`Verified remote framework tools for ${sandbox.id}. Confirming cleanup...`);
}, { backend: { cwd, timeoutMs: 30_000 }, cleanupTimeoutMs: 90_000 });
console.log("Native Deep Agents acceptance passed; sandbox termination and capacity release confirmed. Model decisions were scripted.");
