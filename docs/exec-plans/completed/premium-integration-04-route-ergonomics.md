# Execution Plan: Premium Integration 04 Route Ergonomics

**Created**: 2026-06-03
**Author**: Codex
**Status**: Completed
**Priority**: P1
**Estimated effort**: 4-7 engineering days

## Context
Harakiri already supports public and token-protected sandbox routes, route
helpers in the SDK, CLI route commands, and dashboard network views. The next
integration gap is ergonomics: external applications often need to start a
server, wait for readiness, expose a preview URL, fetch through access headers,
cache route details, and clean up without race conditions.

This plan improves the developer contract around routes without changing the
underlying OpenSandbox routing boundary.

## Success Criteria
- [x] SDK route helpers make the common "start server, expose port, wait, fetch,
      cleanup" workflow concise and reliable.
- [x] Route summaries expose enough metadata for adapter caches: port,
      protocol, URL, access mode, labels, token hint, created by, last used,
      readiness state, and provider route ID when appropriate.
- [x] `domain(port)`-style synchronous adapter use cases have a documented
      strategy through route pre-exposure/cache rather than hidden async work.
- [x] Dashboard network view presents routes, tokens, labels, readiness, and
      cleanup controls clearly.
- [x] CLI supports expose/list/open/delete and useful wait/health options.
- [x] Route docs cover public versus token access, token persistence, readiness,
      and cleanup.

## Phases

### Phase 1: Route Contract Review
**Status**: Completed
- [x] Audit route API responses, SDK helpers, CLI commands, and dashboard
      network panel.
- [x] Identify which route fields are missing for adapter caching and safe
      cleanup.
- [x] Define route readiness semantics and health-check result shape.
- [x] Define how route tokens are returned once, stored by callers, and hinted
      later without exposing secrets.

### Phase 2: SDK And CLI Improvements
**Status**: Completed
- [x] Add or refine `routes.exposeAndWait`, `routes.waitForHttp`,
      `routes.fetch`, `routes.headers`, and URL alias helpers.
- [x] Add route cache guidance to the runtime SDK class.
- [x] Add CLI wait/open options for route exposure where useful.
- [x] Ensure route helper errors are typed and actionable.

### Phase 3: API And Dashboard
**Status**: Completed
- [x] Add any missing route fields to OpenAPI and SDK protocol types.
- [x] Improve dashboard network controls with clear access-mode labels,
      health/readiness state, copy/open controls, and delete action.
- [x] Keep route token handling secure: no full token after creation unless a
      new rotate/regenerate feature is explicitly implemented.
- [x] Add route cleanup behavior on sandbox kill/expiry if gaps remain.

### Phase 4: Documentation And Tests
**Status**: Completed
- [x] Update SDK, CLI, API, route, and website docs.
- [x] Add SDK tests for helper behavior and route token headers.
- [x] Add API tests for idempotent expose/delete and readiness metadata.
- [x] Add a live smoke that starts a small server, exposes a route, fetches it,
      then deletes the route and kills the sandbox.
- [x] Run typecheck/build/OpenAPI checks and `git diff --check`.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-06-03 | Improve route ergonomics through public API/SDK/CLI helpers, not provider shortcuts | Route exposure is a core Harakiri control-plane value and should remain provider-neutral. | Require callers to use raw OpenSandbox URLs; make dashboard-only route controls; use direct ingress manipulation outside the API. |
| 2026-06-04 | Keep full token disclosure create-only and show `tokenHint` in lists | Token routes need operational visibility without turning the dashboard or `routes` command into a secret disclosure path. | Persist and show full route tokens; force all token use through manual header construction. |
| 2026-06-04 | Support CLI readiness waits and browser opening as route workflow helpers | Integrators need deterministic preview URLs and quick manual inspection from the CLI. | Keep `expose` as a fire-and-forget API wrapper; require custom scripts for readiness and opening. |

## Tech Debt Incurred
None planned.

## Completion Notes
Completed on 2026-06-04.

Implemented route ergonomics across the CLI, dashboard, and docs while keeping
the underlying route provider boundary unchanged. The SDK already had
`routes.exposeAndWait`, `routes.waitForHttp`, `routes.fetch`, and
`routes.headers`; this plan verified that surface and documented its intended
adapter usage.

Notable changes:
- CLI `expose` now supports protocol, access mode, labels, readiness waits,
  expected status checks, JSON output, and optional browser opening.
- CLI `routes` supports JSON output and exposes token hints, provider, labels,
  access mode, and readiness state.
- CLI `open` opens a route by sandbox id and port, with optional token query
  support for manual preview workflows.
- Dashboard Network inbound routes now expose public/token selection, labels,
  token-create handling, token hints, provider/readiness metadata, copy/open,
  and delete controls.
- Added `docs/routes.md` and website route documentation covering public versus
  token access, readiness, SDK/CLI usage, adapter cache guidance, and cleanup.

Verification:
- `pnpm --filter @h-sandbox/cli test -- command.test.ts`
- `pnpm --filter @harakiri/web test -- docs-content.test.ts sandbox-detail-route.test.ts`
- `pnpm --filter @harakiri/web test -- docs-content.test.ts docs-route.test.ts`
- `pnpm typecheck && pnpm --filter @harakiri/web build && git diff --check`
- `HARAKIRI_API_URL=http://127.0.0.1:18082 HARAKIRI_GATEWAY_URL=http://127.0.0.1:18085 pnpm smoke:route`
- `HARAKIRI_API_URL=http://127.0.0.1:18082 pnpm smoke:route-ingress`
- Deployed with `pnpm deploy:k0s`, restarted port forwards, and browser-tested
  the deployed docs and Network route table against a real sandbox.
