# Execution Plan: OSS Architecture Refactor

**Created**: 2026-05-24
**Author**: Codex
**Status**: Not Started
**Priority**: {P0-P3}
**Estimated effort**: 8-12 engineering days

## Context
Harakiri Sandbox is now a working prototype, but the next goal is to make it a
credible open-source project rather than a repository shaped around one local
deployment. The current code proves the product surface, yet several important
subsystems are too concrete or too coupled:

- `apps/api/src/opensandbox.ts` mixes OpenSandbox lifecycle, `execd`
  transport, fallback behavior, files, logs, metrics, and routing in one
  module.
- `apps/api/src/template-builder.ts` hard-codes a Kaniko Kubernetes Job and
  stores Kaniko-specific behavior in logs, provenance, config, tests, and docs.
- `apps/api/src/routes.ts` mixes HTTP handlers, schemas, SQL, orchestration,
  validation, audit, and provider calls in one large file.
- `apps/web/src/main.tsx` and `packages/cli/src/index.ts` contain most product
  behavior in single large entrypoints, which raises the cost for contributors.
- Core docs still mix reusable project architecture with the harakiri.io lab
  environment and Cloudflare-specific scripts.

This plan focuses on code architecture, maintainability, public extension
points, testability, and OSS contributor experience. It is not a plan for
hardening the current harakiri.io instance.

Reference context:
- `README.md`
- `docs/architecture.md`
- `docs/templates.md`
- `docs/template-builds.md`
- `docs/runbook.md`
- `apps/api/src/opensandbox.ts`
- `apps/api/src/template-builder.ts`
- `apps/api/src/routes.ts`
- `apps/api/src/scheduler.ts`
- `apps/web/src/main.tsx`
- `packages/cli/src/index.ts`
- `infra/scripts/env/harakiri/README.md`
- Kaniko archive notice: https://github.com/GoogleContainerTools/kaniko
- BuildKit architecture: https://docs.docker.com/build/buildkit/
- Buildx Kubernetes driver and rootless mode:
  https://docs.docker.com/build/builders/drivers/kubernetes/

## Success Criteria
- [ ] The runtime integration is expressed through a documented
      `RuntimeProvider` interface, with OpenSandbox as the default provider and
      no provider-specific logic leaking into API route handlers.
- [ ] The image build subsystem is expressed through a documented
      `ImageBuilder` interface, with rootless BuildKit as the preferred default
      implementation and Kaniko either removed or isolated as a legacy provider.
- [ ] Sandbox lifecycle operations use an explicit state machine or outbox flow
      so provider provisioning and database state remain reconcilable.
- [ ] Build contexts, build logs, and generated artifacts use storage
      interfaces rather than direct PostgreSQL `BYTEA` assumptions in core
      business logic.
- [ ] API route code is split by domain and can be tested without booting the
      whole product stack.
- [ ] Shared API contracts are centralized so the web app, CLI, and SDK consume
      the same typed request/response shapes.
- [ ] Web and CLI code are split into feature modules that are approachable for
      new contributors.
- [ ] Core docs describe reusable OSS architecture, while harakiri.io,
      Cloudflare, and local lab-specific scripts live only in clearly named
      example environment docs.
- [ ] The project has basic OSS project hygiene: license, contribution guide,
      security policy, issue/PR templates, architecture decision records, and a
      documented local development path.
- [ ] Existing prototype behavior remains intact: web, API, CLI, SDK, templates,
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
**Status**: Not Started
- [ ] Write a short architecture inventory that maps current modules to target
      OSS subsystems: runtime provider, builder, storage, auth, API domains,
      scheduler, web, CLI, SDK, deployment examples, and docs.
- [ ] Define the public extension interfaces before editing call sites:
      `RuntimeProvider`, `ImageBuilder`, `BlobStore`, `BuildLogStore`,
      `OidcProviderConfig`, and `AuditSink`.
- [ ] Identify which interfaces are stable public APIs and which are internal
      implementation seams.
- [ ] Add an ADR folder under `docs/adr/` and record the first decisions:
      provider interface, builder interface, storage interface, and
      environment-specific examples.
- [ ] Add a contributor-facing module map to `docs/architecture.md`.

Verification gate:
- [ ] `docs/architecture.md` explains the target architecture without relying
      on harakiri.io or Cloudflare-specific details.
- [ ] ADRs record the intended direction before code movement starts.

### Phase 2: Runtime Provider Refactor
**Status**: Not Started
- [ ] Create `apps/api/src/providers/runtime/provider.ts` with a
      `RuntimeProvider` interface covering create, get, delete, renew, run,
      files, logs, metrics, and route exposure.
- [ ] Move OpenSandbox-specific HTTP calls into
      `apps/api/src/providers/runtime/opensandbox-provider.ts`.
- [ ] Move OpenSandbox `execd` endpoint resolution and command/files/metrics
      transport into a small helper owned by the OpenSandbox provider.
