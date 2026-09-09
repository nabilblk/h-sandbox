# UI Product Tour: Public Deployment Receipt

September 9, 2026 (Africa/Casablanca). Web-only delivery, not a new npm or
product-version release.

## Source and Artifact

- Tour source: `5c386df2d6a0f657e5f12bd514bbb66001234d30`.
- [PR #25](https://github.com/nabilblk/h-sandbox/pull/25) merged as
  `e8a343658b304936462da5511fa1a53ace3c2769` after all eight required checks
  and the additional demo verification passed.
- Image: `core.campus.clusterdiali.me/harakiri/harakiri-web:0.5.0-rc.8-tour.5c386df.2`.
- Multi-platform index: `sha256:96a8e153e6e9b5a460855fe05f596b71c5175b229ca6bcb4b4a7eab83d1415c0`.
- linux/amd64: `sha256:97fa9f6634ddbc06032434272ab4e76ffcdc1a6a93c254af40d377fc72f65789`.
- linux/arm64: `sha256:eed11be8163d10c48e409cd7890a3dd56cd82cb83e0825df1ce65291f63211e0`.

Built locally from `git archive` of the exact source commit. The image revision
label contains that full commit ID; both platforms were inspected in Harbor.
This local build does not claim CI image provenance. Attestations were disabled
for the existing Harbor-compatible build path.

The first image was rejected by the pre-deployment nginx smoke test: extracting
the archive under a private umask had removed public-file read permissions.
Re-extracting with `tar -xpf` preserved Git's recorded modes. The accepted `.2`
image passed nginx and browser checks. The rejected tag was never deployed.
Private evidence directories remained owner-only; no credential files entered
the archive or image context.

## Deployment Boundary

Public k0s release `harakiri/harakiri` advanced from revision **33** to **34**.
The existing `0.5.0-rc.8` chart archive was reused and its SHA-256 verified:
`e91b7c6c2dce7d0f36a696a2233b430cb9e73cda1be801d75457a8d73549e5b3`.

The server-side Helm dry run permitted exactly one manifest change: the
digest-pinned image in `Deployment/harakiri/harakiri-web`. The upgrade used
rollback-on-failure and waited for readiness. Post-upgrade comparison confirmed:

- All four application deployments ready; new web pod had zero restarts.
- All non-web deployment specifications unchanged.
- Shared and browser runtime ConfigMap contents unchanged.
- Application Secret data hash unchanged.
- All Helm values except the web image tag unchanged.

API, scheduler, builder, database, Keycloak/SMTP, runtime provider, existing
sandboxes and workspaces were not redeployed or changed. No migration, npm
publication, chart publication or release-channel promotion occurred.

One public request observed a 502 during the supervised tunnel forward's pod
handoff. The retry succeeded automatically. This is not a zero-downtime claim.

## Public Acceptance

- [Full-frame UI tour](https://sb.harakiri.io/#demos/ui-product-tour): 334 seconds,
  17 chapters, complete 1920x1080 UI, optional captions and an external guide.
- [Written walkthrough](https://sb.harakiri.io/#docs/ui-product-tour),
  [Markdown guide](https://sb.harakiri.io/docs/ui-product-tour.md) and
  [no-JavaScript tutorial](https://sb.harakiri.io/demos/ui-product-tour/tutorial.html)
  are available. The original homepage and four historical agent films remain.
- The deployed entrypoint loads `index-O8kH7ukq.js`, stylesheet
  `index-ByHO0JpN.css` and docs chunk `docs-Cm_dMj3j.js`.
- All five tours' public media hashes matched local artifacts. MIME types,
  revalidation, byte-range seeking, source ZIPs and missing-media 404s passed.
- Dedicated tour browser tests passed at 1920x1080, 1440x1000, 390x844,
  320x568 and 844x390: decoded pixels, chapters/guide, captions, fullscreen,
  player width, readable controls, no horizontal overflow and failure/no-JS states.
- All five films passed the broader library checks at desktop, wide, mobile,
  narrow and reduced-motion viewports. This includes all desktop chapters,
  captions, filtering, history, deep links and tutorial navigation.
- All six public documentation browser tests passed, including all pages and
  diagrams at 1440, 390 and 320 pixels, search, snippet language/copy and keyboard
  navigation.
- Sign-in rendered the public Keycloak login form with client `harakiri-web`,
  response type `code`, PKCE `S256`, and callback `https://sb.harakiri.io/`.
  No account login, password change, invitation or SMTP test was performed.
- Public web, API `/health`, OIDC discovery and the new media returned HTTP 200.
  Existing open tabs need a normal reload to load the new application bundle.

Reproduce public acceptance:

```sh
pnpm --filter @harakiri/demo-video server:qa https://sb.harakiri.io
pnpm --filter @harakiri/demo-video browser:tour https://sb.harakiri.io
pnpm --filter @harakiri/demo-video browser:qa https://sb.harakiri.io
HARAKIRI_WEB_URL=https://sb.harakiri.io \
  pnpm exec playwright test tests/e2e/docs-experience.spec.ts
```

The [recording acceptance report](../ui-product-tour-verification.md) describes
the real runtime workflow and capture limits. Deployment snapshots and browser
evidence remain ignored under `docs/artifacts/ui-product-tour-deploy-private/`.
The unrelated local `docs/cot/` research document remains untracked and untouched.

The temporary nginx preview container was removed. Colima's existing Docker
services were left running; its saved 8-CPU/24-GiB resource preferences were
restored without restarting those services. The separate k0s VM was not restarted.

## Rollback

This section records the initial revision 34 delivery. For the subsequent
sidebar correction, use the revision 35 boundary documented below.

Revision 33 retains the previous web image and the current rotated credentials.
Use this only before a later deployment changes the release:

```sh
helm --kubeconfig infra/k0s/harakiri.kubeconfig -n harakiri \
  rollback harakiri 33 --wait=watcher --timeout=5m
```

Recheck the public web and OIDC redirect afterwards. No database rollback is
needed for this web-only delivery; do not invoke the bootstrap installer.

## Sidebar Default Correction

Later on September 9, the user identified a layout regression: initializing
wide mode to `true` had moved the vertical demo library beneath the player.
The original desktop sidebar is now the default again. Wide mode remains an
explicit toggle; the complete video frame, chapter guide, mobile layout and all
five published films are unchanged.

- Source: `cd545d14606542c4cb69093825564712a955a917`, merged through
  [PR #27](https://github.com/nabilblk/h-sandbox/pull/27) after all eight required
  checks and the additional demo verification passed.
- Image: `core.campus.clusterdiali.me/harakiri/harakiri-web:0.5.0-rc.8-sidebar.cd545d1`.
- Multi-platform index: `sha256:53fb396b69dac0cbde265a82069a5fcf98d7b849be957c9163c8c2fc273260d0`.
- Public Helm release advanced from revision **34** to **35**, reusing the same
  verified chart. Only the web image changed. Runtime configuration, the
  application Secret hash, other Helm values and non-web deployment specs were
  compared and confirmed unchanged.
- Production entrypoint: `index-BsSWNaNG.js`; existing CSS is unchanged.
- Verification: 71 web tests, 30 demo tests, both package typechecks,
  documentation links, source/history secret scan and five-viewport browser
  acceptance on both the local nginx image and the public site. Browser tests
  now assert the default vertical menu geometry and both wide-mode transitions.
  Public media hashes, MIME types, byte-range seeking and missing-media 404s pass.
- A transient 502 was observed during tunnel handoff; repeat media acceptance
  passed after recovery. Public web, API health and OIDC discovery returned 200.
- Build source was an exact Git archive with preserved file modes. The image
  carries the full source revision label, not a claim of CI image provenance.

Private deployment and browser receipts remain ignored under
`docs/artifacts/demos-sidebar-deploy-private/`. The
[completed correction plan](../exec-plans/completed/demos-sidebar-default.md)
records scope and acceptance. Existing browser tabs need a normal reload.

Rollback for this correction, only while revision 35 remains the latest release:

```sh
helm --kubeconfig infra/k0s/harakiri.kubeconfig -n harakiri \
  rollback harakiri 34 --wait=watcher --timeout=5m
```

This restores the previous wide-by-default web bundle without changing the
current credentials. Recheck public web and OIDC after any rollback.
