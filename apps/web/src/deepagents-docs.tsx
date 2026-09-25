import type { DocPage } from "./docs-content";
import { CodeBlock } from "./components/docs-code";

export const deepagentsFirstTask = `import { HarakiriClient } from "@h-sandbox/sdk";
import { withHarakiriSandbox } from "@h-sandbox/deepagents";

const client = HarakiriClient.fromEnv();
const template = process.env.HARAKIRI_TEMPLATE;
if (!template) throw new Error("Select an installed Linux template.");

const result = await withHarakiriSandbox(
  client, { template, ttlSeconds: 300 },
  async ({ backend }) => {
    const task = await backend.execute("printf 'hello from Harakiri\\\\n'");
    if (task.exitCode !== 0) throw new Error("Verification failed.");
    return task;
  }
);
console.log(result.output);
// The helper has confirmed termination and capacity release.`;

export const deepagentsAgentTask = `import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { HarakiriClient } from "@h-sandbox/sdk";
import { withHarakiriSandbox } from "@h-sandbox/deepagents";
import { createDeepAgent } from "deepagents";
import { initChatModel } from "langchain/chat_models/universal";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

const cwd = "/tmp/harakiri-repair";
const source = \`export function total(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}
\`;
const tests = \`import assert from 'node:assert/strict';
import test from 'node:test';
import { total } from './invoice.mjs';
test('empty invoice', () => assert.equal(total([]), 0));
test('quantity is included', () => {
  assert.equal(total([{price: 100, quantity: 3}]), 300);
});
test('multiple lines', () => {
  assert.equal(total([{price: 25, quantity: 2}, {price: 40, quantity: 1}]), 90);
});
\`;
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Model selection and credentials stay outside the execution sandbox. */
export async function repairRepository(
  client: HarakiriClient, model: BaseChatModel, template: string
) {
  return withHarakiriSandbox(
    client,
    { template, ttlSeconds: 600, egress: { mode: "blocked" } },
    async ({ sandbox, backend }) => {
      await sandbox.files.mkdir({ path: cwd, recursive: true });
      const uploaded = await backend.uploadFiles([
        [\`\${cwd}/invoice.mjs\`, new TextEncoder().encode(source)],
        [\`\${cwd}/invoice.test.mjs\`, new TextEncoder().encode(tests)]
      ]);
      assert.ok(uploaded.every(r => r.error === null), "Repository upload must succeed.");
      await sandbox.run([
        "git init -q", "git add .",
        "git -c user.name=Harakiri -c user.email=example@example.invalid commit -qm baseline"
      ].join(" && "), { cwd, check: true });
      const before = await sandbox.run("node --test invoice.test.mjs", { cwd });
      assert.notEqual(before.exitCode, 0, "The fixture must fail before the repair.");
      const originalTests = sha256(await sandbox.files.readBytes(\`\${cwd}/invoice.test.mjs\`));
      const agent = createDeepAgent({
        model, backend,
        systemPrompt: [
          \`Repair the invoice calculation in \${cwd}/invoice.mjs. Quantity must be included.\`,
          "Do not modify invoice.test.mjs. Use the sandbox tools;",
          "do not install dependencies or use the network."
        ].join(" "),
        subagents: [], memory: [], skills: []
      });
      await agent.invoke({ messages: [{
        role: "user", content: "Inspect the repository, fix the bug and run its tests."
      }] }, { recursionLimit: 30 });
      // The application checks the outcome, independently of the model's final message.
      assert.equal(
        sha256(await sandbox.files.readBytes(\`\${cwd}/invoice.test.mjs\`)),
        originalTests, "The test contract must remain unchanged."
      );
      const verified = await sandbox.run("node --test invoice.test.mjs", { cwd, check: true });
      const patch = await sandbox.run("git diff -- invoice.mjs", { cwd, check: true });
      assert.ok(patch.stdout.trim(), "Expected a patch to the implementation.");
      return { sandboxId: sandbox.id, testReport: verified.stdout, patch: patch.stdout };
    },
    { backend: { cwd, timeoutMs: 60_000 }, cleanupTimeoutMs: 90_000 }
  );
}

// Importing this file for tests does not create a sandbox or call a model.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const modelName = process.env.HARAKIRI_AGENT_MODEL;
  const template = process.env.HARAKIRI_TEMPLATE;
  if (!modelName || !template) {
    throw new Error("Set HARAKIRI_AGENT_MODEL and HARAKIRI_TEMPLATE before creating a sandbox.");
  }
  // Install your chosen LangChain model-provider package in this application.
  const model = await initChatModel(modelName);
  const result = await repairRepository(HarakiriClient.fromEnv(), model, template);
  console.log(result.testReport);
  console.log(result.patch);
  console.log(\`Verified and cleaned up sandbox \${result.sandboxId}.\`);
}`;

