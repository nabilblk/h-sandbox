import type { DocPage } from "./docs-content";
import { WorkspaceReleaseNote } from "./workspace-docs";

export const workspaceTutorialSource = String.raw`import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { HarakiriClient } from "@h-sandbox/sdk";

const client = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL,
  apiKey: process.env.HARAKIRI_API_KEY
});
const { workspace } = await client.workspaces.create({
  name: "checkpoint-demo-" + Date.now()
});
const sandboxIds = [];
async function waitUntilAvailable() {
  for (let attempt = 0; attempt < 90; attempt++) {
    const { workspace: current } = await client.workspaces.get(workspace.id);
    if (current.status === "available") return;
    await delay(1000);
  }
  throw new Error("Workspace is still reserved. Ask the operator to reconcile it.");
}

try {
  const input = { template: "python-3.12", workspaceId: workspace.id, ttlSeconds: 600 };
  const { sandbox: first } = await client.createSandbox(input);
  sandboxIds.push(first.id);
  await client.waitForSandbox(first.id);
  await client.files.write(first.id, {
    path: "/workspace/checkpoint.json", content: JSON.stringify({ step: 1 })
  });
  await client.killSandbox(first.id);
  await waitUntilAvailable();

  const { sandbox: second } = await client.createSandbox(input);
  sandboxIds.push(second.id);
  await client.waitForSandbox(second.id);
  const checkpoint = await client.files.read(second.id, "/workspace/checkpoint.json");
  assert.deepEqual(JSON.parse(checkpoint.content), { step: 1 });
  console.log("PASS: replacement sandbox read the checkpoint");

  const { command } = await client.commands.start(second.id, {
    command: "python -u -c 'import time; from pathlib import Path; Path(\"runs.txt\").open(\"a\").write(\"once\\n\"); [(print(i, flush=True), time.sleep(1)) for i in range(6)]'",
    cwd: "/workspace", detached: true, timeoutMs: 30000
  });
  let cursor;
  let output = "";
  for await (const event of client.commands.stream(second.id, command.id)) {
    cursor = event.cursor;
    if (event.type === "output") { output += event.stdout; break; }
  }
  // Closing the iterator stops this viewer, not the running command.
  let completed = false;
  for await (const event of client.commands.stream(second.id, command.id, { cursor })) {
    if (event.type === "output") output += event.stdout;
    if (event.type === "complete") {
      assert.equal(event.exitCode, 0);
      completed = true;
    }
  }
  assert.ok(completed);
  assert.deepEqual(output.trim().split("\n"), ["0", "1", "2", "3", "4", "5"]);
  assert.equal((await client.files.read(second.id, "/workspace/runs.txt")).content, "once\n");
  console.log("PASS: reconnect returned each line once; command executed once");
} finally {
  for (const id of sandboxIds) await client.killSandbox(id);
  await waitUntilAvailable();
  await client.workspaces.archive(workspace.id);
  console.log("Archived", workspace.id, "- storage and quota retained");
}`;

export const workspaceTutorialDocs: DocPage = {
  id: "persistent-workspaces",
  section: "Tutorials",
  title: "Reuse files across sandboxes",
  lede: "Write a checkpoint, replace the sandbox, then reconnect to a command without running it twice.",
  toc: ["Before you start", "Try it in the dashboard", "Run the SDK scenario", "Follow with the CLI", "Cleanup and limits"],
  body: <div className="tutorial-doc">
    <WorkspaceReleaseNote />
    <section><h2>Before you start</h2>
      <p>Read <a href="#docs/workspaces">Workspaces</a> for the storage model. This exercise requires no model provider or paid API key. Use an operator-enabled installation, a Python template and one free workspace allocation.</p>
      <p>The SDK scenario needs your organization API key and the <a href="#docs/workspace-reference">matching candidate package</a>. The dashboard scenario requires neither a local SDK nor a repository checkout.</p>
      <p>Allow about two minutes. The example uses an initial TTL of 600 seconds; do not rely on renewal while the scheduler issue remains open. Arrange storage cleanup with your operator: archive does not delete the volume or recover the allocation slot.</p>
    </section>
    <section><h2>Try it in the dashboard</h2>
      <ol>
        <li>Open Workspaces, create a uniquely named workspace and choose New sandbox on its row. Select Python 3.12 with an initial TTL of 600 seconds.</li>
        <li>Wait for Running. In Commands, set the working directory to <code>/workspace</code> and run the write command below.</li>
        <li>Kill the sandbox. Return to Workspaces and wait for Available before starting a replacement with the same workspace.</li>
        <li>In the replacement, run the read command from <code>/workspace</code>. A new sandbox ID with the same workspace ID proves reuse.</li>
      </ol>
      <pre>{String.raw`# First sandbox: write
python -c 'from pathlib import Path; Path("checkpoint.json").write_text("retained checkpoint\n")'

# Replacement sandbox: read
python -c 'from pathlib import Path; print(Path("checkpoint.json").read_text(), end="")'`}</pre>
      <p><strong>Expected result:</strong> <code>retained checkpoint</code>. Both commands must exit with code 0. Terminate the replacement, wait for Available, then archive the workspace and request operator reclamation.</p>
    </section>
    <section><h2>Run the SDK scenario</h2>
      <p>Run this complete example as <code>workspace-demo.mjs</code> with Node.js, <code>HARAKIRI_API_URL</code> and <code>HARAKIRI_API_KEY</code> configured privately. All assertions use Harakiri APIs, not Kubernetes runtime access.</p>
      <pre>{workspaceTutorialSource}</pre>
      <p><strong>Expected result:</strong> both PASS messages followed by the archived workspace ID. A missing checkpoint, duplicated line or second execution fails the example. If cleanup cannot confirm release, contact the operator; do not force another mount.</p>
    </section>
    <section><h2>Follow with the CLI</h2>
      <p>On a running Python sandbox, use its real sandbox ID. The working directory below assumes an attached persistent workspace:</p>
      <pre>{`harakiri command run sbx_... --cmd 'python -u -c "import time; [print(i, flush=True) or time.sleep(1) for i in range(30)]"' --cwd /workspace --follow
harakiri command follow sbx_... cmd_... --cursor 'v1:cmd_...:p:12'
harakiri command kill sbx_... cmd_...`}</pre>
      <p>Ctrl-C stops the viewer and prints its last cursor. Resume with that exact cursor and the same command ID, not the illustrative values above. Do not run the start command again. Kill is a separate action. In the dashboard, Stop viewing and Follow output have the same observer-only behavior.</p>
    </section>
    <section><h2>Cleanup and limits</h2>
      <p>Terminate attached sandboxes and wait for release before archiving. Archive retains files and continues consuming quota. Deleting or expiring a sandbox does not wipe its persistent workspace.</p>
      <p>Reconnection cannot recover logs already removed by the provider. Download required artifacts before terminating the runtime. Never store long-lived credentials in project files: revocation cannot erase files an agent already wrote.</p>
      <p>Continue with <a href="#docs/workspace-reference">Workspace API, SDK and CLI</a> or <a href="#docs/workspace-operations">Persistent storage operations</a>.</p>
    </section>
  </div>
};
