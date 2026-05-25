# OSS Architecture Refactor Summary

Date: 2026-05-25
Commit: `5881085 Complete OSS architecture refactor`
Plan: [`docs/exec-plans/completed/oss-architecture-refactor.md`](exec-plans/completed/oss-architecture-refactor.md)
Verification record: [`docs/test-report.md`](test-report.md)

## Executive Summary

The refactor turned Harakiri Sandbox from a working prototype tied to one local
deployment into a more credible open-source control plane on top of
OpenSandbox. The final product was verified through all public interfaces:

- Web UI
- HTTP API
- CLI package
- TypeScript SDK
- OpenAPI contract
- k0s/OpenSandbox deployment
- Template image build and sandbox route workflows

The final plan was archived as complete, committed, and pushed to
`nabilblk/h-sandbox`.

## What Changed

### Runtime Architecture

- Introduced a documented `RuntimeProvider` boundary.
- Kept OpenSandbox as the default runtime provider.
- Added a development runtime provider for local/test use through
  `HARAKIRI_RUNTIME_PROVIDER=dev`.
- Split OpenSandbox runtime behavior into focused provider modules:
  - lifecycle/client transport
  - `execd` endpoint resolution
  - filesystem
  - logs/diagnostics
  - metrics
  - routes
  - route target generation
- Kept `apps/api/src/opensandbox.ts` only as a compatibility re-export.
- Removed hidden fake OpenSandbox fallback behavior from the OpenSandbox
  transport.
- Confirmed Harakiri no longer uses direct sandbox `pods/exec` or direct
  sandbox `pods/log` for normal terminal, filesystem, logs, metrics, or route
  behavior.
- Kept provider-owned OpenSandbox fallbacks where upstream APIs are incomplete:
  - stable scoped diagnostics `501` falls back to OpenSandbox plain-text
    diagnostics.
  - filesystem search failures fall back to an OpenSandbox `execd`
    directory-listing command.

### Filesystem, Logs, Metrics, And Runtime Panels

- Fixed the `open-agents-dev` filesystem behavior.
- Default filesystem browsing now starts from the template workdir, typically
  `/workspace`.
- Explicit root browsing still works through an OpenSandbox-owned fallback.
- Provider-unavailable states no longer silently become fake empty file lists.
- Runtime logs merge control-plane and provider diagnostics.
- Metrics use provider data when available and persisted fallback values when
  provider metrics are unavailable.

### Template Builder Architecture

- Introduced an `ImageBuilder` interface.
- Moved image-import digest resolution behind a reusable image-import builder.
- Made rootless BuildKit the default Dockerfile builder.
- Kept Kaniko only as `kaniko-legacy` compatibility provider.
- Added builder-neutral config:
  - `TEMPLATE_DOCKERFILE_BUILDER=buildkit`
  - `TEMPLATE_BUILDKIT_IMAGE=moby/buildkit:rootless`
  - `TEMPLATE_LEGACY_DOCKERFILE_BUILDER_IMAGE`
- Added compatibility aliases with warnings for older builder env names.
- Implemented BuildKit as a per-build Kubernetes Job.
- Added registry cache import/export and deterministic digest parsing.
- Added runtime image pull preflight for built template images.
- Documented the BuildKit and legacy builder model in `docs/builders.md`.

### Storage Architecture

- Introduced storage interfaces for build contexts and build logs:
  - `BlobStore`
  - `BuildLogStore`
- Added filesystem-backed implementations for OSS/local use.
- Kept PostgreSQL-backed implementations for current deployments and
  compatibility.
- Moved template build context and build-log access behind those storage
  interfaces.
- Added storage documentation in `docs/storage.md`.

### Lifecycle And Scheduling

- Added durable sandbox operation records with migrations:
  - `013_sandbox_operations.sql`
  - `014_sandbox_operation_secrets.sql`
- Lifecycle operations now create durable operation records for:
  - provision
  - delete
  - renew
  - route exposure
- Added idempotency support through explicit request keys or
  `Idempotency-Key`.
