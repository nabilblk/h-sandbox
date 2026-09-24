# Harakiri Sandbox for Deep Agents

An optional TypeScript backend for [Deep Agents](https://docs.langchain.com/oss/javascript/deepagents/sandboxes).
The framework owns planning and tool selection. Harakiri owns sandbox execution,
files, lifecycle and policy. Your application owns identity, checkpoints and
result verification. No framework dependencies are added to the core SDK.

## Start with Deep Agents

The integration point in an existing Deep Agents application is its `backend`:

```ts
import { createDeepAgent } from "deepagents";
import { HarakiriSandboxBackend } from "@h-sandbox/deepagents";

// Supply your model and a ready, application-owned Harakiri sandbox.
const agent = createDeepAgent({
  model,
  backend: new HarakiriSandboxBackend(sandbox)
});
```

This is a **sandbox-backed agent**: the agent loop, model calls and checkpoints
run in your application; the framework's shell and filesystem tools run in the
sandbox. It does not deploy your entire agent process into the sandbox. Custom
tools you register yourself are not automatically isolated: local shell or file
callbacks still run on your application host.

For a complete, executable workflow, start with
[the single-file repository repair](https://github.com/nabilblk/h-sandbox/blob/main/packages/deepagents/examples/run-repair.ts).
It imports the real Deep Agents SDK, receives a Harakiri backend, fixes a bug,
verifies the original tests and returns a diff after confirmed cleanup.

## Availability

**Unreleased source candidate.** This package is intentionally private until a
coordinated SDK/adapter release. It requires the SDK from the same reviewed
checkout, not `@h-sandbox/sdk@0.5.0-rc.10` from npm. Both archives must be installed
together. Node 20+ is the consumer target; repository tooling uses Node 22+.

```bash
# In a reviewed Harakiri checkout:
pnpm install --frozen-lockfile
pnpm --filter @h-sandbox/deepagents build
mkdir -p /tmp/harakiri-framework-candidate
pnpm --filter @h-sandbox/sdk pack --pack-destination /tmp/harakiri-framework-candidate
pnpm --filter @h-sandbox/deepagents pack --pack-destination /tmp/harakiri-framework-candidate

# In your server-side application, using the two resulting archive paths:
npm install "$SDK_TARBALL" "$DEEPAGENTS_TARBALL" \
  deepagents@1.14.0 langchain@1.5.11 @langchain/core@1.2.12 \
  @langchain/langgraph@1.4.17 langsmith@0.9.0 zod@4.4.3
```

The adapter requires SDK rc.11 or newer. The reviewed **archive** identifies
this adapter candidate. Deep Agents is an exact peer
dependency because its sandbox protocol is evolving. Commit your application's
lockfile. Other framework versions need a fresh compatibility run.

## Connect an Existing Sandbox

```ts
import { HarakiriClient } from "@h-sandbox/sdk";
import { HarakiriSandboxBackend } from "@h-sandbox/deepagents";
import { createDeepAgent } from "deepagents";
import { initChatModel } from "langchain/chat_models/universal";

const client = HarakiriClient.fromEnv();
const modelName = process.env.HARAKIRI_AGENT_MODEL;
const sandboxId = process.env.HARAKIRI_SANDBOX_ID;
if (!modelName || !sandboxId) throw new Error("Select a model and an existing sandbox.");

// Install the selected model provider package in this application first.
const model = await initChatModel(modelName);
const sandbox = await client.sandboxes.connect(sandboxId);
await sandbox.wait({ timeoutMs: 180_000 });
const backend = new HarakiriSandboxBackend(sandbox, { timeoutMs: 60_000 });
const agent = createDeepAgent({ model, backend, subagents: [], memory: [], skills: [] });
const result = await agent.invoke({
  messages: [{ role: "user", content: "Run python3 --version in the sandbox." }]
}, { recursionLimit: 20 });
console.log(result.messages.at(-1)?.content);
// Borrowed sandbox: its application owner decides when to terminate it.
```

Set `HARAKIRI_API_URL` to your installation and supply `HARAKIRI_API_KEY` through
your server's secret configuration. Use `sandboxes:read` and `sandboxes:write`.
Never send that key to a browser, an LLM, graph state or the sandbox. Model
credentials stay in the application process, not sandbox environment variables.
Do not log complete graph state: prompts, tool outputs and files may be sensitive.

## Ownership and Recovery

`new HarakiriSandboxBackend(sandbox)` borrows exactly one sandbox. It does not
create, resume, change egress or terminate it. `backend.reference` contains only
`sandboxId`; `execute()` returns an additional `{ sandboxId, commandId }` reference.
Persist references in a tenant/thread-scoped record, then `backend.observe(ref)`
to observe an existing command without resubmitting it.

For finite, disposable jobs, `withHarakiriSandbox(client, input, task, options)`
creates once, waits for readiness, runs the task and confirms termination and
capacity release. It cleans up even when readiness or the task fails. It rejects
caller idempotency keys and create-time Git source because they can refer to an
existing resource or obscure ownership. `HarakiriTaskCleanupError` retains the
sandbox ID and both workload and cleanup failures. TTL remains a crash safety net.

Do not use that helper across a real human approval pause: a paused graph returns
control, so the helper would clean up. Use an application-owned sandbox instead.
After a cleanup timeout, `sandbox.waitForTermination()` observes without another DELETE.

## Examples and Verification

From this reviewed checkout after building:

```bash
# Requires your explicit API URL/key and installed template, not a maintainer URL.
export HARAKIRI_TEMPLATE="your-linux-template"
# Install and configure the chosen LangChain model integration first.
export HARAKIRI_AGENT_MODEL="provider:your-tool-capable-model"
pnpm --filter @h-sandbox/deepagents exec tsx examples/run-repair.ts

# Secondary, model-free lifecycle example, not an agent-reasoning demo:
pnpm --filter @h-sandbox/deepagents exec tsx examples/run-checkpoint.ts
```

`run-repair.ts` is self-contained: model selection, the `createDeepAgent` call,
fixture setup, invocation, outcome verification and cleanup live in one file.
Its exported `repairRepository(client, model, template)` is tested through the
actual framework with scripted model decisions. The initial invoice tests fail
because quantity is ignored. Expected success is three passing tests, a nonempty
implementation diff and a confirmed-cleanup sandbox ID. Model claims alone are
not accepted; editing the test contract also fails verification.

`run-checkpoint.ts` is model-free: two graph instances share an in-memory
checkpointer, pause for approval and retrieve one command's result. It does not
claim process-restart durability. Production applications supply a persistent
checkpointer and their own authorized sandbox lookup.

The repair example requires **Node.js, Git,
bash and GNU file tools** in the selected template. Its blocked egress policy
requires enforcement support in your installation. It downloads no dependencies
inside the sandbox. A local/self-hosted model is supported through LangChain;
model availability, tool quality and zero cost are not guaranteed.
Blocked sandbox egress does not block model calls from the application.

Choose a provider integration that supports the framework's text-block tool
results. `@langchain/ollama@1.3.0` rejects those blocks before making a model
request, so it is not a drop-in choice for this example. The disposable
[Ollama acceptance harness](https://github.com/nabilblk/h-sandbox/blob/main/infra/sdk-acceptance/README.md)
uses strict text-only normalization and `think: false`; this compatibility
handling is not installed by the Harakiri adapter. Applications can call the
exported `repairRepository(client, model, template)` with their configured model.

```bash
pnpm --filter @h-sandbox/deepagents typecheck
pnpm --filter @h-sandbox/deepagents test
pnpm --filter @h-sandbox/deepagents test:package

# Optional: creates and deletes one sandbox on an explicitly selected test system.
HARAKIRI_DEEPAGENTS_ACCEPTANCE=disposable-runtime \
  pnpm --filter @h-sandbox/deepagents test:native
```

Local contract tests use the actual Deep Agents and LangGraph libraries with a
scripted model and synthetic API, not real inference or a runtime. The native
command exercises remote shell/file operations with scripted decisions. Real
model acceptance and coordinated publication are separate gates.

## Boundaries

- Linux backend: upstream `BaseSandbox` supplies read/list/glob/grep and edit
  behavior. A working directory is not a filesystem jail. Do not share one
  sandbox across untrusted tenants or attach untrusted local tools to the agent.
- Commands are shell strings. Transport/auth failures throw, while nonzero shell
  exits are ordinary tool results. The adapter never retries a mutation.
  A framework or model can still request the same action again; approval and
  idempotent application operations are required where repeat effects matter.
- Execution timeout, status-polling timeout and sandbox TTL are separate.
  Cancellation stops polling/between-file work, not a running remote command.
  Submission, file and log HTTP requests use the SDK transport; supply bounded
  `fetch` in client configuration if you need per-request transport deadlines.
- Output is stdout followed by stderr, not a chronological merge. The default
  combined UTF-8 log limit is 64 KiB; provider truncation flags remain visible.
  A fixed-size termination notice is outside that limit so timeouts/kills are
  visible to the agent even with empty logs or a tiny limit, without inventing
  an exit code. Grep preserves truncation and drops a clipped final match. Narrow
  the query or increase `maxOutputBytes` for byte-limited searches; the upstream
  generic incomplete-search note only mentions match counts.
- Files use checksum-verified **buffered** SDK transfers, not streaming. Batches
  are sequential, at most 64 paths and 32 MiB decoded by default; runtime
  per-file limits also apply. Transfers are not transactional. Specific path
  errors return per-file results; unrepresentable failures throw
  `HarakiriTransferError` with earlier successful paths and the original cause,
  including cancellation between files. Cancellation before any work remains a
  direct abort. Download contents from earlier iterations are not retained in
  the exception; `completedPaths` identifies completed reads, not local writes.
- Upstream edits are read/modify/write, not atomic. Serialize conflicting writers.
- Durable graph state is not durable sandbox storage. Use Harakiri workspaces
  explicitly when files must survive runtime replacement. Reconnect does not
  revive an expired sandbox or rebind command IDs to another runtime.

See the [technical integration guide](https://github.com/nabilblk/h-sandbox/blob/main/docs/integrations/deepagents.md)
for contracts, operations and the release checklist. Apache-2.0 licensed.
