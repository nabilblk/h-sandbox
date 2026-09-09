# Plan: UI Product Tour Deployment

**Created**: 2026-09-09
**Status**: Completed
**Scope**: Commit the completed tour and deploy its web image to the public k0s lab.

## Goal

Publish the full-frame UI tour in Demos/docs using a revision-labelled,
digest-pinned web image. Preserve the current Helm chart, public OIDC origins,
application credentials and all non-web workload specifications. No npm release,
database migration or runtime restart is required.

## Steps

- [x] Inspect the source, public cluster, Helm revision and deployment conventions.
- [x] Commit the scoped tour files, scan publishable source and pass protected-branch CI.
- [x] Build/push an immutable multi-platform web image from the exact committed source.
- [x] Dry-run the existing chart and permit only the web image change; upgrade
  with rollback on failure and compare configuration afterwards.
- [x] Verify public endpoints, full-frame tour/media, docs, existing demos and
  public OIDC redirect in the browser.
- [x] Record image/source/revision evidence, commit the delivery receipt and
  archive this plan.

## Notes

- Starting release: `harakiri/harakiri`, revision 33, chart `0.5.0-rc.8`.
- Starting web image: `core.campus.clusterdiali.me/harakiri/harakiri-web:0.5.0-rc.8-docs.2@sha256:23409e446df6bd7e28d02d5476ac7e3f41bf98f635f353c58bc0410846b119a1`.
- Use `infra/k0s/harakiri.kubeconfig` explicitly. Do not run the bootstrap script.
- Helm values and deployment snapshots stay in ignored private artifacts.
- Leave the unrelated `docs/cot/` research document untracked and untouched.
- The local Colima image builder was stopped; starting it does not restart the
  separate k0s VM or modify active sandbox runtimes.
- Source commit `5c386df2d6a0f657e5f12bd514bbb66001234d30` merged through PR #25
  after all eight required checks and the additional demo verification passed.
- First image was rejected before rollout: a private extraction umask removed
  public asset read permissions. Re-extracted the same Git archive with `tar -xpf`.
  The accepted `.2` image passed nginx serving and five-viewport browser tests.
  Public deployment never used the rejected image.

## Outcome

Completed: Helm revision 34 serves the digest-pinned `.2` image from source
`5c386df`. Only the web image changed; configurations, secrets and other
deployments were compared and preserved. Public media checks, five-viewport
tour and library checks, six documentation browser tests and public PKCE/OIDC
redirect verification passed. A transient forward-handoff 502 recovered before
acceptance. See the [delivery receipt](../../release-notes/2026-09-09-ui-product-tour-delivery.md)
for immutable digests, evidence, limitations and rollback commands.
