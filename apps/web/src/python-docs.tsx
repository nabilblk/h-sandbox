import type { DocPage } from "./docs-content";
import { CodeBlock } from "./components/docs-code";
import { pythonExamples } from "./python-doc-snippets";

const source = "https://github.com/nabilblk/h-sandbox/tree/main";

export const pythonSdkDocs: DocPage = {
  id: "python-sdk",
  section: "Getting started",
  title: "Python SDK",
  navTitle: "Python SDK",
  lede: "Run a task, inspect its result and release its runtime. Typed Python clients for your Harakiri installation, with no framework dependency.",
  toc: ["Start with one task", "Configuration", "Choose ownership", "Commands and files", "Asyncio", "Recover without replay", "Limits and qualification"],
  body: <>
    <h2>Start with one task</h2>
    <aside className="docs-notice"><p><strong>Unreleased Python candidate.</strong> SDK <code>h-sandbox==0.1.0rc1</code> is being qualified. PyPI publication is pending. The source installation below is distinct from the <a href="#docs/typescript-sdk">published TypeScript SDK</a>.</p></aside>
    <p>Use Python 3.11 or newer. The core package calls the Harakiri API; it does not need Node, Kubernetes credentials, a provider SDK or LangChain. Start from the <a href={`${source}/docs/python-sdk.md`}>candidate source</a>.</p>
    <CodeBlock language="bash" filename="From the repository root">{`uv sync --project python --frozen
# Or install only the framework-free SDK:
python -m pip install ./packages/python-sdk`}</CodeBlock>
    <CodeBlock language="python" filename="one_task.py">{`import os
from harakiri import HarakiriClient

with HarakiriClient.from_env() as client:
    with client.sandboxes.task(
        template=os.environ["HARAKIRI_TEMPLATE"]
    ) as sandbox:
        result = sandbox.run("printf 'Hello from Python'", check=True)
        print(result.stdout)
        sandbox.files.write("result.txt", result.stdout)
        assert sandbox.files.read_text("result.txt") == result.stdout`}</CodeBlock>
    <p>The task context waits for execution readiness before yielding. On exit it confirms runtime termination and capacity release. The model is optional: this first task uses none.</p>

    <h2>Configuration</h2>
    <CodeBlock language="bash" filename="Application environment">{`export HARAKIRI_API_URL=https://your-api.example.com
export HARAKIRI_TEMPLATE=your-installed-template
# Supply HARAKIRI_API_KEY through private application configuration.`}</CodeBlock>
    <p>Your operator provides the API origin, an installed template and an expiring key. Basic operations use <code>sandboxes:read</code>, <code>sandboxes:write</code> and <code>templates:read</code>. Workspace operations require workspace scopes; capacity inspection needs <code>org:read</code>. No public account or template catalog is assumed.</p>
    <p>Explicit constructors also accept <code>request_timeout</code>, <code>ca_bundle</code>, <code>trust_env</code> and <code>max_response_bytes</code>. TLS verification is on, redirects are not followed, and proxy environment variables are ignored unless opted in. Model keys are not forwarded into a sandbox.</p>

    <h2>Choose ownership</h2>
    <table><thead><tr><th>Operation</th><th>Lifetime</th></tr></thead><tbody>
      <tr><td><code>sandboxes.task(...)</code></td><td>Owned disposable task; bounded cleanup on success or failure.</td></tr>
      <tr><td><code>sandboxes.create(...)</code></td><td>Application-owned sandbox; explicit cleanup or TTL.</td></tr>
      <tr><td><code>sandboxes.connect(id)</code></td><td>Borrowed handle; does not create or extend the runtime.</td></tr>
      <tr><td>Client context exit</td><td>Closes HTTP resources, not sandboxes or retained workspaces.</td></tr>
    </tbody></table>
    <p>CPU and memory come from the selected template. A retained workspace stores files, not process memory. Archive it explicitly after detachment. See <a href="#docs/workspaces">Workspaces</a>.</p>

    <h2>Commands and files</h2>
    <p><code>run(..., check=True)</code> rejects unsuccessful execution. For tracked work, start a detached command and persist the acknowledged reference before observation.</p>
    <CodeBlock language="python" filename="Tracked work">{`process = sandbox.processes.start(
    "python3 job.py", timeout=60, on_started=persist_reference
)
observed = process.observe(timeout=90)
print(observed.command.exit_code, observed.command.finish_reason)
print(observed.logs.stdout)

sandbox.files.write("report.bin", b"verified bytes")
assert sandbox.files.read_bytes("report.bin") == b"verified bytes"`}</CodeBlock>
    <p><code>persist_reference</code> is an application callback that durably saves the sandbox and command IDs. The <a href={`${source}/examples/python-workflow-recovery`}>complete recovery example</a> provides one. Relative file paths use the sandbox's POSIX working directory, including on Windows clients.</p>

    <h2>Asyncio</h2>
    <p>Use <code>AsyncHarakiriClient</code> inside an event loop. Its resources have the same typed operations with <code>await</code>. Use <code>async with</code> for both client and owned task. No synchronous network call is hidden inside an async method.</p>
    <CodeBlock language="python" filename="Async task">{`async with AsyncHarakiriClient.from_env() as client:
    async with client.sandboxes.task(template=template) as sandbox:
        result = await sandbox.run("printf async", check=True)
        print(result.stdout)`}</CodeBlock>

    <h2>Recover without replay</h2>
    <p>Local observation timeout is not a remote kill. Reconnect to the saved command; do not repeat the command or prompt. A lost submission response means the outcome is unknown. Accepted-but-not-ready creation retains a sandbox identity; uncertain cleanup remains an error, not silent success.</p>
    <table><thead><tr><th>Failure</th><th>Next action</th></tr></thead><tbody>
      <tr><td>401 / 403</td><td>Correct the key, scope or organization binding.</td></tr>
      <tr><td><code>CapacityError</code></td><td>Inspect typed capacity and wait for confirmed release.</td></tr>
      <tr><td><code>SandboxCreationError</code></td><td>Retain the acknowledged sandbox ID and inspect readiness.</td></tr>
      <tr><td><code>RunError</code> / remote timeout</td><td>Inspect the result's exit code and finish reason; partial output is not completion.</td></tr>
      <tr><td><code>RequestTimeoutError</code></td><td>A local HTTP deadline elapsed. Reconcile mutations before retrying.</td></tr>
      <tr><td><code>ObservationTimeoutError</code></td><td>Observe the acknowledged command again.</td></tr>
      <tr><td><code>CleanupError</code></td><td>Retain the sandbox ID and reconcile its runtime state.</td></tr>
      <tr><td><code>IntegrityError</code></td><td>Reject the artifact instead of using corrupt data.</td></tr>
    </tbody></table>

    <h2>Limits and qualification</h2>
    <p>Timeout arguments are seconds. Defaults: HTTP request 120s, readiness 180s, cleanup 90s and command observation 120s. Remote command limits are separate. JSON responses are bounded to 24 MiB; binary files use buffered base64 with size and SHA-256 verification. This is not streaming.</p>
    <aside className="docs-notice"><p><strong>Large-file qualification is blocked.</strong> The server advertises a 16 MiB limit and the candidate codec passes its memory tests, but native rc.10 acceptance failed a 1 MiB upload. Do not treat that advertised limit as verified end-to-end support.</p></aside>
    <p>The candidate covers discovery, capacity, lifecycle, finite/tracked commands, files, logs and retained workspaces. PTY, SSE, pause/resume, snapshots, routes, Git helpers, Vault administration, template builds and usage history methods remain outside this Python preview. See the <a href={`${source}/docs/release-notes/python-agents-preview.md`}>qualification record</a> for executed gates and pending publication/adoption evidence.</p>
    <p>Next: <a href="#docs/deepagents-python">Deep Agents for Python</a> or the <a href={`${source}/docs/development/python-client-design.md`}>technical contract</a>.</p>
  </>
};

