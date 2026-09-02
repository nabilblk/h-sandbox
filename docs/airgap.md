# Air-Gapped Deployment

Use this guide when the target cluster cannot pull from Docker Hub, quay.io,
gcr.io, or GitHub-hosted chart URLs. Every runtime image and chart should be
served from the internal registry.

Default internal registry used by this repo:

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
| OpenSandbox Helm chart | Upstream chart `0.2.2` | `oci://<registry>/<project>/charts/opensandbox --version 0.2.2` |
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

The OpenSandbox chart is not an image and is mirrored separately:

```bash
CLIENT_REGISTRY_URL=https://core.campus.clusterdiali.me/ \
CLIENT_REGISTRY_USERNAME=<robot-or-admin> \
CLIENT_REGISTRY_PASSWORD=<token> \
OCP-install/mirror-opensandbox-chart.sh
```

Default result:

```text
oci://core.campus.clusterdiali.me/harakiri/charts/opensandbox --version 0.2.2
```

The mirror script does not patch the chart. OpenShift-specific behavior is set
through values files.

## Deploy With Harbor

For Kubernetes/k0s:

```bash
helm upgrade --install opensandbox \
  oci://core.campus.clusterdiali.me/harakiri/charts/opensandbox \
  --version 0.2.2 \
  -n opensandbox-system \
  -f infra/k8s/opensandbox/opensandbox-values.airgap.yaml

helm upgrade --install harakiri \
  oci://core.campus.clusterdiali.me/harakiri/charts/harakiri \
  --version <harakiri-version> \
  -n harakiri \
  --set secret.existingSecret=harakiri-api \
  -f infra/charts/harakiri/values-airgap.yaml
```

For OpenShift, use the single-namespace package:

```bash
./OCP-install/harakiri-security/install.sh
```

See [`install-openshift.md`](install-openshift.md) for the copy/pasteable
OpenShift flow.

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
