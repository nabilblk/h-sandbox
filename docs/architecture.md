# Architecture

Harakiri Sandbox is a thin product and control plane around OpenSandbox.

## Components

- Web app: high-fidelity React dashboard based on `sandbox_mockups/`.
- Control-plane API: Fastify service that owns orgs, API keys, sandbox records, routing, schedules, usage, and audit events.
- Scheduler: worker process that kills expired sandboxes, records lifecycle
  events, and runs template retention cleanup.
- PostgreSQL: source of truth for control-plane data.
- Keycloak: OIDC identity provider for browser users.
- OpenSandbox: runtime provider for sandbox lifecycle.
- CLI: `harakiri` binary using the same `/v1` API as the dashboard.
- Template builder: k0s worker deployment that consumes queued image-import and
  Dockerfile template build records, writes build logs, pushes Dockerfile images
  with rootless BuildKit by default, and creates immutable template versions.

## Target OSS Module Map

The current prototype is being refactored toward a small set of explicit
subsystems. The first contract definitions live in source control even before
all call sites are migrated, so contributors can see the intended boundaries:

| Subsystem | Current primary files | Target boundary |
|-----------|-----------------------|-----------------|
| Runtime provider | `apps/api/src/opensandbox.ts` | `RuntimeProvider` in `apps/api/src/providers/runtime/provider.ts`, with OpenSandbox as the default implementation |
| Image builder | `apps/api/src/template-builder.ts` | `ImageBuilder` in `apps/api/src/builders/image-builder.ts`, with rootless BuildKit as the default and Kaniko isolated as legacy |
| Build artifacts | `template_build_contexts`, `template_build_logs`, `apps/api/src/build-context.ts`, `apps/api/src/build-logs.ts` | `BlobStore` and `BuildLogStore` in `apps/api/src/storage/` |
| Auth provider | `apps/api/src/auth.ts` | OIDC verification through `OidcProviderConfig` and an API-key authenticator service |
| Audit | `apps/api/src/audit.ts` | `AuditSink` in `apps/api/src/providers/audit/audit-sink.ts` |
| API domains | `apps/api/src/routes.ts`, `apps/api/src/routes/template-builds.ts` | Small domain routers and services for sandboxes, routes, templates, builds, registry credentials, API keys, usage, and settings |
| Scheduler | `apps/api/src/scheduler.ts` | Worker services that depend on provider interfaces and reconcile persisted control-plane intent |
| Web app | `apps/web/src/main.tsx` | Route modules and feature components that preserve the current visual design |
| CLI | `packages/cli/src/index.ts` | Command modules backed by the SDK request layer |
| SDK and contracts | `packages/sdk/src/index.ts`, `packages/shared/src/index.ts` | Shared request/response contracts consumed by API, web, CLI, and SDK |
| Deployment examples | `infra/k0s/`, `infra/scripts/`, `infra/scripts/env/harakiri/` | Generic local/k0s examples separated from harakiri.io-specific scripts |

The extension interfaces above are internal implementation contracts until the
refactor stabilizes. The public user-facing contracts remain the HTTP API, SDK,
CLI, and documented template/runtime behavior.

## Data Flow

1. A Keycloak session or API key authenticates to the Harakiri API.
2. The API writes control-plane intent to PostgreSQL.
3. The API calls OpenSandbox for sandbox lifecycle operations.
4. Terminal commands, filesystem metadata, metrics, logs, and HTTP route
   targets use OpenSandbox APIs. For the sandbox data plane, Harakiri resolves
   the OpenSandbox `execd` endpoint on port `44772` and calls that endpoint
   with the returned access headers.
5. The scheduler reconciles provider state, TTL, idle schedules, and template
   retention cleanup.
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
5. For Dockerfile builds, the CLI uploads a tar+gzip context through
   `BlobStore`; the API verifies the archive size and `sha256:` digest, then
   inspects Dockerfile `FROM` references against image policy before recording
   it on the build. PostgreSQL remains the active compatibility implementation.
6. The builder claims queued records and streams logs through `BuildLogStore`.
7. For `sourceType=image`, it resolves the immutable registry digest and writes
   a ready `template_versions` row.
8. For `sourceType=dockerfile`, it creates a Kubernetes Job that exports the
   uploaded context, runs rootless BuildKit, pushes the image to the k0s
   registry, captures the pushed digest from plain BuildKit output, and writes
   a ready `template_versions` row.
9. Before the ready version is inserted, the builder creates a short-lived
   runtime pull preflight Pod in the configured namespace and waits until the
   digest-pinned image has either started or reached a post-pull container
   state. Image pull failures keep the build failed instead of creating a ready
   version.
10. When optional hot-template pre-pull is enabled, templates tagged `hot`,
   `prepull`, or `warm` create one disposable pull Pod per ready Kubernetes
   node after preflight succeeds. This warms node image cache for the next
   OpenSandbox start and stores `runtimeImagePrepull` metadata, but it does not
   create a pre-started sandbox pool.
11. Before the ready version is inserted, the builder calls the configured
   external scanner webhook when `TEMPLATE_SCANNER_WEBHOOK_URL` is set and
   persists the returned `scan_status` and `scan_summary`; otherwise it records
   `not_scanned`.
12. The scheduler retention pass deletes old build logs, uploaded context
    archives, unversioned terminal build rows, and completed builder Jobs. It
    retires old ready template versions only when they are not latest/stable and
    no active sandbox is using them. Retention still needs to move fully behind
    the storage interfaces.
13. Promotion moves aliases such as `latest` or `stable` to the ready version.
13. Sandbox creation resolves a template name, alias, or version ID through
   `resolveTemplate()` and stores the exact version/digest selected.

