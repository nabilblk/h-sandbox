# Air-Gapped Deployment

Use this guide when the target cluster cannot pull from Docker Hub, quay.io,
gcr.io, or GitHub-hosted chart URLs. Every runtime image and chart should be
served from the internal registry.

Published artifact registry used in the examples; mirror into your own registry
and project before entering the disconnected environment:

```text
core.campus.clusterdiali.me/harakiri
```

The exact artifact inventory is maintained in
[`release-artifacts.md`](release-artifacts.md).

## Artifact Classes

| Class | Source | Internal destination |
| --- | --- | --- |
| Harakiri API/web images | Built from this repo by `.github/workflows/release.yml` | `<registry>/<project>/harakiri-api:<version>`, `<registry>/<project>/harakiri-web:<version>` |
| Harakiri Helm chart | Packaged from `infra/charts/harakiri` by `.github/workflows/release.yml` | `oci://<registry>/<project>/charts/harakiri --version <version>` |
| SDK and CLI | npm packages from `.github/workflows/npm-release.yml` | Public npm by default; mirror separately only if the customer uses an internal npm registry |
| OpenSandbox images | Pinned upstream images in `infra/mirror/images.txt` | `<registry>/<project>/mirror/opensandbox/*` |
| OpenSandbox Helm chart | Maintained chart `0.2.2-harakiri.2`; unchanged upstream `0.2.2` is a separate provenance artifact | `oci://<registry>/<project>/charts/opensandbox --version <selected-version>` |
| Dependencies | Keycloak, PostgreSQL, registry, Mailpit, BuildKit, Kaniko | `<registry>/<project>/mirror/*` |
| Template images | Built by template-specific pipelines | `<registry>/<project>/templates/<name>:<tag-or-digest>` |

## Mirror Images

Run the GitHub workflow:

```text
Actions -> Mirror images (Harbor)
```

The workflow reads `infra/mirror/images.txt` and copies every pinned image to:

```text
${HARBOR_REGISTRY}/${HARBOR_PROJECT}/mirror/...
```

Re-run it whenever `infra/mirror/images.txt` changes. Keep OpenSandbox chart
version, OpenSandbox image tags, and the values files in sync.

## Mirror OpenSandbox Chart

The maintained OpenSandbox chart is not an image. Download the reviewed release
and copy the archive without repackaging it. Authenticate to private registries
with `helm registry login` using an operator-managed credential:

```bash
mkdir -p charts
helm pull oci://core.campus.clusterdiali.me/harakiri/charts/opensandbox \
  --version 0.2.2-harakiri.2 --destination charts
helm push charts/opensandbox-0.2.2-harakiri.2.tgz \
  oci://registry.example.com/harakiri/charts
```

Expected destination:

```text
oci://registry.example.com/harakiri/charts/opensandbox --version 0.2.2-harakiri.2
```

The maintained distribution permits the non-root server port; see its
[provenance](../infra/charts/opensandbox/HARAKIRI.md). Do not substitute unchanged
upstream `0.2.2`, whose container port is fixed at 80, in that profile.

For the **unchanged upstream chart only**, the generic helper remains available:

```bash
CLIENT_REGISTRY_URL=https://registry.example.com \
HARBOR_PROJECT=harakiri \
infra/mirror/mirror-opensandbox-chart.sh
```

Supply `CLIENT_REGISTRY_USERNAME` and `CLIENT_REGISTRY_PASSWORD` through a
private operator environment. The helper requires an explicit destination and
sends the password on stdin. It mirrors upstream `0.2.2` by default; it does not
build the maintained distribution or install anything into Kubernetes.

## Deploy With Harbor

Mirror the Harakiri chart in the same way, selecting the exact version from its
release receipt. For an approved Kubernetes runtime profile, install the local
archives with your reviewed, operator-owned values:

```bash
helm install opensandbox charts/opensandbox-0.2.2-harakiri.2.tgz \
  -n opensandbox-system \
  -f runtime-values.yaml --wait --timeout 10m

helm install harakiri "charts/harakiri-${HARAKIRI_VERSION}.tgz" \
  -n harakiri \
  -f harakiri-values.yaml --wait --timeout 10m
```

Set `HARAKIRI_VERSION` and download its chart before running these commands.
The values must include your registry, existing Secret references, public OIDC
origins, runtime endpoints and storage configuration. Explicitly configure both
runtime subchart namespaces. Do not install a second controller into a populated
cluster or treat a registry mirror as a substitute for dependency configuration.

See the [standalone OpenShift guide](install-openshift.md) for restricted-profile
prerequisites and the [native evaluation](../infra/preview/README.md) for the
recorded Kubernetes profile. Consumer applications have their own installation
and version matrices; none is required by these Harakiri instructions.

## Template Images

Sandbox template builds can only pull base images allowed by the Harakiri image
policy and reachable from the cluster. In a strict air-gap:

- mirror every base image used by `examples/templates/*/Dockerfile`;
- push final template images to `<registry>/<project>/templates/*`;
- import image-backed template versions with the CLI;
- record the exact digest in the environment handoff.

## Operational Notes

- If Harbor is private, configure image pull secrets for control-plane pods,
  template-builder Jobs, and OpenSandbox-created sandbox pods.
- If Harbor uses a private CA, configure node trust before installing.
- PostgreSQL images built for arbitrary UIDs are required on restricted
  OpenShift. The Docker Hub `postgres:16-alpine` mirror is useful for k0s but is
  not the recommended OpenShift image.
- Kaniko is kept only as a legacy builder fallback. BuildKit is the default
  builder for Kubernetes; restricted OpenShift should use externally built
  image-backed templates until an OpenShift-native builder backend exists.
