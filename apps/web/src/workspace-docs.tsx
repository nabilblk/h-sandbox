import type { DocPage } from "./docs-content";

export const workspaceDocs: DocPage = {
  id: "persistent-workspaces",
  section: "Tutorials",
  title: "Persistent workspaces and live commands",
  lede: "Keep an agent's project files across sandbox replacement, and reconnect to its command output without restarting the job.",
  toc: ["Availability", "Create a workspace", "Replace the sandbox", "Follow a command", "Cleanup and limits"],
  body: <div className="tutorial-doc">
    <section><h2>Availability</h2>
      <p><strong>Release candidate: 0.5.0-rc.1.</strong> Use matching API, SDK and CLI versions; stable 0.4.0 does not include this API. Your operator must enable persistent storage on a supported OpenSandbox installation. k0s acceptance is passing; clean restricted OpenShift validation is pending. The development provider cannot emulate persistent storage.</p>
      <p>A workspace is organization-owned storage at <code>/workspace</code>. A sandbox is the runtime that uses it. Only one sandbox can own the workspace at a time, including while paused. A checkpoint file belongs in the workspace; a credential belongs in Credential Vault.</p>
    </section>
    <section><h2>Create a workspace</h2>
      <p>In the dashboard, open Workspaces, create a named workspace, then use New sandbox on that row. The workspace selector also appears in the sandbox creation dialog. The operator controls capacity and quota.</p>
      <pre>{`import { HarakiriClient } from "@h-sandbox/sdk";
const client = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL,
  apiKey: process.env.HARAKIRI_API_KEY
});
const { workspace } = await client.workspaces.create({ name: "agent-project" });
const sandbox = await client.sandboxes.create({
  template: "python-3.12", workspaceId: workspace.id, ttlSeconds: 600
});
await sandbox.wait();
await sandbox.files.write({
  path: "/workspace/checkpoint.json",
  content: JSON.stringify({ completedStep: 1 })
});`}</pre>
    </section>
    <section><h2>Replace the sandbox</h2>
      <p>Terminate the first sandbox. Poll <code>client.workspaces.get(workspace.id)</code> until its status is <code>available</code>; termination requests alone do not confirm release. Create a second sandbox with the same workspace ID and read <code>/workspace/checkpoint.json</code>. It must still contain the checkpoint.</p>
      <p>A <code>recovery_required</code> status means attachment could not be confirmed safely. Ask the operator to reconcile it. Creating another sandbox or a new empty volume is not a safe recovery strategy.</p>
    </section>
    <section><h2>Follow a command</h2>
      <p>Run this bounded, unbuffered job in the replacement sandbox. It requires no model credentials. Persist the last consumed cursor when the viewer disconnects.</p>
      <pre>{`const { command } = await client.commands.start(sandboxId, {
  command: "python -u -c 'import time; [(print(i, flush=True), time.sleep(1)) for i in range(10)]'",
  cwd: "/workspace", detached: true, timeoutMs: 30000
});
let cursor;
for await (const event of client.commands.stream(sandboxId, command.id)) {
  cursor = event.cursor;
  if (event.type === "output") process.stdout.write(event.stdout);
  if (event.type === "complete" && event.exitCode !== 0) {
    throw new Error("Job failed");
  }
}
// After an interrupted viewer, resume this command, not commands.start():
// client.commands.stream(sandboxId, command.id, { cursor });`}</pre>
      <p>The Commands tab offers Stop viewing and Follow output. Neither stops the process. Terminate is a separate, confirmed action. The CLI has the same distinction:</p>
      <pre>{`harakiri command run sbx_... --cmd 'python -u job.py' --follow
harakiri command follow sbx_... cmd_... --cursor 'v1:cmd_...:p:12'
harakiri command kill sbx_... cmd_...`}</pre>
      <p>Upload <code>job.py</code> before using that CLI example. Ctrl-C stops the CLI viewer, not the job. Streams use authenticated HTTP and retained provider logs; they are not durable event storage.</p>
    </section>
    <section><h2>Cleanup and limits</h2>
      <p>Terminate attached sandboxes and wait for release before archiving. Archive retains files and continues consuming quota until an operator reclaims storage. Deleting or expiring a sandbox does not wipe a persistent workspace. Workspace snapshots and snapshot restore into a workspace are not supported in this preview.</p>
      <p>Reconnection cannot recover logs already removed by the provider. Download required artifacts before terminating the runtime. Never store long-lived credentials in project files: revocation cannot erase files an agent already wrote.</p>
      <p><a href="https://github.com/nabilblk/h-sandbox/tree/main/examples/sdk-persistent-workspace">Runnable checkpoint and reconnect acceptance example</a> | <a href="https://github.com/nabilblk/h-sandbox/blob/main/docs/persistent-workspace-operations.md">Operator storage and recovery guide</a></p>
    </section>
  </div>
};
