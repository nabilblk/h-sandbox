# Local Development

This guide is the generic contributor path. It does not require Cloudflare,
the `harakiri.io` DNS zone, or the public tunnel used by the maintainer lab.

## Prerequisites

- Node.js 22 or newer
- pnpm 11
- Docker or another Compose-compatible runtime
- kubectl, Helm, Lima, and k0s only when testing the full OpenSandbox-backed
  stack

## Repository Setup

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres keycloak
pnpm db:migrate
pnpm db:seed
```

If `15432` or `8081` are already in use, override
`LOCAL_POSTGRES_PORT` or `LOCAL_KEYCLOAK_PORT` before starting Compose and keep
`DATABASE_URL`, `PUBLIC_KEYCLOAK_URL`, and `KEYCLOAK_*` aligned with the chosen
ports.

The seeded local API key is:

```text
hk_live_demo_lyra_labs_0000000000000000000000000000000000
```

The local Keycloak realm imported by Docker Compose contains one development
user:

```text
Email: lyra@k.ai
Password: harakiri-dev
```

## Runtime-Free Development

For API, web, CLI, and SDK work that does not need real OpenSandbox VMs, use
the development runtime provider:

```bash
HARAKIRI_RUNTIME_PROVIDER=dev pnpm dev
```

This keeps sandbox lifecycle, terminal, filesystem, logs, metrics, and route
surfaces available through in-memory fixtures. It is the fastest path for UI,
contract, and command work.

Useful local URLs:

- Web: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:8080`
- Keycloak: `http://127.0.0.1:8081`

## Interface Checks

Run focused checks while developing:

```bash
pnpm --filter @harakiri/api test
pnpm --filter @harakiri/web test
pnpm --filter @harakiri/cli test
pnpm --filter @harakiri/sdk test
pnpm openapi:check
```

Before submitting a broad change:

```bash
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

## CLI Development

```bash
pnpm --filter @harakiri/cli build
pnpm cli:pack
npm install -g ./dist-packages/harakiri-cli-0.1.0.tgz
harakiri login --api-url http://127.0.0.1:8080 --api-key hk_live_demo_lyra_labs_0000000000000000000000000000000000
harakiri create --template python-3.12-data --name local-dev
```

The installed binary and SDK use the same `/v1` API contracts as the web app.

## Full k0s/OpenSandbox Stack

Use k0s when the change touches the real runtime provider, template builder,
OpenSandbox routing, Kubernetes manifests, or smoke tests:

```bash
pnpm k0s:bootstrap
export KUBECONFIG="$PWD/infra/k0s/harakiri.kubeconfig"
pnpm deploy:k0s
pnpm ports:restart
pnpm smoke
pnpm smoke:templates
pnpm smoke:template-build
pnpm smoke:route
pnpm e2e
```

The k0s workflow is documented in [docs/runbook.md](runbook.md). Public
harakiri.io checks are separate environment-specific tests under
`infra/scripts/env/harakiri/`.

## Documentation Map

- [architecture.md](architecture.md): subsystem boundaries
- [opensandbox-boundaries.md](opensandbox-boundaries.md): runtime and
  Kubernetes ownership rules
- [templates.md](templates.md): user-facing template behavior
- [template-builds.md](template-builds.md): build pipeline and operator
  behavior
- [template-security.md](template-security.md): image and registry security
- [api.md](api.md): HTTP API reference
- [storage.md](storage.md): build context/log storage providers
- [builders.md](builders.md): BuildKit and legacy builder providers
- [extensions.md](extensions.md): extension interfaces for contributors
