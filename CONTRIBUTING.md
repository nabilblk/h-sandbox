# Contributing To Harakiri Sandbox

Harakiri Sandbox is an open-source control plane for OpenSandbox-backed
developer sandboxes. Contributions should keep the product usable through all
interfaces: API, CLI, SDK, and web UI.

## Development Setup

Use Node.js 22 or newer and the exact pnpm version in `packageManager`.
Core validation needs no cluster, private registry, model credentials or
Remotion rendering license. Run commands sequentially:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm openapi:check
pnpm docs:check
```

To run the app locally, add the development-only dependencies:

```bash
cp .env.example .env
docker compose up -d postgres keycloak
pnpm db:migrate
pnpm db:seed
pnpm --filter @harakiri/api test
pnpm --filter @harakiri/web test
pnpm --filter @h-sandbox/cli test
pnpm --filter @h-sandbox/sdk test
```

For a full k0s/OpenSandbox stack, follow [docs/development.md](docs/development.md)
and [docs/runbook.md](docs/runbook.md).

Never forward the local development realm or its seed identities to public
ingress. Development seeding refuses a non-dev runtime, disabled dev auth or
`NODE_ENV=production`. This guard does not revoke identities created by older
releases; operators must review and replace those separately.

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
- [ ] No private environment, token, customer data or raw deployment evidence is
      included. Stage intended new files and run `pnpm security:scan` with
      Gitleaks 8.30.1. Review any scanner exception with the same rigor as code.

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

## Focused Contributions

- Documentation: run an existing tutorial against your installation, report
  the exact versions and improve the first failing instruction. Do not send
  credentials or private task output.
- Runtime contracts: add a focused unsupported-capability or provider error
  regression. Keep runtime execution behind `RuntimeProvider`.
- Accessibility: add a keyboard/mobile regression to an existing Playwright
  suite and fix the affected control using the current design components.

Agree on larger behavior or contract changes in an issue before implementation.
The maintainer must confirm a reviewer; no component ownership or response-time
commitment is implied by this list. Optional demo production has separate
third-party tooling requirements described in [third-party notices](THIRD_PARTY.md).
