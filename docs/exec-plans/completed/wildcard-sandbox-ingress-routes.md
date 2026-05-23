# Execution Plan: Wildcard Sandbox Ingress Routes

**Created**: 2026-05-23
**Author**: Codex
**Status**: Completed
**Priority**: {P0-P3}
**Estimated effort**: 3-5 engineering days

## Context
Harakiri currently stores `sandbox_routes` and can return a prototype route through the port-forwarded OpenSandbox server proxy. That works locally, but it is not the E2B-style product experience the platform needs. Users should be able to start a server inside a sandbox on a port, then open a stable browser URL for that sandbox port.

The DNS zone is `harakiri.io`, and wildcard sandbox routes live directly under `harakiri.io` as `<opensandbox-id>-<port>.harakiri.io`. This keeps route hosts compatible with the existing Cloudflare `*.harakiri.io` edge certificate while still using OpenSandbox's standard host-mode routing.

OpenSandbox already provides the standard routing primitive for this:
- OpenSandbox Ingress supports HTTP/WebSocket proxying and host-header routing in the form `<sandbox-id>-<port>.<domain>`.
- OpenSandbox Ingress also supports URI mode, but host mode is the closest match to E2B-style `getHost(port)` URLs.
- OpenSandbox server/gateway chart support can return gateway-style endpoint URLs when configured for ingress/gateway mode.

Important current-code constraints:
- Harakiri sandbox IDs currently look like `sbx_...`, which include underscores and are not valid DNS labels.
- Existing sandbox IDs should not be broken.
- OpenSandbox provider IDs are DNS-safe UUID-like values and are the most direct key for OpenSandbox host-mode ingress.
- Therefore v1 should decouple the internal Harakiri sandbox ID from the public route key. Store a DNS-safe route key in `sandbox_routes` and return `https://<route-key>.harakiri.io`.

Primary references:
- OpenSandbox Ingress: https://open-sandbox.ai/components/ingress/readme
- OpenSandbox single-host networking: https://open-sandbox.ai/zh/design/single-host-network
- OpenSandbox Helm chart ingress/gateway support: https://open-sandbox.ai/kubernetes/charts/opensandbox/readme
- E2B-style SDK shape: expose a host for a sandbox port, equivalent to `getHost(port)`

## Success Criteria
- [x] A sandbox running an HTTP server on port `3000` can be reached at a public HTTPS URL under `*.harakiri.io`.
- [x] The public route uses OpenSandbox ingress/gateway host routing, not a custom Harakiri reverse proxy.
- [x] Route creation is explicit by port through API, CLI, SDK, and dashboard.
- [x] `GET /v1/sandboxes/:id/routes` returns persisted route records with `port`, `protocol`, `host`, `url`, `state`, and provider metadata.
- [x] `POST /v1/sandboxes/:id/routes` creates or returns an idempotent route for a requested port.
- [x] The dashboard Network tab lets users expose a port, copy/open the URL, and see route state.
- [x] The CLI supports an E2B-like flow, for example `harakiri expose <sandbox-id> --port 3000`.
- [x] The SDK exposes a method equivalent to `getHost(port)` or `exposePort(port)`.
- [x] HTTP, SSE, and WebSocket forwarding are verified through the wildcard host route locally via the OpenSandbox gateway.
- [x] Terminated sandboxes stop serving routes without leaving dangling reachable backends.
- [x] k0s deployment scripts install/configure the ingress path repeatably, with Cloudflare/TLS secrets kept out of git.
- [x] Documentation explains Cloudflare DNS, TLS, route naming, local-dev fallback, and security model.

## Phases

### Phase 1: Routing Architecture And Domain Contract
**Status**: Complete
- [x] Confirm the exact public route host format for v1: `https://<route-key>.harakiri.io`.
- [x] Define `route-key` as `<opensandbox-id>-<port>` for the first implementation because OpenSandbox host-mode ingress can parse it directly.
- [x] Document why Harakiri internal IDs are not used in DNS: current IDs contain `_`, which is not DNS-label compatible.
- [x] Decide whether future sandbox IDs should become DNS-safe, while keeping backward compatibility for existing `sbx_...` IDs.
- [x] Define route states: `provisioning`, `ready`, `unhealthy`, `terminated`.
- [x] Define supported protocols for v1: HTTP and WebSocket over HTTPS/WSS, with raw TCP explicitly out of scope.
- [x] Define route lifecycle: created on explicit expose request, reused idempotently per sandbox/port, marked terminated when sandbox terminates.

