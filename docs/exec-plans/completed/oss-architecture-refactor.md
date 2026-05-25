# Execution Plan: OSS Architecture Refactor

**Created**: 2026-05-24
**Author**: Codex
**Status**: Completed
**Priority**: {P0-P3}
**Estimated effort**: 8-12 engineering days

## Context
Harakiri Sandbox is now a working prototype, but the next goal is to make it a
credible open-source project rather than a repository shaped around one local
deployment. The current code proves the product surface, yet several important
subsystems are too concrete or too coupled:

- OpenSandbox runtime access now goes through a `RuntimeProvider` and
  provider-owned helper modules. `opensandbox-transport.ts` is a small facade
  for lifecycle/create-body compatibility, while `opensandbox-client.ts`,
  `opensandbox-execd.ts`, `opensandbox-files.ts`, `opensandbox-logs.ts`,
  `opensandbox-metrics.ts`, and `opensandbox-routes.ts` own the concrete
  provider transport behavior.
- `apps/api/src/template-builder.ts` now delegates image work through
  `ImageBuilder`. The active Dockerfile implementation is
  `BuildKitKubernetesBuilder`, which runs a rootless per-build Kubernetes Job
  with `moby/buildkit:rootless`; `KanikoLegacyBuilder` remains selectable only
  as `TEMPLATE_DOCKERFILE_BUILDER=kaniko-legacy`.
- `apps/api/src/routes.ts` is now a small composition root and the API domains
  have moved into route/service modules. Shared response/error contracts and
  OpenAPI publication now cover the API, web app, CLI, and SDK; the remaining
  API contract cleanup is later source-generation deduplication, not a blocking
  architecture gap.
- `apps/web/src/main.tsx` is now a small app gate/router. Product docs data,
  docs rendering, landing, shared visual primitives, the web API client
  domains, the sandboxes list/create route, the sandbox detail runtime route,
  usage, API keys, organization settings, onboarding, dashboard shell, and
  template management now live in contributor-facing route/component modules.
  Authenticated browser smoke coverage now exercises the runtime, template,
  and docs routes against the deployed k0s stack. A later optional split of
  the large template route into smaller subcomponents/hooks remains useful
  cleanup, but it is no longer blocking the Phase 8 architecture gate.
- Core docs have started separating reusable project architecture from
  harakiri.io lab scripts. `docs/opensandbox-boundaries.md` now documents the
  runtime/Kubernetes boundary, `docs/template-security.md` documents template
  image security, and harakiri.io Cloudflare scripts live under
  `infra/scripts/env/harakiri/`. The README now leads with the portable OSS
  path, docs are indexed by audience, generic local development and extension
  guides exist, and harakiri.io Cloudflare instructions are isolated behind the
  environment-specific README.

This plan focuses on code architecture, maintainability, public extension
points, testability, and OSS contributor experience. It is not a plan for
hardening the current harakiri.io instance.

Current runtime boundary checkpoint from the latest prototype work:

- Harakiri no longer uses Kubernetes `pods/exec` or direct sandbox `pods/log`
  for normal terminal, filesystem, metrics, logs, or route behavior.
- OpenSandbox is pinned in k0s to newer runtime components through values:
  `server:v0.1.14`, `execd:v1.0.17`, and `egress:v1.0.12`, while still using
  the published `opensandbox-0.1.0` chart.
- OpenSandbox stable scoped diagnostics currently returns
  `501 DIAGNOSTICS_NOT_IMPLEMENTED`; Harakiri falls back to OpenSandbox's
  provider-owned plain-text diagnostics endpoint until the stable API exists.
- The only sandbox `pods/log` permission now belongs to the OpenSandbox server
  service account in the OpenSandbox dataplane namespace. Harakiri's service
  account still has no `pods/log` and no `pods/exec`.
- Filesystem access uses OpenSandbox endpoint-resolved `execd`. It calls
  `/files/search` first, defaults the browser/API to the template workdir, and
  falls back to an OpenSandbox `execd` directory-listing command for paths where
  provider search fails, such as `/`.
- The `open-agents-dev` filesystem regression has been reproduced and
  addressed: new sandboxes default to `/workspace`, explicit `path=/` uses the
  OpenSandbox-owned directory-listing fallback, and the deployed UI/API/browser
  probe now shows a real workspace file instead of a false empty state.

Current builder checkpoint from the latest refactor work:

- Dockerfile template builds now default to `BuildKitKubernetesBuilder` through
  `TEMPLATE_DOCKERFILE_BUILDER=buildkit`; the k0s manifest sets the same
  default with `moby/buildkit:rootless`, rootless BuildKit daemon flags, and
  explicit insecure-registry handling for the in-cluster local registry.
- `KanikoLegacyBuilder` remains available only as an explicit compatibility
  provider through `TEMPLATE_DOCKERFILE_BUILDER=kaniko-legacy` and
  `TEMPLATE_LEGACY_DOCKERFILE_BUILDER_IMAGE`.
- The BuildKit Kubernetes Job is still per-build, not a shared BuildKit
  Deployment. It reuses the existing build context exporter init container,
  pushes to the configured registry, exports/imports registry cache, parses the
  pushed digest from deterministic plain BuildKit output, and records provider
  details under `builderDetails`.
- The first k0s smoke attempts exposed rootless BuildKit runtime constraints
  rather than product API failures: `newuidmap` failed when the container was
  forced into no-new-privileges behavior, and rootlesskit mount sharing failed
  under the default container confinement. The latest code keeps the BuildKit
  container non-root and non-privileged, but relaxes the pod confinement with
  unconfined AppArmor/seccomp settings required by rootless BuildKit on the
  current k0s/containerd stack.
- The API image and k0s manifests have been redeployed after those BuildKit
  Job changes. `pnpm smoke:template-build` now proves BuildKit can push a ready
  image and launch a sandbox from it. Latest evidence: build
  `bld_61ukPTP4u_EF`, version `tplv_e-Xyjz2FiZEt`, digest
  `sha256:f6eee0166e843165d3643c1d1ea266a3653a96eea7c121e7ad2b7513d2922afc`,
  sandbox `sbx_Vf-5JG5-U8`, and `harakiri run` returned `harakiri-built`.

Current lifecycle checkpoint from the latest refactor work:

- Sandbox status values and allowed transitions now live in shared code.
- Lifecycle calls now create durable `sandbox_operations` records for
  provision, sandbox delete, renew, and route exposure before calling the
  runtime provider.
- `POST /v1/sandboxes` now writes a pending sandbox row before provider
  provisioning. The current API still keeps the CLI/web happy by executing the
  operation synchronously on the fast path and returning `{ sandbox }` after a
  successful provider create.
- Provider-create failures are persisted as failed operations, the sandbox is
  moved to `error`, and the HTTP mapper returns a structured
  `sandbox_provision_failed` response instead of leaving an unreconcilable
  partial state.
- Operation idempotency exists for create, sandbox delete, renew, and route
  exposure through explicit request keys or the `Idempotency-Key` header.
- Targeted renew testing exposed a real OpenSandbox contract drift: the current
  OpenSandbox `/v1/sandboxes/{id}/renew-expiration` API requires an
  `expiresAt` JSON body, while Harakiri had been sending an empty POST. The
  runtime provider contract now accepts `RuntimeRenewInput { expiresAt }`,
  request-time and worker renew paths compute one provider/database expiration
  value, and the OpenSandbox provider sends `{ expiresAt }` upstream. The
  deployed split-provider k0s API image
  `sha256:66847f882e1c4967e81b7f1877b55013c47a5fc7f32074a530084f2d46472ce8`
  passed `pnpm smoke:renew` with sandbox `sbx_sbvBX7hsBO`, and cleanup reported
  `active_sandboxes=0` and `active_smoke_keys=0`.
- The scheduler now runs a bounded operation worker. It atomically claims queued
  lifecycle operations with `FOR UPDATE SKIP LOCKED`, retries replayable
  failures, marks exhausted operations failed, and cleans stale leases for the
  idempotent worker paths.
- Queued provision operations can now replay through the runtime provider.
  Sandbox env is not stored in `sandbox_operations.request`; when a
  `CONTROL_PLANE_SECRET_KEY`, `HARAKIRI_SECRET_KEY`, or compatible registry
  credential key is configured, non-empty env is stored in encrypted
  `sandbox_operation_secrets` rows and decrypted only by the worker.
- Stale running provision operations now reconcile through runtime-provider
  metadata. The provider summary contract exposes create-time metadata, and the
  worker adopts a provider sandbox whose `harakiri.sandbox`/organization
  metadata matches the control-plane operation. If no exact provider match is
  visible, the operation fails safe instead of blindly creating a duplicate
  sandbox.
- `POST /v1/sandboxes` has a durable operation underneath. The public fast path
  still returns `201 { sandbox }`, while requested async calls using
  `wait:false` or `Prefer: respond-async` return
  `202 { sandbox, operation, status:"pending" }`. Synchronous creates can also
  use `waitTimeoutMs` to fall back to the same `202` shape when provider
  provisioning exceeds the request budget. Richer polling behavior beyond
  `Location`/`Retry-After` remains pending.
- The deployed Web/API/CLI/SDK e2e now explicitly verifies the normal fast path
  is still synchronous: Web lands on a running detail page, API returns `201`
  with no pending operation, CLI prints `sealed.` rather than `queued.`, and SDK
  returns a running sandbox with no pending operation.
- The background worker uses atomic `FOR UPDATE SKIP LOCKED` claim helpers.
  Request-time create, delete, renew, and route exposure now use an atomic
  operation-id claim helper instead of the old two-statement
  `SELECT ... FOR UPDATE` start path.

Current shared-contract checkpoint from the latest refactor work:

- `packages/shared/src/index.ts` now contains the primary success request and
  response shapes for sandbox lifecycle, sandbox runtime panels, routes,
  templates, template builds, API keys, account/onboarding, organization
  settings, registry credentials, health/bootstrap, and generic `{ ok }`
  responses.
- `packages/shared/src/index.ts` also owns the shared API error envelope and
  formatting/parsing helpers. The API, SDK, CLI, and web request layers now use
  the same structured `{ error, message?, ... }` shape for normal API failures.
- The shared sandbox create response covers both the default fast path
  `201 { sandbox }` and requested async or timeout fallback paths
  `202 { sandbox, operation, status:"pending" }`.
- `packages/sdk/src/index.ts`, `packages/cli/src/index.ts`, and
  `apps/web/src/api.ts` now consume these shared body/response wrappers instead
  of redefining the same endpoint payloads locally.
- API routes and the service mappers that feed them are annotated against the
  shared response contracts. This caught and fixed server drift around nullable
  account names, date serialization, route states, template-build context
  summaries, template-version scan fields, and API-key null fields.
- `packages/cli` now depends on `@harakiri/shared`, reducing client contract
  drift while keeping the current CLI formatting and command tests intact.
- `packages/cli` now also depends on `@harakiri/sdk` and routes product API
  calls through `HarakiriClient` methods. CLI commands still own command-line
  parsing, presentation, local config, and build-context packaging, but endpoint
  transport and product endpoint wiring now live in the SDK.
- The SDK surface now includes the CLI-needed runtime helpers for sandbox logs
  and filesystem listing, so command behavior can stay stable without a
  separate CLI HTTP transport path.
- `packages/cli/src/index.ts` is now a small command composition root. Auth,
  config/banner, template, sandbox, route, and registry-credential commands
  live in command modules, and registry credentials are now exposed through both
  SDK helpers and CLI commands.
- CLI packaging is documented in `packages/cli/README.md`, and the package
  build now cleans `dist/` and excludes compiled test files from the packed
  tarball.
- ADR 0005 records the API contract publication decision. `packages/shared` now
  owns the OpenAPI 3.1 contract source, `docs/openapi.json` is generated from
  that source, `pnpm openapi:check` verifies drift, and the API serves the same
  document at `GET /openapi.json` without authentication.
- The renew route contract has been corrected in the generated OpenAPI source:
  `POST /v1/sandboxes/{id}/renew` returns the shared `OkResponse`, matching the
  Fastify route behavior, instead of the stale `SandboxResponse` shape.

Current web modularization checkpoint from the latest refactor work:

- The deployed authenticated Web/API/CLI/SDK e2e now covers the sandbox detail
  runtime tabs after route extraction. It creates a real sandbox through the
  dashboard, verifies the running detail header, opens filesystem, logs,
  metrics, and network tabs, verifies filesystem/default-root and metrics API
  behavior, then kills the sandbox.