The currently committed API, CLI, SDK, and dashboard support the definition,
build-record, context-upload, log, cancel, retry, promote, and version-read
surfaces. The k0s builder supports image-import digest resolution and
Dockerfile execution with rootless BuildKit, while Kaniko remains an explicit
legacy compatibility provider. Template versions carry SBOM references,
provenance JSON, scan status, and scan summary fields. The builder supports an
operator-owned scanner webhook, runtime pull preflight, and a scheduler-owned
retention policy; production scanner service selection, signing, Git build
sources, production registry credentials, and registry blob garbage collection
remain tracked follow-up work.

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
- `template_registry_credentials`: org-scoped registry host, purpose,
  repository prefix, external Secret references, and optional encrypted secret
  material for private registry integration.
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

Runtime behavior is accessed through the `RuntimeProvider` contract in
`apps/api/src/providers/runtime/provider.ts`. The default implementation is the
OpenSandbox provider under `apps/api/src/providers/runtime/`.

`apps/api/src/providers/runtime/opensandbox-transport.ts` isolates provider
transport calls. It uses the
OpenSandbox `/v1/sandboxes` lifecycle API for create/list/get/delete/renew.
For normal sandbox interaction, it resolves the OpenSandbox `execd` endpoint
with `GET /v1/sandboxes/:id/endpoints/44772?use_server_proxy=true`, then calls
`execd` for commands, filesystem access, and metrics using the endpoint URL and
headers returned by OpenSandbox. Filesystem access uses OpenSandbox
`/files/search` first and falls back to an `execd` directory-listing command
when the provider search endpoint cannot handle a path such as `/`. Runtime logs
come from OpenSandbox diagnostics
when available; for OpenSandbox versions where the stable scoped diagnostics API
returns `501`, Harakiri falls back to the provider's deprecated plain-text
diagnostics endpoint. Runtime logs are combined with Harakiri control-plane
events by the API route layer.

In OpenSandbox gateway/header mode, endpoint resolution returns an
`OpenSandbox-Ingress-To` routing header. Harakiri sends `execd` requests to the
configured internal OpenSandbox ingress gateway service
(`OPEN_SANDBOX_GATEWAY_URL`) with that returned header, avoiding the public edge
path for control-plane-to-runtime traffic.

Harakiri does not use Kubernetes `pods/exec` or direct sandbox pod logs for
normal terminal, filesystem, metrics, or logs behavior. Direct Kubernetes API
use remains limited to platform operations that OpenSandbox does not own for
Harakiri: applying deployment manifests, managing template builder Jobs in the
Harakiri namespace, and creating short-lived template runtime pull preflight or
optional pre-pull Pods in the configured runtime namespace.

The k0s manifests grant `pods/log` only to the OpenSandbox server service
account in the OpenSandbox dataplane namespace so OpenSandbox can serve its own
diagnostics endpoint. Harakiri's service account does not receive that
permission.

For contributor and test environments that should not call a runtime, set
`HARAKIRI_RUNTIME_PROVIDER=dev` or `RUNTIME_PROVIDER=dev`. This enables the
in-memory runtime provider and keeps terminal, filesystem, logs, metrics, and
route surfaces available without OpenSandbox. The deployed k0s example uses the
OpenSandbox provider with fallback disabled.

For templates, the adapter receives the resolved runtime template: image URI,
entrypoint, CPU, memory, TTL, name, sandbox env, organization ID, and Harakiri
metadata. The adapter sends label-safe metadata for Harakiri sandbox ID,
organization ID, template ID, template version ID, image digest, template
workdir, selected registry credential ID, and the current route policy so
provider-side objects remain traceable to the control plane. It uses
digest-pinned image references when template versions have digests. If a
matching encrypted pull credential exists, the adapter passes OpenSandbox
`image.auth`. The current OpenSandbox lifecycle API supports env and image
auth, but not a create-time workdir field; Harakiri therefore treats Dockerfile
`WORKDIR` plus template smoke checks as the effective workdir contract.

## Sandbox Routes

Routes are stored in `sandbox_routes` with provider metadata: `route_key`, `host`, `url`, `state`, `provider`, and `provider_route_id`. A route is created explicitly by `POST /v1/sandboxes/:id/routes` and is idempotent for `(sandbox_id, port)`.

The k0s path uses the official OpenSandbox ingress gateway in header/host mode:

1. Harakiri derives a DNS-safe route key from the OpenSandbox provider ID and port.
2. Harakiri returns `https://<route-key>.<sandbox-route-base-domain>`.
3. `ingress-nginx` forwards wildcard sandbox-route traffic to
   `opensandbox-ingress-gateway`.
4. OpenSandbox resolves the host header to the sandbox pod and port.
5. When the sandbox is killed or expires, Harakiri marks its routes `terminated` and OpenSandbox removes the backend.

The portable route smoke suite verifies the local OpenSandbox gateway path and
local k0s ingress path. Public DNS, tunnel, and edge-certificate checks belong
to environment-specific scripts such as the harakiri.io example under
`infra/scripts/env/harakiri/`.

Filesystem and metrics panels use OpenSandbox `execd` APIs. Directory display
is derived from `files/search` results when possible. Because the current
portable OpenSandbox API searches files rather than exposing a first-class
directory listing endpoint, Harakiri falls back to an `execd` directory-listing
command for paths where provider search fails, such as recursive root searches
that hit system files with unknown owners.
Command execution, lifecycle operations, TTL cleanup, diagnostics, metrics, and
HTTP route proxying are exercised against the live k0s/OpenSandbox deployment.

See `docs/opensandbox-boundaries.md` for the current boundary contract between
OpenSandbox-owned runtime behavior and Harakiri's direct Kubernetes operations.
