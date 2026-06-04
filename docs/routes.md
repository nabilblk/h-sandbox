# Sandbox Routes

Harakiri routes expose an HTTP service running inside a sandbox through the
public control-plane contract. The service must listen on `0.0.0.0` inside the
sandbox before the route can serve traffic.

## Access Modes

`public` routes return the provider URL directly. Use them only when the preview
is intentionally reachable by anyone who has the URL.

`token` routes return a Harakiri proxy URL and a one-time route token. The token
is stored only as a hash in the control plane. Later list calls return
`tokenHint`, not the token. Store the token in your application if a long-lived
client needs to reuse the route.

Token routes accept the token in the `x-harakiri-route-token` header. Browser
opens can also use the `harakiri_route_token` query parameter, but this can put
the token into browser history and logs. Prefer headers for SDK and server
integrations.

## Readiness

Route creation records the provider readiness state as `ready`, `provisioning`,
or `unhealthy`. That state tells you whether the provider route exists. It does
not prove the application inside the sandbox has finished booting.

For application readiness, start the server, expose the port, then poll an HTTP
path:

```bash
harakiri run sbx_... --cmd "python -m http.server 3000 --bind 0.0.0.0 >/tmp/http.log 2>&1 &"
harakiri expose sbx_... --port 3000 --wait --wait-path /
```

```ts
const route = await harakiri.routes.exposeAndWait(sandbox.id, {
  port: 3000,
  accessMode: "token",
  labels: ["preview"]
}, {
  path: "/health",
  timeoutMs: 30_000
});

const response = await harakiri.routes.fetch(route)("/health");
```

## Adapter Caches

Some integrations need synchronous `domain(port)` behavior. Pre-expose routes
before handing a sandbox to that adapter, then cache the returned route summary
by sandbox ID and port.

Route summaries include `port`, `protocol`, `url`, `host`, `targetUrl`,
`accessMode`, `labels`, `tokenHint`, `createdByLabel`, `routeKey`, provider
metadata, readiness state, `createdAt`, `lastCheckedAt`, `lastUsedAt`, and
`terminatedAt`. Token values are returned only on creation.

## CLI

```bash
harakiri expose sbx_... --port 5173 --access token --label vite --wait --wait-path /
harakiri routes sbx_...
harakiri open sbx_... --port 5173 --token "$HARAKIRI_ROUTE_TOKEN"
harakiri unexpose sbx_... --port 5173
```

Use `--json` on `expose` or `routes` when another tool needs to parse the
response.

## Cleanup

Delete routes when a preview is no longer needed:

```bash
harakiri unexpose sbx_... --port 5173
```

Sandbox termination also disables its active route records. Historical route
rows keep enough metadata for audit and troubleshooting without exposing route
tokens.