- Added queued/background lifecycle operation processing.
- Added atomic operation claiming with `FOR UPDATE SKIP LOCKED`.
- Added stale lease cleanup and retry handling.
- Encrypted replayable sandbox env values in `sandbox_operation_secrets`.
- Added provider-created sandbox reconciliation by Harakiri metadata.
- Updated renew behavior to match current OpenSandbox contract by sending an
  explicit `expiresAt` body.
- Preserved the normal fast path: default sandbox create still returns
  `201 { sandbox }` when provisioning completes quickly.
- Added explicit async create support through `wait:false`,
  `Prefer: respond-async`, and `waitTimeoutMs`, returning
  `202 { sandbox, operation, status:"pending" }`.

### API Modularization

- Turned `apps/api/src/routes.ts` into a small composition root.
- Split route domains into modules:
  - system
  - account
  - sandboxes
  - sandbox runtime
  - sandbox routes
  - templates
  - template builds
  - registry credentials
  - API keys
  - usage
  - organization settings
- Moved domain SQL and business behavior into services.
- Added service-level tests for account, API keys, registry credentials,
  sandbox runtime, sandbox operations, sandboxes, templates, template builds,
  usage, and organization settings.

### Shared Contracts, API Errors, And OpenAPI

- Expanded `@harakiri/shared` to own common request and response shapes.
- Added shared sandbox status transitions.
- Added shared API error envelope helpers.
- Updated API, SDK, CLI, and web clients to use shared contracts.
- Added OpenAPI 3.1 publication from `packages/shared/src/openapi.ts`.
- Generated and committed `docs/openapi.json`.
- Added `pnpm openapi:write` and `pnpm openapi:check`.
- Served the same OpenAPI contract from the API at `GET /openapi.json`.
- Corrected stale renew response contract drift.

### SDK

- Expanded the SDK with helpers needed by CLI and app workflows.
- Added SDK methods for:
  - sandbox create/run/files/logs/routes
  - async create options
  - template build context upload
  - registry credentials
- Added structured API error handling.
- Added SDK tests for API URL normalization, auth, errors, upload, async
  create, runtime helpers, and registry credentials.

### CLI

- Refactored the CLI into command modules:
  - auth
  - config
  - sandboxes
  - routes
  - templates
  - registry credentials
- Made the CLI consume the SDK for product API transport.
- Kept CLI-specific responsibility in the CLI:
  - command parsing
  - terminal output
  - local config
  - build context packaging
  - template build log following
- Added registry credential commands.
- Added async create behavior support.
- Added clean packaging through `pnpm cli:pack`.
- Ensured the packaged tarball contains runtime files, README, license, and
  executable `dist/index.js`, without compiled tests.

### Web UI

- Reduced `apps/web/src/main.tsx` to app-level gates and route selection.
- Split the web app into route and component modules:
  - landing
  - docs
  - dashboard shell
  - sandboxes
  - sandbox detail
  - templates
  - usage
  - API keys
  - settings
  - onboarding
- Split web API client code by endpoint domain while preserving the existing
  facade.
- Extracted shared visual primitives and formatting helpers.
- Kept the existing design tokens and visual direction.
- Added tests for docs content, docs route, dashboard shell, sandbox detail,
  sandboxes route, templates route, onboarding, workspace defaults, and small
  dashboard routes.
- Preserved and verified onboarding behavior so completed users go directly to
  the dashboard after login.

### Authentication And Local Development

- Kept Keycloak as the authentication system.
- Added a Docker Compose-imported local Keycloak realm:
  `infra/keycloak/harakiri-realm.json`.
- Added local dev user:
  - email: `lyra@k.ai`
  - password: `harakiri-dev`
- Updated `pnpm db:seed` to create a local user, organization, membership, and
  demo API key.
- Made local Compose ports overrideable:
  - `LOCAL_POSTGRES_PORT`
  - `LOCAL_KEYCLOAK_PORT`
- Updated `.env.example` to use local OSS defaults:
  - API: `http://127.0.0.1:8080`
  - Keycloak: `http://127.0.0.1:8081`
  - runtime provider: `dev`
  - route domain: `sandbox.localhost`
- Updated Vite config so the web app can read repo-root `.env` values.
- Added a small API-side `.env` loader for package scripts.

### Routing And k0s Deployment

- Centralized sandbox route host/key/url generation in
  `apps/api/src/providers/runtime/route-targets.ts`.
