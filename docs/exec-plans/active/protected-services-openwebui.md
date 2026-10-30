# Execution Plan: Protected Sandbox Services, Proven Through OpenWebUI

**Created**: 2026-10-28
**Author**: Codex with project maintainer
**Status**: In progress; implementation and isolated native qualification, no deployment authorized
**Priority**: P1
**Estimated effort**: Multi-session; estimate after protocol and ownership qualification

## Context

A colleague is prototyping an Open-Terminal-compatible gateway between OpenWebUI
and Harakiri. The desired experience is native chat-driven execution, shell,
file browsing and live file/document previews in OpenWebUI, backed by Harakiri
sandboxes. This is an adoption case for the control plane, not a request to make
OpenWebUI's API part of Harakiri's core.

The maintainer accepted the direction of protected application transport, SDK
support, a versioned Open Terminal template and real integration qualification.
On October 28 they explicitly added three release requirements:

1. OSS-quality architecture, readable source and rigorous review.
2. Self-service documentation that does not require maintainer assistance.
3. Tests performed through OpenWebUI, not only SDK calls or proxy fixtures.

Per-user resource ACLs and unified command-level audit are deferred. That does
not defer authentication, route authorization, credential containment, basic
adapter tenant separation or safe handling of untrusted previews.

Baseline inspected: `20c96ce`, following the
[rc.13 Workbench delivery](../../release-notes/0.5.0-rc.13-delivery.md).
Implementation is on branch `feat/protected-sandbox-services`, draft PR #78.
The maintainer authorized isolated GitHub-hosted native acceptance on October 29;
that qualification is running. No publication or lab deployment has been performed.
Do not change the running k0s lab, host processes,
customer OpenShift installation, BackgroundAgent, Brain or `docs/cot`.

## Product Outcome

An operator with an existing supported Harakiri installation can follow public
documentation, install the tested template and adapter, configure one native
Open Terminal connection in OpenWebUI, and complete a real chat-to-artifact
workflow without editing source, issuing Kubernetes exec commands, or asking a
maintainer to provision resources manually.

Harakiri remains a provider-neutral sandbox control plane. The integration is
optional; installing or upgrading the core must not require OpenWebUI, Open
Terminal, a model server or the adapter.

## Success Criteria

- [x] A documented protected-service contract covers ordinary HTTP, incremental
      responses, bounded multipart/binary transfers and WebSocket connections.
- [x] Authentication, destination validation, cancellation, resource bounds and
      connection revocation have explicit tested behavior.
- [x] The existing public/token HTTP route contracts, SDK consumers, native PTY,
      OpenCode integrations and Workbench have no unintended regressions.
- [x] TypeScript and Python expose the agreed service operations through their
      existing API patterns, without framework-specific core methods.
- [x] A versioned, non-privileged Open Terminal template has reproducible startup,
      application health checks and explicit persistent-storage behavior.
- [ ] A real, distributable adapter connects unmodified OpenWebUI to Harakiri
      through public APIs; its ownership and support boundary are documented.
- [ ] Actual OpenWebUI browser acceptance proves the chat, shell, file browser,
      upload/download and document-preview use case described by the colleague.
- [ ] A real model-driven workflow passes without requiring a paid model service;
      fixture tests and real-model evidence are reported separately.
- [x] Recovery, concurrent requests, quota exhaustion and access denial are
      tested without automatic replay of uncertain execution.
- [ ] Public and operator documentation enables a clean self-service installation
      and clearly states deferred ACL/audit guarantees.
- [ ] Security/correctness and public-API/maintainability reviews are resolved;
      versioned artifacts, provenance/checksums and acceptance receipts are recorded
      before claiming a released integration.

## Ownership And Scope

| Layer | Owns | Must not own |
| --- | --- | --- |
| Harakiri core | Sandbox/workspace lifecycle, capacity, protected service grants and transport, capability/error contracts | OpenWebUI chat semantics, Open Terminal file/command API emulation, model orchestration |
| Harakiri SDKs | Typed lifecycle and service operations, application readiness, scoped credentials and cancellation | Hidden background resource ownership or framework-specific helpers in the general client |
| Template | Pinned Open Terminal service, tools, startup and writable-directory conventions | Harakiri control-plane credentials, Docker socket or cluster administration |
| Optional adapter | Trusted OpenWebUI identity/context mapping, connection protocol adaptation, coordination through Harakiri APIs | Direct provider/pod access, a second quota scheduler, arbitrary endpoint selection by end users |
| OpenWebUI | Chat interface, tool invocation, file browsing and previews | Access to Harakiri control-plane secrets from the browser |

The maintainer confirmed that the colleague's POC is not accessible and requested
standard OpenWebUI. Build a separately maintained Harakiri reference adapter,
without modifying OpenWebUI or copying the colleague's implementation.
Qualification needs an actual versioned artifact and a reproducible installation,
not a private development proxy.

### Explicit Deferrals

- No new per-user/per-workspace ACL model in Harakiri. Existing organization
  authorization remains authoritative. Workspaces are not creator-private.
- No promise that Open Terminal executions appear as Harakiri Commands or receive
  Harakiri's per-command controls/audit. Record connection diagnostics, not invented
  command records or claims of comprehensive execution governance.
- No SSO identity-federation project, additional runtime provider, IDE, new model
  framework, general large-file SDK rewrite or chat interface in Harakiri.
- No new OpenWebUI-specific dashboard tab. Improve existing route/service surfaces
  only where required to inspect or diagnose the generic capability.
- No customer OpenShift certification, SCC changes or BackgroundAgent deployment.

