# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Harakiri Sandbox is a self-hosted, open-source sandbox control plane for agent applications. It owns the product surface (orgs, API keys, templates, builds, routes, schedules, usage, audit and developer experience). Runtime execution is delegated through `RuntimeProvider`; OpenSandbox is the current real execution adapter, not the product identity. Future providers must implement and validate that contract; do not claim they already exist. PostgreSQL is the datastore; Keycloak-compatible OIDC handles browser auth.

## Workspace Layout & Package Names

pnpm monorepo (`apps/*`, `packages/*`). Package names are inconsistent — filters must use the right one:

- `@harakiri/api` — Fastify `/v1` control-plane API (`apps/api`)
- `@harakiri/web` — React/Vite dashboard + product docs (`apps/web`)
- `@harakiri/shared` — shared contracts + OpenAPI source (`packages/shared`)
- `@h-sandbox/sdk` — published TypeScript SDK (`packages/sdk`)
- `@h-sandbox/cli` — published `harakiri` CLI, built on the SDK (`packages/cli`)

## Commands

### Setup

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres keycloak   # Postgres :15432, Keycloak :8081
pnpm db:migrate
pnpm db:seed
```

### Develop (runtime-free, the default path)

```bash
HARAKIRI_RUNTIME_PROVIDER=dev pnpm dev   # API :8080 + web :5173
```

The `dev` runtime provider serves sandbox lifecycle/terminal/filesystem/logs/metrics/routes from in-memory fixtures — no OpenSandbox or Kubernetes needed. Local Keycloak user: `lyra@k.ai` / `harakiri-dev`; seeded API key: `hk_live_demo_lyra_labs_0000000000000000000000000000000000`.

### Test / lint / build

```bash
pnpm test           # all packages (Node built-in test runner via tsx)
pnpm typecheck      # tsc --noEmit everywhere (lint == typecheck; no eslint)
pnpm build
pnpm openapi:check  # verifies docs/openapi.json matches packages/shared

pnpm --filter @harakiri/api test   # one package (see names above)
```

Tests are colocated as `src/*.test.ts` (top-level src only). To run a single file:

```bash
pnpm --filter @harakiri/shared build   # api tests import shared from dist
pnpm --filter @harakiri/api exec node --test --import tsx src/scheduler.test.ts
# add --test-name-pattern "..." to filter individual tests
```

The `test`/`build` scripts of api/cli auto-build their workspace dependency (`shared`/`sdk`) first; when invoking `node --test` directly you must build it yourself.

### Full k0s/OpenSandbox stack

Only needed when changing runtime provider behavior, template builds, routing, manifests, or smoke tests:

```bash
pnpm k0s:bootstrap
export KUBECONFIG="$PWD/infra/k0s/harakiri.kubeconfig"
pnpm deploy:k0s
pnpm ports:restart
pnpm smoke               # plus smoke:template-build, smoke:route, etc. (see package.json)
pnpm e2e                 # Playwright; requires the deployed stack
```

`pnpm cli:pack` builds the installable CLI tarball into `dist-packages/`.

## Architecture

### API process model

`apps/api` has three entrypoints sharing one codebase:

- `src/server.ts` — Fastify API; domain routers in `src/routes/` (each domain has a `.ts` handler + `.schema.ts`), services in `src/services/`
- `src/scheduler.ts` — worker that kills expired sandboxes, reconciles TTL/idle schedules, runs template retention cleanup
- `src/template-builder.ts` — worker that claims queued `template_builds`, runs builds, streams logs, writes immutable `template_versions`

### Provider boundaries (hard rules)

- All sandbox runtime behavior — lifecycle, terminal, filesystem, metrics, logs, routes, egress — goes through `RuntimeProvider` (`apps/api/src/providers/runtime/provider.ts`). OpenSandbox is the default implementation; transport is isolated in `opensandbox-transport.ts`.
- Never reintroduce direct Kubernetes `pods/exec` or sandbox `pods/log` access. Direct Kubernetes use is limited to platform ops: applying manifests, template builder Jobs, and short-lived image preflight/pre-pull Pods. See `docs/opensandbox-boundaries.md`.
- Dockerfile template builds go through `ImageBuilder` (`apps/api/src/builders/`). Rootless BuildKit is the default; Kaniko exists only behind `TEMPLATE_DOCKERFILE_BUILDER=kaniko-legacy`.
- Other provider seams: auth and audit under `apps/api/src/providers/`, build context/log storage under `apps/api/src/storage/` (`BlobStore`, `BuildLogStore`).

### Contract alignment

`packages/shared` is the single source of truth for API request/response contracts consumed by the API, web, CLI, and SDK. Any public API change must update `packages/shared` and regenerate `docs/openapi.json` with `pnpm openapi:write`. Product behavior changes should include tests for each affected interface (API, CLI, SDK, web).

### Database

Plain SQL migrations in `db/migrations/`, sequentially numbered (`001_...` … `023_...`) — add a new numbered file, never edit applied ones. Applied via `pnpm db:migrate` (`apps/api/src/migrate.ts`).

### Auth

The API accepts Keycloak JWTs (validated via realm JWKS) and hashed Harakiri API keys (`hk_live_` / `hk_test_` prefixes). `AUTH_DEV_ALLOW=1` (default in `.env.example`) relaxes auth for bootstrap smoke tests.

### Web

`apps/web` is React 19 + Vite with hash-based routing (`#landing`, route modules under `src/routes/`). Keycloak JS adapter with PKCE; tokens stay in adapter memory, not localStorage. The visual design follows the `sandbox_mockups/` design system — preserve it when changing UI.

## Conventions

- Environment-specific (harakiri.io / Cloudflare / public DNS) scripts are isolated under `infra/scripts/env/harakiri/` and must stay out of core docs, scripts, and generic deployment paths.
- Multi-session/multi-phase work is tracked as exec plans in `docs/exec-plans/` (see the repo `exec-plan` skill in `.agents/skills/`).
- `git diff --check` must pass before submitting.