- The same browser run covers the extracted templates and docs routes. It opens
  the Templates List and Builds tabs, verifies deployed template/build data,
  then navigates product docs across Quickstart, Template builds, and API
  reference.
- Phase 8 screenshots are available at `/tmp/harakiri-auth-runtime-tabs.png`,
  `/tmp/harakiri-auth-template-tabs.png`, and `/tmp/harakiri-auth-docs.png`.
  Visual review showed the extracted routes still use the same restrained
  product surface: centralized CSS variables in `styles.css` remain the token
  source, route CSS stays in `styles-app.css`/`styles-landing.css`, and no new
  theme or palette was introduced by the route split.
- Current validation after the authenticated smoke extension:
  `pnpm --filter @harakiri/web test`, `pnpm --filter @harakiri/web typecheck`,
  `pnpm --filter @harakiri/web build`, and `git diff --check` pass. The e2e
  cleanup audit reports `active_sandboxes=0`, `active_smoke_keys=0`, and
  `running_real_e2e=0`.

Current OSS documentation checkpoint from the latest refactor work:

- `docs/opensandbox-boundaries.md` records the rule that OpenSandbox owns
  sandbox lifecycle and data-plane access, while Harakiri owns control-plane
  state, API keys, routing records, schedules, usage, and audit events.
- `docs/template-security.md` records the current template image security model:
  registry credential redaction, digest pinning, build context validation,
  image policy, scan/provenance fields, retention, visibility, and audit events.
- `README.md` is now an OSS entrypoint rather than a prototype-only guide. It
  explains the four public interfaces, workspace layout, runtime-free
  contributor quickstart, full k0s/OpenSandbox stack, CLI packaging, templates,
  routes, docs, contribution guide, security policy, and license.
- `docs/README.md` splits documentation by contributor, user, operator, and
  example-environment audiences.
- `docs/development.md` provides a generic local development path that does not
  require Cloudflare, harakiri.io DNS, or a public tunnel.
- `docs/extensions.md` documents the contributor extension interfaces:
  runtime providers, image builders, storage backends, auth providers, audit
  sinks, and contract-change rules.
- Repository hygiene now includes `LICENSE`, `CONTRIBUTING.md`,
  `SECURITY.md`, `CODE_OF_CONDUCT.md`, `.github/pull_request_template.md`, and
  issue templates for bugs and feature requests. Workspace package manifests
  declare `Apache-2.0`.
- Environment-specific Cloudflare/harakiri.io checks are isolated under
  `infra/scripts/env/harakiri/` and surfaced as explicit `pnpm
  env:harakiri:*` commands. Detailed harakiri.io tunnel, DNS, and Let's
  Encrypt instructions now live in `infra/scripts/env/harakiri/README.md`, not
  the core README/runbook.
- `docs/test-report.md` records the deployed OpenSandbox upgrade, filesystem
  regression verification, CLI demo, and cleanup audit evidence. It is useful
  verification history, but should not become a prerequisite for generic OSS
  local development.
- Generic local development is now directly provable from the repository:
  `.env.example` points at the local API/Keycloak ports, the API loads a
  repo-root `.env` for package scripts, the web dev server reads root
  `PUBLIC_*` variables through Vite `envDir`/`envPrefix`, Docker Compose imports
  the `harakiri` Keycloak realm, and `pnpm db:seed` creates the local
  `lyra@k.ai` workspace plus the documented demo API key.
- Compose host ports are overrideable through `LOCAL_POSTGRES_PORT` and
  `LOCAL_KEYCLOAK_PORT`. This keeps the default README path simple while still
  letting contributors verify Keycloak when common ports are already occupied.
- Latest local contributor proof: `docker compose config` passed; Keycloak was
  started with `LOCAL_KEYCLOAK_PORT=18181` and served the imported
  `harakiri` OIDC discovery document; `pnpm db:migrate` and `pnpm db:seed`
  passed against local PostgreSQL; a local API using
  `HARAKIRI_RUNTIME_PROVIDER=dev` accepted the seeded API key; and the packaged
  CLI created, ran, exposed, listed, and killed a development-runtime sandbox
  using a temporary clean home directory.
- Current Phase 9 focused verification: `pnpm --filter @harakiri/web test`,
  `pnpm --filter @harakiri/web typecheck`, `pnpm --filter @harakiri/cli test`,
  `pnpm --filter @harakiri/cli typecheck`, `pnpm --filter @harakiri/sdk test`,
  `pnpm --filter @harakiri/api test`, `pnpm --filter @harakiri/api typecheck`,
  `pnpm --filter @harakiri/shared test`, `pnpm openapi:check`, `pnpm build`,
  and `git diff --check` pass after the OSS docs/governance changes.
- Latest post-update verification: `docker compose config`,
  `LOCAL_KEYCLOAK_PORT=18181 docker compose up -d keycloak` plus OIDC
  discovery probe, `pnpm --filter @harakiri/web test`,
  `pnpm --filter @harakiri/web typecheck`,
  `pnpm --filter @harakiri/cli test`,
  `pnpm --filter @harakiri/cli typecheck`, `pnpm build`, and
  `git diff --check` pass.
- Final closeout verification on 2026-05-25: `pnpm test`, `pnpm typecheck`,
  `pnpm openapi:check`, `pnpm build`, `pnpm cli:pack`,
  `docker compose config`, and
  `git diff --check` passed. The current tree was redeployed to k0s with API
  image `sha256:61830fb760d6edcbd5187520e57ac37708848e51360c4e3d0a6b8f7f9b173bd3`
  and web image `sha256:770e6482c3555a04827e12e5851f9064d7ee418e55dfdca5ed855511b4fc9ac9`.
  `pnpm smoke`, `pnpm smoke:templates`, `pnpm smoke:route`,
  `pnpm smoke:template-build`, `pnpm e2e`, and
  `pnpm smoke:route-ingress` passed against that deployment. Cleanup audit
  reported `active_sandboxes=0`, `active_smoke_keys=0`, `ready_routes=0`, and
  `active_template_builds=0`.

Current portability/config checkpoint from the latest refactor work:

- Generic source/docs defaults now point at local OSS development surfaces
  rather than the maintainer deployment: `PUBLIC_API_URL=http://127.0.0.1:8080`,
  `PUBLIC_KEYCLOAK_URL=http://127.0.0.1:8081`,
  `HARAKIRI_RUNTIME_PROVIDER=dev`, and
  `SANDBOX_ROUTE_BASE_DOMAIN=sandbox.localhost`.
- k0s smoke/deployment examples still use forwarded ports such as
  `127.0.0.1:18082` for the current lab cluster, but those values are isolated
  to runbook/test-report/deployment evidence rather than product docs,
  package help, or source defaults.
- The web image build accepts Vite public auth/API build arguments, and
  `infra/scripts/deploy-k0s.sh` can override public API, Keycloak, route
  domain, route scheme, issuer allowlist, OpenSandbox gateway host, wildcard
  ingress host, and local wildcard TLS generation without editing manifests.
- Environment-specific harakiri.io behavior is now expressed through
  `HARAKIRI_*` deployment variables and `infra/scripts/env/harakiri/`, not as
  the generic k0s default path.
- Deprecated builder environment aliases now warn at process start:
  `TEMPLATE_BUILDER_PROVIDER` maps to `TEMPLATE_DOCKERFILE_BUILDER`, and
  `TEMPLATE_BUILDER_KANIKO_IMAGE` maps to
  `TEMPLATE_LEGACY_DOCKERFILE_BUILDER_IMAGE`. Both aliases are documented as
  removable no earlier than `0.3.0`.
- Route host and URL synthesis now goes through
  `apps/api/src/providers/runtime/route-targets.ts`. OpenSandbox route keys,
  sandbox-runtime fallback routes, operation-worker fallback routes, and the
  development runtime provider all use the configured route domain and public
  scheme instead of duplicating `sandbox.localhost`.
- Latest deployed verification after this checkpoint: k0s redeploy completed
  with API image `sha256:670f907f96ed4f2070706f9580ec56401c6cae81c9fc1625ff3cd68e7aaf66de`
  and web image `sha256:dcb9a80459c7dddb8490a220635715a37e4db807231e48a2c60475c55ff2869e`;
  live ConfigMap values are `PUBLIC_API_URL=http://127.0.0.1:18082`,
  `PUBLIC_KEYCLOAK_URL=http://127.0.0.1:18084`,
  `SANDBOX_ROUTE_BASE_DOMAIN=sandbox.localhost`, and
  `SANDBOX_ROUTE_PUBLIC_SCHEME=https`; wildcard ingress host/TLS are
  `*.sandbox.localhost`.

These changes complete the planned architecture refactor checkpoints. The
runtime provider interface exists, `apps/api/src/opensandbox.ts` is only a
compatibility re-export, the concrete OpenSandbox implementation is split
across provider-owned helpers, BuildKit is the default Dockerfile builder, and
the web/API/CLI/SDK surfaces have shared contracts plus current smoke evidence.
Remaining items are tracked as tech debt, not open plan gates.

Reference context:
- `README.md`
- `docs/architecture.md`
- `docs/templates.md`
- `docs/template-builds.md`
- `docs/builders.md`
- `docs/storage.md`
- `docs/opensandbox-boundaries.md`
- `docs/template-security.md`
- `docs/test-report.md`
- `docs/runbook.md`
- `apps/api/src/opensandbox.ts`
- `apps/api/src/providers/runtime/opensandbox-transport.ts`
- `apps/api/src/providers/runtime/provider.ts`
- `apps/api/src/builders/image-builder.ts`
- `apps/web/src/docs-content.tsx`
- `apps/web/src/routes/dashboard-shell.tsx`
- `apps/web/src/routes/sandboxes.tsx`
- `apps/web/src/routes/sandbox-detail.tsx`
- `apps/web/src/routes/templates.tsx`
- `apps/web/src/routes/onboarding.tsx`
- `apps/web/src/routes/usage.tsx`
- `apps/web/src/routes/api-keys.tsx`
- `apps/web/src/routes/settings.tsx`
- `apps/web/src/workspace.ts`
- `apps/web/src/format.ts`
- `apps/web/src/api-client/`
- `docs/adr/0005-api-contract-publication.md`
- `docs/openapi.json`
- `apps/web/Dockerfile`
- `apps/api/src/template-builder.ts`
- `apps/api/src/routes.ts`
- `apps/api/src/scheduler.ts`
- `apps/web/src/main.tsx`
- `packages/cli/src/index.ts`
- `infra/scripts/deploy-k0s.sh`
- `infra/scripts/env/harakiri/README.md`
- Kaniko archive notice: https://github.com/GoogleContainerTools/kaniko
- BuildKit architecture: https://docs.docker.com/build/buildkit/
- Buildx Kubernetes driver and rootless mode:
  https://docs.docker.com/build/builders/drivers/kubernetes/

## Success Criteria
- [x] The runtime integration is expressed through a documented
      `RuntimeProvider` interface, with OpenSandbox as the default provider and
      no provider-specific logic leaking into API route handlers.
- [x] Runtime access rules are explicit: Harakiri API does not receive sandbox
      `pods/exec` or `pods/log`; provider-side RBAC needed by OpenSandbox is
      isolated to OpenSandbox service accounts and documented as provider
      responsibility.
- [x] Filesystem behavior is provider-contract tested: default listing starts
      from the template workdir, explicit `/` listing works through an
      OpenSandbox-owned path, and provider failures do not become false "empty"
      UI states.
- [x] The image build subsystem is expressed through a documented
      `ImageBuilder` interface, with rootless BuildKit as the preferred default
      implementation and Kaniko either removed or isolated as a legacy provider.
- [x] Sandbox lifecycle operations use an explicit state machine or outbox flow
      so provider provisioning and database state remain reconcilable.
- [x] Sandbox create has an explicit default-sync/requested-async response
      contract shared by the API, SDK, CLI, and web app: normal fast-path calls
      still return `201 { sandbox }`, and requested async calls return
      `202 { sandbox, operation }` with clear polling/refresh headers.
- [x] Timed-out synchronous sandbox creates return the same pending response
      shape instead of blocking indefinitely or failing ambiguously.
- [x] Build contexts, build logs, and generated artifacts use storage
      interfaces rather than direct PostgreSQL `BYTEA` assumptions in core
      business logic.
- [x] API route code is split by domain and can be tested without booting the
      whole product stack.
- [x] Primary success request/response contracts for sandbox lifecycle,
      sandbox runtime panels, routes, templates, template builds, API keys,
      account/onboarding, and organization settings are centralized in shared
      code and consumed by the web API client, CLI, and SDK.