- Made fallback route URLs config-driven through:
  - `SANDBOX_ROUTE_BASE_DOMAIN`
  - `SANDBOX_ROUTE_PUBLIC_SCHEME`
- Updated OpenSandbox route exposure and dev runtime route exposure to use the
  same route target helpers.
- Updated generic k0s defaults to use `sandbox.localhost`.
- Kept harakiri.io and Cloudflare behavior as environment-specific examples
  under `infra/scripts/env/harakiri/`.
- Updated deployment scripts to override public API, Keycloak, route domain,
  route scheme, issuer allowlist, OpenSandbox gateway host, wildcard ingress,
  and local wildcard TLS without editing manifests.
- Added a renewed smoke script for sandbox renew behavior.

### Documentation And OSS Hygiene

- Reworked `README.md` into an OSS entrypoint.
- Added documentation index: `docs/README.md`.
- Added development guide: `docs/development.md`.
- Added extension guide: `docs/extensions.md`.
- Added ADRs:
  - runtime provider interface
  - image builder interface
  - storage interfaces
  - environment-specific examples
  - API contract publication
- Added or updated docs for:
  - architecture
  - API
  - builders
  - storage
  - template builds
  - templates
  - template security
  - runtime contract
  - runbook
  - test evidence
- Added OSS governance files:
  - `LICENSE`
  - `CONTRIBUTING.md`
  - `SECURITY.md`
  - `CODE_OF_CONDUCT.md`
  - `.github/pull_request_template.md`
  - issue templates
- Moved the execution plan to
  `docs/exec-plans/completed/oss-architecture-refactor.md`.

## Decisions Made

### Scope And Project Direction

- Treat the work as a full execution plan because it crossed API, runtime,
  builder, storage, web, CLI, SDK, docs, and deployment.
- Optimize the repository for OSS contributor experience, not only for the
  current harakiri.io instance.
- Keep current deployed behavior working while extracting better boundaries.
- Separate reusable OSS documentation from environment-specific harakiri.io and
  Cloudflare instructions.

### Runtime Decisions

- Keep OpenSandbox as the default runtime provider.
- Hide OpenSandbox behind `RuntimeProvider`.
- Treat OpenSandbox provider RBAC as distinct from Harakiri API permissions.
- Do not give Harakiri direct sandbox `pods/exec` or direct sandbox `pods/log`.
- Use provider-owned fallbacks for OpenSandbox API gaps instead of
  reintroducing direct Kubernetes access.
- Add an explicit dev runtime provider for local and test workflows.
- Remove hidden fake sandbox fallback behavior from the OpenSandbox transport.
- Default filesystem browsing to the template workdir instead of `/`.
- Reconcile stale provider-created sandboxes through provider metadata.
- Fail unmatched stale provision operations safe instead of blindly retrying.

### Builder Decisions

- Make rootless BuildKit the target and actual default Dockerfile builder.
- Keep Kaniko only as a legacy compatibility provider.
- Implement BuildKit as a per-build Kubernetes Job first, not as a long-running
  pooled worker.
- Keep BuildKit rootless while relaxing AppArmor/seccomp confinement needed by
  rootlesskit on the current k0s/containerd stack.
- Keep deprecated builder env aliases temporarily with warnings.
- Record generic builder metadata first, with provider-specific details nested
  under `builderDetails`.

### Storage Decisions

- Keep PostgreSQL-backed build context and log storage available.
- Add filesystem-backed storage for local OSS development and future
  portability.
- Move build context and log reads/writes behind interfaces.
- Make retention deletes return counts so scheduler reporting stays
  provider-neutral.

### Lifecycle Decisions

- Introduce `sandbox_operations` before changing public UX.
- Preserve synchronous default sandbox creation because CLI, web, and SDK users
  expect a usable sandbox after default create.
- Add explicit requested-async create through `wait:false` and
  `Prefer: respond-async`.
- Add timeout fallback through `waitTimeoutMs`.
- Do not store raw sandbox env values in operation request JSON.
- Store replayable env in encrypted operation-secret rows.
- Use atomic operation claims for both request-time and worker execution.
- Keep slow synchronous create work running in process after HTTP timeout.
- Pass an explicit expiration timestamp through renew because current
  OpenSandbox requires it.