The initial supported model is an administrator-configured server-to-server
OpenWebUI connection. The adapter authenticates that calling application before
trusting its user/context assertions. The control-plane key stays outside the
sandbox and browser; each application instance uses its own credentials.
Users with direct Harakiri organization access retain their existing organization
permissions. Do not market this milestone as independent per-user authorization
inside that organization.

## Observed Starting Point

- `apps/api/src/services/sandbox-runtime.ts:proxySandboxRouteRequest` buffers the
  entire upstream response via `arrayBuffer()`. Its fetch/header behavior is not
  a qualified arbitrary-service streaming or WebSocket contract.
- `apps/api/src/routes/sandbox-runtime.ts` registers HTTP route-proxy handlers;
  its separate native terminal WebSocket handler is not a general application
  WebSocket proxy.
- `packages/sdk/src/route.ts` and `route-access.ts` already provide scoped HTTP
  access and application polling. Extend established contracts rather than
  introducing a competing service-client abstraction without need.
- `packages/python-sdk/src/harakiri` has lifecycle, processes, files, workspaces
  and capacity but no route/exposure API surface in this baseline.
- Workspace retention and single-writer lifecycle already exist. Retained files
  do not preserve processes or memory; output observation does not renew TTL.
- `docs/routes.md` still distinguishes rc.10 from an "unreleased" candidate.
  Reconcile that historical wording with actual delivered versions as part of
  the documentation inventory, not by globally replacing every historical pin.

## Phases

### Phase 1: Protocol And Ownership Qualification
**Status**: Complete; compatibility remains a candidate until native qualification
- [x] Resolve adapter ownership: the maintainer requested a Harakiri reference
      adapter for standard OpenWebUI because the colleague's POC is inaccessible.
- [x] Pin OpenWebUI/Open Terminal source commits and image/package digests after
      reviewing security advisories, licenses and compatibility. Research inspected
      OpenWebUI v0.12.4 and Open Terminal v0.14.6; these are candidates, not a
      certified pair. Record changes if another pair is selected.
- [x] Inventory calls used by the native integration: discovery/health, execution,
      files, uploads/downloads, preview conversion, port preview and PTY. Record
      methods, bodies, response types, auth, headers, errors and timeout behavior.
- [x] Inspect actual HTTP and first-message WebSocket authentication. Ensure
      discovery/unauthenticated probes cannot allocate sandboxes accidentally.
- [x] Define supported context granularity. Default to a personal environment if
      sufficient; distinguish user, instance, organization and optional context.
      Do not treat an untrusted session header as proof of ownership.
- [x] Write a concise ADR for module boundaries, credential flow, compatibility,
      limits, activity/TTL behavior and the explicit ACL/audit deferrals.
- [x] Define one executable reference scenario and expected artifacts before
      implementation. Choose a reproducible local/free model with documented
      licensing, exact identity and bounded inference resources.

Exit: reviewed contract/test matrix, reference scenario, supported adapter owner,
and an explicit list of generic Harakiri gaps. Do not copy the enterprise Terminals
implementation into an OSS adapter; review licenses independently.

### Phase 2: Protected Application Transport
**Status**: Complete for the source candidate; real gateway HTTP/WS and recovery passed in run 40992319708
- [x] Extract focused transport, target-resolution, authorization and connection
      lifecycle modules. Keep route handlers thin and provider logic behind the
      existing interface; avoid growing the large runtime service module further.
- [x] Select maintained HTTP/WebSocket implementations compatible with the current
      stack. Do not hand-roll framing, multipart parsing or protocol upgrades.
- [x] Add incremental HTTP forwarding with backpressure and downstream-disconnect
      cancellation. Do not buffer complete successful responses by default.
- [x] Support bounded raw/multipart bodies and binary responses without JSON
      reinterpretation; verify content-disposition, MIME, cache/conditional and
      Range semantics required by the actual client.
- [x] Define supported streaming types from the inventory and test first-byte
      delivery before upstream completion. Distinguish OpenWebUI-side buffering
      from Harakiri transport behavior; do not promise end-to-end streaming where
      a pinned upstream component buffers the request.
- [x] Add generic protected WebSocket upgrades with bounded frames/queues,
      bidirectional cancellation, keepalive policy and deterministic cleanup.
- [x] Authenticate before target access. Reject arbitrary schemes/hosts/paths,
      encoded traversal and inappropriate hop-by-hop forwarding. Bound redirects
      without leaking route or service credentials to another destination.
- [x] Keep control-plane, route and service authentication distinct. Do not strip
      intended service authorization blindly or forward control-plane credentials.
- [x] Define route deletion, sandbox termination and authorization-expiry behavior
      for open streams/sockets, including a documented upper bound on revocation.
- [x] Define configurable finite transfer, header, connection, idle and buffering
      limits with stable errors. Add low-cardinality diagnostics without secrets,
      query tokens, raw documents or unbounded command/output payloads.
- [x] Report protocol capabilities honestly when a provider/deployment cannot
      support them. Test through the real provider gateway without pod-IP or
      Kubernetes-exec workarounds.

Exit: contract, security and real-transport tests pass, including a bounded-memory
transfer larger than the previous whole-response buffering test case. Existing
route, OpenCode and native-terminal consumers remain compatible.

### Phase 3: SDK And Operator Experience
**Status**: Complete for the source candidate; installed-package matrices and native TS/Python regressions passed
- [x] Reuse the TypeScript route object and SDK transport conventions for exposure,
      scoped access, application health polling and deletion. Preserve Request
      semantics, cancellation and credential origin/path restrictions.
