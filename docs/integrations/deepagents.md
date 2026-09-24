# Deep Agents TypeScript Integration

Status: developer preview on npm for Deep Agents 1.14.0 and the published
Harakiri SDK 0.5.0-rc.11. Earlier SDK versions are not compatible with this adapter.
Install `@h-sandbox/deepagents@next` using the
[package guide's pinned dependency set](../../packages/deepagents/README.md#availability).
Keep `--save-exact` and commit the application lockfile.

## Architecture

```text
Trusted application
  identity + tenant/thread mapping + model + checkpointer
    |
    | Deep Agents / LangGraph tools
    v
@h-sandbox/deepagents       (optional framework dependency)
    |
    | public SDK methods only
    v
@h-sandbox/sdk             (no framework dependency)
    |
    | authenticated control-plane API
    v
Harakiri                   (authorization, capacity, lifecycle, policy)
    |
    | runtime provider interface
    v
Sandbox runtime            (commands and files; no host model/API keys)
```

This is a sandbox backend, not a model wrapper, agent harness or persistence
service. The adapter has no direct fetch, provider URL, Kubernetes client or
local shell executor. Switching the control plane's runtime provider does not
change the adapter contract. Actual capabilities still depend on the operator's
runtime/template profile; no compatibility with every provider is implied.

The supported pattern is **sandbox-backed tools**, not **agent-in-sandbox**.
The agent loop, model calls, custom application tools and checkpoints stay in
the trusted application. Registering a local tool does not move it into Harakiri.
Running the entire agent process inside a sandbox is a separate deployment
pattern, not a property of this backend.

Start with [run-repair.ts](../../packages/deepagents/examples/run-repair.ts), a
single runnable file visibly importing `createDeepAgent` and attaching the
Harakiri backend. The public guide displays that exact file, checked for equality
in documentation and installed-package tests. Model-free shell and checkpoint
examples are diagnostics and lifecycle recipes, not agent-inference evidence.

Files and responsibilities:

| Module | Responsibility |
| --- | --- |
| `packages/deepagents/src/backend.ts` | Borrowed sandbox, framework protocol, bounded transfer batches |
| `packages/deepagents/src/execution.ts` | Tracked command observation and UTF-8 output limits |
| `packages/deepagents/src/search.ts` | Request-local preservation of grep truncation through the pinned upstream implementation |
| `packages/deepagents/src/lifecycle.ts` | Explicit disposable-task ownership and confirmed cleanup |
| `packages/deepagents/src/errors.ts` | Recoverable references and non-lossy failure metadata |
| `packages/deepagents/examples` | Model-driven repair; application-owned graph resolver/checkpointer |

## Contract and Dependencies

The class extends upstream `BaseSandbox`, implementing the V2 primitives
`execute`, `uploadFiles` and `downloadFiles`. Upstream owns shell scripts for
read/list/glob/grep and the read/modify/write edit behavior. Harakiri does not
copy those scripts or reimplement its SDK transport.

Deep Agents 1.14.0 drops `ExecuteResponse.truncated` inside `BaseSandbox.grep`.
A per-call delegating backend reuses upstream shell construction and parsing,
discards an incomplete trailing line and merges byte/provider truncation into
`GrepResult`. It has no shared last-command state, so concurrent searches cannot
contaminate one another. If no complete match fits, it returns an explicit error
because the pinned tool would otherwise say "No matches" and ignore truncation.
Upstream's generic note attributes truncation to a match-count cap; byte-limited
searches require narrowing the query or raising `maxOutputBytes` instead.

The compatibility fixture pins Deep Agents 1.14.0, LangChain 1.5.11,
`@langchain/core` 1.2.12, `@langchain/langgraph` 1.4.17, LangSmith 0.9.0 and
Zod 4.4.3. Keep Zod aligned with the framework tree: duplicate peer instances
can produce nominally incompatible LangGraph `Command` types. Consumers target
Node 20/22; repository tools run on Node 22+. This package is server-side only.

Model transport compatibility is separate from the sandbox backend contract.
Deep Agents returns text-block ToolMessages from `read_file`, which
`@langchain/ollama@1.3.0` rejects. The runner-only model harness converts strictly
text-only blocks to strings, preserves message identity and rejects non-text
content; it also uses the JavaScript `think: false` option. This compatibility
class is not shipped in the adapter. The documented repair accepts an explicitly
configured model so applications can select a compatible provider integration.

See [package installation and examples](../../packages/deepagents/README.md).
Build the adapter archive and install it alongside the exact published SDK.
Release-candidate checks install SDK 0.5.0-rc.11 anonymously, not a workspace
substitute. Framework packages are peers/development dependencies here, never
dependencies of the core SDK, CLI, API or dashboard runtime. Publication remains
gated on reviewed source and the complete native acceptance receipt.

## Ownership

| Surface | Owns runtime? | Creates/resumes? | Termination |
| --- | --- | --- | --- |
| `new HarakiriSandboxBackend(sandbox)` | No | Neither | Application owner decides |
| `backend.observe(reference)` | No | Neither; reads only | None |
| `withHarakiriSandbox(...)` | Yes, one new task runtime | Creates once; waits for readiness | Confirms terminated plus capacity released |

The helper retains the accepted handle before readiness. It cleans up readiness
failures, callback failures and cancellation. Cleanup uses a separate budget,
not the caller's cancelled signal. Both task and cleanup failures survive in
`HarakiriTaskCleanupError.errors`, along with `sandboxId`. A DELETE acknowledgement
alone is not success. After unconfirmed cleanup, retain the ID and use
`waitForTermination()`; provider-loss recovery remains an operator responsibility.

No finalizer or process-exit hook promises guaranteed deletion. A crash can
bypass cleanup. Configure TTL and maintain an application job record/reconciler.
Create-response loss remains ambiguous without server deduplication; the helper
does not retry it. The owned helper rejects `idempotencyKey` and create-time Git
`source` rather than deleting a resource recovered by another job. Prepare Git
after readiness or use explicit application ownership.

## Execution and Failure

1. Submit exactly once per `execute()` invocation using tracked commands.
2. Call the optional `onCommandStarted(reference)` before observation. Persist
   the reference with the application's authorized task record, not in prompts.
3. Poll succeeded/failed/killed states. A nonzero exit is a tool result, not a
   transport exception. Preserve `exitCode: null`, finish reason and truncation.
4. Fetch logs, combine stdout followed by stderr and apply the UTF-8 log limit.
5. Prepend a fixed-size termination notice for timeout, kill, runtime error or
   missing exit code. This notice is outside the log budget (under 100 UTF-8 bytes)
   and carries no arbitrary provider text. Deep Agents does not display the
   extra `finishReason` field, so the notice must be in `output`. Normal exits,
   including numeric nonzero exits, keep their original output.

`HarakiriExecutionError.stage` distinguishes submission, checkpoint and
observation. The latter two retain the acknowledged command reference; the first
can be ambiguous. Never infer permission to replay from an HTTP retryable flag.
`observe(reference)` refuses another sandbox's reference or a malformed command
ID and makes only read requests. It does not restart work or extend TTL.

| Option | Default | Meaning |
| --- | --- | --- |
| `cwd` | Runtime metadata workdir | Absolute working directory, not a jail |
| `timeoutMs` | Runtime command timeout | Remote execution budget |
| `observationTimeoutMs` | Execution timeout + 10s | Status-polling budget, not total HTTP time |
| `maxOutputBytes` | 65,536; max 1,048,576 | Combined log text, UTF-8 safe truncation; fixed termination notice excluded |
| `maxBatchBytes` | 33,554,432; max 268,435,456 | Cumulative decoded bytes per file batch |
| `signal` | None | Stop observation and between-file work; not remote execution |

The SDK transport still controls submission, file and final log requests. For a
strict per-request timeout, inject a Fetch implementation into `HarakiriClient`
that combines the caller's signal with its own deadline. A submission timeout is
still ambiguous and must not trigger automatic replay. The callback that persists
command IDs also belongs to the application and needs its own database deadline.

The framework's tool layer can format an adapter exception as a tool error, and
a model can issue another tool call. This adapter cannot promise exactly-once
shell effects for arbitrary agents. Approval, constrained tools, application
idempotency and independent outcome checks remain necessary.

## Files

Native SDK byte helpers preserve binary content and validate size and SHA-256.
The existing JSON/base64 transport buffers bytes; this package adds no streaming
claim. Per-runtime artifact limits apply independently of batch limits.

Batches run sequentially in input order, with a maximum of 64 files. Downloads
stat files before reading so directories and advertised sizes can be rejected
without fetching bodies. Only specific file error codes map to framework path
errors. Organization denial, missing sandbox, capacity/runtime failure and
integrity violations stay exceptions; they are not fabricated file-not-found
results. `HarakiriTransferError.completedPaths` records successes before a fatal
batch failure, including cancellation between iterations, with the original
abort reason in `cause`. A preflight abort before any work throws the original
reason directly. Completed downloads identify reads, not persisted local files;
their contents are not included in the error. Batch operations and upstream
edits are not atomic.

Absolute paths remain accessible according to runtime permissions, and shell
commands can change directories. Do not present `cwd` or a framework composite
backend as a host/tenant isolation boundary.

## Checkpoints and Security

The LangGraph reference workflow submits a command **outside** a resumable graph.
It checkpoints IDs, interrupts before any observation and resolves an authorized
backend after approval. Resuming only observes; it cannot resubmit. The executable
demo recreates the graph using `MemorySaver` in one process. A persistent store
and an authenticated tenant/thread-to-sandbox mapping are application concerns.

Deep Agents' own interrupt/approval mechanism is also tested through the actual
framework, without premature command execution. That is not an exactly-once
guarantee for a crash between a shell effect and its checkpoint commit.

Do not use the owned-task helper for a real approval pause: an interrupt returns
control to the caller and would trigger cleanup. Borrow an application-owned
sandbox whose lifetime covers the human workflow. Do not trust a browser-supplied
sandbox ID even though the control plane separately enforces organization access.

Graph persistence and sandbox storage are independent. If a runtime expires,
use an explicit retained-workspace recovery workflow; old command IDs cannot be
rebound to a replacement. Do not serialize handles, API/model keys, raw error
causes or route credentials into graph state or telemetry. Logs and file contents
are not automatically redacted. LangSmith tracing is disabled in tests and is an
explicit application/operator decision in real deployments.

## Acceptance and Release

Local and CI checks have no live credentials:

```bash
pnpm --filter @h-sandbox/deepagents typecheck
pnpm --filter @h-sandbox/deepagents test
pnpm --filter @h-sandbox/deepagents test:package
```

These exercise the real framework against a deterministic model/API fixture;
they do not prove native shell compatibility or model quality. Installed-package
checks use ESM imports and strict declaration compilation in a clean consumer,
including the public examples. CI repeats this on Node 20 and 22.
Regressions inspect actual framework ToolMessages for abnormal termination and
incomplete searches, exercise concurrent grep calls and cancelled transfer
batches, and invoke the single-file repair workflow with scripted decisions.
The repair tests also reject a false model success message or modified test
contract and require cleanup in both failure cases.

For native acceptance, choose a **disposable** Harakiri deployment, scoped key and
Linux template with bash, Python 3 and GNU find/grep/sed tools. Supply
`HARAKIRI_API_URL`, `HARAKIRI_API_KEY` and `HARAKIRI_TEMPLATE`; no maintainer
endpoint or Kubernetes context is used. Then explicitly opt in:

```bash
HARAKIRI_DEEPAGENTS_ACCEPTANCE=disposable-runtime \
  pnpm --filter @h-sandbox/deepagents test:native
```

This creates/deletes one sandbox through the public API, verifies real tool
execution, files, failed exits and reconnect, and reports success only after
capacity release. Decisions remain scripted. A separate `examples/run-repair.ts`
execution against an explicitly chosen tool-capable model is needed for real
inference evidence. Neither acceptance command is run against the maintainer's
lab by default or by the local contract suite.

September 24 qualification: [run 36007730164](https://github.com/nabilblk/h-sandbox/actions/runs/36007730164)
passed all 15 SDK/framework gates, including the documented real-model repair,
key revocation and confirmed cleanup/private-material removal. Digest-pinned
Qwen3 4B Instruct produced five responses with no invalid tool calls or truncation.
The independent tests, original-test hash and patch checks passed. Shared
[installation/recovery acceptance](https://github.com/nabilblk/h-sandbox/actions/runs/36007730084)
also passed all 11 gates. These runs use the pinned published API baseline
`0.5.0-rc.9`; they do not certify a new published server pair or OpenShift profile.

The initial adapter preview is available on npm. The
[adapter delivery receipt](../release-notes/deepagents-0.1.0-delivery.md)
records reviewed source, artifact identity and the separate local/CI publishing evidence.
Earlier failures remain in the historical [rc.11 delivery receipt](../release-notes/0.5.0-rc.11-delivery.md);
they are not rewritten as successes. The captured operator-token expiry was
fixed by renewing through real browser SSO before a mutation, without replaying
it. One small repair does not establish model quality.

Use the [npm release runbook](npm-packages.md) for the new-package bootstrap,
package-specific Trusted Publisher, independent adapter versions and anonymous
Node 20/22 verification. The SDK/CLI release target does **not** publish this
adapter. No chart, API migration or cluster rollout is required for a client-only
integration. Installation instructions use the verified npm preview, not a
monorepo build or an unpublished archive.

## Sources

- [Deep Agents sandbox backends](https://docs.langchain.com/oss/javascript/deepagents/sandboxes)
- [Deep Agents backend contract](https://docs.langchain.com/oss/javascript/deepagents/backends)
- [LangGraph design and persistence](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph)
- The inspected `deepagents@1.14.0` npm declarations and implementation.
