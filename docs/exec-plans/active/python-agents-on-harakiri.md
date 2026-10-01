# Execution Plan: Python Agents on Harakiri

**Created**: 2026-10-01
**Author**: Codex, with product direction from Nabil
**Status**: In Progress
**Priority**: {P0-P3}; numeric priority not assigned, next agreed integration milestone
**Estimated effort**: Provisional 15-25 engineering days, delivered sequentially; external adoption and publishing approvals are separate calendar dependencies
**Source baseline**: `6d05f0fd42ae6005e2f004ceca3fc9977b7f4071`
**Delivery scope**: Python SDK, optional Python Deep Agents backend, examples, qualification, documentation and preview distribution

### Implementation Checkpoint (2026-10-01)

The user authorized a dedicated implementation PR and disposable GitHub-hosted
native acceptance. Publication, merging and deployment are not authorized by
that approval; the existing k0s/customer environments remain untouched.

Core sync/native-async packages, protocol adapter, examples, candidate packaging
and source-backed public guides are implemented in draft PR #66. The package
matrix passes on Python 3.11-3.14, with clean macOS/Windows consumers, strict mypy
on 20 source modules, Ruff, and bounded 16 MiB **mock-transport** transfers. The
focused local suite now passes 72 tests, including response-identity validation
and concurrent command observers without resubmission.
Twelve documentation browser checks pass, including 320/390/768/1024/1440px.
The native harness targets rc.10 without changing TypeScript acceptance pins.
Native qualification is not complete: run 36862236924 reproduced a provider
failure uploading 1 MiB. The size-limit gate remains mandatory and separate from
the smaller-file workflow checks; no reduction of advertised support is claimed.
Run 36866686680 passed scoped-key denial, sync/async framework tools, separate-worker
observation, retained-file recovery after TTL expiry, provider loss, abnormal
remote termination, real model repair and key revocation. Four unchanged original
tests pass after the model's repair. The large-file gate still fails with
`502 runtime_files_unavailable`, so overall qualification remains failed. Its
sanitized receipt is preserved in the candidate release record. Final-revision
acceptance and a newly added cross-organization denial gate remain pending.
PyPI account/publishers, public artifacts, deployment and independent adoption
remain separate pending gates. This plan must stay active.

## Context

The next integration should make this promise concrete:

> Take an existing Python agent, change its execution backend, and run its tools on your own Harakiri installation.

Harakiri is a sandbox control plane, not an agent framework and not a client for one runtime provider. Python developers should use its existing lifecycle, authorization, capacity, command, file and workspace contracts without learning provider internals or importing the TypeScript toolchain. Deep Agents is the first optional framework integration, not a reason to make the core SDK depend on LangChain.

The TypeScript work already demonstrated why a thin happy-path wrapper is insufficient. An adapter must preserve abnormal termination, truncated output, acknowledged command identities and partial-transfer recovery information. Its ownership model must not delete an application-owned sandbox when a graph pauses for approval.

This plan was prepared from current source, release evidence, the discussion and current primary Python documentation. No other active exec plan was used as evidence. The historical North Star remains useful direction, not proof that a feature is absent. No Brain file needs editing for this milestone.

### Current Evidence

| Area | Observed baseline | Consequence for this milestone |
| --- | --- | --- |
| Capacity admission | Shipped database-backed admission; see [capacity delivery](../../release-notes/2026-09-11-capacity-delivery.md) | Consume real capacity errors; do not implement a Python-side semaphore as an organization limit. |
| Usage and installation | [rc.10 release](../../release-notes/0.5.0-rc.10.md) and [delivery evidence](../../release-notes/0.5.0-rc.10-delivery.md) describe observations and bounded native qualification | Do not restart these completed projects or expand their qualified support claims. |
| TypeScript integration | SDK/CLI `0.5.0-rc.12`, adapter `0.1.0-rc.2`; [release contract](../../release-notes/0.5.0-rc.12.md) and [delivery](../../release-notes/0.5.0-rc.12-delivery.md) | Reuse behavioral lessons, not TypeScript syntax or its framework version. |
| Framework ownership | [Reliable framework workflows](../../integrations/reliable-framework-workflows.md) separates checkpoints, runtime effects and retained files | Preserve that separation in Python without adding a persistence service. |
| Python distribution | No Python SDK or adapter package exists in this source baseline | A new language surface requires installed-package and actual Python framework tests. |
| Documentation drift | Root README says admission/history are not implemented; capability documentation still labels shipped work unreleased | Correct these specific claims while adding Python documentation, using release receipts as evidence. |
| Adoption evidence | No Python adopter workflow has been independently qualified for this milestone | Do not call package publication proof of adoption or stable readiness. |

The public Python `deepagents` package observed during planning is `0.7.21`, requiring Python 3.11 or newer. This is a qualification candidate, not an already supported version. Its Python protocol and lifecycle differ from the TypeScript integration. The package source, not a mutable documentation example alone, must govern adapter contract tests.

## Success Criteria

- [ ] A developer installs the released Python SDK without Node, the monorepo, Kubernetes credentials, provider credentials or a framework dependency.
- [ ] The first-task comparison contains genuine `create_deep_agent` calls in both examples, with the same model, prompt and invocation; the sandbox difference is backend construction and explicit ownership.
- [ ] A standalone Python program creates or connects to a sandbox, waits for execution readiness, runs commands, transfers verified files and confirms owned cleanup through the public Harakiri API.
- [ ] Sync and async consumers have typed, documented behavior and bounded request/observation/cleanup operations. An async workflow does not block the event loop with synchronous network calls.
- [ ] The adapter makes failed, killed, timed-out and truncated work visible in the actual framework tool result, not just extra response fields the framework ignores.
- [ ] A replacement Python process observes a saved command reference without resubmitting the command or automatically replaying an interrupted graph.
- [ ] Partial file transfers retain completed paths and causes, including cancellation between files. Large supported binary transfers remain within the tested memory budget.
- [ ] Borrowed runtime and retained workspace ownership survives client closure, graph interruption and adapter disposal. Owned disposable tasks clean up on success and failure within an independent budget.
- [ ] Exact built artifacts pass clean-install, native sandbox and actual framework acceptance on isolated runners; publication is followed by verification of the public artifacts.
- [ ] Public guides, repository docs, package READMEs, technical contracts, contributor instructions and release operations describe the same supported surface and exact package versions.
- [ ] At least one independent Python developer completes the documented repair-and-test workflow on their installation without private patches or a maintainer-operated session; limitations and feedback are recorded.

