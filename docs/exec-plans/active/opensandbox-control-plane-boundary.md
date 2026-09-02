# Execution Plan: OpenSandbox Control Plane Boundary

**Created**: 2026-06-02
**Author**: Codex
**Status**: In Progress
**Priority**: P0
**Estimated effort**: 3-5 engineering days

## Context
Harakiri is an OSS product/control plane on top of OpenSandbox. The product
value is organization auth, API keys, routing records, templates, scheduling,
usage, audit, CLI/SDK ergonomics, and dashboard UX. OpenSandbox must remain the
owner of sandbox lifecycle and sandbox data-plane behavior.

The key architecture rule is explicit: Harakiri must not use Kubernetes
`pods/exec`, `kubectl exec`, direct pod log attach, or direct pod filesystem
scraping for normal runtime features. Command execution, terminal attach,
filesystem, logs, metrics, routes, and egress must go through OpenSandbox
control-plane and provider APIs. Direct Kubernetes access is limited to
platform/admin duties such as deployment, template builder jobs, image pull
preflights, and pre-pull cache warming.

## Research Findings
Sources checked on 2026-06-02:

- OpenSandbox `execd` documentation says the daemon exposes APIs for shell
  commands, filesystem operations, PTY sessions, and metrics:
  https://open-sandbox.ai/components/execd/readme
- OpenSandbox architecture documents `execd` as the in-sandbox execution API,
  including command execution, background command logs, persistent bash
  sessions, file/directory operations, metrics, and interactive PTY sessions:
  https://github.com/opensandbox-group/OpenSandbox/blob/main/docs/architecture.md
- The architecture flow for command/file/code execution is:
  resolve the `execd` endpoint from sandbox metadata or server proxy, call
  `execd` with `X-EXECD-ACCESS-TOKEN` when required, then let `execd` run the
  command, file operation, session, PTY, or Jupyter code execution.
- OpenSandbox egress is an OpenSandbox sidecar contract reached through
  endpoint resolution; callers patch `/policy` on the sidecar and forward the
  endpoint headers returned by lifecycle endpoint resolution.
- OpenSandbox ingress is a Kubernetes-oriented HTTP/WebSocket reverse proxy
  that supports header, URI, and wildcard-host routing modes. Harakiri should
  consume it rather than creating per-sandbox Kubernetes ingress resources for
  ordinary sandbox routes.
- OpenSandbox release notes for the Go SDK fixed a bug by forwarding all
  `GetEndpoint` headers on later `execd`/egress requests, not only the primary
  auth header. Harakiri should keep the same behavior because routing hints and
  sticky-session headers can be provider-owned:
  https://github.com/opensandbox-group/OpenSandbox/releases
- OpenSandbox `specs/execd-api.yaml` formally covers command execution,
  background command status/logs, filesystem APIs, metrics, and `/session`.
  `/pty` is documented in architecture and component docs, but is not currently
  represented in the formal OpenAPI file, so Harakiri must treat PTY as a
  feature-detected provider capability.

## Success Criteria
- [x] Normal Harakiri runtime code has no direct Kubernetes `pods/exec`,
      `kubectl exec`, direct pod log attach, or pod filesystem access.
- [x] All sandbox lifecycle, command, terminal, filesystem, logs, metrics,
      routes, and egress features are routed through OpenSandbox lifecycle,
      endpoint resolution, `execd`, diagnostics, ingress, or egress APIs.
- [x] Provider credentials and OpenSandbox endpoint headers stay server-side;
      users authenticate to Harakiri through OIDC or Harakiri API keys.
- [x] The runtime provider interface makes OpenSandbox-owned capabilities
      explicit: command execution, detached commands, sessions, PTY attach,
      filesystem, logs, metrics, routes, and egress.
- [x] Browser terminal attach uses a short-lived Harakiri attach ticket or an
      equivalent first-party Harakiri auth pattern; it does not expose raw
      OpenSandbox headers or API keys in frontend code.
- [x] If OpenSandbox does not expose a stable primitive, Harakiri returns an
      explicit capability/provider error or uses a documented OpenSandbox-owned
      fallback. It never falls back to Kubernetes exec.
- [x] CI has a source-level boundary test that fails when production runtime
      API code introduces forbidden Kubernetes runtime paths.
- [x] k0s smoke tests cover create, run, detached command logs, persistent
      session, terminal attach, files, metrics, logs, routes, egress, renew, and
      kill with `OPEN_SANDBOX_ALLOW_FALLBACK=0`.
