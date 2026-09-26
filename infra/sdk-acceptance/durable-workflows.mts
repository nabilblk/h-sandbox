import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { HarakiriClient, type HarakiriSandbox } from "@h-sandbox/sdk";
import { WorkflowStore } from "./examples/durable-store.js";
import { recoverWorkflowFiles } from "./examples/durable-workflow.js";

if (process.env.HARAKIRI_DEEPAGENTS_ACCEPTANCE !== "disposable-runtime") throw new Error("Requires an explicitly disposable installation.");
const client = HarakiriClient.fromEnv();
const store = new WorkflowStore(process.env.WORKFLOW_DATABASE_URL!);
const owned = new Map<string, HarakiriSandbox>();
const exec = promisify(execFile);
let workspaceId: string | undefined;
const worker = async (action: string, thread: string, extra: Record<string, string> = {}, expectedCode = 0) => {
  let code = 0, stdout = "";
  try {
    ({ stdout } = await exec(process.execPath, ["--import", "tsx", "test/durable-worker.ts", action], {
      timeout: 120_000, maxBuffer: 1_048_576,
      env: { ...process.env, HARAKIRI_WORKFLOW_TEST_WORKER: "1", WORKFLOW_TENANT_ID: "acceptance", WORKFLOW_THREAD_ID: thread,
        WORKFLOW_TEST_COMMAND: `printf 'once\\n' >> /workspace/${thread}.txt`, ...extra }
    }));
  } catch (error) {
    const failure = error as { code: number; stdout: string };
    code = failure.code; stdout = failure.stdout;
  }
  assert.equal(code, expectedCode, "Unexpected worker outcome; raw output is not public evidence.");
  return stdout ? JSON.parse(stdout) : null;
};

try {
  await store.setup();
  const workspace = await client.workspaces.create({ name: "framework-recovery-acceptance" });
  workspaceId = workspace.id;
  const sandbox = await client.sandboxes.create({
    template: process.env.HARAKIRI_TEMPLATE!, workspaceId, ttlSeconds: 120, wait: false,
    name: "framework-recovery-acceptance"
  });
  owned.set(sandbox.id, sandbox);
  await sandbox.wait({ timeoutMs: 180_000 });
  const env = { HARAKIRI_SANDBOX_ID: sandbox.id };
  await worker("bind", "approved", env);
  assert.equal((await worker("start", "approved", env)).phase, "approval");
  assert.equal((await sandbox.commands.list()).commands.length, 0);
  await worker("approve", "approved", { ...env, WORKFLOW_TENANT_ID: "unauthorized" }, 1);
  assert.equal((await worker("approve", "approved", env)).phase, "complete");
  assert.equal(await sandbox.files.readText("/workspace/approved.txt"), "once\n");

  await worker("bind", "crashed", env); await worker("start", "crashed", env);
  await worker("crash", "crashed", env, 75);
  const crashed = await store.get({ tenantId: "acceptance", threadId: "crashed" });
  const [reference] = await store.commands(crashed); assert.ok(reference);
  const count = (await sandbox.commands.list()).commands.length;
  assert.equal((await worker("approve", "crashed", env, 1)).name, "WorkflowRecoveryRequired");
  assert.equal((await worker("observe", "crashed", { ...env, WORKFLOW_COMMAND_ID: reference.commandId })).exitCode, 0);
  assert.equal((await sandbox.commands.list()).commands.length, count);
  assert.equal(await sandbox.files.readText("/workspace/crashed.txt"), "once\n");

  await worker("bind", "expired", env); await worker("start", "expired", env);
  // Observe actual server-side TTL cleanup; reaching the local clock alone is not proof.
  await sandbox.waitForTermination({ timeoutMs: 300_000 });
  assert.equal((await worker("approve", "expired", env, 1)).name, "WorkflowRecoveryRequired");
  await workspace.wait({ timeoutMs: 90_000 });
  const recovered = await recoverWorkflowFiles(store, client, { tenantId: "acceptance", threadId: "expired" });
  const replacement = await client.sandboxes.connect(recovered.sandboxId);
  owned.set(replacement.id, replacement);
  await replacement.wait({ timeoutMs: 180_000 });
  assert.equal(await replacement.files.readText("/workspace/approved.txt"), "once\n");
  assert.equal(await replacement.files.readText("/workspace/crashed.txt"), "once\n");
  assert.equal((await replacement.commands.list()).commands.length, 0);
  assert.equal((await store.get({ tenantId: "acceptance", threadId: "crashed" })).sandboxId, sandbox.id);
  console.log("Durable native workflows passed: approval, process loss, read-only recovery, TTL and retained files. Model decisions were scripted.");
} finally {
  try {
    for (const sandbox of owned.values()) {
      await sandbox.refresh();
      if (sandbox.status === "terminated") await sandbox.waitForTermination({ timeoutMs: 90_000 });
      else await sandbox.kill({ wait: true, timeoutMs: 90_000 });
    }
    if (workspaceId) { await client.workspaces.wait(workspaceId); await client.workspaces.archive(workspaceId); }
  } finally { await store.close(); }
}