Engineering preview readiness and independent adoption are separate milestones. Do not mark an unexecuted acceptance gate passed because the corresponding code or documentation exists.

## Scope and Non-Goals

### Included

1. A focused Python SDK with synchronous and asynchronous clients, typed data/errors, explicit configuration and ownership-aware resource handles.
2. A separately installable Deep Agents backend using the actual Python framework SDK.
3. Three progressively richer workflows: first local-versus-remote task, independently verified repository repair, and command/file recovery across worker or runtime loss.
4. Candidate and published-package qualification, compatibility probes, secure PyPI publishing and first-class public documentation.

### Excluded

- A complete port of every TypeScript method; new runtime providers; Kubernetes exec; direct OpenSandbox APIs; a Node subprocess bridge.
- A Harakiri agent factory, model router, tracing platform, scheduler, graph checkpoint service or general orchestration framework.
- Automatic migration of the agent loop or model calls into the sandbox. This integration moves shell/file tools; the application still runs the agent and model client.
- Additional framework adapters, MCP servers, template catalogs or hosted-model integrations before this workflow is qualified.
- Customer OpenShift/BackgroundAgent deployment, SCC changes, cluster recovery, production database changes or local k0s upgrades.
- Automatic secret forwarding, credential-vault administration, a new Python CLI, interactive PTY/WebSocket support or unqualified streaming claims.
- Stable-release promotion solely because preview packaging works. Broader adopter evidence, maintenance policy and server compatibility remain explicit gates.

No backend feature or schema change is assumed. If implementation exposes a genuine API defect, isolate it in a separately reviewed change with its own compatibility and release evidence; do not silently expand this client milestone.

## Developer Experience Contract

### The First Screen Must Show The Difference

The following code is a **proposed API design**, not an available package or verified example. Phase 1 must turn it into tested source before public documentation presents it as runnable.

Shared preparation should explain installation, the selected tool-capable model and environment variables once. Do not bury model selection, prompt execution or backend selection in a custom agent helper. Prefer two small readable programs over saving lines with aliases or nested callbacks.

Proposed `first_model.py`, owned by the integrating application:

```python
import os

from langchain.chat_models import init_chat_model

model = init_chat_model(os.environ["HARAKIRI_AGENT_MODEL"])
```

The complete setup must install the chosen model integration explicitly and explain where its credentials live. No model or free hosted endpoint is implied by this file.

Proposed `first_local.py`:

```python
from pathlib import Path

from deepagents import create_deep_agent
from deepagents.backends import LocalShellBackend

from first_model import model

root = Path("deepagents-local")
root.mkdir(exist_ok=True)
prompt = 'Write hello.sh that prints "Hello from Deep Agents". Run it with bash.'

# This executes tools on the host; it is not a sandbox.
backend = LocalShellBackend(root_dir=root, inherit_env=False)
agent = create_deep_agent(model=model, backend=backend)
result = agent.invoke(
    {"messages": [{"role": "user", "content": prompt}]},
    {"recursion_limit": 12},
)
print(result["messages"][-1].content)
```

Proposed `first_sandbox.py`:

```python
import os

from deepagents import create_deep_agent
from harakiri import HarakiriClient
from harakiri_deepagents import HarakiriSandboxBackend

from first_model import model

prompt = 'Write hello.sh that prints "Hello from Deep Agents". Run it with bash.'

with HarakiriClient.from_env() as client:
    with client.sandboxes.task(
        template=os.environ["HARAKIRI_TEMPLATE"], ttl_seconds=300
    ) as sandbox:
        backend = HarakiriSandboxBackend(sandbox)
        agent = create_deep_agent(model=model, backend=backend)
        result = agent.invoke(
            {"messages": [{"role": "user", "content": prompt}]},
            {"recursion_limit": 12},
        )
        print(result["messages"][-1].content)
```

The scope exit, not printing the model answer, establishes cleanup success. The final examples must render the pinned framework's message content correctly, including structured content if applicable. They must not add an unsupported `.create()` or `.close()` to the Python local backend by copying the TypeScript example.

First-task constraints:

- Explicit `HARAKIRI_API_URL`, `HARAKIRI_API_KEY` and an installed `HARAKIRI_TEMPLATE`; no default public account, development secret or presumed template catalog.
- Same prompt/model/invocation on both sides; differences are imports, backend configuration and resource ownership. Keep first-task source around 20-30 readable lines per program, excluding shared model configuration, without treating line count as a quality gate.
- `from_env()` validates configuration and does not initiate a browser login, install packages, execute a model or provision a sandbox.
- Client context exit closes HTTP resources only. `sandboxes.task()` is the explicitly owned disposable runtime boundary.
- Show an adjacent borrowed `connect()` example for existing runtimes; do not force every developer through create/delete on each invocation.
- An async example uses `AsyncHarakiriClient`, `async with`, a native async backend and `agent.ainvoke()`. Never call `asyncio.run()` inside a library method.
- Run the local-shell agent only on a disposable acceptance runner with a controlled filesystem and no ambient credentials. A working directory is not an isolation boundary.

## Architecture and Public Surface

```text
Integrating Python application
  model client + agent loop + checkpoints + tenant/thread authorization
                 |
          Deep Agents (optional)
                 |
       harakiri_deepagents backend
                 |
             harakiri SDK
                 |
      authenticated Harakiri HTTP API
                 |
       configured runtime provider
                 |
        sandbox shell and file tools
```

The adapter must depend on public SDK methods, never SDK-private transport internals. A sandbox reference contains public Harakiri IDs, not provider pod names. Neither package imports Kubernetes libraries or requires direct connectivity to a provider endpoint.

### Package and Source Boundaries

