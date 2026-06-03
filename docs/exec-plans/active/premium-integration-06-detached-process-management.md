# Execution Plan: Premium Integration 06 Detached Process Management

**Created**: 2026-06-03
**Author**: Codex
**Status**: Not Started
**Priority**: {P0-P3}
**Estimated effort**: 1-2 engineering weeks

## Context
Detached/background commands are essential for agent servers, dev servers,
watchers, and long-running jobs. Harakiri has tracked command resources with
detached mode, status, logs, wait helpers, and kill behavior. The next step is
to harden this into a premium process-management contract: predictable status
transitions, log tailing, exit detection, restart guidance, cleanup, and clear
failure modes.

This must remain based on OpenSandbox-supported runtime command/session
transport. Harakiri should not use Kubernetes pod exec as a hidden process
manager.

## Success Criteria
- [ ] Detached commands have stable statuses, timestamps, exit code, signal or
      kill reason, log cursors, and truncation metadata.
- [ ] SDK and CLI can start, list, inspect, wait, tail logs, and kill detached
      commands.
- [ ] Dashboard terminal/logs views distinguish interactive sessions, blocking
      commands, detached commands, and runtime logs.
- [ ] Commands survive API client restarts and can be reattached by command ID.
- [ ] Failure modes are typed: provider unavailable, command not found, timeout,
      killed, exited, log cursor invalid, and unsupported detached mode.
- [ ] Tests cover detached command lifecycle in API, SDK, CLI, and live k0s
      smoke.

## Phases

### Phase 1: Contract Audit
**Status**: Not Started
- [ ] Audit current command schema, command DB persistence, OpenSandbox
      transport behavior, SDK helpers, CLI commands, and dashboard logs.
- [ ] Define status transitions for queued, starting, running, exited, failed,
      killed, timed_out, and unknown.
- [ ] Define log cursor and tail semantics.
- [ ] Define behavior for commands started before API restarts or client
      reconnects.

### Phase 2: API And Provider Hardening
**Status**: Not Started
- [ ] Ensure command records persist all required metadata.
- [ ] Tighten provider polling and status normalization.
- [ ] Add provider capability checks for detached commands and log streaming.
- [ ] Add safe cleanup for commands when sandbox is killed or expired.
- [ ] Add structured logs and audit events for command lifecycle operations.

### Phase 3: SDK, CLI, And UI
**Status**: Not Started
- [ ] Add SDK runtime-class process helpers and improve existing command wait
      and logs helpers if needed.
- [ ] Add or refine CLI commands for command list/get/logs/wait/kill.
- [ ] Improve dashboard command/log presentation with clear source labels and
      compact controls.
- [ ] Keep interactive terminal behavior separate from detached process APIs.

### Phase 4: Tests And Docs
**Status**: Not Started
- [ ] Add API unit/integration tests for detached lifecycle and errors.
- [ ] Add SDK and CLI tests for wait/log/kill behavior.
- [ ] Add a live smoke using a long-running server command plus route exposure.
- [ ] Update SDK, CLI, API, website, and integration docs.
- [ ] Run typecheck/build/OpenAPI checks and `git diff --check`.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-06-03 | Harden detached process management as a public runtime contract | Agent integrations depend on reliable background processes and reattachment by ID. | Keep detached mode as a thin command flag; use dashboard terminal sessions as process management; use Kubernetes pod exec. |

## Tech Debt Incurred
None planned.

## Completion Notes
Fill in when complete.
