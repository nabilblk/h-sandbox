# TypeScript SDK Developer Experience Assessment

Date: September 12, 2026.

Status: research and proposed priorities, not an approved execution plan or an
implemented SDK redesign. Application code, published packages and deployments
were not changed for this assessment.

## Executive Decision

Improve the TypeScript developer contract before translating it into Python.
Harakiri has substantially more capability than its first-use code communicates.
The principal gap is not another runtime primitive: it is the work required to
choose the right API, interpret results, recover accepted work, manage output,
move bytes and confirm cleanup.

Keep Harakiri's identity: an OSS, self-hostable sandbox control plane with a
consistent developer contract. Learn from other SDKs' composition patterns, not
their deployment assumptions, process identities or entire feature catalogs.

The proposed sequence is:

1. Correct unsafe or surprising behavior and specify one coherent contract.
2. Make common workflows concise through the existing sandbox-object surface.
3. Prove failure recovery, publishing and documentation using the same recipes.
4. Carry the validated contract into an idiomatic Python SDK; select an adapter
   only after a concrete integration needs it.

This is not a recommendation to rewrite the SDK wholesale, introduce a second
runtime path, reopen customer OpenShift work or customize for BackgroundAgent.

## Scope and Evidence

Harakiri baseline: source commit
`8bbda404f3f8ece9cdde5362817d3707ebb673b7`, package `0.5.0-rc.10`.
Inspected the SDK implementation, types, tests, README, integration documentation,
and examples for commands, files, Git, previews, OpenCode, workspaces and capacity.
No active exec plan or Brain file was used for this assessment.

Peer comparison uses official documentation and E2B's official source, retrieved
September 12. npm metadata reported `e2b@2.49.1`, `@vercel/sandbox@3.3.0` and
`@daytona/sdk@0.211.2`. These are package metadata observations, not claims that
all cited documentation corresponds exactly to those tarballs. E2B's documentation
navigation exposed an older versioned reference and some pages were inaccessible;
its official source was used to corroborate command/file behavior.

Verification performed locally:

- SDK suite: **69 passed, zero failed or skipped**.
- SDK TypeScript check: passed.
- Offline characterization: synthetic fetch responses reproduced the findings
  recorded below. Dummy credentials and `.invalid` destinations only; no SDK
  HTTP request left the process.
- TypeScript compiler/AST inspection: measured declared surface and checked input
  combinations without creating files in the SDK source directory.

The temporary probe is `/tmp/harakiri-sdk-dx-8bbda40.mjs`; it is characterization,
not a permanent regression suite. No competitor cloud runtime was executed, no
performance ranking was measured, and no production exploit is claimed.

## What Is Already Good

- `client.sandboxes.create()` and `HarakiriSandbox` already bind runtime operations
  to a sandbox. Do not propose adding a sandbox object as though it were absent.
- Default creation waits for execution readiness, not merely inventory status.
  The readiness wait propagates a deadline/abort signal into in-flight requests.
- Create/resume accept idempotency keys. SDK mutations are not blindly retried.
- Typed HTTP errors expose useful codes and structured capacity details.
- Command events already provide an async iterator, cursor-based reconnect and
  cancellation that does not restart the command.
- Files, Git, protected routes, HTTP readiness, workspaces, egress and credential
  references are present. Many improvements can compose existing capabilities.
- Kill acknowledgement is intentionally not fabricated into confirmed termination.
- The npm package is self-contained and does not require a public shared package.

These are valuable guarantees. A shorter example that hides unknown execution,
turns a private preview public, exposes a real credential, silently replays work
or deletes an attached workspace would be a regression, not better DX.

## Findings That Change Priority

### 1. Route Helpers Need Correctness and Safety Work First

`createRouteFetch()` accepts an absolute URL or a `Request`, then injects route
and optional Basic authentication without restricting the destination. An
offline probe confirmed both headers were supplied for a different origin.
It also reduces a `Request` to its URL, losing its method, body, caller headers
and signal unless independently reconstructed in `init`.

