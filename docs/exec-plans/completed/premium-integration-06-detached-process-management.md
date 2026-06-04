# Execution Plan: Premium Integration 06 Detached Process Management

**Created**: 2026-06-03
**Author**: Codex
**Status**: Completed
**Priority**: P1
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
- [x] Detached commands have stable statuses, timestamps, exit code, signal or
      kill reason, log cursors, and truncation metadata.
- [x] SDK and CLI can start, list, inspect, wait, tail logs, and kill detached
      commands.
- [x] Dashboard terminal/logs views distinguish interactive sessions, blocking
      commands, detached commands, and runtime logs.
- [x] Commands survive API client restarts and can be reattached by command ID.
- [x] Failure modes are typed: provider unavailable, command not found, timeout,
      killed, exited, log cursor invalid, and unsupported detached mode.
- [x] Tests cover detached command lifecycle in API, SDK, CLI, and live k0s
      smoke.

## Phases

### Phase 1: Contract Audit
**Status**: Completed
- [x] Audit current command schema, command DB persistence, OpenSandbox
      transport behavior, SDK helpers, CLI commands, and dashboard logs.
- [x] Define status transitions for queued, starting, running, exited, failed,
      killed, timed_out, and unknown.
- [x] Define log cursor and tail semantics.
- [x] Define behavior for commands started before API restarts or client
      reconnects.

### Phase 2: API And Provider Hardening
**Status**: Completed
- [x] Ensure command records persist all required metadata.
- [x] Tighten provider polling and status normalization.
- [x] Add provider capability checks for detached commands and log streaming.
- [x] Add safe cleanup for commands when sandbox is killed or expired.
- [x] Add structured logs and audit events for command lifecycle operations.

### Phase 3: SDK, CLI, And UI
**Status**: Completed
- [x] Add SDK runtime-class process helpers and improve existing command wait
      and logs helpers if needed.
- [x] Add or refine CLI commands for command list/get/logs/wait/kill.
- [x] Improve dashboard command/log presentation with clear source labels and
      compact controls.
- [x] Keep interactive terminal behavior separate from detached process APIs.

### Phase 4: Tests And Docs
**Status**: Completed
- [x] Add API unit/integration tests for detached lifecycle and errors.
- [x] Add SDK and CLI tests for wait/log/kill behavior.
- [x] Add a live smoke using a long-running server command plus route exposure.
- [x] Update SDK, CLI, API, website, and integration docs.
- [x] Run typecheck/build/OpenAPI checks and `git diff --check`.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-06-03 | Harden detached process management as a public runtime contract | Agent integrations depend on reliable background processes and reattachment by ID. | Keep detached mode as a thin command flag; use dashboard terminal sessions as process management; use Kubernetes pod exec. |

## Tech Debt Incurred
None planned.

## Completion Notes
- Added `finishReason` and `signal` to command summaries. These are derived
  from persisted status, exit code, and provider error output without requiring
  a database migration.
- Added runtime capability rows for `detachedCommands`, `commandLogTail`, and
  `commandKill` so integrations can discover process-management support.
- Added SDK `processes.*` aliases that default to detached execution, plus
  `HarakiriCommandEndedError` for commands that fail or are killed before the
  requested wait status.
- Added CLI process ergonomics: `harakiri process` alias, `command wait`,
  `command tail`, and JSON output for run/list/status/logs/kill.
- Updated dashboard terminal side panel copy from generic API commands to
  detached commands with process/foreground and finish metadata labels.
- Added `docs/processes.md`, website docs, SDK README, CLI README, API docs,
  integration capability docs, and regenerated `docs/openapi.json`.
- Added `infra/scripts/process-smoke.sh` and `pnpm smoke:process`.
- Verification on 2026-06-04:
  - `pnpm --filter @harakiri/api test -- sandbox-runtime-service.test.ts routes-runtime.test.ts`
  - `pnpm --filter @h-sandbox/sdk test`
  - `pnpm --filter @h-sandbox/cli test -- command.test.ts`
  - `pnpm --filter @harakiri/web test -- docs-content.test.ts`
  - `pnpm --filter @harakiri/shared test`
  - `pnpm openapi:write && pnpm openapi:check`
  - `pnpm typecheck && pnpm --filter @harakiri/web build && git diff --check`
  - `pnpm deploy:k0s && pnpm ports:restart`
  - `HARAKIRI_API_URL=http://127.0.0.1:18082 pnpm smoke:process`
  - Browser check of deployed `/#docs` with `sandbox-processes` selected.
