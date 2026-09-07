# Plan: Documentation Redesign Deployment

**Created**: 2026-09-07
**Status**: Completed
**Scope**: Commit and deploy the completed documentation redesign to the public k0s lab.

## Goal

Publish a traceable web-only image and deploy it using the existing rc.3 Helm
chart and values. Preserve runtime resources, public OIDC URLs and all non-web
configuration. No npm release, API migration or provider update is required.

## Steps

- [x] Inspect source changes, current deployment, chart and public environment conventions.
- [x] Recheck documentation tests, commit the scoped changes and push source (`db1a7c7`).
- [x] Build and publish an immutable, revision-labelled web image to Harbor (`7a36225`, amd64/arm64).
- [x] Compare rendered manifests, then upgrade only the web image with rollback on failure.
- [x] Verify ready deployments, public endpoints, public sign-in redirect and documentation interactions on desktop/mobile.
- [x] Record delivery evidence and archive this plan in the deployment receipt commit.

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

Completed September 8, 2026 (Africa/Casablanca). Helm revision 26 serves the
digest-pinned amd64/arm64 image from source `7a36225`. Six public Playwright
tests passed across all 33 pages and three viewport widths. Public web, API
health and OIDC discovery returned 200; sign-in retains the public auth host,
PKCE S256 and public callback. Core source CI passed.

Only the web image changed. Configuration, secrets, non-web deployment specs
and other Helm values were compared and preserved. One transient 502 during
the supervised web-forward handoff recovered automatically before acceptance.
The unrelated research document remains untracked and untouched.

See the [delivery receipt](../../release-notes/2026-09-08-documentation-redesign-delivery.md)
for image digests, verification evidence, scope and rollback commands.
