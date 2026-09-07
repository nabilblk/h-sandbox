# Documentation Redesign: Public Deployment Receipt

September 8, 2026 (Africa/Casablanca). Web-only update, not a new product release.

## Source and Artifact

- Documentation redesign: `db1a7c705ac2d4c2ffe67a049ee21e9aae1937ab`.
- Deployed source, including the native static-assets build fix:
  `7a36225baae60306903432a0d8142ccd27043575`. Both commits were pushed to `main`.
- Image: `core.campus.clusterdiali.me/harakiri/harakiri-web:0.5.0-rc.3-docs.7a36225`.
- Multi-architecture index:
  `sha256:b5285c796ca2ad0ba1290bd784aafa57fee20eceeb7a978317bd31ff72a981c7`.
- linux/amd64 manifest:
  `sha256:1bb29db66c8a2745b3bf126ba86b25b69a7fb634df36f51efda9d9755f1af95e`.
- linux/arm64 manifest:
  `sha256:36c20f900cc37ce6296150b490cc73eb3ef26913cd75c0e1ace89e5d83d576bf`.

The image was built locally from `git archive` of the exact deployed commit and
pushed to Harbor. Registry inspection confirmed both platform manifests. The
revision label identifies that source. No CI provenance is claimed for this
locally built image; attestations remain disabled for Harbor compatibility.

The first build failed in Node's event loop under local AMD64 emulation. The
web Dockerfile now compiles architecture-independent browser assets on
`BUILDPLATFORM`, while retaining target-platform nginx images. Both final
architectures built successfully. The failed attempt did not change the live site.

## Deployment Boundary

Public k0s Helm release/namespace `harakiri/harakiri` advanced from revision
**25** to **26** using the existing `0.5.0-rc.3` chart. The chart archive SHA-256
was checked against the [rc.3 receipt](0.5.0-rc.3-delivery.md):
`1469c5add1242115be0a332bde43137f528d18679dd1fa98455cd41f3137c588`.

A server-side dry run and structured manifest comparison allowed exactly one
change: the image in `Deployment/harakiri/harakiri-web`. The upgrade reused all
existing values, pinned the image digest above, and enabled rollback on failure.
Post-upgrade checks confirmed:

- All application deployments ready; the new web pod had zero restarts.
- Every non-web deployment specification unchanged.
- Shared and web runtime ConfigMap contents unchanged.
- The application Secret hash unchanged.
- All Helm values except `image.web.tag` unchanged.

API, scheduler, builder, database, registry, Keycloak, SMTP, OpenSandbox and
existing sandbox/workspace resources were not redeployed or modified. There
was no migration, npm publication, chart publication or release-tag promotion.

One public web request returned 502 during the supervised forward's pod
handoff. The existing supervisor reconnected automatically; public acceptance
started only after recovery. This is not a zero-downtime deployment claim.

## Public Acceptance

- [Documentation](https://sb.harakiri.io/#docs/overview) and
  [vision and architecture](https://sb.harakiri.io/#docs/vision-architecture)
  serve the redesign. The browser loaded `index-CBtvV-qp.js`; the docs chunk is
  `docs-DW42m-FB.js` and stylesheet `index-CdWg1nsB.css`.
- All six Playwright documentation tests passed against `https://sb.harakiri.io`
  in 13.8 seconds. They cover all 33 pages at 1440, 390 and 320 pixels,
  navigation/search/history, deep links, keyboard tabs, copying exact snippet
  text, clipboard denial, and diagram/page overflow.
- Manual browser inspection confirmed desktop overview and mobile architecture
  rendering. No diagram overflow was found at 390 pixels.
- Sign-in opened `https://sb-auth.harakiri.io/realms/harakiri/protocol/openid-connect/auth`
  with client `harakiri-web`, response type `code`, PKCE `S256`, and callback
  `https://sb.harakiri.io/`. The sign-in form rendered. No account login, invite
  or SMTP test was performed by this documentation deployment.
- Web, [API health](https://sb-api.harakiri.io/health), and
  [OIDC discovery](https://sb-auth.harakiri.io/realms/harakiri/.well-known/openid-configuration)
  returned HTTP 200 after the upgrade.
- Before committing, all 60 web tests, web typecheck and documentation link
  validation passed. [Core source CI](https://github.com/nabilblk/h-sandbox/actions/runs/34168584649)
  also passed, including builds, conformance and package checks. The separate
  long-running product-demo media workflow is not this deployment's acceptance
  gate; recorded videos were not regenerated or changed.

Reproduce the public browser acceptance from the source checkout:

```sh
HARAKIRI_WEB_URL=https://sb.harakiri.io \
  pnpm exec playwright test tests/e2e/docs-experience.spec.ts
```

Private deployment snapshots, the guarded deployment script, image metadata
and public viewport captures are excluded from Git under
`docs/artifacts/docs-redesign-deploy-private/`. Diagram captures are under
`docs/artifacts/docs-redesign/`. No publishing or login credential was committed.

## Rollback

Revision 25 retains the previous web image. If rollback is required before any
later release changes, use the explicit public lab kubeconfig and namespace:

```sh
helm --kubeconfig infra/k0s/harakiri.kubeconfig -n harakiri \
  rollback harakiri 25 --wait=watcher --timeout=5m
```

Then recheck web health and the public OIDC callback. No database rollback is
needed for this web-only change. Do not run the generic bootstrap deployment
script to roll back documentation.
