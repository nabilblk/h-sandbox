import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { HarakiriClient } from "../../packages/sdk/dist/index.js";

// Run against an operator-enabled installation; this allocates retained storage.
const client = new HarakiriClient({ apiUrl: process.env.HARAKIRI_API_URL, apiKey: process.env.HARAKIRI_API_KEY });
const template = process.env.HARAKIRI_TEMPLATE || "python-3.12";
const { workspace } = await client.workspaces.create({ name: `persistent-tutorial-${Date.now()}` });
const sandboxIds = [];
const available = async () => {
  for (let attempt = 0; attempt < 90; attempt++) {
    if ((await client.workspaces.get(workspace.id)).workspace.status === "available") return;
    await delay(1000);
  }
  throw new Error("Workspace is still reserved. Check the scheduler/provider; do not force a second mount.");
};
try {
  const first = (await client.createSandbox({ template, workspaceId: workspace.id, ttlSeconds: 600 })).sandbox;
  sandboxIds.push(first.id);
  await client.waitForSandbox(first.id);
  await client.files.write(first.id, { path: "/workspace/checkpoint.json", content: JSON.stringify({ step: 1, message: "retained" }) });
  await client.killSandbox(first.id);
  await available();

  const second = (await client.createSandbox({ template, workspaceId: workspace.id, ttlSeconds: 600 })).sandbox;
  sandboxIds.push(second.id);
  await client.waitForSandbox(second.id);
  assert.deepEqual(JSON.parse((await client.files.read(second.id, "/workspace/checkpoint.json")).content), { step: 1, message: "retained" });
  console.log("PASS: replacement sandbox read the checkpoint");

  const { command } = await client.commands.start(second.id, {
    command: "python -u -c 'import time; from pathlib import Path; p=Path(\"/workspace/executions.txt\"); p.open(\"a\").write(\"one execution\\n\"); [(print(f\"step {i}\", flush=True), time.sleep(1)) for i in range(6)]'",
    cwd: "/workspace", detached: true, timeoutMs: 30_000
  });
  let cursor;
  let output = "";
  for await (const event of client.commands.stream(second.id, command.id)) {
    cursor = event.cursor;
    if (event.type === "output") { output += event.stdout; break; }
  }
  // Closing the first iterator disconnects the viewer, not the command.
  let completed = false;
  for await (const event of client.commands.stream(second.id, command.id, { cursor })) {
    if (event.type === "output") output += event.stdout;
    if (event.type === "complete") { assert.equal(event.exitCode, 0); completed = true; }
  }
  assert.ok(completed);
  assert.deepEqual(output.trim().split("\n"), Array.from({ length: 6 }, (_, index) => `step ${index}`));
  assert.equal((await client.files.read(second.id, "/workspace/executions.txt")).content, "one execution\n");
  console.log("PASS: reconnect replayed no output and executed the command once");
} finally {
  for (const id of sandboxIds) await client.killSandbox(id);
  await available();
  await client.workspaces.archive(workspace.id);
  console.log(`Archived ${workspace.id}. Its storage remains allocated until operator reclamation.`);
}
