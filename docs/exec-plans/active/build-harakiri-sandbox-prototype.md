# Execution Plan: Build Harakiri Sandbox Working Prototype

**Created**: 2026-05-22
**Author**: Codex
**Status**: Complete
**Priority**: {P0-P3}
**Estimated effort**: 7-10 engineering days

## Context
The workspace currently contains a static React prototype in `sandbox_mockups/` for a Harakiri Sandbox platform: a product wrapper on top of OpenSandbox with a polished developer experience. The mockups define the intended flow and visual language across landing, onboarding, dashboard, sandbox detail, docs, templates, usage, API keys, and settings.

The product must become a working prototype, not only a clickable UI. Authentication will be managed by Keycloak. Control-plane data must live in PostgreSQL, including API keys, scheduling, routing, sandbox lifecycle records, templates, organization settings, and usage telemetry. The target runtime is a fresh k0s Kubernetes cluster that must be installed, used for deployment, and used for self-verification.

Because the current repo has mockup assets only, this plan assumes a new implementation scaffold will be created around those assets.

Primary source context:
- `sandbox_mockups/app.jsx`
- `sandbox_mockups/components/landing.jsx`
- `sandbox_mockups/components/onboarding.jsx`
- `sandbox_mockups/components/dashboard.jsx`
- `sandbox_mockups/components/sandbox-detail.jsx`
- `sandbox_mockups/components/docs.jsx`
- `sandbox_mockups/styles.css`
- `sandbox_mockups/styles-app.css`
- `sandbox_mockups/styles-landing.css`
- `sandbox_mockups/styles-ds.css`
- `sandbox_mockups/screenshots/*.png`
- OpenSandbox lifecycle and exec APIs: https://open-sandbox.ai/specs/readme
- OpenSandbox project/runtime overview: https://open-sandbox.ai/zh/overview/home
- k0s/k0sctl installation reference: https://docs.k0sproject.io/head/k0sctl-install/

## Success Criteria
- [x] A fresh k0s cluster is installed and reachable through `kubectl`, with a documented kubeconfig and repeatable bootstrap script.
- [x] PostgreSQL is deployed and migrations create all control-plane tables for orgs, memberships, API keys, templates, sandboxes, routes, schedules, metrics, audit events, and egress rules.
- [x] Keycloak is deployed and configured with a Harakiri realm/client, and the web/API services validate OIDC sessions or JWTs against Keycloak.
- [x] OpenSandbox is deployed or connected from the cluster, and the Harakiri API can create, list, inspect, execute commands in, renew, and kill sandboxes through OpenSandbox.
- [x] The web app preserves high visual fidelity to `sandbox_mockups/`, including typography, colors, spacing, sidebar/table/detail layouts, terminal styling, modal behavior, and docs layout.
- [x] The dashboard surfaces real control-plane data instead of static mock data for sandboxes, templates, usage, API keys, org settings, detail views, logs, metrics, filesystem, and network routes.
- [x] The CLI named `harakiri` supports the flows shown in the provided terminal mockup: create, run with stdin/file input, list/status, logs, kill, and API key login/config.
- [x] The scheduler enforces idle TTL and records lifecycle/audit events; expired sandboxes are killed through OpenSandbox.
- [x] Routing records are created for exposed sandbox ports and can be resolved from the dashboard/API; prototype routing works through the cluster ingress or port-forwarded gateway.
- [x] End-to-end tests run against the deployed k0s environment and prove onboarding, API key creation, CLI sandbox create/run/kill, dashboard refresh, and detail-page inspection.
- [x] Playwright screenshots are captured for the implemented app and compared against the mockup screenshots for visual regressions.
- [x] A short runbook documents local development, cluster bootstrap, deployment, smoke testing, and teardown.

## Phases

### Phase 1: Product And Architecture Baseline
**Status**: Complete
- [x] Inventory every mockup route, component, design token, screenshot, and interaction in `sandbox_mockups/`.
- [x] Decide and document the implementation stack before coding.
- [x] Scaffold the repository as a working monorepo.
- [x] Define service boundaries: web app, control-plane API, background scheduler, CLI, database migrations, and Kubernetes deployment assets.
- [x] Define the public API surface that the CLI and dashboard will call.
- [x] Document prototype constraints and any feature intentionally mocked or deferred.

