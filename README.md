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
harakiri template build --name open-agents-dev .
harakiri template build --name ubuntu-import --source image --image ubuntu:24.04
harakiri create --template open-agents-dev --name agent-runner
```

Current v1 behavior persists template definitions, versions, build records,
uploaded Dockerfile build contexts, and build logs in PostgreSQL. The deployed
`harakiri-template-builder` worker completes image-import builds by resolving
registry digests, and completes Dockerfile builds by launching a Kaniko Job in
k0s, pushing to the local registry, and recording a digest-pinned ready template
version. `harakiri template build` follows logs and prints the final build ID,
template version ID, image digest, duration, and next create command by default;
use `--no-wait` when a script only needs the queued build ID. Production
hardening still needs registry credentials, retention, and scanning. The current
API already enforces configurable template CPU, memory, default-port,
active-build, and image registry/prefix policy limits tracked in
[docs/exec-plans/active/custom-template-image-builds.md](docs/exec-plans/active/custom-template-image-builds.md).

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
