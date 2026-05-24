# OpenSandbox And Kubernetes Boundaries

Harakiri is a product and control plane on top of OpenSandbox. The runtime
contract is that OpenSandbox owns sandbox lifecycle and sandbox data-plane
access; Harakiri owns product state, routing records, template metadata, API
keys, schedules, usage, and audit events.

## OpenSandbox-Owned Runtime Path

Harakiri uses OpenSandbox for:

- Sandbox lifecycle: create, list, get, delete, and renew through
  `/v1/sandboxes`.
- Sandbox terminal commands: resolve port `44772` with
  `/v1/sandboxes/:id/endpoints/44772?use_server_proxy=true`, then call
  `execd` `POST /command`.
- Filesystem metadata: call `execd` `GET /files/search`. Harakiri synthesizes
  immediate directory rows from returned file paths because the current
  portable OpenSandbox API searches files rather than listing directories.
- Metrics: call `execd` `GET /metrics`.
- Sandbox diagnostic logs: call OpenSandbox diagnostics
  `/v1/sandboxes/:id/diagnostics/logs?scope=container` when available, with a
  provider-side fallback to OpenSandbox's deprecated plain-text
  `/v1/sandboxes/:id/diagnostics/logs?tail=200` endpoint while the stable API is
  not implemented upstream.
- HTTP route targets: resolve OpenSandbox endpoints or use the OpenSandbox
  ingress gateway path, depending on route mode.

OpenSandbox endpoint responses may include access headers such as
`OpenSandbox-Secure-Access`. Harakiri forwards those headers to the resolved
endpoint and adds `X-EXECD-ACCESS-TOKEN` when OpenSandbox does not return one.
When OpenSandbox is configured in gateway/header mode and returns an
`OpenSandbox-Ingress-To` header, Harakiri calls the configured internal gateway
URL (`OPEN_SANDBOX_GATEWAY_URL`) with that header. This keeps runtime traffic
inside OpenSandbox's gateway instead of sending control-plane requests through a
public DNS or Cloudflare edge path.

## Harakiri-Owned Direct Kubernetes Path

Harakiri uses Kubernetes directly only for platform operations outside normal
sandbox interaction:

- Applying and updating Harakiri, Keycloak, PostgreSQL, registry, OpenSandbox,
  ingress, and certificate manifests.
- Running template builder Jobs in the Harakiri namespace.
- Reading template builder Job logs from the Harakiri namespace.
- Creating short-lived runtime image pull preflight Pods in the configured
  runtime namespace before marking a template version ready.
- Creating optional pre-pull Pods to warm node image cache for templates marked
  `hot`, `prepull`, or `warm`.

## Explicit Non-Boundaries

Harakiri should not use direct Kubernetes access for normal sandbox terminal
commands, filesystem UI, metrics UI, sandbox runtime logs, route exposure, or
sandbox lifecycle. Those paths must go through OpenSandbox APIs so the
OpenSandbox provider remains the source of runtime behavior and OSS operators do
not need to grant broad sandbox pod permissions to the Harakiri API.

OpenSandbox itself may need provider-side Kubernetes permissions to implement
those APIs. In the k0s manifests, `opensandbox-server-diagnostics` grants only
`get` on `pods/log` in the `opensandbox` dataplane namespace to the
`opensandbox-system/opensandbox-server` service account. This is provider RBAC,
not a Harakiri runtime escape hatch.

## Verification

Use these checks when changing runtime integration:

```bash
rg -n "pods/exec|readNamespacedPodLog|runInSandboxPod|kubernetes\\.exec" apps/api/src docs infra/k8s
pnpm --filter @harakiri/api test
pnpm --filter @harakiri/api typecheck
OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm smoke
OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm smoke:route
```

Remaining direct Kubernetes references should be builder, preflight, pre-pull,
deployment, or documentation references only.
