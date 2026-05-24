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
pnpm smoke:templates
pnpm smoke:template-redaction
pnpm smoke:template-limits
pnpm smoke:template-policy
pnpm smoke:route
pnpm smoke:route-ingress
pnpm e2e
pnpm screenshots
```

`pnpm smoke:templates` creates, runs, and kills sandboxes from the default
`python-3.12`, `python-3.12-data`, and `node-20` catalog templates to catch
custom-template regressions in the original catalog path.
`pnpm smoke:template-redaction` submits secret-shaped build args and metadata
through the deployed API, verifies responses are redacted, and checks
PostgreSQL did not retain the original secret values.
`pnpm smoke:template-limits` verifies over-limit template resources return
`422 template_resource_limit_exceeded` and that the fourth queued build returns
`429 template_build_concurrency_limit_exceeded` with the default active build
limit of `3`.
`pnpm smoke:template-policy` verifies disallowed template images and disallowed
Dockerfile `FROM` references return `422 template_image_policy_violation`.

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

Create a template definition and Dockerfile build record:

```bash
harakiri template build --name open-agents-dev .
harakiri template inspect open-agents-dev
```

`harakiri template build` follows the build by default and prints log lines plus
the final version ID, digest, duration, and next create command. For detached
operator polling, pass `--no-wait`, then use `harakiri template builds --query
open-agents-dev` and `harakiri template logs bld_...`.

Import an existing image and let the template builder resolve an immutable
digest:

```bash
harakiri template build --name ubuntu-import --source image --image ubuntu:24.04
kubectl -n harakiri logs deploy/harakiri-template-builder
```

Template build policy defaults are configured in `harakiri-config`:

- `TEMPLATE_MAX_CPU_COUNT=8`
- `TEMPLATE_MAX_MEMORY_MB=32768`
- `TEMPLATE_MAX_DEFAULT_PORTS=16`
- `TEMPLATE_BUILD_MAX_ACTIVE_PER_ORG=3`
- `TEMPLATE_IMAGE_ALLOW_REGISTRIES=docker.io,registry-1.docker.io,mcr.microsoft.com,gcr.io,ghcr.io,127.0.0.1:5000,harakiri-registry.harakiri.svc.cluster.local:5000`
- `TEMPLATE_IMAGE_DENY_REGISTRIES=`
- `TEMPLATE_IMAGE_ALLOW_PREFIXES=`
- `TEMPLATE_IMAGE_DENY_PREFIXES=`

`TEMPLATE_BUILD_MAX_ACTIVE_PER_ORG` counts `queued` and `building` records. If
the limit is hit, cancel stale queued builds or delete abandoned test templates
before enqueueing more work:

```bash
kubectl -n harakiri exec deploy/harakiri-postgres -- psql "$DATABASE_URL" -c \
  "select id, template_id, status, created_at from template_builds where status in ('queued', 'building') order by created_at;"
```

Image policy is enforced before template create, image-import build create, and
Dockerfile context storage. If users hit `template_image_policy_violation`,
inspect the normalized registry/prefix in the API response and adjust the
allow/deny ConfigMap values deliberately rather than bypassing the policy.

Create a sandbox from a template alias or immutable version:

```bash
harakiri create --template open-agents-dev --name agent-runner
harakiri create --template tplv_... --name pinned-runner
```

Operator inspection:

```bash
export KUBECONFIG="$PWD/infra/k0s/harakiri.kubeconfig"
kubectl -n harakiri exec deploy/harakiri-postgres -- psql "$DATABASE_URL" -c \
  "select id, template_id, status, image_destination, image_digest, error from template_builds order by created_at desc limit 10;"

kubectl -n harakiri exec deploy/harakiri-postgres -- psql "$DATABASE_URL" -c \
  "select build_id, sha256, size_bytes, file_count, updated_at from template_build_contexts order by updated_at desc limit 10;"

kubectl -n harakiri exec deploy/harakiri-postgres -- psql "$DATABASE_URL" -c \
  "select id, template_id, aliases, image_uri, image_digest, status, scan_status, provenance->>'buildId' as build_id from template_versions order by created_at desc limit 10;"
```

The deployed template builder handles `--source image` records by resolving the
registry digest, and handles Dockerfile records by exporting the uploaded
context, running a Kaniko Job, pushing to the k0s registry, and creating a
digest-pinned ready template version. New versions also include deferred SBOM,
provenance, and scan fields. Git source builds, production registry credentials,
image retention, and real vulnerability scanning remain part of the active
custom template execution plan.

Inspect builder Jobs and logs:

```bash
kubectl -n harakiri get jobs,pods -l app=harakiri-template-build
kubectl -n harakiri logs job/<job-name> -c context-exporter
kubectl -n harakiri logs job/<job-name> -c kaniko
```

Correlate API build records with the Kubernetes Job, Pod, and node that handled
the build:

```bash
kubectl -n harakiri exec deploy/harakiri-postgres -- psql -U harakiri -d harakiri -c \
  "select id, metadata->>'builderJobName' as job, metadata->>'builderPodName' as pod, metadata->>'builderNodeName' as node from template_builds where source_type = 'dockerfile' order by created_at desc limit 10;"
```

Inspect recent template audit events:

```bash
kubectl -n harakiri exec deploy/harakiri-postgres -- psql -U harakiri -d harakiri -c \
  "select action, target_type, target_id, actor_label, metadata, created_at from audit_events where action like 'template.%' order by created_at desc limit 20;"
```

Archive a custom template when it should no longer be used for new sandboxes:

```bash
harakiri template archive open-agents-dev
curl -X POST "$PUBLIC_API_URL/v1/templates/open-agents-dev/archive" -H "x-api-key: $HK_KEY"
```

Archiving hides the template from default lists, prevents future sandbox
creation by that template alias or version, and cancels queued/building builds
for the template. Existing sandboxes are not killed by archive.

Run the end-to-end Dockerfile builder smoke:

```bash
pnpm smoke:template-build
```

## Teardown

```bash
infra/k0s/teardown.sh
```