This affects the advertised integration with upstream SDKs that accept custom
fetch functions. Fix standard Fetch semantics, credential scope, and redirect
handling before expanding that pattern. Scope should include the intended route
path where multiple protected routes share an API origin, not only the hostname.
Redirect behavior was identified for additional testing, not live-exploit tested.
[Implementation](../packages/sdk/src/index.ts#L850).

Separately, `routes.getHost()` / `getUrl()` call `exposePort()` and submit a POST
with default `accessMode: "public"`. A name suggesting a read can therefore create
a public route. The API does reject a conflicting mode on an existing route;
this assessment does **not** claim that an existing protected route is silently
downgraded. Make exposure an explicit mutation and retrieval a read.
[SDK](../packages/sdk/src/index.ts#L2657),
[server conflict guard](../apps/api/src/services/sandbox-runtime.ts#L1770).

### 2. A Timeout Does Not Consistently Bound Waiting

Command, snapshot and route waits check elapsed time between requests but do not
bound the request itself. Each accepted a successful synthetic response after
about 72 ms with a configured 10 ms wait budget and a 70 ms simulated request.
No deadline signal was passed. An indefinitely stalled request can stall the wait.
This is distinct from the newer sandbox-readiness wait, which already implements
the stronger contract.

With explicit `statuses: ["running"]`, an already-failed command also becomes a
wait timeout rather than the immediate terminal failure that callers need.
Default success waits do throw the existing command-ended error.
[Command wait](../packages/sdk/src/index.ts#L2149),
[snapshot wait](../packages/sdk/src/index.ts#L1840),
[route wait](../packages/sdk/src/index.ts#L886).

Use shared deadline/cancellation machinery, but distinguish HTTP request budget,
local observation deadline, remote execution timeout and sandbox TTL. Aborting
observation must not imply that the remote task has stopped.

### 3. Idempotent Creation Is Not Idempotent Git Bootstrap

Create-with-source performs Git bootstrap in the SDK after the sandbox POST.
Calling it twice with the same key and the same returned sandbox ID issued two
clone commands in the offline fixture, even when the source was already marked
ready. The server's idempotent admission does not protect this later client-side
workflow. With a populated target directory, replay can fail; the optional
cleanup-on-source-error path can also request termination of that accepted sandbox.
The probe established repeated SDK commands, not a real remote deletion.
[Implementation](../packages/sdk/src/index.ts#L1645).

Define what a source-bootstrap retry means. Checking a cached success field is
not sufficient for concurrent callers or a crash between clone and status update.
Durable, once-per-intent bootstrap needs an authoritative operation/checkpoint
contract, or the SDK must expose staged execution and ambiguity honestly.
Do not promise exactly-once arbitrary commands or automatically rerun a clone.

### 4. The Preferred Object Discards Useful Creation Outcomes

`HarakiriSandbox.create()` retains `result.sandbox`, but not the creation
operation, readiness, message or credential-attachment results. With `wait:false`,
the object can report an inventory status of running while the separate readiness
was starting. Those concepts are intentionally different, but the preferred
object makes the developer recover the missing context through more calls.
[Object construction](../packages/sdk/src/index.ts#L1155),
[response contract](../packages/sdk/src/protocol.ts#L415).

Keep async creation explicit and preserve its operation/sandbox identity. A
ready object, accepted operation and inventory summary should not be silently
interchangeable return shapes.

## Workflow Assessment

| Standard task | Current Harakiri experience | Improvement with greatest value |
| --- | --- | --- |
| Configure and run a first task | Requires explicit client options; many examples repeat env checks, hardcode the public lab and guess a template/workdir. Default ready-on-create is already good. | Validated `fromEnv()` convenience without a hidden public-cloud fallback; one canonical installed-template recipe. |
| Run a finite command | `sandbox.run()` returns `{ result }`; `commands.run()` is an alias of tracked start, not a guarantee of completion. | One recommended finite-run method, direct typed output and explicit nonzero-exit behavior. |
| Start a server or agent | Start returns `{ command }`; callers carry the ID through wait, logs, stream and kill. | A command/process handle that owns its ID and composes the existing APIs. |
| Observe and recover work | Streaming/reconnect exists, but its cursor and command ID are manually assembled; waits return metadata, not necessarily authoritative accumulated output. | Explicit serializable references and bounded result/output APIs with truncation/coverage metadata. |
| Transfer files | Text reads return wire envelopes; binary callers encode/decode base64, supply size and decide whether to validate checksums. | Native text/bytes, bounded batch helpers and optional Node local-file adapters over existing limits. |
| Expose an HTTP service | Protected exposure and HTTP readiness exist, but route credentials and nested `route.route.url` leak into caller plumbing. | A route handle with scoped fetch, URL, health and explicit close; no exposure disguised as a getter. |
| Reuse retained files | Workspaces return DTOs; the example implements its own availability polling before creating a replacement sandbox. | A workspace handle with bounded availability observation and explicit retained-storage ownership. |
| Clone and inspect a repository | Git helpers exist, yet the OpenCode example still shell-quotes its own clone and deletes a fixed directory first. | Use the established Git surface in recipes; correct bootstrap recovery before more convenience methods. |
| Handle capacity or failure | Structured errors exist, but request context, cleanup ownership and transport cancellation are inconsistent. | One error/recovery vocabulary that distinguishes retryable transport from safely replayable operations. |
| List existing resources | Several collections accept raw query-string fragments. | Typed filters for actual server-supported fields; pagination only when the backend contract supports it. |

Source examples:
[sandbox object](../examples/sdk-sandbox-object/index.ts),
[TypeScript quickstart](../examples/sdk-typescript-quickstart/index.ts),
[binary files](../examples/sdk-files/index.mjs),
[OpenCode](../examples/sdk-opencode-headless/index.ts),
[OpenCode server](../examples/sdk-opencode-server/index.ts),
[workspace recovery](../examples/sdk-persistent-workspace/index.mjs).

## Lessons From Other SDKs

This compares ergonomics and documented contracts, not isolation quality,
operational reliability or cloud performance.

| SDK | Pattern worth learning | What Harakiri should not copy automatically |
| --- | --- | --- |
| E2B | A small sandbox-centered entry point; command results versus reconnectable handles; output callbacks and native file types. | Provider process IDs as our durable contract, cloud-default configuration, or assuming every template includes a stateful code interpreter. |
| Vercel Sandbox | Command objects with wait/output methods, explicit executable arguments, cancellation, filesystem APIs and reusable sandbox lookup. | Automatic resume/recreation semantics or hosted identity assumptions that can obscure Harakiri capacity and retained-state ownership. |
| Daytona | Discoverable `process`, `fs` and `git` domains; first-class file transfers, sessions and PTY handles. | Its entire subsystem catalog or positional timeout/session complexity for a simple task. |

**E2B:** its command API distinguishes completed results from background handles,
supports output callbacks and can connect to existing commands. Files expose
text/bytes/streams rather than base64 envelopes. Those are useful composition
patterns. Its quickstart's `runCode` is a code-interpreter capability, not just a
short spelling of a shell command; matching that promise would require runtime
support. [Commands](https://github.com/e2b-dev/E2B/blob/main/packages/js-sdk/src/sandbox/commands/index.ts),
[handles](https://github.com/e2b-dev/E2B/blob/main/packages/js-sdk/src/sandbox/commands/commandHandle.ts),
[files](https://github.com/e2b-dev/E2B/blob/main/packages/js-sdk/src/sandbox/filesystem/index.ts),
[quickstart](https://docs.e2b.dev/quickstart).

**Vercel:** command handles, argument arrays and request cancellation reduce caller
plumbing. `getOrCreate` illustrates a different lifecycle philosophy: existing
configuration is retained and documented behavior can resume or recreate state.
Harakiri should learn the ergonomic intent without implying that its retained
workspace, sandbox and runtime instance are the same thing.
[SDK reference](https://vercel.com/docs/sandbox/sdk-reference).

**Daytona:** named resource domains, binary/batch transfers and PTY handles are
useful reference points. Its command/session layer still has multiple concepts
and positional parameters; it is not uniformly simpler. Harakiri can keep the
basic path smaller while making advanced operations discoverable.
[Entry point](https://www.daytona.io/docs/en/typescript-sdk/),
[processes](https://www.daytona.io/docs/en/typescript-sdk/process/),
[files](https://www.daytona.io/docs/en/typescript-sdk/file-system/),
[Git](https://www.daytona.io/docs/en/typescript-sdk/git/).

The shared lesson is resource-oriented composition, not maximum feature count.

## Proposed Harakiri Contract

Keep one recommended path for each intention:

| Intention | Preferred direction |
| --- | --- |
| Configure a self-hosted client | Explicit constructor, plus validated `HarakiriClient.fromEnv()` convenience. No lab URL or credentials inferred silently. |
| Own a sandbox | `client.sandboxes.create()` returns a ready handle by default; explicit accepted-operation path for asynchronous creation. |
| Reconnect | `client.sandboxes.connect(id)` retrieves known ownership; waiting/resume remain explicit and do not create a replacement. |
| Execute finite work | `sandbox.run(...)` returns a direct result with output, exit status and relevant identity/limit metadata. |
| Execute durable/background work | `sandbox.processes.start(...)` returns a handle with ID, wait, logs, events and kill; connect by recorded Harakiri identity. |
| Read/write files | `sandbox.files` accepts ordinary text/bytes and returns domain values. Wire encoding stays internal. |
| Reach a service | `sandbox.routes.expose(...)` returns a protected route handle; its fetch retains Fetch semantics and constrained credentials. |
| Keep files across runtimes | `client.workspaces` returns handles; archive/retention remains different from sandbox termination. |
| Finish owned execution | Explicit termination request plus optional bounded confirmation, without deleting retained storage. |

Naming is a proposal to evaluate through recipes, not a final API commitment.
In particular, changing an existing envelope into a direct value or changing
whether a method waits/throws is a semantic change, not a harmless refactor.

### Finite Task: Target Experience, Not Current API

```ts
const client = HarakiriClient.fromEnv();
const sandbox = await client.sandboxes.create({ template: "node-20-app" });

try {
  await sandbox.files.write("task.mjs", "console.log(2 + 2)\n");
  const result = await sandbox.run("node task.mjs", { check: true });
  console.log(result.stdout);
} finally {
  await sandbox.kill({ wait: true });
}
```

The template is an explicit prerequisite, not a guarantee that every installation
contains that name. Relative file and command paths must resolve consistently
against the actual runtime workdir. The proposed `check:true` raises a typed
command failure; ordinary result-returning semantics should remain explicit.
A failed creation wait still needs a typed error carrying the accepted sandbox
identity; do not lose that identity just because assignment never completed.

### Long-Running Task: Target Experience, Not Current API

```ts
const task = await sandbox.processes.start({
  command: "node worker.mjs",
  timeoutMs: 120_000
});
await jobStore.save({ sandboxId: sandbox.id, commandId: task.id });

for await (const event of task.events()) {
  if (event.type === "output") consume(event);
}
const result = await task.wait({ timeoutMs: 130_000 });
```

`jobStore` and `consume` belong to the integrating application. After a worker
restart, recover the sandbox and command handles from those IDs, not another
start call. A saved reference must contain no API key, route token or secret.
Persist output cursors only according to the documented retention/coverage
contract. A truncated/gapped stream must not be presented as complete output.

This does not solve loss of the initial POST acknowledgement. Without a durable
server-side command intent/deduplication contract, that outcome remains ambiguous.
The SDK must say so instead of promising exactly-once execution.

### Safety and Recovery Rules

- Keep finite-run results and process handles distinct. Deprecate misleading
  duplicate names rather than adding another permanent naming layer.
- Separate observation cancellation from remote kill. A UI disconnect must not
  destroy an agent; a timeout must not manufacture released capacity.
- Preserve current nonzero-exit semantics for existing callers. Add a deliberate
  checked-result option with typed exit/output context rather than silently
  flipping every command to throw.
- Document separate request, observation, execution and TTL budgets using units
  in names. A caller's deadline must apply to in-flight reads and delays.
- Never interpret an error's `retryable` flag as permission to replay a mutation.
- Preserve operation IDs and ambiguous outcomes in errors; bounded diagnostics
  must redact credentials and avoid unbounded output collection.
- Cleanup helpers must distinguish owned/new sandboxes from connected resources.
  Never automatically dispose an existing sandbox merely because a local handle
  leaves scope. Report unconfirmed cleanup; do not swallow it in examples.
- Wait for the owned sandbox's release, not organization-wide zero usage, which
  could wait forever on unrelated workloads. Workspace detach is a separate state.
- Keep real credentials out of examples' command strings and generic logs.
  Credential references and scoped route fetches should be the straightforward path.

## Scope Boundaries

| Mostly SDK work | Requires an API/provider contract or separate capability |
| --- | --- |
| Canonical documentation, JSDoc and deprecations | Once-per-intent bootstrap across crashes/concurrent callers |
| Resource handles over existing endpoints | Safe recovery from an unacknowledged command submission |
| Consistent request deadlines and typed transport errors | Truly streaming large file transfer |
| Native byte conversion/checksums within current limits | Stateful code interpreter and rich execution artifacts |
| Typed existing filters and bounded batch convenience | Server pagination where absent |
| Route fetch correctness and explicit exposure UX | Native executable/argv semantics across supported providers |
| Bounded readiness/termination/workspace wait composition | Additional lifecycle or persistent PTY guarantees not supplied today |

Do not disguise base64 buffering as streaming. Do not label shell interpolation
as native argv execution. An argument-based helper needs documented escaping,
shell/platform boundaries and adversarial tests, or a real provider execution
contract. Do not add a Kubernetes exec fallback to supply missing behavior.

## Readability and Type Quality

The SDK's main implementation is 2,723 lines, its protocol file 2,209 lines and
its README 750 lines. An AST count found 177 top-level public members on
`HarakiriClient` and 33 on `HarakiriSandbox`, including constructors, properties,
getters and methods, not 177 distinct workflows. Only two client members and no
sandbox members had attached JSDoc. This is evidence of a discovery burden, not
proof that line count alone makes the implementation defective.

Recommended internal structure:

- A small transport layer for authentication, request context and cancellation.
- Domain errors and response adapters separate from HTTP mechanics.
- Sandbox, command/process, file, route, Git and workspace modules with clear
  ownership and focused tests; no generic resource framework unless duplication
  actually warrants one.
- A short public export entry point; preserve the existing self-contained
  protocol packaging and drift checks instead of publishing `shared` again.
- Type-level tests for return inference, legitimate combinations, invalid options
  and published ESM consumption, alongside runtime request/contract tests.

The compiler currently accepts `wait:false` with credentials or Git bootstrap,
although the SDK rejects both at runtime. Discriminated creation options can
make that constraint discoverable earlier. `runSandbox(id, {})` also compiles,
but is a different case: the server deliberately defaults to `ls` (or
`python agent.py` with stdin), so it is not falsely classified here as invalid.
The future developer-facing finite-run API should require an explicit task.
[Types](../packages/sdk/src/protocol.ts#L399),
[runtime validation](../packages/sdk/src/index.ts#L1645),
[implicit command](../apps/api/src/services/sandbox-runtime.ts#L449).

Typed options should not invent server features. Collection pagination and
command deduplication require actual server support, not just nicer declarations.

## Documentation Is Part of the SDK

The package is rc.10 but its README installation pins still show rc.9. The
first example recommends an explicit asynchronous create/wait sequence even
though normal create is already readiness-aware. Other examples mix flat,
namespaced and object APIs. This makes compatibility plumbing look canonical.

The TypeScript quickstart exposes port 3000 without starting a listener. The
dev-server example prints a preview and then immediately enters cleanup. Both
may be useful contract snippets, but neither is a convincing persistent-preview
tutorial. Examples should name their lifetime and verify an actual HTTP response.

The persistent-workspace example imports a repository-relative dist path rather
than the public package, while the OpenCode example hand-writes functionality
already provided by Git helpers. These are concrete onboarding defects to fix
with the SDK release, not a request for more decorative documentation.

Maintain six canonical, runnable recipes:

1. Ready sandbox, finite command, useful error and confirmed cleanup.
2. Local text/binary inputs, execution and verified result download.
3. Background task, output consumption, worker restart and continued observation.
4. HTTP server, protected healthy preview and deliberate service lifetime.
5. Repository preparation, OpenCode task and inspected diff/test result.
6. Retained workspace, runtime replacement and preserved files.

Compile these from the installed package, reuse their source in docs and demos,
and run their model-free contracts in isolated acceptance. An external free
model is an optional live example, not a deterministic CI dependency.

## Prioritized Roadmap

### First: Correctness and Contract Foundation

Outcome: developers can trust the existing helpers before adopting new ones.

- Fix scoped route fetch and standard `Request` behavior; make exposure explicit.
- Apply hard deadlines to all waiters and fail promptly on impossible terminal
  outcomes while preserving supported explicit terminal-state waits.
- Resolve/document Git bootstrap replay and preserve accepted creation identity.
- Specify canonical verbs, return types, ownership, error semantics and compatibility.
- Add regression tests for the reproduced cases, not merely happy-path assertions.

Exit criteria: synthetic failures have regression coverage; no helper silently
replays work, sends credentials to an unrelated endpoint or claims confirmed
cleanup from acknowledgement. API-side bootstrap requirements are explicit.

### Second: Standard Workflow Ergonomics

Outcome: the six common workflows use one understandable object model.

- Command/process handles with bounded output, reconnect and explicit lifetimes.
- Native text/bytes and small-file batching within advertised transfer limits.
- Route and workspace handles; shared bounded wait behavior.
- Validated environment configuration, typed filters and useful editor JSDoc.
- Replace wire envelopes in the new domain contract without losing diagnostics.
- Rewrite the six recipes and introduce type/API-surface compatibility checks.

Exit criteria: a normal task needs no manual sandbox/command ID plumbing after
creation, no base64 code and no custom polling loop. Advanced recovery still
exposes stable IDs and explicit outcomes. Required setup/scope information is
available before the first request.

### Third: Productized Adoption and Python

Outcome: the new contract works outside the repository and is safe to evolve.

- Publish a deliberate preview of the changed SDK contract and a migration guide.
- Validate installed-package workflows on disposable native acceptance targets.
- Exercise nonzero exits, output gaps, timeouts, cancellation, lost connections,
  capacity denial, partial bootstrap and cleanup failure, not just successful runs.
- Use external integration feedback to settle names/defaults before wider promotion.
- Then implement Python with the same semantic contracts but idiomatic sync/async
  interfaces. Do not mechanically copy TypeScript syntax or legacy response wrappers.

Do not make improved SDK ergonomics wait for all provider lifecycle permutations,
a second provider, customer deployment automation or a broad adapter catalog.

### Later, Triggered by Demand

- Native/bounded artifact streaming when real transfer sizes justify it.
- A first-class SDK PTY handle when interactive embedding is a validated use case.
- Stateful code execution only with the required runtime semantics and limits.
- One framework adapter with a real consumer, not multiple speculative adapters.

## Compatibility Strategy

Keep existing flat methods as compatibility APIs while establishing the
recommended object contract. Add deprecation metadata and migration examples;
do not abruptly remove aliases used by the CLI or external applications.

Do not silently change `commands.run` into a different blocking/failure contract
or unwrap a response in a patch release. Choose a clearly versioned SDK transition
and compatibility window before coding those changes. Avoid a permanent fourth
facade or re-exporting another provider's SDK as Harakiri.

SDK-only ergonomics should work with the documented existing API baseline.
Anything needing new endpoints must be capability/version negotiated and fail
clearly on older servers. Package/client/server compatibility must be published
independently of a visual dashboard release.

## Success Measures

Use the same task corpus before and after; do not rank SDKs by happy-path line
count while omitting authentication, cleanup and error handling.

- Zero manual base64 conversions in ordinary binary-file recipes.
- Zero custom polling loops in the six standard workflows.
- One documented finite-run method and one background-task method.
- Every wait accepts a bounded deadline; supported cancellation semantics are tested.
- All cleanup failures retain actionable ownership information.
- Protected preview recipes expose no raw token in ordinary console output.
- JavaScript examples run directly; strict TypeScript catches invalid combinations.
- Documentation/examples use the public installed package and one API style.
- An independent developer completes and repeats a useful task without reading
  the SDK implementation or requiring maintainer patches.

The strategic priority is **simplify the code users must write while preserving
the control-plane guarantees**, then expand language and framework reach.
