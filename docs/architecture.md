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
- Template builder: k0s worker deployment that consumes queued image-import and
  Dockerfile template build records, writes build logs, pushes Dockerfile images
  with Kaniko, and creates immutable template versions.

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
4. The API checks template CPU, memory, default-port, image registry/prefix, and
   per-organization active-build limits before accepting the build. The
   active-build check counts `queued` and `building` records under a PostgreSQL
   advisory lock.
5. For Dockerfile builds, the CLI uploads a tar+gzip context into
   `template_build_contexts`; the API verifies the archive size and `sha256:`
   digest, then inspects Dockerfile `FROM` references against image policy
   before recording it on the build.
6. The builder claims queued records and streams logs into
   `template_build_logs`.
7. For `sourceType=image`, it resolves the immutable registry digest and writes
   a ready `template_versions` row.
8. For `sourceType=dockerfile`, it creates a Kubernetes Job that exports the
   uploaded context, runs Kaniko, pushes the image to the k0s registry, captures
   the pushed digest, and writes a ready `template_versions` row.
9. Promotion moves aliases such as `latest` or `stable` to the ready version.
10. Sandbox creation resolves a template name, alias, or version ID through
   `resolveTemplate()` and stores the exact version/digest selected.

The currently committed API, CLI, SDK, and dashboard support the definition,
build-record, context-upload, log, cancel, retry, promote, and version-read
surfaces. The k0s builder supports image-import digest resolution and
Dockerfile execution with Kaniko. Git build sources, production registry
credentials, cleanup policy, and scanning remain tracked follow-up work.

## Database

The schema is in `db/migrations/001_control_plane.sql` and includes:

- `users`
- `organizations`
- `memberships`
- `api_keys`
- `templates`
- `template_versions`
- `template_builds`
- `template_build_contexts`
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