### Phase 2: Kubernetes And Cloudflare Ingress Foundation
**Status**: Complete
- [x] Add an ingress controller path for k0s if not already present. Prefer `ingress-nginx` for this repo because it is simple, standard, and widely supported by Kubernetes Ingress v1.
- [x] Deploy or enable OpenSandbox Ingress/Gateway in header/host mode.
- [x] Configure OpenSandbox ingress service to accept wildcard host traffic and preserve the Host header.
- [x] Add a Kubernetes `Ingress` resource for `*.harakiri.io` pointing to the OpenSandbox ingress/gateway service.
- [x] Add TLS support for `*.harakiri.io`.
- [x] Choose the TLS automation path:
  - `cert-manager` with Cloudflare DNS-01 if a Cloudflare API token is available.
  - Cloudflare Tunnel or Cloudflare Origin Certificate if the k0s cluster has no public LoadBalancer.
- [x] Store Cloudflare credentials only as Kubernetes Secrets or local ignored files, never in git.
- [x] Add environment variables/config:
  - `SANDBOX_ROUTE_BASE_DOMAIN=harakiri.io`
  - `SANDBOX_ROUTE_PUBLIC_SCHEME=https`
  - `SANDBOX_ROUTE_MODE=opensandbox-ingress`
  - `SANDBOX_ROUTE_LOCAL_FALLBACK_URL=http://127.0.0.1:18083`
- [x] Update `infra/k0s/bootstrap.sh` and `infra/scripts/deploy-k0s.sh` so cluster route prerequisites are repeatable.
- [x] Add a verification script that checks DNS, TLS, and ingress health before app-level route smoke tests.

### Phase 3: Database And API Route Model
**Status**: Complete
- [x] Add a migration that extends `sandbox_routes` with provider-aware route fields:
  - `route_key TEXT`
  - `url TEXT`
  - `state TEXT`
  - `provider TEXT`
  - `provider_route_id TEXT`
  - `last_checked_at TIMESTAMPTZ`
  - `terminated_at TIMESTAMPTZ`
- [x] Keep `host` and `target_url` compatibility during the migration; avoid breaking existing route records.
- [x] Add an index or unique constraint for `(sandbox_id, port)` and for `host`.
- [x] Add route validation:
  - port integer in `1..65535`
  - protocol in `http | https`
  - sandbox must belong to the authenticated organization
  - sandbox must be running or pending, not terminated
- [x] Add `POST /v1/sandboxes/:id/routes` for idempotent route creation.
- [x] Update `GET /v1/sandboxes/:id/routes` to return all routes and optionally create default route only when explicitly requested by query or UI.
- [x] Add `DELETE /v1/sandboxes/:id/routes/:port` to mark a route disabled if product needs route revocation.
- [x] Add audit events for route creation, route health changes, and route deletion.
- [x] Add sandbox events such as `route.created`, `route.ready`, and `route.unhealthy`.

### Phase 4: OpenSandbox Adapter Integration
**Status**: Complete
- [x] Update `apps/api/src/opensandbox.ts` so route generation is provider-aware.
- [x] Add an adapter method such as `ensureRoute(opensandboxId, port)` that returns:
  - `routeKey`
  - `host`
  - `url`
  - `provider`
  - `state`
- [x] In ingress mode, derive the URL as `https://<opensandboxId>-<port>.harakiri.io`.
- [x] In local fallback mode, keep using OpenSandbox server endpoint lookup with `use_server_proxy=true`.
- [x] Call OpenSandbox endpoint lookup or ingress readiness checks to validate that the sandbox has routable endpoints before marking the route `ready`.
- [x] Preserve the original request path and WebSocket upgrade behavior by relying on OpenSandbox ingress, not Harakiri.
- [x] Add retry/backoff for newly started sandbox servers because users may expose a port before their app is listening.
- [x] Add route health checks that differentiate:
  - DNS/TLS/ingress reachable
  - sandbox found
  - port not listening yet
  - sandbox terminated

