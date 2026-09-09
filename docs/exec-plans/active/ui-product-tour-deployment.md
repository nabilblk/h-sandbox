# Plan: UI Product Tour Deployment

**Created**: 2026-09-09
**Status**: In Progress
**Scope**: Commit the completed tour and deploy its web image to the public k0s lab.

## Goal

Publish the full-frame UI tour in Demos/docs using a revision-labelled,
digest-pinned web image. Preserve the current Helm chart, public OIDC origins,
application credentials and all non-web workload specifications. No npm release,
database migration or runtime restart is required.

## Steps

- [x] Inspect the source, public cluster, Helm revision and deployment conventions.
- [ ] Commit the scoped tour files, scan publishable source and pass protected-branch CI.
- [ ] Build/push an immutable multi-platform web image from the exact committed source.
- [ ] Dry-run the existing chart and permit only the web image change; upgrade
  with rollback on failure and compare configuration afterwards.
- [ ] Verify public endpoints, full-frame tour/media, docs, existing demos and
  public OIDC redirect in the browser.
- [ ] Record image/source/revision evidence, commit the delivery receipt and
  archive this plan.

## Notes

- Starting release: `harakiri/harakiri`, revision 33, chart `0.5.0-rc.8`.
- Starting web image: `core.campus.clusterdiali.me/harakiri/harakiri-web:0.5.0-rc.8-docs.2@sha256:23409e446df6bd7e28d02d5476ac7e3f41bf98f635f353c58bc0410846b119a1`.
- Use `infra/k0s/harakiri.kubeconfig` explicitly. Do not run the bootstrap script.
- Helm values and deployment snapshots stay in ignored private artifacts.
- Leave the unrelated `docs/cot/` research document untracked and untouched.
- The local Colima image builder was stopped; starting it does not restart the
  separate k0s VM or modify active sandbox runtimes.

## Outcome

Pending deployment and public acceptance.