- [x] Full API contracts are centralized, including generated schemas or
      documented contract publishing from the same source as the TypeScript
      contracts.
- [x] Web and CLI code are split into feature modules that are approachable for
      new contributors.
- [x] Core docs describe reusable OSS architecture, while harakiri.io,
      Cloudflare, and local lab-specific scripts live only in clearly named
      example environment docs.
- [x] The project has basic OSS project hygiene: license, contribution guide,
      security policy, issue/PR templates, architecture decision records, and a
      documented local development path.
- [x] Existing prototype behavior remains intact: web, API, CLI, SDK, templates,
      routes, onboarding, and k0s smoke tests still pass after the refactor.

## Non-Goals
- Do not optimize or harden the current harakiri.io deployment as part of this
  refactor.
- Do not add billing, multi-region routing, enterprise SSO, or production HA
  infrastructure.
- Do not replace OpenSandbox as the default runtime provider.
- Do not change the visual design except where modularization requires moving
  components without changing their rendered behavior.

## Phases

### Phase 1: Architecture Inventory And Target Boundaries
**Status**: Complete
- [x] Write a short architecture inventory that maps current modules to target
      OSS subsystems: runtime provider, builder, storage, auth, API domains,
      scheduler, web, CLI, SDK, deployment examples, and docs.
- [x] Define the public extension interfaces before editing call sites:
      `RuntimeProvider`, `ImageBuilder`, `BlobStore`, `BuildLogStore`,
      `OidcProviderConfig`, and `AuditSink`.
- [x] Identify which interfaces are stable public APIs and which are internal
      implementation seams.
- [x] Add an ADR folder under `docs/adr/` and record the first decisions:
      provider interface, builder interface, storage interface, and
      environment-specific examples.
- [x] Add a contributor-facing module map to `docs/architecture.md`.

Verification gate:
- [x] `docs/architecture.md` explains the target architecture and module
      boundaries; harakiri.io route examples are isolated to explicit
      environment-specific or historical docs.
- [x] ADRs record the intended direction before code movement starts.

### Phase 2: Runtime Provider Refactor
**Status**: Complete
- [x] Create `apps/api/src/providers/runtime/provider.ts` with a
      `RuntimeProvider` interface covering create, get, delete, renew, run,
      files, logs, metrics, and route exposure.
- [x] Include filesystem semantics in the interface: default workdir listing,
      explicit path listing, provider errors, and enough metadata for the UI to
      distinguish empty directories from unavailable provider responses.
- [x] Move OpenSandbox-specific HTTP calls under
      `apps/api/src/providers/runtime/`.
- [x] Move OpenSandbox `execd` endpoint resolution and command/files/metrics
      transport into a small helper owned by the OpenSandbox provider.
- [x] Preserve the current provider boundary: terminal commands, filesystem,
      metrics, logs, and route exposure go through OpenSandbox APIs or
      OpenSandbox-resolved `execd`; Harakiri must not regain direct
      Kubernetes `pods/exec` or sandbox `pods/log`.
- [x] Model provider-owned Kubernetes permissions separately from Harakiri API
      permissions. The OpenSandbox server may need `pods/log` to implement its
      own diagnostics endpoint; that must not be represented as a Harakiri
      runtime capability.
- [x] Keep fallback behavior explicit and provider-owned:
      OpenSandbox scoped diagnostics `501` -> plain-text diagnostics endpoint;
      `/files/search` failure -> OpenSandbox `execd` directory-listing command.
- [x] Replace direct `openSandbox.*` calls in route handlers and scheduler with
      injected provider calls.
- [x] Replace the current fallback runtime with an explicit
      `InMemoryRuntimeProvider` or `DevRuntimeProvider` that is only enabled for
      local development and tests.
      `InMemoryRuntimeProvider` is available behind
      `HARAKIRI_RUNTIME_PROVIDER=dev`, and the old hidden `osbx_` fallback
      branches were removed from the OpenSandbox transport.
- [x] Add provider contract tests that run against fake provider fixtures.
      Current checkpoint covers the OpenSandbox adapter and in-memory provider;
      route and scheduler runtime paths now have fake-provider unit coverage.
- [x] Verify the `open-agents-dev` filesystem regression against the deployed
      stack: default path is the template workdir, a real `/workspace` file is
      visible in the UI, and explicit root browsing works through the
      OpenSandbox-owned fallback path.
- [x] Align provider renew with the current OpenSandbox API: `RuntimeProvider`
      now accepts a `RuntimeRenewInput { expiresAt }`, `OpenSandboxProvider`
      sends that body to `/renew-expiration`, and `DevRuntimeProvider` mirrors
      the same expiration update for local/test behavior.
- [x] Add a targeted renew smoke script that creates a sandbox, renews it,
      verifies `expires_at`, `sandbox_operations`, `sandbox_events`, and then
      runs a command in the renewed sandbox.
- [x] Split `opensandbox-transport.ts` into focused provider helpers:
      lifecycle API, `execd` endpoint resolution, command transport,
      filesystem listing, diagnostics/logs, metrics, and route exposure.
- [x] Confirm the deployed k0s API image contains the renew body fix and make
      `pnpm smoke:renew` pass against OpenSandbox.
- [x] Keep the existing OpenSandbox behavior and k0s smoke tests passing.

Verification gate:
- [x] Unit tests prove route handlers and scheduler can run against a fake
      runtime provider.
- [x] Existing OpenSandbox create, run, logs, files, metrics, route, renew, and
      delete smoke paths still pass. Current evidence covers create, run, logs,
      files, metrics, route, browser e2e, CLI run, SDK run, delete, and the
      targeted renew path. Latest split-provider evidence: API image
      `sha256:66847f882e1c4967e81b7f1877b55013c47a5fc7f32074a530084f2d46472ce8`,
      `pnpm smoke:renew` sandbox `sbx_sbvBX7hsBO`, `pnpm smoke` sandbox
      `sbx_FgPGFJbKgS`, `pnpm smoke:route` sandbox `sbx_fCL_SdS6jO`, and a
      live runtime-panel probe sandbox `sbx_RKPnWkAAGV` verified files
      (`files=12 cwd=/`), logs (`logs=15`), and metrics
      (`cpu=2 mem=2362`). Cleanup reported `active_sandboxes=0`,
      `active_smoke_keys=0`, and `ready_routes=0`.
- [x] RBAC audit proves Harakiri API has no `pods/exec` or sandbox `pods/log`,
      while OpenSandbox provider RBAC remains narrowly scoped to the provider
      service account.
- [x] Filesystem regression verifies an `open-agents-dev` sandbox shows
      `/workspace` by default and explicit `path=/` returns root entries without
      direct Kubernetes access.

### Phase 3: Builder Provider Refactor
**Status**: Complete
- [x] Create `apps/api/src/builders/image-builder.ts` with an `ImageBuilder`
      interface for Dockerfile builds, image imports, logs, digest reporting,
      cache metadata, and cleanup.
- [x] Move registry digest resolution into a reusable image-import builder.
- [x] Move current Kaniko behavior into
      `apps/api/src/builders/kaniko-builder.ts` without leaking Kaniko names into
      generic build state, logs, tests, or user docs.
- [x] Add a BuildKit design document and implementation plan under
      `docs/template-builds.md` or a dedicated `docs/builders.md`.
- [x] Add the exact rootless BuildKit implementation plan so the current
      archived Kaniko dependency is not treated as the long-term OSS default.
- [x] Implement `BuildKitKubernetesBuilder` and make it the default Dockerfile
      builder in API config and the k0s manifest. The remaining gate is a live
      k0s Dockerfile build smoke, not the code selection.
- [x] Deploy the k0s manifest with builder-neutral Dockerfile selection:
      `TEMPLATE_DOCKERFILE_BUILDER=buildkit`,
      `TEMPLATE_BUILDKIT_IMAGE=moby/buildkit:rootless`, rootless BuildKit
      daemon flags, and explicit in-cluster registry insecure handling.
- [x] Adjust the BuildKit Job for the current k0s/containerd runtime after
      live smoke failures exposed rootlesskit requirements: keep the builder
      non-root and non-privileged, but allow the AppArmor/seccomp behavior
      rootless BuildKit needs for `newuidmap` and mount namespace setup.
- [x] Update provenance to record generic builder metadata first, with
      provider-specific details nested under `builderDetails`.
- [x] Update config names from Kaniko-specific defaults to builder-neutral names.
      `TEMPLATE_DOCKERFILE_BUILDER` and
      `TEMPLATE_LEGACY_DOCKERFILE_BUILDER_IMAGE` are available, with the old
      Kaniko image variable retained as a compatibility alias.
- [x] Update tests so generic builder contract tests do not assert Kaniko-only
      strings.

Verification gate:
- [x] Dockerfile builds can be exercised through the `ImageBuilder` interface.
- [x] Build logs, provenance, template version metadata, CLI output, and website
      docs no longer require Kaniko terminology for the default flow.
- [x] BuildKit unit coverage verifies the generated rootless Kubernetes Job,
      buildctl args, registry credential mount, cache/export settings, and
      pushed-digest parsing from plain BuildKit output.
- [x] Current BuildKit implementation checkpoint:
      `pnpm --filter @harakiri/api test` reports 133/133 passing,
      `pnpm --filter @harakiri/shared test` reports 5/5 passing,
      `pnpm --filter @harakiri/sdk test` reports 7/7 passing,
      `pnpm --filter @harakiri/cli test` reports 24/24 passing,
      `pnpm --filter @harakiri/web test` reports 10/10 passing,
      `pnpm --filter @harakiri/api typecheck`,
      `pnpm --filter @harakiri/api build`, `pnpm typecheck`,
      `bash -n infra/scripts/template-build-smoke.sh`, and
      `git diff --check`.
- [x] Current k0s deployment checkpoint: the API image and k0s manifest have
      been redeployed with BuildKit as the Dockerfile builder after fixing the
      rootless BuildKit `newuidmap` and rootlesskit mount-sharing failures.
- [x] A live k0s `pnpm smoke:template-build` or equivalent CLI template build
      proves the rootless BuildKit Job can push to the configured registry and
      produce a ready template version.
- [x] Strengthen the live template-build smoke to assert the completed build
      recorded `builder=buildkit` and `builderDetails.provider=buildkit`, so a
      future legacy-provider fallback cannot satisfy the default-builder gate
      unnoticed.
- [x] Latest live BuildKit smoke checkpoint: after redeploying API image
      `sha256:3e4ce24870a9f37435ae543f43026401083b6c42fc46a312ad5b5a695c6bb321`,
      `pnpm smoke:template-build` passed with build `bld_61ukPTP4u_EF`,
      version `tplv_e-Xyjz2FiZEt`, digest
      `sha256:f6eee0166e843165d3643c1d1ea266a3653a96eea7c121e7ad2b7513d2922afc`,
      sandbox `sbx_Vf-5JG5-U8`, runtime preflight `ok`, and the smoke asserted
      `metadata.builder=buildkit` plus
      `metadata.builderDetails.provider=buildkit`.
- [x] If Kaniko remains temporarily available, it is documented as a legacy
      implementation rather than the architecture default.

### Phase 4: Storage Interfaces For Build Artifacts
**Status**: Complete
- [x] Introduce `BlobStore` for build contexts and future artifacts.
- [x] Introduce `BuildLogStore` for append/read build logs.
- [x] Provide a local filesystem implementation suitable for OSS development.
- [x] Keep PostgreSQL-backed implementations available for migration
      compatibility or tests where useful.
- [x] Add optional S3/MinIO documentation without making object storage required
      for a local contributor.
- [x] Move direct `template_build_contexts.archive` reads/writes behind the
      storage interface.
- [x] Move build log append/read code behind the log interface.

Verification gate:
- [x] Template build context upload, export, retention, and log streaming work
      through the storage interfaces.
- [x] Tests cover filesystem-backed storage and the existing PostgreSQL path.

### Phase 5: API Domain Modularization
**Status**: Complete
- [x] Split `apps/api/src/routes.ts` into domain routers:
      `auth/bootstrap`, `sandboxes`, `sandbox-routes`, `templates`,
      `template-builds`, `registry-credentials`, `api-keys`, `usage`, and
      `org-settings`.
- [x] Extract public system routes (`/health`, `/v1/bootstrap`) into
      `apps/api/src/routes/system.ts`.
- [x] Extract account routes (`/v1/me`, onboarding completion) into
      `apps/api/src/routes/account.ts`.