### Phase 5: Dashboard Network Tab
**Status**: Complete
- [x] Replace the current static Network tab with an operational route manager.
- [x] Show existing routes with columns: port, protocol, URL, state, created time, last checked.
- [x] Add an `Expose port` control with numeric port input and protocol selector.
- [x] Add copy URL and open URL actions.
- [x] Add clear states:
  - No routes exposed
  - Waiting for app on port
  - Route ready
  - Sandbox terminated
  - Route unhealthy
- [x] Add UI copy that explains the route is public while the sandbox is alive.
- [x] Avoid showing internal OpenSandbox IDs as primary UI labels unless needed for debugging.
- [x] Keep visual style aligned with the existing table/detail design tokens.

### Phase 6: CLI And SDK Developer Experience
**Status**: Complete
- [x] Add CLI command: `harakiri expose <sandbox-id> --port <port> [--protocol http]`.
- [x] Add CLI command or option to list exposed routes: `harakiri routes <sandbox-id>`.
- [x] Print a concise route result:
  - `→ exposing port 3000`
  - `✓ https://<route-key>.harakiri.io`
- [x] Add SDK method `getHost(sandboxId, port)` or `exposePort(sandboxId, port)`.
- [x] Add SDK/CLI tests for idempotent route creation and invalid port errors.
- [x] Update docs examples to show starting a server inside a sandbox and opening the route URL.

### Phase 7: Security, Limits, And Lifecycle Controls
**Status**: Complete
- [x] Treat v1 routes as public but unguessable and TTL-bound, matching the common sandbox preview URL model.
- [x] Document that route URLs should not be used for secrets or production services.
- [x] Consider adding optional route auth in a later phase using Cloudflare Access or a signed-token gateway only if required.
- [x] Add organization-level route limits:
  - max routes per sandbox
  - allowed port ranges
  - max concurrent public routes
- [x] Enforce cleanup: scheduler marks route state `terminated` when sandbox TTL expires or user kills the sandbox.
- [x] Confirm OpenSandbox ingress returns 404/503 for deleted or not-ready sandboxes and does not leak backend information.
- [x] Add audit logging for route access decisions only if OpenSandbox/Cloudflare logs can be consumed without building a custom proxy.

### Phase 8: Verification And Test Matrix
**Status**: Complete
- [x] Add API tests for route create/list/delete validation.
- [x] Add route smoke script:
  - create sandbox
  - start `python -m http.server 3000`
  - expose port 3000
  - curl `https://<route-host>/`
  - kill sandbox
  - verify route stops serving
- [x] Add WebSocket smoke test using a small Node or Python WebSocket server in a sandbox.
- [x] Add Playwright E2E coverage for the Network tab expose/copy/open flow.
- [x] Add CLI E2E coverage for `harakiri expose`.
- [x] Add DNS/TLS preflight checks:
  - `dig *.harakiri.io` or concrete route host resolves
  - certificate is valid for `*.harakiri.io`
  - ingress health endpoint is reachable
- [x] Run the full existing regression suite after route implementation:
  - `pnpm test`
  - `pnpm build`
  - `HARAKIRI_CLI_BIN=harakiri pnpm e2e`
  - route smoke tests