| Proposed location | Responsibility |
| --- | --- |
| `packages/python-sdk/pyproject.toml` | Distribution `h-sandbox`, import `harakiri`; version, public dependencies, build metadata and typing marker |
| `packages/python-sdk/src/harakiri/` | Configuration, transport, typed wire contracts/errors, resource clients and handles, lifecycle contexts |
| `packages/python-sdk/tests/` | Contract, cancellation, timeout, lifecycle, file-integrity and installed-wheel tests |
| `packages/python-deepagents/pyproject.toml` | Distribution `h-sandbox-deepagents`, import `harakiri_deepagents`; narrowly qualified framework/SDK bounds |
| `packages/python-deepagents/src/harakiri_deepagents/` | Backend implementation, execution mapping, transfer handling and adapter-specific errors |
| `examples/python-first-task/` | Real local/remote sync programs, async variant, explicit model setup and pinned environment |
| `examples/python-repository-repair/` | Real agent workload, original test fixtures and independent output verification |
| `examples/python-workflow-recovery/` | Application-owned runtime/reference binding, separate-process observation and retained-file recovery |
| `infra/python-acceptance/` | Python consumers and sanitized receipts using existing isolated acceptance safety primitives |

Names are proposals. PyPI returned 404 for both proposed distribution names during research; this is neither reservation nor proof that registration will be permitted. Confirm ownership before public installation commands are finalized.

Use Python 3.11+ as the initial baseline, a `src/` layout, PEP 561 `py.typed`, Hatchling builds, Ruff, pytest and one strict type checker. HTTPX is the transport candidate; Pydantic v2 is the candidate for validated typed wire models. Keep model packages, Deep Agents and application database clients outside the core SDK. Upstream Deep Agents itself may bring model-related dependencies; do not promise otherwise.

Keep separate package build configurations and a locked Python development/acceptance environment scoped to this work. Do not convert the existing pnpm workspace or add a new monorepo build orchestrator. Select the smallest lock/workspace arrangement that tests both published dependency resolution and local development without accidental editable-install coverage.

Public returns should be typed objects with discoverable attributes, not untyped nested dictionaries. Keep endpoint encoding and validation centralized, but resource modules small. Prefer ordinary methods and composition to metaprogramming, a generic framework hierarchy or a generated multi-thousand-line client. Thin sync/async facades may differ; they must share codecs, error classification and pure request construction.

### First Preview Capability Matrix

Names below are proposed Python interfaces. Freeze them against the actual routes and response schemas in Phase 1.

| Surface | Initial behavior | Existing API contract |
| --- | --- | --- |
| Configuration | Explicit constructor and `from_env()`, sync/async context management | `x-api-key`; configured API origin |
| Discovery | `templates.list/get`, `runtime.capabilities`, `capacity.get` | `/v1/templates`, `/v1/runtime/capabilities`, `/v1/org/capacity` |
| Sandbox lifecycle | `sandboxes.list/create/connect/task`, handle refresh/readiness/renew/kill/wait-terminated | `/v1/sandboxes`, `/{id}`, `/{id}/readiness`, `/{id}/renew` |
| Creation options | Explicit template, TTL, supported resources, explicit environment, existing outbound-policy and workspace attachment contracts | Current create schema; no bypass of org policy |
| Finite commands | `sandbox.run(...)`, typed stdout/stderr/exit/termination information; explicit nonzero checking | `/{id}/run` |
| Tracked commands | `sandbox.processes.start/connect/list`, handle observe/wait/logs/kill, serializable command reference | `/{id}/commands` and `/{commandId}` routes |
| Files | List/stat/read/write/upload/download/mkdir/rename/remove; explicit UTF-8 and bytes APIs | Current `/{id}/files` routes; buffered base64 binary protocol |
| Retained workspaces | `workspaces.list/create/get/archive`, explicit sandbox attachment and detach-state inspection | `/v1/workspaces`; sandbox `workspaceId` |
| Diagnostics | Typed capability/readiness/capacity errors and bounded sandbox/command log retrieval | Existing structured responses; no new telemetry service |

The first preview does **not** promise pause/resume/snapshot helpers, command sessions, PTY/SSE, routes, credential attachment/custody, Git bootstrap helpers, template builds, usage history methods or administrative organization methods. Maintain this matrix publicly. Unsupported SDK surface is not the same as an unsupported server feature.

The repair workflow uses a reviewed fixed fixture and ordinary commands/files, not a new Git integration. A future Git helper or credential feature must build on the server contracts, not shell a secret into an agent prompt. Never silently widen Python scope to claim full TypeScript parity.

### Authorization and Configuration

Map methods to [the current route authorization table](../../../apps/api/src/authorization.ts). Basic execution needs `sandboxes:read` and `sandboxes:write`; discovery needs `templates:read`; explicit capacity inspection needs `org:read`; workspace operations require the corresponding `workspaces:read/write` scopes. Workspace attachment requires `workspaces:write` in addition to sandbox creation permission.

Do not require `org:read` just to create a sandbox, fetch diagnostic capacity opportunistically after every error, or demand administrator/full-access keys in first-task instructions. The server's capacity error must remain usable without a second request. Test authorization with scoped keys and cross-organization IDs; do not turn 403 into a missing-file result.

Validate API URL scheme/authority, reject embedded user credentials, query strings and fragments, normalize paths safely, reject header injection and redact credentials in repr/logging. HTTPS verification is on. Private CA bundles are an explicit client setting; no example defaults to `verify=False`. Follow no redirects that can forward the API key to another origin. Define proxy/environment trust explicitly, with hermetic tests and a documented enterprise proxy/CA path.

## Reliability and Ownership Contract

### Ownership Matrix

| Resource or operation | Owner | Required behavior |
| --- | --- | --- |
| HTTP client constructed by SDK | SDK/client caller | Close pools deterministically; closing it does not terminate runtimes. |
| Caller-supplied transport/client | Caller unless explicitly transferred | SDK must not silently close an injected shared resource. |
| `sandboxes.connect(id)` / backend constructor | Integrating application | Read-only connection; no implicit create, resume, renew or deletion. |
| `sandboxes.create(...)` | Integrating application after acknowledgement | Return/retain accepted ID even if readiness fails; caller chooses cleanup. |
| `sandboxes.task(...)` | Disposable task context | Own only this newly acknowledged creation; wait ready before yielding, then confirm cleanup on every normal or exceptional exit. |
| Retained workspace | Integrating application | Runtime cleanup must not archive/delete retained files. |
| Graph checkpoint and tenant/thread binding | Integrating application | Never imply that sandbox lifetime or files replace graph persistence. |

The owned context must not accept a caller-supplied idempotency key that could replay an earlier creation and transfer someone else's ownership to cleanup. Reject unsupported ownership-affecting options before I/O. Low-level create can expose the server's explicit idempotency contract, with intent keys retained for reconciliation. Do not invent replay guarantees for commands or file mutations that lack such a server contract.

