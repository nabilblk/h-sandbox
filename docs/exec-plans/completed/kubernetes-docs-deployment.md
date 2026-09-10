# Plan: Kubernetes Documentation Deployment

**Created**: 2026-09-10
**Status**: Completed
**Scope**: Commit the new installation documentation and deploy only its web image.

## Goal

Publish the visible Kubernetes guide using protected-branch CI and the existing
web-image workflow. Preserve the installed chart, current credentials, public
OIDC configuration and every non-web workload. No npm/chart release, database
migration, customer deployment or Brain access is needed.

## Steps

- [x] Inspect the working tree, publication workflow and current cluster/release.
- [x] Commit scoped documentation/tests and merge after required CI passes.
- [x] Publish an immutable multi-platform web image from the reviewed commit.
- [x] Validate nginx serving, preview the existing chart and allow only a web
  image change; upgrade with rollback on failure.
- [x] Verify unchanged configuration/credentials/non-web workloads, public
  endpoints, desktop/mobile documentation, exports and public OIDC redirect.
- [x] Record the delivery receipt, archive this plan and commit the receipt.

## Notes

- Starting release: `harakiri/harakiri`, revision 35, chart `0.5.0-rc.8`.
- Explicit kubeconfig: `infra/k0s/harakiri.kubeconfig`; no bootstrap wrapper.
- Public native node is Ready. Existing Colima Docker is available for nginx QA.
- Deployment snapshots belong in ignored owner-only artifacts. Never print
  current Secrets, raw Helm values or the private login handoff.
- Keep unrelated `docs/cot/` untracked. Do not read or edit any Brain file.
- The installation article pins historical reference artifacts; publishing its
  docs does not certify a fresh installation, amd64 runtime or production profile.
- Source merged through PR #30 after all eight required checks passed:
  `6eb81d1ef0e1e37d506698e008c64a39a28fa861`. Web-only publication passed in
  Actions run `34511683266`, tag `0.5.0-rc.8-k8s-docs.6eb81d1`. Both platforms
  are present in index `sha256:07e53ffc3c815428492dfe557a53083ac00517bae4ec022420867171387970ce`.
- Local published-image acceptance passed all seven documentation browser tests,
  exact exported Markdown/inventory/LLM files and demo-media integrity checks.
  Initial Docker temporary-directory creation failed on its full data volume;
  a read-only preview with tmpfs passed, without pruning other applications.
- Guarded upgrade completed at revision 36. Configuration, Secret hash, non-web
  deployment specifications and all other Helm values are unchanged. One public
  502 during pod handoff recovered automatically. Public acceptance passed all
  seven documentation browser tests, exact text exports, demo-media checks,
  desktop/mobile screenshot review and the public OIDC login-form contract.

## Outcome

The [Kubernetes guide](https://sb.harakiri.io/#docs/install-kubernetes) is live
at Helm revision 36. API, credentials, public origins and non-web workloads were
preserved. The [delivery receipt](../../release-notes/2026-09-10-kubernetes-docs-delivery.md)
records immutable artifacts, checks, the brief tunnel handoff and scoped rollback.
The temporary nginx container was removed. No broader runtime acceptance or
Docker disk cleanup is claimed; Colima headroom needs separate attention.
