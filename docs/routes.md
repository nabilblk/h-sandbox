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

The TypeScript SDK has preserved Request method/body/headers, confined route
credentials to the origin/path and forced manual redirects since rc.11. These
safeguards are included in rc.13. Older rc.10 consumers need explicit redirect
rejection and trusted relative paths. See the
[SDK route contract](https://sb.harakiri.io/#docs/typescript-sdk?section=protected-services).

**New source candidate:** incremental service HTTP, generic application
WebSockets and Python route helpers described below are not delivered by rc.13
or Python 0.1.0rc1. Use matching source builds for evaluation; native provider and
OpenWebUI qualification remains open. Existing native Harakiri PTY is a different
protocol and does not establish application WebSocket support.

The `tokenRoutes` entry in `/v1/runtime/capabilities` reports route-exposure
availability, not an end-to-end WebSocket ingress check. A deployment proxy may
still reject upgrades or impose shorter timeouts. Test application HTTP and
WebSocket access through the returned public route, never a pod address, and
keep authentication failures explicit rather than falling back to a public route.

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
  timeoutMs: 30_000,
  fetch: (url, init) => fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(3000) })
});

const response = await harakiri.routes.fetch(route)("/health", { redirect: "error", signal: AbortSignal.timeout(5000) });
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

## Protected Service Transport (Source Candidate)

The API proxies GET/HEAD/POST/PUT/PATCH/DELETE/OPTIONS under the returned token
route URL. It preserves raw request bytes and application status/MIME/range
headers, and forwards responses incrementally with backpressure. It does not
parse multipart, decompress responses or replay a request. The generic service
endpoint is **not** the JSON/base64 filesystem API; that API's buffering contract
is unchanged. Public routes still bypass this proxy and retain provider behavior.

HTTP `Authorization` belongs to the sandbox application. Supply its credential
separately from `x-harakiri-route-token`. The control-plane key is used only to
create/list/delete routes and is never injected into service traffic. Cookies,
forwarded-host headers and caller-supplied provider routing headers are removed.
Persist only the public URL, route key/header and original grant, not provider
addresses. Losing a one-time grant requires explicit route revocation/recreation;
listing the route cannot recover it.

The proxy never follows redirects. Same-service redirects are rewritten beneath
the route prefix; other destinations fail. Browser documents receive an opaque
origin via CSP `sandbox allow-scripts allow-forms allow-downloads`, no cookies,
`nosniff`, no-referrer and private/no-store. This restricted service surface is
not unrestricted web hosting. A downstream chat proxy must retain equivalent
isolation; MIME checks and file-browser roots are not authorization boundaries.

### WebSocket Connection

Pass the scoped URL and headers to a server-side WebSocket library. No grant is
placed in the URL or a subprotocol. The candidate supports text/binary frames,
not subprotocol negotiation or per-message compression. Browser WebSocket APIs
cannot supply these headers; connect through your authenticated backend rather
than distributing a service grant to the browser.

```typescript
import WebSocket from "ws";

const connection = route.webSocketRequest("/events", {
  headers: { authorization: `Bearer ${applicationKey}` }
});
const socket = new WebSocket(connection.url, { headers: connection.headers });
// Own the socket lifecycle; reconnect explicitly after observing failures.
socket.on("error", handleConnectionError);
```

Python's sync/async sandbox handles provide `routes.list`, `routes.expose`,
`routes.delete` and `routes.connect`. The default exposure is protected:

```python
route = sandbox.routes.expose(8000)
route.wait_for_http("/health", timeout=30)
response = route.request("GET", "/report.json")
response.raise_for_status()
report = response.json()
connection = route.connection("/events", websocket=True)
# Give connection.url / connection.headers to your server-side WS client.
```

