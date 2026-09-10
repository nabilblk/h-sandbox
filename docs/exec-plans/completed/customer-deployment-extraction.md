# Execution Plan: Customer Deployment Extraction

**Created**: 2026-09-10
**Author**: Codex
**Status**: Completed
**Priority**: Owner-approved repository separation
**Estimated effort**: One extraction and verification session

## Context

The owner approved extracting the version-specific `OCP-install/` customer
stack into a private deployment repository. It composes Harakiri Sandbox,
BackgroundAgent and dependencies; it is not the standalone OSS installation
contract. Work is limited to this separation, its documentation and tests.
Do not access Brain, change running installations, upgrade pinned artifacts,
copy credentials/generated state or modify BackgroundAgent source.

## Success Criteria

- [x] A private `nabilblk/harakiri-deployments` repository contains only reviewed
  customer assets, their provenance, runbook and independent offline checks.
- [x] Installer implementation, manifests and pinned defaults are preserved;
  documentation/test references no longer need a sibling application checkout.
- [x] Customer installer tests move with the package; reusable product checks
  and registry tooling stay in OSS with focused regression coverage.
- [x] OSS installation, air-gap and artifact documentation no longer require
  the customer stack or a private repository to install Harakiri.
- [x] Old local installation state remains untouched and ignored. Secret scans,
  tests, documentation checks and a clean-clone check pass before handoff.

## Phases

### Phase 1: Inventory and Boundary
**Status**: Complete

- [x] Inspect tracked package files and references in CI, docs and tooling.
- [x] Confirm destination name is unused and the authenticated owner is nabilblk.
- [x] Identify generated state exclusions and the shared realm test dependency.

### Phase 2: Extract Customer Delivery
**Status**: Complete

- [x] Export only tracked assets from the recorded public source revision.
- [x] Preserve license/provenance, pin assumptions and original behavior.
- [x] Make the customer tests/runbook self-contained; add private CI and safe
  ignore rules. No automatic deploy or source rebuild workflow.
- [x] Verify, commit and publish the curated initial private repository.

### Phase 3: Decouple OSS
**Status**: Complete

- [x] Remove the tracked customer installer after its preserved copy is verified.
- [x] Retain generic mirroring and realm/security checks in their OSS modules.
- [x] Replace coupled public docs with standalone instructions and truthful
  profile boundaries; record a migration notice for existing operators.
- [x] Update the existing plan index and delivery scope without reverting
  previous planning changes or starting unrelated roadmap work.

### Phase 4: Verification and Handoff
**Status**: Complete

- [x] Compare preserved runtime files to the source snapshot.
- [x] Run independent customer checks from a clean checkout and verify private CI.
- [x] Run focused OSS checks, Helm rendering, link checks and secret scanning.
- [x] Verify privacy, source-only changes, ignored legacy state and residual links.
- [x] Record exact outcomes and move this plan to completed.

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
| --- | --- | --- | --- |
| 2026-09-10 | Private deployment repository consumes published application artifacts | Customer composition has independent ownership and versions | Keep it as an OSS example or move it into BackgroundAgent core |
| 2026-09-10 | Preserve current implementation and defaults; do not run the installer | Repository separation is not a customer upgrade or installation acceptance | Rewrite/generalize the installer during extraction |
| 2026-09-10 | Export tracked files only, retaining provenance rather than full public history | Avoid transferring ignored credentials, state or unrelated application history | Copy the working directory or clone the whole product into the private repo |

## Tech Debt Incurred

No new installer debt. Existing unverified customer installation and generic OpenShift
support remain unverified; extraction does not establish either support claim.

## Completion Notes

Private repository published at `ccff7eac6a57f8bc911adbdbfe2dbf290203911d`.
Its 11 offline tests and secret scan passed locally and in
[private CI run 34472934232](https://github.com/nabilblk/harakiri-deployments/actions/runs/34472934232).
All 12 preserved source/license files match their source SHA-256. No runtime
installation was attempted. The same 11 tests passed from a clean private clone
with no sibling application checkout. All 12 focused OSS tests passed; customer
CI is no longer required by the OSS pipeline.

Helm 4.2.0 lint passed for both charts and the existing OpenShift values. The
standalone guide rendered nine resources with four non-root deployments, no
SCC/RBAC grants, no rendered Secrets and exact public OIDC origins. YAML/link,
shell syntax and diff checks passed; Gitleaks 8.30.1 found no leaks in the
private package or scoped changed OSS source. Historical references remain
dated and are not current installer entry points.

Three original ignored local files retained identical path/inode/size/mtime
metadata. No Brain file, application implementation, chart template, runtime
resource, credential or BackgroundAgent checkout was changed. `oc` is absent
from PATH; no fresh OpenShift or product/browser acceptance was attempted.
See the [verification receipt](../../test-report.md#2026-09-10-customer-deployment-extraction).

The initial extraction published only the private repository. The owner
subsequently requested committing and pushing the OSS cleanup, including this
record. That source publication does not authorize a release or deployment.
