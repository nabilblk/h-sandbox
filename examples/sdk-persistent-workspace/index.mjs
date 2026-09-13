import assert from "node:assert/strict";
import { HarakiriClient } from "@h-sandbox/sdk";

// Unreleased SDK recipe; see docs/sdk-developer-experience.md for package setup.
// Run against an operator-enabled installation; this allocates retained storage.
const client = HarakiriClient.fromEnv();
const template = process.env.HARAKIRI_TEMPLATE || "python-3.12";
const workspace = await client.workspaces.create({ name: `persistent-tutorial-${Date.now()}` });
console.log(`Retained workspace: ${workspace.id}`);
const owned = new Map();
const deletionRequested = new Set();
try {
  const first = await client.sandboxes.create({ template, workspaceId: workspace.id, ttlSeconds: 600, wait: false });
  owned.set(first.id, first);
  await first.wait({ timeoutMs: 180_000 });
  await first.files.write("/workspace/checkpoint.json", JSON.stringify({ step: 1, message: "retained" }));
  deletionRequested.add(first.id);
  await first.kill({ wait: true, timeoutMs: 90_000 });
  owned.delete(first.id);
  await workspace.wait({ timeoutMs: 90_000 });

  const second = await client.sandboxes.create({ template, workspaceId: workspace.id, ttlSeconds: 600, wait: false });
  owned.set(second.id, second);
  await second.wait({ timeoutMs: 180_000 });
  assert.deepEqual(JSON.parse(await second.files.readText("/workspace/checkpoint.json")), { step: 1, message: "retained" });
  console.log("PASS: replacement sandbox read the checkpoint");

  const task = await second.processes.start({
    command: "python -u -c 'import time; from pathlib import Path; p=Path(\"/workspace/executions.txt\"); p.open(\"a\").write(\"one execution\\n\"); [(print(f\"step {i}\", flush=True), time.sleep(1)) for i in range(6)]'",
    cwd: "/workspace", detached: true, timeoutMs: 30_000
  });
  let cursor;
  let output = "";
  for await (const event of task.events()) {
    cursor = event.cursor;
    if (event.type === "output") { output += event.stdout; break; }
  }
  // Closing the first iterator disconnects the viewer, not the command.
  let completed = false;
  const observer = await second.processes.connect(task.id);
  for await (const event of observer.events({ cursor })) {
    if (event.type === "output") output += event.stdout;
    if (event.type === "complete") { assert.equal(event.exitCode, 0); completed = true; }
  }
  assert.ok(completed);
  assert.deepEqual(output.trim().split("\n"), Array.from({ length: 6 }, (_, index) => `step ${index}`));
  assert.equal(await second.files.readText("/workspace/executions.txt"), "one execution\n");
  console.log("PASS: reconnect replayed no output and executed the command once");
} finally {
  const errors = [];
  for (const sandbox of owned.values()) {
    try {
      if (deletionRequested.has(sandbox.id)) await sandbox.waitForTermination({ timeoutMs: 90_000 });
      else await sandbox.kill({ wait: true, timeoutMs: 90_000 });
    }
    catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, `Cleanup unconfirmed; inspect workspace ${workspace.id} before reuse.`);
  await workspace.wait({ timeoutMs: 90_000 });
  await workspace.archive();
  console.log(`Archived ${workspace.id}. Its storage remains allocated until operator reclamation.`);
}
