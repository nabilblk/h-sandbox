# Deep Agents First-Task Documentation Delivery

September 27, 2026. The simplified local-to-sandbox guide and corrected code
comparison are live. This is a web-only documentation delivery, not a new SDK,
adapter, API or Helm-chart release.

## Reviewed Source

[PR #62](https://github.com/nabilblk/h-sandbox/pull/62) merged as
`475199033a5a79faffcc7921f20dd09269504621`. Its tree matches the reviewed branch
commit `b7a8ce83dbc581cdad6dddd5861a1b3d75f2a602` exactly.

All required checks and 22 total checks passed before merge. The shared
PostgreSQL admission timing budget failed once, then passed on an unchanged
rerun of the failed job. No test threshold, API source or workflow gate was
changed. Both [PR CI](https://github.com/nabilblk/h-sandbox/actions/runs/36340877191)
and [merged-source CI](https://github.com/nabilblk/h-sandbox/actions/runs/36341526014)
passed. The automatically triggered
[native SDK run](https://github.com/nabilblk/h-sandbox/actions/runs/36340877241)
was still running at merge and subsequently passed all 16 gates and cleanup,
bringing the PR to 23 passing checks. Its candidate commit,
`b4a7b841aa2f15eb9fcebb0fc230874f170db713`, has the same tree as the deployed
merge: `79d8cb8b88ff25c2b449a8cbdf7933bfe39aeb74`.

That isolated amd64 run includes native framework tools, PostgreSQL recovery,
retained files, expiry and one small model-driven repair. It is regression
evidence, not a model-quality benchmark or distributed exactly-once guarantee.
No model or runtime acceptance workload ran on the maintainer's k0s installation.

## What Is Live

The [Deep Agents guide](https://sb.harakiri.io/#docs/deepagents) now begins with
two complete, small programs that visibly use `createDeepAgent`: the same model
and prompt locally and with Harakiri. Explicit model setup is shared; agent logic
is not hidden behind another factory. The guide progresses from setup to
attachment, approval, persistence and the larger independently verified repair.

Desktop comparisons share heading, description and code rows, with equal-height
panels. Narrow screens stack the examples naturally. Source keeps its indentation
and identifiers, with keyboard-accessible scrolling contained inside code blocks.

The displayed examples, copied code, [Markdown export](https://sb.harakiri.io/docs/deepagents.md)
and downloads are checked against the same runnable source:

- [first-local.ts](https://sb.harakiri.io/docs/examples/deepagents/first-local.ts)
- [first-sandbox.ts](https://sb.harakiri.io/docs/examples/deepagents/first-sandbox.ts)
- [first-model.ts](https://sb.harakiri.io/docs/examples/deepagents/first-model.ts)

Local shell execution is explicitly not isolation. Model and API credentials
remain in the application. The minimal programs print a model reply; they do
not claim that it independently verifies an artifact. Cleanup failures remain
visible, and the sandbox reply is printed only after confirmed cleanup.

## Published Image

The [web-only Harbor workflow](https://github.com/nabilblk/h-sandbox/actions/runs/36341547268)
passed using the protected environment approval. No API image, npm package or
chart was published.

Image tag:
`core.campus.clusterdiali.me/harakiri/harakiri-web:0.5.0-rc.12-deepagents-docs.4751990`.

| Artifact | Immutable digest |
| --- | --- |
| Multi-platform index | `sha256:21919e0988dd97be84768f2a82e63e5be9d8a3fa8476116381b2b33a5901160f` |
| Linux amd64 manifest | `sha256:12729245604a33a3f28da8cd61cc17c36b29486561c7f220d73a9d9dace58f54` |
| Linux arm64 manifest | `sha256:bc0e6f24f75139fc3a875a751c37b6cf66dc41ba42395eeec0839e2b877d9a13` |

Anonymous manifest and configuration downloads verified checksums, architectures,
version `0.5.0-rc.12` and source revision `4751990`. The running k0s web image
identity matches the published index. This is not independent signed-image
provenance verification or a claim that every platform's layers were downloaded.

## Deployment Boundary

The explicitly identified k0s release `harakiri/harakiri` advanced from revision
**46** to **47**. The installed `0.5.0-rc.10` chart was reused; its archive SHA-256
is `9fb11b234041ef55c518850fb60572d66921f4441dc524bbaa67cae6c94428a7`.

A structured server-side Helm dry run compared all 20 rendered resources and
allowed exactly one field change: the web container image. The upgrade reused
operator values and enabled rollback on failure. An initial private snapshot
comparison stopped before mutation because absent fields were serialized
differently; normalization fixed the comparison, which then passed completely.

After rollout, all 22 checked non-web resources and 10 running non-web pod
identities in the application, Keycloak and provider-system namespaces were
unchanged. Only `image.web.tag` changed in Helm values. Public `config.js` is
byte-identical to its predeployment baseline. API, scheduler, builder, database,
Keycloak/SMTP and runtime-provider workloads were not redeployed or reconfigured.
The default customer context was never used.

## Verification

- Local web: 105 tests, typecheck and production build passed.
- Local adapter: typecheck and 53 tests passed; the explicitly gated PostgreSQL
  suite was skipped locally and passed separately in GitHub CI.
- Anonymous installed-package qualification during implementation passed on
  Node 22/24; all six Node 20/22/24 npm/pnpm adapter consumer jobs passed in CI.
- Tracked-source secret scan and documentation link checks passed.
- All 11 documentation browser scenarios passed against the public website,
  including all public pages at desktop/mobile widths, exact copy/downloads,
  Markdown, navigation and comparison checks at ten viewport widths.
- Desktop/mobile live screenshots were inspected; no page overflow or browser
  JavaScript errors were observed.
- Web configuration, API health and OIDC discovery returned HTTP 200. A fresh
  Sign in action reached `https://sb-auth.harakiri.io` with `harakiri-web`,
  response type `code`, PKCE `S256` and callback `https://sb.harakiri.io/`.
  No login credentials were submitted.
- A two-minute public availability sample recorded 56 HTTP 200 responses and
  one HTTP 502 during the web handoff, followed by recovery without intervention.
  This was not a zero-downtime rollout.

Reproduce the non-destructive documentation checks:

```sh
HARAKIRI_WEB_URL=https://sb.harakiri.io \
  pnpm exec playwright test tests/e2e/docs-experience.spec.ts
```

Private rollback values, manifests and before/after evidence are retained in an
owner-only ignored directory. No credentials or private snapshots are committed.
User-owned `docs/cot/`, Brain and customer installation files were untouched.

## Scoped Rollback

Only while revision 47 remains current, revision 46 restores the preceding web
image with the same backend, schema, credentials and public configuration:

```sh
helm --kubeconfig infra/k0s/harakiri.kubeconfig -n harakiri \
  rollback harakiri 46 --wait=watcher --timeout=5m
```

Recheck public docs and OIDC afterward. Do not run a bootstrap installer or infer
cross-schema rollback support from this image-only rollback point.
