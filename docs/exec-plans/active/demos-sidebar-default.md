# Lightweight Plan: Restore the Demo Sidebar Default

**Created**: 2026-09-09
**Scope**: Demo layout default and regression coverage
**Estimated**: Under 2 hours

## Goal
Restore the vertical demo library beside the video on desktop. Keep wide view optional and preserve the complete, uncropped UI tour and mobile layout.

## Steps
- [x] Confirm the regression and restore the original side-by-side default.
- [x] Verify default geometry, wide-mode toggle, playback and responsive behavior in browser tests.
- [ ] Commit through protected CI and deploy only the web image with unchanged public auth configuration.
- [ ] Verify the public layout and archive this plan with delivery evidence.

## Notes
The UI tour update initialized `wide` to `true`; existing CSS already supports the original sidebar. No media, API, database, provider or authentication changes are needed.

Local verification passed: 71 web tests, 30 demo tests, both typechecks, documentation links, and browser acceptance at 1920x1080, 1440x1000, 390x844, 320x568 and 844x390. Browser assertions cover desktop menu geometry, the explicit wide-mode toggle, decoded video frames, captions, chapters, fullscreen and fallbacks.

## Outcome
Pending verification and delivery.
