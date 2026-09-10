# Kubernetes Documentation: Public Deployment Receipt

September 10, 2026 (Africa/Casablanca). Web-only delivery; no product version,
npm package or Helm chart publication.

## Source and Artifact

- Documentation commit: `bbddf388b5ae0c0ff1f86e28d0e2704aa5a76d79`.
- [PR #30](https://github.com/nabilblk/h-sandbox/pull/30) merged after all eight
  required checks passed. Additional product-demo verification also passed.
- Published source: merge commit `6eb81d1ef0e1e37d506698e008c64a39a28fa861`.
- [Web-only Harbor workflow](https://github.com/nabilblk/h-sandbox/actions/runs/34511683266)
  completed successfully using the protected environment approval gate. The
  chart job was skipped; no API image or npm publication was requested.
- Image: `core.campus.clusterdiali.me/harakiri/harakiri-web:0.5.0-rc.8-k8s-docs.6eb81d1`.
- Multi-platform index: `sha256:07e53ffc3c815428492dfe557a53083ac00517bae4ec022420867171387970ce`.
- linux/amd64: `sha256:b132df916c2cf8cc94ae209b71aa2baa5574afabf552555dbbabdb54f9010ccf`.
- linux/arm64: `sha256:d4e3ca0439f0fc8edd2d9647ab9612152f763a928c47f606549d33b378571b5d`.

Both platform manifests were inspected in Harbor. The pulled arm64 image's
revision label matched the exact published source; its version label remains
`0.5.0-rc.8`. The existing workflow disables SBOM/provenance attestations for
Harbor compatibility; this receipt does not claim signed-image provenance.

## What Is Live

[Install on Kubernetes](https://sb.harakiri.io/#docs/install-kubernetes) is now
a first-class Self-hosting page, linked from the overview, quickstart and preview
scope. It covers the deployment profile, prerequisites, private configuration,
PostgreSQL/Keycloak, two versioned charts, sign-in, a model-free SDK task, public
origins, troubleshooting, recovery and deliberate uninstall.

The [Markdown export](https://sb.harakiri.io/docs/install-kubernetes.md),
[inventory](https://sb.harakiri.io/docs/index.json),
[LLM index](https://sb.harakiri.io/llms.txt) and
[full text](https://sb.harakiri.io/llms-full.txt) match the generated source
exactly. Repository and chart documentation point to the same operator journey.
The homepage, vertical demo library and five existing films are unchanged.

The guide intentionally pins previously reviewed installation inputs and rc.8
artifacts separately from this newer documentation image. This deployment does
not replace that reference profile or certify a new installation, native amd64
runtime, restricted OpenShift, HA, capacity enforcement or encrypted Vault
recovery. Those limits remain visible in the article.

## Deployment Boundary

Public k0s release `harakiri/harakiri` advanced from revision **35** to **36**.
The exact existing `harakiri-0.5.0-rc.8.tgz` was reused; its archive SHA-256 was
verified as `e91b7c6c2dce7d0f36a696a2233b430cb9e73cda1be801d75457a8d73549e5b3`.

Server-side Helm dry run permitted exactly one resource change: the image of
`Deployment/harakiri/harakiri-web`, pinned to the index digest above. Existing
values were reused only after this same-chart, image-only comparison passed.
The upgrade used rollback-on-failure and waited for readiness.

Post-upgrade comparisons confirmed:

- All six namespace deployments ready; the new web pod had zero restarts.
- All non-web deployment specifications unchanged.
- Shared configuration and browser runtime ConfigMap contents unchanged.
- Application Secret data hash unchanged.
- All Helm values except the web image tag unchanged.

API, scheduler, builder, registry, database, Keycloak/SMTP and the runtime provider
were not redeployed or reconfigured. No migration, credential rotation, sandbox
cleanup, customer installation or Brain access accompanied this delivery.

One public HTTP 502 was observed while the supervised tunnel port forward
switched pods. The subsequent check returned 200 without manual intervention.
This is not a zero-downtime claim.

## Acceptance

- 76 local web tests passed; PR CI passed all eight required checks and the
  additional product-demo verification.
- All seven documentation browser tests passed against the published image
  locally and again against the public site. Coverage includes every docs page
  at 1440/390/320px, diagrams, search, progression, section links, keyboard
  access, language selection, exact clipboard text and installation discovery.
- Public desktop/mobile screenshots were reviewed, including command blocks.
  No document-level horizontal overflow or browser page errors were observed.
- Markdown, JSON inventory and LLM exports returned 200 with their correct MIME
  types and exact generated content. Missing documentation returned 404.
- All five films' hashes, MIME types, captions, byte ranges, source bundles and
  missing-media 404s passed on the local image and public site.
- Public web, API health and Keycloak discovery returned 200. The discovery
  issuer remained `https://sb-auth.harakiri.io/realms/harakiri`.
- Browser sign-in rendered the public Keycloak form with client `harakiri-web`,
  response type `code`, PKCE `S256` and callback `https://sb.harakiri.io/`.
  No account login, token refresh, password reset or SMTP test was performed.
- The deployed entrypoint is `index-Cxr_06lF.js`; browser runtime configuration
  contains the public web/API/auth origins, not localhost.

Reproduce the non-destructive public documentation/media acceptance:

```sh
HARAKIRI_WEB_URL=https://sb.harakiri.io \
  pnpm exec playwright test tests/e2e/docs-experience.spec.ts
pnpm --filter @harakiri/demo-video server:qa https://sb.harakiri.io
```

The first local nginx preview failed to create its temporary directories because
Colima's Docker data volume had no available space. Browser tests against that
unavailable preview failed with connection refusal. A non-root, read-only
container with tmpfs `/tmp`, the same image and exact deployed nginx/browser
configuration became healthy and passed all acceptance checks. No image change
or shared Docker pruning was needed. The temporary container was removed;
Colima's disk headroom still needs separate attention. The k0s VM was unaffected.

Owner-only, ignored deployment snapshots and screenshots remain under
`docs/artifacts/kubernetes-docs-deploy-private/`. No raw Helm values, credentials
or private login handoff were printed or committed. Unrelated `docs/cot/` files
remain untracked and untouched.

## Scoped Rollback

Only while revision 36 is still the latest release, revision 35 restores the
previous web image with the same current credentials and backend configuration:

```sh
helm --kubeconfig infra/k0s/harakiri.kubeconfig -n harakiri \
  rollback harakiri 35 --wait=watcher --timeout=5m
```

Recheck public web and OIDC after rollback. No database rollback is needed for
this image-only delivery; do not invoke a bootstrap installer. Review later
release changes before choosing any rollback target.