- [ ] Keep direct Kubernetes access out of the normal runtime provider path;
      any Kubernetes diagnostics must be an explicit operator tool, not the
      default terminal/files/logs/metrics implementation.
- [ ] Replace direct `openSandbox.*` calls in route handlers and scheduler with
      injected provider calls.
- [ ] Replace the current fallback runtime with an explicit
      `InMemoryRuntimeProvider` or `DevRuntimeProvider` that is only enabled for
      local development and tests.
- [ ] Add provider contract tests that run against fake provider fixtures.
- [ ] Keep the existing OpenSandbox behavior and k0s smoke tests passing.

Verification gate:
- [ ] Unit tests prove route handlers and scheduler can run against a fake
      runtime provider.
- [ ] Existing OpenSandbox create, run, logs, files, metrics, route, renew, and
      delete smoke paths still pass.

### Phase 3: Builder Provider Refactor
**Status**: Not Started
- [ ] Create `apps/api/src/builders/image-builder.ts` with an `ImageBuilder`
      interface for Dockerfile builds, image imports, logs, digest reporting,
      cache metadata, and cleanup.
- [ ] Move registry digest resolution into a reusable image-import builder.
- [ ] Move current Kaniko behavior into
      `apps/api/src/builders/kaniko-builder.ts` without leaking Kaniko names into
      generic build state, logs, tests, or user docs.
- [ ] Add a BuildKit design document and implementation plan under
      `docs/template-builds.md` or a dedicated `docs/builders.md`.
- [ ] Implement a rootless BuildKit builder for Kubernetes or add the exact
      implementation plan if it must be staged separately.
- [ ] Update provenance to record generic builder metadata first, with
      provider-specific details nested under `builder.details`.
- [ ] Update config names from Kaniko-specific defaults to builder-neutral names.
- [ ] Update tests so generic builder contract tests do not assert Kaniko-only
      strings.

Verification gate:
- [ ] Dockerfile builds can be exercised through the `ImageBuilder` interface.
- [ ] Build logs, provenance, template version metadata, CLI output, and website
      docs no longer require Kaniko terminology for the default flow.
- [ ] If Kaniko remains temporarily available, it is documented as a legacy
      implementation rather than the architecture default.

### Phase 4: Storage Interfaces For Build Artifacts
**Status**: Not Started
- [ ] Introduce `BlobStore` for build contexts and future artifacts.
- [ ] Introduce `BuildLogStore` for append/read build logs.
- [ ] Provide a local filesystem implementation suitable for OSS development.
- [ ] Keep PostgreSQL-backed implementations available for migration
      compatibility or tests where useful.
- [ ] Add optional S3/MinIO documentation without making object storage required
      for a local contributor.
- [ ] Move direct `template_build_contexts.archive` reads/writes behind the
      storage interface.
- [ ] Move build log append/read code behind the log interface.

Verification gate:
- [ ] Template build context upload, export, retention, and log streaming work
      through the storage interfaces.
- [ ] Tests cover filesystem-backed storage and the existing PostgreSQL path.

### Phase 5: API Domain Modularization
**Status**: Not Started
- [ ] Split `apps/api/src/routes.ts` into domain routers:
      `auth/bootstrap`, `sandboxes`, `sandbox-routes`, `templates`,
      `template-builds`, `registry-credentials`, `api-keys`, `usage`, and
      `org-settings`.
- [ ] Move Zod schemas into domain-local schema files or a shared API contract
      package.
- [ ] Move SQL query builders and row mappers out of handlers.
- [ ] Add explicit service functions for sandbox creation, template build
      enqueueing, route creation, and organization settings updates.
- [ ] Add unit tests for service functions without Fastify.
- [ ] Keep route paths and response payloads backward-compatible unless an
      intentional API change is recorded in the decision log.

Verification gate:
- [ ] API tests still pass.
- [ ] `routes.ts` becomes a small composition root rather than the main business
      logic container.

### Phase 6: Sandbox Lifecycle State Machine And Outbox
**Status**: Not Started
- [ ] Define explicit sandbox states and allowed transitions in shared code.
- [ ] Add a `sandbox_operations` or `control_plane_outbox` table for
      provision, delete, renew, route expose, and reconciliation intents.
- [ ] Change `POST /v1/sandboxes` to write database intent first and let a
      worker provision through the runtime provider.
- [ ] Keep synchronous create behavior for CLI/web by waiting on the operation
      result when requested, with a timeout and clear pending response fallback.
- [ ] Add idempotency keys for create/delete/route operations.
- [ ] Teach scheduler/reconciler to complete, retry, or mark failed operations.
- [ ] Add tests for provider failure, DB failure, duplicate requests, and
      retry-safe cleanup.

Verification gate:
- [ ] A provider failure does not create an unreconcilable DB state.
- [ ] A DB failure after provider creation is either impossible by design or is
      recovered by reconciliation.
- [ ] Existing CLI and web create flows still feel synchronous for normal cases.

