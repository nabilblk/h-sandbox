# OpenSandbox install

The deployment script installs the official OpenSandbox chart into
`opensandbox-system` when Helm can reach the chart release artifact. The
Harakiri API is configured with:

- `OPEN_SANDBOX_BASE_URL=http://opensandbox-server.opensandbox-system.svc.cluster.local:80`
- `OPEN_SANDBOX_GATEWAY_URL=http://opensandbox-ingress-gateway.opensandbox-system.svc.cluster.local:80`
- `OPEN_SANDBOX_ALLOW_FALLBACK=0`

The values file keeps the published `opensandbox-0.1.0` chart but overrides the
OpenSandbox component images to the current upstream component tags:
`server:v0.1.14`, `execd:v1.0.17`, and `egress:v1.0.12`. The local k0s deploy
script can also rebuild the official ingress gateway from a checked-out
OpenSandbox source tree as `opensandbox-ingress:local` for the node architecture.

Sandbox lifecycle uses the OpenSandbox server. Terminal, filesystem, and
metrics use OpenSandbox endpoint-resolved `execd`; in gateway/header mode,
Harakiri sends those requests to the internal OpenSandbox ingress gateway with
the returned `OpenSandbox-Ingress-To` header.

OpenSandbox runtime diagnostics are also kept on the provider side. The
supplemental `opensandbox-server-diagnostics` Role only grants the OpenSandbox
server service account `pods/log` in the `opensandbox` dataplane namespace so
the provider's legacy diagnostics endpoint can read container logs. Harakiri's
own service account does not receive `pods/log`.