### API And Contract Decisions

- Split route handlers by domain.
- Move SQL/business behavior into services before relying on the route split as
  architecture.
- Centralize common response and request shapes in `@harakiri/shared`.
- Use shared TypeScript contracts to harden server mappers before generated API
  docs.
- Publish OpenAPI 3.1 from a single shared contract source.
- Serve OpenAPI from the API without authentication.
- Keep OpenAPI generation as a committed artifact with drift checks.

### CLI And SDK Decisions

- Make the CLI consume the SDK instead of duplicating endpoint transport.
- Keep CLI presentation and command parsing outside the SDK.
- Split CLI commands by product domain.
- Package the CLI as a normal executable tarball.
- Exclude compiled test files from the CLI package.

### Web Decisions

- Extract product docs content first because it was low-risk static JSX.
- Extract docs route before dashboard routes.
- Split the web API client behind the existing facade to avoid broad call-site
  churn.
- Extract shared visual primitives and landing route before dashboard routes.
- Move sandbox detail before dashboard shell because runtime tabs are
  behavior-sensitive but bounded.
- Move templates last because it is the largest stateful route.
- Preserve the existing design tokens and product tone during modularization.

### Documentation And Deployment Decisions

- Record runtime/Kubernetes boundaries as architecture, not only as runbook
  notes.
- Treat template security as part of the architecture because custom images are
  a core extension point.
- Make local OSS development the source and docs default.
- Keep k0s port-forwards as runbook/test-report evidence, not product docs
  defaults.
- Import a development Keycloak realm through Compose.
- Seed a matching local workspace and demo API key.
- Centralize route host generation behind config-driven route target helpers.

## Important Behavioral Outcomes

- A normal sandbox create still returns a running sandbox on the fast path.
- Users that completed onboarding no longer get sent back through onboarding
  after login.
- The filesystem tab no longer shows false empty states when provider listing
  fails.
- Logs come from OpenSandbox provider diagnostics rather than Harakiri direct
  pod log access.
- Template builds use rootless BuildKit by default.
- The CLI can be installed and run as `harakiri`, without calling
  `node packages/cli/dist/index.js`.
- Product docs and package help no longer depend on maintainer-only k0s
  port-forward values.
- harakiri.io and Cloudflare instructions are scoped as environment examples.

## Verification Performed

Final verification passed on 2026-05-25:

```bash
pnpm test
pnpm typecheck
pnpm openapi:check
pnpm build
pnpm cli:pack
docker compose config
git diff --check
```

The current tree was redeployed to k0s and verified with:

```bash
pnpm ports:restart
pnpm ports:status
pnpm smoke
pnpm smoke:templates
pnpm smoke:route
pnpm smoke:template-build
pnpm e2e
pnpm smoke:route-ingress
```

Fresh deployed image digests:

- API:
  `sha256:61830fb760d6edcbd5187520e57ac37708848e51360c4e3d0a6b8f7f9b173bd3`
- Web:
  `sha256:770e6482c3555a04827e12e5851f9064d7ee418e55dfdca5ed855511b4fc9ac9`

Fresh live smoke evidence:

- Basic sandbox smoke created and killed `sbx_aaHbDz1GNn`.
- Template catalog smoke passed for `python-3.12`, `python-3.12-data`, and
  `node-20`.
- Route smoke exposed
  `https://9c737267-4d96-42a7-8208-cb4c715b8120-3000.sandbox.localhost`.
- Template build smoke created build `bld_8HI6em_S-xzc`, version
  `tplv_a5jCB8lXdOSG`, and sandbox `sbx_kRFu4TEK2M`.
- Browser e2e passed 2/2 tests:
  - Web/API/CLI/SDK sandbox workflow
  - completed-user onboarding redirect
- Ingress HTTPS route smoke exposed
  `https://b6b37639-0944-480d-b043-2301e59de8fd-3000.sandbox.localhost`.

Cleanup audit after live smokes:

```text
active_sandboxes=0
active_smoke_keys=0
ready_routes=0
active_template_builds=0
```

## Public harakiri.io Deployment Follow-Up

