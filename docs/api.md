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
- `POST /v1/templates`
- `GET /v1/templates/:id`
- `GET /v1/templates/:id/versions`
- `POST /v1/templates/:id/builds`
- `GET /v1/template-builds`
- `GET /v1/template-builds/:id`
- `GET /v1/template-builds/:id/logs`
- `POST /v1/template-builds/:id/cancel`
- `POST /v1/template-builds/:id/retry`
- `POST /v1/templates/:id/promote`
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

The `template` field accepts a template ID, template name, template alias,
template version ID, or version alias. The sandbox response includes
`templateVersionId` and `templateImageDigest` when the selected version has
those fields.

## Templates

List templates:

```bash
curl http://127.0.0.1:18082/v1/templates \
  -H "x-api-key: $HK_KEY"
```

Supported filters:

- `q`: template ID, name, or alias search.
- `visibility`: `public`, `private`, `internal`, or `all`.
- `status`: template status or `all`.
- `limit`: `1..200`.
- `offset`: pagination offset.

Create a template definition:

```bash
curl http://127.0.0.1:18082/v1/templates \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "id": "open-agents-dev",
    "name": "open-agents-dev",
    "image": "ubuntu:24.04",
    "aliases": ["open-agents-dev"],
    "visibility": "private",
    "defaultEntrypoint": ["sleep", "3600"],
    "cpuCount": 2,
    "memoryMb": 2048,
    "workdir": "/workspace",
    "defaultPorts": [3000, 5173, 4321, 8000],
    "runtimeFamily": "custom"
  }'
```

Inspect a template and its versions:

```bash
curl http://127.0.0.1:18082/v1/templates/open-agents-dev \
  -H "x-api-key: $HK_KEY"

curl http://127.0.0.1:18082/v1/templates/open-agents-dev/versions \
  -H "x-api-key: $HK_KEY"
```

## Template Builds

Create a build record:

```bash
curl http://127.0.0.1:18082/v1/templates/open-agents-dev/builds \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "sourceType": "dockerfile",
    "dockerfilePath": "Dockerfile",
    "imageDestination": "registry.example.com/harakiri/open-agents-dev:dev",
    "metadata": { "localPath": "." }
  }'
```

List, inspect, and read logs:

```bash
curl "http://127.0.0.1:18082/v1/template-builds?status=queued&q=open-agents-dev" \
  -H "x-api-key: $HK_KEY"

curl http://127.0.0.1:18082/v1/template-builds/bld_... \
  -H "x-api-key: $HK_KEY"

curl http://127.0.0.1:18082/v1/template-builds/bld_.../logs \
  -H "x-api-key: $HK_KEY"
```

Cancel, retry, and promote:

```bash
curl -X POST http://127.0.0.1:18082/v1/template-builds/bld_.../cancel \
  -H "x-api-key: $HK_KEY"

curl -X POST http://127.0.0.1:18082/v1/template-builds/bld_.../retry \
  -H "x-api-key: $HK_KEY"

curl -X POST http://127.0.0.1:18082/v1/templates/open-agents-dev/promote \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"versionId":"tplv_...","alias":"stable"}'
```

Current v1 API behavior persists build records and logs. The k0s BuildKit worker
that consumes queued records and writes digest-pinned ready versions is tracked
in the active custom template execution plan.

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
