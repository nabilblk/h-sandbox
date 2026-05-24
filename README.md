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

## Custom Template Quickstart

Templates are the Harakiri equivalent of E2B templates: a named runtime image
plus CPU, memory, workdir, default ports, aliases, and immutable versions stored
in PostgreSQL. The CLI writes `harakiri.toml`, which intentionally stays close
to E2B's `e2b.toml` shape while targeting OpenSandbox-compatible OCI images.

```bash
harakiri template init --name open-agents-dev --dockerfile Dockerfile
harakiri template build --name open-agents-dev . --image registry.example.com/harakiri/open-agents-dev:dev
harakiri template build --name ubuntu-import --source image --image ubuntu:24.04
harakiri template builds --query open-agents-dev
harakiri template logs bld_...
harakiri create --template open-agents-dev --name agent-runner
```

Current v1 behavior persists template definitions, versions, build records, and
build logs in PostgreSQL. The deployed `harakiri-template-builder` worker
completes `--source image` builds by resolving registry digests and creating
ready template versions. The k0s BuildKit worker that turns Dockerfile build
contexts into pushed digest-pinned OCI images is tracked in
[docs/exec-plans/active/custom-template-image-builds.md](docs/exec-plans/active/custom-template-image-builds.md).
The k0s template-build path will require a registry, BuildKit or equivalent
builder, pull secrets for OpenSandbox, and digest resolution before production
promotion.

For the implementation contract, read:

- [docs/templates.md](docs/templates.md)
- [docs/template-builds.md](docs/template-builds.md)
- [docs/template-security.md](docs/template-security.md)
- [docs/template-runtime-contract.md](docs/template-runtime-contract.md)

## Expose A Sandbox Port

```bash
harakiri create --template python-3.12 --name web-preview
harakiri run sbx_... --cmd "python -m http.server 3000 --bind 0.0.0.0 >/tmp/http.log 2>&1 &"
harakiri expose sbx_... --port 3000
```

The deployed k0s prototype uses OpenSandbox gateway host routing and returns URLs like `https://<route-key>.harakiri.io`.

For local k0s HTTPS ingress verification:

```bash
pnpm route:tls-dev
pnpm smoke:route-ingress
```

Harakiri.io Cloudflare/DNS checks are kept as environment-specific scripts under
`infra/scripts/env/harakiri` and exposed as `pnpm env:harakiri:*` commands.
