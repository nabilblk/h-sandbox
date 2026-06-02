# Execution Plan: CLI Interactive Attach

**Created**: 2026-06-01
**Author**: Codex
**Status**: Completed
**Priority**: P1
**Estimated effort**: 4-7 engineering days

## Context
Harakiri's CLI currently supports one-shot commands, tracked background
commands, command log polling, files, routes, metrics, and egress. It does not
provide a true `attach` mode that connects an operator or developer directly to
a running sandbox shell.

This is a real developer-experience gap for a sandbox control plane. A user
should be able to create a sandbox from the dashboard, SDK, or CLI, then attach
from a terminal without knowing anything about OpenSandbox internals or
Kubernetes.

The implementation must respect the product boundary:

- OpenSandbox owns sandbox lifecycle and data-plane access.
- Harakiri owns product auth, authorization, organization scope, API keys,
  audit events, CLI ergonomics, docs, and provider abstraction.
- Harakiri must not use Kubernetes pod exec for normal sandbox terminal access.

## Research Findings
OpenSandbox already exposes the right primitives through its control-plane and
in-sandbox `execd` contracts. Harakiri should package those primitives as a
premium product surface, not reimplement them by reaching into Kubernetes
sandbox pods.

Sources checked on 2026-06-02:

- OpenSandbox architecture defines a clear contract split: SDKs and tools depend
  on public contracts, the server owns lifecycle orchestration, runtime
  providers own platform-specific resource creation, and `execd`/egress own
  operations from inside the sandbox namespace:
  https://github.com/alibaba/OpenSandbox/blob/main/docs/architecture.md
- OpenSandbox lifecycle API is the control-plane source for sandbox lifecycle
  and endpoint resolution. It includes create/list/get/delete/renew and
  endpoint resolution for sandbox ports:
  https://github.com/alibaba/OpenSandbox/blob/main/specs/sandbox-lifecycle.yml
- OpenSandbox `execd-api.yaml` is the formal execution contract for commands,
  files, metrics, code contexts, and persistent bash sessions. It documents:
  `POST /session`, `POST /session/{sessionId}/run`, and
  `DELETE /session/{sessionId}`. Session runs stream command output over
  `text/event-stream` and maintain shell state such as working directory and
  environment:
  https://raw.githubusercontent.com/alibaba/OpenSandbox/main/specs/execd-api.yaml
- The same `execd-api.yaml` documents `POST /command`,
  `GET /command/status/{id}`, `GET /command/{id}/logs`, and command
  interruption. These are the correct primitives for one-shot and tracked
  background command workflows.
- OpenSandbox architecture documents interactive PTY sessions over WebSocket
  under `/pty`, but `/pty` is not currently represented in the formal OpenAPI
  spec. Harakiri can use it as an OpenSandbox-owned provider capability only
  with feature detection, explicit unsupported errors, and k0s smoke coverage.
- OpenSandbox `execd` authentication uses `X-EXECD-ACCESS-TOKEN`; Harakiri
  should keep this provider credential server-side and expose only Harakiri
  OIDC/API-key guarded endpoints to users.

Current Harakiri state:

- `harakiri attach <sandbox-id>` is implemented in the CLI as a PTY WebSocket
  client.
- `harakiri command run --detached` starts a background command and returns a
  command ID.
- `harakiri command logs` polls stdout/stderr for tracked commands.
- `RuntimeProvider.capabilities` currently reports `terminal: true`, plus
  command/file/log/route/egress capabilities, but there is no explicit
  machine-readable distinction between one-shot command execution, persistent
  sessions, and interactive PTY attach.
- OpenSandbox endpoint resolution and secure headers already live in the
  provider transport layer. The attach implementation should extend that path.

## Boundary Rules

- Harakiri runtime features must call OpenSandbox lifecycle, endpoint
  resolution, `execd`, diagnostics, ingress gateway, or egress APIs.
- Harakiri API must not use Kubernetes `pods/exec`, `kubectl exec`, or direct
  sandbox pod attach for normal terminal, command, filesystem, metrics, logs,
  route, egress, or lifecycle behavior.