`route.request` buffers up to the Python client's configured response limit
(24 MiB by default), refuses compressed responses and returns a closed/read
HTTPX response. The client owns and closes its separate service connection pool;
an explicitly injected `service_http_client` remains caller-owned. For streaming,
use `route.connection()` with an independently owned HTTPX streaming context,
finite deadlines and `follow_redirects=False`. Close external streams/sockets
yourself. Harakiri's server byte/time limits still apply. A client disconnect does
not roll back an upload or stop a command already accepted by the application.

### Operator Limits

All settings below are API environment variables. Choose ingress limits that do
not silently defeat the application contract. Values must be positive integers.

| Variable | Default | Meaning |
| --- | --- | --- |
| `SERVICE_PROXY_MAX_REQUEST_BYTES` | 33554432 | 32 MiB transferred request bytes |
| `SERVICE_PROXY_MAX_RESPONSE_BYTES` | 67108864 | 64 MiB transferred response bytes |
| `SERVICE_PROXY_MAX_WS_MESSAGE_BYTES` | 1048576 | 1 MiB per WS message; also bounds the shared WS server |
| `SERVICE_PROXY_MAX_HEADER_BYTES` | 16384 | 16 KiB combined incoming headers / upstream parser limit |
| `SERVICE_PROXY_MAX_CONNECTIONS` | 128 | Active protected connections per API process |
| `SERVICE_PROXY_MAX_CONNECTIONS_PER_ROUTE` | 16 | Active protected connections per route per process |
| `SERVICE_PROXY_CONNECT_TIMEOUT_MS` | 10000 | First upstream response/WS handshake deadline |
| `SERVICE_PROXY_IDLE_TIMEOUT_MS` | 60000 | HTTP socket inactivity / WS message inactivity |
| `SERVICE_PROXY_MAX_LIFETIME_MS` | 3600000 | Maximum single connection lifetime |
| `SERVICE_PROXY_AUTH_INTERVAL_MS` | 5000 | Revalidation frequency |
| `SERVICE_PROXY_AUTH_TIMEOUT_MS` | 5000 | Revalidation deadline, fail closed |

Admission is per process, not organization sandbox capacity or a distributed
rate limiter. Apply a trusted edge limit as well for multi-replica deployments.
WS ping/pong is not application activity and does not keep an idle connection
alive. Nothing in this transport renews sandbox TTL.

New requests reject absent/deleted/expired/non-running runtimes. Open connections
recheck the grant and runtime every five seconds. Revocation is observed within
the configured interval plus authorization timeout (10 seconds by default),
subject to process scheduling, then connections close; WebSockets have at most
one further second for their close handshake. Database outages fail closed.
Deleting a route or terminating/expiring the runtime revokes it; revoking the
API key used to create it does not revoke an independent route grant.

Errors before headers use stable `route_proxy_*` JSON codes. Oversized requests
return 413, admission 429, invalid headers 431, unsupported WS subprotocol 501,
upstream/redirect/response-size failures 502, unavailable authorization 503,
and deadlines 504. A limit/revocation/disconnect **after** headers interrupts the
stream; it cannot replace an already-sent response with JSON. Treat partial bytes
as incomplete and verify results before retrying side effects.

The optional [OpenWebUI reference adapter](../integrations/openwebui/README.md)
exercises this general contract. It does not add chat semantics to the core.

### Database Upgrade

Candidate migration `040_protected_route_uniqueness.sql` allows protected routes
to share the API hostname. Each active route key remains globally unique, each
active sandbox/port pair remains unique, and public hostnames remain unique among
active public routes. Terminated route history does not block replacement.

Before upgrading an existing database, check for ambiguous active route keys:

```sql
SELECT route_key, count(*)
FROM sandbox_routes
WHERE state <> 'terminated' AND route_key IS NOT NULL
GROUP BY route_key
HAVING count(*) > 1;
```

The expected result is zero rows. If duplicates exist, inspect ownership and
revoke the unintended routes through the API before upgrading. The migration
fails rather than silently deleting routes or choosing which grant to trust.
