# Python SDK

**Unreleased candidate:** `h-sandbox==0.1.0rc1`, imported as `harakiri`.
PyPI publication and public-artifact qualification are pending. These are source
installation instructions, not a claim that the package is published.

## Start with one task

Python 3.11 or newer is required. From the repository root:

```sh
uv sync --project python --frozen
export HARAKIRI_API_URL=https://your-harakiri-api.example.com
export HARAKIRI_API_KEY=your-scoped-api-key
export HARAKIRI_TEMPLATE=your-installed-template
```

For a core-only environment, use `python -m pip install ./packages/python-sdk`.
The core does not import Deep Agents, run a Node process, or need Kubernetes or
provider credentials. Model integrations belong in the application environment.

```python
import os
from harakiri import HarakiriClient

with HarakiriClient.from_env() as client:
    with client.sandboxes.task(template=os.environ["HARAKIRI_TEMPLATE"]) as sandbox:
        result = sandbox.run("printf 'Hello from Python'", check=True)
        print(result.stdout)
        sandbox.files.write("result.txt", result.stdout)
        assert sandbox.files.read_text("result.txt") == result.stdout
```

`task` waits for execution readiness and confirms termination **and capacity
release** before it returns. Client closure alone closes HTTP resources. It does
not kill sandboxes or archive workspaces. CPU and memory are template settings,
not guessed Python creation overrides.

## Ownership

| API | Owner and effect |
| --- | --- |
| `client.sandboxes.task(...)` | Owned disposable runtime, bounded cleanup on success or failure |
| `client.sandboxes.create(...)` | Application-owned runtime; explicit cleanup or TTL |
| `client.sandboxes.connect(id)` | Borrowed existing runtime; read-only connection |
| `client.close()` / async `close()` | HTTP resources only; injected HTTPX client remains caller-owned |
| `client.workspaces.archive(id)` | Explicit archive after detachment; not implicit physical data deletion |

Never use a disposable task context around an agent that must pause for human
approval. Connect to an application-owned sandbox instead. TTL still applies.
See [recovery](integrations/deepagents-python.md#recovery-without-replay).

## Native Asyncio

```python
import asyncio
import os
from harakiri import AsyncHarakiriClient

async def main():
    async with AsyncHarakiriClient.from_env() as client:
        async with client.sandboxes.task(template=os.environ["HARAKIRI_TEMPLATE"]) as sandbox:
            result = await sandbox.run("printf async", check=True)
            print(result.stdout)

asyncio.run(main())
```

Use the async client inside an event loop. The synchronous client has one lazy
private event-loop thread for bounded HTTP I/O; callbacks run on the caller's
thread. Library code never calls `asyncio.run()`. Do not share one async client
between unrelated event loops.

## Commands and Recovery

`sandbox.run(command, check=True)` is the finite-command convenience. `check`
defaults to false; inspect `exit_code` when omitting it. For long work use
`sandbox.processes.start(command, timeout=60, on_started=persist_reference)`.
The callback receives a serializable `CommandReference` after acknowledgement.

```python
process = sandbox.processes.connect(saved_reference.command_id)
observed = process.observe(timeout=90)
print(observed.command.exit_code, observed.command.finish_reason)
print(observed.logs.stdout)
```

Persist the sandbox ID too, in an application-authorized tenant/thread binding.
Observation does not start another command. Local timeout or cancellation is not
a remote kill. A callback failure carries the acknowledged reference. A lost
submission response means the outcome is unknown: do not blindly resubmit.
Creation errors retain an idempotency intent or an accepted sandbox when known.

All Python timeouts are **seconds**. Remote execution timeout, HTTP request
deadline, observation budget, readiness budget and cleanup budget are separate.
Defaults: request 120s, readiness 180s, cleanup 90s, command observation 120s.
Commands inherit the template's remote limit unless explicitly overridden.

## Files and Workspaces

- `files.read_text(path)` returns UTF-8; `files.read_bytes(path)` validates binary size and SHA-256.
- `files.write(path, text_or_bytes)` preserves the explicit representation; bytes use verified buffered base64 transfer.
- `files.list`, `stat`, `mkdir`, `rename` and `remove` expose the corresponding API operations.
- Relative paths resolve against the sandbox's advertised POSIX workdir, not the client OS directory.
- The server advertises the per-file limit, normally 16 MiB. This is **not streaming**. HTTP JSON responses are bounded to 24 MiB by default.
- `workspaces.create(name)`, `list()`, `get(id)` and `archive(id)` manage retained files. Attach with `workspace_id` when creating a sandbox.

A workspace outlives a runtime, not a process. Wait for detachment before explicitly
creating a replacement. Graph checkpoints and command acknowledgement journals
belong to the integrating application, not the retained volume.

## Configuration and Errors

Explicit constructors accept `api_url`, `api_key`, `request_timeout`, `ca_bundle`,
`trust_env` and `max_response_bytes`. TLS verification is on. Environment proxies
are ignored unless `trust_env=True`. Redirects are not followed with API keys.
Inject an `httpx.AsyncClient` only when you own its lifecycle and TLS policy.

Use scopes `sandboxes:read`, `sandboxes:write`, `templates:read`; workspace
operations additionally require `workspaces:read` / `workspaces:write`.
`capacity.get()` additionally needs `org:read`. Do not distribute admin keys.

| Situation | Action |
| --- | --- |
| Missing URL/key/template | Set explicit installation configuration; no account or template is assumed |
| `AuthenticationError` (401) | Replace the expired/revoked key; do not retry a mutation blindly |
| `AuthorizationError` (403) | Correct scopes and organization binding; not a filesystem permission shortcut |
| `CapacityError` | Inspect its typed `capacity`; wait for release or change operator limits |
| `SandboxCreationError` | Retain `sandbox.id`; inspect readiness before cleanup or reconciliation |
| `RequestError.outcome_unknown` | Reconcile a submitted mutation before repeating it |
| `ObservationTimeoutError` | Reconnect to the saved command, not the original prompt |
| `CleanupError` | Retain the sandbox identity; termination/capacity release is unconfirmed |
| `IntegrityError` | Reject the artifact; do not pass corrupt bytes to downstream tools |

Primary and cleanup failures are preserved together in an exception group.
Cancellation errors remain subclasses of `asyncio.CancelledError` and retain
known references. Exception messages omit raw response bodies and credentials;
application logging of attached output, causes or file contents still needs care.

## Supported Surface

The candidate covers discovery, capacity, create/connect/readiness/renew/kill,
finite/tracked commands, text/binary files, sandbox logs and retained workspaces.
It intentionally does not port every TypeScript method: PTY, SSE, pause/resume,
snapshots, routes, Git helpers, Vault administration, template builds and usage
history methods are not Python preview APIs. Those server features are not being
removed.

Python 3.11-3.14 and server `0.5.0-rc.10` are qualification targets. Consult the
[candidate delivery record](release-notes/python-agents-preview.md) for actual
evidence; do not infer a support claim from a matrix entry awaiting execution.

Next: [Python Deep Agents](integrations/deepagents-python.md),
[technical design](development/python-client-design.md),
[contributing and release operations](development/python-contributing.md).