- Direct Kubernetes usage remains allowed for platform/admin tasks only:
  installing Harakiri/OpenSandbox/Keycloak/PostgreSQL, running template build
  jobs, reading template builder logs, and runtime image pull/pre-pull
  preflights.
- If OpenSandbox lacks a stable primitive, Harakiri must either expose an
  explicit capability error or implement a provider-owned OpenSandbox fallback.
  It must not add a hidden Kubernetes fallback.
- Every public API, CLI, SDK, and dashboard feature added by this plan must be
  testable with `OPEN_SANDBOX_ALLOW_FALLBACK=0`.

## Success Criteria
- [x] `harakiri attach <sandbox-id>` opens an interactive shell in a running
      OpenSandbox-backed sandbox without using Kubernetes exec.
- [x] Attach works through Harakiri authentication and authorization, not by
      exposing raw OpenSandbox credentials to users.
- [x] Attach uses OpenSandbox `execd` PTY/WebSocket when available.
- [x] If PTY attach is unavailable, Harakiri returns an explicit capability
      error instead of silently degrading to a fake shell.
- [x] `harakiri command session create/run/delete` or equivalent stateful
      session commands expose OpenSandbox `/session` for non-interactive,
      state-preserving command workflows.
- [x] The dashboard terminal tab and CLI share the same Harakiri runtime
      contract.
- [x] Source scans prove the Harakiri API has no normal-runtime Kubernetes
      exec/log attach path; remaining Kubernetes usage is limited to builder,
      deployment, image preflight, or documentation contexts.
- [x] Terminal resize, Ctrl-C, Ctrl-D/exit, network disconnect, sandbox
      termination, and idle TTL renewal behavior are tested.
- [x] Public docs explain when to use `run`, `command run --detached`,
      `command session`, and `attach`.
- [x] k0s smoke tests prove the deployed feature works against real
      OpenSandbox sandboxes.

## Non-Goals
- Do not use Kubernetes `pods/exec`, `kubectl exec`, `readNamespacedPodExec`,
  or any direct sandbox pod attach path.
- Do not bypass Harakiri auth by returning long-lived OpenSandbox endpoint
  credentials to CLI users.
- Do not record full terminal input/output in Harakiri audit logs by default.
  Audit connection lifecycle and metadata only.
- Do not invent a Harakiri-only terminal protocol if OpenSandbox's PTY protocol
  is usable.
- Do not make `attach` depend on Cloudflare or the public `harakiri.io`
  environment; it must work against local port-forwarded API and deployed API.

## Phases

### Phase 0: Boundary Audit And Upstream Contract Lock
**Status**: Complete
- [x] Confirm OpenSandbox lifecycle and endpoint-resolution APIs are the
      control-plane entry point for sandbox access.
- [x] Confirm OpenSandbox `execd-api.yaml` formally supports persistent bash
      sessions through `/session`, `/session/{sessionId}/run`, and
      `/session/{sessionId}` delete.
- [x] Confirm command execution and background command tracking are already
      available through `execd` `/command` endpoints.
- [x] Confirm interactive PTY WebSocket is OpenSandbox-owned but currently
      documented in architecture rather than the formal OpenAPI spec.
- [x] Update the implementation posture: `/session` is a stable public
      OpenSandbox contract; `/pty` is a provider capability that must be
      feature-detected and smoke-tested.
- [x] Add a source-scan gate to CI or the API test suite that fails if normal
      runtime code imports or calls Kubernetes exec/log attach helpers.
- [x] Add a small architecture note explaining which Kubernetes calls are
      platform-admin paths and which runtime paths are forbidden.

### Phase 1: Provider Capability Spike
**Status**: Complete
- [x] Verify the exact OpenSandbox `/pty` WebSocket contract in the currently
      deployed OpenSandbox images (`server`, `execd`, and gateway).
- [x] Confirm how OpenSandbox encodes PTY input, output, resize events, close
      events, and shell selection.
- [x] Verify whether `/pty` is reachable through the same endpoint-resolution
      path already used for `execd` `/command`, `/files`, and `/metrics`.
