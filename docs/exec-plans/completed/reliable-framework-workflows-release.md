# Execution Plan: Reliable Framework Workflows Release

**Created**: 2026-09-26
**Author**: Codex
**Status**: Completed
**Priority**: User-authorized release and local k0s deployment
**Estimated effort**: Multi-phase publication, verification and deployment

## Context

PR #59 merged as `eef6cb11a18bcdb800f8abd7a990836d238a0879`. Its SDK and
Deep Agents reliability changes passed all 23 PR checks and two isolated native
amd64 runs, each with all 16 gates and confirmed cleanup. At the start of this
plan, source implementation was complete but npm packages and the deployed website
did not contain it. The user authorized publication and deployment to the lab.

## Scope And Boundaries

- Prepare SDK/CLI `0.5.0-rc.12` and adapter `0.1.0-rc.2`; update the adapter's
  exact SDK peer. Verify version absence before immutable publication.
- Use protected GitHub workflows and package-specific npm Trusted Publishing.
  Publish the SDK before testing/publishing the adapter against the registry SDK.
- Keep prereleases on `next`. Preserve stable SDK/CLI `latest: 0.4.0` and the
  previously accepted adapter `latest: 0.1.0-rc.0` limitation.
- Publish coordinated image/chart artifacts and GitHub prereleases with verified
  identities. No overwrites or automatic retries of successful writes.
- Deploy the changed web/documentation component to the existing k0s lab with
  immutable image identity, preserved operator values and rollback preparation.
  API behavior/schema and chart templates have not changed since deployed rc.10;
  avoid restarting unrelated backend, identity, storage or runtime workloads.
- Always select `infra/k0s/harakiri.kubeconfig`, namespace/release `harakiri` and
  node UID `942b7e9d-e271-42a5-9fb1-0c6fbb045a61`. The default context is customer
  OpenShift and must not be used. Do not run the legacy bootstrap/deploy scripts.
- Preserve public OIDC/API/web origins, secrets and live sandbox workloads.
  No Brain, customer installation or private `docs/cot/` work.
- Registry health does not prove physical storage headroom. Keep unavailable
  storage evidence explicit; do not prune, resize or weaken publication guards.

## Success Criteria

- [x] Versioned release source, public guides and changelog agree on the new pair.
- [x] Focused local tests, PR CI and versioned native qualification pass.
- [x] SDK/CLI publish through OIDC; anonymous consumers and integrity pass.
- [x] Adapter qualifies against the actual published SDK, publishes through OIDC
  and passes anonymous Node 20/22/24 consumers without a workspace substitute.
- [x] Coordinated Harbor images/chart and GitHub prerelease assets are verified.
- [x] Web is deployed by immutable digest to the identified k0s installation.
- [x] Public browser/docs/login-origin checks pass, with non-web configuration
  and workloads preserved and rollback evidence recorded privately.
- [x] Delivery receipt records actual versions, artifacts, runs and limits;
  completed plan is archived only after publication and deployment are verified.

## Phases

### Phase 1: Preflight And Release Source
**Status**: Complete
- [x] Confirm merged implementation, registry versions and local target identity.
- [x] Check public endpoints, current Helm revision and preserved public origins.
- [x] Prepare version metadata, exact adapter peer, documentation and release notes.
- [x] Run local tests, open release PR, review CI/native evidence and merge.

### Phase 2: npm Publication
**Status**: Complete
- [x] Verify Trusted Publishing for the reviewed source without package writes.
- [x] Publish and anonymously verify SDK/CLI first.
- [x] Qualify adapter against registry SDK, publish, then verify actual consumers.
- [x] Record tarball identity, provenance and unchanged stable tags.

### Phase 3: Distribution Artifacts
**Status**: Complete
- [x] Verify image/chart version absence and run coordinated Harbor publication.
- [x] Verify anonymous pulls, architecture manifests, chart and source revisions.
- [x] Create GitHub prereleases with truthful release notes and checksummed assets.

