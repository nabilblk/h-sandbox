# OpenSandbox install

The deployment script installs the official OpenSandbox chart into
`opensandbox-system` when Helm can reach the chart release artifact. The
Harakiri API is configured with:

- `OPEN_SANDBOX_BASE_URL=http://opensandbox-server.opensandbox-system.svc.cluster.local:80`
- `OPEN_SANDBOX_GATEWAY_URL=http://opensandbox-ingress-gateway.opensandbox-system.svc.cluster.local:80`
- `OPEN_SANDBOX_ALLOW_FALLBACK=0`

The k0s deploy script installs the OpenSandbox `0.2.2` Helm chart from the
current `opensandbox-group/OpenSandbox` release. The values file overrides the
runtime images to the latest verified OpenSandbox component tags checked on
2026-09-02:

- `opensandbox/server:v0.2.3`
- `opensandbox/execd:v1.1.0`
- `opensandbox/egress:v1.1.7`
- `opensandbox/controller:v0.2.0`
- `opensandbox/ingress:v1.0.10`
- `opensandbox/image-committer:v0.1.1`

The default path uses upstream multi-arch Docker Hub images. Set
`HARAKIRI_BUILD_OPEN_SANDBOX_INGRESS=1` only when you need to build the official
gateway image locally from a checked-out OpenSandbox source tree.

Sandbox lifecycle uses the OpenSandbox server. Terminal, filesystem, and
metrics use OpenSandbox endpoint-resolved `execd`; in gateway/header mode,
Harakiri sends those requests to the internal OpenSandbox ingress gateway with
the returned `OpenSandbox-Ingress-To` header.

OpenSandbox runtime diagnostics are also kept on the provider side. The
supplemental `opensandbox-server-diagnostics` Role only grants the OpenSandbox
server service account `pods/log` in the `opensandbox` dataplane namespace so
the provider's legacy diagnostics endpoint can read container logs. Harakiri's
own service account does not receive `pods/log`.