- [x] Verify whether OpenSandbox ingress gateway preserves WebSocket upgrade
      headers for the `execd` endpoint in k0s.
- [x] Add a short provider notes section to `docs/opensandbox-boundaries.md`
      for PTY/session transport once verified.
- [x] Define provider capability names:
      `terminalAttach`, `terminalResize`, `shellSessions`, and
      `sessionCommands`.
- [x] Add provider capability health details that distinguish:
      formal OpenSandbox spec support, implementation-only provider support,
      unavailable, and unsupported.

### Phase 2: Public Runtime Contract
**Status**: Complete
- [x] Extend shared runtime capability types in `packages/shared` with terminal
      and session-specific capabilities.
- [x] Add public API types for terminal attach options:
      `shell`, `cwd`, `env`, `cols`, `rows`, and optional `sessionName`.
- [x] Add public API types for persistent shell sessions:
      create session, run command in session, delete session.
- [x] Make the public contract provider-neutral: API users should see Harakiri
      sandbox/session IDs and capability errors, not OpenSandbox or Kubernetes
      implementation details.
- [x] Add stable error codes for:
      `runtime_terminal_unsupported`, `runtime_terminal_unavailable`,
      `sandbox_terminal_session_not_found`, and
      `sandbox_terminal_attach_closed`.
- [x] Update OpenAPI docs for HTTP session endpoints.
- [x] Document the WebSocket attach endpoint outside OpenAPI if the current
      OpenAPI generator cannot represent WebSocket upgrade routes cleanly.

### Phase 3: API And Provider Implementation
**Status**: Complete
- [x] Add a Harakiri WebSocket endpoint:
      `GET /v1/sandboxes/:id/terminal/attach`.
- [x] Authorize attach with the same organization/API-key or OIDC rules as
      other sandbox runtime APIs.
- [x] Validate sandbox state: only `running` and `idle` sandboxes can be
      attached.
- [x] Renew sandbox TTL on successful attach and periodically while the attach
      session is active.
- [x] Add a runtime provider method for interactive PTY attach that accepts an
      already-authenticated client WebSocket and bridges to the provider-owned
      PTY endpoint.
- [x] Implement OpenSandbox PTY bridge using endpoint-resolved `execd` and
      secure access headers from the existing OpenSandbox transport layer.
- [x] Preserve WebSocket backpressure and close semantics so slow clients do
      not wedge the API process.
- [x] Add heartbeat/idle detection for dead WebSocket sessions.
- [x] Emit audit events:
      `terminal.attach.started`, `terminal.attach.ended`,
      `terminal.attach.failed`.
- [x] Avoid logging raw PTY input/output. Store metadata only: user,
      sandbox ID, shell, cwd, dimensions, duration, close reason.
- [x] Add API routes for shell session create/run/delete using OpenSandbox
      `/session` and `/session/{sessionId}/run`.
- [x] Keep route handlers thin; put runtime behavior in
      `services/sandbox-runtime.ts` and provider transport modules.
- [x] Keep all provider transport code behind
      `apps/api/src/providers/runtime/*`; no route or service should reach
      Kubernetes for normal sandbox runtime interaction.
- [x] Map OpenSandbox `/session` and `/pty` provider failures to stable
      Harakiri API errors with actionable messages.

### Phase 4: CLI Experience
**Status**: Complete
- [x] Add `harakiri attach <sandbox-id>`.
- [x] Add first-slice flags:
      `--cwd <path>`, `--no-raw`, `--cols <n>`, `--rows <n>`, and
      `--since <offset>`.
- [x] Add full attach option flags:
      `--shell <path>` and `--env KEY=VALUE`.
- [x] Put local terminal in raw mode when stdin/stdout are TTYs.
- [x] Forward stdin to the WebSocket and write PTY output to stdout.
- [x] Forward terminal resize events.
- [x] Handle Ctrl-C as terminal input by default, not as immediate CLI process
      termination.
- [x] Treat Ctrl-D, `exit`, remote close, and sandbox termination as clean
      session end cases with clear exit messages.
