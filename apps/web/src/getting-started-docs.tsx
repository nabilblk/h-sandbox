import type { DocPage } from "./docs-content";
import { useState } from "react";
import { CodeBlock, CodeTabs } from "./components/docs-code";
import { Icon } from "./components/icon";

export const quickstartCli = `#!/usr/bin/env bash
set -euo pipefail

SBX_ID="$(harakiri create --template python-3.12-data \\
  --name first-task --ttl 600 | sed -n '/^sbx_/p')"
test -n "$SBX_ID"
trap 'harakiri kill "$SBX_ID"' EXIT

harakiri status "$SBX_ID" --json
harakiri run "$SBX_ID" \\
  --cmd "python -c 'print(2 + 2)'"

# Release only after the task has finished.
harakiri kill "$SBX_ID"
trap - EXIT`;

export const quickstartTypeScript = `import assert from "node:assert/strict";
import { HarakiriClient } from "@h-sandbox/sdk";

const apiUrl = process.env.HARAKIRI_API_URL;
const apiKey = process.env.HARAKIRI_API_KEY;
if (!apiUrl || !apiKey) {
  throw new Error("Set HARAKIRI_API_URL and HARAKIRI_API_KEY");
}

const client = new HarakiriClient({ apiUrl, apiKey });
const sandbox = await client.sandboxes.create({
  template: "python-3.12-data",
  name: "first-task",
  ttlSeconds: 600,
  wait: true
});

try {
  const { result } = await sandbox.run({
    command: "python -c 'print(2 + 2)'"
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), "4");
  console.log(result.stdout.trim());
} finally {
  await sandbox.kill();
}`;

export const overviewDocs: DocPage = {
  id: "overview", section: "Getting started", title: "Harakiri documentation", navTitle: "Overview",
  lede: "Give your application a place to run code, use tools and produce results. Start with one sandbox, then add the policies and persistence your workload needs.",
  toc: ["Start with a working sandbox", "Understand the building blocks", "Build a complete workflow", "Integrate and operate"],
  body: <>
    <h2>Start with a working sandbox</h2>
    <p>The quickstart creates a Python sandbox, runs a checked command and cleans up. No agent framework or model-provider key is required.</p>
    <a className="docs-start-link" href="#docs/quickstart"><span><strong>Run your first task</strong><small>CLI or TypeScript SDK / no model credentials</small></span><Icon name="arrowR" size={20} /></a>
    <a className="docs-start-link" href="#docs/install-kubernetes"><span><strong>Install on Kubernetes</strong><small>Operator guide / dependencies, Helm, sign-in and a verified first task</small></span><Icon name="arrowR" size={20} /></a>
    <div className="docs-start-context"><a href="#docs/vision-architecture">Why Harakiri exists<Icon name="arrowR" /></a><a href="#docs/sdk-cli">Install and connect<Icon name="arrowR" /></a></div>
    <h2>Understand the building blocks</h2>
    <dl className="docs-concept-map">
      <div><dt><Icon name="folder" />Template</dt><dd>The reusable image and defaults a runtime starts from.<a href="#docs/custom-templates">Prepare an environment</a></dd></div>
      <div><dt><Icon name="box" />Sandbox</dt><dd>The running environment, with processes and a bounded lifetime.<a href="#docs/sandbox-lifecycle">Understand lifecycle</a></dd></div>
      <div><dt><Icon name="file" />Workspace</dt><dd>Optional retained files that a later sandbox can reuse.<a href="#docs/workspaces">Understand persistence</a></dd></div>
    </dl>
    <p>Organization access, <a href="#docs/routes">preview routes</a>, <a href="#docs/outbound-access">outbound policy</a> and <a href="#docs/credential-vault">credentials</a> are separate controls. Begin with the <a href="#docs/security-model">security model</a> before handling sensitive data.</p>
    <p><a href="#docs/execution-capacity">Execution capacity</a> controls admission. <a href="#docs/usage-observations">Usage observations</a> explains the source-preview historical view, coverage and non-billing boundaries.</p>
    <h2>Build a complete workflow</h2>
    <ul className="docs-usecases">
      <li><a href="#docs/hands-on-tutorials"><strong>Learn the core operations</strong><span>Data jobs, private previews, Git, network policy and SDK integration.</span></a></li>
      <li><a href="#docs/cli-agent-repair"><strong>Repair code with an agent</strong><span>Use the CLI and OpenCode to fix a bug, then rerun unchanged tests.</span></a></li>
      <li><a href="#docs/ui-agent-app"><strong>Build an app from the dashboard</strong><span>Run an agent, inspect files and open a real preview.</span></a></li>
      <li><a href="#docs/sdk-agent-report"><strong>Integrate an artifact-producing worker</strong><span>Track a command and retrieve independently checked output through the SDK.</span></a></li>
    </ul>
    <p><a href="#demos">Watch the recorded workflows</a>, or follow <a href="#docs/persistent-workspaces">the workspace tutorial</a> to reuse files across sandbox lifetimes.</p>
    <h2>Integrate and operate</h2>
    <p>Use the <a href="#docs/api-reference">API reference</a> and <a href="#docs/cli-reference">CLI reference</a> for exact operations. Operators start with <a href="#docs/install-kubernetes">Kubernetes installation</a>, then <a href="#docs/backup-recovery">backup and recovery</a>, <a href="#docs/workspace-operations">storage operations</a> and <a href="#docs/errors-troubleshooting">error handling</a>.</p>
    <aside className="docs-notice"><p><strong>Choose your release deliberately.</strong> The recorded Developer Preview is <code>0.5.0-rc.9</code> on npm <code>next</code>, with matching server requirements. The older <code>latest</code> channel is 0.4.0. Check <a href="#docs/developer-preview">preview scope and prerequisites</a>; source changes are not available until published in a matching release or a documented component update.</p><p><a href="#changelog">Read the release notes</a></p></aside>
  </>
};