Recommended stack:
- Web: Next.js or Vite React with the mockup CSS tokens ported directly.
- API: TypeScript Fastify/NestJS or Python FastAPI. Prefer TypeScript if choosing a single-language stack for web, API, and CLI.
- Database: PostgreSQL with Prisma or Drizzle migrations.
- Auth: Keycloak OIDC for browser sessions and JWT validation; hashed API keys for CLI/service access.
- CLI: Node.js TypeScript package exposing a `harakiri` binary.
- Deployment: Kubernetes manifests or Helm chart under `infra/k8s/`, with `infra/k0s/` bootstrap scripts.

### Phase 2: Fresh k0s Cluster Bootstrap
**Status**: Complete
- [x] Verify host capabilities. On macOS, provision a Linux VM with Lima, Multipass, or another local VM runner because k0s itself runs on Linux.
- [x] Install `k0sctl` or direct `k0s` binaries using current official k0s documentation.
- [x] Create a fresh single-node k0s cluster suitable for prototype testing.
- [x] Export kubeconfig to a repo-local ignored path and verify `kubectl get nodes`.
- [x] Install required cluster add-ons: ingress controller, metrics server if needed, local-path storage or equivalent default storage class, and cert-manager only if TLS is in scope.
- [x] Create namespaces for `harakiri`, `keycloak`, `opensandbox`, and shared infrastructure as appropriate.
- [x] Add `infra/k0s/bootstrap.sh`, `infra/k0s/verify.sh`, and `infra/k0s/teardown.sh` scripts.

Verification gate:
- [x] `kubectl get nodes` reports the fresh k0s node as Ready.
- [x] A sample workload can be deployed, reached, and removed.

### Phase 3: Database, Auth, And Control-Plane Schema
**Status**: Complete
- [x] Add PostgreSQL deployment for cluster and local development.
- [x] Add migration tooling and seed data matching the mockup organization `lyra-labs`, templates, and sample sandbox states.
- [x] Model core tables:
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
- [x] Store API keys as one-time plaintext display plus hashed persistent value.
- [x] Deploy Keycloak with a Harakiri realm, web client, CLI/API client as needed, and bootstrap test users.
- [x] Implement API auth middleware for Keycloak JWTs and `hk_live_...` / `hk_test_...` API keys.
- [x] Add tenant scoping by organization for every control-plane query.

Verification gate:
- [x] Migrations run from zero against PostgreSQL.
- [x] Keycloak browser login flow is wired end-to-end in the web app.
- [x] API key auth can access only the owning organization.

### Phase 4: OpenSandbox Integration And Lifecycle API
**Status**: Complete
- [x] Deploy or connect OpenSandbox in the k0s cluster.
- [x] Configure OpenSandbox credentials through Kubernetes secrets.
- [x] Implement a provider adapter around OpenSandbox lifecycle endpoints:
  - create sandbox
  - list sandboxes
  - get sandbox details
  - delete sandbox
  - renew expiration
  - pause/resume if supported in the deployed runtime
  - get access endpoint for a port
- [x] Implement real exec adapter calls for command execution, streaming output, filesystem operations, and metrics where available.
- [x] Persist every sandbox lifecycle transition in PostgreSQL.
- [x] Add a reconciliation job that syncs OpenSandbox state back into the Harakiri control plane.
- [x] Add a scheduler worker that kills idle or expired sandboxes and records audit events.
- [x] Add routing records for exposed sandbox ports and surface them through API/dashboard.

API endpoints for prototype:
- [x] `GET /v1/sandboxes`
- [x] `POST /v1/sandboxes`
- [x] `GET /v1/sandboxes/:id`
- [x] `DELETE /v1/sandboxes/:id`
- [x] `POST /v1/sandboxes/:id/run`
- [x] `GET /v1/sandboxes/:id/logs`
- [x] `GET /v1/sandboxes/:id/files`
- [x] `GET /v1/sandboxes/:id/metrics`
- [x] `POST /v1/sandboxes/:id/renew`
- [x] `GET /v1/sandboxes/:id/routes`
- [x] `GET /v1/templates`
- [x] `POST /v1/api-keys`
- [x] `GET /v1/api-keys`
- [x] `DELETE /v1/api-keys/:id`
- [x] `GET /v1/usage`
- [x] `GET /v1/org/settings`
- [x] `PATCH /v1/org/settings`

