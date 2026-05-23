# Harakiri Sandbox Runbook

## Local Development

```bash
pnpm install
docker compose up -d postgres keycloak
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The seeded API key is:

```text
hk_live_demo_lyra_labs_0000000000000000000000000000000000
```

Useful local URLs:

- Web: `http://127.0.0.1:15173`
- API: `http://127.0.0.1:18082`
- Keycloak: `http://127.0.0.1:18084`
- OpenSandbox proxy: `http://127.0.0.1:18083`
- OpenSandbox gateway: `http://127.0.0.1:18085`

## k0s Bootstrap

This repository targets macOS hosts by creating a Linux VM with Lima and installing k0s inside it.

```bash
pnpm k0s:bootstrap
export KUBECONFIG="$PWD/infra/k0s/harakiri.kubeconfig"
pnpm k0s:verify
```

The bootstrap script:

- creates the `harakiri-k0s` Lima VM when missing
- installs k0s as a single-node controller with worker enabled
- writes `infra/k0s/harakiri.kubeconfig`
- installs Rancher local-path storage as the default storage class
- verifies the node is Ready

## Deploy

```bash
pnpm deploy:k0s
```

The deploy script:

- builds `harakiri-api:dev`
- builds `harakiri-web:dev`
- imports both images into the k0s containerd image store
- installs `ingress-nginx` with a NodePort service
- builds the official OpenSandbox ingress component locally as `opensandbox-ingress:local` for the k0s node architecture
- applies PostgreSQL, Keycloak, API, scheduler, and web manifests
- applies the Harakiri Keycloak login theme from the `keycloak-theme-harakiri` ConfigMap
- installs or upgrades the official OpenSandbox all-in-one Helm chart with gateway mode enabled

If OpenSandbox cannot run in the local VM, the control-plane adapter remains usable with development fallback enabled. Disable fallback by setting `OPEN_SANDBOX_ALLOW_FALLBACK=0` in `infra/k8s/harakiri/harakiri.yaml`.

## Access

```bash
pnpm ports
```

This uses kubeconfig `infra/k0s/harakiri.kubeconfig`, opens the API, web, Keycloak, OpenSandbox server, and OpenSandbox gateway forwards, and stores logs/PIDs under `/tmp/harakiri-portforwards`.
When `tmux` is available, the forwards run in a persistent `harakiri-port-forwards` tmux session.

```bash
pnpm ports:status
pnpm ports:stop
pnpm ports:restart
bash infra/scripts/port-forward.sh attach
```

## Smoke Test

Core platform checks:

```bash
pnpm smoke
pnpm smoke:ttl
pnpm smoke:route
pnpm smoke:route-ingress
pnpm e2e
pnpm screenshots
```

The smoke tests check API health, template listing, sandbox create/run/kill, TTL scheduler cleanup, and an exposed HTTP route through the OpenSandbox gateway. The Playwright E2E verifies Keycloak login, Keycloak JWT API auth, API key creation, sandbox create, terminal command execution, detail tabs, and browser kill. Screenshots are written to `docs/artifacts/`.

Harakiri.io environment checks:

```bash
pnpm env:harakiri:route-preflight
pnpm env:harakiri:route-public
```

These environment checks assume the current `harakiri.io` Cloudflare Tunnel, DNS, and edge TLS setup. They are not required for a generic core-platform deployment.

## Sandbox Routes

Route creation is explicit:

```bash
harakiri expose sbx_... --port 3000
harakiri routes sbx_...
```

Or through the API:

```bash
curl http://127.0.0.1:18082/v1/sandboxes/sbx_.../routes \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"port":3000,"protocol":"http"}'
```

The k0s deployment configures:

- `SANDBOX_ROUTE_MODE=opensandbox-gateway`
- `SANDBOX_ROUTE_BASE_DOMAIN=harakiri.io`
- `SANDBOX_ROUTE_PUBLIC_SCHEME=https`
- wildcard Ingress `*.harakiri.io -> opensandbox-ingress-gateway`
- route limits `SANDBOX_MAX_ROUTES_PER_SANDBOX=8` and `SANDBOX_MAX_ROUTES_PER_ORG=200`

For public access, Cloudflare resolves `*.harakiri.io` to the Cloudflare Tunnel that reaches the k0s ingress. This route shape intentionally stays one label below `harakiri.io`, so the existing `*.harakiri.io` Cloudflare edge certificate covers generated sandbox hosts. Exact Cloudflare Tunnel host rules for `app.harakiri.io`, `auth.harakiri.io`, and other services must remain above the wildcard sandbox rule.

TLS secret `harakiri-sandbox-wildcard-tls` must exist in `opensandbox-system`. For local k0s verification, the deploy script creates a short-lived self-signed wildcard secret by default:


```bash
pnpm route:tls-dev
pnpm smoke:route-ingress
```

For a real origin certificate, install cert-manager and request a Let's Encrypt wildcard certificate through Cloudflare DNS-01:

```bash
export CLOUDFLARE_API_TOKEN=... # Zone:DNS:Edit and Zone:Zone:Read
export LETSENCRYPT_EMAIL=nabilblk@gmail.com
pnpm env:harakiri:route-tls-letsencrypt
kubectl -n opensandbox-system describe certificate harakiri-sandbox-wildcard-tls
```

To upsert the Cloudflare wildcard DNS record when credentials are available:

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ZONE_ID=...
export HARAKIRI_SANDBOX_DNS_TARGET=<ingress-or-tunnel-hostname>
pnpm env:harakiri:cloudflare-dns
pnpm env:harakiri:route-preflight
```

Local route verification uses the gateway forward:

```bash
pnpm ports:restart
pnpm smoke:route
```

`pnpm smoke:route` creates a sandbox, starts `python -m http.server 3000`, exposes port 3000, and curls `http://127.0.0.1:18085/` with the generated route host header.

## CLI

```bash
pnpm --filter @harakiri/cli build
pnpm cli:pack
npm install -g ./dist-packages/harakiri-cli-0.1.0.tgz
harakiri login --api-url http://127.0.0.1:18082 --api-key hk_live_demo_lyra_labs_0000000000000000000000000000000000
harakiri create --template python-3.12-data
harakiri run --stdin agent.py
harakiri expose sbx_... --port 3000
harakiri list
```

## Custom Templates

Create a local template config:

```bash
harakiri template init --name open-agents-dev --dockerfile Dockerfile
```

Create a template definition and queued build record:

```bash
harakiri template build --name open-agents-dev . --image registry.example.com/harakiri/open-agents-dev:dev
harakiri template builds --query open-agents-dev
harakiri template logs bld_...
harakiri template inspect open-agents-dev
```

Create a sandbox from a template alias or immutable version:

```bash
harakiri create --template open-agents-dev --name agent-runner
harakiri create --template tplv_... --name pinned-runner
```

Operator inspection:

```bash
export KUBECONFIG="$PWD/infra/k0s/harakiri.kubeconfig"
kubectl -n harakiri exec deploy/postgres -- psql "$DATABASE_URL" -c \
  "select id, template_id, status, image_destination, image_digest, error from template_builds order by created_at desc limit 10;"

kubectl -n harakiri exec deploy/postgres -- psql "$DATABASE_URL" -c \
  "select id, template_id, aliases, image_uri, image_digest, status from template_versions order by created_at desc limit 10;"
```

Current limitation: the API persists queued build records, but the k0s BuildKit
worker that consumes those records is still part of the active custom template
execution plan. Until that worker is deployed, use image-based template
definitions for runtime testing and treat `template build` as control-plane
record creation.

## Teardown

```bash
infra/k0s/teardown.sh
```
