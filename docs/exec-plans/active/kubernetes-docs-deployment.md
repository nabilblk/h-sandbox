# Plan: Kubernetes Documentation Deployment

**Created**: 2026-09-10
**Status**: In Progress
**Scope**: Commit the new installation documentation and deploy only its web image.

## Goal

Publish the visible Kubernetes guide using protected-branch CI and the existing
web-image workflow. Preserve the installed chart, current credentials, public
OIDC configuration and every non-web workload. No npm/chart release, database
migration, customer deployment or Brain access is needed.

## Steps

- [x] Inspect the working tree, publication workflow and current cluster/release.
- [ ] Commit scoped documentation/tests and merge after required CI passes.
- [ ] Publish an immutable multi-platform web image from the reviewed commit.
- [ ] Validate nginx serving, preview the existing chart and allow only a web
  image change; upgrade with rollback on failure.
- [ ] Verify unchanged configuration/credentials/non-web workloads, public
  endpoints, desktop/mobile documentation, exports and public OIDC redirect.
- [ ] Record the delivery receipt, archive this plan and commit the receipt.

## Notes

- Starting release: `harakiri/harakiri`, revision 35, chart `0.5.0-rc.8`.
- Explicit kubeconfig: `infra/k0s/harakiri.kubeconfig`; no bootstrap wrapper.
- Public native node is Ready. Existing Colima Docker is available for nginx QA.
- Deployment snapshots belong in ignored owner-only artifacts. Never print
  current Secrets, raw Helm values or the private login handoff.
- Keep unrelated `docs/cot/` untracked. Do not read or edit any Brain file.
- The installation article pins historical reference artifacts; publishing its
  docs does not certify a fresh installation, amd64 runtime or production profile.

## Outcome

Pending publication and live acceptance.
