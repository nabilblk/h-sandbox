# Contributing To Harakiri Sandbox

Harakiri Sandbox is an open-source control plane for OpenSandbox-backed
developer sandboxes. Contributions should keep the product usable through all
interfaces: API, CLI, SDK, and web UI.

## Development Setup

Start with the generic local development path:

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres keycloak
pnpm db:migrate
pnpm db:seed
pnpm --filter @harakiri/api test
pnpm --filter @harakiri/web test
pnpm --filter @harakiri/cli test
pnpm --filter @harakiri/sdk test
```

For a full k0s/OpenSandbox stack, follow [docs/development.md](docs/development.md)
and [docs/runbook.md](docs/runbook.md).

## Architecture Rules

- Runtime lifecycle, terminal, filesystem, metrics, logs, and sandbox route
  behavior go through `RuntimeProvider`. The default provider is OpenSandbox.
- Harakiri API code must not reintroduce direct Kubernetes `pods/exec` or
  sandbox `pods/log` access.
- Dockerfile template builds go through `ImageBuilder`. Rootless BuildKit is
  the default; `kaniko-legacy` is compatibility-only.
- Shared API success/error contracts live in `packages/shared` and must stay
  aligned with the API, CLI, SDK, web app, and `docs/openapi.json`.
- Product behavior changes should include tests for each affected interface.

## Pull Request Checklist

- [ ] The change has focused unit tests or an explicit reason tests are not
      practical.
- [ ] API, CLI, SDK, and web contract changes are reflected in
      `packages/shared`.
- [ ] Public API changes update `docs/openapi.json` with `pnpm openapi:write`.
- [ ] User-visible behavior updates README, repo docs, website docs, or CLI
      help as appropriate.
- [ ] Kubernetes or environment-specific changes stay out of core docs unless
      they apply to every deployment.
- [ ] `git diff --check` passes.

## Useful Commands

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm openapi:check
pnpm cli:pack
```

For deployed verification:

```bash
pnpm k0s:bootstrap
pnpm deploy:k0s
pnpm ports:restart
pnpm smoke
pnpm smoke:template-build
pnpm smoke:route
pnpm e2e
```

Environment-specific harakiri.io checks live under
`infra/scripts/env/harakiri/` and are not required for generic OSS
contributions.
