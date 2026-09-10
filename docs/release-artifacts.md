# Release Artifacts

This page is the release handoff map for operators and contributors. It separates
Harakiri-owned artifacts from upstream artifacts that are mirrored for
self-hosted or air-gapped clusters.

## Version Policy

A tagged release `vX.Y.Z` should publish the same version across the installable
Harakiri surface:

- `core.campus.clusterdiali.me/harakiri/harakiri-api:X.Y.Z`
- `core.campus.clusterdiali.me/harakiri/harakiri-web:X.Y.Z`
- `oci://core.campus.clusterdiali.me/harakiri/charts/harakiri --version X.Y.Z`
- `@h-sandbox/sdk@X.Y.Z`
- `@h-sandbox/cli@X.Y.Z`

The current source chart keeps placeholder versions in `Chart.yaml`; the release
workflow overrides chart `version` and `appVersion` from the git tag or manual
workflow input.

## Harakiri-Owned Artifacts

| Artifact | Coordinate | Produced by | Notes |
| --- | --- | --- | --- |
| API image | `core.campus.clusterdiali.me/harakiri/harakiri-api:<version>` | `.github/workflows/release.yml` | Also runs the scheduler and template-builder containers with alternate commands. |
| Web image | `core.campus.clusterdiali.me/harakiri/harakiri-web:<version>` | `.github/workflows/release.yml` | Runtime `config.js` is mounted by the Helm chart, not written into the image filesystem. |
| Helm chart | `oci://core.campus.clusterdiali.me/harakiri/charts/harakiri` | `.github/workflows/release.yml` | Deploys only the Harakiri control plane; PostgreSQL, Keycloak, and OpenSandbox are external prerequisites. |
| TypeScript SDK | `@h-sandbox/sdk` | `.github/workflows/npm-release.yml` | Public npm package for API integrations. |
| CLI | `@h-sandbox/cli` | `.github/workflows/npm-release.yml` | Installs the `harakiri` executable. |
| Runtime templates | `core.campus.clusterdiali.me/harakiri/templates/<name>:sha-<commit>-<run>-<attempt>` | `.github/workflows/template-release.yml` | New workflow; both native architectures must pass before manifest publication. Runtime acceptance/promotion is separate. |
| Maintained OpenSandbox chart | `oci://core.campus.clusterdiali.me/harakiri/charts/opensandbox` | `.github/workflows/opensandbox-chart-release.yml` | Reviewed vendored upstream sources with configurable non-root server port; independent chart version. |

`packages/shared` is intentionally not published. Public consumers depend on the
SDK and CLI only; shared protocol code stays an internal workspace package so the
npm surface remains small and stable.

## Mirrored Upstream Artifacts

Run the `Mirror images (Harbor)` workflow after changing
`infra/mirror/images.txt`. The workflow copies pinned upstream images to Harbor
and preserves digests.

| Upstream | Harbor mirror |
| --- | --- |
| `docker.io/opensandbox/server:v0.2.3` | `core.campus.clusterdiali.me/harakiri/mirror/opensandbox/server:v0.2.3` |
| `docker.io/opensandbox/controller:v0.2.0` | `core.campus.clusterdiali.me/harakiri/mirror/opensandbox/controller:v0.2.0` |
| `docker.io/opensandbox/execd:v1.1.0` | `core.campus.clusterdiali.me/harakiri/mirror/opensandbox/execd:v1.1.0` |
| `docker.io/opensandbox/egress:v1.1.7` | `core.campus.clusterdiali.me/harakiri/mirror/opensandbox/egress:v1.1.7` |
| `docker.io/opensandbox/ingress:v1.0.10` | `core.campus.clusterdiali.me/harakiri/mirror/opensandbox/ingress:v1.0.10` |
| `docker.io/opensandbox/image-committer:v0.1.1` | `core.campus.clusterdiali.me/harakiri/mirror/opensandbox/image-committer:v0.1.1` |
| `quay.io/keycloak/keycloak:26.4` | `core.campus.clusterdiali.me/harakiri/mirror/keycloak:26.4` |
| `docker.io/library/postgres:16-alpine` | `core.campus.clusterdiali.me/harakiri/mirror/postgres:16-alpine` |
| `docker.io/library/registry:2` | `core.campus.clusterdiali.me/harakiri/mirror/registry:2` |
| `docker.io/axllent/mailpit:v1.27` | `core.campus.clusterdiali.me/harakiri/mirror/mailpit:v1.27` |
| `docker.io/moby/buildkit:rootless` | `core.campus.clusterdiali.me/harakiri/mirror/buildkit:rootless` |
| `gcr.io/kaniko-project/executor:v1.24.0` | `core.campus.clusterdiali.me/harakiri/mirror/kaniko-executor:v1.24.0` |