Verification gate:
- [x] A sandbox can be created through the Harakiri API and appears in both PostgreSQL and OpenSandbox.
- [x] A command can run inside the sandbox and return stdout/stderr/exit code.
- [x] A sandbox can be killed and reconciled to terminated state.

### Phase 5: High-Fidelity Web Application
**Status**: Complete
- [x] Port the mockup design tokens exactly: background, surface, ink, muted colors, accent, status colors, radius, shadows, Hanken Grotesk/JetBrains Mono stack, table density, terminal chrome, and button styles.
- [x] Build application routing for:
  - landing
  - onboarding
  - dashboard/sandboxes
  - dashboard/templates
  - dashboard/metrics
  - dashboard/keys
  - dashboard/settings
  - sandbox detail
  - docs
- [x] Replace mock data with API calls while preserving loading, empty, error, and optimistic states.
- [x] Implement Keycloak sign-in/sign-out and protect dashboard/detail/settings routes.
- [x] Implement onboarding:
  - account step reads Keycloak user profile
  - workspace/org defaults are saved to the control plane
  - API key is created and displayed once
  - first sandbox flow calls the real API
- [x] Implement dashboard sandboxes table with filters, search, status counts, refresh, and create modal.
- [x] Implement sandbox detail tabs for terminal, filesystem, logs, metrics, and network.
- [x] Implement API key create/reveal-once/copy/revoke behavior.
- [x] Implement usage charts from persisted metrics.
- [x] Implement settings update for org name, slug, idle TTL, max concurrency, and kill-all action.
- [x] Implement docs pages with working examples that match the actual CLI/API names.
- [x] Capture screenshots for each page at desktop and mobile widths.

Visual fidelity gate:
- [x] `landing`, `onboarding`, `dashboard`, `sandbox detail`, `usage`, `docs`, and `API keys` screenshots are visually close to the provided mockups.
- [x] No text overlaps, clipped controls, blank panels, broken tables, or missing terminal states at tested breakpoints.

### Phase 6: CLI Prototype
**Status**: Complete
- [x] Create a `harakiri` CLI package with config stored under the user's config directory.
- [x] Implement `harakiri login` for API key or device/OIDC-token flow if feasible with Keycloak.
- [x] Implement `harakiri create --template <id> [--name <name>] [--ttl <seconds>]`.
- [x] Implement `harakiri run <sandbox-id> --stdin <file>` and `harakiri run --stdin agent.py` with create-and-run shortcut behavior if selected.
- [x] Implement `harakiri list`, `harakiri status <id>`, `harakiri logs <id>`, `harakiri files <id>`, and `harakiri kill <id>`.
- [x] Match the terminal mockup tone: concise command echo, muted progress lines, bold sandbox id, green success check, runtime summary, and disk-zeroed lifecycle message.
- [x] Add CLI integration tests against the deployed API.

Verification gate:
- [x] The exact demo flow from the user-provided CLI image works against the k0s-deployed API:
  - `harakiri create --template python-3.12-data`
  - `harakiri run --stdin agent.py`
  - output shows provisioning, sealed id, runtime result, and termination.

### Phase 7: Kubernetes Deployment Packaging
**Status**: Complete
- [x] Add Dockerfiles for web, API, scheduler, and CLI test image if needed.
- [x] Add Kubernetes manifests or Helm chart for:
  - PostgreSQL
  - Keycloak
  - OpenSandbox
  - Harakiri API
  - Harakiri web
  - scheduler worker
  - ingress/gateway
  - secrets/configmaps
  - migration job
  - seed job
- [x] Add image build and load path for local k0s testing.
- [x] Add health checks, readiness probes, resource requests, and basic logs.
- [x] Add environment overlays for local cluster and future production-like settings.
- [x] Document required secrets and generated dev defaults.

Verification gate:
- [x] A single command or short documented sequence deploys the whole stack into the fresh k0s cluster.
- [x] All pods become Ready.
- [x] The web UI and API are reachable through ingress or documented port-forwards.

### Phase 8: End-To-End Verification And Self-Test
**Status**: Complete
- [x] Run unit tests for API, scheduler, and CLI command formatting.
- [x] Run migration tests against a fresh PostgreSQL database.
- [x] Run API integration tests against OpenSandbox on k0s.
- [x] Run Playwright tests for:
  - landing to onboarding
  - Keycloak sign-in
  - workspace creation
  - API key creation
  - sandbox create
  - sandbox detail terminal/logs/files/metrics/network tabs
  - API key revoke
  - settings update
