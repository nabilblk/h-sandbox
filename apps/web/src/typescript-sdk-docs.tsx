import type { DocPage } from "./docs-content";
import { CodeBlock } from "./components/docs-code";

export const sdkFirstTask = `import { HarakiriClient } from "@h-sandbox/sdk";

const client = HarakiriClient.fromEnv();
const sandbox = await client.sandboxes.create({
  template: process.env.HARAKIRI_TEMPLATE ?? "python-3.12",
  ttlSeconds: 600,
  wait: false
});

try {
  await sandbox.wait({ timeoutMs: 180_000 });
  await sandbox.files.write("hello.py", "print(6 * 7)\\n");
  const result = await sandbox.run("python3 hello.py", { check: true });
  console.log(result.stdout); // 42
} finally {
  await sandbox.kill({ wait: true, timeoutMs: 90_000 });
}`;

export const sdkProcess = `const task = await sandbox.processes.start({
  command: "python3 -u worker.py",
  timeoutMs: 120_000
});
const reference = task.reference;
// Persist { sandboxId, commandId } in your application job record.

const connected = await client.sandboxes.connect(reference.sandboxId);
const observer = await connected.processes.connect(reference.commandId);
for await (const event of observer.events({
  signal: AbortSignal.timeout(130_000)
})) {
  if (event.type === "output") {
    process.stdout.write(event.stdout);
    process.stderr.write(event.stderr);
  }
}
const completed = await observer.wait({ timeoutMs: 130_000 });`;

