# Harakiri Sandbox

Harakiri Sandbox is a working prototype of a developer sandbox platform on top of OpenSandbox. It includes a high-fidelity web app based on `sandbox_mockups/`, a PostgreSQL-backed control plane, Keycloak authentication integration, a scheduler worker, Kubernetes deployment manifests, and a `harakiri` CLI.

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

Templates are named runtime images plus CPU, memory, workdir, default ports,
aliases, and immutable versions stored in PostgreSQL. The CLI writes
`harakiri.toml` for OpenSandbox-compatible OCI images.

```bash
harakiri template init --name open-agents-dev --dockerfile Dockerfile --port 3000 --port 5173 --tag hot
harakiri template build --name open-agents-dev .
harakiri template promote open-agents-dev --version-id tplv_... --alias stable
harakiri template build --name ubuntu-import --source image --image ubuntu:24.04
harakiri create --template open-agents-dev --name agent-runner --env HARAKIRI_ENV_SMOKE=env-ok
harakiri create --template open-agents-dev:stable --name stable-runner
harakiri create --template tplv_... --name pinned-runner
harakiri template archive open-agents-dev
```

The Open Agents example uses the same build path with a repository template
directory:

```bash
harakiri template build --name open-agents-dev examples/templates/open-agents-dev
```

Current v1 behavior persists template definitions, versions, build records,
uploaded Dockerfile build contexts, and build logs in PostgreSQL. The deployed
`harakiri-template-builder` worker completes image-import builds by resolving
registry digests, and completes Dockerfile builds by launching a Kaniko Job in
k0s, pushing to the local registry, and recording a digest-pinned ready template
version. `harakiri template build` follows logs and prints the final build ID,
template version ID, image digest, duration, and next create command by default;
use `--no-wait` when a script only needs the queued build ID. Creating a
template definition does not make it runnable by itself; sandbox creation
requires a ready template version with an immutable image digest. Template
versions are marked ready only after the builder verifies the digest-pinned
image can be pulled by the k0s runtime path, and sandbox creation refuses
templates that have no ready version. Use `template:stable` or
`template:latest` for human-friendly promoted aliases, and use the immutable
`tplv_...` ID when a CI job or audit trail must prove the exact image digest
selected at sandbox create time. Templates tagged `hot`, `prepull`, or `warm`
can also pre-pull the final image on ready k0s nodes so the next sandbox start
does not pay the first image download on each node. Versions also carry
SBOM/provenance and scan-status fields. By default new versions report
`not_scanned`; operators can set
`TEMPLATE_SCANNER_WEBHOOK_URL` to call an external scanner hook and persist the
returned scan status and summary.
Generated Dockerfile images are pushed under an organization-scoped repository
namespace below `TEMPLATE_REGISTRY_REPOSITORY_PREFIX`, and registry credential
records can be managed through the API without returning secret material.
Sandbox creation can pass normal environment variables through `env` or
`harakiri create --env KEY=value`; audit and event records store only key names.
The scheduler also enforces retention for old build logs, uploaded build
contexts, unversioned terminal build rows, unused old template versions, and
completed builder Jobs. Production hardening still needs registry blob garbage
collection and a production scanner service/gating policy.
The current API already enforces configurable template CPU, memory,
default-port, active-build, and image registry/prefix policy limits tracked in
[docs/exec-plans/completed/custom-template-image-builds.md](docs/exec-plans/completed/custom-template-image-builds.md).

For the template implementation contract, read:

- [docs/templates.md](docs/templates.md)
- [docs/template-builds.md](docs/template-builds.md)
- [docs/template-security.md](docs/template-security.md)
- [docs/template-runtime-contract.md](docs/template-runtime-contract.md)

For API, architecture, and operator workflows, read:

- [docs/api.md](docs/api.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/runbook.md](docs/runbook.md)
- [docs/test-report.md](docs/test-report.md)

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
