# Execution Plan: Reliable Framework Workflows Release

**Created**: 2026-09-26
**Author**: Codex
**Status**: In Progress
**Priority**: User-authorized release and local k0s deployment
**Estimated effort**: Multi-phase publication, verification and deployment

## Context

PR #59 merged as `eef6cb11a18bcdb800f8abd7a990836d238a0879`. Its SDK and
Deep Agents reliability changes passed all 23 PR checks and two isolated native
amd64 runs, each with all 16 gates and confirmed cleanup. Source implementation
is complete; current npm packages and the deployed website do not contain it.
The user now authorizes publication, release and deployment to the local lab.

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

- [ ] Versioned release source, public guides and changelog agree on the new pair.
- [ ] Focused local tests, PR CI and versioned native qualification pass.
- [ ] SDK/CLI publish through OIDC; anonymous consumers and integrity pass.
- [ ] Adapter qualifies against the actual published SDK, publishes through OIDC
  and passes anonymous Node 22/24 consumers without a workspace substitute.
- [ ] Coordinated Harbor images/chart and GitHub prerelease assets are verified.
- [ ] Web is deployed by immutable digest to the identified k0s installation.
- [ ] Public browser/docs/login-origin checks pass, with non-web configuration
  and workloads preserved and rollback evidence recorded privately.
- [ ] Delivery receipt records actual versions, artifacts, runs and limits;
  completed plan is archived only after publication and deployment are verified.

## Phases

### Phase 1: Preflight And Release Source
**Status**: In Progress
- [x] Confirm merged implementation, registry versions and local target identity.
- [x] Check public endpoints, current Helm revision and preserved public origins.
- [x] Prepare version metadata, exact adapter peer, documentation and release notes.
- [ ] Run local tests, open release PR, review CI/native evidence and merge.

### Phase 2: npm Publication
**Status**: Not Started
- [ ] Verify Trusted Publishing for the reviewed source without package writes.
- [ ] Publish and anonymously verify SDK/CLI first.
- [ ] Qualify adapter against registry SDK, publish, then verify actual consumers.
- [ ] Record tarball identity, provenance and unchanged stable tags.

### Phase 3: Distribution Artifacts
**Status**: Not Started
- [ ] Verify image/chart version absence and run coordinated Harbor publication.
- [ ] Verify anonymous pulls, architecture manifests, chart and source revisions.
- [ ] Create GitHub prereleases with truthful release notes and checksummed assets.

### Phase 4: Local k0s Deployment
**Status**: Not Started
- [ ] Capture private rollback values/manifests and target/configuration fingerprints.
- [ ] Review a structured Helm dry run that changes only the intended web image.
- [ ] Upgrade with preserved values and automatic rollback; verify rollout.
- [ ] Browser-test public documentation, downloads and OIDC redirect origins.
- [ ] Verify non-web configuration and workloads remain unchanged.

### Phase 5: Delivery Evidence
**Status**: Not Started
- [ ] Record actual publication/deployment evidence and remaining limitations.
- [ ] Commit/merge delivery documentation and archive the completed release plan.

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
| --- | --- | --- | --- |
| 2026-09-26 | Use the next preview versions, preserving all `latest` tags | These are additive preview changes, not a stable-release decision | Promoting preview packages to stable |
| 2026-09-26 | Publish SDK first and adapter second | The adapter now needs new public request-option exports absent from registry rc.11 | Testing only workspace tarballs |
| 2026-09-26 | Target explicit k0s identity and preserve existing Helm values | Default context is OpenShift; earlier public auth regressions came from replacing installation config | Applying development defaults |
| 2026-09-26 | Publish coordinated artifacts but limit lab rollout to the changed web component | Backend source and chart templates are unchanged; client integration does not require a backend restart | Unnecessary full-platform rollout |

## Tech Debt Incurred

None introduced. Existing adapter default-tag and physical Harbor headroom
limitations remain explicit; neither is silently changed by this release.

## Completion Notes

Publication and deployment are pending. The prior implementation receipt proves
the tested source behavior, not availability of these new package versions.

Local release-source checks: SDK 104/104, web/docs 105/105, adapter installed npm
consumer 43/43 (PostgreSQL suite runs separately in CI), adapter/web typechecks,
documentation links and three release-guard tests passed. Frozen dependency
resolution is unchanged. Versioned native qualification remains a release gate.
