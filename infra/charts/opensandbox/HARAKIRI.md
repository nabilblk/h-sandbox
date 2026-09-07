# Harakiri OpenSandbox Distribution

This chart vendors upstream OpenSandbox Helm release `0.2.2`, including its
extracted subcharts. It is published as **`0.2.2-harakiri.2`** in the internal
registry. The upstream release is also mirrored unchanged as `0.2.2`.

Source archive:
https://github.com/opensandbox-group/OpenSandbox/releases/download/helm/opensandbox/0.2.2/opensandbox-0.2.2.tgz

Archive SHA-256:
`2cab7593551d6887dedd110de1c582152b8139c0ed3390d04597f438d1d6d7c0`.

## Difference From Upstream

- The server container port follows `opensandbox-server.server.port`, default
  `80`. Restricted OpenShift values set this and TOML `[server].port` to `8080`.
  Named readiness/liveness probes and the Service follow that container port.
- Revision 2 includes the upstream Apache-2.0 license and tracks all extracted
  subchart sources so a clean checkout packages the same runtime configuration.
  Revision 1 remains immutable and is superseded; do not overwrite it.
- Chart version identifies the maintained distribution; appVersion reflects
  the pinned server image `v0.2.3`.

No runtime code, CRD, SCC or privilege changes. Existing upstream configuration
checksums and imagePullSecrets support are preserved. Do not use installation
post-render patches or restart commands to compensate for a misconfigured port.

## Build

```bash
helm lint infra/charts/opensandbox
helm package infra/charts/opensandbox --destination /tmp/harakiri-charts
helm push /tmp/harakiri-charts/opensandbox-0.2.2-harakiri.2.tgz \
  oci://core.campus.clusterdiali.me/harakiri/charts
```

Dependencies are already vendored. `helm dependency update` is not part of
installation or packaging. Review a future upstream archive and remove this
difference when upstream exposes the same port setting.

OpenSandbox's chart installs cluster-scoped CRDs/RBAC in addition to application
resources in the chosen namespace. A namespace-only application operator needs
the platform administrator to approve/install these prerequisites. One
application namespace does not imply zero cluster-scoped prerequisites.
