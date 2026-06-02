# Execution Plan: Premium Sandbox Integration Offer

**Created**: 2026-05-29
**Author**: Codex
**Status**: Complete
**Priority**: {P0-P3}
**Estimated effort**: 3-5 engineering weeks

## Context
Harakiri is becoming solid as an OSS sandbox control plane on top of
OpenSandbox. The next product step is to make Harakiri usable by external
projects as a generic sandbox provider, without those projects needing to know
or special-case OpenSandbox internals.

The immediate benchmark is a project shaped like `background-agents`: an app
that expects a sandbox provider to create isolated runtimes, run commands,
manage files, expose web previews, control network access, and survive normal
agent workflows. The goal is not to modify or overfit to that specific project.
The goal is to make Harakiri's own public sandbox offering strong enough that
such projects can integrate it naturally through API, SDK, CLI, docs, and
examples.

External benchmark surfaces from E2B and Vercel Sandbox show a clear standard
for top-tier sandbox providers:

- create/get/list/kill sandboxes
- run commands with cwd, environment, timeout, and detached/background process
  support
- retrieve command status, stdout/stderr, logs, and kill running commands
- read, write, list, stat, remove, rename, upload, and download files
- expose ports as stable public preview URLs
- optionally protect preview URLs with route-level access controls
- configure and update sandbox egress/network policy
- extend runtime timeout
- provide pause/resume/snapshot or a clearly documented alternative lifecycle
  model
- provide templates/images with repeatable build, version, promotion, and
  startup optimization workflows
- offer SDKs, CLI, dashboard, examples, and reference docs that make the runtime
  contract obvious

Current Harakiri strengths:

- Product/control plane: organizations, API keys, members, templates,
  scheduling/routing records, usage, audit/event history, and Keycloak auth.
- Runtime ownership boundary: OpenSandbox owns lifecycle and dataplane access;
  Harakiri owns product state and developer experience.
- Templates: OCI image based, BuildKit-backed, digest-pinned versions,
  aliases, promotion, runtime pull preflight, optional node cache warming, and
  `harakiri.toml`.
- Routing: public sandbox port exposure through Harakiri route records.
- Egress: developer-friendly outbound access modes, presets, org guardrails,
  template defaults, runtime mutation, diagnostics, CLI, SDK helpers, and UI.
- Existing API/SDK basics: create, list, get, run, logs, file metadata, routes,
  egress, registry credentials, API keys, and usage.

Current gaps:

- Public SDK exposes the main runtime APIs, namespaced command/file/route
  helpers, and typed SDK error classes for common integration decisions.
- Command execution supports the blocking `run` path and persisted command
  resources with command, stdin, cwd, per-run env, timeout, detached mode,
  command IDs, status lookup, command logs, wait helpers, and process kill
  semantics.
- Filesystem support covers ordinary stat/read/write/mkdir/remove/rename and
  base64 artifact upload/download operations; streaming or signed URL transfer
  for larger artifacts remains planned.
- No first-class PTY/interactive terminal contract exists for SDK consumers.
- Lifecycle is TTL/renew/kill oriented; pause/resume/snapshot is not yet a
  product decision or public contract.
- Inbound routes are useful but need route access modes for serious external app
  embedding.
- Template authoring is solid at the OCI/BuildKit layer but needs a more
  polished developer story and integration examples.
- Documentation is stronger for operators and dashboard users than for external
  SDK/API integrators.

## Product Principles

- Harakiri must remain an OSS control plane on top of OpenSandbox, not a hidden
  fork of OpenSandbox behavior.
- Normal sandbox lifecycle, terminal, filesystem, logs, metrics, routes, and
  egress behavior must go through OpenSandbox/provider interfaces, not direct
  Kubernetes pod access.
- The public developer contract should hide provider internals. A project should
  think "Harakiri sandbox", not "OpenSandbox pod plus Harakiri metadata".
- Developer APIs should be small, typed, explicit, and hard to misuse.
- Dashboard UX should stay operational and high-density, matching the current
  Harakiri design language: clear tables, compact controls, restrained visual
  hierarchy, no marketing-heavy surfaces inside the app.
- Code should stay modular: route handlers validate and authorize, services own
  product rules, provider implementations own runtime transport, shared packages
  own API types, SDK owns external developer ergonomics.
- Compatibility shims are acceptable only as short-lived internal migration
  tools. Public SDK APIs should not expose shell hacks or provider quirks.

## Non-Goals

- Do not modify downstream projects such as `background-agents` as part of this
  plan.
- Do not overfit Harakiri APIs to one app's private interface.
- Do not implement Harakiri-owned pod exec, packet filtering, or filesystem
  scraping through Kubernetes for normal runtime behavior.
- Do not claim snapshot/pause/resume parity until the feature is actually
  implemented or clearly declared out of scope for v1.
- Do not turn dashboard UX into a generic cloud console. Keep it focused on
  sandbox developer workflows.

## Success Criteria