The unchanged upstream OpenSandbox Helm chart can be mirrored separately with
the generic helper. Set registry credentials in a private operator environment:

```bash
CLIENT_REGISTRY_URL=https://registry.example.com \
HARBOR_PROJECT=harakiri \
infra/mirror/mirror-opensandbox-chart.sh
```

Default chart source:

```text
https://github.com/opensandbox-group/OpenSandbox/releases/download/helm/opensandbox/0.2.2/opensandbox-0.2.2.tgz
```

Destination chart coordinate for that example:

```text
oci://registry.example.com/harakiri/charts/opensandbox --version 0.2.2
```

The native reference and non-root configuration use the maintained
`0.2.2-harakiri.2` distribution instead, with a configurable server container
port and included upstream license. Its Harbor manifest digest is
`sha256:b93f51554b26364f09f839e6b4f95eeb6ba799edecee9cb1f6de421207d04a34`.
The unchanged upstream chart remains available for provenance. See
[distribution notes](../infra/charts/opensandbox/HARAKIRI.md).
Copy that maintained chart with `helm pull` and `helm push` as described in the
[air-gap guide](airgap.md); the upstream mirror helper is not its release job.

## Template Images

Template images are runtime images, not control-plane release images. The
examples under `examples/templates/` can be built and pushed by CI, an operator,
or a project-specific pipeline:

```bash
docker buildx build \
  --platform linux/amd64 \
  -t core.campus.clusterdiali.me/harakiri/templates/open-agents-dev:<tag> \
  --push \
  examples/templates/open-agents-dev
```

A historical June OpenShift integration test used this imported template image:

```text
core.campus.clusterdiali.me/harakiri/templates/open-agents-dev@sha256:fd71e2b7610f81260755ccb86ee60a119ce14816016a4870ef9820a8b4255070
```

The September 9 [template workflow](https://github.com/nabilblk/h-sandbox/actions/runs/34347806269)
passed all 12 architecture checks and six manifest jobs. Native acceptance is
separate; the [rc.8 receipt](release-notes/0.5.0-rc.8-delivery.md) records its exact
arm64 boundary. See [template image releases](template-release.md). The June
digest above is historical evidence, not acceptance of the latest sources.

## Consumer Applications

Applications using Harakiri own their charts, images, dependencies and tested
version combinations. They are not part of the Harakiri release inventory.
A customer may mirror both products into one registry project, but that does
not couple their OSS release pipelines or require installing the other product.

## Release Checklist

1. Run CI and local release validation from `docs/test-report.md`.
2. Run `.github/workflows/mirror.yml` after any upstream image pin change.
3. Run `.github/workflows/release.yml` from a `vX.Y.Z` tag or a manual release
   candidate tag.
4. Run `.github/workflows/npm-release.yml` after SDK and CLI package versions are
   bumped to the same public version.
5. Verify install docs render and chart values point to the same version.
6. Verify hosted login/logout and route smoke against the deployed candidate.

No documentation should embed real registry, SMTP, Keycloak, database, or npm
tokens. Use environment variables or Kubernetes Secrets.
