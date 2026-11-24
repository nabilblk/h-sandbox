# Disconnected and private registries

Use this alongside the target's guide when the cluster cannot pull from public
registries or chart URLs. Mirroring artifacts does not replace dependency
configuration.

Source of truth, in the tagged clone:

- `docs/airgap.md`
- `docs/release-artifacts.md`: the artifact inventory.
- `infra/mirror/images.txt`: the pinned runtime and dependency images.
- the release delivery receipt: digests.

## What must be mirrored

| Class | Notes |
| --- | --- |
| Harakiri API and web images | The exact pinned version, by digest |
| Harakiri Helm chart | Copy the published archive with `helm pull` then `helm push`. Never repackage it. |
| OpenSandbox runtime chart | The **maintained** `-harakiri.N` chart from the receipt, not unchanged upstream. Upstream fixes the server port at 80, which breaks the non-root profile. |
| Runtime and dependency images | Everything in `infra/mirror/images.txt` for this release |
| Template images and their base images | Mirror the base images first, then push the final template images and import them by digest |
| npm SDK and CLI | Only when the user's machines cannot reach public npm. Mirror into their internal npm registry. |

## Rules

- Registry credentials come from the operator's environment or Secret
  manager, never from command arguments. The repository helper reads the
  password on stdin.
- Configure image pull Secrets for the control-plane pods, template-builder
  Jobs (where builds are enabled) and sandbox pods created by the runtime.
- A private CA must be trusted by the **nodes** for image pulls. Workstation
  trust, PostgreSQL TLS and in-sandbox application trust are configured
  separately.
- On OpenShift, use a PostgreSQL image built for arbitrary UIDs. Do not use the
  Alpine image intended for k0s.
- Record every mirrored digest in the handoff. The OpenShift generator takes
  the destination repositories and verified digests as input, never
  credentials.
- Do not mirror images for disabled features, such as egress sidecars or
  snapshot helpers, in order to enable them.
