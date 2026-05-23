# Architecture

Harakiri Sandbox is a thin product and control plane around OpenSandbox.

## Components

- Web app: high-fidelity React dashboard based on `sandbox_mockups/`.
- Control-plane API: Fastify service that owns orgs, API keys, sandbox records, routing, schedules, usage, and audit events.
- Scheduler: worker process that kills expired sandboxes and records lifecycle events.
- PostgreSQL: source of truth for control-plane data.
- Keycloak: OIDC identity provider for browser users.
- OpenSandbox: runtime provider for sandbox lifecycle.
- CLI: `harakiri` binary using the same `/v1` API as the dashboard.

## Data Flow

1. A Keycloak session or API key authenticates to the Harakiri API.
2. The API writes control-plane intent to PostgreSQL.
3. The API calls OpenSandbox for sandbox lifecycle operations.
4. Command execution uses Kubernetes `pods/exec` against the OpenSandbox sandbox pod.
5. The scheduler reconciles provider state, TTL, and idle schedules.
6. The web app and CLI read the persisted control-plane state.

## Database

The schema is in `db/migrations/001_control_plane.sql` and includes:

- `users`
- `organizations`
- `memberships`
- `api_keys`
- `templates`
- `sandboxes`
- `sandbox_events`
- `sandbox_routes`
- `sandbox_schedules`
- `sandbox_metrics`
- `egress_rules`
- `audit_events`

## Authentication

The API accepts:

- Keycloak JWTs validated through the realm JWKS endpoint.
- Hashed Harakiri API keys with `hk_live_` and `hk_test_` prefixes.

The deployed prototype keeps `AUTH_DEV_ALLOW=1` so bootstrap smoke tests can run while the realm is first imported. Disable it for stricter testing.

## OpenSandbox Adapter

`apps/api/src/opensandbox.ts` isolates provider calls. It uses the OpenSandbox `/v1/sandboxes` lifecycle API for create/list/get/delete/renew and Kubernetes `pods/exec` for command execution inside the sandbox container.

## Sandbox Routes

Routes are stored in `sandbox_routes` with provider metadata: `route_key`, `host`, `url`, `state`, `provider`, and `provider_route_id`. A route is created explicitly by `POST /v1/sandboxes/:id/routes` and is idempotent for `(sandbox_id, port)`.

The deployed k0s path uses the official OpenSandbox ingress gateway in header/host mode:

1. Harakiri derives a DNS-safe route key from the OpenSandbox provider ID and port.
2. Harakiri returns `https://<route-key>.harakiri.io`.
3. `ingress-nginx` forwards wildcard `*.harakiri.io` traffic to `opensandbox-ingress-gateway`.
4. OpenSandbox resolves the host header to the sandbox pod and port.
5. When the sandbox is killed or expires, Harakiri marks its routes `terminated` and OpenSandbox removes the backend.

The route smoke suite verifies both the local gateway path and the public Cloudflare Tunnel path. Exact Cloudflare Tunnel host rules for product services take precedence, while the wildcard rule catches generated sandbox route hosts.

Filesystem and metrics panels are prototype control-plane views where the deployed OpenSandbox runtime does not expose a richer portable API yet. Command execution, lifecycle operations, TTL cleanup, and HTTP route proxying are exercised against the live k0s/OpenSandbox deployment.