- [x] Extract `template-builds` routes into
      `apps/api/src/routes/template-builds.ts`; keep
      `apps/api/src/routes/template-shared.ts` as a compatibility re-export for
      template policy response helpers.
- [x] Extract `api-keys` routes into `apps/api/src/routes/api-keys.ts`.
- [x] Extract sandbox runtime-panel routes into
      `apps/api/src/routes/sandbox-runtime.ts`.
- [x] Extract `registry-credentials` routes into
      `apps/api/src/routes/registry-credentials.ts`.
- [x] Extract `usage` routes into `apps/api/src/routes/usage.ts`.
- [x] Extract `org-settings` routes into
      `apps/api/src/routes/org-settings.ts`.
- [x] Extract sandbox lifecycle routes into
      `apps/api/src/routes/sandboxes.ts`.
- [x] Extract template list/create/detail/versions/promote/archive routes into
      `apps/api/src/routes/templates.ts`.
- [x] Move Zod schemas into domain-local schema files or a shared API contract
      package.
- [x] Move template-build Zod schemas into
      `apps/api/src/routes/template-builds.schema.ts`.
- [x] Move API-key Zod schemas into
      `apps/api/src/routes/api-keys.schema.ts`.
- [x] Move sandbox runtime-panel Zod schemas into
      `apps/api/src/routes/sandbox-runtime.schema.ts`.
- [x] Move registry credential Zod schemas into
      `apps/api/src/routes/registry-credentials.schema.ts`.
- [x] Move organization settings Zod schemas into
      `apps/api/src/routes/org-settings.schema.ts`.
- [x] Move sandbox lifecycle Zod schemas into
      `apps/api/src/routes/sandboxes.schema.ts`.
- [x] Move template create/promote Zod schemas into
      `apps/api/src/routes/templates.schema.ts`.
- [x] Move SQL query builders and row mappers out of handlers.
- [x] Move template-build SQL query builders and row mappers into
      `apps/api/src/services/template-builds.ts`.
- [x] Move API-key SQL query builders and token-generation persistence into
      `apps/api/src/services/api-keys.ts`.
- [x] Move sandbox runtime-panel SQL, runtime calls, route exposure, logs,
      files, and metrics orchestration into
      `apps/api/src/services/sandbox-runtime.ts`.
- [x] Move registry credential SQL, host normalization, secret encryption,
      redaction, upsert, listing, and revoke logic into
      `apps/api/src/services/registry-credentials.ts`.
- [x] Move usage aggregation SQL and row mapping into
      `apps/api/src/services/usage.ts`.
- [x] Move organization settings read/update SQL and patch merging into
      `apps/api/src/services/org-settings.ts`.
- [x] Move sandbox lifecycle SQL, template resolution/readiness checks, runtime
      create/delete/renew calls, schedule insertion, route-policy metadata,
      sandbox events, and audit orchestration into
      `apps/api/src/services/sandboxes.ts`.
- [x] Move template create/version/promote/archive SQL, slug generation,
      template policy checks, active-build cancellation, and audit
      orchestration into `apps/api/src/services/templates.ts`, with reusable
      template policy response helpers in
      `apps/api/src/services/template-policies.ts`.
- [x] Move account organization/user lookup and onboarding completion SQL into
      `apps/api/src/services/account.ts`.
- [x] Move default sandbox event persistence out of `routes.ts` into
      `apps/api/src/services/sandbox-events.ts`.
- [x] Move template build context upload transaction, Dockerfile base-image
      policy checks, blob storage, build metadata update, and build-log append
      orchestration into `apps/api/src/services/template-builds.ts`.
- [x] Add explicit service functions for sandbox creation, template build
      enqueueing, route creation, and organization settings updates.
- [x] Add explicit template-build service functions for listing, reading logs,
      enqueueing, canceling, retry source lookup, and context persistence.
- [x] Add explicit API-key service functions for listing, creating, and
      revoking organization-scoped keys.
- [x] Extract sandbox runtime panel routes (`terminal`, `files`, `logs`,
      `metrics`, and `network`) into a sandbox domain router/service while
      preserving the latest filesystem contract: default workdir, explicit root
      browsing, provider-unavailable responses, and no false empty lists.
- [x] Add explicit sandbox runtime-panel service functions for command run,
      files, logs, metrics, route list, route create, and route delete.
- [x] Add explicit registry credential service functions for listing, upserting,
      and revoking credentials.
- [x] Add explicit usage and organization settings service functions.
- [x] Add explicit sandbox lifecycle service functions for listing, reading,
      creating, deleting, and renewing sandboxes.
- [x] Add explicit template service functions for listing, reading, creating,
      version listing, promotion, and archive/cancel behavior.
- [x] Add explicit account service functions for current-account lookup and
      onboarding completion.
- [x] Add unit tests for service functions without Fastify.
- [x] Add template-build service tests without Fastify.
- [x] Add API-key service tests without Fastify.
- [x] Add sandbox runtime-panel service tests that cover filesystem success,
      provider-unavailable 502 behavior, control-plane plus provider logs, and
      metrics fallback.
- [x] Add registry credential service tests for revoked filtering, host
      normalization, encryption/redaction, encryption failures, and revocation.
- [x] Add usage and organization settings service tests without Fastify.
- [x] Add sandbox lifecycle service tests without Fastify for filtered listing,
      provider-backed creation, schedule persistence, event/audit metadata,
      injected-provider delete refs, and renew refs.
- [x] Add template service tests without Fastify for create, version listing,
      promote, and archive/cancel audit behavior.
- [x] Add account service tests without Fastify for current-account lookup and
      idempotent onboarding completion audit behavior.
- [x] Add sandbox event recorder service tests without Fastify.
- [x] Add template build context upload transaction tests without Fastify.
- [x] Keep route paths and response payloads backward-compatible unless an
      intentional API change is recorded in the decision log.

Verification gate:
- [x] API tests still pass for the extracted account, template, template-build,
      API-key, sandbox runtime-panel, registry credential, usage, org settings,
      and sandbox lifecycle domains. Current checkpoint after the latest
      requested-async/timeout create slice: 129/129 API tests pass.
- [x] `routes.ts` becomes a small composition root rather than the main business
      logic container.
- [x] Template build context upload transaction SQL is moved out of
      `apps/api/src/routes/template-builds.ts`.

### Phase 6: Sandbox Lifecycle State Machine And Outbox
**Status**: Complete
- [x] Define explicit sandbox states and allowed transitions in shared code.
- [x] Add a `sandbox_operations` or `control_plane_outbox` table for
      provision, sandbox delete, renew, and route exposure intents.
- [x] Add either dedicated reconciliation operation kinds or a separate
      reconciler state model for provider-created/control-plane-failed
      resources. Phase 6 now reconciles stale running provision operations by
      provider metadata before failing safe.
- [x] Change `POST /v1/sandboxes` to write a pending sandbox row and durable
      provision operation before calling the runtime provider.
- [x] Let a worker provision queued sandboxes through the runtime provider,
      using encrypted env replay storage or a provider-backed secret reference
      instead of raw env in `sandbox_operations.request`.
- [x] Add an explicit public create contract for requested async provision
      paths: `202 { sandbox, operation }`, a stable operation summary shape,
      and `Location`/`Retry-After` headers for polling/refresh.
- [x] Add the same pending response fallback for timed-out synchronous create
      waits when provider provisioning exceeds the request budget.
- [x] Keep synchronous create behavior for CLI/web by waiting on the operation
      result when requested, with a timeout and the pending response fallback
      above when the provider path does not complete within the request budget.
- [x] Keep synchronous create behavior for CLI/web on the current fast path:
      create still returns `{ sandbox }` after provider provisioning succeeds,
      and returns a structured `sandbox_provision_failed` error with the
      persisted failed operation when provider creation fails.
- [x] Add idempotency keys for create, sandbox delete, renew, and route-expose
      operations.
- [x] Sandbox delete, renew, and route-expose lifecycle calls now create
      operation records before provider calls and complete/fail the operation
      around the provider/DB mutation.
- [x] Renew execution now computes a concrete `expiresAt` once per execution,
      passes it through the runtime provider, updates `sandboxes.expires_at` to
      the same timestamp, and records `expiresAt` in the completed operation
      result for both request-time and worker paths.
- [x] Make operation claiming atomic for background workers, using one
      transactional lease/claim query with bounded attempts instead of a
      non-transactional `SELECT ... FOR UPDATE` pattern.
- [x] Replace the immediate synchronous lifecycle execution path
      (`startSandboxOperation` in create/delete/renew/route exposure) with a
      transactionally safe helper or reuse of the worker claim/execute path, so
      API fast-path execution and background execution share one concurrency
      model.
- [x] Teach scheduler/reconciler to complete, retry, or mark failed operations
      with clear max-attempt and stale-lock rules for queued provision, sandbox
      delete, renew, and route exposure. Stale running provision operations are
      reconciled by provider metadata and otherwise failed safe.
- [x] Add tests for provider failure, duplicate requests, and operation state
      transitions.
- [x] Add tests for DB failure after provider creation and
      retry-safe cleanup.
- [x] Add operation-worker tests for queued provision, route exposure, sandbox
      delete retry, renew execution, max-attempt exhausted failure,
      non-retryable failure, encrypted operation secrets, atomic claiming, and
      stale lease cleanup primitives.
      Coverage now includes provider-created stale provision adoption and
      unmatched stale provision fail-safe behavior.

Verification gate:
- [x] A provider failure does not create an unreconcilable DB state.
- [x] A DB failure after provider creation is either impossible by design or is
      recovered by reconciliation. Current behavior adopts a provider sandbox
      with matching Harakiri metadata and fails safe without blind replay when
      no exact provider match is visible.
- [x] Existing CLI and web create flows still feel synchronous for normal cases.
- [x] SDK, CLI, and web create flows handle a `202` pending response without
      throwing or pretending the sandbox is already running.
- [x] Current unit/typecheck evidence for the synchronous-operation slice:
      `pnpm --filter @harakiri/api test`, `pnpm --filter @harakiri/shared test`,
      `pnpm typecheck`, and `git diff --check`.
- [x] Current unit/typecheck evidence for the requested-async and timeout
      create slice:
      `pnpm --filter @harakiri/api test` reports 130/130 passing,
      `pnpm --filter @harakiri/cli test` reports 24/24 passing,
      `pnpm --filter @harakiri/sdk test` reports 7/7 passing,
      `pnpm --filter @harakiri/shared test` reports 5/5 passing,
      `pnpm typecheck`, and `git diff --check`.
- [x] Live renew smoke evidence after the OpenSandbox `expiresAt` body fix:
      deployed API image
      `sha256:66847f882e1c4967e81b7f1877b55013c47a5fc7f32074a530084f2d46472ce8`,
      `pnpm smoke:renew` passed with sandbox `sbx_sbvBX7hsBO`, the latest renew
      operation was `succeeded` with `expiresAt=2026-05-24T22:01:28.361Z`, and
      cleanup reported `active_sandboxes=0` plus `active_smoke_keys=0`.
      Focused verification for this slice also passed:
      `pnpm --filter @harakiri/api test` reports 133/133 passing,
      `pnpm --filter @harakiri/api typecheck`, `pnpm openapi:check`,
      `bash -n infra/scripts/renew-smoke.sh`, and targeted `git diff --check`.
- [x] Normal Web/API/CLI/SDK create flows remain synchronous on k0s. The
      strengthened Playwright e2e command
      `HARAKIRI_CLI_BIN=$PWD/packages/cli/dist/index.js pnpm exec playwright test tests/e2e/harakiri.spec.ts -g "real Web, API, CLI, and SDK sandbox workflows"`
      passed. It now asserts the Web detail page reaches `running`, API create
      returns `201` with no pending operation, CLI create prints `sealed.` and
      not `queued.`, and SDK create returns a running sandbox with no pending
      operation. Cleanup audit reported `active_sandboxes=0`,
      `active_smoke_keys=0`, and `running_real_e2e=0`; latest real-flow
      sandboxes were `sbx_1N2qvnovDG` (web), `sbx_RuQeZB0DHn` (CLI), and
      `sbx_iR508mdojC` (SDK), all terminated.

### Phase 7: Shared Contracts, SDK, And CLI Refactor
**Status**: Complete
- [x] Move low-level sandbox lifecycle primitives into shared code:
      `SandboxStatus`, allowed sandbox status transitions, sandbox operation
      kinds, and sandbox operation states.
- [x] Move primary success request/response types into `packages/shared` for
      sandbox lifecycle, sandbox runtime panels, routes, templates, template
      builds, API keys, account/onboarding, organization settings, and generic
      `{ ok }` responses.