- [x] A third-party Node/TypeScript app can create a Harakiri sandbox, run
      commands, read/write files, expose a dev server route, apply restricted
      egress, renew timeout, inspect logs/metrics, and clean up using only the
      Harakiri SDK.
- [x] Harakiri has a documented public sandbox runtime contract that does not
      require callers to know OpenSandbox APIs or Kubernetes details.
- [x] The SDK and OpenAPI docs cover all public sandbox runtime operations with
      typed request/response examples.
- [x] Command execution supports cwd, env, timeout, detached/background mode,
      command status lookup, output/log retrieval, and kill.
- [x] Filesystem APIs support list, stat, read, write, mkdir, remove, rename,
      upload/download, and safe path handling.
- [x] Route exposure supports stable preview URLs and at least one private or
      token-protected access mode.
- [x] Lifecycle behavior is explicit: either implemented pause/resume/snapshot
      or documented TTL/renew/kill semantics with product UX that does not imply
      unsupported persistence.
- [x] Templates provide a premium OSS workflow: initialize, build, version,
      promote, use, inspect, document, and smoke-test.
- [x] Dashboard surfaces use Harakiri design tokens and maintain readability,
      density, and clear information hierarchy.
- [x] Conformance tests verify the public runtime contract against the real k0s
      OpenSandbox-backed deployment.

## Phases

### Phase 1: Public Runtime Contract And Gap Audit
**Status**: Complete
- [x] Write `docs/sandbox-runtime-contract.md` describing Harakiri's public
      sandbox primitives, lifecycle semantics, limits, and provider boundaries.
- [x] Add a capability matrix comparing Harakiri, E2B, and Vercel Sandbox at the
      feature level without marketing language.
- [x] Classify each capability as `available`, `partial`, `planned`, or
      `explicitly out of scope`.
- [x] Define the v1 contract for:
      create/get/list/kill, renew, command execution, detached processes,
      filesystem, routes, egress, logs, metrics, templates, and lifecycle.
- [x] Define compatibility expectations for external app integrators: what the
      SDK guarantees, what is best-effort, and what may vary by provider.
- [x] Add internal architecture notes that keep OpenSandbox-owned runtime paths
      separate from Harakiri-owned product paths.
- [x] Update `docs/opensandbox-boundaries.md` if any boundary decisions change.
      No boundary decision changed; the new runtime contract links to and
      reinforces the existing OpenSandbox boundary.

### Phase 2: API And Shared Types Hardening
**Status**: Complete
- [x] Extend shared API types for richer command execution:
      `cwd`, `env`, `timeoutMs`, `detached`, `stdin`, and optional output
      truncation controls. `shell` is intentionally not part of the v1 blocking
      command contract because OpenSandbox's native `/command` API accepts a
      shell command string but does not expose a shell-selector field; richer
      shell/session semantics should be added later through explicit session or
      PTY APIs instead of a Harakiri-only compatibility knob.
- [x] Add command resource types:
      command ID, sandbox ID, status, exit code, started/finished timestamps,
      stdout/stderr, env-key metadata, detached flag, error, and provider
      metadata.
- [x] Add API routes for command lifecycle:
      `POST /v1/sandboxes/:id/commands`,
      `GET /v1/sandboxes/:id/commands/:commandId`,
      `GET /v1/sandboxes/:id/commands/:commandId/logs`,
      `DELETE /v1/sandboxes/:id/commands/:commandId`.
- [x] Keep `POST /v1/sandboxes/:id/run` as a convenience API or compatibility
      wrapper over the command resource.
- [x] Add filesystem request/response types for stat, read, write, mkdir,
      remove, rename, upload, and download.
      First slice complete for stat, read, write, mkdir, remove, and rename;
      base64 artifact upload/download is available; streaming or signed URL
      transfer remains.
- [x] Add or expose missing runtime routes for metrics and renew in OpenAPI and
      SDK parity.
- [x] Standardize error codes for sandbox not found, terminated sandbox,
      unsupported provider capability, provider unavailable, command timeout,
      file not found, permission denied, and route policy failures.
      Stable sandbox runtime error codes are now exported from
      `@harakiri/shared`, published in OpenAPI as `SandboxRuntimeApiErrorCode`,
      consumed by the SDK classifier, and documented for integrators.
- [x] Ensure all runtime route handlers stay thin: validation, auth, service
      call, typed response.
      The token-route proxy path was moved out of the Fastify route and into
      the runtime service so the route layer no longer owns upstream URL
      construction, header filtering, body conversion, or proxy fetch behavior.

### Phase 3: Runtime Provider Interface Refactor
**Status**: Complete
- [x] Extend `RuntimeProvider` with explicit command, filesystem, route, egress,
      metrics, logs, lifecycle, and capability methods.
      Command, filesystem, route, egress, metrics, logs, and core lifecycle
      methods are present. Runtime capability reporting is exposed through the
      provider-aware `GET /v1/runtime/capabilities` service contract rather than
      through provider-specific public APIs.
- [x] Keep provider capabilities machine-readable so API and UI can display
      honest degraded/unavailable states.
