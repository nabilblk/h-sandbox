# Reliable Framework Workflows

Status: **unreleased source milestone**. Build the SDK and adapter from the same
reviewed checkout. The published SDK `0.5.0-rc.11` and adapter `0.1.0-rc.1` do not
contain the new request controls. Package version bumps, registry publication,
native qualification and deployment are separate release steps.

## What Runs Where

Your application runs `createDeepAgent`, the model integration and the official
LangGraph `PostgresSaver`. Harakiri runs the agent's shell and file tools in a
borrowed sandbox. PostgreSQL stores graph checkpoints and the application's
tenant/thread/resource mapping. A retained Harakiri workspace stores files.
Neither kind of persistence replaces the other.

The reference is deliberately application code, not another framework in the SDK:

| Source | Responsibility |
| --- | --- |
| [durable-workflow.ts](../../packages/deepagents/examples/durable-workflow.ts) | Real Deep Agents graph, human review, read-only command recovery, explicit file recovery |
| [durable-store.ts](../../packages/deepagents/examples/durable-store.ts) | Official checkpointer, application binding, acknowledged command IDs, single-worker guard |
| [run-durable.ts](../../packages/deepagents/examples/run-durable.ts) | Explicit CLI actions; each invocation is a new process |

The framework adapter and core SDK gain no PostgreSQL runtime dependency. Do not
install the workflow tables in the Harakiri control-plane database. Use a database
owned by the integrating application and protect its checkpoints as sensitive data.

## Prepare A Workflow