- [x] Run CLI smoke tests against the deployed API.
- [x] Run TTL scheduler smoke test by creating a short-lived sandbox and verifying it is killed.
- [x] Capture final screenshots and store them under a documented artifacts path.
- [x] Produce a test report with commands run, pass/fail status, and known limitations.

Completion gate:
- [x] The working product is deployed in the fresh k0s cluster.
- [x] The CLI demo flow succeeds.
- [x] The web app flow succeeds from login through sandbox creation and inspection.
- [x] The database contains expected control-plane records.
- [x] OpenSandbox contains or contained the expected sandbox workloads.
- [x] All verification commands and URLs are included in the final handoff.

### Phase 9: Runbook And Handoff
**Status**: Complete
- [x] Add `README.md` with product overview and quickstart.
- [x] Add `docs/runbook.md` with local dev, k0s bootstrap, deployment, verification, and teardown.
- [x] Add `docs/architecture.md` with service diagram, data model, auth model, sandbox lifecycle, and routing model.
- [x] Add `docs/api.md` or generated OpenAPI docs.
- [x] Record remaining gaps and production hardening tasks.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-05-22 | Use a full execution plan | Work spans frontend, backend, database, auth, CLI, OpenSandbox integration, cluster install, deployment, and end-to-end testing. | Lightweight plan |
| 2026-05-22 | Treat `sandbox_mockups/` as the visual contract | The user explicitly requested high fidelity to this folder, and the existing static React/CSS defines concrete pages, components, typography, spacing, and interaction flows. | Redesigning the app from scratch |
| 2026-05-22 | Deploy and test on fresh k0s before calling the prototype complete | The target runtime is explicitly k0s, and cluster issues are product issues for this request. | Local-only Docker Compose prototype |
| 2026-05-22 | Use PostgreSQL as the source of truth for Harakiri control-plane state | The user requires PostgreSQL for API keys, scheduling, and routing data. | Storing state only in OpenSandbox or in-memory |
| 2026-05-22 | Integrate Keycloak as external auth provider rather than implementing password auth | The user specified that authentication is managed by Keycloak. | Custom auth tables and password login |
| 2026-05-22 | Use Lima for the local k0s node on macOS | k0s requires Linux; Lima is installed and provides a repeatable local VM path. | Running k0s directly on macOS, Kind |
| 2026-05-22 | Use OpenSandbox Helm chart `opensandbox-0.1.0` | The `0.2.0` artifact URL returned 404; `0.1.0` was available and deployed successfully. | Continuing with adapter fallback only |
| 2026-05-22 | Use `127.0.0.1:18082` as the documented cluster API port-forward | Host port `8080` and Lima static `18080` were already occupied. | Force-killing existing forwards |
| 2026-05-22 | Use Kubernetes `pods/exec` for runtime commands | The deployed OpenSandbox server exposes lifecycle and proxy APIs; command execution is available through the sandbox pod. | Keeping the earlier adapter shim |
| 2026-05-22 | Use the OpenSandbox server proxy on `127.0.0.1:18083` for prototype routes | This gives a repeatable k0s-local route target without wildcard DNS. | Installing ingress and wildcard local DNS |

## Tech Debt Incurred
- Routing uses documented port-forward access rather than ingress/wildcard DNS.
- Keycloak uses development bootstrap credentials and `start-dev`.
- PostgreSQL uses local-path storage, appropriate for this k0s prototype but not production.
- `AUTH_DEV_ALLOW=1` remains enabled for local bootstrap convenience; the Playwright E2E verifies the Keycloak JWT path explicitly.
- Filesystem and metrics panels are prototype control-plane views where the deployed OpenSandbox runtime does not expose richer portable APIs yet.

## Completion Notes
Delivered a working Harakiri Sandbox prototype deployed into the fresh `harakiri-k0s` cluster. The stack includes PostgreSQL, Keycloak, OpenSandbox, the Harakiri API, scheduler, high-fidelity React web app, and `harakiri` CLI. Verification is recorded in `docs/test-report.md`; passing commands include `pnpm k0s:verify`, `pnpm test`, `pnpm build`, `pnpm smoke`, `pnpm smoke:ttl`, `pnpm smoke:route`, `pnpm e2e`, and `pnpm screenshots`. Deployed access uses port-forwards for API `18082`, web `15173`, Keycloak `18084`, and OpenSandbox proxy `18083`.