Hold the acknowledged sandbox handle before polling readiness. `running` is not proof of command readiness. On cleanup, wait for the target sandbox's terminal state and confirmed capacity release, not the organization's occupied count reaching zero. A 404, local DELETE timeout or lost response is not proof that deletion finished.

If creation acknowledgement is lost, do not fabricate an ID, blindly replay creation or delete a guessed resource. Raise an outcome-unknown error with safe intent/recovery metadata when available. TTL remains a crash fallback, not evidence that immediate cleanup completed.

### Deadlines, Cancellation and Sync/Async

Separate four clocks: individual HTTP request, remote command execution, local observation/readiness, and owned cleanup. Public Python durations use seconds; convert explicitly at millisecond wire fields, reject non-finite/invalid values and document limits. A framework timeout value of zero must not silently disable Harakiri's bounded-observation policy.

Start with a 120-second total JSON request budget, configurable per client/request, matching the existing TypeScript contract. Poll loops use one monotonic deadline and pass remaining time to every request and sleep. A local timeout neither kills a remote command nor proves a mutation failed. All phases, including response body consumption, must be bounded.

**Transport design gate:** HTTPX's normal connect/read/write/pool timeouts are not a wall-clock request deadline. Phase 1 must prove total deadlines for sync and async calls with a deliberately slow response body before choosing an implementation. Prefer supported public APIs and a small transport module. If a shared async engine with a single client-owned AnyIO blocking portal is needed for the sync facade, record that decision, test resource/thread ownership and document it. Do not use abandoned per-request threads, event-loop hijacking, private HTTPX internals or label inactivity timeouts as total deadlines. An unproven deadline implementation blocks publication, not a reason to weaken the documentation.

Async cancellation must remain cancellation, not be converted into an ordinary success or file-not-found result. Owned cleanup has a separate bounded/shielded context. Preserve primary and cleanup failures together, including `BaseException` cancellation when appropriate on Python 3.11+. Cleanup failure must retain the sandbox ID and last known state. Never suppress `KeyboardInterrupt`, lose the original cause or cancel a borrowed remote command automatically when the caller stops observing it.

No automatic mutation retries in the first preview. Bounded reads may be polled by explicit wait methods; this is different from replaying submission. Preserve HTTP status, server error code and safe structured details; a `retryable` hint does not make a mutation idempotent.

### Command and File Semantics

- Finite command results preserve stdout, stderr, nullable exit code, finish reason and truncation. Nonzero checking is explicit; exceptions retain the result without dumping it into logs automatically.
- Tracked submission happens once. After acknowledgement expose `{sandbox_id, command_id}` through a serializable reference and a callback before observation; callback failure retains the reference and cause.
- A new process can connect to that reference and retrieve final logs without POSTing a new command. Lost acknowledgement is a different, explicitly uncertain recovery case.
- Paths are POSIX sandbox paths, resolved relative to the runtime-advertised working directory where supported. Do not use the host OS path separator or claim cwd/path normalization is a filesystem security boundary.
- Implement buffered binary decoding directly into bytes, with validated encoding, declared size, actual size, advertised limits and SHA-256 where supplied. No per-byte Python integer list or silent UTF-8 coercion of binary data.
- Bound the encoded response before JSON/base64 decoding; the existing binary protocol expands memory. Defaults must account for the advertised 16 MiB file limit and fail early on oversized responses.
- Run a 16 MiB round-trip under a declared 256 MiB Linux memory limit in a core-only consumer. Record peak RSS and the exact environment; if the target fails, fix allocations or explicitly lower the supported limit before release.
- Adapter batches are ordered and non-atomic. Default to at most 64 files and 32 MiB aggregate content, bounded by actual runtime per-file limits; any override needs a hard ceiling and tests.
- Cancellation between files goes through the transfer accounting path with `completed_paths` and original cause. In async code, use a cancellation-specific exception compatible with `asyncio.CancelledError`, not an ordinary `Exception` that breaks task cancellation. Ordinary batch failures use the typed transfer error; preserve synchronous interruption semantics as well. On download those paths mean verified content was received, not that the application saved it to disk.
- Keep expected per-file path errors distinct from fatal authorization, transport, capacity, integrity and cancellation failures. Do not falsify those failures to fit a framework result type.

## Python Framework Contract

Qualify one exact Python Deep Agents version first. `0.7.21` is the observed candidate; record its distribution hash and exact resolved LangChain/LangGraph dependencies. Do not reuse the TypeScript `1.14.0` peer or assume its protocol naming. Widen dependency bounds only after tests, with a separate latest-version probe for early warning.

Use the upstream `BaseSandbox` and public protocol when they preserve the necessary information. Adapt only the specific inherited methods whose behavior fails qualification; reuse upstream scripts rather than copy/paste a fork. Test what the agent receives through the real execute/read/search/write tools, not just direct backend return objects.

Required behavior:

1. `HarakiriSandboxBackend` borrows a synchronous SDK sandbox. `AsyncHarakiriSandboxBackend` borrows an async one and overrides the async primitive paths. An unsupported sync call on an async-only backend fails clearly before I/O rather than running a nested event loop.
2. Verify native async execution and inherited async list/read/write/edit/grep/glob/upload/download paths. Upstream's default thread-offloaded sync implementation is not proof of native async transport.
3. Preserve nullable exit codes. Add a concise framework-visible termination notice for timeout, kill or abnormal completion when the framework otherwise discards the finish reason. Never append a false numeric success/failure code.
4. Propagate provider and local clipping through grep/glob/list/read results where applicable. Discard torn final matches safely; ordinary searches must not look complete when results were truncated. Test multibyte boundaries and the actual tool-visible representation.
5. Preserve completed transfer paths and causes through all failure positions. Expected individual file errors use the pinned framework's documented result shape; fatal batch failures remain typed exceptions.
6. Keep output limits, command timeouts and cwd explicit. Qualify required image utilities from the pinned upstream scripts and document a tested template; do not install missing tools during backend construction.
7. Expose an acknowledgement callback/reference for application recovery. The callback is not a transaction with a graph checkpoint; do not promise exactly-once tool effects.
8. Disable optional framework output-offload behavior until its runtime utilities, file paths, retention and limits are independently qualified. Do not imply model-output evaluation or chain-of-thought capture is part of the adapter.

