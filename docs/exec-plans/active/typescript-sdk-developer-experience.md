# Execution Plan: TypeScript SDK Developer Experience

**Created**: 2026-09-13
**Author**: Codex with Nabil
**Status**: In Progress
**Priority**: P1 (TypeScript before another language SDK)
**Estimated effort**: Multiple implementation and acceptance sessions

## Context

The user selected TypeScript first after the [SDK DX assessment](../../sdk-dx-assessment.md).
Harakiri already has the control-plane capabilities needed by common integrations;
the next improvement is reducing caller complexity without weakening ownership,
readiness, credential isolation or recovery guarantees. E2B, Vercel and Daytona
inform the assessment, not a requirement to copy their APIs or capabilities.

This plan is based on the current SDK and the assessment, not older active plans.
The latest approval permits a dedicated branch/PR and acceptance on disposable
GitHub-hosted runners. No publication, merge, deployment, customer application
changes or operations against the running local clusters are authorized here.
Do not read or change unrelated `docs/cot/` material or Brain files.

## Success Criteria

- [x] Route fetch preserves Request semantics and never automatically forwards
  credentials outside its route origin/path or across an unchecked redirect.
- [x] Every observation waiter bounds in-flight work and delays, accepts caller
  cancellation, and handles impossible terminal outcomes without hanging.
- [x] Accepted creation identity and readiness metadata survive failures and the
  sandbox facade. Source recovery does not falsely promise exactly-once bootstrap.
- [x] Finite tasks, background processes, files, protected HTTP access and cleanup
  have a documented, discoverable path on the existing sandbox object.
- [x] Existing object-input run results and wire response fields remain available;
  new conveniences and correctness-related error/prototype changes are documented
  for a deliberate preview transition.
- [x] Examples use public imports and compile; tarball-based contract/type tests
  cover failure and reconnect paths. Recipes need no manual base64 or custom
  polling. Actual recipe execution against a runtime remains in Phase 4.
- [x] Local SDK/consumer checks pass. Published-package and live-runtime proof is
  recorded separately before any release is called adoption-ready.

## Phases

### Phase 1: Correctness Foundation
**Status**: Complete

- [x] Extract small route and observation helpers; preserve public exports.
- [x] Restrict route requests to the exact origin and route path boundary. Reject
  embedded URL credentials and encoded path traversal. Use manual redirects so
  route tokens, Basic auth and caller headers are never automatically forwarded.
- [x] Preserve Request method, body, headers, signal and RequestInit overrides.
- [x] Bound command, snapshot and route polling (including async predicates),
  propagate signals, release discarded response bodies, and validate wait budgets.
- [x] Reuse the same deadline machinery for sandbox readiness without weakening
  its distinction between inventory status and actual execution readiness.
- [x] Preserve creation response metadata on sandbox objects and accepted IDs on
  creation failure. Distinguish known source checkpoints from safe replay.
- [x] Cover credential scope, hanging fetches, caller abort, terminal failures,
  replayed ready Git sources, and cleanup/recovery diagnostics with regressions.

### Phase 2: Additive Domain Ergonomics
**Status**: Complete

- [x] Add validated `HarakiriClient.fromEnv()` using explicit installation URL and
  API key. Never fall back to a maintainer installation or leak values in errors.
- [x] Add `sandbox.run(command, options)` returning the direct finite result,
  optional checked exits, and workdir-aware execution. Keep `run(object)` unchanged.
- [x] Return an envelope-compatible process handle from bound `processes.start`;
  support reconnect, wait, logs, events and kill without repeating sandbox IDs.
  Keep lower-level start/run semantics unchanged and document misleading aliases.
- [x] Add native text/bytes on bound files, preserving legacy DTO operations and
  respecting advertised buffered artifact limits and checksum contracts.
- [x] Add route handles preserving response fields, with scoped fetch, health wait
  and explicit deletion. Keep legacy exposure defaults; recommended examples must
  explicitly request token protection. Deprecate side-effecting URL lookup aliases.
- [x] Add bounded per-sandbox termination and workspace availability observation.
  Cleanup never waits for the entire organization or archives retained storage.
- [x] Add editor documentation and strict type tests, including overload inference
  and compatibility assignments. Do not add unsupported pagination or argv claims.

### Phase 3: Recipes and Documentation
**Status**: Complete

- [x] Document one recommended object style, compatibility paths, time budgets,
  operation outcomes, scopes, workdirs and cancellation versus remote termination.
- [x] Update canonical examples: finite task; binary artifact; durable process;
  protected HTTP service; Git/OpenCode; retained workspace and replacement runtime.
- [x] Examples import `@h-sandbox/sdk`, declare installed API/template prerequisites,
  keep credentials out of output, and do not hide unconfirmed cleanup.
- [x] Document client-side Git bootstrap limitations explicitly: a ready checkpoint
  can be observed, but concurrent/crashed bootstrap requires an authoritative API
  operation claim. Do not implement a local lock and call it distributed deduplication.
- [x] Keep code examples aligned with the implementation and mark new APIs as
  unreleased until package publication. Update technical and public Markdown docs.

### Phase 4: Compatibility and Adoption Acceptance
**Status**: In Progress

- [x] Run SDK unit/type/build tests and affected CLI/example type checks locally.
- [x] Pack/install the SDK in an isolated temporary directory and exercise the new
  workflows against a synthetic API; verify ESM/types and self-contained packaging.
