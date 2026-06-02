# Harakiri Sandbox

Harakiri Sandbox is an open-source control plane for disposable developer
sandboxes on top of OpenSandbox. It provides the product surface around a
runtime provider: API keys, organization state, template builds, routes,
scheduling, usage, audit events, a web dashboard, an SDK, and the `harakiri`
CLI.

The default runtime provider is OpenSandbox. The default Dockerfile template
builder is rootless BuildKit running as per-build Kubernetes Jobs. PostgreSQL is
the control-plane datastore, and Keycloak-compatible OIDC is used for browser
authentication.

## Interfaces

- Web UI: React/Vite dashboard and product docs.
- API: Fastify `/v1` control-plane API plus `/openapi.json`.
- CLI: installable `harakiri` executable.
- SDK: TypeScript client package for the same API.

All public interface contracts should stay aligned through
`packages/shared` and the generated OpenAPI document in `docs/openapi.json`.

## Workspace

- `apps/api` - API server, scheduler, template builder worker, providers, and
  services.
- `apps/web` - React dashboard and website docs using the mockup design system.
- `packages/cli` - command-line client.
- `packages/sdk` - TypeScript SDK.
- `packages/shared` - shared contracts, template metadata, and OpenAPI source.
- `db/migrations` - PostgreSQL schema.
- `infra/k0s` - local k0s bootstrap.
- `infra/k8s` - Kubernetes manifests.
- `infra/scripts` - portable deployment and smoke scripts.
- `infra/scripts/env/harakiri` - maintainer-specific harakiri.io examples.
- `docs` - architecture, user, operator, and contributor docs.

## Quick Start For Contributors

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres keycloak
pnpm db:migrate
pnpm db:seed
HARAKIRI_RUNTIME_PROVIDER=dev pnpm dev
```

Then run focused interface checks:

```bash
pnpm --filter @harakiri/api test
pnpm --filter @harakiri/web test
pnpm --filter @h-sandbox/cli test
pnpm --filter @h-sandbox/sdk test
pnpm openapi:check
```

Read [docs/development.md](docs/development.md) for the complete local
development path. It does not require Cloudflare, a public DNS zone, or a real
OpenSandbox deployment. The local Keycloak user is `lyra@k.ai` with password
`harakiri-dev`.

## Full k0s/OpenSandbox Stack

Use the full stack when changing runtime provider behavior, template builds,
routing, manifests, or smoke tests:

```bash
pnpm k0s:bootstrap
export KUBECONFIG="$PWD/infra/k0s/harakiri.kubeconfig"
pnpm deploy:k0s
pnpm ports:restart
pnpm smoke
pnpm smoke:template-build
pnpm smoke:route
pnpm e2e
```

See [docs/runbook.md](docs/runbook.md) for the local cluster workflow and
[docs/test-report.md](docs/test-report.md) for the latest verification
evidence.

## CLI

Build and install the CLI as a real executable:

```bash
pnpm cli:pack
npm install -g ./dist-packages/h-sandbox-cli-0.1.0.tgz
harakiri login --api-url http://127.0.0.1:8080 --api-key hk_live_...
harakiri create --template python-3.12-data --name first-agent
harakiri run sbx_... --cmd "python --version"
harakiri expose sbx_... --port 3000
harakiri egress set sbx_... --mode restricted --allow api.github.com
```

See [packages/cli/README.md](packages/cli/README.md) for packaging and command
details.

## Templates

Templates define runtime images, resources, workdir, ports, aliases, and
immutable versions. The CLI can initialize a template config, upload Dockerfile
contexts, follow build logs, and create sandboxes from names, aliases, or
version IDs:

```bash
harakiri template init --name open-agents-dev --dockerfile Dockerfile --port 3000 --tag hot
harakiri template build --name open-agents-dev .
harakiri template promote open-agents-dev --version-id tplv_... --alias stable
harakiri create --template open-agents-dev:stable --name agent-runner
```

The repository includes copyable examples under
[examples/templates](examples/templates/README.md), including an `opencode`
agent runtime:

```bash
harakiri template build --name opencode examples/templates/opencode
harakiri template smoke opencode --cmd "harakiri-opencode-smoke"
harakiri create --template opencode --name opencode-agent
```

Rootless BuildKit is the default Dockerfile builder. The legacy Kaniko provider
is available only through `TEMPLATE_DOCKERFILE_BUILDER=kaniko-legacy` for
compatibility.

Template docs:

- [docs/templates.md](docs/templates.md)
- [docs/template-builds.md](docs/template-builds.md)
- [docs/template-security.md](docs/template-security.md)
- [docs/template-runtime-contract.md](docs/template-runtime-contract.md)

## Routes

Expose a port after a process is listening on `0.0.0.0` inside the sandbox:

```bash
harakiri run sbx_... --cmd "python -m http.server 3000 --bind 0.0.0.0 >/tmp/http.log 2>&1 &"
harakiri expose sbx_... --port 3000
harakiri routes sbx_...
```

The portable smoke path checks OpenSandbox gateway routing through local
forwards. Public DNS and Cloudflare tunnel examples are intentionally isolated
under [infra/scripts/env/harakiri](infra/scripts/env/harakiri/README.md).

## Outbound Access

Use outbound access when a sandbox should only reach approved domains:

```bash
harakiri create --template python-3.12-data --egress restricted --egress-preset python-package-install
harakiri egress allow sbx_... api.github.com
harakiri egress test sbx_... https://pypi.org/simple
```

Harakiri compiles developer-facing modes and presets to OpenSandbox
`networkPolicy` and runtime egress sidecar calls. See
[docs/egress-control.md](docs/egress-control.md).

## Documentation

- [docs/README.md](docs/README.md) - documentation index by audience
- [docs/architecture.md](docs/architecture.md) - subsystem map and data flow
- [docs/opensandbox-boundaries.md](docs/opensandbox-boundaries.md) - runtime
  and Kubernetes ownership rules
- [docs/extensions.md](docs/extensions.md) - provider and extension interfaces
- [docs/api.md](docs/api.md) - HTTP API reference
- [CONTRIBUTING.md](CONTRIBUTING.md) - contribution workflow
- [SECURITY.md](SECURITY.md) - security reporting and boundaries

## License

Apache-2.0. See [LICENSE](LICENSE).