- [x] Add the required Python route operations using existing sync/async ownership,
      transport and model patterns. Specify who closes clients/responses/streams;
      interrupted calls must not leak tasks, connections or accepted resource IDs.
- [x] Expose a safe connection contract for server adapters; do not silently fall
      back to public routes or require provider URLs/private fields. Add native
      SDK WebSocket ergonomics only if justified by the actual consumer contract.
- [x] Make sandbox readiness versus application readiness explicit. Return useful
      timeout, unsupported, expired-route, denied and capacity errors.
- [x] Preserve one-time token disclosure and document durable adapter credential
      storage/recovery. No token in ordinary logs, screenshots or copied URLs.
- [x] Test installed archives on supported Node and Python versions, not only
      workspace imports. Keep API examples small and typechecked/executable.
- [x] Keep CLI and existing route UI descriptions consistent with the agreed
      capability surface; avoid an unrelated dashboard redesign.

Exit: a minimal TS/Python example starts an application, waits for its health,
uses a protected endpoint and cleans up without framework-specific core methods.

### Phase 4: Template And Real Adapter Integration
**Status**: Implemented as a source-built candidate; final model/preview qualification remains in Phase 5
- [x] Build a pinned, non-privileged Open Terminal template with dependencies baked
      in, correct writable directories, deterministic startup and a health probe.
      No Docker socket, unnecessary capabilities or runtime package bootstrap.
- [x] Configure working directory and intended retained data under `/workspace`.
      A file-browser root is a UI hint, not a filesystem authorization boundary.
      Document transient service/session state and initialize fresh storage safely.
- [x] Include tools needed by the agreed document scenario. Prove PDF/image/HTML
      preview separately; do not claim Office conversion without the required
      tools and native DOCX/PPTX acceptance.
- [x] Use a separate Open Terminal instance for each selected sandbox context;
      do not rely on its shared-container multi-user mode as user isolation.
- [x] Integrate the versioned adapter using Harakiri APIs/SDK only. Persist its
      bindings and credentials, and coordinate concurrent first requests using
      durable uniqueness/idempotency. An in-memory dictionary is insufficient.
- [x] Reuse capacity and workspace reservation rules; never force a second writer
      after a timeout. Reconcile accepted/unknown provisioning before retrying.
- [x] Specify renewal, inactivity and maximum-session behavior. Health polling
      alone must not retain abandoned capacity forever. Preserve files on runtime
      replacement without claiming recovery of an old process or PTY session.
- [x] Authenticate OpenWebUI's HTTP and WebSocket flows, validate identities and
      contexts, and preserve opaque session IDs safely. No browser-shared admin key.
- [x] Preserve uncertain command/upload outcomes. Do not transparently replay
      side-effecting operations after a disconnect or upstream replacement.
- [x] Supply reproducible configuration/artifacts for the adapter. Reuse its own
      release pipeline where appropriate; do not create a second implementation
      merely to satisfy an internal fixture test.

Exit: unmodified, pinned OpenWebUI uses the real adapter and a real Harakiri
runtime for the reference workflow. This is not yet a release claim.

### Phase 5: OpenWebUI Acceptance And Review
**Status**: In Progress; isolated GitHub acceptance authorized on 2026-10-29
- [x] Keep unit/contract tests, browser fixtures, real transport tests and native
      OpenWebUI acceptance separate, with explicit evidence for each level.
- [x] Prepare disposable native-runner infrastructure, bounded test resources,
      ownership-labeled cleanup and secret-redacted artifacts. Obtain authorization
      before pushing/running hosted acceptance; never use the running lab by default.
- [x] Install the pinned Harakiri, provider, OpenWebUI, model and adapter artifacts
      in that isolated environment. Browser interactions must use the native
      Open Terminal integration, not a custom frontend or direct API substitute.
- [ ] Execute every required scenario in the acceptance matrix below. Inspect
      desktop/mobile screenshots and browser errors; do not infer preview safety
      or visual correctness from a successful HTTP response.
- [x] Review source for correctness/security and independently for public API,
      modularity/readability and examples. Resolve findings with focused regressions.
- [ ] Record exact revisions/digests, platform, versions, test results, known
      limits and owned cleanup. Do not publish credentials, user documents or
      full sensitive request/response bodies as CI artifacts.

#### Required Acceptance Matrix

| Scenario, through actual OpenWebUI where applicable | Required evidence |
| --- | --- |
| Admin setup from the guide | Native connection saves and verifies without source changes, provider access or manual sandbox provisioning |
| Real chat-to-artifact workflow | A real model invokes Open Terminal tools, processes a small CSV, and creates a report plus chart in the Harakiri workspace; independently verify contents |
| File browsing and live changes | Generated/edited files appear through OpenWebUI's file browser; refresh shows current bytes, not stale previews |
| Shell | Interactive input, ANSI output, resize, interrupt and disconnect/reconnect work through OpenWebUI; connection identity remains correct |
| Upload/download | OpenWebUI UI transfers text and binary files, with independent byte/hash checks, size-limit errors and interrupted-upload behavior |
| Document and application preview | Preview the required generated PDF/image/HTML or port-served application in OpenWebUI; verify actual content, MIME and navigation, not merely an iframe URL |
| Untrusted preview | Hostile HTML/SVG/content cannot execute with the chat application's authority or steal credentials; preserve necessary browser isolation/headers |
| Two users and contexts | The adapter never cross-routes identities, files, terminals or credentials; test asserted-ID tampering. This is not proof of new Harakiri resource ACLs |
| Concurrent first requests | File browser, chat and terminal initialization do not allocate duplicate runtimes or exceed organization capacity |
| Cold start and quota denial | OpenWebUI exposes a comprehensible finite outcome, with no endless spinner, false readiness or duplicate side effects |
| Adapter restart | Durable mapping and credential recovery find the same accepted runtime/workspace; no orphaned replacement |
| Sandbox expiry/replacement | A new runtime reuses retained files only after confirmed workspace release; old processes/sockets are not presented as resumed |
| Revoked/expired access | New connections fail and existing streams close within the documented bound; credentials are absent from logs and browser URLs |
| Cleanup | Test-owned commands, routes, runtimes, keys and storage follow explicit cleanup ownership; unrelated workloads are untouched |