- [ ] Run the authorized model-free installed-package recipes against
  a disposable supported runtime, including nonzero exits, cancellation, output
  gaps, capacity denial, partial source preparation and unconfirmed cleanup.
- [x] Verify the installed package on minimum-supported Node 20 and add the
  new API guide in the website source, explicitly marked unreleased.
- [ ] Decide a deliberate preview release and migration window; no silent breaking
  return-type, wait or throw changes in a patch. Publish only after authorization.
- [ ] Capture integration feedback before freezing the contract for a Python SDK.

## Contract Decisions

The existing sandbox facade is the canonical domain object. Wire methods remain
available for compatibility, not a fourth competing interface. Direct finite
results are selected by a string overload; object calls retain their envelope.
New process/route handles retain existing response properties and do not serialize
their client or credentials through a client reference. Reconnecting observes an
existing resource and never creates or resumes one implicitly.

There are four separate budgets: HTTP observation/request, local wait, remote
execution, and sandbox TTL. Stopping observation is not a remote kill. API
`retryable` does not authorize mutation replay; an unacknowledged command POST
remains ambiguous without server-side command deduplication.

Git source initialization is still client orchestration. Completed provenance can
avoid a known replay; cloning/failed checkpoints require explicit recovery. A
server-side operation claim is a separate dependency before claiming concurrent
or crash-safe once-per-intent bootstrap. Source errors retain accepted identity
and cleanup outcome; error wrappers must not serialize credentials or raw inputs.

## Validation Strategy

Use focused SDK tests with synthetic fetches and dummy credentials, plus real
loopback HTTP servers where needed to prove Fetch redirect and Request behavior.
Test hanging fetches that ignore signals, body reads and async predicates, not
only cooperative mocks. Keep existing compatibility tests. Type-check examples
using the public entry point; packaging smoke must not import repository source.
No local Kubernetes, background-agent installation, native destructive acceptance
or broad docs scan that reads unrelated private material.

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
| --- | --- | --- | --- |
| 2026-09-13 | TypeScript before Python | Validate simpler semantics on the existing supported surface first | Expand language coverage immediately |
| 2026-09-13 | Additive domain API on the existing sandbox facade | Preserve callers and avoid another permanent API family | Breaking wholesale rewrite; new parallel client |
| 2026-09-13 | Manual route redirects | Custom route headers must not cross unchecked redirects | Blind native follow; credential stripping after transmission |
| 2026-09-13 | Keep broad legacy creation types for compatibility | Tightening their union would reject existing typed callers; a deliberate migration is still needed | Break valid existing CreateSandboxInput variables during an ergonomic update |
| 2026-09-13 | Preserve raw methods and envelope fields, not plain-object prototypes | New domain handles supply methods without removing response data; documented as a preview transition | Another independent facade; unwrap every response at once |
| 2026-09-13 | Keep live acceptance/release separately gated | Protect running lab and current processes | Use current cluster as a test fixture |
| 2026-09-13 | User approved acceptance branch/PR and hosted runner | Test candidate tarballs against pinned published API artifacts without deployment or publishing | Touch the running local k0s or customer OpenShift |

## Tech Debt Incurred

No new shortcuts accepted. Existing client-driven Git bootstrap needs an API
operation claim before distributed replay guarantees; large-file streaming and
native argv execution are not supplied by SDK syntax.

## Completion Notes

Local implementation and verification are complete; adoption acceptance remains
in progress. Do not archive this plan or label the published SDK upgraded until
Phase 4's live recipe checks and release decision are completed. Distributed Git
bootstrap claims remain a separately documented API dependency.

## Progress Checkpoint: 2026-09-13

- Correctness and additive domain implementation are complete locally.
- SDK regression suite: 93 passed, including the new recovery and handle tests.
- SDK build, public type tests, CLI typecheck and TypeScript examples passed.
- Final isolated tarball check: 24 tests and public declaration compatibility passed.
- CLI regression suite: 83 passed. Public package assertions and 18 relative
  documentation links passed; JavaScript examples passed syntax checks.
- Guides and all six examples are marked as working-tree/unreleased additions.
- Local Node was v26; minimum-supported Node 20 execution and real provider
  workloads were not tested in this session.
- No cluster access, published package, deployment or Git push was performed.

### Acceptance Follow-Up

- User approved the dedicated `feat/typescript-sdk-dx-acceptance` branch/PR and
  disposable GitHub-hosted acceptance. Merge and publication remain unapproved.
- Added isolated tarball consumer checks on Node 20/22 and a guarded model-free
  native runtime suite against the pinned published rc.9 API. No application
  images are built or published, and no existing cluster is selected.
- Public website guide added at `#docs/typescript-sdk`, with navigation, Markdown
  export, syntax highlighting, exact-copy and mobile/browser regressions. It
  distinguishes candidate APIs from the published rc.10 package.
- Local recheck: 93 SDK tests, 83 CLI tests, 24 installed-package tests, 18 docs
  tests and 10 runner safety/receipt tests passed. Web typecheck and the focused
  browser scenario at 1440/390/320px passed. Hosted results are pending.
- PR #48: Node 20 and 22 installed-package checks and every regular CI gate
  passed on the first push. Native run 34730186835 passed installation, candidate
  packaging, OIDC onboarding and template import; its first-task fixture failed.
  Runner cleanup and private-material removal passed. Corrected the fixture's
  line-oriented stdout expectation and create-request wait cap; rerun pending.
