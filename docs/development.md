# Local Development

This guide is the generic contributor path. It does not require Cloudflare,
the `harakiri.io` DNS zone, or the public tunnel used by the maintainer lab.

## Prerequisites

- Node.js 22 or newer
- pnpm 11.2.2 (the repository `packageManager` version)
- Docker or another Compose-compatible runtime
- kubectl, Helm, Lima, and k0s only when testing the full OpenSandbox-backed
  stack

## Repository Setup

Run `pnpm test`, `pnpm typecheck` and `pnpm build` one at a time. These root
commands order package tasks sequentially because CLI validation rebuilds the
SDK artifacts also consumed by the dashboard. Running separate build commands
concurrently can remove `packages/sdk/dist` while another process is reading it.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build
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

Use this only with the loopback-bound development stack. It is a public fixture,
not a usable deployment secret. Seeding requires the dev runtime, dev auth and a
non-production Node environment; it must never target a shared database.

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

To run the public SDK and CLI conformance suite without k0s or OpenSandbox,
start PostgreSQL and use the same dev-runtime gate that CI runs:

```bash
docker compose up -d postgres
pnpm conformance:dev
```

This validates the package/API contract from packed npm tarballs. It does not
claim OpenSandbox dataplane compatibility; use the k0s flow below for that.

Useful local URLs:

- Web: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:8080`
- Keycloak: `http://127.0.0.1:8081`

## Browser Sign-In Sessions

The web app uses Keycloak's JavaScript adapter with the OIDC standard flow,
PKCE S256, and nonce validation. Tokens are kept in adapter memory and are not
persisted in `localStorage`. On reload, the app starts in a checking state and
uses Keycloak SSO to recover the browser session when it still exists.
Keycloak's session-status iframe is disabled because modern browser tracking
protections and headless browsers can make that iframe unreliable; Harakiri
uses refresh failures plus same-app tab broadcasts for session-expired/logout
detection.

API calls go through an async token path that refreshes the access token before
requests and retries one `401` after a forced refresh. If refresh fails, the UI
clears local state and shows a session-expired sign-in prompt.

Logout is provider logout, not just local cleanup. The account menu calls the
OIDC logout flow and returns to `#landing` after Keycloak accepts the
post-logout redirect. The local dev realm config enables standard flow, disables
implicit flow, requires PKCE S256, and allows post-logout redirects to match the
client redirect URI list.

Silent `check-sso` is optional because it needs
`/silent-check-sso.html` registered as a valid redirect URI in Keycloak:

```bash
PUBLIC_KEYCLOAK_SILENT_CHECK_SSO=true pnpm --filter @harakiri/web dev
```

## Interface Checks

Run focused checks while developing:

```bash
pnpm --filter @harakiri/api test
pnpm --filter @harakiri/web test
pnpm --filter @h-sandbox/cli test
pnpm --filter @h-sandbox/sdk test
pnpm openapi:check
```

Before submitting a broad change:

```bash
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

## Database and Browser Checks

Database-dependent tests are skipped unless both test URLs are set. Point these
only at a disposable local test database, never a populated or shared instance:

```bash
# DATABASE_URL must already identify your disposable PostgreSQL database.
pnpm db:migrate
SANDBOX_TEST_DATABASE_URL="$DATABASE_URL" \
  WORKSPACE_TEST_DATABASE_URL="$DATABASE_URL" pnpm test
```

The fixture-based browser suites need no live login or model credentials. Build
workspace dependencies first and choose a free port; the runner refuses to
reuse an unrelated server:

```bash
pnpm exec playwright install chromium
HARAKIRI_E2E_MANAGED_SERVER=1 HARAKIRI_E2E_WEB_PORT=15174 \
  pnpm exec playwright test tests/e2e/docs-experience.spec.ts \
  tests/e2e/authorization.spec.ts tests/e2e/preview-readiness.spec.ts
```

## CLI Development

```bash
pnpm --filter @h-sandbox/cli build
pnpm cli:pack
VERSION="$(node -p 'JSON.parse(require("fs").readFileSync("packages/cli/package.json", "utf8")).version')"
npm install -g "./dist-packages/h-sandbox-cli-${VERSION}.tgz"
harakiri login --api-url http://127.0.0.1:8080 --api-key hk_live_demo_lyra_labs_0000000000000000000000000000000000
harakiri create --template python-3.12-data --name local-dev
```

The installed binary and SDK use the same `/v1` API contracts as the web app.

## Documentation Exports

The web build generates `/llms.txt`, `/llms-full.txt`, `/docs/index.json` and
`/docs/<page>.md` from the same React page inventory used in the browser. Run
`pnpm --filter @harakiri/web docs:export` after editing content during an active
dev session. Both CLI and TypeScript tabs are exported, without interactive
copy controls. Generated files are ignored; edit the source pages instead.
`docs-export.test.ts` verifies inventory coverage, tables, links and exact code.

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
