# Execution Plan: Premium Integration 08 Official Integration Docs

**Created**: 2026-06-03
**Author**: Codex
**Status**: Not Started
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
- [ ] Website docs and repository docs explain the public Harakiri runtime
      contract for external applications.
- [ ] Docs include quickstart, create/run/files/routes/egress/templates/Git/
      lifecycle/commands/artifacts/error-handling examples.
- [ ] Docs clearly separate OSS generic setup from maintainer-specific k0s,
      Cloudflare, and `harakiri.io` deployment details.
- [ ] SDK and CLI READMEs are aligned with the website docs and published npm
      package behavior.
- [ ] Product docs avoid external-platform positioning and present Harakiri as
      its own OSS sandbox control plane.
- [ ] Docs examples are typechecked or smoke-tested where practical.

## Phases

### Phase 1: Information Architecture
**Status**: Not Started
- [ ] Audit current `docs/`, `packages/sdk/README.md`,
      `packages/cli/README.md`, website docs, and examples.
- [ ] Define a docs map for getting started, concepts, SDK, CLI, templates,
      Git, routes, egress, files/artifacts, lifecycle, commands, errors, and
      deployment.
- [ ] Identify maintainer-only docs that should move to runbooks or local
      deployment notes.
- [ ] Define code sample style and required env vars.

### Phase 2: Repository Docs
**Status**: Not Started
- [ ] Update README and package READMEs for installation and quickstart.
- [ ] Add or improve `docs/sdk.md`, `docs/cli.md`, `docs/integrations/*`,
      `docs/templates.md`, and capabilities/limits docs.
- [ ] Add Git and source bootstrap docs once the Git plan starts.
- [ ] Add troubleshooting matrices for auth, API keys, provider unavailable,
      command errors, route errors, egress blocks, and file transfer limits.

### Phase 3: Website Product Docs
**Status**: Not Started
- [ ] Add website docs pages that mirror the repository contract.
- [ ] Keep docs pages visually consistent with Harakiri design tokens.
- [ ] Include compact examples and avoid marketing-heavy app screens.
- [ ] Add docs navigation entries and changelog notes.
- [ ] Ensure external docs do not expose internal secrets, local-only ports, or
      maintainer-specific Cloudflare instructions as generic setup.

### Phase 4: Verification
**Status**: Not Started
- [ ] Typecheck checked TypeScript examples.
- [ ] Run website build.
- [ ] Run SDK/CLI tests if examples import packages.
- [ ] Run link/content checks where available.
- [ ] Run `git diff --check`.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-06-03 | Treat docs as a product surface for OSS adoption | Community reception depends on whether developers can understand and trust the runtime contract quickly. | Keep docs as internal notes; rely on examples only; defer docs until all features are complete. |

## Tech Debt Incurred
None planned.

## Completion Notes
Fill in when complete.
