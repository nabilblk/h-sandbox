# Plan: Documentation Redesign Deployment

**Created**: 2026-09-07
**Status**: In Progress
**Scope**: Commit and deploy the completed documentation redesign to the public k0s lab.

## Goal

Publish a traceable web-only image and deploy it using the existing rc.3 Helm
chart and values. Preserve runtime resources, public OIDC URLs and all non-web
configuration. No npm release, API migration or provider update is required.

## Steps

- [x] Inspect source changes, current deployment, chart and public environment conventions.
- [x] Recheck documentation tests, commit the scoped changes and push source (`db1a7c7`).
- [ ] Build and publish an immutable, revision-labelled web image to Harbor.
- [ ] Compare rendered manifests, then upgrade only the web image with rollback on failure.
- [ ] Verify ready deployments, public endpoints, public sign-in redirect and documentation interactions on desktop/mobile.
- [ ] Record delivery evidence, archive this plan and commit the receipt.

## Notes

- Starting Helm release: `harakiri/harakiri`, revision 25, chart `0.5.0-rc.3`.
- Reuse the published chart archive with SHA-256
  `1469c5add1242115be0a332bde43137f528d18679dd1fa98455cd41f3137c588`.
- Keep credentials and captured Helm values in ignored private artifacts.
- Leave the unrelated local `docs/cot/` research document untouched.
- The first multi-platform build passed ARM64 but Node aborted inside AMD64
  emulation during dependency installation. Build browser assets on
  `BUILDPLATFORM`; nginx remains target-platform specific. No live change was
  applied from the failed build.

## Outcome

Pending deployment and public acceptance.