### Phase 4: Local k0s Deployment
**Status**: Complete
- [x] Capture private rollback values/manifests and target/configuration fingerprints.
- [x] Review a structured Helm dry run that changes only the intended web image.
- [x] Upgrade with preserved values and automatic rollback; verify rollout.
- [x] Browser-test public documentation, downloads and OIDC redirect origins.
- [x] Verify non-web configuration and workloads remain unchanged.

### Phase 5: Delivery Evidence
**Status**: Complete
- [x] Record actual publication/deployment evidence and remaining limitations.
- [x] Archive this completed plan with the delivery-documentation follow-up.

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
| --- | --- | --- | --- |
| 2026-09-26 | Use the next preview versions, preserving all `latest` tags | These are additive preview changes, not a stable-release decision | Promoting preview packages to stable |
| 2026-09-26 | Publish SDK first and adapter second | The adapter now needs new public request-option exports absent from registry rc.11 | Testing only workspace tarballs |
| 2026-09-26 | Target explicit k0s identity and preserve existing Helm values | Default context is OpenShift; earlier public auth regressions came from replacing installation config | Applying development defaults |
| 2026-09-26 | Publish coordinated artifacts but limit lab rollout to the changed web component | Backend source and chart templates are unchanged; client integration does not require a backend restart | Unnecessary full-platform rollout |
| 2026-09-26 | Rerun only failed anonymous adapter verification after registry metadata propagation | Publication already succeeded; the package version is immutable | Republishing or changing the version to work around a read-only timeout |

## Tech Debt Incurred

None introduced. Existing adapter default-tag and physical Harbor headroom
limitations remain explicit; neither is silently changed by this release.

## Completion Notes

SDK/CLI `0.5.0-rc.12` and adapter `0.1.0-rc.2` are published on npm `next`.
Both GitHub prereleases and the coordinated multi-architecture Harbor images/chart
are public and verified. Lab web is deployed at Helm revision 46 with the new
digest; API/chart remain rc.10 intentionally. The
[delivery receipt](../../release-notes/0.5.0-rc.12-delivery.md) records actual
artifact identities, qualification, deployment and remaining limitations.

Local release-source checks: SDK 104/104, web/docs 105/105, adapter installed npm
consumer 43/43 (PostgreSQL suite runs separately in CI), adapter/web typechecks,
documentation links and three release-guard tests passed. Frozen dependency
resolution is unchanged. Versioned native qualification passed before publication.

PR #60 final documentation checks also passed all ten local browser scenarios
at 1440/390/320 px; its temporary development server stopped cleanly. Publication
trust-only runs `36251367872` (SDK/CLI) and `36251410528` (adapter) passed against
reviewed main without publishing or changing tags. Lab revision 45, its rc.10
chart archive and private rollback values/manifests/resources were captured.
No cluster mutation had been performed at that preflight checkpoint.

PR #60 merged as `9c01915b3577dfc71761fba6889b167e74fac77c` after all 23 checks
passed. Its tree `cf73b70db1016fe1786d0a298917abbab13d81d8` exactly matches final
native candidate `d1907e47736fdc64e306ccd3062189245cffe7f3`. Native runs
`36251136103` and `36251529001` each passed 16 gates and cleanup, with identical
SDK and adapter archives. Both immutable release tags point to this merge.
SDK/CLI publication `36253516608`, adapter publication `36253694319` and Harbor
publication `36253517997` passed. Adapter attempt 2 repeats only read-only consumer
checks after npm metadata lag; it does not repeat publication. Actual SDK/adapter
archives match both native qualification runs exactly. All 14 GitHub release
assets passed anonymous download/checksum verification.

The structured Helm comparison permitted only the web image/tag change. All 44
checked non-web resources and all non-web running pod identities were preserved.
Public docs passed ten live browser scenarios across 1440/390/320 px. Config.js
is unchanged, public endpoints return 200, and a fresh Sign in action preserves
the public auth and web origins. A brief 502 during the switchover recovered
without intervention; zero downtime is not claimed. Private rollback material
is retained outside Git, and temporary browser/server sessions are closed.
