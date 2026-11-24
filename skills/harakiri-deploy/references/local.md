# Local development (no real sandboxes)

This runs the API and dashboard on a laptop with the **`dev` runtime
provider**. Sandbox lifecycle, terminal, files, logs, metrics and routes come
from in-memory fixtures. **No code runs in an isolated sandbox.** Use it to
develop Harakiri, try the dashboard or test SDK/CLI contracts. To run real
sandboxes, use [kubernetes.md](kubernetes.md). On macOS that guide includes a
local k0s VM.

Source of truth: `docs/development.md` and `CONTRIBUTING.md` in the clone. Use
`main` for contribution work, or a release tag to reproduce a release.

## Requirements

- Node.js 22 or newer, with Corepack enabled. pnpm is pinned by `packageManager`.
- Docker, or another Compose-compatible runtime.
- Free loopback ports: 15432 (PostgreSQL), 8081 (Keycloak), 8080 (API),
  5173 (web).

Check read-only:

```bash
node --version
docker info --format '{{.ServerVersion}}'
lsof -nP -iTCP:15432 -iTCP:8081 -iTCP:8080 -iTCP:5173 -sTCP:LISTEN
```

If 15432 or 8081 are taken, set `LOCAL_POSTGRES_PORT` or `LOCAL_KEYCLOAK_PORT`
before starting Compose. Then align `DATABASE_URL`, `PUBLIC_KEYCLOAK_URL` and
`KEYCLOAK_*` in `.env` with the chosen ports.

## Steps

Follow `docs/development.md`. The outline:

1. `corepack enable`, then `pnpm install --frozen-lockfile`, then `pnpm build`.
2. `cp .env.example .env`.
3. `docker compose up -d postgres keycloak`.
4. `pnpm db:migrate`, then `pnpm db:seed`.
5. `HARAKIRI_RUNTIME_PROVIDER=dev pnpm dev`. The web app is on
   `http://127.0.0.1:5173` and the API on `http://127.0.0.1:8080`.

Run `pnpm test`, `pnpm typecheck` and `pnpm build` one at a time, never
concurrently. They share SDK build output.

## Fixture credentials

Seeding creates a public development user and API key, documented in
`docs/development.md`. They are **public fixtures**:

- Use them only with this loopback-bound stack.
- Never expose the stack through a tunnel or ingress.
- Never point seeding at a shared database. Seeding refuses non-dev runtimes,
  disabled dev auth and `NODE_ENV=production`.

## Verify

```bash
export HARAKIRI_API_URL=http://127.0.0.1:8080
# The user exports HARAKIRI_API_KEY with the development fixture key.
harakiri doctor
```

To validate the packed SDK and CLI against the API without a cluster:
`docker compose up -d postgres`, then `pnpm conformance:dev`. This does not
prove compatibility with the OpenSandbox runtime.

## Contributor full stack

Contributors who change runtime-provider behavior, template builds, routing or
manifests use the k0s workflow in `CLAUDE.md` and `docs/runbook.md`
(`pnpm k0s:bootstrap`, `pnpm deploy:k0s`). That is a maintainer development
stack, not an operator installation. Do not hand it to users as a deployment.