The recovery example is application code. Use an official LangGraph SQLite checkpointer in a documented single-worker demonstration, with sequential processes opening the same application-owned database. Neither published package gains a database or checkpointing dependency. Keep the sandbox/command binding alongside the application's state, and never automatically replay an uncertain invocation after restart. Distributed worker coordination and a PostgreSQL reference are deferred; do not suggest that SQLite or a process-local lock provides distributed fencing.

## Phases

### Phase 1: Freeze The Experience and Contracts

**Status**: Complete for the candidate contracts; PyPI ownership remains in Phase 7
**Deliverables**: Reviewed example design, capability/permission matrix, dependency and transport decisions, testable acceptance specification.

- [x] Write the real first-local/first-sandbox source against the selected Python framework and verify its imports/lifecycle. Keep the model/prompt/invocation visible and identical.
- [x] Finalize package names, imports, method naming, return models, error hierarchy and preview versioning; confirm Python 3.11+ policy against actual dependencies.
- [x] Inspect the exact candidate framework distribution and pin its resolved test environment; qualify sync/async protocol, inherited tool behavior and required template utilities.
- [x] Inventory selected endpoints against [OpenAPI](../../openapi.json), route schemas and [authorization](../../../apps/api/src/authorization.ts). Record where runtime responses differ from documentation before writing wrappers.
- [x] Specify borrowed versus owned semantics, idempotency/unknown outcomes, timeout units, limits, transport injection and client-close behavior.
- [x] Build a minimal slow-header/slow-body/disconnect/cancellation transport experiment. Prove the total-deadline design in both modes and record an ADR, including rejection of unsafe thread/loop shortcuts.
- [x] Pin the recovery example's official SQLite checkpoint dependency, define its single-worker boundary and persist acknowledgement separately from uncertain graph progress, without adding a framework persistence feature.
- [x] Draft the documentation outline and native acceptance cases. Independent adopter recruitment remains pending under Phase 8.

**Exit gate**: The paired examples are understandable without an invented agent abstraction, and the transport/ownership design has executable evidence. Unresolved deadline or framework semantics stop package implementation from hardening an incorrect API.

### Phase 2: Establish The Python Package and Transport Foundation

**Status**: Complete for the candidate; cross-platform matrix passed
**Deliverables**: Buildable core wheel/sdist, typed configuration/models/errors, shared request machinery, hermetic tests.

- [x] Add the core package with scoped dev tooling, license metadata, project URLs, `py.typed`, a minimal public export surface and an isolated build.
- [x] Implement validated configuration and API-key headers, verified TLS/private CA support, explicit proxy policy and non-leaking repr/error formatting.
- [x] Implement the approved sync/async transport and client ownership, total request/body budgets, response byte bounds and safe transport injection.
- [x] Centralize snake_case-to-wire encoding, optional/null fields, UTC timestamps, typed response parsing and backward-compatible handling of additional response fields. Unknown states must never be interpreted as readiness/success.
- [x] Map server status/code/details into typed authentication, authorization, validation, conflict, capacity/rate-limit, unsupported, provider, transport, deadline and outcome-unknown errors. Preserve causes.
- [x] Use representative actual API fixtures shared at the wire level with TypeScript tests where useful; do not generate Python implementation from the TypeScript client.
- [x] Test configuration mistakes, secret redaction, foreign redirects, malformed JSON, bounded body reading, all error classes and thread/task/socket cleanup.
- [x] Install the wheel and sdist in fresh consumers outside the checkout, without `PYTHONPATH` or editable installs. Verify that importing core does not import Deep Agents, Node bridges or provider clients.

**Exit gate**: Packaging, lint/type checks and deterministic transport tests pass across the supported Python matrix; no unbounded HTTP body or request path remains.

### Phase 3: Implement The Focused Sandbox SDK

**Status**: Complete for the candidate surface; full transfer-limit qualification remains blocked in Phase 5
**Deliverables**: Sync/async lifecycle, commands, files, workspaces and owned task context, with contract tests.

- [x] Implement discovery and lifecycle resources from the first-preview matrix, keeping accepted handles and structured errors intact.
- [x] Implement readiness/termination observers using execution readiness and per-sandbox capacity release, with one bounded monotonic budget.
- [x] Implement owned task context entry/exit, independent cleanup cancellation/budget, safe option restrictions and combined primary/cleanup errors.
- [x] Implement finite and tracked commands, serializable references, acknowledgement callback and read-only reconnection/final-log observation.
- [x] Implement typed text/binary file operations, checksum/size checks and working-directory resolution without host-specific path behavior.
- [x] Implement explicit retained workspace lifecycle/attachment without auto-archive, automatic replacement or fictional process-state persistence.
- [x] Test accepted-but-not-ready creation, capacity rejection, response loss, callback failure, expired runtime, concurrent observation and cleanup uncertainty.
- [x] Verify sync/async behavioral equivalence, non-blocking async calls, cancellation before and after acknowledgement, and bounded resource disposal.
- [x] Execute binary-memory and Unicode/truncation fixtures under declared limits. Preserve source artifacts for regression tests without embedding real secrets. These codec tests do not qualify the failing native upload limit.

**Exit gate**: The core can execute the model-free create/run/files/cleanup workflow and recover an acknowledged command reference in a second process. It does not need Deep Agents to be useful.

### Phase 4: Implement The Real Deep Agents Backend and Examples

**Status**: Complete for the candidate; actual framework and one genuine model workflow passed
**Deliverables**: Optional adapter wheel/sdist, actual framework tool tests, three runnable workflows.

- [x] Add the separate adapter package and narrowly qualified SDK/framework dependency bounds. Keep core installation independent.
- [x] Implement borrowed sync and native async backends using public SDK handles and upstream protocol types.
- [x] Cover actual framework-visible timeout/kill/error output, numeric/non-numeric exit status, truncation and inherited search/file tool behavior.
- [x] Implement bounded batch transfers and error metadata, including cancellation after at least one completed file and integrity failures.
- [x] Add simple local/remote first-task programs and an async equivalent, with explicit model preparation and no hidden execution helper.
- [x] Add the repository-repair workflow: fixed broken fixture, original test hash, model invocation, artifact retrieval, original test execution and independent patch verification. Native run 36866686680 passed four unchanged original tests after genuine model/tool work.
- [x] Add the application-owned workflow: persist command acknowledgement, exit worker, observe from a new process without replay, expire runtime, reconnect retained files in a deliberately new runtime. Native run 36866686680 passed.
- [x] Demonstrate graph interruption with a borrowed sandbox and explain why an owned task context is not the approval-pause boundary. Real SQLite checkpoint reopening is tested with deterministic framework messages; native model evidence is separate.
- [x] Make errors actionable without including prompts, file contents, model/API credentials or tokens in exception repr/default logs. The caller can explicitly access returned command output.

