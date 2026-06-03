# Execution Plan: Premium Integration 05 Lifecycle Semantics

**Created**: 2026-06-03
**Author**: Codex
**Status**: Not Started
**Priority**: {P0-P3}
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
- [ ] Public docs define Harakiri lifecycle states, transitions, timeouts,
      cleanup behavior, and reconnect semantics.
- [ ] API/SDK/CLI expose lifecycle capability states so callers can detect
      renew, kill, reconnect, pause, resume, and snapshot support.
- [ ] SDK runtime class offers clear lifecycle methods and typed unsupported
      errors for unavailable capabilities.
- [ ] Dashboard lifecycle controls do not show unsupported actions as if they
      were available.
- [ ] Lifecycle events are recorded consistently for create, running, idle,
      renewed, killed, expired, error, and route cleanup.
- [ ] Smoke tests verify renew, reconnect/get, kill, route cleanup, and expired
      sandbox behavior.

## Phases

### Phase 1: Lifecycle Contract
**Status**: Not Started
- [ ] Audit current sandbox statuses, DB fields, route cleanup, CLI commands,
      SDK methods, and dashboard labels.
- [ ] Write a formal lifecycle state diagram in docs.
- [ ] Define which states are provider-owned and which are Harakiri
      control-plane states.
- [ ] Define unsupported capability behavior for pause/resume/snapshot.

### Phase 2: API And SDK Alignment
**Status**: Not Started
- [ ] Add lifecycle capability metadata to runtime capabilities if missing.
- [ ] Ensure renew/kill/get/list responses include timestamps and state reasons.
- [ ] Add SDK instance lifecycle helpers and typed unsupported errors.
- [ ] Add CLI inspect output for lifecycle fields and capability states.

### Phase 3: Dashboard UX
**Status**: Not Started
- [ ] Review sandbox list/detail lifecycle labels and actions.
- [ ] Hide or disable unsupported lifecycle controls with clear copy.
- [ ] Show TTL and renewal state without making terminated history feel like
      active capacity.
- [ ] Ensure cleanup actions are available where appropriate.

### Phase 4: Verification
**Status**: Not Started
- [ ] Add API/SDK tests for lifecycle transitions and unsupported capabilities.
- [ ] Add a k0s smoke for create, renew, reconnect/get, route cleanup, kill, and
      post-kill behavior.
- [ ] Update docs and run typecheck/build/OpenAPI checks plus `git diff --check`.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-06-03 | Treat TTL/renew/kill as the v1 lifecycle unless provider-supported pause/resume/snapshot is proven | A clear limited contract is better than implying persistence features that may not exist. | Implement fake pause/resume in Harakiri; hide lifecycle semantics in docs; use direct Kubernetes operations. |

## Tech Debt Incurred
None planned.

## Completion Notes
Fill in when complete.