- [x] Move shared error shapes into `packages/shared` or a dedicated
      `packages/contracts` package.
- [x] Add shared create-sandbox result types that cover both
      `201 { sandbox }` and `202 { sandbox, operation }`.
- [x] Use shared success contracts from the web API client, SDK, and CLI.
- [x] Use shared API error parsing/formatting from the web API client, SDK,
      and CLI request layers.
- [x] Annotate API handlers and service mappers against the shared response
      contracts so server payload drift is caught at compile time.
- [x] Decide whether the shared TypeScript contracts are enough for the next
      OSS milestone or whether to publish OpenAPI/JSON Schema from the same
      source.
- [x] Implement OpenAPI 3.1 contract publication from a dedicated contract
      source and add a drift check that keeps API handlers, SDK helpers, CLI
      behavior, and docs aligned.
- [x] Extract the SDK request layer into a reusable client used by the CLI.
- [x] Add SDK helper coverage for CLI-needed runtime reads, including sandbox
      logs and filesystem listing.
- [x] Split `packages/cli/src/index.ts` into command modules:
      `auth`, `sandboxes`, `templates`, `routes`, `registry-credentials`, and
      `config`.
- [x] Add command-level tests for all split CLI modules.
- [x] Document CLI packaging for source builds, npm installation, and binary
      execution without requiring `node packages/cli/dist/index.js`.

Verification gate:
- [x] CLI behavior and formatting remain compatible with existing tests.
- [x] SDK, CLI, and web API clients type-check against the shared success
      contract wrappers. Current checkpoint: `pnpm --filter @harakiri/shared
      build`, `pnpm --filter @harakiri/shared test`, `pnpm --filter
      @harakiri/sdk test`, `pnpm --filter @harakiri/cli test`, `pnpm
      typecheck`, and `git diff --check`.
- [x] API route/service contract annotations are covered by the API suite.
      Current checkpoint after shared error envelopes and server annotations:
      `pnpm --filter @harakiri/api test` reports 130/130 passing,
      `pnpm --filter @harakiri/shared test` reports 5/5 passing,
      `pnpm --filter @harakiri/sdk test` reports 7/7 passing,
      `pnpm --filter @harakiri/cli test` reports 24/24 passing,
      `pnpm typecheck`, and `git diff --check`.
- [x] SDK and CLI no longer duplicate endpoint wiring for current CLI product
      calls. CLI test/build/typecheck scripts build the SDK first because the
      CLI imports the packaged SDK entrypoint in workspace mode.
- [x] CLI command-module split is covered by command tests for auth/login,
      config/banner, templates, sandboxes, routes, files, and registry
      credentials.
- [x] CLI packaging documentation is verified against `pnpm cli:pack`; the
      generated tarball includes runtime files and README only, not compiled
      tests.
- [x] OpenAPI publication is verified with `pnpm openapi:check`; the shared
      route-surface test covers 39 method/path pairs, and the API suite verifies
      `GET /openapi.json` is served without authentication.
- [x] Renew route contract drift is corrected: `POST /v1/sandboxes/{id}/renew`
      now publishes `OkResponse`, matching the route's `{ ok: true }` payload,
      and `pnpm openapi:check` passes after regenerating `docs/openapi.json`.

### Phase 8: Web Application Modularization
**Status**: Complete
- [x] Split `apps/web/src/main.tsx` into route modules and feature components:
      landing, docs, onboarding, dashboard shell, sandboxes, sandbox detail,
      templates, API keys, usage, and settings.
- [x] Extract product docs data from component code into structured data or MDX
      without changing the current app navigation.
- [x] Extract the docs route renderer into `apps/web/src/routes/docs.tsx` and
      keep the route selection state in a route-owned helper.
- [x] Extract the landing route into `apps/web/src/routes/landing.tsx` without
      changing the hero, terminal banner, feature grid, or calls to action.
- [x] Extract shared visual primitives into `apps/web/src/components/`:
      brand marks, icon renderer, top navigation, form field wrapper, and chart.
- [x] Move the shared route union into `apps/web/src/routes/types.ts` so route
      modules no longer depend on a type declared inside `main.tsx`.
- [x] Extract API client code by domain while preserving the existing `api`
      facade consumed by the current UI.
- [x] Extract shared byte/date formatting helpers into `apps/web/src/format.ts`
      so templates and runtime panels no longer carry local formatter copies.
- [x] Extract the sandbox detail route and its terminal, filesystem, logs,
      metrics, and network panels into
      `apps/web/src/routes/sandbox-detail.tsx` without changing the current tab
      flow.
- [x] Extract the sandboxes dashboard list, filters, empty states, and create
      modal into `apps/web/src/routes/sandboxes.tsx` while preserving the
      current `openSandbox` callback and `api` facade behavior.
- [x] Extract the small dashboard routes for usage, API keys, and organization
      settings into `apps/web/src/routes/usage.tsx`,
      `apps/web/src/routes/api-keys.tsx`, and
      `apps/web/src/routes/settings.tsx` while preserving the dashboard shell
      navigation and existing `api` facade behavior.
- [x] Extract onboarding into `apps/web/src/routes/onboarding.tsx` and move
      default workspace derivation into `apps/web/src/workspace.ts`, preserving
      the existing account, workspace, API-key, hello-sandbox, and dashboard
      redirect behavior.
- [x] Extract the authenticated dashboard shell into
      `apps/web/src/routes/dashboard-shell.tsx`, preserving navigation,
      organization fallback state, sign-out, and child route composition.
- [x] Extract template management into `apps/web/src/routes/templates.tsx`,
      preserving the List/Builds tabs, create-template modal, build details,
      version promotion/archive controls, and docs links. Remove the temporary
      `renderTemplates` callback so `DashboardShellRoute` owns its child route
      composition directly.
- [x] Harden route-level Node tests by making Vite env reads in the web auth
      and API request layers tolerate non-Vite test execution.
- [x] Keep design tokens centralized and preserve current visual fidelity.
      The route split kept the existing CSS token source in `styles.css`,
      route-specific styles in `styles-app.css`/`styles-landing.css`, and
      component/route modules on existing class names and `var(...)` tokens.
- [x] Add focused render/import tests for extracted docs, sandbox detail, and
      template route modules.
- [x] Add focused authenticated smoke tests for onboarding redirect and the
      onboarding account/workspace/API-key flow.
- [x] Add focused authenticated smoke tests for sandbox detail tabs, filesystem
      workdir/default-root behavior, templates list/builds tabs, and docs
      rendering.

Verification gate:
- [x] Current docs-extraction checkpoint: `pnpm --filter @harakiri/web test`
      reports 2/2 passing, `pnpm --filter @harakiri/web typecheck`,
      `pnpm --filter @harakiri/web build`, `git diff --check`, and a
      Playwright browser smoke of `/#docs` passed with screenshot
      `/tmp/harakiri-docs-modularization.png`.
- [x] Current docs-route extraction checkpoint: `pnpm --filter @harakiri/web
      test` reports 3/3 passing, `pnpm --filter @harakiri/web typecheck`,
      `pnpm --filter @harakiri/web build`, `git diff --check`, and a
      Playwright smoke of `/#docs` passed with screenshot
      `/tmp/harakiri-docs-route-extraction.png`.
- [x] Current API-client extraction checkpoint: `pnpm --filter @harakiri/web
      test` reports 3/3 passing, `pnpm --filter @harakiri/web typecheck`,
      `pnpm --filter @harakiri/web build`, `git diff --check`, and a
      Playwright smoke loaded `/#landing` and `/#docs` without browser errors;
      screenshot `/tmp/harakiri-web-api-client-split.png`.
- [x] Current landing/shared UI extraction checkpoint: `pnpm --filter
      @harakiri/web test` reports 3/3 passing, `pnpm --filter @harakiri/web
      typecheck`, `pnpm --filter @harakiri/web build`, `git diff --check`, and
      a Playwright smoke verified the landing hero, top nav, terminal banner,
      six feature cards, and docs route with screenshot
      `/tmp/harakiri-landing-route-extraction.png`.
- [x] Current sandbox-detail route extraction checkpoint: `pnpm --filter
      @harakiri/web test` reports 4/4 passing, `pnpm --filter @harakiri/web
      typecheck`, `pnpm --filter @harakiri/web build`, `git diff --check`, and
      a Playwright smoke loaded `/#landing` and `/#docs` without browser
      errors; screenshot
      `/tmp/harakiri-sandbox-detail-route-extraction.png`. The current detail
      coverage proves module import/render and compile-time contracts; the
      authenticated runtime tab smoke is now covered by the final Phase 8
      checkpoint below.
- [x] Current sandboxes route extraction checkpoint: `pnpm --filter
      @harakiri/web test` reports 5/5 passing, `pnpm --filter @harakiri/web
      typecheck`, `pnpm --filter @harakiri/web build`, `git diff --check`, and
      a Playwright smoke loaded `/#dashboard/sandboxes` with mocked
      authenticated API responses and verified the list/count/create button;
      screenshot `/tmp/harakiri-sandboxes-route-extraction.png`.
- [x] Current small dashboard route extraction checkpoint: `pnpm --filter
      @harakiri/web test` reports 6/6 passing, `pnpm --filter @harakiri/web
      typecheck`, `pnpm --filter @harakiri/web build`, `git diff --check`, and
      a Playwright smoke loaded `/#dashboard/metrics`, `/#dashboard/keys`, and
      `/#dashboard/settings` with mocked authenticated API responses;
      screenshot `/tmp/harakiri-small-dashboard-routes-extraction.png`.
- [x] Current onboarding route extraction checkpoint: `pnpm --filter
      @harakiri/web test` reports 8/8 passing, `pnpm --filter @harakiri/web
      typecheck`, `pnpm --filter @harakiri/web build`, `git diff --check`, and
      Playwright smokes verified the onboarding account/workspace/API-key flow
      plus completed-user redirect from `/#onboarding` to
      `/#dashboard/sandboxes`; screenshots
      `/tmp/harakiri-onboarding-route-extraction.png` and
      `/tmp/harakiri-onboarding-redirect-smoke.png`.
- [x] Current dashboard shell extraction checkpoint: `pnpm --filter
      @harakiri/web test` reports 9/9 passing, `pnpm --filter @harakiri/web
      typecheck`, `pnpm --filter @harakiri/web build`, `git diff --check`, and
      a Playwright smoke loaded `/#dashboard/sandboxes` with mocked
      authenticated API responses and verified shell navigation plus sandboxes
      content; screenshot `/tmp/harakiri-dashboard-shell-extraction.png`.
- [x] Current template route extraction checkpoint: `pnpm --filter
      @harakiri/web test` reports 10/10 passing after adding
      `templates-route.test.ts`; `pnpm --filter @harakiri/web typecheck` and
      `pnpm --filter @harakiri/web build` pass. `main.tsx` is now a small
      application gate/router and `DashboardShellRoute` imports
      `TemplatesRoute` directly.
- [x] Web typecheck/build passes for the current Phase 8 route-module split.
- [x] Current authenticated runtime/templates/docs checkpoint:
      `HARAKIRI_CLI_BIN=$PWD/packages/cli/dist/index.js pnpm exec playwright
      test tests/e2e/harakiri.spec.ts -g "real Web, API, CLI, and SDK sandbox
      workflows"` passed against the deployed k0s stack after extending the
      flow to cover sandbox detail terminal/files/logs/metrics/network tabs,
      filesystem/default-root behavior, templates List/Builds tabs, and docs
      Quickstart/Template builds/API reference navigation. Screenshots:
      `/tmp/harakiri-auth-runtime-tabs.png`,
      `/tmp/harakiri-auth-template-tabs.png`, and
      `/tmp/harakiri-auth-docs.png`.
- [x] Current Phase 8 final local gate: `pnpm --filter @harakiri/web test`
      reports 10/10 passing, `pnpm --filter @harakiri/web typecheck`,
      `pnpm --filter @harakiri/web build`, and `git diff --check` pass.
      Cleanup audit after the authenticated e2e reports `active_sandboxes=0`,
      `active_smoke_keys=0`, and `running_real_e2e=0`.
- [x] Playwright screenshots show no visual regression in the key flows.

### Phase 9: OSS Docs, Examples, And Governance
**Status**: Complete - OSS hygiene, local docs, extension docs, environment split, fresh contributor local-stack proof, and final docs audit are validated
- [x] Add or verify `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`,
      `CODE_OF_CONDUCT.md`, and issue/PR templates.
