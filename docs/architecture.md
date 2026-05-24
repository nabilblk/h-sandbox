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
- Template builder: k0s worker deployment that consumes queued image-import
  template build records and writes immutable template versions. Dockerfile/Git
  builds still need the BuildKit worker phase.

## Data Flow

1. A Keycloak session or API key authenticates to the Harakiri API.
2. The API writes control-plane intent to PostgreSQL.
3. The API calls OpenSandbox for sandbox lifecycle operations.
4. Command execution uses Kubernetes `pods/exec` against the OpenSandbox sandbox pod.
5. The scheduler reconciles provider state, TTL, and idle schedules.
6. The web app and CLI read the persisted control-plane state.

## Template Build Subsystem

Templates are a separate control-plane subsystem from live sandboxes:

1. A user creates a template definition from the CLI, API, or dashboard.
2. Harakiri stores the definition in `templates` and creates an initial
   `template_versions` row for image-based definitions.
3. A user enqueues a build in `template_builds`.
4. The image-import builder claims queued `sourceType=image` records, streams
   logs into `template_build_logs`, resolves the immutable registry digest, and
   writes a ready `template_versions` row.
5. The planned BuildKit builder will claim Dockerfile/Git records, build or
   import the image, push it to a registry, resolve the immutable digest, and
   write a ready `template_versions` row.
6. Promotion moves aliases such as `latest` or `stable` to the ready version.
7. Sandbox creation resolves a template name, alias, or version ID through
   `resolveTemplate()` and stores the exact version/digest selected.

The currently committed API, CLI, SDK, and dashboard support the definition,
build-record, log, cancel, retry, promote, and version-read surfaces. The actual
k0s image-import worker supports digest resolution for existing OCI images. The
BuildKit worker, registry cache, and Dockerfile/Git context handling are tracked
as the next infrastructure phase.

## Database

The schema is in `db/migrations/001_control_plane.sql` and includes:

- `users`
- `organizations`
- `memberships`
- `api_keys`
- `templates`
- `template_versions`
- `template_builds`
- `template_build_logs`
- `template_registry_credentials`
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

For templates, the adapter receives the resolved runtime template: image URI,
entrypoint, CPU, memory, TTL, name, and Harakiri metadata. Once the builder
phase writes digest-pinned versions, the adapter should prefer digest-pinned
image references and pass registry auth/workdir/env when OpenSandbox supports
those fields.

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
