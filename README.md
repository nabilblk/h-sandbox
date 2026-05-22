# Harakiri Sandbox

Harakiri Sandbox is a working prototype of an E2B-like developer platform on top of OpenSandbox. It includes a high-fidelity web app based on `sandbox_mockups/`, a PostgreSQL-backed control plane, Keycloak authentication integration, a scheduler worker, Kubernetes deployment manifests, and a `harakiri` CLI.

## Workspace

- `apps/api` - Fastify control-plane API and scheduler worker.
- `apps/web` - React/Vite web app using the mockup design system.
- `packages/cli` - `harakiri` command-line client.
- `packages/shared` - shared types, templates, and API helpers.
- `db/migrations` - PostgreSQL schema.
- `infra/k0s` - local k0s bootstrap and verification.
- `infra/k8s` - Kubernetes manifests.
- `docs/exec-plans` - persistent execution plan.

## Local Development

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm db:seed
pnpm dev
```

For the full deployed prototype, use:

```bash
pnpm k0s:bootstrap
pnpm deploy:k0s
pnpm k0s:verify
pnpm smoke
pnpm e2e
```

See [docs/runbook.md](docs/runbook.md) for the full cluster workflow.
See [docs/test-report.md](docs/test-report.md) for the latest self-test evidence and deployed URLs.
