# Execution Plan: Standalone OpenShift Self-Service

**Created**: 2026-11-05
**Author**: Codex
**Status**: In Progress (local implementation complete; native qualification pending)
**Priority**: P1
**Estimated effort**: Multi-session implementation and native qualification

## Context

Deliver an understandable, reviewable installation path for the Harakiri sandbox
control plane on restricted OpenShift. Existing Helm charts and provider
boundaries remain authoritative. The legacy elevated lab helper is not the
installation contract. No optional application integration belongs in this work.

The current OpenShift values inherit development origins and builder permissions;
the chart-render CI check is not SCC admission or runtime evidence. Network
enforcement and credential injection require NET_ADMIN, the in-cluster builder
requests an unconfined seccomp profile, and rootfs snapshots depend on containerd
APIs rather than CRI-O. These are explicit exclusions, not permission workarounds.

## Success Criteria

- [x] A complete restricted control-plane/runtime configuration can be generated
      and reviewed without installing anything or rebuilding artifacts.
- [x] Public origins, Secret references, namespaces, image policy and Routes are
      validated; no localhost fallback, fixed UID, SCC modification or privileged
      builder is silently introduced.
- [x] Disabled deployment capabilities are truthful in discovery and rejected
      before lifecycle/resource mutation; ordinary deployments retain behavior.
- [x] Platform administrator prerequisites are distinct from namespace operations.
- [x] A first-class public OpenShift guide covers dependencies, installation,
      verification, disconnected registries, troubleshooting and recovery.
- [x] Local contracts, API tests, Helm tests, documentation checks and browser
      checks pass with recorded results.
- [ ] Real OpenShift qualification records the exact version, SCC, architecture,
      storage and runtime profile. It is never inferred from render or k0s tests.

## Phases

### Phase 1: Deployment Contract
**Status**: Complete (local)
- [x] Define minimal reviewed inputs and restricted defaults.
- [x] Implement provider-neutral deployment capability restrictions and tests.
- [x] Enforce restrictions for create, restore, pause, snapshots, egress and Vault.

### Phase 2: Helm And Operator Handoff
**Status**: Complete (local; CI wired, not dispatched)
- [x] Add declarative OpenShift Routes, private CA mounts and safe writable paths.
- [x] Produce a standalone restricted configuration with runtime pod template.
- [x] Separate runtime CRD/RBAC approval from namespace installation.
- [x] Add bounded preflight/verification and machine-readable qualification output.
- [x] Exercise generated configurations in CI without cluster mutation.

### Phase 3: Documentation And UX
**Status**: Complete (local source and browser verification; not deployed)
- [x] Add OpenShift to Self-hosting navigation and machine-readable docs.
- [x] Document exact dependency contracts and published/source version boundaries.
- [x] Explain excluded capabilities without implying weaker substitutes.
- [x] Cover install, first sandbox, diagnostics, upgrades, backups and uninstall.
- [x] Verify documentation at desktop and mobile widths.

### Phase 4: Qualification
**Status**: Local checks complete; native acceptance pending an approved target
- [x] Run focused regression checks and review the complete diff.
- [ ] Use only an explicitly approved isolated OpenShift target for native checks.
- [ ] Validate sign-in, commands, files, terminal, protected services, capability
      denial, isolation and owned-resource cleanup through Harakiri.
- [x] Record remaining gates accurately; keep this plan active until native
      acceptance and the operator handoff are complete.

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
| --- | --- | --- | --- |
| 2026-11-05 | Reuse Helm; configuration generation does not install resources | Operators must be able to inspect every resource and use GitOps | New installer/Operator |
| 2026-11-05 | No SCC changes or elevated runtime fallback | Preserve the restricted security contract | Custom SCC, Kubernetes exec fallback |
| 2026-11-05 | Keep optional integrations outside the package and documentation | This is a sandbox deployment deliverable | Coupled application stack |
| 2026-11-05 | Do not use the running lab for qualification | Preserve existing workloads and cluster-wide controllers | Existing k0s/CRC reuse |
| 2026-11-05 | User selected local implementation; OpenShift validation will follow | Native acceptance remains a separate, unclaimed gate | Reusing an unapproved cluster |
| 2026-11-06 | Preserve service-account token inheritance outside the restricted profile | Existing installations must not silently override their service-account policy | Explicitly enabling automount by default |

## Tech Debt Incurred

None accepted. Native qualification requires an approved OpenShift target; lack
of one must remain visible rather than becoming a passing support claim.

## Completion Notes

Local implementation and review completed on 2026-11-06. Delivered the pure
configuration generator, read-only preflight, owned-resource SDK smoke,
restricted Helm/Route/CA configuration, fail-closed deployment capability policy,
public documentation page and native qualification checklist. No dependency,
package version or upstream runtime chart was changed.

### Local Verification

| Check | Result |
| --- | --- |
| Standalone configuration, negative Helm overrides, preflight and smoke cleanup | 11 tests passed |
| Monitoring Helm regressions | 2 tests passed |
| API suite | 402 passed; 11 database/native tests intentionally skipped |
| Deployment-policy focused tests | 7 passed, including denial before dispatch and reservation release |
| Web suite | 124 passed |
| TypeScript SDK / CLI / shared contracts | 106 / 88 / 16 passed |
| Documentation browser suite | 13 passed; OpenShift page checked at 1440, 768, 390 and 320 pixels |
| API, web and SDK typechecks | Passed |
| Web production build | Passed; existing large-chunk warning remains |
| Helm lint | Control plane, legacy values compatibility and maintained runtime chart passed |
| Documentation links, OpenAPI consistency, Vault boundary, whitespace | Passed |

Browser verification used a loopback-only documentation preview with API/OIDC
origins pointed at an unused local port. Configuration tests render charts
offline; preflight tests inject a fake command runner. No cluster preflight,
database integration test or live runtime smoke was executed. CI was updated but
not dispatched.

### Remaining Gates

1. Qualify the exact API/web/runtime images on an explicitly approved isolated
   OpenShift cluster using `docs/openshift-qualification.md`. Record SCC admission,
   arbitrary UID, browser and runtime workflows, network denial and cleanup.
2. Resolve any native findings without relaxing SCC, silently enabling excluded
   features or widening the declared security boundary.
3. Obtain approval for commit/merge and coordinated artifact publication. The
   published `0.5.0-rc.14` API/chart do not include this profile's new policy guard.
   Update the documentation's source-candidate status only after release and
   qualification evidence exists.

No deployment, publication or cluster changes were performed. k0s, client
clusters, tunnels and unrelated working-tree content were left untouched. This
plan remains active; local passing tests are not a native support claim.

## Delivery Follow-Up: 2026-11-06

The user subsequently requested commit, push, deployment and release notes so
their client can test. This authorizes delivery to the existing k0s lab, not
mutation of an unknown client cluster or a claim of native OpenShift acceptance.

- [x] Prepare coordinated rc.15 manifests and feature notes; keep independent
      framework packages and runtime chart versions unchanged.
- [x] Update the operator guide to pinned chart archives and a tagged kit, with
      a release receipt and isolated-client-test boundary.
- [ ] Commit, push, pass required CI and merge through the protected branch.
- [ ] Publish and anonymously verify matching preview artifacts.
- [ ] Back up and upgrade only the lab's four application deployments with
      preserved public origins, Secrets, PVCs and provider configuration.
- [ ] Verify public documentation, changelog, API health and OIDC redirect;
      record exact artifact and rollout evidence in the delivery receipt.

Native OpenShift acceptance remains pending after delivery. This plan stays
active until the qualification checklist has observed results.
