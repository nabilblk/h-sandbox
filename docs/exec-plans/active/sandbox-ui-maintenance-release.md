# Execution Plan: Sandbox UI Maintenance Release

**Created**: 2026-09-30
**Author**: Codex
**Status**: In Progress
**Estimated effort**: 1-2 hours, including CI and publication

## Context
The user requested commit, push, deployment and release of the sandbox sidebar
and log-layout fixes. Implementation is recorded in
[the completed UI plan](../completed/sandbox-detail-navigation-and-logs.md).
This is a web-only maintenance release on the existing rc.12 source line, not
a new SDK, CLI, adapter, API, schema or chart release.

## Success Criteria
- [ ] Reviewed source and truthful public release notes are merged through protected main.
- [ ] Required CI and credential-free UI regressions pass.
- [ ] A new immutable amd64/arm64 web image is published and its source/digests verified.
- [ ] The identified k0s release changes only its web image, preserving operator values and public OIDC origins.
- [ ] Public UI, changelog, docs, API health and OIDC are verified after deployment.
- [ ] A GitHub maintenance prerelease and sanitized delivery receipt identify the exact artifact and rollback point.

## Phases

### Phase 1: Prepare and Qualify
**Status**: In Progress
- [x] Confirm protected-main requirements and the single-image publication contract.
- [x] Identify the k0s node by UID and the installed release at revision 47.
- [x] Add public changelog and maintenance release notes.
- [x] Review/stage only release files and run local checks (60 browser tests, 105 web tests, typecheck, build, links and source/history secret scan).
- [ ] Commit and push a dedicated PR.
- [ ] Wait for required CI and merge without bypassing branch protection.

### Phase 2: Publish and Deploy
**Status**: Not Started
- [x] Capture private rollback values, resource identities and public configuration at revision 47.
- [ ] Publish web only from the merged SHA with a previously unused image tag.
- [ ] Verify anonymous image manifests and source labels for both architectures.
- [ ] Compare the Helm server dry run structurally; permit only the web image change.
- [ ] Apply the guarded upgrade, monitor availability and verify preserved resources.

### Phase 3: Verify and Record
**Status**: Not Started
- [ ] Verify deployed browser assets and inspect sidebar/log behavior at desktop/mobile sizes.
- [ ] Check public changelog, docs and login origins.
- [ ] Publish the web maintenance GitHub prerelease without changing stable/latest or npm tags.
- [ ] Commit the sanitized delivery receipt and archive this plan.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-09-30 | Publish a web-only maintenance prerelease, selected by merged SHA | The changes affect only dashboard presentation; no consumer library or server contract changed | Bump all six core packages and the adapter's exact SDK peer |
| 2026-09-30 | Reuse the installed rc.10 chart and all values; override only the digest-pinned web image | Prevent credential, schema, runtime and localhost-redirect regressions | Run a bootstrap installer or deploy every component |
| 2026-09-30 | Keep private evidence ignored and owner-only | Deployment baselines contain secrets; only sanitized receipts may be published | Commit raw Helm output |

## Tech Debt Incurred
None planned.

## Completion Notes
Pending CI, artifact publication, deployment and live verification.
