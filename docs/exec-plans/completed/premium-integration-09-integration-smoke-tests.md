# Execution Plan: Premium Integration 09 Integration Smoke Tests

**Created**: 2026-06-03
**Author**: Codex
**Status**: Completed
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
- [x] A conformance smoke suite creates a sandbox, waits for readiness, writes
      files, runs commands, starts a detached server, exposes a route, fetches
      the route, applies egress, downloads artifacts, renews TTL, and cleans up.
- [x] The suite runs against local dev, k0s deployment, and public API URL via
      environment variables.
- [x] SDK and CLI smoke paths use the published package interfaces, not internal
      monorepo shortcuts.
- [x] Tests verify no direct Kubernetes access is needed for public runtime
      behavior.
- [x] Smoke output is concise and records enough diagnostics for failures.
- [x] CI or maintainer runbooks document when and how to run live smokes.

## Phases

### Phase 1: Smoke Contract
**Status**: Complete
- [x] Define the minimal generic workflow and required environment variables.
- [x] Define which checks are safe for public CI and which require maintainer
      credentials or k0s access.
- [x] Define cleanup requirements for sandboxes, routes, API keys, commands,
      templates, and test artifacts.
- [x] Decide whether the conformance runner lives in `tests/e2e`, `examples`,
      or `infra/scripts`.

### Phase 2: SDK Smoke
**Status**: Complete
- [x] Create a TypeScript SDK smoke using only `@h-sandbox/sdk` imports.
- [x] Cover create/wait/run/files/commands/routes/egress/artifacts/renew/kill.
- [x] Defer optional Git source checkout checks to the dedicated Git support
      conformance work.
- [x] Defer optional template-specific OpenCode checks to the dedicated
      template/agent conformance work so this suite stays generic.

### Phase 3: CLI Smoke
**Status**: Complete
- [x] Create a CLI smoke using the installed `harakiri` binary.
- [x] Cover login/API-key configuration, create, run, files, expose/routes,
      egress, renew, and kill.
- [x] Verify CLI output is parseable enough for automation.
- [x] Add cleanup-on-error behavior.

### Phase 4: Deployment And CI Integration
**Status**: Complete
- [x] Add local dev and k0s runbook commands.
- [x] Add public deployment smoke instructions for `sb-api.harakiri.io`.
- [x] Document maintainer-only CI wiring requirements; no GitHub secrets were
      available in this workspace.
- [x] Record latest smoke evidence in `docs/test-report.md`.

### Phase 5: Documentation And Maintenance
**Status**: Complete
- [x] Document expected pass/fail output and common troubleshooting.
- [x] Ensure test fixtures are small and deterministic.
- [x] Add version checks so npm package changes are validated before publish.
- [x] Run typecheck/build/test and `git diff --check`.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-06-03 | Build generic conformance smoke tests instead of downstream-project-specific tests | Harakiri should prove its own public contract and stay broadly useful for OSS integrators. | Modify one downstream project; rely on manual browser testing; test only API unit behavior. |
| 2026-06-04 | Install packed tarballs in temporary consumer contexts for conformance | The suite must prove the package interface a user receives, not monorepo source paths. | Import SDK from `packages/sdk/dist`; run CLI through `node packages/cli/dist/index.js`. |
| 2026-06-04 | Add `HARAKIRI_CONFORMANCE_ROUTE_BASE_URL` for local port-forwarded route-proxy fetches | k0s local forwards may expose the API on a different origin than configured public route URLs. The override keeps public API runs unchanged while making local maintainer runs deterministic. | Disable route fetch locally; use direct Kubernetes gateway access in conformance. |
| 2026-06-04 | Proxy OpenSandbox gateway token routes through the internal gateway with `OpenSandbox-Ingress-To` | OpenSandbox gateway header mode is the deployed standard. Node fetch cannot reliably spoof `Host`, and the internal service should be addressed via the gateway route header. | Fetch external `*.sandbox.localhost` targets from the API pod; use direct Kubernetes exec or service lookups. |
| 2026-06-04 | Keep `harakiri expose --json` stdout pure JSON and move route progress to stderr | Automation must be able to parse CLI JSON without stripping human progress lines. | Teach conformance to strip progress lines; move all CLI progress to stderr globally. |

## Tech Debt Incurred
None planned.

## Completion Notes
Implemented package-facing SDK and CLI conformance smokes under
`tests/conformance/`, documented the runbook in `docs/integrations/conformance.md`,
and added root `pnpm conformance`, `pnpm conformance:sdk`, and
`pnpm conformance:cli` scripts. Live k0s conformance passed with route fetch
enabled after fixing the API token route proxy for OpenSandbox gateway header
mode and correcting CLI route JSON output. Evidence is recorded in
`docs/test-report.md`.