- [x] Implement command lifecycle operations in the OpenSandbox provider through
      OpenSandbox/execd transport.
- [x] Implement filesystem operations through OpenSandbox APIs first; only use
      provider-level command fallback where OpenSandbox lacks a stable primitive,
      and document the fallback clearly.
- [x] Make fallback behavior observable through structured logs and response
      metadata without leaking implementation details to normal SDK consumers.
      Filesystem listing responses now include optional `source` and `warnings`
      metadata. OpenSandbox search-based listings report
      `opensandbox-files-search`, while command fallback listings report
      `opensandbox-command-fallback` with a generic warning.
- [x] Add unit tests for provider capability reporting and unsupported capability
      errors.
      Capability reporting is covered through the API route, SDK, and CLI tests;
      unsupported command creation and every unsupported file operation route now
      return explicit `501` API errors before querying product state.
- [x] Add integration tests with the dev provider so API behavior can be tested
      deterministically without a cluster.

### Phase 4: SDK Ergonomics And Integration Surface
**Status**: Complete
- [x] Expand `@harakiri/sdk` to expose every public sandbox API with typed
      methods and typed errors.
      Typed API error subclasses and wait timeout errors are available. The SDK
      exposes namespaced helpers, flat compatibility methods, and
      OpenAPI-shaped aliases for the public sandbox runtime operations.
- [x] Add `createSandbox`, `getSandbox`, `listSandboxes`, `killSandbox`,
      `renewSandbox`, and `waitForSandbox`.
- [x] Add command helpers:
      `runCommand`, `startCommand`, `getCommand`, `commandLogs`,
      `killCommand`, and `waitForCommand`.
      `runCommand`, `startCommand`, `getCommand`, `getCommandLogs`,
      `listCommands`, `killCommand`, and `waitForCommand` are available.
- [x] Add filesystem helpers:
      `files.list`, `files.stat`, `files.read`, `files.write`, `files.mkdir`,
      `files.remove`, `files.rename`, `files.upload`, and `files.download`.
      Flat SDK helpers are available for list/stat/read/write/mkdir/remove/
      rename/upload/download. Namespaced helpers are available.
- [x] Add route helpers:
      `routes.expose`, `routes.list`, `routes.delete`, `getHost`, and
      route access-mode helpers.
      Namespaced helpers are available for expose/list/delete/getHost, and
      `routes.expose` accepts `accessMode: "public" | "token"`.
- [x] Add egress helpers that preserve the current developer-friendly vocabulary:
      `getOutboundAccess`, `setOutboundAccess`, `allowDomains`,
      `denyDomains`, `blockOutboundAccess`, and `testOutboundAccess`.
- [x] Add logs and metrics helpers.
- [x] Make SDK examples copy-pasteable for Node/TypeScript projects.
- [x] Add SDK tests for URL construction, request bodies, error parsing, and
      convenience helper behavior.

### Phase 5: Command And Process UX
**Status**: Complete
- [x] Support blocking command execution with cwd, env, timeout, stdout/stderr,
      exit code, and duration.
- [x] Support detached/background execution for long-running dev servers,
      editors, web apps, and agent subprocesses.
- [x] Provide command IDs and retrieval of command status/logs after API client
      restart.
- [x] Provide command kill semantics with clear behavior if the process has
      already exited.
- [x] Add output truncation metadata and optional log tailing.
- [x] Add dashboard command detail affordances where useful, without cluttering
      the sandbox detail page.
- [x] Add CLI commands for advanced debugging:
      `harakiri run`, `harakiri commands`, `harakiri logs --command`, and
      `harakiri kill-command`.
      Implemented as `harakiri command run/list/status/logs/kill` alongside
      the existing blocking `harakiri run`.

### Phase 6: Filesystem API And UI Maturity
**Status**: Complete
- [x] Add first-class API and SDK methods for reading and writing text and binary
      files.
- [x] Add stat/mkdir/remove/rename operations with safe path normalization and
      clear error mapping.
- [x] Add upload/download flows for larger artifacts with size limits and
      streaming or signed URL support if needed.
      Base64 JSON artifact transfer with checksum and decoded-size validation
      is available. Streaming or signed URL transfer remains a future scale-up
      option.
- [x] Ensure filesystem listing distinguishes direct children, recursive search,
      empty directories, permission errors, and provider unavailable states.
      OpenSandbox search results synthesize direct child directories, fallback
      listing now preserves empty directories and maps permission/path failures
      to typed file errors instead of returning false empty listings.
- [x] Improve dashboard filesystem UX around loading, empty, error, and large
      directory states.
- [x] Add tests for path traversal, binary data, large files, missing files,
      directories, symlinks if supported, and provider fallback behavior.
      Coverage now includes path normalization, invalid paths, empty
      directories, permission failures, missing files, symlink entries, binary
      artifact upload/download, oversized artifact rejection, and fallback
      behavior.