- [x] Rewrite `README.md` around OSS discovery: what Harakiri is, how to run it
      locally, architecture, examples, CLI, SDK, and how to contribute.
- [x] Add OpenSandbox/Kubernetes boundary documentation that explains which
      runtime paths must go through OpenSandbox and which platform operations
      may use Kubernetes directly.
- [x] Add template security documentation for registry credentials, digest
      pinning, image policy, context validation, scanning/provenance fields,
      retention, visibility, and audit events.
- [x] Split docs into clear audiences:
      contributor docs, operator docs, user/product docs, and example
      environment docs.
- [x] Put harakiri.io Cloudflare/DNS helper scripts under
      `infra/scripts/env/harakiri/` instead of treating them as generic core
      scripts.
- [x] Move harakiri.io and Cloudflare-specific instructions out of core docs and
      keep only explicit environment-specific links to
      `infra/scripts/env/harakiri/`.
- [x] Add a generic local environment guide that does not require Cloudflare or
      the harakiri.io domain.
- [x] Add docs for extension authors: runtime providers, image builders, storage
      backends, auth providers, and scanner hooks.
- [x] Update website product docs for any user-visible workflow changed by this
      refactor.

Verification gate:
- [x] Current docs checkpoint: `docs/opensandbox-boundaries.md`,
      `docs/template-security.md`, `docs/builders.md`, `docs/storage.md`,
      `docs/openapi.json`, `packages/cli/README.md`, and
      `infra/scripts/env/harakiri/README.md` exist and are linked from the
      current README/runbook where relevant.
- [x] Current OSS hygiene checkpoint: `LICENSE`, `CONTRIBUTING.md`,
      `SECURITY.md`, `CODE_OF_CONDUCT.md`, `.github/pull_request_template.md`,
      `.github/ISSUE_TEMPLATE/bug_report.md`, and
      `.github/ISSUE_TEMPLATE/feature_request.md` exist; package manifests
      declare `Apache-2.0`.
- [x] Current docs verification checkpoint: `README.md` now points to the
      generic contributor path, `docs/README.md` indexes docs by audience,
      `docs/development.md` documents runtime-free local development,
      `docs/extensions.md` documents extension interfaces, the core runbook
      links out to environment-specific harakiri.io details, website docs
      include packaged CLI install and `/openapi.json`, and focused checks
      passed across API, web, CLI, SDK, shared contracts, workspace build, and
      `git diff --check`.
- [x] Current local-stack proof checkpoint: `docker compose config` passes with
      overrideable host ports; Keycloak starts with `LOCAL_KEYCLOAK_PORT=18181`
      and serves the imported `harakiri` realm OIDC discovery document;
      `pnpm db:migrate` and `pnpm db:seed` pass; the seeded API key can call a
      local `HARAKIRI_RUNTIME_PROVIDER=dev` API; and the CLI can create, run,
      expose, list, and kill a dev-runtime sandbox from a clean temporary home.
- [x] Current docs-audience audit checkpoint: no active product docs or package
      help mention the removed comparison target, the stale database-centered
      control-plane phrase, or private absolute paths; product examples use
      `127.0.0.1:8080` or `$HARAKIRI_API_URL`; maintainer-specific
      `harakiri.io`, Cloudflare, and k0s port-forward values remain only in
      the runbook, test report, completed historical plans, or
      `infra/scripts/env/harakiri/` docs where they are audience-appropriate.
- [x] A new contributor can follow the README to run tests and a local
      development stack without knowing the current private deployment.
- [x] Product docs and repo docs no longer mention implementation details unless
      they are needed by the intended audience.

### Phase 10: Migration And Compatibility Cleanup
**Status**: Complete
- [x] Add compatibility shims for old config names where needed, with warnings
      and documented removal timing. Current aliases:
      `TEMPLATE_BUILDER_PROVIDER` -> `TEMPLATE_DOCKERFILE_BUILDER` and
      `TEMPLATE_BUILDER_KANIKO_IMAGE` ->
      `TEMPLATE_LEGACY_DOCKERFILE_BUILDER_IMAGE`, documented as removable no
      earlier than `0.3.0`.
- [x] Update Kubernetes manifests and scripts to use provider-neutral and
      builder-neutral configuration. Current checkpoint: generic k0s defaults
      use local public API/Keycloak URLs, `sandbox.localhost` sandbox routes,
      rootless BuildKit builder selection, web image build args for public Vite
      config, deploy-time ConfigMap patching, OpenSandbox gateway host override,
      wildcard ingress host override, and route TLS mode selection.
- [x] Make fallback route URL generation fully config-driven.
      `apps/api/src/providers/runtime/route-targets.ts` now owns DNS-safe route
      keys, route host extraction, route URL generation, and configured
      fallback target creation. The sandbox runtime service, operation worker,
      development runtime provider, and OpenSandbox route helper use this
      shared path.
- [x] Update smoke scripts to target core behavior and keep harakiri.io scripts
      separate. Core smokes use local forwarded API/gateway/ingress defaults,
      while Cloudflare/DNS public-route checks are surfaced under
      `pnpm env:harakiri:*`.
- [x] Remove stale Kaniko references from docs, UI copy, CLI output, and generic
      tests once BuildKit is the default. Current audit: no Kaniko mentions
      remain in the web, CLI, SDK, or shared packages; generic API builder
      tests use BuildKit/builder-neutral language; remaining mentions are
      limited to the legacy builder implementation/tests, legacy-provider docs,
      compatibility env aliases, ADR/history, and historical test-report
      evidence.
- [x] Run full verification:
      `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm smoke`,
      `pnpm smoke:templates`, `pnpm smoke:template-build`,
      `pnpm smoke:route`, `pnpm e2e`, and `git diff --check`.
- [x] Record final verification evidence in `docs/test-report.md`, with a
      current Phase 10 section that separates portable OSS defaults from the
      historical harakiri.io environment evidence already present in the file.

Verification gate:
- [x] The current prototype behavior remains working after the architecture
      refactor and after route domains are configurable end-to-end.
- [x] The repository reads as an open-source platform, not a single deployment
      snapshot. Phase 9 now records the fresh-contributor and docs-audience
      audit evidence.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-05-24 | Treat this as a full execution plan | The refactor cuts across API, runtime, builder, storage, web, CLI, SDK, docs, and tests. | Lightweight plan, but that would lose decision history and phase boundaries. |