- [x] Return non-zero exit codes for auth failure, sandbox not found,
      terminal unsupported, and connection failures.
- [x] Add `harakiri shell <sandbox-id>` as a friendly alias only if it does not
      create command ambiguity. Deliberately not added for v1 because `attach`
      is explicit and avoids ambiguity with non-interactive command sessions.
- [x] Add persistent session commands:
      `harakiri command session create/run/delete`.
- [x] Update CLI README and `harakiri --help` examples.

### Phase 5: Dashboard Terminal Integration
**Status**: Complete
- [x] Reuse the same Harakiri WebSocket endpoint in the sandbox Terminal tab.
- [x] Use the existing Harakiri design tokens and terminal visual language.
- [x] Show terminal capability errors clearly when the provider does not expose
      PTY attach.
- [x] Add reconnect behavior that creates a new PTY session by default and does
      not imply persistent terminal history unless session persistence exists.
- [x] Add visible connection state: connecting, attached, reconnecting, closed.
- [x] Ensure the filesystem, logs, metrics, network, and terminal tabs continue
      using provider APIs only.

### Phase 6: SDK And Documentation
**Status**: Complete
- [x] Add TypeScript SDK helpers for:
      `sandbox.terminal.attachUrl()` or `client.createTerminalWebSocket(...)`
      depending on the final security model.
- [x] Add SDK helpers for shell sessions:
      create, run, delete.
- [x] Explain browser vs Node SDK behavior. Browser clients use short-lived
      attach tickets minted through OIDC-authenticated Harakiri HTTP calls;
      Node/server clients can use API keys.
- [x] Add docs page:
      `docs/integrations/interactive-terminal.md`.
- [x] Add website product docs for CLI attach with copy-paste examples.
- [x] Document the decision that Harakiri never uses Kubernetes pod exec for
      normal terminal access.
- [x] Update `docs/sandbox-runtime-contract.md` with terminal/session
      semantics and capability states.
- [x] Add a short "Why no Kubernetes exec" section in the docs so OSS users
      understand the security and portability boundary.
- [x] Link the docs to the OpenSandbox lifecycle and `execd` specs as the
      upstream contracts Harakiri wraps.

### Phase 7: Testing And Deployment
**Status**: Complete
- [x] Unit-test capability reporting.
- [x] Unit-test terminal-specific unsupported-provider errors.
- [x] Unit-test session create/run/delete service behavior.
- [x] Integration-test WebSocket attach route with a fake provider.
- [x] CLI-test argument parsing, raw-mode lifecycle, resize forwarding, and
      failure handling.
- [x] k0s smoke: create sandbox, attach, run `pwd`, send Ctrl-D/exit, verify
      clean close.
- [x] k0s smoke: attach, run long command, send Ctrl-C, verify the shell stays
      usable or closes according to OpenSandbox PTY semantics.
- [x] k0s smoke: dashboard Terminal tab connects through browser WebSocket.
- [x] Run targeted checks:
      `pnpm --filter @harakiri/shared test`,
      `pnpm --filter @harakiri/api test`,
      `pnpm --filter @h-sandbox/cli test`, and
      `pnpm --filter @h-sandbox/cli typecheck`.
- [x] Run SDK targeted checks:
      `pnpm --filter @h-sandbox/sdk test`.
- [x] Run type and build checks:
      `pnpm --filter @harakiri/shared typecheck`,
      `pnpm --filter @harakiri/api typecheck`,
      `pnpm --filter @h-sandbox/sdk typecheck`,
      `pnpm --filter @h-sandbox/cli typecheck`,
      `pnpm --filter @h-sandbox/cli build`, and
      `pnpm openapi:check`.
- [x] Run dashboard E2E for the affected terminal path once dashboard terminal
      reuse lands.
- [x] Deploy to k0s and verify through local port-forwarded API and public
      Cloudflare tunnel API.
- [x] Add or run a boundary scan before merge/deploy:
      `rg -n "pods/exec|kubectl exec|readNamespacedPodExec|readNamespacedPodLog|runInSandboxPod|kubernetes\\.exec" apps/api/src`
      and verify matches are builder/admin paths only.