### Phase 7: Shared Contracts, SDK, And CLI Refactor
**Status**: Not Started
- [ ] Move request/response types and error shapes into `packages/shared` or a
      dedicated `packages/contracts` package.
- [ ] Use those contracts from API handlers, web API client, SDK, and CLI.
- [ ] Extract the SDK request layer into a reusable client used by the CLI.
- [ ] Split `packages/cli/src/index.ts` into command modules:
      `auth`, `sandboxes`, `templates`, `routes`, `registry-credentials`, and
      `config`.
- [ ] Add command-level tests for all split CLI modules.
- [ ] Document CLI packaging for source builds, npm installation, and binary
      execution without requiring `node packages/cli/dist/index.js`.

Verification gate:
- [ ] CLI behavior and formatting remain compatible with existing tests.
- [ ] SDK and CLI no longer duplicate endpoint wiring.

### Phase 8: Web Application Modularization
**Status**: Not Started
- [ ] Split `apps/web/src/main.tsx` into route modules and feature components:
      landing, docs, onboarding, dashboard shell, sandboxes, sandbox detail,
      templates, API keys, usage, and settings.
- [ ] Extract product docs data from component code into structured data or MDX
      without changing the current app navigation.
- [ ] Extract API hooks/client code by domain.
- [ ] Keep design tokens centralized and preserve current visual fidelity.
- [ ] Add focused smoke tests for onboarding redirect, sandbox detail tabs,
      templates list/builds tabs, and docs rendering.

Verification gate:
- [ ] Web typecheck/build passes.
- [ ] Playwright screenshots show no visual regression in the key flows.

### Phase 9: OSS Docs, Examples, And Governance
**Status**: Not Started
- [ ] Add or verify `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`,
      `CODE_OF_CONDUCT.md`, and issue/PR templates.
- [ ] Rewrite `README.md` around OSS discovery: what Harakiri is, how to run it
      locally, architecture, examples, CLI, SDK, and how to contribute.
- [ ] Split docs into clear audiences:
      contributor docs, operator docs, user/product docs, and example
      environment docs.
- [ ] Move harakiri.io and Cloudflare-specific instructions out of core docs and
      keep them under `infra/scripts/env/harakiri/`.
- [ ] Add a generic local environment guide that does not require Cloudflare or
      the harakiri.io domain.
- [ ] Add docs for extension authors: runtime providers, image builders, storage
      backends, auth providers, and scanner hooks.
- [ ] Update website product docs for any user-visible workflow changed by this
      refactor.

Verification gate:
- [ ] A new contributor can follow the README to run tests and a local
      development stack without knowing the current private deployment.
- [ ] Product docs and repo docs no longer mention implementation details unless
      they are needed by the intended audience.

### Phase 10: Migration And Compatibility Cleanup
**Status**: Not Started
- [ ] Add compatibility shims for old config names where needed, with warnings
      and documented removal timing.
- [ ] Update Kubernetes manifests and scripts to use provider-neutral and
      builder-neutral configuration.
- [ ] Update smoke scripts to target core behavior and keep harakiri.io scripts
      separate.
- [ ] Remove stale Kaniko references from docs, UI copy, CLI output, and generic
      tests once BuildKit is the default.
- [ ] Run full verification:
      `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm smoke`,
      `pnpm smoke:templates`, `pnpm smoke:template-build`,
      `pnpm smoke:route`, `pnpm e2e`, and `git diff --check`.
- [ ] Record final verification evidence in `docs/test-report.md`.

Verification gate:
- [ ] The current prototype behavior remains working after the architecture
      refactor.
- [ ] The repository reads as an open-source platform, not a single deployment
      snapshot.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-05-24 | Treat this as a full execution plan | The refactor cuts across API, runtime, builder, storage, web, CLI, SDK, docs, and tests. | Lightweight plan, but that would lose decision history and phase boundaries. |
| 2026-05-24 | Keep OpenSandbox as the default runtime provider but hide it behind `RuntimeProvider` | The product is intentionally a control plane on top of OpenSandbox, while OSS contributors need a clear provider boundary. | Keep a concrete `openSandbox` singleton; introduce multiple providers immediately. |
| 2026-05-24 | Make rootless BuildKit the target default builder and isolate Kaniko as legacy | Kaniko is archived/read-only, while BuildKit is the current Docker builder backend and supports Kubernetes/rootless operation. | Keep Kaniko as default; use Docker-in-Docker; require external CI builders only. |
| 2026-05-24 | Separate core OSS docs from harakiri.io environment docs | The open-source project should be reusable without Cloudflare, harakiri.io, or the current local tunnel setup. | Leave all deployment notes in README; remove the harakiri.io examples completely. |

## Tech Debt Incurred
None. This plan is a refactor plan and does not introduce implementation
shortcuts yet.

## Completion Notes
Fill in when complete: summarize delivered architecture boundaries, any
compatibility shims retained, which builder is the default, what was deferred,
and the final verification commands.