const QuickstartBody = () => {
  const [method, setMethod] = useState("CLI");
  return <>
    <h2>Before you start</h2>
    <p>No deployment yet? Follow <a href="#docs/install-kubernetes">Install on Kubernetes</a> first. Installing the SDK or CLI does not install the server or runtime.</p>
    <ul><li>A running Harakiri deployment, its API URL and an organization API key from the dashboard's <strong>API keys</strong> page.</li><li>A ready <code>python-3.12-data</code> template. Ask your operator for an equivalent Python template if the catalog differs.</li><li>Node.js 20 or newer on your machine. The shell example uses Bash. Python runs inside the sandbox, not on your machine.</li></ul>
    <p>The examples below pin <code>0.5.0-rc.9</code>, the recorded Developer Preview. Confirm your operator runs the matching API. Unversioned installs still select the older <code>0.4.0</code> stable channel. Review <a href="#docs/developer-preview">version and runtime limits</a> first.</p>
    <h2>Install and authenticate</h2>
    <p>Set <code>HARAKIRI_API_URL</code> to your deployment's control-plane API, not the dashboard URL. Provide <code>HARAKIRI_API_KEY</code> privately through your shell or secret manager. Keep that key on the caller's machine, out of sandbox files and source control.</p>
    <CodeBlock language="bash">{`export HARAKIRI_API_URL="https://sb-api.harakiri.io"
# HARAKIRI_API_KEY must already be set privately.`}</CodeBlock>
    <CodeTabs label="Install method" value={method} onValueChange={setMethod} examples={[
      { label: "CLI", language: "bash", code: `npm install -g @h-sandbox/cli@0.5.0-rc.9
harakiri login --api-url "$HARAKIRI_API_URL"
harakiri template list` },
      { label: "TypeScript", language: "bash", code: `# In a new example directory:
npm init -y
npm install --save-exact @h-sandbox/sdk@0.5.0-rc.9
npm install --save-dev tsx typescript @types/node` }
    ]} />
    <p>The CLI reads <code>HARAKIRI_API_KEY</code> and stores the connection in its local configuration. It reports a missing-key error if the variable is not set. The SDK reads the same environment variables directly.</p>
    <h2>Run your first task</h2>
    <p>This is a disposable task with a ten-minute TTL. The runtime is released after execution, with cleanup on failure as well. Run the shell example as <code>bash quickstart.sh</code>, or the TypeScript example as <code>npx tsx quickstart.mts</code>.</p>
    <CodeTabs label="Quickstart implementation" value={method} onValueChange={setMethod} examples={[
      { label: "CLI", language: "bash", filename: "quickstart.sh", code: quickstartCli },
      { label: "TypeScript", language: "typescript", filename: "quickstart.mts", code: quickstartTypeScript }
    ]} />
    <h2>Verify and clean up</h2>
    <p>The Python task prints <code>4</code>. The SDK also asserts the exit code and exact output. In the dashboard's sandbox history, confirm the runtime is terminated. The CLI's progress messages include the sandbox ID if you need to investigate.</p>
    <p>A failed or interrupted client does not prove the runtime has stopped. Inspect its state and retry cleanup if necessary. TTL is the safety net, not an unlimited execution budget. See <a href="#docs/sandbox-lifecycle">lifecycle and renewal</a> for longer tasks.</p>
    <dl className="docs-definitions"><div><dt>401 or 403</dt><dd>Check the API URL, key and organization permissions. Do not use a dashboard URL as the API endpoint.</dd></div><div><dt>Template unavailable</dt><dd>Inspect the deployment's template catalog and choose a ready Python image.</dd></div><div><dt>Creation pending or failed</dt><dd>Inspect the sandbox and lifecycle operation before retrying. Do not assume a timed-out request created nothing.</dd></div></dl>
    <h2>Next steps</h2>
    <p>Continue with <a href="#docs/cli-live-preview">a live application preview</a>, <a href="#docs/hands-on-tutorials">file and network workflows</a>, or <a href="#docs/cli-agent-repair">a real OpenCode task</a>. Each tutorial includes its own prerequisites, verification and cleanup.</p>
  </>;
};

export const quickstartDocs: DocPage = {
  id: "quickstart", section: "Getting started", title: "Quickstart",
  lede: "Create an isolated runtime, execute a Python task and terminate it. Choose the CLI or TypeScript path; both use the same Harakiri API.",
  toc: ["Before you start", "Install and authenticate", "Run your first task", "Verify and clean up", "Next steps"],
  body: <QuickstartBody />
};