Use deterministic fixtures for exhaustive protocol/error cases, but at least one
real-model chat run and all required OpenWebUI UI paths must pass natively. Record
model/version and observed tool calls. A mocked model, API-only test, successful
`curl`, or scripted creation of files outside the chat does not satisfy the real
chat-to-artifact criterion. No automated replay that hides a failed model run.

### Phase 6: Self-Service Documentation
**Status**: In Progress; public, SDK, adapter and operator candidate documentation drafted
- [x] Public concept/reference: explain protected sandbox services, service versus
      runtime readiness, credentials, protocols, limits, TTL and persistent files.
      Extend the existing Routes narrative instead of duplicating concepts.
- [x] Public integration guide: prerequisites, exact candidate versions, supported
      deployment profile, template/adapter installation, secrets, native OpenWebUI
      settings, first chat, files/terminal/preview, cleanup and troubleshooting.
- [x] Operator guide: networking/TLS/WebSocket requirements, proxy limits, health,
      credential rotation, capacity, retained storage, diagnostics and rollback.
      Avoid undocumented per-install patches or maintainer-specific cluster paths.
- [x] SDK/API reference: generated contract changes and runnable TS/Python examples;
      explain response/stream ownership, cancellation and uncertain outcomes.
- [x] Contributor/internal docs: ADR, module ownership, compatibility matrix, local
      test entry points, native runner instructions, release gates and maintenance.
- [x] State the deferred ACL and command-audit guarantees prominently. Document
      adapter-supported identity/context assumptions and upstream preview limits.
- [x] Reconcile old candidate/version wording without erasing historical receipts.
      Keep public navigation, generated Markdown and installed-package examples
      aligned with actual released artifacts.
- [ ] Have the colleague or another developer follow the public guide from a clean
      environment without maintainer intervention. Record failures and fix the
      guide/product; do not call maintainer-operated CI independent self-service proof.

Exit: the documented path reproduces the actual OpenWebUI workflow with released
or explicitly identified candidate artifacts. Record which was tested.

### Phase 7: Release And Completion
**Status**: Not Started; no publication/deployment authorization implied
- [ ] Select versions from actual compatibility changes; preserve independent
      adapter/framework peers and stable channels unless deliberately changed.
- [ ] Run standard CI, installed-package tests, native OpenWebUI acceptance and
      OSS/security review against the exact candidate source.
- [ ] With explicit instruction, merge/publish core packages/images/chart and the
      optional template/adapter artifacts owned by this project. Do not overwrite
      accepted package versions or immutable image/chart tags.
- [ ] Verify anonymous artifact installation and the self-service guide using the
      published identities. Record differences from source-built acceptance.
- [ ] Publish truthful release notes, compatibility limits and sanitized receipts.
      Deploy to the public lab only with separate authorization and preservation
      of existing configuration, credentials, storage and running workloads.
- [ ] Archive this plan only when its agreed acceptance, documentation and delivery
      criteria have evidence; do not equate green unit tests with completion.

## OSS Quality Gates

- Cohesive modules with clear ownership; no OpenWebUI imports in generic core
  runtime services, no large catch-all proxy/adapter file and no speculative
  framework abstraction. Prefer current repository patterns and established
  protocol libraries over bespoke networking code.
- Strict typed public contracts and runtime validation at trust boundaries.
  Avoid unchecked casts, broad `any`, blanket error suppression and retries
  that conceal uncertain side effects. Keep examples concise without hiding
  ownership, credentials or failure handling.
- Bounded memory and resource use proven under slow consumers, large messages,
  disconnects and concurrent requests; no unbounded task/socket/body accumulation.
- Regression coverage proportional to shared transport/auth blast radius,
  including existing SDKs, native PTY, OpenCode and Workbench workflows.
- Reproducible/pinned dependencies and builds, public license compatibility and
  normal dependency/security gates. Do not silently extend an expiring audit
  exception; handle any existing exception under its separate approval policy.
- Small reviewable commits/PRs following the phase boundaries. Review includes
  contributor readability and public developer ergonomics, not only test counts.
- A compatibility matrix with actual versions/platforms, not an unqualified
  "OpenWebUI compatible" claim or a promise of all upstream Open Terminal features.

## Risks And Open Decisions

