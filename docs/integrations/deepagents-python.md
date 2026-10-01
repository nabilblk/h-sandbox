# Deep Agents for Python

**Unreleased candidate:** `h-sandbox-deepagents==0.1.0rc1` with
`h-sandbox==0.1.0rc1` and **Python** `deepagents==0.7.21`. This is distinct from
the published TypeScript adapter and its framework version.

## What Runs Where

Your Python application owns `create_deep_agent`, the model client, graph state,
checkpoints and tenant authorization. `HarakiriSandboxBackend` moves the framework's
shell and filesystem tools behind the authenticated Harakiri API. Custom tools
are not automatically sandboxed. No provider or Kubernetes credentials are needed.

Start with the two complete programs in
[python-first-task](../../examples/python-first-task/README.md). Both call the real
framework, use the same model/prompt and differ in backend selection and ownership.
The local example executes shell commands on the host and is **not isolated**.

## Prepare the Model Once

From the repository root:

```sh
uv sync --project python --frozen
export HARAKIRI_API_URL=https://your-harakiri-api.example.com
export HARAKIRI_API_KEY=your-scoped-key
export HARAKIRI_TEMPLATE=your-installed-template
export HARAKIRI_AGENT_MODEL=ollama:qwen3:4b-instruct
```

The locked example environment includes `langchain-ollama==1.1.0`. Start your own
Ollama server and install that model explicitly before running a task. A local
model is not bundled with Harakiri. Other tool-capable models need their matching
LangChain integration and credentials **in your Python application**, not forwarded
to the sandbox. Free hosted model availability is not a CI dependency.

The selected template must have Python 3, bash and the standard Unix tools used by
the pinned framework, including `find`, `grep` and `sed`. No silent package install
or template substitution occurs. A working directory is not a filesystem jail.

```sh
uv run --project python examples/python-first-task/first_sandbox.py
uv run --project python examples/python-first-task/first_async.py
```

Review the risks before running `first_local.py` on your host. Native acceptance
runs local tool workloads only on disposable infrastructure.

## Existing Sandboxes and Async Tools

Use `client.sandboxes.connect(id)` with `HarakiriSandboxBackend(sandbox)` for a
borrowed runtime. Backend disposal and client closure never kill it. For asyncio,
use `AsyncHarakiriClient`, `AsyncHarakiriSandboxBackend` and `agent.ainvoke()`.
The async backend implements native async execution, uploads, downloads and
inherited filesystem tools; it does not offload synchronous HTTP calls to threads.

## Repair, Then Verify

[Repository repair](../../examples/python-repository-repair/README.md) uploads a
deliberately broken totals function, runs a genuine model-backed graph, downloads
the patch and independently reruns the original four tests. The original test
hash must be unchanged. A model reply is not proof that the code works.

## Recovery Without Replay

[Workflow recovery](../../examples/python-workflow-recovery/README.md) demonstrates
an acknowledgement journal and an official SQLite LangGraph checkpointer in the
application. They are separate records:

- A command intent is committed before submission; a received command ID is committed immediately afterwards.
- A second worker observes that ID without submitting a command or invoking the graph again.
- A missing acknowledgement requires manual reconciliation; it is not permission to replay.
- An approval pause uses a borrowed sandbox and `SqliteSaver`. TTL continues while approval is pending.
- After runtime expiry, explicitly create a new runtime attached to the detached retained workspace. Files recover, process memory does not.

SQLite here supports one local worker, not a multi-tenant production scheduler or
distributed exactly-once execution. Real services must authorize the thread to
sandbox binding, serialize ownership and review pending tool calls before resume.

## Failure and Output Contracts

Abnormal termination appears in the framework-visible output as well as typed
metadata. A null exit code remains null. Output limits are UTF-8 byte limits;
search truncation is preserved and incomplete read/list/edit results fail visibly.

`HarakiriExecutionError` retains its stage, known `CommandReference` and cause.
Cancellation keeps asyncio cancellation semantics and known identity. `observe`
is read-only. `HarakiriTransferError` retains completed paths and cause even when
cancellation happens between files; generic 403/404 errors are not disguised as
missing files. Do not log unreviewed causes or returned content publicly.

Defaults: 64 KiB combined command output, 32 MiB aggregate transfer batches,
64 files per batch, 120s transfer budget. Per-file server limits still apply.
The backend command timeout uses the template limit; observation defaults to
that limit plus ten seconds. Neither observation timeout nor client cancellation
automatically kills a remote process. `task` cleanup is a separate owned boundary.

See the [SDK guide](../python-sdk.md) for API scope, configuration and typed errors,
and [qualification status](../release-notes/python-agents-preview.md) before release.
The adapter's exact framework dependency is intentional; a compatibility probe
does not silently widen the supported version range.

## Troubleshooting the First Task

| Symptom | Check before retrying |
| --- | --- |
| Dependency resolver rejects the environment | Keep `deepagents==0.7.21` with this adapter candidate. Use a fresh environment; do not override the bound with `--no-deps`. |
| Model initialization or authentication fails | Install the selected LangChain integration and configure its credentials or local endpoint in the application. Harakiri does not select or provision the model. |
| Shell reports a missing executable | Select or build a template containing Python 3, bash, find, grep and sed. Increasing the observation timeout will not install them. |
| Agent returns partial output or an abnormal-termination notice | Inspect the saved command reference and finish reason. Distinguish the remote execution limit from local observation timeout; do not rerun the graph automatically. |
| A replacement cannot attach the workspace | Wait for both `status == "available"` and `attached_sandbox_id is None`; runtime termination can precede volume detachment. |
| Large binary upload fails on rc.10 | The 1 MiB native failure remains a release blocker. Do not infer that the advertised 16 MiB maximum is qualified, or route around the Harakiri API. |