- [x] k0s smoke: persistent session create, run `cd /tmp && pwd`, run `pwd`
      again in the same session, verify state is preserved, delete session,
      and kill sandbox.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-06-01 | Interactive attach must use OpenSandbox `execd` PTY/session APIs, never Kubernetes exec. | Harakiri is the control plane on top of OpenSandbox; direct pod exec would violate provider boundaries and require unsafe sandbox namespace privileges. | Kubernetes pod exec; SSH sidecar owned by Harakiri. |
| 2026-06-01 | Harakiri should proxy authenticated WebSocket attach rather than hand raw provider credentials to users. | Keeps organization authorization, API-key/OIDC auth, auditing, and provider credential handling centralized in Harakiri. | Return OpenSandbox endpoint URL and secure headers to CLI; expose OpenSandbox directly. |
| 2026-06-01 | PTY attach should fail explicitly if unavailable; persistent `/session` commands are a separate non-interactive feature. | A line-oriented session is not a real interactive terminal. Silent degradation would produce confusing terminal behavior. | Fake attach by polling command logs; start `bash` as a detached command and tail logs. |
| 2026-06-02 | Treat OpenSandbox `/session` as the stable non-interactive stateful shell contract and `/pty` as a feature-detected provider capability until upstream adds it to the formal spec. | `/session` is in `specs/execd-api.yaml`; `/pty` is documented in architecture and works in deployed images but is not in the OpenAPI file. This keeps Harakiri honest about contract maturity. | Use only `/pty`; invent a Harakiri shell protocol; use Kubernetes exec as fallback. |
| 2026-06-02 | Keep `shell`, `env`, and `sessionName` in Harakiri's public terminal attach contract, but return explicit unsupported errors when OpenSandbox cannot honor them. | Current OpenSandbox `POST /pty` accepts only `cwd` and launches Bash internally. Harakiri should keep a provider-neutral contract without silently ignoring requested shell/env values or injecting terminal input hacks. | Drop the fields until upstream supports them; emulate shell/env by writing bootstrap commands into the PTY; use Kubernetes exec to select shell/env. |
| 2026-06-02 | Browser terminal attach uses short-lived, one-time Harakiri attach tickets. | Browser WebSocket constructors cannot reliably set `Authorization` or `x-api-key` headers, and API keys/OpenSandbox endpoint headers must not appear in browser JavaScript or query strings. | Put API keys in WebSocket URLs; expose raw OpenSandbox endpoints; rely on cookies only. |
| 2026-06-02 | Harakiri sends a first-party `connected` terminal control frame after the authorized provider PTY session is created. | CLI and dashboard should share a stable Harakiri terminal protocol instead of depending on provider-specific WebSocket greeting behavior. | Wait for OpenSandbox to send a provider frame; mark browser WebSocket open as terminal-attached. |
| 2026-06-02 | Do not add `harakiri shell` as a v1 alias. | `harakiri attach` is explicit and avoids ambiguity with command-session workflows. The alias can be revisited later if user testing shows it improves discoverability. | Add `shell` immediately; overload `command session` terminology. |
| 2026-06-02 | Runtime capabilities include `contract` and `source` metadata. | Integrators need to know whether a feature is formal OpenSandbox spec, current OpenSandbox provider behavior, Harakiri control-plane overlay, unavailable, or unsupported without reading implementation code. | Keep only `available/degraded/unavailable`; document maturity outside the API. |

## Tech Debt Incurred
None planned. If the first slice ships without dashboard terminal reuse, record
that as temporary UX debt and link it back to this plan.

## Completion Notes
2026-06-01 first implementation slice:

- Implemented OpenSandbox PTY attach through Harakiri:
  `POST /pty`, `GET /pty/:sessionId/ws`, and `DELETE /pty/:sessionId`, reached
  through the existing endpoint-resolved `execd` port `44772` path.
- Added Harakiri WebSocket endpoint:
  `GET /v1/sandboxes/:id/terminal/attach`.