### Phase 7: Routes And Public Access Controls
**Status**: Complete
- [x] Define route access modes:
      `public`, `token`, and optionally `organization` or `authenticated`.
- [x] Extend route records to store access mode, token hash or credential
      material reference, created actor, last used timestamp, and optional labels.
      Route records now store access mode, token hash, token hint, header name,
      creator user/label metadata, route labels, and last-used timestamps for
      token-protected proxy access.
- [x] Add SDK and CLI APIs to expose a port with access mode and retrieve the
      resulting URL plus any required request headers.
      Implemented for `public` and `token`; the token is returned only when the
      route is created.
- [x] Keep default route behavior backward compatible for existing public routes.
- [x] Add dashboard Network tab controls that clearly separate inbound routes
      from outbound access.
- [x] Add documentation for preview URLs, browser access, API/webhook testing,
      and private route usage.
- [x] Add conformance tests that start an HTTP server, expose a route, verify
      public access, verify token-protected access, and verify deletion.
      Service and API proxy tests cover token route enforcement; real
      OpenSandbox/k0s conformance now covers route create, list, delete,
      re-expose with token access, and cleanup. Public/token URL fetch checks
      remain optional behind `HARAKIRI_CONFORMANCE_ROUTE_FETCH=1` because local
      forwarded deployments may not expose route hosts directly.

### Phase 8: Lifecycle, Persistence, And Snapshot Decision
**Status**: Complete
- [x] Make a product decision for v1 lifecycle:
      TTL/renew/kill only, pause/resume, snapshot, or phased support.
- [x] If choosing TTL/renew/kill for v1, document it explicitly and remove any
      UI/API copy that implies unsupported persistence.
- [x] If choosing pause/resume or snapshot support, define provider requirements,
      API shape, retention model, billing/usage model, and failure behavior.
      Chosen direction is TTL/renew/kill for v1; pause/resume remains out of
      scope and running-sandbox snapshots remain a future product decision.
- [x] Add SDK methods that match the chosen lifecycle:
      `extendTimeout`/`renew`, and optionally `pause`, `resume`, `snapshot`,
      `createFromSnapshot`, `listSnapshots`, and `deleteSnapshot`.
      `renewSandbox` is available. Snapshot methods are intentionally absent.
- [x] Add dashboard lifecycle controls only after backend semantics are real.
      No pause/resume/snapshot controls are exposed in the current dashboard.
- [x] Add tests for timeout extension, terminated sandbox behavior, and any
      implemented persistence primitive.
      Existing sandbox service and SDK tests cover renew/kill semantics.

### Phase 9: Templates As A Premium OSS Workflow
**Status**: Complete
- [x] Keep the current OCI/BuildKit/digest-pinned template model as the core OSS
      approach.
- [x] Polish `harakiri template init` output and generated `harakiri.toml` so it
      is approachable for new template authors.
- [x] Add first-class examples for:
      base Linux, Python data, Node app, browser/Chromium agent, and
      Open Agents-style runtime.
- [x] Document the difference between image versions, aliases, promotion,
      preflight, pre-pull warming, and snapshots.
- [x] Add template smoke-test conventions and CLI support for running a template
      smoke inside a fresh sandbox.
- [x] Add dashboard copy and controls that keep template list/build/detail views
      dense, readable, and consistent with Harakiri design tokens.
- [x] Avoid adding new builder providers unless they clearly improve OSS
      portability; BuildKit remains the preferred default.

### Phase 10: Documentation And Examples For Integrators
**Status**: Complete
- [x] Expand `packages/sdk/README.md` from smoke example to real integration
      guide.
- [x] Add `docs/sdk.md` with authentication, configuration, errors,
      idempotency, retries, timeouts, and examples.
- [x] Add `docs/integrations/building-with-harakiri.md` for external
      application developers.
- [x] Add examples:
      `examples/sdk-basic-command`,
      `examples/sdk-files`,
      `examples/sdk-preview-route`,
      `examples/sdk-restricted-egress`,
      `examples/sdk-dev-server`,
      and `examples/sdk-template-build`.
- [x] Add a documented "provider adapter shape" showing how an external app can
      wrap Harakiri without relying on private APIs.
- [x] Add a "Capabilities and limits" page that is honest about lifecycle,
      network, filesystem, route, and template limitations.
- [x] Add migration guidance for teams currently using direct OpenSandbox APIs.

### Phase 11: Dashboard UX And Design Consistency
**Status**: Complete
- [x] Review sandbox detail tabs for command, filesystem, logs, metrics, network,
      and route states against the current design system.
- [x] Keep operational screens compact and table-oriented; avoid marketing-style
      pages inside the authenticated app.
- [x] Use existing Harakiri design tokens, typography, spacing, borders, status
      pills, and icon treatments.
- [x] Avoid horizontal overflow in primary tables; move secondary actions into
      compact menus or detail panels.
- [x] Ensure empty/error/degraded states are specific, actionable, and visually
      quiet.
- [x] Verify responsive behavior on desktop and constrained widths.
- [x] Use browser/Playwright checks for critical screens before marking UI work
      complete.

