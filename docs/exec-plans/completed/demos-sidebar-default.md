# Lightweight Plan: Restore the Demo Sidebar Default

**Created**: 2026-09-09
**Status**: Completed
**Scope**: Demo layout default and regression coverage
**Estimated**: Under 2 hours

## Goal
Restore the vertical demo library beside the video on desktop. Keep wide view optional and preserve the complete, uncropped UI tour and mobile layout.

## Steps
- [x] Confirm the regression and restore the original side-by-side default.
- [x] Verify default geometry, wide-mode toggle, playback and responsive behavior in browser tests.
- [x] Commit through protected CI and deploy only the web image with unchanged public auth configuration.
- [x] Verify the public layout and archive this plan with delivery evidence.

## Notes
The UI tour update initialized `wide` to `true`; existing CSS already supports the original sidebar. No media, API, database, provider or authentication changes are needed.

Local verification passed: 71 web tests, 30 demo tests, both typechecks, documentation links, and browser acceptance at 1920x1080, 1440x1000, 390x844, 320x568 and 844x390. Browser assertions cover desktop menu geometry, the explicit wide-mode toggle, decoded video frames, captions, chapters, fullscreen and fallbacks.

## Outcome
Source `cd545d14606542c4cb69093825564712a955a917` merged through [PR #27](https://github.com/nabilblk/h-sandbox/pull/27) after all eight required checks and the additional demo verification passed. Public Helm revision 35 deploys the web-only correction; configuration, secrets and non-web deployment specifications were verified unchanged.

Public tour browser acceptance passed all five viewports, including the default vertical library geometry, optional wide view, uncropped decoded frames, captions, fullscreen, chapters, written guide and fallback states. Public media server checks passed after a transient tunnel handoff 502 recovered. Web, API health and OIDC discovery returned 200. The temporary nginx preview container was removed.

The [deployment receipt](../../release-notes/2026-09-09-ui-product-tour-delivery.md#sidebar-default-correction) records the image digest and rollback boundary. No further feature work, media recapture or package release is required for this correction.