- Added CLI command:
  `harakiri attach <sandbox-id> [--cwd <path>] [--cols <n>] [--rows <n>] [--since <offset>] [--no-raw]`.
- Added capability names and error codes for terminal attach, terminal resize,
  shell sessions, and terminal provider failures.
- Added `docs/integrations/interactive-terminal.md` and updated
  `docs/opensandbox-boundaries.md`.
- Verified locally:
  `pnpm --filter @harakiri/shared test`,
  `pnpm --filter @harakiri/api test`,
  `pnpm --filter @h-sandbox/cli test`,
  `pnpm --filter @h-sandbox/cli typecheck`.
- Deployed with `pnpm env:harakiri:deploy-public`.
- k0s/local smoke passed through `http://127.0.0.1:18082`: created sandbox,
  attached with CLI, ran `pwd`, observed `/workspace`, exited, and killed the
  sandbox.
- Public Cloudflare smoke passed through `https://sb-api.harakiri.io` with the
  same create, attach, `pwd`, exit, and cleanup flow.
- Temporary smoke API keys were revoked after verification.

Remaining scope from this slice was completed by later slices in this plan.

2026-06-02 persistent session implementation slice:

- Implemented OpenSandbox-backed persistent command sessions through Harakiri
  API routes:
  `POST /v1/sandboxes/:id/command-sessions`,
  `POST /v1/sandboxes/:id/command-sessions/:sessionId/run`, and
  `DELETE /v1/sandboxes/:id/command-sessions/:sessionId`.
- Implemented provider-neutral runtime service methods that authorize the
  Harakiri organization/sandbox, renew activity on create/run, record lifecycle
  events, and map provider failures to stable Harakiri API errors.
- Implemented OpenSandbox transport calls to endpoint-resolved `execd`:
  `POST /session`, `POST /session/:sessionId/run`, and
  `DELETE /session/:sessionId`.
- Added shared OpenAPI/types, SDK helpers, and CLI commands:
  `harakiri command session create/run/delete`.
- Added docs in `docs/integrations/interactive-terminal.md`,
  `docs/sandbox-runtime-contract.md`, and `docs/api.md` explaining when to use
  one-shot commands, detached commands, persistent sessions, and attach.
- Verified locally:
  `pnpm --filter @harakiri/shared test`,
  `pnpm --filter @harakiri/api test`,
  `pnpm --filter @h-sandbox/sdk test`, and
  `pnpm --filter @h-sandbox/cli test`.
- Type/build/contract verification passed:
  `pnpm --filter @harakiri/shared typecheck`,
  `pnpm --filter @harakiri/api typecheck`,
  `pnpm --filter @h-sandbox/sdk typecheck`,
  `pnpm --filter @h-sandbox/cli typecheck`,
  `pnpm --filter @h-sandbox/cli build`, and
  `pnpm openapi:check`.
- Boundary scan passed:
  `rg -n "pods/exec|kubectl exec|readNamespacedPodExec|readNamespacedPodLog|runInSandboxPod|kubernetes\\.exec" apps/api/src`
  returned only template builder log reads in
  `apps/api/src/builders/kaniko-builder.ts` and
  `apps/api/src/builders/buildkit-kubernetes-builder.ts`, which are
  platform/admin builder paths.
- Deployed with `KUBECONFIG=infra/k0s/harakiri.kubeconfig pnpm env:harakiri:deploy-public`
  and restarted forwards with `pnpm ports:restart`.
- k0s/local persistent session smoke passed through
  `http://127.0.0.1:18082`: sandbox `sbx_yw8V3TEz2W`, session
  `48b97e45-5bd8-4186-a64a-29d0a37b58b7`, `cd /tmp && pwd` returned `/tmp`,
  a second `pwd` returned `/tmp`, then the session and sandbox were deleted.
- Public Cloudflare persistent session smoke passed through
  `https://sb-api.harakiri.io`: sandbox `sbx_mQakenUBe4`, session
  `bb867fe1-6962-4491-b722-11ab77af44f5`, `cd /tmp && pwd` returned `/tmp`,
  a second `pwd` returned `/tmp`, then the session and sandbox were deleted.