export const deepagentsDocs: DocPage = {
  id: "deepagents",
  section: "Integrations",
  title: "Deep Agents and LangGraph",
  navTitle: "Deep Agents",
  lede: "Let your framework plan the work. Run its shell and file tools in a Harakiri sandbox, with explicit ownership and recoverable task IDs.",
  toc: ["Your agent, Harakiri tools", "Installation", "Repair a repository", "Model-free smoke test", "Approval and reconnect", "Persistent workflows", "Ownership and failures", "Limits and evidence"],
  body: <>
    <h2>Your agent, Harakiri tools</h2>
    <aside className="docs-notice"><p><strong>Developer preview on npm.</strong> Install <code>@h-sandbox/deepagents@next</code> with SDK 0.5.0-rc.11 and Deep Agents 1.14.0. Native tools and an independently verified model repair have passed. The adapter is independently versioned; these preview contracts are not a stable compatibility promise.</p></aside>
    <p><code>@h-sandbox/deepagents</code> is an optional TypeScript sandbox backend for <a href="https://docs.langchain.com/oss/javascript/deepagents/sandboxes">Deep Agents</a>, built on LangChain and LangGraph. It reuses the framework's tools through the public Harakiri SDK. It does not replace your agent, select a model or connect directly to a runtime provider.</p>
    <p>Start with the normal Deep Agents SDK. Attach a Harakiri backend to send the framework's file and shell tools to your sandbox. The integration point is <code>backend</code>:</p>
    <CodeBlock language="typescript" filename="The integration point">{`import { createDeepAgent } from "deepagents";
import { HarakiriSandboxBackend } from "@h-sandbox/deepagents";

// model and a ready, application-owned sandbox are supplied by your app.
const agent = createDeepAgent({
  model,
  backend: new HarakiriSandboxBackend(sandbox)
});`}</CodeBlock>
    <table className="docs-data-table"><caption>Integration responsibilities</caption><thead><tr><th scope="col">Layer</th><th scope="col">Responsibility</th></tr></thead><tbody>
      <tr><td>Your application</td><td>Identity, model selection, authorized task mapping, checkpoints and outcome verification</td></tr>
      <tr><td>Deep Agents / LangGraph</td><td>Planning, tool calls, approval and graph state</td></tr>
      <tr><td>Harakiri</td><td>Sandbox execution, files, lifecycle, capacity and runtime policy</td></tr>
    </tbody></table>
    <p>Model calls stay in your trusted application. Shell and file operations run in the selected sandbox. Model credentials and the Harakiri API key do not need to enter that sandbox. The core SDK, API, CLI and dashboard do not depend on LangChain.</p>
    <p>This is a <strong>sandbox-backed agent</strong>, not an agent process hosted inside a sandbox. Planning, model requests and checkpoints stay in your application. Custom tools that you register yourself are not automatically sandboxed: a local filesystem or shell callback still runs on your application host.</p>

    <h2>Installation</h2>
    <p>Use Node 22 LTS for the published preview. Node 24 LTS is also included in the source compatibility matrix; Node 20 is retained as a legacy check, not a recommendation for new applications. Install the adapter and SDK directly from npm; no repository checkout or local build is required for the published examples. The tested peers are exactly SDK 0.5.0-rc.11 and Deep Agents 1.14.0; SDK rc.10 is not compatible.</p>
    <p>The backend integration needs three direct packages. <code>--save-exact</code> records the concrete version resolved from <code>next</code>; commit your application's lockfile.</p>
    <CodeBlock language="bash" filename="Minimal integration">{`npm install --save-exact @h-sandbox/deepagents@next @h-sandbox/sdk@0.5.0-rc.11 deepagents@1.14.0`}</CodeBlock>
    <p>The full repair example also imports model and framework APIs directly. Declare this complete dependency set together in a clean application, especially with pnpm; do not mix independent framework version ranges or bypass peer errors.</p>
    <CodeBlock language="bash" filename="Install in your application">{`npm install --save-exact @h-sandbox/deepagents@next @h-sandbox/sdk@0.5.0-rc.11 \\
  deepagents@1.14.0 langchain@1.5.11 @langchain/core@1.2.12 \\
  @langchain/langgraph@1.4.17 langsmith@0.9.0 zod@4.4.3
npm install --save-dev tsx
export HARAKIRI_API_URL="https://sandbox-api.example.com"
export HARAKIRI_TEMPLATE="your-linux-template"
# Supply HARAKIRI_API_KEY through your private server configuration.`}</CodeBlock>
    <p>Use an expiring service key with <code>sandboxes:read</code> and <code>sandboxes:write</code>. Select a Linux template containing bash and GNU file tools; add Python 3 or Node.js for your task. Repository repair also needs Git. This package is server-side only: never expose the control-plane key in browser code.</p>

    <h2>Repair a repository</h2>
    <p>The agent receives a tiny repository with a real bug: invoice totals ignore quantity. It must inspect the code, repair the implementation and run the tests. Your application verifies that the tests were not changed, reruns them and retrieves the diff before reporting success. This is one executable file, not a launcher hiding the agent in another module.</p>
    <p>Choose a tool-capable model and install its LangChain integration package in the application. <code>HARAKIRI_AGENT_MODEL</code> is explicit; there is no paid-model default. Configure that provider's URL and credentials in the application, outside the sandbox. Its integration must support the framework's text-block tool results.</p>
    <p><code>@langchain/ollama@1.3.0</code> rejects text-block tool results and is not a drop-in choice for this example. The <a href="https://github.com/nabilblk/h-sandbox/blob/main/infra/sdk-acceptance/README.md">self-hosted Ollama acceptance harness</a> applies strict text-only normalization and disables extended thinking. That compatibility handling is not part of the adapter. The exported <code>repairRepository(client, model, template)</code> accepts your configured model directly.</p>
    <p>Select a template with Node.js, Git, bash and GNU file tools, on an installation supporting enforced blocked egress. The example installs nothing inside the sandbox. Blocked sandbox egress does not block model calls from your application. Local-model availability, tool quality and zero cost are not guaranteed.</p>
    <CodeBlock language="bash" filename="Run the agent example">{`# Install and configure your chosen model provider in this application first.
export HARAKIRI_AGENT_MODEL="provider:your-tool-capable-model"
npx tsx run-repair.ts
# From the reviewed repository instead:
# pnpm --filter @h-sandbox/deepagents exec tsx examples/run-repair.ts`}</CodeBlock>
    <CodeBlock language="typescript" filename="run-repair.ts">{deepagentsAgentTask}</CodeBlock>
    <p><code>withHarakiriSandbox()</code> creates one sandbox, waits for readiness and supplies its backend to <code>createDeepAgent()</code>. It confirms termination and capacity release before returning. The expected result is three passing tests, an implementation diff including quantity, and the cleaned-up sandbox ID. The initial failing test run is deliberate.</p>
    <p>The <a href="https://github.com/nabilblk/h-sandbox/blob/main/packages/deepagents/examples/run-repair.ts">runnable source</a> and displayed program are checked for equality. Contract tests invoke its real Deep Agents graph with scripted decisions and test verification failures and cleanup. On September 24, the isolated amd64 <a href="https://github.com/nabilblk/h-sandbox/actions/runs/36032828432">qualification run passed all 15 gates</a>, including native shell, file, search, reconnect and key revocation checks. Digest-pinned Qwen3 4B Instruct completed the real-model repair: unchanged original tests, independently verified results, an implementation diff and confirmed cleanup. Runtime qualification and registry publication are separate checks. The <a href="https://github.com/nabilblk/h-sandbox/actions/runs/36034957121">rc.1 publication run</a> published through GitHub Trusted Publishing and verified anonymous installation on Node 20 and 22. The <a href="https://github.com/nabilblk/h-sandbox/blob/main/docs/release-notes/deepagents-0.1.0-delivery.md">delivery receipt</a> records source, artifact identity and publication evidence.</p>
    <p>One small repair is not a model-quality benchmark. Production jobs should verify artifacts independently of an agent's final message; graph state, prompts and tool output can contain sensitive data.</p>

    <h2>Model-free smoke test</h2>
    <p>Use this smaller diagnostic to isolate connection, permissions or runtime problems from model behavior. It is not an agent example: it executes one fixed shell command without calling an LLM. Run it with <code>npx tsx first-tools.mts</code>; the expected output is <code>hello from Harakiri</code>.</p>
    <CodeBlock language="typescript" filename="first-tools.mts">{deepagentsFirstTask}</CodeBlock>
    <p><code>execute()</code> returns output, exit code, truncation status and a command reference. A nonzero shell exit is a tool result. A transport, authorization or observation failure is an exception, not a fabricated shell result. A timeout or killed command retains its nullable exit code and includes a termination notice visible to the agent.</p>

    <h2>Approval and reconnect</h2>
    <p>A long-lived or checkpointed agent should borrow an application-owned sandbox. Resolve its ID from an authenticated tenant/thread record. A caller-provided ID is not an authorization decision.</p>
    <CodeBlock language="typescript" filename="Borrow a sandbox">{`import { HarakiriSandboxBackend } from "@h-sandbox/deepagents";

// client and job come from your trusted application context.
const sandbox = await client.sandboxes.connect(job.sandboxId);
await sandbox.wait({ timeoutMs: 180_000 });
const backend = new HarakiriSandboxBackend(sandbox, {
  onCommandStarted: async (reference) => {
    await jobs.saveCommand(job.id, reference);
  }
});
// new HarakiriSandboxBackend never creates or destroys the sandbox.`}</CodeBlock>
    <p>Persist only resource references, not clients, handles or secrets. When an acknowledged command's wait fails, <code>HarakiriExecutionError.reference</code> retains its sandbox and command IDs. Reconnect and call <code>backend.observe(reference)</code> to retrieve that task without submitting it again. If submission itself lost its response, the result is ambiguous; do not blindly retry.</p>
    <p>The secondary, model-free <a href="https://github.com/nabilblk/h-sandbox/blob/main/packages/deepagents/examples/checkpointed-task.ts">LangGraph example</a> demonstrates lifecycle recovery, not agent reasoning. It submits outside the resumable graph, interrupts before observation, then resolves the same sandbox after approval. Its runnable driver recreates the graph with <code>MemorySaver</code> in one process. Production restart recovery requires a persistent checkpointer and an authorized resolver. Neither graph checkpoints nor this adapter provide exactly-once arbitrary shell effects.</p>
    <p>Do not wrap a real approval pause in <code>withHarakiriSandbox()</code>: a paused graph returns control and would trigger cleanup. Checkpoint state and sandbox storage also have different lifetimes. Use <a href="#docs/workspaces">retained workspaces</a> explicitly when files must outlive a runtime.</p>

    <h2>Persistent workflows</h2>
    <aside className="docs-notice"><p><strong>Unreleased source example.</strong> The <a href="https://github.com/nabilblk/h-sandbox/blob/main/docs/integrations/reliable-framework-workflows.md">Reliable Framework Workflows guide</a> adds persistent approvals and worker recovery. Build the SDK and adapter from the same reviewed source checkout. The request controls below are not in SDK rc.11 or adapter rc.1; installing the current npm preview alone does not enable them.</p></aside>
    <p>The example uses the real <code>createDeepAgent()</code> API and LangGraph's official <code>PostgresSaver</code>. Your application owns the checkpoint database, authenticated tenant/thread mapping and approvals. Harakiri owns sandbox execution and retained files. PostgreSQL remains an application dependency, not a dependency of the core SDK or the installed adapter.</p>
    <ol>
      <li>Bind an application-authorized, ready sandbox to the authenticated tenant and thread. Retained files need an explicitly attached workspace.</li>
      <li>Run the agent until a shell or file mutation needs approval. Persist the graph and exit the worker.</li>
      <li>Inspect the proposed action. A new worker approves or rejects that exact checkpoint ID. Stale approvals and concurrent invocations fail closed.</li>
      <li>After a worker crash, inspect recorded command references and observe acknowledged work without submitting it again.</li>
      <li>If the runtime expired, wait for confirmed termination and available storage before explicitly creating a replacement for file recovery. Never transfer old command IDs or automatically replay the old graph.</li>
    </ol>
    <CodeBlock language="bash" filename="Separate worker invocations">{`# Complete the source guide's private database, model and sandbox setup first.
pnpm --filter @h-sandbox/deepagents exec tsx examples/run-durable.ts bind
pnpm --filter @h-sandbox/deepagents exec tsx examples/run-durable.ts start
pnpm --filter @h-sandbox/deepagents exec tsx examples/run-durable.ts inspect
# Review the pending action, then use its exact checkpointId.
export WORKFLOW_CHECKPOINT_ID="the-checkpoint-you-reviewed"
pnpm --filter @h-sandbox/deepagents exec tsx examples/run-durable.ts approve
# Use reject instead of approve to decline the pending action.`}</CodeBlock>
    <p>There is no transaction spanning a remote shell effect and a graph checkpoint. An invocation left in an uncertain state requires reconciliation, not automatic retry. Application callbacks, model calls and database operations need their own deadlines. Checkpoint data and tool arguments may be sensitive; keep the database private and never serialize SDK clients or API keys into graph state.</p>
    <table className="docs-data-table"><caption>Four independent budgets in the unreleased source</caption><thead><tr><th scope="col">Budget</th><th scope="col">Meaning</th></tr></thead><tbody>
      <tr><td><code>requestTimeoutMs</code></td><td>One SDK JSON request, including its response body. Default 120 seconds; no automatic replay.</td></tr>
      <tr><td><code>timeoutMs</code></td><td>The runtime's execution limit for a command.</td></tr>
      <tr><td><code>observationTimeoutMs</code></td><td>Adapter waiting for completion and final logs. Local cancellation does not kill the task.</td></tr>
      <tr><td><code>ttlSeconds</code></td><td>Sandbox lifetime, independent of a paused graph or application worker.</td></tr>
    </tbody></table>
    <p>Real PostgreSQL tests exercise separate worker processes, approval/rejection, stale decisions, crash recovery, tenant boundaries and expiry responses. API/runtime responses in those tests are synthetic. A separate disposable native-runtime gate covers real expiry and retained-file recovery; its presence in CI is not evidence of a successful run.</p>

    <h2>Ownership and failures</h2>
    <table className="docs-data-table"><caption>Lifecycle and failure handling</caption><thead><tr><th scope="col">Situation</th><th scope="col">Behavior</th></tr></thead><tbody>
      <tr><td>Borrowed backend</td><td>No create, resume, policy change or implicit termination</td></tr>
      <tr><td>Disposable task helper</td><td>Waits for readiness, cleans up on task/readiness failure, confirms termination and capacity release</td></tr>
      <tr><td>Caller abort or polling timeout</td><td>Observation stops; remote work may continue. Reconnect by IDs</td></tr>
      <tr><td>Unconfirmed cleanup</td><td><code>HarakiriTaskCleanupError</code> retains the sandbox ID and both workload and cleanup failures</td></tr>
      <tr><td>Partial file batch</td><td>Per-path errors where representable; fatal failures, including cancellation between files, retain earlier successful paths and the cause</td></tr>
    </tbody></table>
    <p>The helper rejects caller idempotency keys and create-time Git source so it cannot silently take ownership of a recovered resource. Prepare Git after readiness, or manage the sandbox explicitly. After a cleanup timeout, <code>sandbox.waitForTermination()</code> observes without another DELETE. TTL and application reconciliation remain necessary after a process crash.</p>

    <h2>Limits and evidence</h2>
    <p>A working directory is not a filesystem jail. Shell tools can access the runtime's permitted filesystem; do not share a sandbox across untrusted tenants. Upstream edits are read/modify/write and need serialization when writers conflict.</p>
    <p>Logs default to 64 KiB of combined UTF-8 text, stdout followed by stderr. A fixed termination notice is added outside that budget so even a tiny log limit cannot hide failure. Grep keeps complete matches only when output is clipped and reports incomplete results; narrow the search or increase the backend's byte limit. The pinned framework's generic incomplete-search note mentions match counts even when the byte limit was responsible.</p>
    <p>Files use checksum-verified buffered transfers, not streaming. Batches are sequential, at most 64 paths and 32 MiB decoded by default; runtime per-file limits still apply.</p>
    <p>In the published adapter rc.1, remote execution, status polling and sandbox TTL are separate budgets; the polling deadline excludes log download. Configure bounded Fetch when that version needs a per-request deadline. The unreleased request controls above bound body reads and include final logs in the observation budget. Neither version treats cancellation as proof that a remote command stopped. Streaming and route-fetch APIs retain their own controls.</p>
    <p>Tests exercise the actual Deep Agents and LangGraph libraries with scripted model decisions and synthetic API responses. Installed-tarball checks compile consumer examples and run contracts from clean npm and pnpm applications. Source CI is configured for Node 22/24 and legacy Node 20, plus a weekly upstream compatibility probe that does not publish or silently widen supported versions. Native runtime and real-model acceptance are separate gates, not implied by these tests.</p>
    <p>The <a href="https://github.com/nabilblk/h-sandbox/blob/main/docs/integrations/deepagents.md">technical guide</a> includes an explicitly gated native acceptance command, architecture, failure contracts and the publication checklist. This is a client integration: installing the package does not change your cluster or runtime profile. This page is also available as <a href="/docs/deepagents.md">Markdown</a>.</p>
  </>
};
