# Air-gapped deployment (pull everything from Harbor)

For clusters that cannot reach Docker Hub / quay.io / gcr.io / the Aliyun
OpenSandbox registry. Every image is served from your Harbor at
`core.campus.clusterdiali.me/harakiri/...`.

## What runs where

| Component | Image source | Air-gap ref |
|---|---|---|
| harakiri api / web / scheduler / template-builder | built from this repo | `harakiri/harakiri-api:0.1.0`, `harakiri/harakiri-web:0.1.0` |
| in-cluster template registry | `registry:2` | `harakiri/mirror/registry:2` |
| Postgres / Keycloak / Mailpit | Docker Hub / quay.io | `harakiri/mirror/{postgres,keycloak,mailpit}` |
| template build toolchain | BuildKit / Kaniko | `harakiri/mirror/{buildkit,kaniko-executor}` |
| OpenSandbox server / execd / egress / controller / ingress | Aliyun registry | `harakiri/mirror/opensandbox/*` |

## One-time prerequisites

1. **Publish control-plane images + chart** — push a `v*` tag (the release workflow).
2. **Mirror third-party/upstream images** — run **Actions → Mirror images (Harbor)**
   (or edit `infra/mirror/images.txt`). This populates `harakiri/mirror/*`.
3. **Make the project pullable from the cluster.** The `harakiri` Harbor project is
   set **public-read**, so every workload — including the OpenSandbox-created
   sandbox pods and the template-builder Jobs — can pull without credentials.
   Push still requires the robot account. (To keep it private, you must wire
   imagePullSecrets into every namespace *and* the dynamically-created Jobs/sandbox
   pods, which is why public-read is the recommended air-gap posture.)

## Deploy

### Control plane + dependencies (kustomize — current deploy path)

```bash
kubectl apply -k infra/overlays/airgap
```

The overlay repoints every image in `infra/k8s` to Harbor and rewrites the
template-builder's BuildKit/Kaniko/Job-image refs (which live in the ConfigMap).

### OpenSandbox runtime

```bash
helm upgrade --install opensandbox <opensandbox-chart> -n opensandbox-system \
  -f infra/k8s/opensandbox/opensandbox-values.airgap.yaml
```

All OpenSandbox images (server, execd, egress, controller, gateway/ingress) pull
from Harbor. The gateway uses the pinned upstream `ingress:v1.0.2` instead of the
source-built `opensandbox-ingress:local`, so nothing is compiled on the cluster.

### Or, control plane via the Helm chart

```bash
helm install harakiri oci://core.campus.clusterdiali.me/harakiri/charts/harakiri \
  --version 0.1.0 -n harakiri -f infra/charts/harakiri/values-airgap.yaml \
  --set secret.existingSecret=harakiri-api
```

## Refreshing / adding mirrored images

Edit `infra/mirror/images.txt` and push, or run the workflow manually. `crane`
preserves digests, so re-runs are idempotent. Pin versions explicitly (the one
floating tag is `buildkit:rootless`).

## Notes

- Sandbox **template builds** can only pull base images that exist in Harbor or the
  in-cluster registry (the air-gap config sets `TEMPLATE_IMAGE_ALLOW_REGISTRIES`
  accordingly). Mirror any base images your templates use.
- If you bump OpenSandbox, update both the tags in `infra/mirror/images.txt` and the
  `*.airgap.yaml` values, then re-mirror.
