# OpenSandbox install

The deployment script installs the official OpenSandbox chart into
`opensandbox-system` when Helm can reach the chart release artifact. The
Harakiri API is configured with:

- `OPEN_SANDBOX_BASE_URL=http://opensandbox-server.opensandbox-system.svc.cluster.local:80`
- `OPEN_SANDBOX_GATEWAY_URL=http://opensandbox-ingress-gateway.opensandbox-system.svc.cluster.local:80`
- `OPEN_SANDBOX_ALLOW_FALLBACK=0`

Sandbox lifecycle uses the OpenSandbox server. Terminal, filesystem, and
metrics use OpenSandbox endpoint-resolved `execd`; in gateway/header mode,
Harakiri sends those requests to the internal OpenSandbox ingress gateway with
the returned `OpenSandbox-Ingress-To` header.