**Exit gate**: Actual Python framework tools use Harakiri successfully, and every reliability regression has a reproducing test. A model-free backend test is not labeled an agent workflow.

### Phase 5: Qualify On Isolated Native Infrastructure

**Status**: In Progress; isolated runner approved, rc.10 large-upload failure blocks full qualification
**Deliverables**: Reproducible candidate-artifact qualification and sanitized evidence, without touching existing deployments.

- [x] Add a dedicated Python workflow/harness that reuses [existing acceptance ownership guards](../../../infra/acceptance/context.mjs) and known installation primitives without weakening or repinning TypeScript acceptance.
- [x] Run lint, strict type checks, unit/contract and clean-wheel consumers on Python 3.11, 3.12, 3.13 and 3.14. Use Linux for native runtime tests; add macOS/Windows core consumer checks with POSIX remote-path fixtures.
- [x] Select an immutable published server/chart/image baseline and record digests. Target the current documented API baseline (rc.10 or newer); test every minimum-version claim rather than inferring it from TypeScript results.
- [x] Use only a disposable GitHub-hosted native amd64 fixture with explicit kubeconfig/cluster identity, scoped test credentials, disk/memory checks and an always-run owned cleanup path.
- [ ] Qualify real sync/async commands, readiness, capacity rejection, scoped/cross-org access, file integrity/limits, borrowed survival and owned termination/capacity release.
- [ ] Inject connection loss, slow/truncated bodies, provider interruption and worker loss only inside the owned fixture. Assert no blind resubmission and retain acknowledged references.
- [x] Verify retained-file recovery through a new runtime and separate graph/command identities. Do not claim memory/process restoration or distributed exactly-once execution.
- [ ] Run actual Deep Agents with deterministic tool-call fixtures for repeatable contract failures; report this separately from the real model workflow.
- [x] Run one genuine tool-capable model repair with independent tests and patch inspection. Digest-pinned local Qwen passed in run 36866686680. Its receipt is not a benchmark or final-revision qualification.
- [x] Export an allowlisted JSON/Markdown receipt: source SHA, package hashes, server/template/model versions, Python/dependency versions, runner architecture, case outcomes, cleanup and explicit limits. Do not upload raw credentials, kubeconfigs, unrestricted logs or checkpoints. Preserve the sixth-run receipt in Git; newer runs additionally record key LangChain/LangGraph dependency versions.
- [x] Add a scheduled compatibility probe for newer Python Deep Agents dependencies. Probe failures report drift; they neither widen package bounds nor publish automatically.

**Exit gate**: Candidate wheel hashes have complete passing required evidence. Fork PRs receive hermetic tests, not publisher permissions or privileged native workloads. Any skipped native/model gate is a documented incomplete gate, not success.

### Phase 6: Complete Documentation and Public UX

**Status**: In Progress; candidate guides and browser checks pass, delivery evidence being recorded
**Deliverables**: One coherent learning path across website, Git and package documentation, plus technical/contributor/operator material.

- [x] Add `docs/python-sdk.md` and `docs/integrations/deepagents-python.md`: installation, environment, first task, existing sandbox, async use, lifecycle, commands/files, retained workspace, error recovery and supported-version matrix.
- [x] Add public `#docs/python-sdk` and `#docs/deepagents-python` pages. Keep the existing TypeScript routes and external links working; label languages explicitly in navigation and cross-links.
- [x] Sequence the public narrative: what runs where; first successful task; local-versus-sandbox; real repository repair; ownership and limits; recovery; API reference. Avoid an enormous API list before the first working example.
- [ ] Keep source examples, downloads, Markdown exports and visible code in sync. Compile/typecheck/run extracted examples against the installed packages; do not maintain drifting prose-only pseudo-APIs.
- [x] Use Python syntax highlighting and correctly labeled shell/env snippets. Keep side-by-side heading/description/code rows aligned at wide widths and stack naturally on narrow screens without wrapping identifiers across columns.
- [x] Cover missing API URL/key/template, 401/403, capacity exhaustion, readiness failure, remote timeout, local observation timeout, framework mismatch, missing template tools, large files and incomplete cleanup.
- [x] Write technical design/ADR documentation for transport deadlines, ownership, typed errors, protocol adaptation and limits; add an endpoint/scope contract table and maintainability rules.
- [x] Update contributor documentation with the locked Python environment, lint/type/test/build commands, native safety boundary, fixture rules and compatibility-update procedure.
- [x] Update release/security/internal operations docs with PyPI bootstrap, protected publishers, exact artifact verification, partial release recovery, yanking and incident handling. Keep all secret/account recovery material out of Git.
- [x] Update package READMEs, root README, docs index, SDK overview, capability matrix and public integration inventory. Correct the specifically identified stale capacity/history/workspace statements using shipped evidence.
- [x] Browser-test documentation at 320, 390, 768, 1024 and 1440px: navigation/deep links, language labels, code copy/download, keyboard focus, search, export, side-by-side alignment and page overflow.
- [x] Add a candidate release record with target versions, actual results, current gaps and exact qualification links; keep native/publication outcomes pending until evidenced and do not describe an unreleased wheel as installable from PyPI.

**Exit gate**: A fresh reviewer can follow both first-task and recovery paths using documentation only. Repo/package/public pages agree; existing TypeScript guides and routes remain valid.

### Phase 7: Publish and Verify The Preview

**Status**: Not Started
**Deliverables**: Public Python preview artifacts, protected unattended publishing and a verified public documentation rollout.