### Phase 12: Conformance, Quality Gates, And OSS Readiness
**Status**: Complete
- [x] Add a sandbox provider conformance test suite that can run against dev
      provider and real OpenSandbox-backed k0s.
- [x] Cover create/run/files/routes/egress/logs/metrics/renew/kill in the
      conformance suite.
- [x] Add SDK integration tests that run against a live API when
      `HARAKIRI_API_URL` and `HARAKIRI_API_KEY` are provided.
- [x] Add CLI smoke tests for the same core flows.
- [x] Add OpenAPI generation/checks to CI for all new API types.
- [x] Add docs checks so examples remain syntactically valid where possible.
- [x] Add release notes documenting breaking changes, new endpoints, and
      migration advice.

## Suggested Package And Module Boundaries

- `packages/shared`: public request/response types, error shapes, capability
  types, route access types, egress types, and OpenAPI definitions.
- `packages/sdk`: external developer SDK only; no server-only assumptions, no
  provider internals, no shell fallback APIs.
- `packages/cli`: thin wrapper around SDK/API for humans and scripts.
- `apps/api/src/routes`: auth, validation, idempotency headers, response shaping.
- `apps/api/src/services`: product rules, audit/events, persistence, policy
  compilation, orchestration of provider calls.
- `apps/api/src/providers/runtime`: OpenSandbox/dev provider implementations,
  transport, provider capability mapping, runtime-specific fallback logic.
- `apps/web`: dashboard UX using API/SDK-shaped concepts, not provider internals.
- `docs`: product docs, operator docs, integration docs, and examples.

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-05-29 | Focus the plan on Harakiri's public sandbox offer, not downstream project changes | External apps may not be owned by Harakiri maintainers; Harakiri must be integrable through its own API/SDK/docs | Modify `background-agents` directly; build one-off compatibility adapter first |
| 2026-05-29 | Keep OpenSandbox as the runtime dataplane boundary | Harakiri is an OSS control plane on top of OpenSandbox and should not reimplement pod/runtime behavior through Kubernetes shortcuts | Direct Kubernetes exec/files/logs for richer features; custom runtime agent |
| 2026-05-29 | Treat command/filesystem/lifecycle gaps as public product gaps | E2B and Vercel expose these as first-class developer primitives; top-tier OSS integrations expect the same shape | Leave gaps to downstream adapters; document shell-based workarounds |
| 2026-05-29 | Keep OCI/BuildKit templates as the core template model | It is portable, OSS-friendly, and already implemented with digest-pinned versions and promotion | Copy E2B's template SDK model exactly; require provider snapshots for template startup |
| 2026-05-29 | Start implementation with documented runtime contract and SDK/CLI parity for existing backend capabilities | This gives external integrators a stable baseline before adding larger command and filesystem resources | Jump directly to new command/process APIs before documenting the boundary |
| 2026-05-29 | Extend the existing blocking `/run` convenience endpoint only with cwd/env/timeout | These fields are safe to add without introducing a new persisted command model; detached processes need their own command resource | Add detached/background execution to `/run` immediately |
| 2026-05-29 | Do not expose a v1 `shell` selector on command APIs | The current OpenSandbox execd contract documents `/command` as a shell command string with cwd/background/timeout/uid/gid/envs, but no shell-selector field. Harakiri should not invent a provider-specific shell switch before it has a native session/PTY design | Add `shell` and translate it into shell-wrapped command strings; add a Harakiri-only field that downstream adapters would depend on |
| 2026-05-29 | Add first-class file operations before artifact upload/download | External integrations need stat/read/write/mkdir/remove/rename for ordinary agent workflows; larger artifact transfer can follow with explicit streaming limits | Keep filesystem list-only until the full artifact API exists |
| 2026-05-29 | Implement detached/background commands as a persisted command resource, not as flags on `/run` | Long-running agent and dev-server workflows need command IDs, status, logs, and kill after client restarts; `/run` stays a blocking convenience API | Make `/run` polymorphic; require downstream apps to manage provider command IDs directly |
| 2026-05-29 | Store inbound route metadata in Harakiri even when OpenSandbox owns the preview dataplane | External integrations need durable route labels, creator attribution, token material references, and last-used timestamps for debugging and access review without depending on provider internals | Keep route records as URL-only rows; infer usage from provider logs |
| 2026-05-29 | Expose runtime capability states as a public API/SDK/CLI contract | External apps and dashboard screens need to gate workflows on `available`, `degraded`, and `unavailable` capability states without parsing provider names | Keep capabilities as internal booleans only; document provider differences manually |
| 2026-05-29 | Centralize sandbox runtime API error codes in `@harakiri/shared` | External adapters need stable machine-readable codes for retries, disabled features, stale IDs, and route/egress policy handling | Keep codes as scattered route strings; rely only on HTTP status and SDK subclasses |
| 2026-05-29 | Keep historical route records but enforce uniqueness only for active routes | SDK conformance proved ports must be reusable after unexpose while preserving route audit/history; partial unique indexes let deleted routes remain historical records without blocking re-exposure | Physically delete route rows; keep permanent uniqueness and make re-expose fail |
| 2026-05-29 | Let Keycloak own browser logout navigation once provider logout starts | `keycloak.logout({ logoutMethod: "GET" })` starts a full-page redirect and resolves immediately; mutating `window.location.hash` afterward can cancel the provider logout | Clear local state and force `#landing` after logout call; keep local-only logout only as a fallback when provider logout cannot start |
| 2026-05-29 | Keep create dialogs vertically bounded with scrollable bodies and fixed footers | Operational modals must remain usable on constrained heights; Playwright caught the create action outside the viewport | Rely on page scroll or test-only forced clicks |