export const pythonDeepagentsDocs: DocPage = {
  id: "deepagents-python",
  section: "Integrations",
  title: "Deep Agents for Python",
  navTitle: "Deep Agents (Python)",
  lede: "Keep your agent and model. Move its shell and file tools to Harakiri by selecting a different backend.",
  toc: ["Same agent, remote tools", "Prepare your environment", "Run the first task", "Borrow an existing sandbox", "Native async tools", "Repair and independently verify", "Recovery and approval", "Failure contracts"],
  body: <>
    <h2>Same agent, remote tools</h2>
    <aside className="docs-notice"><p><strong>Unreleased candidate.</strong> Python adapter <code>h-sandbox-deepagents==0.1.0rc1</code> targets Python <code>deepagents==0.7.21</code> and SDK <code>h-sandbox==0.1.0rc1</code>. PyPI publication is pending. Looking for <a href="#docs/deepagents">TypeScript</a>?</p></aside>
    <p>Your application still runs the model, agent loop and checkpoints. Harakiri runs the framework's shell and file tools. Custom application tools are not automatically sandboxed. Both examples use the real <code>create_deep_agent</code>, the same prompt and the same model.</p>
    <div className="docs-code-comparison"><div className="docs-code-comparison-grid">
      <section aria-label="Python without a sandbox"><h3>Without a sandbox</h3><p>Tools run on your machine.</p><CodeBlock language="python" filename="first_local.py">{pythonExamples["first_local.py"]}</CodeBlock></section>
      <section aria-label="Python with Harakiri"><h3>With Harakiri</h3><p>Tools run in a Harakiri sandbox.</p><CodeBlock language="python" filename="first_sandbox.py">{pythonExamples["first_sandbox.py"]}</CodeBlock></section>
    </div></div>
    <p><strong>The local example is not isolated.</strong> A working directory is not a filesystem jail. Run local agent shell tools only in a disposable environment. The Harakiri task context owns cleanup; client closure alone does not delete a runtime.</p>

    <h2>Prepare your environment</h2>
    <p>Start with the <a href="#docs/python-sdk">Python SDK setup</a>. The locked source environment includes the optional adapter, the exact framework and <code>langchain-ollama==1.1.0</code>. Use a template with Python 3, bash, find, grep and sed. No automatic template substitution or package installation occurs.</p>
    <CodeBlock language="bash" filename="Explicit model setup">{`uv sync --project python --frozen
export HARAKIRI_AGENT_MODEL=ollama:qwen3:4b-instruct
# Start your own Ollama server and install this model first.
# Other models require their LangChain integration and application credentials.`}</CodeBlock>
    <CodeBlock language="python" filename="first_model.py">{pythonExamples["first_model.py"]}</CodeBlock>
    <p>A local model is not bundled with Harakiri. Model credentials stay in your application; they are not automatically forwarded to sandbox tools. Free hosted endpoint availability is not a compatibility guarantee.</p>

    <h2>Run the first task</h2>
    <CodeBlock language="bash" filename="From the candidate source root">{`uv run --project python examples/python-first-task/first_sandbox.py`}</CodeBlock>
    <p>Matching downloadable source: {Object.keys(pythonExamples).map((name, index) => <span key={name}>{index > 0 && ", "}<a download href={`/docs/examples/python/${name}`}>{name}</a></span>)}. Displayed, downloaded and repository programs are checked for equality.</p>

    <h2>Borrow an existing sandbox</h2>
    <p>Choose this ownership model for application-managed sessions or approval pauses. Closing the client does not kill the sandbox. Its TTL still applies.</p>
    <CodeBlock language="python" filename="first_existing.py">{pythonExamples["first_existing.py"]}</CodeBlock>

    <h2>Native async tools</h2>
    <p>Use the async client, async backend and <code>agent.ainvoke()</code> together. Inherited filesystem operations use async network primitives too.</p>
    <CodeBlock language="python" filename="first_async.py">{pythonExamples["first_async.py"]}</CodeBlock>

    <h2>Repair and independently verify</h2>
    <p>The <a href={`${source}/examples/python-repository-repair`}>repository repair example</a> gives a real model a broken totals function. Four original tests include two failures. After the agent's work, the application checks that the tests were not changed, reruns the original tests independently, retrieves the patch and confirms cleanup. A model reply alone is not proof of a correct artifact.</p>
    <CodeBlock language="bash" filename="Repair workflow">{`uv run --project python examples/python-repository-repair/repair.py`}</CodeBlock>

    <h2>Recovery and approval</h2>
    <p>The <a href={`${source}/examples/python-workflow-recovery`}>single-worker recovery example</a> commits command intent before submission and acknowledgement before observation. A second process observes the saved command without resubmission. Missing acknowledgement requires reconciliation, not replay.</p>
    <p>The approval example uses the official <code>SqliteSaver</code> and a borrowed backend. Checkpoints, command references and retained files are separate. After TTL expiry, explicitly create a replacement runtime attached to the detached workspace. This recovers files, not process memory or exactly-once graph execution. SQLite here is not a distributed scheduler.</p>

    <h2>Failure contracts</h2>
    <p>Timeouts and kills appear in framework-visible output; null exit codes stay null. Search clipping remains marked as truncated. Incomplete read/list/edit results fail visibly. Transfer failures retain completed paths and their cause, including cancellation between files.</p>
    <p>Defaults: 64 KiB combined output, 32 MiB transfer batches, at most 64 files and a 120s transfer budget. Per-file server limits still apply. Backend execution errors retain known command references; local cancellation is not remote termination. See <a href={`${source}/docs/integrations/deepagents-python.md`}>the full contract</a> and <a href={`${source}/docs/release-notes/python-agents-preview.md`}>qualification status</a>.</p>
    <p>Dependency conflicts require a compatible environment, not bypassing the framework pin. Missing executables require a suitable template, not a longer timeout. Before attaching a replacement runtime, wait until the retained workspace is available and has no attached sandbox; termination and detachment are separate states.</p>
  </>
};