| 2026-05-24 | Keep OpenSandbox as the default runtime provider but hide it behind `RuntimeProvider` | The product is intentionally a control plane on top of OpenSandbox, while OSS contributors need a clear provider boundary. | Keep a concrete `openSandbox` singleton; introduce multiple providers immediately. |
| 2026-05-24 | Make rootless BuildKit the target default builder and isolate Kaniko as legacy | Kaniko is archived/read-only, while BuildKit is the current Docker builder backend and supports Kubernetes/rootless operation. | Keep Kaniko as default; use Docker-in-Docker; require external CI builders only. |
| 2026-05-24 | Separate core OSS docs from harakiri.io environment docs | The open-source project should be reusable without Cloudflare, harakiri.io, or the current local tunnel setup. | Leave all deployment notes in README; remove the harakiri.io examples completely. |
| 2026-05-24 | Treat OpenSandbox provider RBAC as distinct from Harakiri runtime permissions | OpenSandbox may need Kubernetes permissions to implement its own APIs, such as `pods/log` for legacy diagnostics. Harakiri API should still not receive sandbox `pods/log` or `pods/exec`. | Give Harakiri direct sandbox pod permissions; disable runtime logs until stable diagnostics exists. |
| 2026-05-24 | Use provider-owned fallbacks for OpenSandbox gaps | Latest OpenSandbox returns `501` for stable scoped diagnostics and `/files/search` can fail on recursive root search. Fallbacks through OpenSandbox diagnostics and `execd` keep behavior working without Kubernetes escape hatches. | Reintroduce direct Kubernetes logs/exec; show empty UI states on provider errors; block filesystem root browsing. |
| 2026-05-24 | Default sandbox filesystem browsing to template workdir | Templates such as `open-agents-dev` declare `/workspace` as the useful user workspace, while root contains system directories and may trigger provider search edge cases. | Always open `/`; add template-specific frontend special cases. |
| 2026-05-24 | Land interface contracts before moving call sites | The refactor touches API, scheduler, builder, storage, CLI, SDK, and web. Writing contracts first makes the migration reviewable and gives contributors a stable map before code motion. | Move concrete files first and infer interfaces later. |
| 2026-05-24 | Start runtime extraction with an adapter before moving OpenSandbox transport code | Switching API routes and scheduler to `RuntimeProvider` first reduces risk and preserves behavior while the large `opensandbox.ts` transport module is split in a later Phase 2 pass. | Move transport code and call sites in one change. |
| 2026-05-24 | Add an explicit in-memory runtime provider for local/test use | OSS contributors need a runtime-free path for tests and local API work. `HARAKIRI_RUNTIME_PROVIDER=dev` keeps the API, CLI, SDK, and UI surfaces exercisable without OpenSandbox. | Keep relying only on hidden `osbx_` fallback IDs inside the OpenSandbox transport. |
| 2026-05-24 | Remove fake sandbox fallback from OpenSandbox transport | The OpenSandbox provider should fail when OpenSandbox cannot create or access a sandbox. Runtime-free local behavior now belongs to the explicit in-memory provider. | Keep `osbx_` fallback IDs and fake terminal/files/logs behavior inside OpenSandbox transport. |
| 2026-05-24 | Add route and scheduler fake-provider tests before larger service extraction | The runtime boundary should be testable before splitting all route domains. Injecting auth/query/audit/event dependencies keeps real Fastify route tests possible without PostgreSQL or Keycloak. | Wait for Phase 5 domain router extraction before testing route handlers with fake runtime providers. |
| 2026-05-24 | Extract image-import digest resolution before Dockerfile builder migration | Image imports are lower risk than Dockerfile builds and let the existing template worker exercise the `ImageBuilder` contract before Kaniko/BuildKit code moves. | Start by moving Kaniko Job creation first. |
| 2026-05-24 | Isolate the current Dockerfile builder as `KanikoLegacyBuilder` before adding BuildKit | The prototype Dockerfile path must keep working while generic build orchestration moves behind `ImageBuilder`; using `kaniko-legacy` in provider-specific details makes the default BuildKit migration explicit. | Replace Kaniko and BuildKit in one step; keep Dockerfile build code inside `template-builder.ts`. |
| 2026-05-24 | Keep PostgreSQL storage as the active default while adding filesystem storage implementations | The prototype already stores build contexts and logs in PostgreSQL. Wrapping that path first reduces migration risk while giving OSS contributors concrete local storage interfaces to extend. | Switch the default to filesystem immediately; add S3/MinIO before local filesystem. |
| 2026-05-24 | Make storage deletes return counts for retention reporting | The scheduler needs deletion counts for logs and contexts without reaching back into table-specific SQL. Counted deletes keep retention reporting compatible across PostgreSQL, filesystem, and future object stores. | Keep direct retention SQL; make retention reports approximate deleted build IDs only. |
| 2026-05-24 | Start API modularization with template-build routes | Template builds already had new builder and storage boundaries, so extracting this domain first reduces `routes.ts` size while keeping behavior covered by route tests. | Split all route domains in one large change; start with sandbox routes. |
| 2026-05-24 | Move template-build SQL into service functions before extracting another router | Route extraction alone left the domain router carrying persistence logic. A service layer gives the next API splits a clearer pattern and enables tests without Fastify. | Keep SQL in the router until all route domains are split. |
| 2026-05-24 | Treat the `open-agents-dev` filesystem regression as a runtime-provider contract checkpoint | The empty filesystem UI was caused by path/listing semantics, not by a need for direct Kubernetes access. The fix verifies default workdir, explicit root browsing, and provider-unavailable behavior through OpenSandbox-owned paths. | Reintroduce direct pod exec; leave the UI to show an empty directory when provider listing fails. |
| 2026-05-24 | Split the BuildKit task into plan-complete and implementation-pending work | The repo now has an `ImageBuilder` boundary and a rootless BuildKit design, but no `BuildKitKubernetesBuilder` implementation. The plan should not imply Kaniko has already been replaced. | Keep the combined checkbox and risk overstating Phase 3 completion. |
| 2026-05-24 | Extract API keys before sandbox runtime panel routes, then extract runtime panels with filesystem regression tests | API keys are a low-risk next domain split. Sandbox panel routes are more behavior-sensitive because files/logs/metrics now depend on provider-owned fallbacks and should move only with explicit service tests. | Move all remaining route domains at once; extract sandbox panels first without new filesystem contract tests. |
| 2026-05-24 | Keep API-key HTTP compatibility while moving persistence into a service | Web, CLI, and SDK already consume `/v1/api-keys`; moving list/create/revoke behind `services/api-keys.ts` reduces `routes.ts` without changing payloads or one-time token behavior. | Redesign API-key responses during the router split; wait for shared contracts before extracting the domain. |
| 2026-05-24 | Move sandbox runtime panels behind a service before broader sandbox lifecycle refactor | Terminal, files, logs, metrics, and network routes depend on provider-owned fallbacks and must stay compatible for web, CLI, and SDK users. Extracting them now reduces `routes.ts` while adding tests for the latest filesystem and logs behavior. | Wait for the full sandbox state-machine/outbox phase; keep runtime panel SQL and provider calls inline until then. |
| 2026-05-24 | Build runtime refs from the injected provider in route/service code | Tests and local development can inject a non-OpenSandbox runtime provider. Runtime references should carry that provider's `kind`, not the globally configured default provider kind. | Keep using the global `runtimeRef` helper from `providers/runtime/index.ts` inside injected route paths. |
| 2026-05-24 | Move registry credential persistence and encryption into a domain service | Registry credentials are shared by template builds and runtime image pulls, so encryption, redaction, host normalization, upsert, and revoke behavior should be tested without Fastify while preserving existing `/v1/registry-credentials` payloads. | Leave encryption and SQL inline until the shared contracts phase; redesign registry credential APIs during extraction. |
| 2026-05-24 | Extract usage and org settings as read/update control-plane domains | These endpoints are UI and SDK-facing but do not depend on OpenSandbox runtime behavior. Moving aggregation, settings reads, and patch merging into services shrinks `routes.ts` while keeping response payloads stable. | Wait until all sandbox/template routes are extracted; redesign usage metrics before modularizing. |
| 2026-05-24 | Move sandbox lifecycle routes behind a service before the state-machine/outbox phase | Create, list, detail, delete, and renew are core CLI/API/UI/SDK workflows. Extracting them now reduces `routes.ts` while preserving synchronous behavior, template readiness checks, runtime provider creation, schedule insertion, route-policy metadata, events, audit records, and current HTTP compatibility until Phase 6 introduces outbox semantics. | Wait for Phase 6 to move lifecycle at the same time as the state machine; redesign create as asynchronous now. |
| 2026-05-24 | Move template CRUD/version/promote/archive behavior behind a service | Templates are the core image interface for API, UI, CLI, and SDK flows. Extracting them now removes the remaining SQL-heavy product domain from `routes.ts`, centralizes reusable template policy response helpers, and keeps create/promote/archive audit behavior testable without Fastify. | Leave template SQL inline until shared contracts; move only the router while keeping service logic in handlers. |
| 2026-05-24 | Extract system and account routes after template routes | Once product domains were extracted, `/health`, `/v1/bootstrap`, `/v1/me`, and onboarding were the only inline handlers keeping `routes.ts` from becoming a composition root. Moving them into system/account routers keeps auth bypass rules explicit and gives onboarding persistence a direct service test. | Leave small handlers inline; wait for a larger auth provider refactor. |
| 2026-05-24 | Move sandbox event recording out of the root router | Sandbox events are used by multiple sandbox domains and should be injectable infrastructure, not SQL embedded in the route composition root. | Keep the default recorder inline because it is small. |
| 2026-05-24 | Move template build context upload transaction into the template-build service | Context upload combines ownership locking, source-type checks, Dockerfile image policy validation, blob storage, metadata update, and build-log append. Keeping that transaction in the service completes the Phase 5 route split and makes the route a pure HTTP mapper. | Leave the transaction in the route until Phase 7 shared contracts; split only the query text without moving validation. |
| 2026-05-24 | Start Phase 6 with a `sandbox_operations` outbox table while preserving synchronous UX | CLI, UI, SDK, and tests expect create/delete/renew/route-expose calls to behave synchronously today. Writing durable operation records before provider calls gives the control plane an audit/retry handle without breaking the existing developer surface. | Switch all lifecycle APIs to asynchronous 202 responses immediately; keep provider calls without operation records until a worker exists. |
| 2026-05-24 | Do not store raw sandbox env values in the operation request payload | Sandbox env may contain user secrets. The initial provision operation stores env keys and runtime/template metadata, then executes synchronously with in-memory env. A later worker-safe retry path needs encrypted env storage or a secrets reference before queued provision can be retried generically. | Store raw env JSON in `sandbox_operations.request`; block env support for operation-backed create. |
| 2026-05-24 | Treat the current `sandbox_operations` implementation as an outbox skeleton, not a completed async queue | Operation rows, idempotency, failure recording, and synchronous fast-path execution are in place, but background leasing, replayable secrets, retry limits, and DB-failure reconciliation are still required before lifecycle operations are truly asynchronous. | Mark Phase 6 complete after adding operation rows; switch APIs to async before a reliable worker exists. |
| 2026-05-24 | Require atomic operation leasing before enabling background lifecycle workers | A worker loop must avoid double execution across API replicas. The current synchronous helper is sufficient for one request path, but a real worker should claim rows transactionally with bounded attempts and stale-lock handling. | Run workers with the current non-transactional start helper; rely on process-level singleton scheduling. |
| 2026-05-24 | Store replayable sandbox env in encrypted operation-secret rows | Provision env can contain user secrets and must not live in the visible operation request JSON. A side table keyed by operation and encrypted with the control-plane secret lets queued provision replay without expanding the blast radius of operation metadata. | Store raw env in `sandbox_operations.request`; block all env-bearing async provision; require an external secret manager before any worker support. |
| 2026-05-24 | Do not blindly requeue stale running provision operations | Delete, renew, and route exposure are idempotent enough for stale lease cleanup. Provision can create a provider sandbox before the process dies, so the worker must first reconcile by provider metadata and otherwise fail safe. | Blindly retry stale provision and risk duplicate provider sandboxes; block queued provision entirely until full reconciliation exists. |
| 2026-05-24 | Reconcile stale provision operations through runtime-provider metadata | Harakiri already sends label-safe sandbox and organization metadata at provider create time. Exposing metadata on `RuntimeSandboxSummary` lets the worker adopt a provider-created sandbox after a control-plane crash without direct Kubernetes access or duplicate creates. | Blindly retry stale provision; leave stale operations running forever; require direct Kubernetes pod lookup. |
| 2026-05-24 | Fail unmatched stale provision operations safe instead of replaying them | If the provider cannot show a metadata match, Harakiri cannot prove whether provider creation happened. Marking the operation failed and the sandbox errored avoids duplicate provider sandboxes while preserving an operator-visible recovery trail. | Retry and risk duplicates; silently ignore stale running provision operations. |
| 2026-05-24 | Treat API domain modularization as complete and shift the API risk to shared contracts | `routes.ts` is now a composition root and domain services have unit tests. The remaining contributor risk is contract drift across API, web, SDK, and CLI, especially around sandbox create pending responses. | Keep Phase 5 open until every client is refactored; move client contract work into route extraction. |
| 2026-05-24 | Keep Phase 6 open after the operation worker landed | The durable queue, encrypted provision env replay, and provider-created reconciliation are in place, but public create still has no explicit `202` pending shape and the synchronous fast path does not yet reuse the worker claim semantics. | Mark Phase 6 complete after worker tests; switch all create calls to async immediately. |
| 2026-05-24 | Add requested-async sandbox create without changing the default fast path | CLI, web, and SDK users still expect a newly created sandbox to be usable after the default call. `wait:false` and `Prefer: respond-async` now expose the durable operation queue intentionally, while preserving `201 { sandbox }` for normal create. | Make every create return `202`; hide operation details until timeout support exists. |
| 2026-05-24 | Use atomic operation-id claims for request-time lifecycle execution | The old request path used a two-statement `SELECT ... FOR UPDATE` helper that was not transactionally meaningful with pool-level queries. A single `UPDATE ... WHERE state IN (...) RETURNING ...` gives create, delete, renew, and route exposure the same atomic state transition expectation as workers. | Keep the old helper; require a transaction client around every request path. |
| 2026-05-24 | Keep slow synchronous create work running in-process after timeout | `waitTimeoutMs` should bound the HTTP request without abandoning the already claimed operation. Returning `202` while the provider call continues lets normal completion update the control plane, and stale-operation reconciliation covers process failure. | Cancel provider create on timeout; avoid timeout support until a separate external worker picks up every create. |
| 2026-05-24 | Pass an explicit expiration timestamp through the runtime renew contract | The current OpenSandbox renew API requires an `expiresAt` body. Computing that timestamp once in Harakiri keeps provider TTL and control-plane `expires_at` aligned for both request-time and worker renew execution. | Keep an empty provider renew call and hope OpenSandbox defaults TTL; update only the database and skip provider renewal; make renew provider-specific inside service code. |
| 2026-05-24 | Centralize primary success payloads before enforcing server-side contract generation | Moving the common request/response wrappers into `@harakiri/shared` immediately reduces drift in the SDK, CLI, and web app while preserving current Fastify route schemas and response mappers. Error envelopes, API handler annotations, and OpenAPI/JSON Schema publication remain a separate Phase 7 decision because they affect validation strategy and public API documentation. | Wait until generated OpenAPI is designed before sharing any client types; move only sandbox create types and leave templates/builds/routes duplicated. |
| 2026-05-24 | Use shared TypeScript contracts to harden server mappers before adding OpenAPI publishing | Annotating API routes and service mappers against `@harakiri/shared` caught real response drift without changing the HTTP surface. Keeping OpenAPI/JSON Schema generation as a separate decision avoids coupling route validation, docs generation, and SDK reuse in one oversized change. | Introduce generated OpenAPI immediately; keep server response typing structural and rely only on client-side types. |
| 2026-05-24 | Make the CLI consume the SDK client instead of owning product endpoint transport | The CLI and SDK were duplicating endpoint paths, auth headers, request formatting, and error handling. Reusing `HarakiriClient` keeps command behavior stable while making the SDK the product API client boundary for both programmatic and command-line interfaces. | Keep a generic CLI `fetch` helper; move all command modules before sharing transport; make the CLI shell out to a separate SDK binary. |
| 2026-05-24 | Split the CLI by command domain while keeping SDK as the only product transport | `index.ts` is now a small composition root and command modules own parsing/presentation for auth, config/banner, templates, sandboxes, routes, and registry credentials. Adding registry credential SDK/CLI methods closes a gap where the API existed but the command-line interface did not expose it. | Leave CLI as one large file; create modules without adding missing registry commands; move presentation into the SDK. |
| 2026-05-24 | Target generated OpenAPI 3.1 for public API contracts | Shared TypeScript types and Zod route schemas catch monorepo drift but are not sufficient for external OSS users, generated clients, docs rendering, or CI contract diffs. ADR 0005 records OpenAPI 3.1 from a dedicated contract source as the target. | Treat TypeScript declarations as the only public contract; maintain only handwritten Markdown examples; add route-local Fastify schemas without a central contract source. |
| 2026-05-24 | Package the CLI from a clean runtime-only `dist/` directory | `pnpm cli:pack` originally included compiled test files because the package build emitted every source file. Cleaning `dist/` and excluding `*.test.ts` keeps the tarball focused on executable runtime code and README. | Keep tests in the tarball; rely on npm ignore patterns only; document `node packages/cli/dist/index.js` as the install path. |
| 2026-05-24 | Publish OpenAPI from the shared package and serve it from the API | The public contract should be usable both as a committed OSS artifact and as a live runtime endpoint. `packages/shared/src/openapi.ts` owns the OpenAPI source, `docs/openapi.json` is generated from it, `pnpm openapi:check` detects stale docs, and `/openapi.json` serves the same document without auth. | Keep only Markdown API docs; generate OpenAPI inside the API package only; require authentication for the contract endpoint. |
| 2026-05-24 | Start web modularization with product docs content extraction | The docs catalog is a large static JSX data block that can move out of `main.tsx` without changing route state, API calls, or layout. This gives Phase 8 an isolated first slice and adds docs-content test coverage before moving interactive dashboard routes. | Start by moving dashboard shell or sandbox detail components; rewrite docs to MDX before extracting route modules. |
| 2026-05-24 | Extract the docs route renderer before dashboard routes | Docs has minimal runtime dependencies and can move behind a route module while preserving `TopNav` injection and session-storage page selection. This proves the route-module pattern with a low-risk browser smoke before touching interactive dashboard state. | Extract shared layout first; move sandbox detail first; keep only docs data extracted until a larger web rewrite. |
| 2026-05-24 | Split the web API client by endpoint domain behind the existing facade | The UI still imports `api` from `apps/web/src/api.ts`, so the safe contributor-facing step is to move account, sandbox, template, API-key, usage, and settings endpoint wiring into `api-client/*` modules without changing component call sites. | Rewrite UI components to import domain clients immediately; leave all endpoint transport in one `api.ts`; introduce React hooks before route modularization. |
| 2026-05-24 | Extract shared visual primitives and the landing route before dashboard routes | Brand, icon, top navigation, field, chart, and the landing route are used broadly but do not depend on live API state. Moving them first reduces `main.tsx` and gives dashboard route extraction reusable UI imports while preserving the existing design tokens and browser-rendered landing page. | Move dashboard shell first; duplicate primitives inside route modules; change CSS/design tokens during extraction. |
| 2026-05-24 | Extract sandbox detail as the next web route before the dashboard shell | The sandbox detail route is behavior-sensitive but bounded: terminal, files, logs, metrics, and network panels all use the existing `api` facade and shared runtime contracts. Moving it now reduces the monolithic entrypoint while preserving the current tab implementation until authenticated runtime smoke tests are added. | Extract dashboard shell first; rewrite runtime panels into hooks during the move; wait until every dashboard route can move in one change. |
| 2026-05-24 | Extract the sandboxes list/create route before template management | The sandboxes route is the primary dashboard workflow and has a compact API surface: list, filter, create, and open detail. Moving it after sandbox detail removes another user-facing dashboard module while keeping templates, usage, keys, and settings untouched. | Extract templates first; move the whole dashboard shell and every child route at once; introduce route loaders/hooks before component movement. |
| 2026-05-24 | Extract usage, API keys, and settings as small dashboard routes before templates | These routes are self-contained, already backed by domain API client modules, and can move without touching the template-builder UI. This further shrinks `main.tsx` while keeping the complex template management surface isolated for a later focused extraction. | Extract templates first; leave small routes inline until the dashboard shell moves; combine all remaining dashboard routes in one change. |
| 2026-05-24 | Extract onboarding before dashboard shell and templates | Onboarding is a bounded authenticated flow with existing API facade calls and a previous redirect bug worth preserving with browser smoke coverage. Moving it now leaves `main.tsx` focused on dashboard composition and the complex template management surface. | Extract dashboard shell first; wait until template route extraction; rewrite onboarding state machine during the move. |
| 2026-05-24 | Extract dashboard shell while delegating template management from `main.tsx` | The shell owns navigation, organization fallback state, and route composition. Moving it now finishes the shared dashboard frame without forcing the large template-management surface into the same change. | Move templates and shell together; leave shell inline until templates are extracted; make every dashboard child route import from the shell. |
| 2026-05-24 | Extract template management last and close the temporary dashboard callback | Templates are the largest stateful web surface, so they moved after smaller routes had established the import/test pattern. With `TemplatesRoute` extracted, the dashboard shell now imports it directly instead of accepting `renderTemplates` from `main.tsx`. | Leave templates in `main.tsx`; keep the callback as long-term shell API; split template subcomponents before route extraction. |
| 2026-05-24 | Record OpenSandbox/Kubernetes boundaries as OSS architecture, not deployment notes | The latest filesystem/logs fixes depend on keeping runtime access through OpenSandbox-owned APIs and fallbacks. A dedicated boundary doc gives contributors a clear rule before future provider cleanup work. | Leave the rule only in the exec plan; document it only in the k0s runbook; reintroduce direct Kubernetes access for difficult panels. |
| 2026-05-24 | Treat template security docs as part of the architecture refactor | Custom images are a core OSS extension point, so registry credentials, digest pinning, policy checks, provenance, scanning, and retention need contributor-facing documentation before BuildKit becomes the default. | Defer template security docs until production hardening; keep the behavior only in tests and implementation files. |
| 2026-05-24 | Implement rootless BuildKit as the default Dockerfile builder through per-build Kubernetes Jobs | The OSS default should avoid the archived Kaniko dependency and Docker-in-Docker. A per-build `moby/buildkit:rootless` Job fits the existing k0s worker model, reuses context export and registry credential mounts, and keeps Kaniko as an explicit compatibility provider. | Keep Kaniko as default; require a long-running BuildKit Deployment first; require privileged Docker-in-Docker for Dockerfile builds. |
| 2026-05-24 | Keep BuildKit rootless while relaxing the pod confinement required by rootlesskit on k0s | Live k0s smoke attempts showed `newuidmap` capability and mount-sharing failures under stricter container settings. Unconfined AppArmor/seccomp on the BuildKit container keeps the build path rootless and non-privileged while satisfying rootlesskit on the current k0s/containerd stack. | Switch back to Kaniko; use privileged Docker-in-Docker; require an external builder service before Dockerfile builds work locally. |
| 2026-05-24 | Make the generic k0s deployment default to local OSS URLs and `sandbox.localhost` routes | The repository should boot without harakiri.io DNS, Cloudflare, or maintainer-specific public URLs. Maintainer deployments can still pass `HARAKIRI_PUBLIC_*` and `HARAKIRI_SANDBOX_ROUTE_*` variables to `deploy-k0s.sh`. | Keep harakiri.io as the default; require manual manifest edits for local contributors. |
| 2026-05-24 | Keep deprecated builder env aliases temporarily with warnings | Existing local deployments may still set `TEMPLATE_BUILDER_PROVIDER` or `TEMPLATE_BUILDER_KANIKO_IMAGE`. Warning shims give users a migration path while the OSS default moves to builder-neutral names and BuildKit. | Remove aliases immediately; silently support aliases forever. |
| 2026-05-24 | Centralize route host generation behind configured route-target helpers | Deployment manifests and OpenSandbox gateway config can override the route domain, so service fallbacks and the dev runtime provider must use the same configured route domain and public scheme as provider routes. | Keep fallback route paths local-only; duplicate route host synthesis in each service. |
| 2026-05-24 | Make local OSS development the source/docs default and keep k0s port-forwards as runbook evidence | Contributors should be able to start from `cp .env.example .env`, Docker Compose, and `HARAKIRI_RUNTIME_PROVIDER=dev` without knowing the maintainer cluster ports. The deployed k0s port-forward values remain valid test evidence, but they are not product defaults. | Keep `18082`/`18084` in CLI help and product docs; require every contributor to use the maintainer k0s forwarding layout. |
| 2026-05-24 | Import a development Keycloak realm through Compose and seed a matching local workspace | Authentication is managed by Keycloak, so a real local auth surface should be available without manual realm setup. The API seed creates the matching user, organization, membership, and demo API key so CLI/API/SDK workflows work immediately. | Keep Keycloak as an unconfigured container; use only `AUTH_DEV_ALLOW` and API keys for local development. |

