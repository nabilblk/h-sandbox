# API

Base path: `/v1`

Authentication:

```http
x-api-key: hk_live_...
```

or:

```http
Authorization: Bearer <keycloak-jwt>
```

## Endpoints

- `GET /v1/me`
- `GET /v1/templates`
- `GET /v1/sandboxes`
- `POST /v1/sandboxes`
- `GET /v1/sandboxes/:id`
- `DELETE /v1/sandboxes/:id`
- `POST /v1/sandboxes/:id/run`
- `GET /v1/sandboxes/:id/logs`
- `GET /v1/sandboxes/:id/files`
- `GET /v1/sandboxes/:id/metrics`
- `POST /v1/sandboxes/:id/renew`
- `GET /v1/sandboxes/:id/routes`
- `POST /v1/sandboxes/:id/routes`
- `DELETE /v1/sandboxes/:id/routes/:port`
- `GET /v1/api-keys`
- `POST /v1/api-keys`
- `DELETE /v1/api-keys/:id`
- `GET /v1/usage`
- `GET /v1/org/settings`
- `PATCH /v1/org/settings`

## Create Sandbox

```bash
curl http://127.0.0.1:18082/v1/sandboxes \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"template":"python-3.12-data","ttlSeconds":300}'
```

## Run Command

```bash
curl http://127.0.0.1:18082/v1/sandboxes/sbx_x/run \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"command":"python agent.py","stdin":"agent.py"}'
```

## Expose Port

Routes are explicit and idempotent per sandbox/port. In k0s, Harakiri stores the route in PostgreSQL and uses the OpenSandbox ingress gateway host format. Route creation validates port `1..65535` and enforces `SANDBOX_MAX_ROUTES_PER_SANDBOX` plus `SANDBOX_MAX_ROUTES_PER_ORG`.

```bash
curl http://127.0.0.1:18082/v1/sandboxes/sbx_x/routes \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"port":3000,"protocol":"http"}'
```

Response shape:

```json
{
  "route": {
    "port": 3000,
    "protocol": "http",
    "routeKey": "opensandbox-id-3000",
    "host": "opensandbox-id-3000.harakiri.io",
    "url": "https://opensandbox-id-3000.harakiri.io",
    "targetUrl": "https://opensandbox-id-3000.harakiri.io",
    "state": "ready",
    "provider": "opensandbox-gateway",
    "providerRouteId": "opensandbox-id-3000"
  }
}
```

```bash
curl http://127.0.0.1:18082/v1/sandboxes/sbx_x/routes \
  -H "x-api-key: $HK_KEY"
```