- [ ] Confirm PyPI ownership for both names, maintainer access/2FA and project metadata. Use exact repository/workflow/environment Trusted Publisher bindings, including pending publishers for first publication where supported.
- [ ] Introduce independently versioned Python preview releases, provisionally `0.1.0rc1`, with distinct tags such as `python-sdk-v0.1.0rc1` and `python-deepagents-v0.1.0rc1`. Verify they cannot trigger npm or unrelated image/chart releases.
- [ ] Build wheel/sdist once from the reviewed source; qualify those exact hashes. Use separate read-only build/test jobs and a protected publication job with only required OIDC permissions.
- [ ] Test publication against TestPyPI under separate publisher bindings. Do not mix TestPyPI with the production index through unrestricted `--extra-index-url`; keep artifact selection and dependency resolution explicit.
- [ ] Publish the SDK first, verify its public files/digests, then publish the adapter tested against that exact public SDK dependency. Record partial success rather than blindly rerunning or overwriting a version.
- [ ] Verify anonymous clean `pip` and `uv` installation outside the checkout, package metadata/license/typing files, dependency bounds and provenance/attestations where supported. Public instructions use exact preview pins.
- [ ] Rerun a fresh native consumer using the actual public package pair and supported server baseline. Local candidate success alone is not public-artifact qualification.
- [ ] Publish release notes and source links with separate statuses for SDK publication, adapter publication, native verification and public documentation deployment.
- [ ] Deploy only the web/documentation update when authorized, using the existing guarded deployment process. Preserve API/auth origins, operator values, secrets and running workloads; no API/chart/schema upgrade is required by this plan.
- [ ] Verify public docs load the new routes and exact install commands. Keep previous packages available for rollback; fix releases with a new version and use yanking only with a documented incident reason.

**Exit gate**: Both public artifacts install and run, the release receipt matches their hashes, Trusted Publishing is configured, and the live documentation is verified. No reusable PyPI token is requested in chat or stored in the repository.

### Phase 8: Validate Adoption and Close The Milestone

**Status**: Not Started
**Deliverables**: Independent first-task evidence and an evidence-based follow-up backlog.

- [ ] Recruit at least one Python developer outside the implementation session, using their Harakiri installation and published documentation/packages rather than maintainer credentials.
- [ ] Record time to first successful task, confusing steps, install/runtime/model failures and cleanup outcome. Suggested usability target: within 15 minutes once API credentials, a qualified template and model access are available; report actual observations rather than claiming a universal SLA.
- [ ] Have the developer repair the fixed repository, run the original tests independently, retrieve the patch and verify owned cleanup. Capture their consent before publishing any identifying information.
- [ ] Resolve material first-task blockers in a subsequent preview and repeat affected acceptance. Do not use successful scripted CI as a substitute for independent adoption.
- [ ] Update support/compatibility documentation with actual limitations and prioritize follow-up demand. Another framework adapter is not automatically next.
- [ ] Mark this plan complete only after required gates are evidenced, then move it to `docs/exec-plans/completed/`. If adoption is still pending, retain an explicit pending status rather than archiving as complete.

**Exit gate**: Python is a usable integration path with independent evidence, not just a second published client. Stable promotion is a separate decision requiring broader adoption and an explicit support policy.

## Verification Matrix

| Layer | Essential cases | Evidence |
| --- | --- | --- |
| Static/package | Strict typing, lint, wheel/sdist, license, `py.typed`, clean environment, no hidden local import | CI results and built artifact hashes |
| Wire/configuration | Actual route schemas, scoped keys, foreign redirects, unknown fields/status, size bounds, redaction | Deterministic unit/contract suite |
| Transport | Slow connect/headers/body, stalled chunks, disconnect, cancellation, total deadline, no worker/resource leak | Fault-injection tests in sync and async modes |
| Lifecycle | Accepted/readiness failure, response ambiguity, capacity rejection, independent cleanup, borrowed survival, release uncertainty | Contract tests plus native fixture |
| Commands | Null/zero/nonzero exit, killed/timed-out result, final logs, callback failure, persisted ID, no resubmit | Actual API and actual framework-tool assertions |
| Files | UTF-8/binary, 16 MiB artifact, checksum mismatch, encoded size limit, partial batch, between-file cancellation | Integrity/memory tests and native transfer |
| Framework | Actual execute/read/write/edit/search tools, torn match, output limit, native async path, interrupt ownership | Exact pinned Python Deep Agents tests |
| Recovery | New worker observes acknowledged command; lost ack blocks replay; files outlive expired runtime; workspace attachment preserved | Separate-process native evidence |
| Real agent | Genuine model invocation, original tests unchanged, independently passing repair, verified patch and cleanup | Model/runtime/template identities and results |
| Documentation | Exact runnable snippets, source/download/export consistency, responsive comparison, navigation/accessibility | Focused doc tests and browser evidence |
| Public release | Anonymous installation, public hash equality, exact dependency pair, new native run, public routes | Delivery receipt with publication/deployment statuses |
| Adoption | Independent install/task/recovery feedback without private patches | Consent-based observation, remaining issues |

Do not invent provider portability, HA, restricted OpenShift, performance or all-model claims from one native Linux acceptance run. The Python SDK being portable does not expand the runtime deployment support matrix.

## Execution and Safety Boundaries

- Work sequentially in reviewable changes: contract/design; core foundation; resources/lifecycle; adapter/examples; native acceptance; documentation; publication. Update this plan after each accepted phase, including failed qualification attempts.
- Local development uses hermetic mocks, parser/type checks and package builds in dedicated environments. Do not install dependencies into system Python or overwrite user configuration.
- No kubectl, Helm, cluster bootstrap, Lima/CRC restart, tunnel change or global process cleanup against this machine is authorized by preparing this plan.
- Native tests require an explicitly owned disposable runner fixture. A missing identity guard fails closed; ambient kubeconfig or an existing developer cluster is never a fallback.
- Git branch pushes, PR merges, production publication and web deployment are separate consequential actions; this planning request performs none of them. Confirm the execution/release instruction when those phases are reached.
- Do not read or modify user-owned `docs/cot/`, unrelated active plans, customer installation repositories or other Brain notes while implementing this milestone.
- Keep failure diagnostics private by default and publish only allowlisted sanitized receipts. Model prompts, checkpoints and command output can contain secrets even when HTTP headers are redacted.

## Risks and Decision Gates

