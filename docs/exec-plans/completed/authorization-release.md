# Execution Plan: Authorization Release and Public Deployment

**Created**: 2026-09-08
**Author**: Codex
**Status**: Complete
**Priority**: P1
**Estimated effort**: 2-3 hours including remote builds

## Context

Deliver the locally verified [authorization consolidation](authorization-consolidation.md)
as a matched API/web/chart/SDK/CLI candidate. The user explicitly requested commit,
deployment, release and public documentation. The public k0s lab is at Helm revision
26; stable channels remain 0.4.0. Do not modify BackgroundAgent, OpenShift, runtime
template aliases, SMTP, public origins or unrelated user files.

## Success Criteria

- [x] Source and accurate release/upgrade documentation committed and pushed.
- [x] Fresh Keycloak access token contains the API audience before API rollout.
- [x] Database backup catalog validated; migration 037 applied; matched services ready.
- [x] Immutable Harbor images/chart and matching npm packages published as rc.4.
- [x] Real public authorization, SDK/CLI runtime and browser checks pass.
- [x] Temporary test resources cleaned; delivery evidence recorded; plan archived with delivery documentation.

## Phases

### Phase 1: Prepare
**Status**: Complete
- [x] Inspect source, release workflows, current deployment and authentication.
- [x] Capture configuration and legacy-key inventory privately; add Keycloak mapper.
- [x] Bump candidate versions, update public docs/changelog and release notes.
- [x] Run release checks, commit and push; verify source CI.

### Phase 2: Publish and Deploy
**Status**: Complete
- [x] Tag immutable source and publish multi-architecture Harbor images and chart.
- [x] Publish checksum-verified SDK/CLI archives to npm `next`; keep `latest` unchanged.
- [x] Verify registry artifacts; back up PostgreSQL before migration 037.
- [x] Compare Helm render, preserve other configuration, migrate and deploy matched services.

### Phase 3: Accept and Record
**Status**: Complete
- [x] Verify public OIDC, role/scoped-key denials, revocation and real runtime SDK/CLI use.
- [x] Verify public docs and dashboard in a browser, including mobile layout.
- [x] Clean only dedicated test resources; record versions, digests, checks and limitations.
- [x] Include delivery receipt, plan index and archive in the final documentation commit.

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
| --- | --- | --- | --- |
| 2026-09-08 | Release 0.5.0-rc.4 on `next`, not stable | OpenShift/storage and recovery gates remain open independently of authorization | Premature stable 0.5.0 |
| 2026-09-08 | Mapper first, then additive migration and matched deployment | Avoid rejecting valid human sessions; never weaken validation to recover login | Blind generic bootstrap/redeployment |
| 2026-09-08 | Retain existing integration keys unless their caller is explicitly migrated | Keys lose implicit administration, but live runtime integrations must not be arbitrarily revoked | Broad key/user cleanup |
| 2026-09-08 | Recover Harbor with GC of unreferenced storage only | API and eight template uploads hit filesystem ENOSPC; dry run identified reclaimable data. `delete_untagged=false`, `delete_tag=false`; no artifact/tag deletion policy or recurring schedule added | Delete historical release artifacts or silently switch registries |
| 2026-09-08 | Publish a web-only correction without rewriting rc.4 | Live populated key lists exposed mobile overflow from an undefined `sr-only` class. Accessible labels and two regression tests fix it; a single-component CI path avoids republishing unchanged API/chart/npm artifacts | Overwrite the release image or ignore the live finding |
| 2026-09-08 | Attach a digest-pinned upgrade overlay and preserve the original tag | Operators can reproduce the final API/web combination and validation settings without replacing their environment values | Claim the original chart defaults contain the later web correction |

## Tech Debt Incurred

Existing unattended npm trusted-publisher setup and full template architecture
acceptance remain tracked by the delivery-readiness plan. Harbor storage monitoring
and headroom are now an explicit operational follow-up in that plan.

## Completion Notes

Completed September 8, 2026. See the [delivery receipt](../../release-notes/0.5.0-rc.4-delivery.md)
and [upgrade notes](../../release-notes/0.5.0-rc.4.md) for exact artifacts,
limitations and verification. This does not close unrelated stable-release gates.

Preflight at 16:18 UTC: fresh human access token has public issuer and
`harakiri-api` audience, accepted by the old API. Other client settings and SMTP
unchanged. Eight active legacy keys and four retained workspaces inventoried.
Release build, root tests/types, seven authorization browser tests, package
consumer smoke, OpenAPI/docs/Vault checks and seven install-config tests passed.

Source `398b9ed4cce7d397fa9c88525ff6be06677acfe0` and tag `v0.5.0-rc.4`
pushed. Core CI run 34250346256 and product-demo checks 34250346278 passed.
SDK/CLI rc.4 published using local npm authentication, without claiming CI
provenance. Both registry archives match their local SHA-256 and npm SHA-512;
fresh registry consumer checks passed. `next=0.5.0-rc.4`, `latest=0.4.0`.

Harbor attempt 1 built API successfully but blob-upload initiation returned
HTTP 500, filesystem mkdir error 28. Eight template architecture uploads also
failed; their candidate manifests were not promoted. Harbor's health endpoint
still reported healthy and the project quota was unlimited. Dry-run GC 1288
estimated 9618 MB; GC 1289 recovered 9573 MB without deleting untagged artifacts
or tags. An empty upload returned 202 and was cancelled. Retried only the
failed control-plane image/chart jobs from the same immutable source; run
34250835902 attempt 2 succeeded. The independent template upload failures and
storage headroom follow-up remain in the delivery-readiness plan.

PostgreSQL custom-format backup catalog validated; migration 037 applied once.
Revision 27 deployed rc.4 after a structured render comparison. Actual public
SDK/CLI checks exercised a native OpenSandbox runtime, key ownership/scopes,
denials, expiry, single-use tickets, terminal/SSE revocation and detached command
survival. Revocation closed the terminal in 2887 ms. The first rollout captured
one web 502 and one API 502, both recovered by the existing port-forward supervisor.

Web fix `0c4d47c` and its regression tests passed core CI and product-demo checks;
web-only Harbor run 34253596381 passed. A second structured comparison permitted
only its web image update, producing final revision 28. Real public admin/member
PKCE login, key creation/revocation and role-aware settings passed without mocks.
Nine authorization browser regressions and six public documentation tests passed;
desktop/mobile screenshots were reviewed. All four application deployments are
ready; public web, API health and realm discovery return 200.

All 12 test keys revoked and rejected, the test sandbox terminated, and the test
member removed. All 144 original key records (eight active) and four retained
workspaces are unchanged; historical audit is retained. Temporary secret-bearing
test state was removed; backups/evidence remain private and ignored by Git.

GitHub prerelease published at 17:06 UTC with five digest-verified assets:
SDK/CLI/chart archives, the exact upgrade overlay and SHA256SUMS. The overlay
matches the live Helm values. The immutable tag remains at `398b9ed`; npm stable
channels, existing template aliases, SMTP and public authentication origins are
unchanged.