- [x] Public OSS documentation explains the boundary clearly enough that
      contributors know where to add runtime features and what is forbidden.

## Phases

### Phase 1: Upstream Contract Lock
**Status**: Complete
- [x] Confirm OpenSandbox lifecycle APIs are the control-plane entry point for
      sandbox lifecycle and endpoint resolution.
- [x] Confirm OpenSandbox `execd` owns commands, files, metrics, persistent
      sessions, and PTY sessions.
- [x] Confirm OpenSandbox egress sidecar owns outbound policy inspection and
      mutation through endpoint-resolved `/policy`.
- [x] Confirm OpenSandbox ingress/gateway owns preview route HTTP/WebSocket
      forwarding.
- [x] Record `/session` as a formal OpenSandbox spec contract and `/pty` as a
      feature-detected OpenSandbox provider capability until upstream adds it
      to the formal OpenAPI file.
- [ ] Track upstream OpenSandbox releases for endpoint header handling,
      diagnostics/logs stability, PTY OpenAPI coverage, and filesystem endpoint
      improvements.

### Phase 2: Source And RBAC Boundary Audit
**Status**: In Progress
- [x] Add `apps/api/src/runtime-boundary.test.ts` to fail forbidden runtime
      Kubernetes patterns in production API code.
- [x] Allow `readNamespacedPodLog` only for template builder/admin paths.
- [x] Extend the boundary test with allowlisted path categories so future
      builder/preflight/deploy Kubernetes usage remains intentional and
      readable.
- [ ] Audit `infra/k8s/harakiri/harakiri.yaml` and split runtime API RBAC from
      builder/preflight RBAC where practical.
- [ ] Add a documentation check or maintainer checklist that calls out the
      boundary before accepting runtime-provider PRs.
- [x] Keep OpenSandbox provider RBAC documented separately from Harakiri API
      RBAC; OpenSandbox may need Kubernetes permissions to implement its own
      APIs, but Harakiri must not inherit them for runtime shortcuts.

### Phase 3: Provider Interface Hardening
**Status**: In Progress
- [x] Keep runtime behavior behind `RuntimeProvider` and
      `apps/api/src/providers/runtime/*`.
- [x] Expose explicit capability names for command execution, terminal attach,
      terminal resize, shell sessions, filesystem, logs, metrics, routes, and
      egress.
- [x] Map provider failures to stable Harakiri API errors instead of surfacing
      raw OpenSandbox or Kubernetes details.
- [x] Add capability health metadata that distinguishes:
      formal OpenSandbox spec support, OpenSandbox implementation-only support,
      provider unavailable, and provider unsupported.
- [x] Make `OPEN_SANDBOX_ALLOW_FALLBACK=0` disable all non-native
      OpenSandbox-owned fallbacks and verify every dashboard panel still shows
      honest capability errors.
- [ ] Move any remaining generic runtime helper code out of routes and into
      services/provider modules so route handlers cannot accidentally reach
      Kubernetes.

### Phase 4: Runtime Feature Alignment
**Status**: In Progress
- [x] Commands use endpoint-resolved OpenSandbox `execd` `/command`.
- [x] Detached command status/logs use OpenSandbox `execd` command resources.
- [x] Persistent non-interactive sessions use OpenSandbox `execd` `/session`.
- [x] CLI interactive attach uses OpenSandbox PTY through Harakiri's
      authenticated WebSocket bridge.
- [x] Filesystem listing and mutations use OpenSandbox `execd` APIs or
      OpenSandbox-owned `execd` command fallback where stable file APIs are
      absent.
- [x] Metrics use OpenSandbox `execd` `/metrics`.
- [x] Routes use OpenSandbox endpoint resolution/gateway behavior.
- [x] Egress uses OpenSandbox sandbox creation network policy and
      endpoint-resolved egress sidecar policy APIs.
- [x] Dashboard Terminal tab must use the same Harakiri WebSocket attach
      endpoint as CLI/SDK, with browser-safe short-lived attach tickets.
- [x] Runtime logs must prefer OpenSandbox diagnostics when available and show
      honest control-plane-only events when diagnostics are unavailable.
- [ ] Remove or rename any code/docs that imply Harakiri owns sandbox data-plane
      execution rather than wrapping OpenSandbox.

### Phase 5: Browser, CLI, And SDK Security Model
**Status**: In Progress
- [x] Node/server SDK clients can create WebSocket attach requests with
      Harakiri API-key headers.
- [x] CLI attach authenticates through Harakiri and keeps OpenSandbox endpoint
      headers server-side.
