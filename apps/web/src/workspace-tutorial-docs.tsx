import { CodeBlock } from "./components/docs-code";
import type { DocPage } from "./docs-content";
import { WorkspaceReleaseNote } from "./workspace-docs";
import { publishedWorkspace } from "./sdk-doc-examples";

export const workspaceTutorialSource = publishedWorkspace;

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
      <p>The SDK scenario needs your organization API key and the <a href="#docs/workspace-reference">published rc.10 package</a>. The dashboard scenario requires neither a local SDK nor a repository checkout.</p>
      <p>Allow about two minutes. The example uses an initial TTL of 600 seconds. Longer jobs must explicitly renew before expiry; following command output does not renew TTL. Arrange storage cleanup with your operator: archive does not delete the volume or recover the allocation slot.</p>
    </section>
    <section><h2>Try it in the dashboard</h2>
      <ol>
        <li>Open Workspaces, create a uniquely named workspace and choose New sandbox on its row. Select Python 3.12 with an initial TTL of 600 seconds.</li>
        <li>Wait for Running. In Commands, set the working directory to <code>/workspace</code> and run the write command below.</li>
        <li>Kill the sandbox. Return to Workspaces and wait for Available before starting a replacement with the same workspace.</li>
        <li>In the replacement, run the read command from <code>/workspace</code>. A new sandbox ID with the same workspace ID proves reuse.</li>
      </ol>
      <CodeBlock language="bash">{String.raw`# First sandbox: write
python -c 'from pathlib import Path; Path("checkpoint.json").write_text("retained checkpoint\n")'

# Replacement sandbox: read
python -c 'from pathlib import Path; print(Path("checkpoint.json").read_text(), end="")'`}</CodeBlock>
      <p><strong>Expected result:</strong> <code>retained checkpoint</code>. Both commands must exit with code 0. Terminate the replacement, wait for Available, then archive the workspace and request operator reclamation.</p>
    </section>
    <section><h2>Run the SDK scenario</h2>
      <p>Run this complete example as <code>workspace-demo.mjs</code> with Node.js, <code>HARAKIRI_API_URL</code> and <code>HARAKIRI_API_KEY</code> configured privately. All assertions use Harakiri APIs, not Kubernetes runtime access.</p>
      <CodeBlock language="javascript">{workspaceTutorialSource}</CodeBlock>
      <p><strong>Expected result:</strong> a PASS message followed by the archived workspace ID. A missing checkpoint, duplicated line or second execution fails the example. If cleanup cannot confirm release, contact the operator; do not force another mount.</p>
    </section>
    <section><h2>Follow with the CLI</h2>
      <p>On a running Python sandbox, use its real sandbox ID. The working directory below assumes an attached persistent workspace:</p>
      <CodeBlock language="bash">{`harakiri command run sbx_... --cmd 'python -u -c "import time; [print(i, flush=True) or time.sleep(1) for i in range(30)]"' --cwd /workspace --follow
harakiri command follow sbx_... cmd_... --cursor 'v1:cmd_...:p:12'
harakiri command kill sbx_... cmd_...`}</CodeBlock>
      <p>Ctrl-C stops the viewer and prints its last cursor. Resume with that exact cursor and the same command ID, not the illustrative values above. Do not run the start command again. Kill is a separate action. In the dashboard, Stop viewing and Follow output have the same observer-only behavior.</p>
    </section>
    <section><h2>Cleanup and limits</h2>
      <p>Terminate attached sandboxes and wait for release before archiving. Archive retains files and continues consuming quota. Deleting or expiring a sandbox does not wipe its persistent workspace.</p>
      <p>Reconnection cannot recover logs already removed by the provider. Download required artifacts before terminating the runtime. Never store long-lived credentials in project files: revocation cannot erase files an agent already wrote.</p>
      <p>Continue with <a href="#docs/workspace-reference">Workspace API, SDK and CLI</a> or <a href="#docs/workspace-operations">Persistent storage operations</a>.</p>
    </section>
  </div>
};
