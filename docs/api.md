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