| Item | Decision required before implementation or release |
| --- | --- |
| Colleague's adapter | Owner, source/artifact access, support expectations and contribution boundary in Phase 1 |
| Upstream contract drift | Pin both products and retest required UI flows on updates; first-message WS auth and context handling are part of the contract |
| Browser previews | Qualify OpenWebUI's actual origin/iframe/header behavior; defer unsafe preview formats rather than weakening browser protections |
| Long-lived state | Define explicit renewal/idle policy and durable bindings without building a second scheduler |
| Provider transport | Prove the entire route chain; do not hide missing gateway support behind direct pod access |
| Individual privacy / command audit | Deferred by maintainer; label limitations and avoid deployment promises requiring those guarantees |
| Independent adoption | Colleague participation is intended, not yet completed or scheduled; keep the acceptance item open until evidence exists |

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
| --- | --- | --- | --- |
| 2026-10-28 | Generic protected service capability plus optional adapter/template | Improves the control plane while keeping upstream application semantics outside the core | Add OpenWebUI endpoints directly to core (not selected) |
| 2026-10-28 | Reuse lifecycle, capacity and retained-workspace primitives | Avoid competing orchestration state and provider coupling | New gateway-managed runtime scheduler (rejected) |
| 2026-10-28 | Defer individual resource ACLs and unified command audit | Maintainer explicitly deferred those broader boundaries | Bundle an authorization/audit redesign into integration (not selected) |
| 2026-10-28 | Keep baseline auth/credential/preview protection mandatory | Deferring new policy models cannot permit unauthenticated routing or cross-user adapter mistakes | Treat all security as deferred (rejected) |
| 2026-10-28 | Actual OpenWebUI acceptance and self-service docs are release gates | Required user experience is inside OpenWebUI, not a standalone SDK demonstration | API fixtures alone or maintainer-only installation (insufficient) |
| 2026-10-29 | Reference adapter for unmodified OpenWebUI; no dependency on colleague POC | Maintainer confirmed the POC is unavailable | Wait for private implementation (not selected) |
| 2026-10-29 | Personal retained workspace per adapter instance and trusted user | Native integration supplies a server-asserted user identity; chat IDs are not ownership proof | User-controlled context routing (rejected) |
| 2026-10-29 | PostgreSQL advisory coordination and encrypted durable intent/grant records | Restart and concurrent first requests must not duplicate runtimes or lose credential boundaries | In-memory mapping and automatic uncertain-operation replay (rejected) |
| 2026-10-29 | Separate HTTP/WS connection descriptions in SDKs | Preserve application authentication without depending on a framework-specific socket client | Bundle an OpenWebUI client into the general SDK (rejected) |
| 2026-10-29 | Remove the withdrawn braces audit exception; patch Vite/Zod security floors | The authoritative advisory was withdrawn, while two new high-severity findings required real upgrades; every high/critical finding remains blocking | Renew or broaden the old exception (rejected) |
| 2026-10-29 | Package only production adapter dependencies and compiled runtime modules | The evaluation image must not ship the monorepo's development dependencies or compiled tests; verify the same isolated bundle locally | Copy all node_modules and source files into the final image (rejected) |
| 2026-10-29 | Qualify self-contained HTML reports; explicitly test relative-asset denial | An isolated real-browser probe confirmed that opaque frames cannot authenticate relative assets with OpenWebUI's default SameSite=Lax session cookie; keep the native browser check and document the unsupported multi-file preview | Grant same-origin authority, weaken cookies or put session credentials in asset URLs (rejected) |

## Tech Debt Incurred

The ACL/audit exclusions remain explicit product deferrals. Candidate limitations:

- Lost one-time route credentials fail closed. A generation-checked operator grant
  reset is implemented and unit-tested; native recovery acceptance remains open.
- Authorization deadlines cannot cancel an already-issued database query. A bounded
  in-flight query budget prevents timed-out callers from enqueueing unlimited work.
- OpenWebUI and the adapter bound/buffer request bodies; only Harakiri transport
  streams uploads. Do not claim arbitrary-size, end-to-end streaming uploads.
- Native OpenWebUI provider/browser/model and independent installation evidence
  remain incomplete. Local fixtures are not substitutes for these release gates.
- The pinned upstream file browser reduces directory failures to a generic
  connection error. HTTP status/error codes remain available to operators;
  quota-specific end-user copy requires upstream work, not a fake success body.
- Candidate image scans reject fixable high/critical findings but retain unfixed
  OS findings in their inventory; passing that gate is not a vulnerability-free claim.
- HTML previews require embedded assets. Authenticated relative assets and live
  multi-file application previews need a separate upstream-safe design; they are
  not included in this profile. The native negative check remains required.

## Completion Notes

### Qualification Checkpoint, October 30

