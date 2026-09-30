# Sandbox UI Maintenance Delivery

September 30, 2026. Delivery record for
[sandbox switching and readable logs](2026-09-30-sandbox-ui.md).
This is a web-only update on the rc.12 source line.

## Reviewed Source

[PR #64](https://github.com/nabilblk/h-sandbox/pull/64) merged as
`97aee07bb479b007767767f045e399959ef46562`. Its tree matches the reviewed
branch commit `1fc06e18ef95e7143c97fe1c2bdfeef2df24dcd0` exactly.

All 19 PR checks passed before merge, including source/history secret scanning,
PostgreSQL tests, browser contracts, package consumers, container builds and the
release dry run. See
[PR CI](https://github.com/nabilblk/h-sandbox/actions/runs/36791023678) and
[product demo checks](https://github.com/nabilblk/h-sandbox/actions/runs/36791023674).
The [merged-source CI](https://github.com/nabilblk/h-sandbox/actions/runs/36791609502)
and [merged-source demo checks](https://github.com/nabilblk/h-sandbox/actions/runs/36791609523)
also passed.

The implementation passed 60 local browser contracts (13 new sidebar/log
regressions), 105 web tests, typecheck, production build and documentation links.
No new model, provider-isolation or customer OpenShift acceptance is claimed.

## Publication

The [web-only Harbor workflow](https://github.com/nabilblk/h-sandbox/actions/runs/36791632189)
passed using the merged source and the configured protected-environment approval.
No API image, npm package or chart was published.

Image tag:
`core.campus.clusterdiali.me/harakiri/harakiri-web:0.5.0-rc.12-sandbox-ui.97aee07`.

| Artifact | Immutable digest |
| --- | --- |
| Multi-platform index | `sha256:d23b2fbae9d0aeddf840e740071827e8c9d027cbcdeffc3281b1fac013798aad` |
| Linux amd64 manifest | `sha256:77da307648f6e18bf0d428c287cfe9f3d1aa00e56b2afb50aa7a0851bab4698c` |
| Linux arm64 manifest | `sha256:ab369959ad381f20049281524111b1c2b7233cf2e1b69fe6a1576553305bad79` |

Anonymous manifest/configuration downloads verified checksums, both platforms,
source revision `97aee07bb479b007767767f045e399959ef46562` and OCI version
`0.5.0-rc.12`. This is not independent signed-image provenance verification or a
claim that every platform's layers were downloaded.

## Deployment Boundary

The explicitly identified k0s release `harakiri/harakiri` advanced from revision
**47** to **48**. The server-side dry run compared all 20 rendered
resources and permitted exactly one changed field: the web container image.
It reused the installed rc.10 chart and all operator values, with no Helm hooks.
The chart archive SHA-256 is
`9fb11b234041ef55c518850fb60572d66921f4441dc524bbaa67cae6c94428a7`.

The upgrade enabled rollback on failure and pinned the image by index digest.
The running Ready web container reports the same digest. All 22 checked non-web
resource specifications/data and 10 running non-web pod identities in the
application, Keycloak and provider-system namespaces were unchanged. Only
`image.web.tag` changed in Helm values; public `config.js` is byte-identical to
the predeployment baseline. No API, scheduler, builder, database, Keycloak/SMTP
or provider workload was redeployed or reconfigured. The default customer
OpenShift context was never used.

## Live Verification

The pre-deployment browser check completed real public Keycloak login with S256
PKCE and read 151 existing sandbox records without runtime writes. It used a
private credential handoff outside Git; no credentials are included here.

- Authenticated post-deployment browser checks passed direct desktop switching,
  mobile switching and retained Logs-tab selection using two existing records.
- Seven real log rows included `TERMINAL.ATTACH.STARTED` and other long events.
  Text containment and page-width checks passed at 320, 390, 1024 and 1440 pixels.
  Desktop/mobile screenshots were inspected, with no browser JavaScript errors.
- Runtime writes were blocked throughout this browser check, including one
  automatic terminal-attachment request. No sandbox was created, started,
  stopped or otherwise modified by the acceptance check.
- All 11 documentation browser scenarios passed against the deployed website,
  including public pages, navigation, diagrams, code copy/downloads, Markdown
  exports and the Deep Agents side-by-side comparison.
- The public changelog displays "Sandbox switching and readable logs".
  Public configuration, API health and OIDC discovery returned HTTP 200.
  Login used public `sb-auth.harakiri.io`, code flow, S256 PKCE and the public
  web callback; no loopback requests were observed.
- A two-minute rollout sample recorded 56 HTTP 200 responses and one HTTP 502,
  followed by recovery without intervention. This was not a zero-downtime rollout.

Reproduce the non-destructive public documentation checks:

```sh
HARAKIRI_WEB_URL=https://sb.harakiri.io \
  pnpm exec playwright test tests/e2e/docs-experience.spec.ts
```

Private rollback values, manifests, screenshots and detailed before/after
evidence remain in an ignored owner-only directory. No credentials or private
snapshots are committed. User-owned `docs/cot/`, Brain and customer installation
files were untouched.

## Release and Rollback

The [web maintenance prerelease](https://github.com/nabilblk/h-sandbox/releases/tag/web-2026-09-30.1)
identifies the exact merged source and image. It is not a full-product version.
SDK/CLI `0.5.0-rc.12`, Deep Agents `0.1.0-rc.2`, npm channels and full-product
stable tags are unchanged. No API image or Helm chart was published.

Only while revision 48 remains current, revision 47 restores the preceding web
image with the same backend, schema, credentials and public configuration:

```sh
helm --kubeconfig infra/k0s/harakiri.kubeconfig -n harakiri \
  rollback harakiri 47 --wait=watcher --timeout=5m
```

Recheck the public UI, documentation and OIDC afterward. Do not use a bootstrap
installer or infer cross-schema rollback support from this image-only rollback.