- [x] Browser dashboard attach must mint a short-lived, single-use Harakiri
      attach ticket because browser WebSockets cannot set `Authorization` or
      `x-api-key` headers reliably.
- [x] Attach tickets must be scoped to one sandbox, one organization, one user,
      a short TTL, and one successful WebSocket upgrade.
- [x] Attach audit events should record lifecycle metadata only: actor,
      organization, sandbox, options, duration, and close reason. Do not store
      raw terminal input/output by default.
- [x] Public docs should tell SDK users when to use `run`, detached commands,
      command sessions, terminal attach, files, routes, and egress.

### Phase 6: Verification And Deployment
**Status**: In Progress
- [x] Run contract checks:
      `pnpm --filter @harakiri/shared test`,
      `pnpm --filter @harakiri/api test`,
      `pnpm --filter @h-sandbox/sdk test`,
      `pnpm --filter @h-sandbox/cli test`, and `pnpm openapi:check`.
- [x] Run type/build checks:
      `pnpm --filter @harakiri/shared typecheck`,
      `pnpm --filter @harakiri/api typecheck`,
      `pnpm --filter @harakiri/web typecheck`,
      `pnpm --filter @h-sandbox/sdk typecheck`,
      `pnpm --filter @h-sandbox/cli typecheck`, and
      `pnpm --filter @h-sandbox/cli build`.
- [x] Run the boundary scan:
      `rg -n "pods/exec|kubectl exec|readNamespacedPodExec|readNamespacedPodLog|runInSandboxPod|kubernetes\\.exec" apps/api/src`
      and verify matches are only the guard test or builder/admin paths.
- [x] Deploy to k0s and run the deployed OpenSandbox smoke suite with
      `OPEN_SANDBOX_ALLOW_FALLBACK=0`.
- [ ] Browser-test the dashboard sandbox detail tabs through the deployed URL:
      Terminal, Filesystem, Logs, Metrics, Network.
- [ ] Update the completion notes with smoke sandbox IDs, commands, and any
      OpenSandbox provider limitations observed.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-06-02 | Harakiri runtime features must use OpenSandbox lifecycle, endpoint resolution, `execd`, diagnostics, ingress, and egress APIs. | Harakiri is the product/control plane; OpenSandbox owns sandbox lifecycle and data-plane semantics. This keeps the OSS architecture portable and avoids unsafe Kubernetes pod privileges. | Direct Kubernetes exec/logs/filesystem access; Harakiri-owned sidecar agent; SSH into sandbox pods. |
| 2026-06-02 | Treat Kubernetes usage as platform/admin only, not runtime feature implementation. | Template builders, deployments, image preflights, and pre-pull cache warming are Harakiri platform operations. Sandbox interaction is OpenSandbox-owned. | Give Harakiri API broad pod permissions in the OpenSandbox namespace. |
| 2026-06-02 | Treat OpenSandbox `/pty` as feature-detected until upstream adds it to the formal OpenAPI spec. | OpenSandbox docs and architecture describe PTY sessions, but the formal `execd-api.yaml` currently covers `/session` and command/file/metric APIs, not `/pty`. | Pretend PTY is a stable OpenAPI contract; use Kubernetes exec when PTY is unavailable. |
| 2026-06-02 | Forward all endpoint-resolution headers returned by OpenSandbox. | Upstream OpenSandbox release notes explicitly fixed SDK behavior around forwarding all `GetEndpoint` headers because routing/sticky-session hints may be provider-owned. | Forward only `X-EXECD-ACCESS-TOKEN`; reconstruct headers in Harakiri. |
| 2026-06-02 | Browser terminal attach needs a Harakiri-issued short-lived attach ticket. | Browser WebSocket constructors cannot attach arbitrary auth headers, and exposing API keys or OpenSandbox headers in query strings would be a security regression. | Put API keys in browser URLs; rely on cookies only; expose OpenSandbox endpoint URLs directly. |

## Tech Debt Incurred
- Some filesystem operations still use OpenSandbox-owned `execd` command
  fallbacks while waiting for stable dedicated OpenSandbox file endpoints. This
  is acceptable only because it stays inside OpenSandbox `execd`; it must never
  become a Kubernetes pod-exec fallback.
- OpenSandbox diagnostics/logs availability is provider/version dependent.
  Harakiri should keep displaying honest control-plane events when diagnostics
  are unavailable and revisit native diagnostics as upstream stabilizes.
- `/pty` needs ongoing upstream tracking because it is documented but not yet
  represented in `execd-api.yaml`.

## Completion Notes
Fill this section after implementation and deployed verification are complete.