- Run [40998343857](https://github.com/nabilblk/h-sandbox/actions/runs/40998343857)
  failed with a model-generated `NameError`, followed by an invalid tool request
  and the 900-second model deadline. The harness now records all dependent gates
  as failed and completes every in-process and workflow cleanup check. Shell,
  cold start and adapter restart passed; this is not native qualification.
  All other workflows, full local workspace tests/typechecks, the five isolated
  PostgreSQL tests and production package checks passed. Gitleaks found no tracked
  secrets. npm had zero high/critical findings, with 14 moderate and 5 low remaining.
  The next candidate changes only the OpenWebUI inference profile to digest-pinned
  Qwen 3.5 4B/Ollama 0.40.13, using upstream non-thinking sampling guidance within
  the same 6 GiB/3 CPU, 16K context, 3,072 output-token and 900-second bounds.
  It keeps the real prompt and artifact checks; no supplied script, response replay,
  paid inference or SDK acceptance-model change. This is a new qualification target.
  Added receipt-completeness guards and an independent self-service handoff checklist.

- Run [40994701987](https://github.com/nabilblk/h-sandbox/actions/runs/40994701987)
  failed the model scenario with a Python `SyntaxError` and no report directory.
  The earlier CSS-template explanation was a hypothesis, not a verified cause.
  Missing files exposed an unhandled browser-response rejection in the harness;
  the process stopped before its normal cleanup receipt. Workflow always-cleanup
  removed the owned stack, but the normal cleanup gates cannot be claimed.
  A failing-then-passing strict Node regression now covers event/response failures
  during slower UI failures. Dependent scenarios explicitly fail on missing model
  artifacts instead of cascading through absent UI controls. The shared recipe
  requests ElementTree HTML construction, not a prewritten script, and retains
  all correctness and viewport checks. Another full native run is required.

- Source review covered transport authorization/expiry, path and credential
  confinement, bounded connections, cancellation, encrypted bindings and explicit
  recovery. A separate maintainability pass checked module ownership, TS/Python
  route contracts, installed-package boundaries and self-service examples. Fixed
  findings have regressions (handshake admission, grant uniqueness, polling/TTL,
  interrupted multipart cleanup and revoked-grant lock starvation). This is
  maintainer-agent review, not an independent external security certification.
  Route documentation now explicitly distinguishes `tokenRoutes` discovery from
  an actual HTTP/WebSocket deployment probe. Remaining model/preview and external
  self-service/release gates are not covered by these reviews.

- Run [40992319708](https://github.com/nabilblk/h-sandbox/actions/runs/40992319708)
  passed 20 of 22 gates, including the corrected browser upload-failure test and
  real grant revocation/operator recovery on the same runtime. All cleanup passed.
  The real model's script exited 1 with a `KeyError`; JSON/PNG/PDF existed and
  their independent preview checks passed, but HTML was absent. The model and
  complete-preview gates correctly remained failed. This is not a qualified run.
  The next shared prompt uses inline style attributes rather than literal CSS
  braces, avoiding a common Python string-template collision without supplying a
  prewritten report script or weakening file/viewport checks. The full native
  TypeScript, Python, Workbench and CI workflows passed on this source revision.
- Public documentation now wraps the prose prompt while preserving its exact
  copied bytes. Browser inspection at 390px and 1440px found no page/prompt
  overflow or JavaScript error; copying succeeded. All 122 web tests, production
  build, typecheck and documentation-link checks passed. Image scans for run
  40992319708 found zero fixable high/critical findings, with 57 and 80 unfixed
  high/critical findings retained in the adapter and template inventories.

- Run [40990470590](https://github.com/nabilblk/h-sandbox/actions/runs/40990470590)
  passed all generated JSON/PNG/PDF/HTML previews, relative-asset denial, real chat,
  two-user separation/quota and the previous recovery checks except grant
  revocation. The only failed gates were the known loopback upload-fault test and
  waiting for unsolicited output from a reattached PTY before revocation. The next
  candidate explicitly executes a shell marker before revoking the grant. All
  cleanup checks passed. Desktop/mobile captures were inspected; the generated
  HTML chart overflowed its narrow pane despite decoding correctly, so the exact
  shared prompt now requests responsive inline CSS and acceptance checks overflow.

- Run [40986643266](https://github.com/nabilblk/h-sandbox/actions/runs/40986643266)
  passed a real single-submission local-model workflow: three native tool calls,
  no tool failures and verified retained JSON after runtime replacement. Shell,
  binary SHA-256 round trip, live text editing, HTML/SVG isolation, mobile preview,
  adapter restart, passive-polling denial and all owned cleanup checks passed.
  Five gates failed: full document previews, relative-asset denial observation,
  transfer failures, grant recovery and second-user signup. This is partial
  evidence, not qualification. Python/TypeScript native checks and ordinary CI
  passed on the same pushed candidate. The mobile screenshot was inspected.
- Added failing-then-passing real PostgreSQL coverage for multiple protected
  routes sharing the API hostname. Migration 040 preserves active port/public
  host uniqueness and enforces unambiguous active route keys; no deployment DB
  was changed. Added failing-then-passing adapter regression coverage for revoked
  grants: existing health requests now fail promptly without mutation/retry,
  releasing the binding lock for explicit operator recovery. Native user signup
  now uses OpenWebUI's supported admin configuration after its automatic first-
  administrator signup shutdown. These corrections still require a native rerun.
- A local Chromium/socket probe reproduced why the original upload interruption
  check could not pass reliably: a 1 MiB loopback upload finished despite the
  requested upload throttle, before the offline toggle. The replacement injects
  `ConnectionReset` before native browser dispatch without fulfilling a response.
  Its receipt states that boundary explicitly. A separate real core multipart
  socket test interrupts after upstream bytes arrive, verifies upstream closure
  and released admission, and rejects replay. Neither proves rollback of an
  upload already accepted by Open Terminal.

- Candidate `dc57f9d` passed CI, Workbench, TypeScript native (40983652131)
  and Python native (40983652068). OpenWebUI run 40983652055 timed out after
  12 real tool calls, with three nonzero process exits and three tool failures.
  All five expected artifact names existed, but correctness and previews were
  not verified. All cleanup checks, including key revocation, now passed.
- Review found native process polling could recreate a terminated runtime.
  Session resolution now distinguishes observation, explicit workspace opening,
  new mutations and input to existing processes. Polling, stale process input and
  PTY reconnect cannot allocate resources. Focused regression tests pass; native
  replacement acceptance now requires three real polling denials before refresh.
- Runtime age now starts at the API's accepted sandbox creation timestamp, not
  at an earlier empty binding or quota wait. Idempotent recovery retains the
  original timestamp; a regression covers an old binding followed by first use.
  Native FileNav's automatic POST of its current directory is treated as opening
  files, not lease-renewing activity; preflight also cannot allocate a runtime.
- The next harness preserves a failed real-model gate while continuing independent
  transport/recovery checks after stopping the model through the native UI. It
  neither retries the prompt nor seeds substitute artifacts. Fixed exception
  categories improve diagnostics without exporting tool arguments or output.
- Candidate `ee0c95b0dd8bcf0dd67efeb2aa80e8e758cc3390` is pushed to draft PR #78.
  General CI, Python package checks, demo checks and native Workbench acceptance
  pass. Native TypeScript SDK run 40981236453 and Python run 40981236456 also pass,
  including their independent real-model scenarios and cleanup.
- OpenWebUI run 40981236554 failed: the actual model command exited 127 with a
  `SyntaxError`, despite the upstream tool wrapper reporting completion. The
  artifact directory was absent. The tutorial now asks the model to write a Python
  file with the native file tool before executing it, avoiding nested shell/source
  quoting. Tool failure counters now include nonzero process exits. This requires
  another complete native run; no model output is supplied by the test harness.
- That longer run also exposed cleanup attempting OIDC renewal after closing the
  operator browser. Cleanup now closes the OpenWebUI page first, stops the adapter,
  releases runtimes/storage and revokes the key before closing the separate
  operator page. Runtime/storage/Docker cleanup passed in the failed run; the key
  check did not. No complete native OpenWebUI qualification is claimed.
- Local workspace typechecks and the isolated production adapter package pass.
  The API suite passes 394 tests with 10 explicit infrastructure-dependent skips;
  the separate PostgreSQL run passes all four adapter/core database checks.
- Inspected the public integration guide at 1440x1000 and 390x844, including the
  tutorial prompt. No horizontal page overflow or browser JavaScript errors were
  observed. The temporary documentation browser/server were closed afterward.
  This is documentation QA, not evidence for native OpenWebUI previews.
- Added an opt-in Compose local-model profile with the same pinned inference
  image, bounded CPU/memory, no host model port and explicit digest verification.
  Compose configuration validation passes with placeholder settings; it does not
  constitute an independent adopter installation. The guide also distinguishes
  asynchronous command observation from the proxy's finite first-byte budget.
- Source review of pinned OpenWebUI found that its responsive layout remounts
  FileNav and retains the directory, not the selected preview. The mobile check
  now reopens the file and checks viewport bounds. Native browser checks also
  count uncaught JavaScript errors without exporting their messages. All 16
  harness contract tests pass; these changes still require native execution.

### Isolated Qualification Checkpoint, October 29

- Draft [PR #78](https://github.com/nabilblk/h-sandbox/pull/78) contains the work.
  General CI and supported Python package matrices passed. The initial source
  revision also passed native TypeScript SDK, Python and Workbench regression
  workflows; later revisions are requalified before the final review.
- The OpenWebUI workflow creates only an owned GitHub-hosted amd64 cluster,
  registry, application containers and synthetic accounts. Installation, source
  images, TLS registry, normal template import, model pull and native administrator
  signup have passed. Native connection/chat and the rest of the matrix are still
  being debugged; do not mark this integration supported yet.
- Corrected first-frame WebSocket bursts: native OpenWebUI sends resize directly
  after authentication. Core and adapter keep an ordered, bounded queue. Automatic
  JSON ping/resize frames no longer renew sandbox TTL; binary user input can.
- Image audit [40885498067](https://github.com/nabilblk/h-sandbox/actions/runs/40885498067):
  adapter 244 findings (57 high/critical, zero fixable high/critical); terminal 429
  findings (80 high/critical, zero fixable high/critical). Inventories are retained.
  Six fixable findings in unused npm-bundled dependencies were removed by excluding
  package managers from the final adapter image, not by an audit exception.
- Added generation-checked operator recovery, retained-file verification, native
  text/binary transfer and interruption scenarios to the harness. Their presence
  in source is not yet proof that they pass through OpenWebUI.
- Source review reproduced a rejected WebSocket-handshake admission leak. The
  regression failed with an incorrect 429 before the fix and passes after raw
  socket-close cleanup; the API suite now passes 394 tests with 10 explicit
  infrastructure-dependent skips. Native qualification also follows API/SDK and
  shared-contract changes, not only adapter edits.
- Independent self-service feedback and publication/deployment remain separate
  open gates. The running Mac/k0s lab has not been changed.
- Run [40895607724](https://github.com/nabilblk/h-sandbox/actions/runs/40895607724)
  passed native administrator configuration and cold-start allocation, then the
  real local-model chat exceeded its ten-minute limit. That is a failed model
  attempt, not a qualification receipt. The next profile bounds generated tokens,
  gives the native schema a 16K context and asks Python to encode report assets
  instead of allowing base64 generation in model text. One chat per run remains
  mandatory; no response replay or fixture artifact replaces it.
- Run [40900260855](https://github.com/nabilblk/h-sandbox/actions/runs/40900260855)
  added an actual successful-file-response requirement to cold start and failed
  before model invocation. The earlier allocation-only check was insufficient.
  Concurrent adapter waiters now have the same bounded cold-start lock budget as
  the provisioning request, with cancellation still enforced. A new real
  PostgreSQL test verifies short-budget denial and longer-budget shared state.
  Failure diagnostics expose only allowlisted categories/status counts. Cleanup
  stops browser and adapter producers before terminating runtimes, then waits for
  confirmed workspace detachment before archival. These changes require another
  native run; they are not evidence that the previous failure is resolved.
- Run [40902830780](https://github.com/nabilblk/h-sandbox/actions/runs/40902830780)
  now passed cold-start HTTP file listing with exactly one runtime. The real model
  completed one native tool call, but artifact navigation timed out afterwards;
  file contents, shell and recovery are therefore not yet qualified. All owned
  resource cleanup checks passed. The next browser check handles native directory
  changes and records fixed artifact-presence flags and tool failure counts rather
  than exporting chat content or tool output.
- Run [40907628895](https://github.com/nabilblk/h-sandbox/actions/runs/40907628895)
  completed a real tool invocation but had no visible `demo` directory and could
  not list the expected artifacts. A completed tool wrapper is not proof of a
  successful process. The next candidate records only bounded exit codes/error
  categories, explicitly creates the working directory in the model task, and
  keeps that exact prompt synchronized across native, operator and public docs.
  Native terminal resize now drags the actual panel handle instead of resizing a
  browser around a fixed-width/fixed-height terminal. All cleanup checks passed.
- Python native run 40907628932 passed SDK, files, recovery and deadline gates,
  then hit a 180-second model HTTP read timeout within its 720-second total budget.
  The isolated CPU-model read deadline is now 300 seconds; the total budget and
  independent cleanup remain unchanged. This is not a retry or a waived gate.

### Local Implementation Checkpoint, October 29

Implemented generic transport modules, TypeScript connection helpers, Python
sync/async routes, a separate `integrations/openwebui` reference adapter and pinned
Open Terminal template sources. Drafted the ADR, operator guide and public docs.
Current evidence (rerun against the final candidate before release):

- API: 393 passing, 10 infrastructure-dependent skipped in the ordinary suite.
  The new PostgreSQL authorization test also passes separately against all actual
  migrations: tenant mismatch, invalid token, inactive runtime, both expiration
  fields and a live HTTP stream revoked by a database update.
- Transport: 19 focused socket tests, including multipart, Range, first-byte and
  idle deadlines, cancellation, revocation, admission and HTTP/WS limits. A 48 MiB
  transfer verifies SHA-256 with a slow reader and bounded producer lead; this is
  backpressure evidence, not a measured production RSS or native-provider claim.
- TypeScript SDK: 106 tests; installed SDK: 37 passing. Declarations, OpenCode credential recipe
  and 16 MiB binary decoding under a 128 MiB Node heap also pass.
- Python SDK and framework adapter: 103 passing, including service interruption
  cleanup and denied readiness. Wheel/sdist route-consumer checks pass on Python
  3.12. Ruff checks/formatting pass using the repository config; strict mypy passes
  for all 22 SDK/adapter source files.
- OpenWebUI adapter: 14 unit checks passing; 2 real PostgreSQL tests cover concurrent
  schema initialization, replica coordination, authenticated encryption and
  interrupted lock acquisition. All three database tests use only a new private
  Unix-socket instance, stopped and removed afterward.
- The isolated production adapter bundle imports its candidate SDK and discovery
  schema without development dependencies, source files, compiled tests or .env.
  This is a package check, not a Docker image build or native OpenWebUI test.
- Shared contracts: 16 passing; generated OpenAPI includes the service methods.
- Public web: all 120 tests pass; production build and desktop/mobile browser
  inspection pass, with no horizontal page overflow or JavaScript error. The final
  Vite 7.3.7 build passes with the existing >500 kB bundle-size warning.
- Full workspace tests/typechecks, documentation links, OpenAPI and shell syntax
  checks pass. CI now requires the protected-service and adapter PostgreSQL tests
  and builds both candidate integration images without pushing them; CI has not run.
- Patched GHSA-587h-7wmj-h5pm (Vite 7.3.7) and GHSA-mrhx-c7xc-m3w5 (Zod 4.6.6).
  Audit: zero high/critical findings, 14 moderate and 5 low. The withdrawn braces
  exception was removed, not renewed; all high/critical findings fail the gate.
- The universal hash-locked template requirements resolve for Linux amd64/Python
  3.12 with wheels only. pip-audit reports no known Python dependency finding.
  Neither proves an image is vulnerability-free; image scans remain open.
- Gitleaks 8.30.1 reports zero findings for tracked source and for the separately
  inventoried new candidate files. `docs/cot` was excluded and remains untouched.

At this earlier checkpoint, next steps were to implement and run the owned native OpenWebUI browser/model harness, build
and scan the images, close the full recovery/security matrix and obtain independent
self-service feedback. The harness itself is not yet complete. Local contract tests
and the docs browser check do not satisfy these gates.

No native OpenWebUI browser or real-model acceptance had run at that checkpoint;
the later isolated-qualification entries above supersede this historical status.
On 2026-10-29 the user instructed continuing through the remaining qualification;
a dedicated branch/PR and disposable GitHub-hosted acceptance are authorized.
Merge, publication and production/lab deployment remain separate decisions.
No existing cluster change or customer-workload operation has occurred.
The plan remains active and incomplete.

## References

- [Harakiri routes](../../routes.md)
- [Harakiri workspace ownership and lifecycle](../../workspaces.md)
- [Open Terminal integration and deployment](https://github.com/open-webui/open-terminal)
- [Open Terminal security model](https://github.com/open-webui/open-terminal/blob/main/SECURITY.md)
- [OpenWebUI v0.12.4 terminal proxy](https://github.com/open-webui/open-webui/blob/v0.12.4/backend/open_webui/routers/terminals.py)
- [Open Terminal license](https://github.com/open-webui/open-terminal/blob/main/LICENSE)
- [Terminals license, a separate product](https://github.com/open-webui/terminals/blob/main/LICENSE)
