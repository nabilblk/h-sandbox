# Harakiri Sandbox

[Documentation](https://sb.harakiri.io/#docs) |
[Demos](https://sb.harakiri.io/#demos) |
[Installation](docs/install-kubernetes.md) |
[Discussions](https://github.com/nabilblk/h-sandbox/discussions)

**The self-hosted sandbox control plane for agent applications.**

Harakiri turns sandbox infrastructure into a consistent developer experience:
prepare an environment, run work, inspect the result and release the runtime.
Organizations, scoped API keys, templates, persistent workspaces, routes and
access policy share one contract across the API, TypeScript SDK, CLI and dashboard.

The control plane is the product; runtime execution is a provider responsibility.
The current execution adapter uses
[OpenSandbox](https://github.com/opensandbox-group/OpenSandbox). The architecture
allows other providers, including a future Harakiri runtime, without making one
provider the product identity. Those alternatives are a direction, not available
integrations today. See the [vision and architecture](https://sb.harakiri.io/#docs/vision-architecture).

The default runtime provider is OpenSandbox. The default Dockerfile template
builder is rootless BuildKit running as per-build Kubernetes Jobs. PostgreSQL is
the control-plane datastore, and Keycloak-compatible OIDC is used for browser
authentication.

## Developer Preview

Harakiri gives a trusted development team one API, CLI and TypeScript SDK for
running tasks in disposable environments, inspecting their results and retaining
working files when needed. Your application owns agent orchestration and output
evaluation. The runtime provider executes the workload; Harakiri owns access,
policy, templates and product lifecycle.

This is a **self-hosted Developer Preview**, not a hosted-service SLA or a
hostile multi-tenant production guarantee. Start with the
[preview scope and operator checklist](docs/developer-preview.md).
Concurrency admission and historical usage metering are not implemented.
Workspace persistence is not a backup; Vault and egress require an enforceable
runtime profile. Restricted OpenShift support is not certified by Helm rendering.

Operators start with [Install on Kubernetes](docs/install-kubernetes.md), also
available in the public documentation under **Self-hosting**.
Developers with an existing installation start with the task below. Contributors
can use the [runtime-free local setup](#quick-start-for-contributors); its fixtures
are not real sandbox isolation.

## Community and Support

Use [Discussions](https://github.com/nabilblk/h-sandbox/discussions) for setup
questions, design feedback and integration experiences. Report reproducible bugs
through the [issue templates](https://github.com/nabilblk/h-sandbox/issues/new/choose).
For suspected vulnerabilities, follow [SECURITY.md](SECURITY.md) privately,
not a public issue or discussion. The maintainer is
[@nabilblk](https://github.com/nabilblk); there is no support-response SLA.

## Run Your First Task

An operator provides your API URL and a scoped, expiring key. The last delivered
candidate is `0.5.0-rc.9`; `latest` still selects the older `0.4.0` release. Pin
the version compatible with your installation:

```bash
npm install -g @h-sandbox/cli@0.5.0-rc.9
npm install --save-exact @h-sandbox/sdk@0.5.0-rc.9
harakiri --version
```

Follow the [CLI/TypeScript quickstart](https://sb.harakiri.io/#docs/quickstart)
to create a sandbox, run a checked Python command and clean up. It requires no
LLM credentials. Then try [persistent workspaces](https://sb.harakiri.io/#docs/workspaces)
or a [real OpenCode workflow](https://sb.harakiri.io/#demos).
Publication and native installation results are recorded separately in the candidate receipt.

## Agent Demos

The [Demos library](https://sb.harakiri.io/#demos) contains four independent
OpenCode workflows: repair code from the CLI, build and preview an app in the
dashboard, generate/download a report using the published SDK, and generate
Playwright tests with real Chromium screenshots and a broken-filter check.
Each includes a captioned video, transcript, tutorial, downloadable source and
verified capture provenance. The homepage keeps its original layout.

The September 5, 2026 recordings used `opencode/mimo-v2.5-free`, with zero
reported model cost and independent checks of tests, HTTP behavior, artifacts,
and cleanup. Free-model availability can change. CLI text is replayed from real
output; SDK excerpts are condensed; UI footage is recorded. Waiting is edited,
not a performance benchmark.

See [runnable examples](examples/demo/agent-workflows),
[production runbook](docs/demo-production-runbook.md), and
[Remotion workspace](apps/demo-video/README.md).

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
corepack enable
pnpm install --frozen-lockfile
pnpm build
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
pnpm conformance:dev
```

Read [docs/development.md](docs/development.md) for the complete local
development path. It does not require Cloudflare, a public DNS zone, or a real
OpenSandbox deployment. Development seed identities are documented only for the
loopback stack. Never expose them through public ingress or use them for a
shared installation.

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

See [docs/runbook.md](docs/runbook.md) for the local cluster workflow,
[docs/release-artifacts.md](docs/release-artifacts.md) for published artifacts,
and [docs/test-report.md](docs/test-report.md) for the latest verification
evidence.

## CLI

Build and install the CLI as a real executable:

```bash
pnpm cli:pack
npm install -g ./dist-packages/h-sandbox-cli-*.tgz
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
- [docs/lifecycle.md](docs/lifecycle.md)
- [docs/processes.md](docs/processes.md)
- [docs/filesystem-artifacts.md](docs/filesystem-artifacts.md)
- [docs/routes.md](docs/routes.md)

## Routes

Expose a port after a process is listening on `0.0.0.0` inside the sandbox:

```bash
harakiri run sbx_... --cmd "python -m http.server 3000 --bind 0.0.0.0 >/tmp/http.log 2>&1 &"
harakiri expose sbx_... --port 3000 --wait --wait-path /
harakiri routes sbx_...
```

Use `--access token` for protected previews. The route token is printed only
when the route is created; later list calls show only a token hint. See
[docs/routes.md](docs/routes.md) for SDK helpers, adapter cache guidance, and
cleanup.

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

## Credential Vault

Credential Vault gives sandbox code fake environment values while the runtime
injects real credentials only into matching HTTPS requests. It supports
one-time values, envelope-encrypted workspace custody, Kubernetes Secret
references, GitHub App installation tokens, template credential slots, and
credential-aware restricted egress.

```bash
export OPENAI_API_KEY='...'
harakiri create \
  --template open-agents-dev:stable \
  --credential 'preset=openai,from-env=OPENAI_API_KEY'
harakiri vault inspect sbx_...
```

Start with [docs/credential-vault.md](docs/credential-vault.md) and the
[cookbook](docs/credential-vault-cookbook.md). Operators must review the
[runtime support matrix](docs/credential-vault-support.md) and
[operations guide](docs/credential-vault-operations.md), especially the
OpenSandbox `dns+nft` requirement.

## Documentation

- [docs/README.md](docs/README.md) - documentation index by audience
- [docs/workspaces.md](docs/workspaces.md) - workspace concepts, ownership and lifecycle
- [docs/workspace-reference.md](docs/workspace-reference.md) - workspace API, SDK and CLI
- [docs/tutorials.md](docs/tutorials.md) - tested end-to-end tutorials with
  assertions and cleanup
- [docs/architecture.md](docs/architecture.md) - subsystem map and data flow
- [docs/opensandbox-boundaries.md](docs/opensandbox-boundaries.md) - runtime
  and Kubernetes ownership rules
- [docs/extensions.md](docs/extensions.md) - provider and extension interfaces
- [docs/api.md](docs/api.md) - HTTP API reference
- [docs/sdk.md](docs/sdk.md) - TypeScript SDK guide
- [docs/cli.md](docs/cli.md) - CLI reference
- [docs/errors.md](docs/errors.md) - error handling and troubleshooting
- [docs/credential-vault.md](docs/credential-vault.md) - secure credential
  sources, template slots, runtime attachment, and lifecycle behavior
- [docs/security/credential-vault-threat-model.md](docs/security/credential-vault-threat-model.md) -
  custody boundaries, threats, controls, and residual risks
- [CONTRIBUTING.md](CONTRIBUTING.md) - contribution workflow
- [SECURITY.md](SECURITY.md) - security reporting and boundaries

## License

Apache-2.0. See [LICENSE](LICENSE).
