# Execution Plan: Premium Integration 04 Route Ergonomics

**Created**: 2026-06-03
**Author**: Codex
**Status**: Not Started
**Priority**: {P0-P3}
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
- [ ] SDK route helpers make the common "start server, expose port, wait, fetch,
      cleanup" workflow concise and reliable.
- [ ] Route summaries expose enough metadata for adapter caches: port,
      protocol, URL, access mode, labels, token hint, created by, last used,
      readiness state, and provider route ID when appropriate.
- [ ] `domain(port)`-style synchronous adapter use cases have a documented
      strategy through route pre-exposure/cache rather than hidden async work.
- [ ] Dashboard network view presents routes, tokens, labels, readiness, and
      cleanup controls clearly.
- [ ] CLI supports expose/list/open/delete and useful wait/health options.
- [ ] Route docs cover public versus token access, token persistence, readiness,
      and cleanup.

## Phases

### Phase 1: Route Contract Review
**Status**: Not Started
- [ ] Audit route API responses, SDK helpers, CLI commands, and dashboard
      network panel.
- [ ] Identify which route fields are missing for adapter caching and safe
      cleanup.
- [ ] Define route readiness semantics and health-check result shape.
- [ ] Define how route tokens are returned once, stored by callers, and hinted
      later without exposing secrets.

### Phase 2: SDK And CLI Improvements
**Status**: Not Started
- [ ] Add or refine `routes.exposeAndWait`, `routes.waitForHttp`,
      `routes.fetch`, `routes.headers`, and URL alias helpers.
- [ ] Add route cache guidance to the runtime SDK class.
- [ ] Add CLI wait/open options for route exposure where useful.
- [ ] Ensure route helper errors are typed and actionable.

### Phase 3: API And Dashboard
**Status**: Not Started
- [ ] Add any missing route fields to OpenAPI and SDK protocol types.
- [ ] Improve dashboard network controls with clear access-mode labels,
      health/readiness state, copy/open controls, and delete action.
- [ ] Keep route token handling secure: no full token after creation unless a
      new rotate/regenerate feature is explicitly implemented.
- [ ] Add route cleanup behavior on sandbox kill/expiry if gaps remain.

### Phase 4: Documentation And Tests
**Status**: Not Started
- [ ] Update SDK, CLI, API, route, and website docs.
- [ ] Add SDK tests for helper behavior and route token headers.
- [ ] Add API tests for idempotent expose/delete and readiness metadata.
- [ ] Add a live smoke that starts a small server, exposes a route, fetches it,
      then deletes the route and kills the sandbox.
- [ ] Run typecheck/build/OpenAPI checks and `git diff --check`.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-06-03 | Improve route ergonomics through public API/SDK/CLI helpers, not provider shortcuts | Route exposure is a core Harakiri control-plane value and should remain provider-neutral. | Require callers to use raw OpenSandbox URLs; make dashboard-only route controls; use direct ingress manipulation outside the API. |

## Tech Debt Incurred
None planned.

## Completion Notes
Fill in when complete.