- Post-smoke PostgreSQL cleanup audit reported `active_smoke_keys=0` and
  `active_smoke_sandboxes=0` for `session-smoke-*`.

Remaining scope from this slice was completed by later slices in this plan.

2026-06-02 attach contract hardening slice:

- Added provider-neutral terminal attach options across shared types, API query
  validation, runtime service input, CLI flags, and SDK helpers:
  `cwd`, `shell`, `env`, `sessionName`, `cols`, `rows`, `since`, and `pty`.
- Rechecked OpenSandbox upstream implementation:
  `components/execd/pkg/web/controller/pty_controller.go` creates PTY sessions
  with `cwd` only; `components/execd/pkg/runtime/pty_session.go` launches
  `bash --norc --noprofile` and uses the sandbox process environment.
- Implemented explicit `RuntimeUnsupportedError` mapping so non-default
  `--shell` or any per-attach `--env` returns
  `runtime_terminal_unsupported` instead of being ignored or emulated.
- Added SDK helpers:
  `client.terminal.attachUrl(...)` and
  `client.terminal.attachRequest(...)`. The request helper returns the
  WebSocket URL plus `x-api-key` headers for Node/server clients; docs direct
  browser clients to rely on OIDC session auth instead of exposing API keys.
- Added CLI support for `harakiri attach --shell`, repeated `--env`, and
  `--session-name`; CLI now prints Harakiri WebSocket error envelopes and exits
  non-zero on provider-reported attach errors.
- Updated `packages/cli/README.md` and top-level `harakiri --help` examples
  with attach and persistent command-session workflows.
- Added `apps/api/src/runtime-boundary.test.ts`, which fails if production
  runtime API code introduces Kubernetes exec or pod-log attach paths. Builder
  pod log reads remain explicitly allowed as platform/admin paths.
- Verified:
  `pnpm --filter @harakiri/shared test`,
  `pnpm --filter @harakiri/api test`,
  `pnpm --filter @h-sandbox/sdk test`,
  `pnpm --filter @h-sandbox/cli test`,
  `pnpm --filter @harakiri/shared typecheck`,
  `pnpm --filter @harakiri/api typecheck`,
  `pnpm --filter @h-sandbox/sdk typecheck`,
  `pnpm --filter @h-sandbox/cli typecheck`,
  `pnpm --filter @h-sandbox/cli build`,
  `pnpm openapi:check`, and `git diff --check`.
- Manual boundary scan:
  `rg -n "pods/exec|kubectl exec|readNamespacedPodExec|readNamespacedPodLog|runInSandboxPod|kubernetes\\.exec" apps/api/src`
  returns the guard test itself plus builder/admin `readNamespacedPodLog`
  usage in `kaniko-builder.ts` and `buildkit-kubernetes-builder.ts`.

2026-06-02 dashboard attach-ticket and WebSocket hardening slice:

- Added short-lived browser terminal attach tickets:
  `POST /v1/sandboxes/:id/terminal/attach-ticket` returns a one-time ticket,
  expiration, and browser-safe WebSocket URL. The WebSocket route consumes the
  ticket without requiring browser-only custom headers.
- Updated the dashboard Terminal tab to use the same Harakiri attach WebSocket
  contract as the CLI, with attach-ticket minting, connection states,
  reconnect, Ctrl-C, close controls, and provider error display.
- Made Harakiri emit a stable `connected` terminal control frame after the
  provider PTY session is created, so UI/CLI readiness is not tied to
  provider-specific upstream greeting behavior.
- Hardened the OpenSandbox PTY bridge with ping/pong heartbeat, bounded
  WebSocket forwarding, sanitized close-code propagation, and cleanup of
  message/error/pong handlers.
- Tightened CLI close semantics: a connected terminal closing with code `1000`
  exits successfully, while a socket that closes before the terminal is ready
  exits non-zero with a clear message.
- Added CLI tests for provider-reported terminal errors, clean connected close,
  and pre-ready close failures.
