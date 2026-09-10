# Template Image Releases

Template images are independently versioned runtime artifacts. API, web, Helm,
SDK and CLI releases do not automatically publish them.

## Catalog and CI

`infra/templates/catalog.json` is the release inventory: base Linux, Python data,
Node applications, Chromium, OpenCode, and open-agents-dev. Each entry names its
Dockerfile context and smoke command. No paid model credential is required.

Run `.github/workflows/template-release.yml` from a reviewed commit. The protected
`harbor` environment provides `HARBOR_USERNAME` and `HARBOR_PASSWORD`; configure
`HARBOR_REGISTRY` and `HARBOR_PROJECT` variables for another registry/project.
Both native amd64 and arm64 runners must pass root and arbitrary-UID smoke tests
before a multi-architecture manifest is published. The UID test drops all Linux
capabilities and enables no-new-privileges; it is not a replacement for an actual
restricted OpenShift sandbox test with a mounted PVC.

Artifacts use this coordinate:

```text
core.campus.clusterdiali.me/harakiri/templates/<name>:sha-<commit>-<run-id>-<attempt>
```

The workflow records the resulting digest. Use that digest for template import
and customer mirroring. Configure Harbor tag immutability and retention for
approved releases; this workflow does not change registry policy or promote a
Harakiri template alias automatically. A failed architecture job can leave an
architecture-specific image, but must not produce the final multiarch manifest.

## Local Candidate Check

From the repository root, with sufficient Docker disk space:

```bash
TEMPLATE_NAME=python-3.12-data \
TEMPLATE_PLATFORM=linux/arm64 \
TEMPLATE_TAG=0.5.0-rc.1 \
node infra/templates/release.mjs check
```

Use `publish` instead of `check` only when publication is intended and the
registry login is configured. It repeats build and smoke before pushing the
single architecture. Local publication is not multiarch CI acceptance. Evidence
under `docs/artifacts/template-releases/` includes source revision, dirty-source
flag, architecture, digest and the explicit absence of provider acceptance.
Do not reuse a released tag for a new build.

## Runtime Acceptance and Promotion

1. Import the digest through Harakiri template image import with a candidate name.
2. Create a sandbox through the public API/SDK/CLI, execute the template smoke
   command, verify files and an HTTP route when supported, and confirm termination.
3. Repeat on each profile actually advertised as supported, including workspace
   volume ownership. Restricted OpenShift requires separate native acceptance
   if selected; a customer stack is not a generic template release gate.
4. Record the Harakiri version, template digest, cluster profile and result.
5. Promote the tested version/alias explicitly. Keep the previous digest for rollback.

## Current Evidence

September 9, 2026: [workflow 34347806269](https://github.com/nabilblk/h-sandbox/actions/runs/34347806269)
passed all 12 architecture jobs and six manifest jobs. The earlier September 7
local checks are no longer the latest publication result. Native runtime
acceptance/promotion is still distinct from image checks; see the
[rc.8 receipt](release-notes/0.5.0-rc.8-delivery.md) for the demonstrated arm64 scope.
The historical June open-agents-dev digest is not evidence for later Dockerfile
revisions or generic restricted OpenShift support.

See [release artifacts](release-artifacts.md), [runtime contract](template-runtime-contract.md),
and [standalone OpenShift prerequisites](install-openshift.md).
