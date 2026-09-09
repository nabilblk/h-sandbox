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

The workflow uses Node 22 and pinned npm 11.19.1. Only the publishing job gets
`id-token: write`. It checks and packs with pnpm, then publishes the verified
archives, SDK first. Packing rewrites the CLI's `workspace:*` SDK dependency to
the release version; publishing the raw workspace manifest is unsupported.

Private source can use trusted publishing, but npm provenance requires public
source. Provenance is enabled only when the source repository is public.
See [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/).
If OIDC is unconfigured, stop and configure it or use an explicitly approved
short-lived token from a clean checkout. Never silently add a broad token to CI
or move the stable dist-tag to work around authentication.

## Cut a Candidate

Update all six versions, lockfile where needed, contracts and release notes.
Run CI, inspect the diff and exclude secrets/private evidence. Commit and push
reviewed source before creating its immutable tag:

```bash
git tag -a v0.5.0-rc.6 -m 'Harakiri 0.5.0-rc.6'
git push origin v0.5.0-rc.6
gh workflow run release.yml --ref main -f release_ref=v0.5.0-rc.6 -f component=all
gh workflow run npm-release.yml --ref main -f release_ref=v0.5.0-rc.6 -f tag=next
gh run list --limit 10
```

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

```bash
npm view @h-sandbox/sdk dist-tags --json
npm view @h-sandbox/cli dist-tags --json
docker pull core.campus.clusterdiali.me/harakiri/harakiri-api:0.5.0-rc.6
docker pull core.campus.clusterdiali.me/harakiri/harakiri-web:0.5.0-rc.6
helm pull oci://core.campus.clusterdiali.me/harakiri/charts/harakiri --version 0.5.0-rc.6
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
