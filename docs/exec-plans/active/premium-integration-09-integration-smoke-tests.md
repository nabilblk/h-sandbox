# Execution Plan: Premium Integration 09 Integration Smoke Tests

**Created**: 2026-06-03
**Author**: Codex
**Status**: Not Started
**Priority**: {P0-P3}
**Estimated effort**: 1-2 engineering weeks

## Context
Harakiri has many runtime capabilities, but premium OSS credibility requires
repeatable tests that prove an external application can use those capabilities
without relying on private deployment knowledge. The smoke suite should verify
the public API, SDK, CLI, deployed k0s path, and published package shape.

The goal is not to test one downstream project. The goal is to create a generic
conformance suite that represents real sandbox integration workflows.

## Success Criteria
- [ ] A conformance smoke suite creates a sandbox, waits for readiness, writes
      files, runs commands, starts a detached server, exposes a route, fetches
      the route, applies egress, downloads artifacts, renews TTL, and cleans up.
- [ ] The suite runs against local dev, k0s deployment, and public API URL via
      environment variables.
- [ ] SDK and CLI smoke paths use the published package interfaces, not internal
      monorepo shortcuts.
- [ ] Tests verify no direct Kubernetes access is needed for public runtime
      behavior.
- [ ] Smoke output is concise and records enough diagnostics for failures.
- [ ] CI or maintainer runbooks document when and how to run live smokes.

## Phases

### Phase 1: Smoke Contract
**Status**: Not Started
- [ ] Define the minimal generic workflow and required environment variables.
- [ ] Define which checks are safe for public CI and which require maintainer
      credentials or k0s access.
- [ ] Define cleanup requirements for sandboxes, routes, API keys, commands,
      templates, and test artifacts.
- [ ] Decide whether the conformance runner lives in `tests/e2e`, `examples`,
      or `infra/scripts`.

### Phase 2: SDK Smoke
**Status**: Not Started
- [ ] Create a TypeScript SDK smoke using only `@h-sandbox/sdk` imports.
- [ ] Cover create/wait/run/files/commands/routes/egress/artifacts/renew/kill.
- [ ] Add optional Git source checkout checks once Git support exists.
- [ ] Add optional template-specific checks for OpenCode without making the
      suite require model-provider credentials.

### Phase 3: CLI Smoke
**Status**: Not Started
- [ ] Create a CLI smoke using the installed `harakiri` binary.
- [ ] Cover login/API-key configuration, create, run, files, expose/routes,
      egress, renew, and kill.
- [ ] Verify CLI output is parseable enough for automation.
- [ ] Add cleanup-on-error behavior.

### Phase 4: Deployment And CI Integration
**Status**: Not Started
- [ ] Add local dev and k0s runbook commands.
- [ ] Add public deployment smoke instructions for `sb-api.harakiri.io`.
- [ ] Add GitHub Actions or maintainer-only CI wiring if secrets are available.
- [ ] Record latest smoke evidence in `docs/test-report.md`.

### Phase 5: Documentation And Maintenance
**Status**: Not Started
- [ ] Document expected pass/fail output and common troubleshooting.
- [ ] Ensure test fixtures are small and deterministic.
- [ ] Add version checks so npm package changes are validated before publish.
- [ ] Run typecheck/build/test and `git diff --check`.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-06-03 | Build generic conformance smoke tests instead of downstream-project-specific tests | Harakiri should prove its own public contract and stay broadly useful for OSS integrators. | Modify one downstream project; rely on manual browser testing; test only API unit behavior. |

## Tech Debt Incurred
None planned.

## Completion Notes
Fill in when complete.