## Tech Debt Incurred

- SDK route helpers are still flat methods (`exposePort`, `listRoutes`,
  `deleteRoute`) with clearer aliases and `routes.*` wrappers. The v1 target
  still calls for route access-mode helpers.
- SDK filesystem helpers now have `files.*` wrappers over the flat methods. The
  v1 target still calls for streaming or signed URL artifact transfer above the
  JSON artifact limit.

## Completion Notes

- 2026-05-29: Added `docs/sandbox-runtime-contract.md`, linked it from the
  documentation index, exposed SDK methods for sandbox renew, metrics, route
  aliases, and route deletion, added CLI commands for renew, metrics, and route
  deletion, expanded the SDK README baseline example, and added SDK tests for
  these client-facing methods.
- 2026-05-29: Added `waitForSandbox` to the SDK so external apps can wait for
  async sandbox provisioning without writing their own polling loop.
- 2026-05-29: Added blocking command cwd/env/timeout support through shared
  types, OpenAPI, API validation, runtime service, provider interface,
  OpenSandbox execd transport, dev provider, SDK typing, CLI `run` options, and
  focused API/OpenSandbox/SDK tests.
- 2026-05-29: Added first-class sandbox filesystem stat/read/write/mkdir/remove/
  rename through shared types, OpenAPI, API routes, service helpers, provider
  interface, OpenSandbox execd transport, dev provider, SDK, CLI, API docs, and
  focused shared/API/OpenSandbox/SDK/CLI tests.
- 2026-05-29: Added developer-facing SDK aliases for outbound access:
  `getOutboundAccess`, `setOutboundAccess`, `allowDomains`, `denyDomains`,
  `blockOutboundAccess`, and `testOutboundAccess`.
- 2026-05-29: Added persisted sandbox command resources with DB migration,
  shared/OpenAPI types, API routes, runtime service persistence, OpenSandbox
  execd-backed detached command status/log/kill support, dev provider support,
  SDK helpers, CLI `command` subcommands, and focused API/OpenSandbox/SDK/CLI
  tests.
- 2026-05-29: Added SDK `waitForCommand` with terminal failure detection so
  external integrations can wait for tracked commands without custom polling.
- 2026-05-29: Added SDK namespaces for `commands.*`, `files.*`, and `routes.*`
  so external integrations can use a cleaner provider-style API while existing
  flat methods stay compatible.
- 2026-05-29: Added first integrator-facing docs: `docs/sdk.md` and
  `docs/integrations/building-with-harakiri.md`, linked from the docs index.
- 2026-05-29: Added sandbox artifact upload/download APIs with base64 payloads,
  decoded-size limits, optional sha256 validation, SDK/CLI helpers, OpenAPI and
  docs coverage, and route/service/SDK/CLI tests.
- 2026-05-29: Added token-protected inbound routes. Public route behavior stays
  direct to the OpenSandbox preview URL, while `accessMode: "token"` returns a
  Harakiri proxy URL plus a one-time visible route token stored only as a hash.
  Added DB columns, API/SDK/CLI contract updates, route proxy auth bypass,
  token validation, docs, and service/API/SDK/CLI/OpenAPI tests.
- 2026-05-29: Added SDK typed error subclasses and wait timeout errors so
  external adapters can distinguish auth, validation, not-found, conflict,
  rate-limit, unsupported capability, provider-unavailable, timeout, and server
  failures without parsing messages.
- 2026-05-29: Added OSS integration examples for basic command execution,
  filesystem operations, token-protected preview routes, restricted egress,
  dev-server workflows, and template builds. Added provider adapter and
  capabilities/limits documentation, and documented v1 lifecycle as TTL,
  renew, and kill rather than pause/resume/snapshot.
- 2026-05-29: Added Phase 12 quality gates: `pnpm conformance:sdk` for live
  SDK runtime conformance, `pnpm conformance:cli` for CLI smoke coverage,
  `pnpm examples:check` for example syntax, a GitHub Actions CI workflow for
  OpenAPI/examples/shared/SDK/CLI/API checks, and integration release notes.
