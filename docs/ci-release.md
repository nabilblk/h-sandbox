# Release CI

The release consists of matching API and web images, a Helm chart, and the
TypeScript SDK and CLI. API, scheduler and template-builder share the API image.
Candidates use npm `next`, without replacing stable `latest`. Published version
tags and candidate artifacts are immutable.

## Publishing Boundary

Publishing workflows run from `main` in the explicitly enabled repository.
Set `RELEASE_REPOSITORY` to its full `owner/name`. Fork CI builds and tests
without this variable, release secrets or access to the live cluster.

The image/chart and npm workflows first resolve a version tag or full commit
SHA in an unprivileged job. They verify the commit belongs to `origin/main`
and all six package versions agree. Only then does a publishing job check out
that SHA and enter its credential environment. A tag push alone does not publish.

Configure the `harbor` and `npm` environments to permit only the `main` branch.
Add required reviewers where the repository plan supports them. On September 9
the private repository's plan rejected required reviewers: main-only environment
restrictions and trusted-main workflow guards are active, **not a second-person
approval rule**. Revisit reviewers when opening the repository.
See [GitHub environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

## Harbor

Use a project robot with repository `pull` and `push`, scoped to `harakiri`.
Do not use administrator credentials or repository-wide secrets. Enter values
through standard input, not command arguments or committed values:

```bash
gh variable set RELEASE_REPOSITORY --body nabilblk/h-sandbox
gh secret set HARBOR_USERNAME --env harbor
gh secret set HARBOR_PASSWORD --env harbor
```

The current release robot expires December 8, 2026. Renew before expiry and
update both environment secrets together. The registry must present a trusted
certificate. Anonymous reads are required for distribution and the candidate
absence check: an unavailable or unauthorized registry fails the check, rather
than being interpreted as empty.
See [Harbor project robots](https://goharbor.io/docs/2.14.0/working-with-projects/project-configuration/create-robot-accounts/).

| Artifact | Coordinate |
| --- | --- |
| API and workers | `core.campus.clusterdiali.me/harakiri/harakiri-api:<version>` |
| Web and docs | `core.campus.clusterdiali.me/harakiri/harakiri-web:<version>` |
| Control-plane chart | `oci://core.campus.clusterdiali.me/harakiri/charts/harakiri` |
| Maintained runtime chart | `oci://core.campus.clusterdiali.me/harakiri/charts/opensandbox` |

`HARBOR_REGISTRY` and `HARBOR_PROJECT` repository variables override defaults.
The web image reads `config.PUBLIC_*` from the chart-mounted `/config.js`.
Always supply the installation's real browser/API/OIDC origins. Do not replace
existing installation values with development loopback defaults during an
upgrade. New origins require neither an image rebuild nor document-root writes.

## npm Trusted Publishing

Configure a GitHub Actions trusted publisher on **each package**:
`@h-sandbox/sdk` and `@h-sandbox/cli`. Match the repository,
`npm-release.yml` workflow filename and `npm` environment exactly. GitHub login
or `npm whoami` does not prove the OIDC association works.

The workflow uses Node 22 and pinned npm 11.19.1. Only the protected publishing
and trust-verification jobs get `id-token: write`. Publishing checks and packs
with pnpm, then publishes the verified
archives, SDK first. Packing rewrites the CLI's `workspace:*` SDK dependency to
the release version; publishing the raw workspace manifest is unsupported.

Private source can use trusted publishing, but npm provenance requires public
source. Provenance is enabled only when the source repository is public.
See [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/).
If OIDC is unconfigured, stop and configure it or use an explicitly approved
short-lived token from a clean checkout. Never silently add a broad token to CI
or move the stable dist-tag to work around authentication.

### Verify Trust Without Publishing

After saving both package publishers, run this from reviewed `main`:

```bash
gh workflow run npm-release.yml --ref main -f verify_only=true
gh run list --workflow npm-release.yml --limit 3
```

Approve the `npm` environment when required. Verification uses the same
workflow identity and environment as publishing, but the publishing job is
skipped entirely. It requests a GitHub identity for audience
`npm:registry.npmjs.org` and calls the official package-scoped
[npm OIDC exchange endpoint](https://api-docs.npmjs.com/) for both packages.
The short-lived exchange tokens are neither printed, persisted nor used for
package writes. Versions, archives and dist-tags remain unchanged.

A successful exchange proves GitHub-to-npm authentication, not successful
publication or that direct publishing is allowed instead of staging only.
Verify those with the actual candidate workflow after the release gates pass.
A local `npm trust list` 403 can reflect local token restrictions; it does not
by itself disprove a package publisher configured in the npm website.

## Cut a Candidate

Update all six versions, lockfile where needed, contracts and release notes.
Run CI, inspect the diff and exclude secrets/private evidence. Commit and push
reviewed source before creating its immutable tag:

```bash
: "${RELEASE_VERSION:?Set the reviewed, previously unused candidate version first}"
git tag -a "v${RELEASE_VERSION}" -m "Harakiri ${RELEASE_VERSION}"
git push origin "v${RELEASE_VERSION}"
gh workflow run release.yml --ref main -f "release_ref=v${RELEASE_VERSION}" -f component=all
gh workflow run npm-release.yml --ref main -f "release_ref=v${RELEASE_VERSION}" -f tag=next
gh run list --limit 10
```

`RELEASE_VERSION` must match the reviewed source manifests. Do not reuse rc.8,
rc.9 or any other published tag. Check anonymous artifact absence and the current
registry/package inventories in preflight; a failed lookup is not absence.

The image workflow refuses an existing or unverifiable candidate API, web or
chart version. It publishes version and source-SHA image tags; stable releases
also receive `latest`. A single-image repair requires a new explicit image tag
and `component=api` or `web`; it does not publish a product chart. After a
partial full release, preserve its evidence and use a new candidate version,
rather than rerunning over existing artifacts. Never move a release tag.

Template releases run on reviewed `main` changes/manual dispatch, smoke each
architecture, publish run-scoped tags and join their manifests. They do not
promote Harakiri template aliases. The maintained OpenSandbox chart publisher
compares existing content and refuses changes without a version bump.
Publication is not permission to modify a live installation.

## Verify and Deploy

npm can acknowledge publication before all public metadata reads see the new
version. Post-publication verification uses anonymous configuration and bounded
read-only polling; it never retries `npm publish`. If only verification failed,
preserve the original workflow evidence and run the dedicated read-only mode:

```bash
gh workflow run npm-release.yml --ref main -f release_ref=v0.5.0-rc.9 \
  -f verify_published_only=true -f verify_only=false -f tag=next
```

This mode has no publishing environment or OIDC write permission. It validates
the tagged version, checks it with the reviewed current-main verifier and installs
the actual published SDK/CLI in clean consumer directories. It does not make the
original failed workflow green or authorize replacing an immutable version.

```bash
npm view @h-sandbox/sdk dist-tags --json
npm view @h-sandbox/cli dist-tags --json
: "${RELEASE_VERSION:?Set the published candidate being verified}"
docker pull "core.campus.clusterdiali.me/harakiri/harakiri-api:${RELEASE_VERSION}"
docker pull "core.campus.clusterdiali.me/harakiri/harakiri-web:${RELEASE_VERSION}"
helm pull oci://core.campus.clusterdiali.me/harakiri/charts/harakiri --version "${RELEASE_VERSION}"
```

Repeat consumption with empty registry/npm configuration to prove anonymous
access. Record image index/platform digests, chart digest and npm integrity,
then test the declared runtime architecture. A multi-platform manifest or build
does not establish successful runtime behavior on both architectures.

Deploy with the [chart guide](../infra/charts/harakiri/README.md), preserving
operator-owned configuration and secrets. Back up PostgreSQL, persistent
storage and Vault encryption keys together. Verify browser login/logout,
public OIDC discovery, authorization and real SDK/CLI execution afterward.
A rollout alone is not acceptance.

The legacy `pnpm deploy:k0s` and `env:harakiri:deploy-public` path applies
development dependency manifests and fixed credentials. It now refuses public
existing or requested origins. It is not the upgrade path for the public lab;
use versioned Helm artifacts and preserved operator values instead.

The [launch review](oss-launch-review.md) separates publication safety,
artifact delivery, clean installation, independent evaluation and announcement.
Repository visibility and announcement remain separate owner decisions.

## Usage Candidate Qualification

The current usage changes are **unpublished source**, not an extension of the
rc.9 delivery receipt. They retain the legacy summary and add migration 039,
history clients, onboarding and optional private monitoring. Keep version
selection, source/schema rehearsal and published qualification separate.

1. Run ordinary CI, including the disposable PostgreSQL usage suite on Ubuntu
   24.04/PostgreSQL 16.15, browser fixtures and private monitoring contracts.
   Retain scale latency, source-table sizes and matched admission/cleanup trials.
2. After separate hosted-run approval, run the existing standalone workflow with
   `usage_source=true` on the exact reviewed branch. This builds unpublished
   candidates on its disposable runner and tests schema 039, first-task execution
   and replacement-database recovery. It does not prove a published release pair.
3. Assign a new version only after these gates pass. Record anonymous artifact
   identities and publish with the existing protected workflows after approval.
   No extra publishing credential or general release orchestrator is needed.
4. Pin **both actual published bundles** in the native qualification fixture:
   rc.9/schema 038 and the new version/schema 039. Use downloaded charts/images and
   independently installed npm tarballs, not source-built substitutes. Record
   old client/new server and new client/old server behavior, compatible binary
   rollback with schema retained, re-upgrade, preserved files/keys/capacity and
   honest observer gaps. This published-pair fixture is still a required follow-up;
   the source-mode receipt deliberately cannot mark it qualified.
5. Attach the approved receipt using the fields in the [draft release record](release-notes/usage-observations-draft.md).
   Never promote `latest` or mark a release rollback supported on fixture-only
   evidence. Preserve earlier failed receipts; a later pass is separate evidence.

Release-operation fixtures already cover immutable conflicts, unauthorized or
unavailable registries, partial publication, transient npm metadata lag and
bounded read-only verification. Keep these guards; do not retry successful writes
because a later read failed. Failed image/chart publication needs a new candidate
version. npm verification-only retries use the mode above and never publish.

Harbor HTTP health and successful artifact writes do not establish physical
headroom. The storage operator supplies timestamped volume identity, bytes,
inodes, quota/growth and a named review. Contact: `nabilblk@gmail.com`. Keep this
evidence explicitly unavailable until provided; no automated pruning or resizing.
See [private monitoring and storage alerts](operations/operator-monitoring.md).
