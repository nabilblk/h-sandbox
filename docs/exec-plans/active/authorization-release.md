# Execution Plan: Authorization Release and Public Deployment

**Created**: 2026-09-08
**Author**: Codex
**Status**: In Progress
**Priority**: P1
**Estimated effort**: 2-3 hours including remote builds

## Context

Deliver the locally verified [authorization consolidation](../completed/authorization-consolidation.md)
as a matched API/web/chart/SDK/CLI candidate. The user explicitly requested commit,
deployment, release and public documentation. The public k0s lab is at Helm revision
26; stable channels remain 0.4.0. Do not modify BackgroundAgent, OpenShift, runtime
template aliases, SMTP, public origins or unrelated user files.

## Success Criteria

- [ ] Source and accurate release/upgrade documentation committed and pushed.
- [x] Fresh Keycloak access token contains the API audience before API rollout.
- [ ] Database backup catalog validated; migration 037 applied; matched services ready.
- [ ] Immutable Harbor images/chart and matching npm packages published as rc.4.
- [ ] Real public authorization, SDK/CLI runtime and browser checks pass.
- [ ] Temporary test resources cleaned; delivery evidence committed; plan archived.

## Phases

### Phase 1: Prepare
**Status**: In Progress
- [x] Inspect source, release workflows, current deployment and authentication.
- [x] Capture configuration and legacy-key inventory privately; add Keycloak mapper.
- [x] Bump candidate versions, update public docs/changelog and release notes.
- [ ] Run release checks, commit and push; verify source CI.

### Phase 2: Publish and Deploy
**Status**: Not Started
- [ ] Tag immutable source and publish multi-architecture Harbor images and chart.
- [ ] Publish checksum-verified SDK/CLI archives to npm `next`; keep `latest` unchanged.
- [ ] Verify registry artifacts; back up PostgreSQL before migration 037.
- [ ] Compare Helm render, preserve other configuration, migrate and deploy matched services.

### Phase 3: Accept and Record
**Status**: Not Started
- [ ] Verify public OIDC, role/scoped-key denials, revocation and real runtime SDK/CLI use.
- [ ] Verify public docs and dashboard in a browser, including mobile layout.
- [ ] Clean only dedicated test resources; record versions, digests, checks and limitations.
- [ ] Push delivery receipt, update plan index and archive this plan.

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
| --- | --- | --- | --- |
| 2026-09-08 | Release 0.5.0-rc.4 on `next`, not stable | OpenShift/storage and recovery gates remain open independently of authorization | Premature stable 0.5.0 |
| 2026-09-08 | Mapper first, then additive migration and matched deployment | Avoid rejecting valid human sessions; never weaken validation to recover login | Blind generic bootstrap/redeployment |
| 2026-09-08 | Retain existing integration keys unless their caller is explicitly migrated | Keys lose implicit administration, but live runtime integrations must not be arbitrarily revoked | Broad key/user cleanup |

## Tech Debt Incurred

Existing unattended npm trusted-publisher setup and full template architecture
acceptance remain tracked by the delivery-readiness plan. No new shortcut planned.

## Completion Notes

Pending publication and live acceptance. Local fixture tests are not live proof.

Preflight at 16:18 UTC: fresh human access token has public issuer and
`harakiri-api` audience, accepted by the old API. Other client settings and SMTP
unchanged. Eight active legacy keys and four retained workspaces inventoried.
Release build, root tests/types, seven authorization browser tests, package
consumer smoke, OpenAPI/docs/Vault checks and seven install-config tests passed.