- 2026-05-29: Started Phase 9 template workflow polish by adding
  `harakiri template smoke <template-id>`. The command creates a temporary
  sandbox, waits for readiness, runs the configured `ready_command` or an
  explicit `--cmd`, streams stdout/stderr, and terminates the sandbox unless
  `--keep` is set. Template docs now explain smoke checks, runtime preflight,
  pre-pull warming, aliases, promotion, and why Harakiri keeps OCI/BuildKit as
  the OSS default.
- 2026-05-29: Added first-class OSS template examples for base Linux,
  Python 3.12 data, Node 20 apps, browser/Chromium automation, and the existing
  Open Agents runtime. Each example has a Dockerfile, `harakiri.toml`, README,
  and smoke script. Added `pnpm templates:check` and CI coverage for template
  smoke-script syntax.
- 2026-05-29: Polished `harakiri template init` for first-time template
  authors. Generated configs now include grouped comments, description
  metadata, the exact build and smoke commands for the generated ID, and the CLI
  prints next-step build/smoke commands after writing `harakiri.toml`.
- 2026-05-29: Expanded `packages/sdk/README.md` into an integration guide that
  covers install/configuration, core workflow, runtime surfaces, files,
  artifacts, typed errors, and operational guidance. Added
  `docs/integrations/migrating-from-direct-opensandbox.md` to help projects
  move from direct OpenSandbox usage to the Harakiri SDK/provider contract.
- 2026-05-29: Added provider-neutral command log tailing. Command logs now
  accept `tail`, SDK helpers forward `{ cursor, tail }`, CLI supports
  `harakiri command logs --tail`, OpenAPI publishes the query parameter, and
  responses include stdout/stderr truncation flags when output was omitted.
- 2026-05-29: Completed route metadata persistence for external integration
  use cases. Sandbox routes now include labels, creator attribution, and
  last-used timestamps in the shared/OpenAPI/SDK/CLI contract. Token-protected
  proxy routes update `lastUsedAt` after successful access, and the CLI exposes
  repeated `--label` flags for preview route organization. Async route replay
  now preserves route labels, creator metadata, access mode, and token material
  references instead of degrading replayed routes into URL-only rows.
- 2026-05-29: Converted `POST /v1/sandboxes/:id/run` into a compatibility
  wrapper over the tracked command resource when the runtime provider supports
  it. Providers without tracked command support still use the legacy direct run
  path, but OpenSandbox-backed runs now share command persistence, status, logs,
  and event semantics with the command API.
- 2026-05-29: Added machine-readable runtime capability reporting through
  `GET /v1/runtime/capabilities`, `HarakiriClient.getRuntimeCapabilities()`,
  and `harakiri capabilities`. Capability states are `available`, `degraded`,
  or `unavailable`, with reasons for non-available states. API, SDK, CLI,
  OpenAPI, and integration docs now describe the contract.
- 2026-05-29: Added route-level unsupported capability tests for tracked command
  creation and all file operation endpoints. Providers missing those runtime
  methods now have regression coverage proving Harakiri reports explicit `501`
  capability errors instead of falling through to DB queries or ambiguous
  failures.
- 2026-05-29: Centralized the sandbox runtime API error vocabulary in
  `packages/shared/src/api-errors.ts`, exported categorized code groups for SDK
  and adapter logic, added `SandboxRuntimeApiErrorCode` to OpenAPI, updated SDK
  classification to consume the shared categories, and documented stable error
  handling in the SDK, API, and provider-adapter docs.
- 2026-05-29: Hardened OpenSandbox filesystem fallback listing so search
  failures no longer hide permission or path errors behind empty results. Added
  tests for normalized paths, empty directories, permission failures, invalid
  paths, symlink fallback entries, binary artifact round trips, large artifact
  rejection, and malformed base64 handling. Artifact validation now rejects
  oversized payloads before regex/canonical decoding to avoid stack overflows.
- 2026-05-29: Started dashboard UX consistency polish. Sandbox detail logs and
  metrics now show explicit quiet empty/error states, inbound routes explain the
  `0.0.0.0` bind requirement, filesystem and route tables no longer force wide
  minimum widths, and template list rows reduce secondary actions by relying on
  row selection plus a compact copy action. Web typecheck, unit tests, build,
  and `git diff --check` passed. A local Playwright auth check against Vite was
  attempted but Keycloak rejected the localhost redirect with HTTP 400, so the
  browser/Playwright visual verification item remains open.
- 2026-05-29: Completed the focused dashboard command/filesystem UX slice.
  The sandbox terminal tab now shows recent command history with status,
  runtime, exit code, and kill controls for active commands. Filesystem UX now
  shows loading, entry counts, large-directory caps, refresh state, and clearer
  empty copy. The templates list now relies on row selection plus compact copy
  actions instead of a wide action strip.
- 2026-05-29: Re-ran source quality gates after the dashboard/SDK/conformance
  slices. Passing checks: `pnpm examples:check`, `pnpm templates:check`,
  `pnpm openapi:check`, `pnpm --filter @harakiri/shared test`,
  `pnpm --filter @harakiri/api test`, `pnpm --filter @harakiri/sdk test`,
  `pnpm --filter @harakiri/cli test`, `pnpm --filter @harakiri/web test`,
  and affected package typechecks for shared, SDK, API, and CLI.