| Risk | Required mitigation / decision |
| --- | --- |
| Another SDK with verbose examples | Review the actual side-by-side programs first; reject new agent factories and keep shared model setup explicit. |
| False request deadline guarantees | Prove total body-inclusive deadlines before committing the transport architecture; retain the slow-body regression. |
| Async API that hides blocking I/O | Qualify every inherited async tool path and run event-loop responsiveness tests, not only typechecks. |
| Framework churn | Pin a qualified Python release, test the real tool output, probe latest separately and document supported combinations. |
| Context manager deletes application state | Ownership matrix, rejected replay-affecting options, borrowed approval example and confirmed target-specific cleanup. |
| Model nondeterminism or disappearing free endpoint | Separate deterministic framework contracts from a genuine model gate; record the exact model and do not depend on an advertised free endpoint. |
| Overclaiming recovery | Explicit unknown submission state, durable acknowledgement reference, no automatic graph replay or exactly-once claim. |
| PyPI namespace/account approval delay | Verify names and protected publishers before announcement; release checklist exposes external approvals as pending. |
| Two packages only partially published | Publish in dependency order; retain immutable successful artifacts and a partial-release receipt; never fabricate completion. |
| Duplicated docs and stale feature claims | Source-backed examples, exact version matrix, targeted drift fixes and browser/export tests. |
| Scope growth into existing completed work | No new server/provider/customer work without a separately justified defect and review. |
| No concrete adoption | Complete the technical preview honestly, keep adoption pending, and use independent feedback before expanding adapters. |

Inputs needed during execution, not secrets to paste into a plan:

1. PyPI maintainer/project ownership and approval of pending publishers when publication is reached.
2. A qualified template reference and model setup for isolated acceptance, recorded immutably without storing credentials.
3. One independent Python adopter for the final gate; if not yet available, record that as pending evidence.

All other initial engineering choices have proposed defaults or an explicit Phase 1 decision gate. Do not stop implementation for a cosmetic preference, and do not silently guess at a security or ownership contract.

## Primary References

Checked during planning on 2026-10-01. These sources inform the contract but are not a substitute for installed-version tests.

- [Python Deep Agents sandbox integration](https://docs.langchain.com/oss/python/deepagents/sandboxes): genuine framework backend integration and application/runtime separation.
- [Python Deep Agents package metadata](https://pypi.org/pypi/deepagents/json): observed version `0.7.21`, Python floor and dependency metadata. Archive the exact distribution hash in qualification.
- [Pinned 0.7.21 source distribution](https://files.pythonhosted.org/packages/59/6a/1dcd74589ece546a16280c33646c45439666aa40755f6e6c7bbb13ca86db/deepagents-0.7.21.tar.gz): Python backend protocol, local-shell constructor and inherited implementations inspected without installing them into the development environment.
- [HTTPX timeouts](https://www.python-httpx.org/advanced/timeouts/): phase/inactivity timeouts; a total operation deadline needs an additional proven design.
- [Python packaging tutorial](https://packaging.python.org/en/latest/tutorials/packaging-projects/): standard build metadata and wheel/sdist distribution workflow.
- [PyPI pending Trusted Publishers](https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/): initial project creation through a configured publisher.
- [PyPI publisher configuration](https://docs.pypi.org/trusted-publishers/adding-a-publisher/): exact publisher binding; account approval and CI permissions are distinct concerns.
- [Current TypeScript SDK source](../../../packages/sdk/src/index.ts), [request contract](../../../packages/sdk/src/request.ts), [binary files](../../../packages/sdk/src/files.ts): behavior to preserve, not code to mechanically translate.
- [Current TypeScript adapter](../../../packages/deepagents/src/backend.ts), [execution mapping](../../../packages/deepagents/src/execution.ts), [owned lifecycle](../../../packages/deepagents/src/lifecycle.ts): previously addressed failure cases to test independently in Python.

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
| --- | --- | --- | --- |
| 2026-10-01 | Deliver Python agents as a focused SDK plus optional Deep Agents backend. | A real integration path without coupling all SDK users to one framework. | SDK-only release; framework-only wrapper; several adapters at once. |
| 2026-10-01 | Freeze the minimal local/remote example before implementation. | Developer experience is the primary design artifact, not an after-the-fact tutorial. | Port the TypeScript surface first and simplify examples later. |
| 2026-10-01 | Keep all runtime access behind the Harakiri API. | Preserve authorization, capacity, policy and provider independence. | Direct provider SDK, Kubernetes exec or Node bridge. |
| 2026-10-01 | Use explicit client, borrowed handle and owned task lifetimes. | Prevent graph interruption or client disposal from deleting application-owned state. | Implicit auto-delete backend or hidden agent factory. |
| 2026-10-01 | Include sync and native async, with a transport-deadline proof gate. | Python applications need both; correctness cannot be inferred from HTTPX timeout arguments. | Sync-only preview; thread-offload marketed as native async; unbounded body reads. |
| 2026-10-01 | Qualify Python Deep Agents independently of the TypeScript peer. | Languages have different package versions, protocols and inherited behavior. | Reuse the TypeScript version/assumptions. |
| 2026-10-01 | Keep recovery orchestration in application examples. | Checkpoints, tenant mapping and worker coordination are application concerns. | Database/runtime ownership embedded in the SDK. |
| 2026-10-01 | Start Python recovery with an application-owned SQLite checkpointer and sequential workers. | Demonstrate process restart and command observation without adding another database deployment. | Port the entire TypeScript PostgreSQL workflow before validating Python demand. |
| 2026-10-01 | Separate candidate, published-artifact and independent-adopter gates. | Passing source tests is not evidence that users can install and complete a workflow. | Publish after unit tests and call the milestone complete. |
| 2026-10-01 | Do not change the existing cluster or customer installations. | This is a client integration milestone with isolated acceptance. | Testing by rebuilding the running lab or adding BackgroundAgent. |
| 2026-10-01 | Keep the native large-file gate mandatory and independent of agent/recovery gates. | rc.10 failed a 1 MiB upload; passing the mocked 16 MiB memory fixture is not live transfer proof. A provider correction needs separate review and release evidence. | Shrink the fixture and claim qualification; bypass the API in Python; silently patch the runner's API. |

## Tech Debt Incurred

None incurred by planning. Deferred features in the capability matrix are deliberate scope limits, not hidden parity claims. Record any implementation shortcuts here with an owner, consequence and exit condition before accepting them.

## Completion Notes

Implementation is in draft [PR #66](https://github.com/nabilblk/h-sandbox/pull/66).
Candidate packages are not published. Native acceptance failures and remaining
delivery gates are recorded in [the candidate record](../../release-notes/python-agents-preview.md).
No production deployment, local cluster operation, registry publication or Brain
change has been made. Keep this plan active until native, public-artifact and
independent-adopter gates are evidenced; do not archive it as completed.