Use Node 22 or 24, PostgreSQL, a tool-capable model integration and an
application-owned sandbox. The selected template needs bash, GNU tools and Python
3 for inherited filesystem operations. Configure model access in the application,
not in the sandbox. The existing [model compatibility caveat](deepagents.md#contract-and-dependencies)
still applies; this example does not silently install an Ollama transport shim.

Build the reviewed source, using the committed lockfile:

```sh
pnpm install --frozen-lockfile
pnpm --filter @h-sandbox/deepagents build
```

Supply `HARAKIRI_API_KEY`, `WORKFLOW_DATABASE_URL` and any model credentials
through private application configuration. Use an application database you are
authorized to migrate. `setup` creates LangGraph's tables and two
`harakiri_example_*` tables; it does not change the sandbox platform database.

```sh
export HARAKIRI_API_URL="https://sandbox-api.example.com"
export HARAKIRI_SANDBOX_ID="your-application-owned-sandbox-id"
export HARAKIRI_AGENT_MODEL="provider:your-tool-capable-model"
export WORKFLOW_TENANT_ID="team-one"
export WORKFLOW_THREAD_ID="report-one"

pnpm --filter @h-sandbox/deepagents exec tsx examples/run-durable.ts setup
pnpm --filter @h-sandbox/deepagents exec tsx examples/run-durable.ts bind
```

Create the sandbox with a retained workspace first when files must survive TTL.
See [the complete workspace recipe](../../examples/sdk-persistent-workspace/index.mjs).
`bind` borrows that sandbox, verifies readiness and records its actual workspace
ID. It neither creates nor deletes it. In a server, replace the CLI identity with
authenticated tenant/thread authorization; an arbitrary supplied ID is not proof
of access. Never share a sandbox between untrusted tenants.

## Start, Review, Resume

```sh
export WORKFLOW_PROMPT="Create report.txt in the working directory, then verify its contents. Request one tool action at a time."
pnpm --filter @h-sandbox/deepagents exec tsx examples/run-durable.ts start
```

Expected: `phase: approval`, a checkpoint ID and the pending action. The worker
exits, leaving the application-owned sandbox and database intact. Another process
can inspect the saved state:

```sh
pnpm --filter @h-sandbox/deepagents exec tsx examples/run-durable.ts inspect
export WORKFLOW_CHECKPOINT_ID="the-checkpoint-id-you-reviewed"
pnpm --filter @h-sandbox/deepagents exec tsx examples/run-durable.ts approve
# Or choose reject instead of approve.
```

The example requires one pending action and checks the exact checkpoint ID.
Stale approvals fail before tool execution. `execute`, `write_file` and `edit_file`
are reviewed; this is not an all-tools security policy. Read/search tools may
execute scripts, and application/network policy remains the security boundary.
Continue reviewing until `phase: complete`, then verify the result independently.
Rejecting one action does not prohibit the model from proposing a different one.
Review output may include sensitive tool arguments; keep it out of shared logs.

Do not wrap this lifecycle in `withHarakiriSandbox`: returning an interrupt would
end that disposable task and trigger cleanup. The application explicitly owns
TTL, renewal, termination and workspace retention.

## Worker Loss And Recovery

The application marks an invocation `invoking` before effects and records each
acknowledged command through `onCommandStarted`. It records `approval` or
`complete` only after the graph invocation returns. A PostgreSQL session advisory
lock prevents two healthy workers from invoking the same example run concurrently.
It is not a distributed fencing or exactly-once shell protocol.
The example uses separate bounded connection pools for long-held locks and short
checkpoint queries, so waiting for a lock cannot starve checkpoint persistence.

If a worker exits after acknowledgement, a replacement can inspect the persisted
command ID and retrieve its result without invoking the agent again:

```sh
pnpm --filter @h-sandbox/deepagents exec tsx examples/run-durable.ts inspect
export WORKFLOW_COMMAND_ID="the-recorded-command-id"
pnpm --filter @h-sandbox/deepagents exec tsx examples/run-durable.ts observe
```

An uncertain `invoking` phase deliberately blocks automatic graph replay. Even if
command observation succeeds, it does not prove the interrupted graph recorded
all its effects. Reconcile the job explicitly or start a new reviewed thread.
This conservative guard can also stop a job that crashed before making any effects.

There is no transaction spanning a remote command and a PostgreSQL checkpoint.
A lost submission response or a crash before its ID was persisted can leave no
recoverable reference. Do not invent an ID or claim that a retry is safe. Inspect
control-plane command inventory and application records before deciding what to do.
Models/frameworks can also request repeated actions; use idempotent business
operations where repeat effects matter.

## Expiry And Files

Graph persistence does not keep a sandbox alive. Expired or non-running runtimes
raise `WorkflowRecoveryRequired` instead of silently creating a replacement.
After confirmed termination, capacity release and workspace availability:

```sh
pnpm --filter @h-sandbox/deepagents exec tsx examples/run-durable.ts recover-files
```

This explicit action creates a new sandbox on the recorded workspace using a
stable creation idempotency key. It returns the accepted ID before readiness.
Reconnect to that ID, wait for readiness and verify retained files. It never
changes the old graph binding or transfers old command IDs. Bind a **new** thread
to the replacement for further work. If recovery creation loses its response,
inspect `client.workspaces.get(run.workspaceId)` and its `attachedSandboxId`, then
reconcile that runtime with your application records. An attachment alone does
not prove it belongs to this recovery. The intent key is
`framework-files-${run.id}`; do not generate a fresh creation key.
The example permits one replacement intent per run, not unlimited recovery epochs.

`recovery_required`, attached storage and missing workspaces require explicit
operator/application handling. No retained workspace means no promise of retained
files. Archive only after detachment; archival is not physical storage deletion.

## Four Separate Budgets

| Control | Scope | Result when exhausted |
| --- | --- | --- |
| `requestTimeoutMs` | One JSON HTTP request, including response body | `HarakiriRequestTimeoutError`; mutation outcome may be unknown |
| Command `timeoutMs` | Remote command execution | Remote timeout/termination result |
| `observationTimeoutMs` | Adapter status polling plus final logs | Observation failure retaining an acknowledged reference |
| Sandbox `ttlSeconds` | Runtime lifetime | Runtime expiry; checkpoints do not extend it |

The new SDK defaults JSON requests to 120 seconds. Configure a client default
with `HarakiriClient.fromEnv({ requestTimeoutMs: 30_000 })` and override individual
command/file requests with their request options. `signal` cancels in-flight local
waiting, not remote execution. No mutation is automatically retried. Custom Fetch
implementations should still honor the forwarded signal to release sockets.
SSE observation and route fetch have separate existing controls.

For finite foreground work, allow enough HTTP time for execution and its response,
or use detached commands. Callback/database/model timeouts are application-owned;
SDK HTTP deadlines do not bound arbitrary user callbacks or inference.

## Compatibility And Qualification

Minimal model-free backend installation needs the adapter, SDK and `deepagents`.
An application importing LangChain models or LangGraph adds those direct packages.
The full checkpoint example additionally needs
`@langchain/langgraph-checkpoint-postgres@1.0.5` and `pg@8.21.0`.
The repository lockfile records the tested graph of dependencies. Build/install
the unreleased SDK and adapter together; do not install this source adapter over
the older published SDK when testing the new options.

The framework consumer CI matrix covers npm and pnpm on Node 22/24, retaining
Node 20 only as a legacy compatibility check, not a recommended production runtime.
Use a clean manifest declaring the full dependency set together for checkpointed
applications. Incrementally adding older framework pins after automatic peer
installation can leave duplicate LangGraph `Command` types in the lockfile;
inspect the resolved dependency graph rather than suppressing the type error.
The weekly upstream probe changes dependencies only in its disposable checkout;
it never widens supported versions, pushes commits or publishes packages.

```sh
pnpm --filter @h-sandbox/sdk test
pnpm --filter @h-sandbox/deepagents typecheck
pnpm --filter @h-sandbox/deepagents test:package
HARAKIRI_DEEPAGENTS_PACKAGE_MANAGER=pnpm pnpm --filter @h-sandbox/deepagents test:package

# Requires local initdb/pg_ctl. Starts a temporary Unix-socket-only PostgreSQL,
# runs separate-process tests, then stops and removes only that instance.
node scripts/test-framework-postgres.mjs
```

Local PostgreSQL tests use the real framework and real checkpoints with an HTTP
protocol fixture, not sandbox runtime enforcement. The runner-only
`framework-durable-recovery` native gate additionally verifies actual command
effects, server-side expiry and retained files on replacement. Its model decisions
are scripted; the real-model repair remains a separate gate.
[Native qualification on September 25](https://github.com/nabilblk/h-sandbox/actions/runs/36137161754)
passed all 16 gates and cleanup against published API baseline `0.5.0-rc.9`,
including both recovery and real-model repair. See the
[milestone evidence and retained receipt](../release-notes/reliable-framework-workflows.md)
for source identity, artifact hashes and scope. These source changes are still
unreleased; passing native acceptance does not publish packages or deploy docs.

References: [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence),
[interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts),
[official PostgreSQL checkpointer](https://reference.langchain.com/javascript/langchain-langgraph-checkpoint-postgres),
[Node release support](https://nodejs.org/en/about/previous-releases).