After the generic OSS refactor, the public `https://sb.harakiri.io` deployment
was found to be serving a web bundle configured for local port-forward URLs.
That made the browser try to exchange the Keycloak token at
`http://127.0.0.1:18084`, which Chrome blocks from a public HTTPS origin.

The fix was to add `pnpm env:harakiri:deploy-public`, a maintainer-environment
wrapper around the generic k0s deploy script. The wrapper keeps the portable
defaults in `deploy-k0s.sh`, while explicitly deploying the harakiri.io lab with:

- `HARAKIRI_PUBLIC_API_URL=https://sb-api.harakiri.io`
- `HARAKIRI_PUBLIC_KEYCLOAK_URL=https://sb-auth.harakiri.io`
- `HARAKIRI_SANDBOX_ROUTE_DOMAIN=harakiri.io`
- `HARAKIRI_SANDBOX_ROUTE_SCHEME=https`
- a Keycloak issuer allowlist containing the internal service issuer, local
  port-forward issuer, and public `sb-auth.harakiri.io` issuer.

Follow-up verification passed on 2026-05-25:

```bash
pnpm env:harakiri:deploy-public
HARAKIRI_WEB_URL=https://sb.harakiri.io \
  HARAKIRI_API_URL=https://sb-api.harakiri.io \
  HARAKIRI_CLI_BIN=$PWD/packages/cli/dist/index.js \
  pnpm e2e
pnpm env:harakiri:route-public
git diff --check
```

Public deployment evidence:

- Public web asset `index-D1ZPtM4z.js` contains zero loopback API/Auth URL
  references, one `sb-auth.harakiri.io` reference, and one
  `sb-api.harakiri.io` reference.
- Keycloak OIDC discovery returns issuer
  `https://sb-auth.harakiri.io/realms/harakiri` and a public token endpoint.
- The token endpoint CORS preflight from `https://sb.harakiri.io` returns
  `access-control-allow-origin: https://sb.harakiri.io`.
- Public API health at `https://sb-api.harakiri.io/health` returns
  `{"status":"ok"}`.
- Public browser e2e passed 2/2 tests, covering Web, API, CLI, SDK, and the
  completed-user onboarding redirect.
- Public sandbox routing smoke created `sbx_mN4vBfJLIs`, exposed port `3000`,
  and fetched HTML from
  `https://98a4f1a0-231d-4cb8-b5ff-1346409c1e36-3000.harakiri.io`.
- Cleanup audit after public tests showed zero active sandboxes, ready routes,
  active template builds, and temporary smoke API keys.
- The completed template-builder smoke Job
  `hkbkit-bld-u5u0pbhilq0o` was deleted after verification.

Current deployed pod image IDs after the public redeploy:

- API:
  `sha256:d9e0324f336004e2ebd6df6d3a51c3967e0aeac0c871f02772f926fc3280658f`
- Web:
  `sha256:7dda0abaf677c081efa9d8a63219862c4b0164f99b6e6820842e96d4bb94a351`

## Known Follow-Up Work

These were intentionally recorded as tech debt, not open blockers:

- Remove `apps/api/src/opensandbox.ts` compatibility re-export after imports
  move fully to `providers/runtime/`.
- Retire OpenSandbox diagnostics and filesystem fallbacks when upstream stable
  APIs exist.
- Expose richer filesystem metadata to clients beyond `{ cwd, files }`.
- Derive OpenAPI and TypeScript contracts from one source rather than manually
  mirroring schema data.
- Split the large web templates route into smaller route-owned components and
  hooks.
- Add route-owned hooks/loaders for deeper sandbox detail panel interactions.
- Consider a pooled BuildKit worker if Dockerfile build latency becomes a
  bottleneck.
- Harden BuildKit worker security profiles per Kubernetes distribution.
- Extract common Kubernetes Job helper code shared by BuildKit and legacy
  Kaniko builders.

## Final State

- Plan status: completed.
- Plan location:
  `docs/exec-plans/completed/oss-architecture-refactor.md`.
- Commit pushed to `origin/main`:
  `5881085 Complete OSS architecture refactor`.
- Working product verified across CLI, API, UI, SDK, templates, routes,
  onboarding, local development, and deployed k0s/OpenSandbox runtime.
