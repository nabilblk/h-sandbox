# Release CI — publishing images & the Helm chart to Harbor

The [`Release (Harbor)`](../.github/workflows/release.yml) workflow builds and
publishes, on every `v*.*.*` tag (or a manual run):

- `core.campus.clusterdiali.me/harakiri/harakiri-api:<version>`
- `core.campus.clusterdiali.me/harakiri/harakiri-web:<version>`
- `oci://core.campus.clusterdiali.me/harakiri/charts/harakiri:<version>` (Helm chart)

`scheduler` and `template-builder` reuse the **api** image (different command),
so only two images are built.

## One-time setup

### 1. Harbor: project + robot account

Create a Harbor **project** named `harakiri` (Projects → New Project). Then create
a **robot account** scoped to that project with **push** permission on
repositories and artifacts — do **not** use the `admin` account in CI.

> Projects → harakiri → Robot Accounts → New Robot Account → permissions:
> Repository `push`/`pull`, Artifact `push`/`pull`, Helm Chart `push`/`read`.

Copy the robot name (`robot$harakiri+ci`) and token.

> [!WARNING]
> The Harbor `admin` password was shared in plaintext while setting this up.
> **Rotate it** and use the scoped robot account above for CI. Admin credentials
> should never live in GitHub secrets.

### 2. GitHub: secrets & variables

Repo → Settings → Secrets and variables → Actions. The release jobs use a
`harbor` **environment** — create it (Settings → Environments → `harbor`) and add
the secrets there (so you can require reviewers on releases), or add them as repo
secrets.

Secrets (required):

```bash
gh secret set HARBOR_USERNAME --env harbor --body 'robot$harakiri+ci'
gh secret set HARBOR_PASSWORD --env harbor --body '<robot-token>'
```

Variables (optional — override the defaults baked into the web image and the
registry/project names):

```bash
gh variable set HARBOR_REGISTRY --body 'core.campus.clusterdiali.me'
gh variable set HARBOR_PROJECT  --body 'harakiri'
gh variable set WEB_PUBLIC_API_URL          --body 'https://api.campus.clusterdiali.me'
gh variable set WEB_PUBLIC_KEYCLOAK_URL     --body 'https://auth.campus.clusterdiali.me'
gh variable set WEB_PUBLIC_KEYCLOAK_REALM   --body 'harakiri'
gh variable set WEB_PUBLIC_KEYCLOAK_CLIENT_ID --body 'harakiri-web'
```

> [!NOTE]
> The web image is **runtime-configured**: the chart renders `/config.js` from
> `config.PUBLIC_*` values and mounts it as a ConfigMap, so one published image
> works in any environment without mutating the nginx document root. The
> `WEB_PUBLIC_*` repo variables above are only optional build-time fallbacks
> baked into the bundle; the chart path should set runtime values explicitly.

### 3. Harbor TLS / CA

If Harbor uses a private CA, the GitHub-hosted runner must trust it for
`docker login`/`helm registry login` to succeed. Either install a publicly
trusted cert on Harbor, or run the release on a self-hosted runner that trusts
the CA.

## Cutting a release

```bash
git tag v0.2.0
git push origin v0.2.0
```

The workflow tags images `0.2.0`, `0.2`, `sha-<short>`, and `latest` (latest only
for non-prerelease tags), and pushes a chart versioned `0.2.0`.

Manual build (e.g. from a branch, custom tag):

> Actions → Release (Harbor) → Run workflow → set `image_tag` / `chart_version`
> / `platforms` (`linux/amd64,linux/arm64` for multi-arch).

## Verify

```bash
# images
docker pull core.campus.clusterdiali.me/harakiri/harakiri-api:0.2.0
# chart
helm registry login core.campus.clusterdiali.me
helm pull oci://core.campus.clusterdiali.me/harakiri/charts/harakiri --version 0.2.0
```

Then deploy with [the chart](../infra/charts/harakiri/README.md).

## What CI validates on PRs

The [`CI`](../.github/workflows/ci.yml) workflow `chart` and `images` jobs lint +
render the chart and build both Dockerfiles (no push) on every PR, so packaging
breakage is caught before a release.