- 2026-05-29: Attempted live SDK conformance against the forwarded k0s stack.
  The run reached OpenSandbox and created a real sandbox, but failed the
  command-env assertion because the deployed `harakiri-api` image is stale:
  `/app/apps/api/dist/providers/runtime/opensandbox-execd.js` in the running
  pod does not contain the current `envs` forwarding code. The source tree
  matches the OpenSandbox execd API contract, and unit tests verify `envs`
  forwarding; real k0s conformance remains open until the API image is rebuilt
  and redeployed.
- 2026-05-29: Cleaned up sandbox runtime route layering by moving token-route
  proxy mechanics into `proxySandboxRouteRequest` in the runtime service. The
  Fastify proxy route now extracts the route key/token, calls the service, and
  maps typed service outcomes to API responses. API typecheck and API tests
  passed after the refactor.
- 2026-05-29: Added provider fallback observability to filesystem listing.
  `SandboxFilesResponse` now carries optional `source` and `warnings`
  metadata, and the OpenSandbox provider distinguishes native
  `files/search` listings from provider-command fallback listings without
  exposing low-level exception text. Updated OpenAPI and verified with
  shared/API tests plus shared/API/SDK/web typechecks.
  Sandbox detail now exposes a compact Recent commands panel backed by the
  command resource API, including status, runtime/exit summary, and interrupt
  action for running commands. Filesystem view now has loading state, entry
  counts, quiet empty/error copy, and a large-directory cap/notice at 300
  visible entries. The web client now calls the command list and kill endpoints.
  Verified with `pnpm --filter @harakiri/web typecheck`,
  `pnpm --filter @harakiri/web test`, `pnpm --filter @harakiri/web build`, and
  `git diff --check`.
- 2026-05-29: Completed the SDK/OpenAPI coverage audit for public sandbox
  runtime operations. Added SDK aliases that mirror OpenAPI operation names for
  `runSandboxCommand`, `createSandboxCommand`, `getSandboxEgress`, and
  `updateSandboxEgress`, while keeping the preferred `commands.*`, `files.*`,
  and `routes.*` namespaces. Updated SDK docs to mention these aliases and
  added regression coverage. Verified with `pnpm --filter @harakiri/sdk test`,
  `pnpm --filter @harakiri/sdk typecheck`, and web typecheck.
- 2026-05-29: Rebuilt and deployed the API image to the fresh k0s cluster with
  the OpenSandbox execd env forwarding and detached-command status fixes. The
  deployed API pod was verified to contain the current `envs` and detached
  command logic before rerunning conformance.
- 2026-05-29: Fixed route deletion/re-exposure semantics discovered by live
  SDK conformance. `listSandboxRoutes` and route creation now consider only
  non-terminated routes, `deleteSandboxRoute` terminates only active routes,
  and migration `021_active_route_uniqueness.sql` replaces permanent route
  uniqueness with partial unique indexes for active `(sandbox_id, port)` and
  active hosts. API typecheck, API tests, OpenAPI check, and live SDK
  conformance passed after deployment.
- 2026-05-29: Updated conformance and examples to use the canonical egress
  preset ID `python-package-install`. The live SDK conformance passed against
  the deployed k0s/OpenSandbox stack, covering create, run with env/cwd/timeout,
  filesystem mkdir/write/stat/read/rename/upload/download/list/remove, detached
  command start/status/logs/kill, public route create/list/delete, token route
  create/list/delete, metrics, logs, restricted egress update/test, renew, and
  kill cleanup.
- 2026-05-29: Fixed CLI conformance parsing so it extracts the `sbx_...` ID
  from progress output instead of assuming the final output line is the ID. CLI
  conformance then passed against the deployed k0s/OpenSandbox stack with a
  temporary API key and cleaned-up sandbox.
- 2026-05-29: Fixed dashboard modal reachability by bounding modal height,
  making modal bodies scrollable, and keeping footers visible. This resolved
  the authenticated e2e failure where the New sandbox submit button could be
  outside the viewport.
- 2026-05-29: Fixed browser logout flow by returning immediately after starting
  Keycloak provider logout. The app no longer mutates the hash after
  `keycloak.logout({ logoutMethod: "GET" })`, preventing local navigation from
  racing or canceling the provider logout redirect. Web auth tests and
  authenticated e2e onboarding regression checks passed.
- 2026-05-29: Rebuilt and deployed the web image to k0s after the modal and
  logout fixes, restarted port forwards, and verified the deployed dashboard
  with `pnpm e2e` and `pnpm screenshots`. The e2e run passed real web/API/CLI/
  SDK sandbox workflows plus the completed-user onboarding redirect test. The
  screenshot run regenerated desktop/mobile artifacts under `docs/artifacts`.
  The OpenSandbox namespace was clean after tests and all forwarded local
  services were healthy.
