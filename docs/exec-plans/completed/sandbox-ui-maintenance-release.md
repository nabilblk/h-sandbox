# Execution Plan: Sandbox UI Maintenance Release

**Created**: 2026-09-30
**Author**: Codex
**Status**: Completed
**Estimated effort**: 1-2 hours, including CI and publication

## Context
The user requested commit, push, deployment and release of the sandbox sidebar
and log-layout fixes. Implementation is recorded in
[the completed UI plan](../completed/sandbox-detail-navigation-and-logs.md).
This is a web-only maintenance release on the existing rc.12 source line, not
a new SDK, CLI, adapter, API, schema or chart release.

## Success Criteria
- [x] Reviewed source and truthful public release notes are merged through protected main (PR #64, `97aee07`).
- [x] Required CI and credential-free UI regressions pass (all 19 PR checks).
- [x] A new immutable amd64/arm64 web image is published and its source/digests verified.
- [x] The identified k0s release changes only its web image, preserving operator values and public OIDC origins.
- [x] Public UI, changelog, docs, API health and OIDC are verified after deployment.
- [x] A GitHub maintenance prerelease and sanitized delivery receipt identify the exact artifact and rollback point.

## Phases

### Phase 1: Prepare and Qualify
**Status**: Complete
- [x] Confirm protected-main requirements and the single-image publication contract.
- [x] Identify the k0s node by UID and the installed release at revision 47.
- [x] Add public changelog and maintenance release notes.
- [x] Review/stage only release files and run local checks (60 browser tests, 105 web tests, typecheck, build, links and source/history secret scan).
- [x] Commit and push a dedicated PR.
- [x] Wait for required CI and merge without bypassing branch protection.

### Phase 2: Publish and Deploy
**Status**: Complete
- [x] Capture private rollback values, resource identities and public configuration at revision 47.
- [x] Publish web only from the merged SHA with a previously unused image tag.
- [x] Verify anonymous image manifests and source labels for both architectures.
- [x] Compare the Helm server dry run structurally; permit only the web image change.
- [x] Apply the guarded upgrade, monitor availability and verify preserved resources.

### Phase 3: Verify and Record
**Status**: Complete
- [x] Verify deployed browser assets and inspect sidebar/log behavior at desktop/mobile sizes.
- [x] Check public changelog, docs and login origins.
- [x] Publish the web maintenance GitHub prerelease without changing stable/latest or npm tags.
- [x] Record the sanitized delivery receipt and archive this plan in the documentation-only follow-up.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-09-30 | Publish a web-only maintenance prerelease, selected by merged SHA | The changes affect only dashboard presentation; no consumer library or server contract changed | Bump all six core packages and the adapter's exact SDK peer |
| 2026-09-30 | Reuse the installed rc.10 chart and all values; override only the digest-pinned web image | Prevent credential, schema, runtime and localhost-redirect regressions | Run a bootstrap installer or deploy every component |
| 2026-09-30 | Keep private evidence ignored and owner-only | Deployment baselines contain secrets; only sanitized receipts may be published | Commit raw Helm output |

## Tech Debt Incurred
No application-code debt added. The existing single-replica web handoff produced
one transient HTTP 502 in the availability sample; a future zero-downtime rollout
requires its own deployment-strategy acceptance rather than an unsupported claim.

## Completion Notes
PR #64 merged as `97aee07bb479b007767767f045e399959ef46562` after all 19
checks passed. Web-only publication passed in Harbor workflow `36791632189`.
Anonymous registry checks verified amd64/arm64 manifests, source labels and
index digest `sha256:d23b2fbae9d0aeddf840e740071827e8c9d027cbcdeffc3281b1fac013798aad`.
The pre-deployment browser check verified public Keycloak login with S256 PKCE
and read 151 existing sandbox records without runtime writes. Revision 48 is
deployed with only the web image changed. All 22 checked non-web resources and
10 running non-web pod identities are preserved; public configuration is
byte-identical. Live browser checks passed desktop/mobile switching, preserved
Logs-tab selection and seven real log rows (including long events) at 320, 390,
1024 and 1440 pixels, without browser errors or runtime writes. All 11 public-docs
browser scenarios passed. The two-minute availability sample contained 56 HTTP
200s and one HTTP 502, followed by recovery without intervention.

[Web maintenance prerelease](https://github.com/nabilblk/h-sandbox/releases/tag/web-2026-09-30.1)
was published from the exact merged source. Stable latest remains `v0.4.0`;
npm, backend and chart versions are unchanged. The
[delivery receipt](../../release-notes/2026-09-30-sandbox-ui-delivery.md) records
digests, qualification links, the web-only deployment boundary and scoped rollback
to revision 47. No customer installation or running sandbox was modified.