## Tech Debt Incurred
- OpenSandbox stable scoped diagnostics is not implemented upstream, so Harakiri
  temporarily falls back to the provider's deprecated plain-text diagnostics
  endpoint. Retire this fallback when OpenSandbox exposes stable structured
  diagnostics.
- OpenSandbox `files/search` is a recursive file search, not a first-class
  directory listing API, and can fail on root due to owner lookup edge cases.
  Harakiri currently uses an OpenSandbox `execd` command fallback for immediate
  directory listing. Retire or simplify this when OpenSandbox exposes a native
  directory listing endpoint.
- `apps/api/src/opensandbox.ts` is now only a compatibility re-export. Remove
  it after tests and downstream imports use `providers/runtime/` directly.
- The filesystem HTTP route currently returns only `{ cwd, files }` for success
  even though the provider result includes `defaultCwd`, source, warnings, and
  unavailable-state metadata. Preserve backward compatibility for current
  clients, but expose richer typed metadata when Phase 7 centralizes shared API
  contracts.
- Provision operations intentionally store only sandbox env keys in the request
  JSON. Non-empty env is replayable only when a control-plane secret key is
  configured so the API can store encrypted `sandbox_operation_secrets`; without
  that key, synchronous create still works but a queued env-bearing provision is
  marked non-replayable.
- Stale running provision operations are reconciled only when provider list
  results expose matching Harakiri metadata. Providers that cannot return
  create-time metadata will fail those operations safe instead of creating a
  duplicate sandbox. A future provider contract should make metadata discovery a
  required capability or add provider-side idempotency keys for create.
- The OpenAPI schema source currently mirrors the shared TypeScript response
  contracts manually inside `packages/shared`. This publishes and checks the
  contract, but a later refinement should derive TypeScript types from the
  contract source or derive OpenAPI schemas from runtime schemas to remove that
  duplication.
- The CLI now imports the packaged SDK entrypoint. Workspace CLI test, lint,
  build, dev, and typecheck scripts build `@harakiri/sdk` first so a clean
  checkout does not depend on an ignored stale `packages/sdk/dist` directory.
  Longer term, project references or workspace-aware source resolution could
  make this less script-driven.
- The CLI template command module still contains local build-context packaging
  and build-follow orchestration. This is command-domain code rather than
  duplicated API transport, but a future pass could split template config,
  context upload, and build-follow helpers if the module continues growing.
- `BuildKitKubernetesBuilder` deliberately reuses a short-lived per-build Job
  rather than introducing a long-running BuildKit Deployment. This keeps the
  local k0s path simple and rootless, but each build starts a fresh BuildKit
  daemon and only benefits from registry cache. Revisit a pooled BuildKit
  worker Deployment if Dockerfile build latency becomes a product bottleneck.
- Rootless BuildKit currently requires unconfined AppArmor/seccomp settings in
  the per-build Job on the local k0s/containerd stack. This is still preferable
  to privileged Docker-in-Docker for the OSS default, but the operator docs
  should call out the requirement and future work should evaluate a hardened
  BuildKit worker profile per supported Kubernetes distribution.
- The BuildKit and legacy Kaniko builders still share some Kubernetes Job
  helper concepts by import rather than a small common module. A later cleanup
  should extract neutral job naming, repository naming, pod log collection, and
  runtime metadata helpers before adding another Dockerfile builder.
- Phase 8 has extracted product docs content, docs and landing routes, shared
  visual primitives, shared formatters, web API client endpoint groups, the
  sandboxes list/create route, the sandbox detail route, the small dashboard
  usage/API keys/settings routes, onboarding/shared workspace defaults, the
  dashboard shell, and template management. `main.tsx` now owns only app-level
  gates and route selection.
- `apps/web/src/routes/templates.tsx` is now separated from `main.tsx`, but it
  remains a large stateful route module. A future cleanup should split the
  create-template modal, template list/builds tables, build detail panel, and
  template detail panel into route-owned subcomponents/hooks now that
  authenticated List/Builds tab smoke coverage is in place.
- The extracted sandbox detail route still performs direct `api` calls in panel
  components. This preserves behavior for the current move, and the
  authenticated e2e now covers terminal/files/logs/metrics/network tab
  behavior, but a later route cleanup should add route-owned hooks or loaders
  before adding deeper panel interactions.
- Historical plans and `docs/test-report.md` intentionally retain maintainer
  harakiri.io and earlier-builder evidence. Keep that history for traceability,
  but avoid copying those values into product docs, package help, or generic
  contributor instructions.

## Completion Notes
The refactor now leaves Harakiri as an OSS-oriented control plane with clear
interfaces for runtime providers, image builders, build-context/log storage,
auth, audit, API contracts, CLI/SDK clients, web routes, and deployment
examples. OpenSandbox remains the default runtime provider; Harakiri no longer
uses sandbox `pods/exec` or direct sandbox `pods/log` for normal runtime
panels. Rootless BuildKit is the default Dockerfile builder, with Kaniko kept
only as an explicit legacy compatibility provider.

Retained compatibility shims: `apps/api/src/opensandbox.ts` remains a
compatibility re-export, and deprecated builder env aliases still warn and map
to the builder-neutral names until a future removal window. Deferred cleanup:
OpenAPI generation still mirrors TypeScript contracts manually, the large
template web route can be split further, OpenSandbox diagnostics/files
fallbacks can be retired when upstream stable APIs exist, and a pooled BuildKit
worker can be revisited if build latency becomes important.

Final verification evidence is recorded in `docs/test-report.md`, covering
unit/type/build gates, OpenAPI drift checks, k0s deploy and live smokes,
CLI packaging, Web/API/CLI/SDK e2e, route ingress, template builds, onboarding, local
Keycloak/seeded workspace, and local development-runtime CLI workflows. The
plan was archived from `docs/exec-plans/active/` to
`docs/exec-plans/completed/` after this verification.
