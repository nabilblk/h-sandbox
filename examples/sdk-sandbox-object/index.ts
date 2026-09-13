import assert from "node:assert/strict";
import { HarakiriClient } from "@h-sandbox/sdk";

// Unreleased SDK recipe; see docs/sdk-developer-experience.md for package setup.
const client = HarakiriClient.fromEnv();
const sandbox = await client.sandboxes.create({
  template: process.env.HARAKIRI_TEMPLATE ?? "python-3.12",
  name: "sdk-background-task", ttlSeconds: 300
});
try {
  await sandbox.files.write("worker.py", "import time\nfor i in range(3):\n    print(f'step {i}', flush=True)\n    time.sleep(1)\n");
  const task = await sandbox.processes.start({ command: "python -u worker.py", timeoutMs: 30_000 });
  const reference = task.reference;
  console.log("Persist this reference in your job record:", reference);
  // Simulate a replacement observer using only saved Harakiri resource IDs.
  const reconnected = await HarakiriClient.fromEnv().sandboxes.connect(reference.sandboxId);
  const resumed = await reconnected.processes.connect(reference.commandId);
  for await (const event of resumed.events()) {
    if (event.type === "output") { process.stdout.write(event.stdout); process.stderr.write(event.stderr); }
  }
  assert.equal((await resumed.wait({ timeoutMs: 40_000 })).exitCode, 0);
} finally {
  await sandbox.kill({ wait: true, timeoutMs: 90_000 });
}