- Verification passed:
  `pnpm --filter @h-sandbox/cli test`,
  `pnpm --filter @harakiri/api test`,
  `pnpm --filter @harakiri/web test`,
  `pnpm --filter @harakiri/shared test`,
  `pnpm --filter @h-sandbox/sdk test`,
  `pnpm --filter @harakiri/web typecheck`,
  `pnpm --filter @harakiri/shared typecheck`,
  `pnpm --filter @harakiri/api typecheck`,
  `pnpm --filter @h-sandbox/sdk typecheck`,
  `pnpm --filter @h-sandbox/cli typecheck`,
  `pnpm --filter @h-sandbox/cli build`,
  `pnpm openapi:check`, and `git diff --check`.
- Boundary scan:
  `rg -n "pods/exec|kubectl exec|readNamespacedPodExec|readNamespacedPodLog|runInSandboxPod|kubernetes\\.exec" apps/api/src`
  returns only `apps/api/src/runtime-boundary.test.ts` plus builder/admin
  `readNamespacedPodLog` usage in `kaniko-builder.ts` and
  `buildkit-kubernetes-builder.ts`.

2026-06-02 final capability metadata and deployed smoke slice:

- Added runtime capability health metadata:
  `contract` distinguishes `opensandbox_spec`, `opensandbox_provider`,
  `harakiri_control_plane`, `unavailable`, and `unsupported`; `source` explains
  the concrete provider/control-plane source.
- Updated shared API types, SDK protocol types, OpenAPI schema, API capability
  mapping, CLI `harakiri capabilities` output, SDK/API docs, and runtime
  contract docs.
- Deployed the current API/web build to k0s with
  `pnpm env:harakiri:deploy-public` and restarted local forwards with
  `pnpm ports:restart`.
- Current local capability smoke passed against `http://127.0.0.1:18082`:
  provider `opensandbox`, 16 capabilities, and verified `commands` as
  `opensandbox_spec`, `terminalAttach` as `opensandbox_provider`, and
  `tokenRoutes` as `harakiri_control_plane`.
- Current public tunnel smoke passed against `https://sb-api.harakiri.io`,
  verifying the same deployed capability metadata through Cloudflare.
- Current k0s CLI attach smoke passed on sandbox `sbx_xmGbddfLTo`: attached
  through Harakiri, ran `pwd`, observed `/workspace`, echoed
  `HARAKIRI_CURRENT_ATTACH`, exited cleanly, and deleted the sandbox/API key.
- Current k0s Ctrl-C smoke passed on sandbox `sbx_1GqE2m2U97`: attached,
  started `sleep 20`, sent Ctrl-C, verified the shell remained usable with
  `HARAKIRI_CTRL_C_ALIVE`, exited, and cleaned up.
- Current k0s sandbox-termination smoke passed on sandbox `sbx_YJdmH65S4j`:
  attached, deleted the sandbox while the terminal was open, and verified the
  CLI closed instead of hanging.
- Current dashboard E2E passed:
  `HARAKIRI_CLI_BIN="$PWD/packages/cli/dist/index.js" pnpm exec playwright test tests/e2e/harakiri.spec.ts --grep "real Web, API, CLI, and SDK"`
  with 1 test passing against the deployed k0s stack.
- Final verification passed:
  `pnpm --filter @harakiri/shared test`,
  `pnpm --filter @harakiri/api test`,
  `pnpm --filter @h-sandbox/cli test`,
  `pnpm --filter @h-sandbox/sdk test`,
  `pnpm --filter @harakiri/shared typecheck`,
  `pnpm --filter @h-sandbox/sdk typecheck`,
  `pnpm --filter @h-sandbox/cli typecheck`,
  `pnpm --filter @harakiri/api typecheck`,
  `pnpm --filter @harakiri/web typecheck`,
  `pnpm --filter @h-sandbox/cli build`,
  `pnpm openapi:check`, and `git diff --check`.
- Final boundary scan returns only the runtime-boundary guard test plus
  builder/admin `readNamespacedPodLog` paths in BuildKit/Kaniko template
  builders. No normal runtime path uses Kubernetes exec or pod-log attach.