### Phase 9: Documentation And Handoff
**Status**: Complete
- [x] Update `docs/architecture.md` with the ingress route architecture.
- [x] Update `docs/api.md` with route creation/listing/deletion contracts.
- [x] Update `docs/runbook.md` with Cloudflare DNS, cert-manager or tunnel setup, and route smoke testing.
- [x] Update `README.md` quickstart with an exposed web server example.
- [x] Add a production hardening note for private route auth, route quotas, observability, and abuse controls.
- [x] Record final commands run and screenshots/artifacts in `docs/test-report.md`.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-05-23 | Use OpenSandbox Ingress host mode behind `*.harakiri.io` | OpenSandbox already implements HTTP/WebSocket routing by host key and port; this avoids a custom Harakiri reverse proxy. | Build a Harakiri proxy; create per-sandbox Kubernetes Ingress objects |
| 2026-05-23 | Decouple internal sandbox ID from public route key | Current Harakiri IDs contain underscores and are not valid DNS labels. A route key stored in `sandbox_routes` avoids breaking existing IDs. | Rename all sandbox IDs immediately; use path-based routing |
| 2026-05-23 | Use `<opensandbox-id>-<port>.harakiri.io` for v1 route hosts | OpenSandbox host mode expects `<sandbox-id>-<port>.<domain>` and can parse UUID-like provider IDs directly. | Human-readable arbitrary hostnames, which require a mapping proxy or header rewrite layer |
| 2026-05-23 | Make port exposure explicit | E2B-style APIs expose a requested port; auto-detecting every listening port can leak unintended services. | Auto-expose Dockerfile `EXPOSE` ports or scan all listening ports |
| 2026-05-23 | Keep sandbox route hosts one label under `harakiri.io` | Cloudflare Universal SSL already covers `*.harakiri.io`, avoiding paid advanced edge certificates for a deeper `*.sb.harakiri.io` wildcard. | Use `*.sb.harakiri.io` with Advanced Certificate Manager; add a custom header rewrite layer |

## Tech Debt Incurred
- The official OpenSandbox ingress image in the upstream registry did not have a usable platform manifest for this k0s VM, so `deploy-k0s.sh` builds the official ingress component locally as `opensandbox-ingress:local`.
- If public route auth is deferred, route URLs are public while the sandbox is alive. This should be revisited before multi-tenant production.

## Completion Notes
Delivered in k0s:
- OpenSandbox Helm release upgraded to `[ingress] mode = "gateway"` with `gateway.address = "harakiri.io"` and header routing.
- `ingress-nginx` installed and wildcard Ingress `*.harakiri.io -> opensandbox-ingress-gateway` applied.
- k0s-local wildcard TLS secret creation and HTTPS ingress smoke added.
- cert-manager v1.20.2 installed in k0s, with a repeatable `pnpm env:harakiri:route-tls-letsencrypt` path for a Let's Encrypt wildcard origin certificate using Cloudflare DNS-01.
- Harakiri API route model now supports `GET/POST/DELETE /v1/sandboxes/:id/routes` with provider metadata and lifecycle cleanup.
- Harakiri route creation enforces per-sandbox and per-org route limits.
- CLI supports `harakiri expose` and `harakiri routes`.
- SDK supports `exposePort`, `listRoutes`, and `getHost`.
- Dashboard Network tab exposes ports and shows copy/open actions.

Verification run:
- `pnpm build`
- `pnpm test`
- `pnpm typecheck`
- `pnpm deploy:k0s`
- `pnpm ports:restart && pnpm ports:status`
- `pnpm smoke:route`
- `pnpm route:tls-dev`
- `pnpm smoke:route-ingress`
- `pnpm env:harakiri:route-preflight`
- `pnpm env:harakiri:route-public`
- `pnpm cert-manager:install`
- route-limit smoke for `SANDBOX_MAX_ROUTES_PER_SANDBOX=8`
- `pnpm e2e`
- CLI expose/routes smoke
- API idempotency and route-terminated lifecycle smoke
- Dashboard Network tab Playwright smoke with screenshot `/tmp/harakiri-network-tab.png`
- HTTP, SSE, and WebSocket protocol smoke through OpenSandbox gateway

Final public route evidence:
- `pnpm env:harakiri:route-preflight` returned Cloudflare TLS headers for `preflight-3000.harakiri.io` and reached k0s/OpenSandbox.
- `pnpm env:harakiri:route-public` created a sandbox, started `python -m http.server 3000`, exposed port 3000, and fetched HTML from `https://0e3a7657-b7a2-426c-9806-ba477796ae30-3000.harakiri.io`.

Optional follow-up:
- Provide a Cloudflare DNS API token if `pnpm env:harakiri:route-tls-letsencrypt` should issue the k0s origin wildcard cert through Let's Encrypt DNS-01 instead of using the local dev origin certificate with tunnel `noTLSVerify`.
