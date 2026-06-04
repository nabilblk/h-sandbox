# Execution Plan: Premium Integration 08 Official Integration Docs

**Created**: 2026-06-03
**Author**: Codex
**Status**: Completed
**Priority**: {P0-P3}
**Estimated effort**: 4-7 engineering days

## Context
Harakiri has stronger runtime capabilities than its documentation currently
communicates. External OSS adopters need clear installation, API, SDK, CLI,
template, routes, egress, Git, filesystem, lifecycle, and integration guides.
The docs should make Harakiri feel like a polished sandbox platform rather than
a project that requires reading source code to understand the contract.

This plan covers both repository markdown docs and product docs in the website.

## Success Criteria
- [x] Website docs and repository docs explain the public Harakiri runtime
      contract for external applications.
- [x] Docs include quickstart, create/run/files/routes/egress/templates/Git/
      lifecycle/commands/artifacts/error-handling examples.
- [x] Docs clearly separate OSS generic setup from maintainer-specific k0s,
      Cloudflare, and `harakiri.io` deployment details.
- [x] SDK and CLI READMEs are aligned with the website docs and published npm
      package behavior.
- [x] Product docs avoid external-platform positioning and present Harakiri as
      its own OSS sandbox control plane.
- [x] Docs examples are typechecked or smoke-tested where practical.

## Phases

### Phase 1: Information Architecture
**Status**: Complete
- [x] Audit current `docs/`, `packages/sdk/README.md`,
      `packages/cli/README.md`, website docs, and examples.
- [x] Define a docs map for getting started, concepts, SDK, CLI, templates,
      Git, routes, egress, files/artifacts, lifecycle, commands, errors, and
      deployment.
- [x] Identify maintainer-only docs that should move to runbooks or local
      deployment notes.
- [x] Define code sample style and required env vars.

### Phase 2: Repository Docs
**Status**: Complete
- [x] Update README and package READMEs for installation and quickstart.
- [x] Add or improve `docs/sdk.md`, `docs/cli.md`, `docs/integrations/*`,
      `docs/templates.md`, and capabilities/limits docs.
- [x] Add Git and source bootstrap docs once the Git plan starts.
- [x] Add troubleshooting matrices for auth, API keys, provider unavailable,
      command errors, route errors, egress blocks, and file transfer limits.

### Phase 3: Website Product Docs
**Status**: Complete
- [x] Add website docs pages that mirror the repository contract.
- [x] Keep docs pages visually consistent with Harakiri design tokens.
- [x] Include compact examples and avoid marketing-heavy app screens.
- [x] Add docs navigation entries and changelog notes.
- [x] Ensure external docs do not expose internal secrets, local-only ports, or
      maintainer-specific Cloudflare instructions as generic setup.

### Phase 4: Verification
**Status**: Complete
- [x] Typecheck checked TypeScript examples.
- [x] Run website build.
- [x] Run SDK/CLI tests if examples import packages.
- [x] Run link/content checks where available.
- [x] Run `git diff --check`.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-06-03 | Treat docs as a product surface for OSS adoption | Community reception depends on whether developers can understand and trust the runtime contract quickly. | Keep docs as internal notes; rely on examples only; defer docs until all features are complete. |
| 2026-06-04 | Add dedicated CLI and error-handling docs instead of burying them inside SDK/API pages | CLI users and external integrators need fast entry points for configuration, command groups, retry policy, and stable error codes. | Keep CLI content only in package README; leave error handling as scattered tables. |
| 2026-06-04 | Keep maintainer/public environment examples separate from generic docs | OSS adopters should not treat one maintainer's DNS, tunnel, or k0s instance as required architecture. | Document harakiri.io and Cloudflare paths as the default setup. |

## Tech Debt Incurred
None incurred.

## Completion Notes
Completed the public documentation hardening pass. Added `docs/cli.md`,
`docs/errors.md`, and `docs/filesystem-artifacts.md`, linked them from the docs
index and README, aligned SDK/CLI package READMEs, updated API and integration
docs, added website docs pages for CLI reference, filesystem/artifacts, and
errors/troubleshooting, and updated the website changelog.

Verification completed with docs/changelog tests, web production build,
examples check, focused web typecheck, `git diff --check`, k0s deployment,
port-forward restart, and browser verification of the deployed CLI and
errors/troubleshooting docs pages.
