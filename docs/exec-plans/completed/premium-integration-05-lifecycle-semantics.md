# Execution Plan: Premium Integration 05 Lifecycle Semantics

**Created**: 2026-06-03
**Author**: Codex
**Status**: Completed
**Priority**: P1
**Estimated effort**: 4-8 engineering days

## Context
Harakiri currently has a TTL/renew/kill lifecycle model. That is a valid MVP,
but external integrators need explicit semantics: what happens after create,
how long a sandbox lives, what "idle" and "terminated" mean, whether reconnect
is supported, whether pause/resume/snapshot exist, and how cleanup should be
handled.

The product should not imply lifecycle capabilities that do not exist. If
pause/resume/snapshot are not available through OpenSandbox or the current
provider, Harakiri should document and expose that limitation honestly while
making TTL renewal and cleanup excellent.

## Success Criteria
- [x] Public docs define Harakiri lifecycle states, transitions, timeouts,
      cleanup behavior, and reconnect semantics.
- [x] API/SDK/CLI expose lifecycle capability states so callers can detect
      renew, kill, reconnect, pause, resume, and snapshot support.
- [x] SDK runtime class offers clear lifecycle methods and typed unsupported
      errors for unavailable capabilities.
- [x] Dashboard lifecycle controls do not show unsupported actions as if they
      were available.
- [x] Lifecycle events are recorded consistently for create, running, idle,
      renewed, killed, expired, error, and route cleanup.
- [x] Smoke tests verify renew, reconnect/get, kill, route cleanup, and expired
      sandbox behavior.

## Phases

### Phase 1: Lifecycle Contract
**Status**: Completed
- [x] Audit current sandbox statuses, DB fields, route cleanup, CLI commands,
      SDK methods, and dashboard labels.
- [x] Write a formal lifecycle state diagram in docs.
- [x] Define which states are provider-owned and which are Harakiri
      control-plane states.
- [x] Define unsupported capability behavior for pause/resume/snapshot.

### Phase 2: API And SDK Alignment
**Status**: Completed
- [x] Add lifecycle capability metadata to runtime capabilities if missing.
- [x] Ensure renew/kill/get/list responses include timestamps and state reasons.
- [x] Add SDK instance lifecycle helpers and typed unsupported errors.
- [x] Add CLI inspect output for lifecycle fields and capability states.

### Phase 3: Dashboard UX
**Status**: Completed
- [x] Review sandbox list/detail lifecycle labels and actions.
- [x] Hide or disable unsupported lifecycle controls with clear copy.
- [x] Show TTL and renewal state without making terminated history feel like
      active capacity.
- [x] Ensure cleanup actions are available where appropriate.

### Phase 4: Verification
**Status**: Completed
- [x] Add API/SDK tests for lifecycle transitions and unsupported capabilities.
- [x] Add a k0s smoke for create, renew, reconnect/get, route cleanup, kill, and
      post-kill behavior.
- [x] Update docs and run typecheck/build/OpenAPI checks plus `git diff --check`.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-06-03 | Treat TTL/renew/kill as the v1 lifecycle unless provider-supported pause/resume/snapshot is proven | A clear limited contract is better than implying persistence features that may not exist. | Implement fake pause/resume in Harakiri; hide lifecycle semantics in docs; use direct Kubernetes operations. |
| 2026-06-04 | Expose granular lifecycle capabilities instead of overloading `lifecycle` | Integrators need to branch on renew, kill, reconnect, pause, resume, and snapshot independently. | Keep only a broad lifecycle capability and explain the rest in prose. |
| 2026-06-04 | Add SDK unsupported lifecycle methods that fail locally | `pause`, `resume`, and `snapshot` are useful vocabulary, but calling the API would imply provider support that does not exist. | Omit the methods entirely; add fake API endpoints; silently no-op unsupported methods. |

## Tech Debt Incurred
None planned.

## Completion Notes
Completed on 2026-06-04.

Implemented explicit lifecycle semantics without adding fake provider features.
The current v1 lifecycle is create, reconnect/get, renew, and kill. Pause,
resume, and snapshot are represented as unsupported capabilities.

Notable changes:
- Runtime capability responses now include `lifecycleRenew`, `lifecycleKill`,
  `lifecycleReconnect`, `lifecyclePause`, `lifecycleResume`, and
  `lifecycleSnapshot`.
- Unsupported lifecycle capabilities use contract `unsupported`, with clear
  reasons from `/v1/runtime/capabilities` and sandbox runtime metadata.
- SDK `HarakiriSandbox` now exposes `lifecycle`, `expiresAt`, `reconnect()`,
  `renew()`, `kill()`, and typed local failures for `pause()`, `resume()`, and
  `snapshot()`.
- Client `sandboxes` helpers now include `reconnect`, `pause`, `resume`, and
  `snapshot` for the same vocabulary.
- CLI `status` now supports `--json` and prints created time, TTL, expiration,
  provider sandbox ID, and lifecycle capability states.
- Dashboard sandbox detail header now shows TTL, expiration, created time, and a
  supported Renew control; unsupported lifecycle controls are not displayed.
- Added `docs/lifecycle.md`, website lifecycle docs, SDK/CLI README lifecycle
  notes, and `smoke:lifecycle`.

Verification:
- `pnpm --filter @harakiri/api test -- routes-runtime.test.ts`
- `pnpm --filter @h-sandbox/sdk test`
- `pnpm --filter @h-sandbox/cli test`
- `pnpm --filter @harakiri/web test -- docs-content.test.ts`
- `pnpm typecheck`
- `pnpm openapi:check && pnpm --filter @harakiri/web build && git diff --check`
- `pnpm deploy:k0s`
- `HARAKIRI_API_URL=http://127.0.0.1:18082 pnpm smoke:lifecycle`
- `HARAKIRI_API_URL=http://127.0.0.1:18082 pnpm smoke:renew`
- `HARAKIRI_API_URL=http://127.0.0.1:18082 pnpm smoke:ttl`
- Browser-tested deployed Lifecycle docs and sandbox detail lifecycle header.