export const typescriptSdkDocs: DocPage = {
  id: "typescript-sdk",
  section: "Getting started",
  title: "TypeScript SDK",
  lede: "One sandbox object for execution, files and services. Explicit resource IDs for reconnect and recovery.",
  toc: ["Availability", "Connect", "First task", "Processes and reconnect", "Files and artifacts", "Protected services", "Retained workspaces", "Git and agents", "Failure and cleanup", "Compatibility", "Recipes and evidence"],
  body: <>
    <h2>Availability</h2>
    <aside className="docs-notice"><p><strong>Unreleased SDK candidate.</strong> The conveniences on this page are not in the published <code>@h-sandbox/sdk@0.5.0-rc.10</code> package. Use a candidate tarball to evaluate them. The <a href="#docs/sdk-cli">published SDK and CLI guide</a> remains the installation path for the released API.</p></aside>
    <p>The candidate targets Node.js 20 or newer and Harakiri API 0.5.0-rc.9 or newer with execution readiness and capacity admission. Templates must exist in your installation; retained workspaces also require operator-enabled storage. This is a server-side SDK, not a way to expose control-plane keys to a browser.</p>
    <h2>Connect</h2>
    <p>Install the candidate archive in your application. Set <code>SDK_TARBALL</code> to its actual path, not to the released npm package. Building the archive from a reviewed checkout requires the repository's Node 22 tooling.</p>
    <CodeBlock language="bash" filename="Install the candidate">{`# In a reviewed source checkout:
pnpm install --frozen-lockfile
pnpm --filter @h-sandbox/sdk build
pnpm --filter @h-sandbox/sdk pack --pack-destination /tmp/harakiri-sdk-candidate

# In your application, using the resulting archive path:
npm install "$SDK_TARBALL"
npm install --save-dev tsx
export HARAKIRI_API_URL="https://sandbox-api.example.com"
export HARAKIRI_TEMPLATE="python-3.12"
# Supply HARAKIRI_API_KEY through your secret manager or private environment.`}</CodeBlock>
    <p><code>HarakiriClient.fromEnv()</code> validates the API URL and key. It never falls back to a maintainer deployment. The explicit constructor and <code>fromEnv({"{ env, fetch }"})</code> remain available for application configuration and testing.</p>
    <p>Use an expiring service key with <code>sandboxes:read</code> and <code>sandboxes:write</code> for execution, files and routes. Add <code>templates:read</code> for discovery, <code>workspaces:read</code> and <code>workspaces:write</code> for retained storage, or <code>org:read</code> for capacity. See <a href="#docs/authorization">authorization and API keys</a>.</p>
    <h2>First task</h2>
    <p>This complete example creates once, waits for execution health, writes a Python file, checks its result and confirms cleanup. Run it with <code>npx tsx first-task.mts</code>. The selected template must include Python 3.</p>
    <CodeBlock language="typescript" filename="first-task.mts">{sdkFirstTask}</CodeBlock>
    <p>The expected output is <code>42</code>. Relative file paths and the new command overload use the runtime's advertised working directory. Creation is intentionally asynchronous here so the accepted sandbox is available for cleanup even if readiness times out.</p>
    <p><code>sandbox.run(command)</code> returns stdout, stderr and exit code directly. With <code>check: true</code>, a nonzero exit throws <code>HarakiriRunError</code> carrying that result. The command is a shell string, not a native argv array. Do not concatenate untrusted inputs into shell code.</p>
    <h2>Processes and reconnect</h2>
    <p>Use a process for background work and live output. Upload <code>worker.py</code> first, start it once, then persist its reference. A different worker can reconnect with those IDs and its own scoped credentials. Submission does not mean completion.</p>
    <CodeBlock language="typescript" filename="Observe a durable process">{sdkProcess}</CodeBlock>
    <p>Save the last consumed <code>event.cursor</code> and pass it to <code>observer.events({"{ cursor, signal }"})</code> when reconnecting. Closing the iterator or cancelling its signal only disconnects the observer. Call <code>task.kill()</code> to request remote termination. Process waits target success by default; failed or killed outcomes throw <code>HarakiriCommandEndedError</code>.</p>
    <p><code>task.logs()</code> preserves the log response and cursor metadata. The command summary is not a complete log archive. An unreplayable cursor or unavailable stream remains an explicit error; reconnect never resubmits the command.</p>
    <h2>Files and artifacts</h2>
    <CodeBlock language="typescript" filename="Text and bytes">{`await sandbox.files.write("input.txt", "ordinary text");
await sandbox.files.write("input.bin", new Uint8Array([0, 128, 255]));
const text = await sandbox.files.readText("input.txt");
const bytes = await sandbox.files.readBytes("input.bin");`}</CodeBlock>
    <p>Binary conversion stays inside the SDK. Byte helpers check the advertised size limit, byte count and SHA-256. Transfers still buffer the existing JSON/base64 protocol; this is not large-file streaming. Use absolute paths when location matters, and keep retained files under <code>/workspace</code>.</p>
    <h2>Protected services</h2>
    <p>A ready sandbox does not imply that your HTTP server is listening. Start a server bound to <code>0.0.0.0</code>, expose its port, and wait for an application response. This fragment assumes a Python template and the <code>input.txt</code> file from above.</p>
    <CodeBlock language="typescript" filename="Token-protected HTTP">{`const server = await sandbox.processes.start({
  command: "python3 -m http.server 8088 --bind 0.0.0.0",
  timeoutMs: 120_000
});
const route = await sandbox.routes.expose({
  port: 8088,
  accessMode: "token"
});
try {
  const health = await route.waitForHttp({
    path: "/input.txt", timeoutMs: 30_000
  });
  await health.body?.cancel();
  const response = await route.fetch("/input.txt");
  console.log(await response.text());
} finally {
  try { await route.delete(); }
  finally { await server.kill(); }
}`}</CodeBlock>
    <p><code>route.fetch()</code> attaches route authentication, never the control-plane API key. It preserves standard Request semantics and restricts requests to the route's origin and path subtree. Redirects are manual, even if a caller requests native <code>follow</code>. Inspect the destination before another scoped request; health checks do not treat redirects as success.</p>
    <p>The URL alone will not authorize a browser. Never log a route handle or its token. Legacy exposure defaults are still public for compatibility, so always choose <code>accessMode</code>. For an HTTP-based agent SDK, <code>route.createFetch({"{ basicAuth }"})</code> supplies a scoped Fetch adapter.</p>
    <h2>Retained workspaces</h2>
    <p>Storage and runtime have different lifetimes. Create a workspace, attach one sandbox, save a checkpoint, then confirm termination and workspace availability before attaching a replacement. This is a lifecycle fragment; the full recipe below cleans up both runtimes on failures.</p>
    <CodeBlock language="typescript" filename="Replace the runtime, retain the files">{`const workspace = await client.workspaces.create({ name: "checkpoints" });
const first = await client.sandboxes.create({
  template: "python-3.12", workspaceId: workspace.id
});
await first.files.write("/workspace/checkpoint.txt", "step 1");
await first.kill({ wait: true });
await workspace.wait({ timeoutMs: 90_000 });

const second = await client.sandboxes.create({
  template: "python-3.12", workspaceId: workspace.id
});
try {
  console.log(await second.files.readText("/workspace/checkpoint.txt"));
} finally {
  await second.kill({ wait: true });
  await workspace.wait();
  await workspace.archive();
}`}</CodeBlock>
    <p><code>client.workspaces.connect(id)</code> observes existing storage. <code>recovery_required</code> is not permission to silently create another workspace. Archival does not physically delete storage. Read <a href="#docs/workspaces">the workspace lifecycle</a> before building retention policies.</p>
    <h2>Git and agents</h2>
    <p>Harakiri supplies execution and lifecycle control, not an agent framework. Use a template with the required tools, prepare a repository with <code>sandbox.git.clone()</code>, then run your agent as finite or background work. OpenCode requires an explicitly selected model and appropriate network access; free-model availability is not an SDK guarantee.</p>
    <p>Create-time Git <code>source</code> is still client orchestration. A recorded ready source is not cloned again; cloning or failed checkpoints require explicit recovery. It is not distributed exactly-once bootstrap. For recoverable jobs, separate sandbox creation, repository preparation and agent execution. The <a href="https://github.com/nabilblk/h-sandbox/tree/main/examples/sdk-opencode-headless">headless OpenCode recipe</a> shows the command, quoting and optional verification task.</p>
    <h2>Failure and cleanup</h2>
    <table><thead><tr><th>Outcome</th><th>Application action</th></tr></thead><tbody>
      <tr><td><code>HarakiriRunError</code></td><td>Inspect exit code and output. No automatic command replay.</td></tr>
      <tr><td><code>HarakiriWaitTimeoutError</code> or caller abort</td><td>Observation ended; remote work may still run. Reconnect by resource ID.</td></tr>
      <tr><td><code>HarakiriSandboxCreationError</code></td><td>Creation was acknowledged. Retain <code>sandboxId</code>, <code>operation</code>, <code>stage</code> and cleanup outcome; inspect that sandbox.</td></tr>
      <tr><td><code>409 organization_capacity_exceeded</code></td><td>Wait for an available execution slot before creating a new intent.</td></tr>
      <tr><td><code>503 organization_capacity_unavailable</code></td><td>Inventory needs recovery. Do not hot-loop new creates.</td></tr>
    </tbody></table>
    <p>Execution <code>timeoutMs</code>, observation <code>timeoutMs</code> and sandbox <code>ttlSeconds</code> are separate budgets. Polling deadlines include requests and delays. Cancellation does not kill remote work or extend TTL.</p>
    <p><code>kill()</code> requests deletion. <code>kill({"{ wait: true }"})</code> additionally confirms this sandbox is terminated and its capacity is released, not that the whole organization is idle. After a timeout, <code>sandbox.waitForTermination()</code> resumes read-only confirmation without repeating DELETE. Workspace detachment is a separate observation.</p>
    <p>A lost command-submission response is ambiguous without a server deduplication contract. An API error's <code>retryable</code> flag is not authorization to replay mutations. Source cleanup is not performed for caller-supplied idempotency keys, which may resolve an existing sandbox.</p>
    <h2>Compatibility</h2>
    <table><thead><tr><th>Existing call</th><th>Candidate convenience</th></tr></thead><tbody>
      <tr><td><code>sandbox.run({"{ command }"})</code> keeps <code>{"{ result }"}</code></td><td><code>sandbox.run(command, options)</code> returns the result directly</td></tr>
      <tr><td><code>files.write({"{ path, content }"})</code> keeps <code>{"{ file }"}</code></td><td><code>files.write(path, textOrBytes)</code></td></tr>
      <tr><td>Process <code>.command</code>, route <code>.route</code>, workspace <code>.workspace</code> remain</td><td>Handles add methods and IDs, not plain-object prototype compatibility</td></tr>
      <tr><td><code>client.listSandboxes("?status=running")</code> remains valid</td><td><code>client.sandboxes.list({"{ status: \"running\" }"})</code> is typed</td></tr>
    </tbody></table>
    <p><code>commands.run</code> remains a submission alias, not a completion helper. Legacy <code>getUrl</code> and <code>getHost</code> create public exposures; use explicit <code>routes.expose()</code> followed by <code>route.url</code>. Handle methods, checked errors, stricter deadlines and manual redirects require a deliberate preview migration.</p>
    <h2>Recipes and evidence</h2>
    <p>Complete examples cover <a href="https://github.com/nabilblk/h-sandbox/tree/main/examples/sdk-typescript-quickstart">finite tasks</a>, <a href="https://github.com/nabilblk/h-sandbox/tree/main/examples/sdk-files">binary files</a>, <a href="https://github.com/nabilblk/h-sandbox/tree/main/examples/sdk-sandbox-object">process reconnect</a>, <a href="https://github.com/nabilblk/h-sandbox/tree/main/examples/sdk-dev-server">protected HTTP</a> and <a href="https://github.com/nabilblk/h-sandbox/tree/main/examples/sdk-persistent-workspace">retained workspaces</a>. Use examples from the same reviewed candidate checkout as the archive.</p>
    <p>The <a href="https://github.com/nabilblk/h-sandbox/actions/workflows/sdk-acceptance.yml">SDK acceptance workflow</a> tests installed tarballs on Node 20 and 22, then runs model-free workflows against a disposable native amd64 installation. A passing run is required evidence, not a claim that every provider or LLM was tested. Package publication and independent integration feedback remain separate release gates.</p>
    <p>The <a href="https://github.com/nabilblk/h-sandbox/blob/main/docs/sdk-developer-experience.md">technical migration guide</a> contains the full contract and known boundaries. This page is also available as <a href="/docs/typescript-sdk.md">Markdown</a>.</p>
  </>
};
