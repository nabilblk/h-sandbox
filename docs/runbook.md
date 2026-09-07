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
- Mailpit: `http://127.0.0.1:18086`
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
- installs Mailpit in the Keycloak namespace for development invite-email capture
- configures Keycloak realm SMTP to send development invitation emails to Mailpit
- installs or upgrades the official OpenSandbox all-in-one Helm chart with gateway mode enabled

The k0s manifest sets `OPEN_SANDBOX_ALLOW_FALLBACK=0`, so sandbox tests fail
fast if OpenSandbox is unavailable. Terminal, filesystem, and metrics requests
use OpenSandbox endpoint-resolved `execd`; in gateway/header mode the API sends
those requests to `OPEN_SANDBOX_GATEWAY_URL` with the returned
`OpenSandbox-Ingress-To` header.

## Access

```bash
pnpm ports
```

This uses kubeconfig `infra/k0s/harakiri.kubeconfig`, opens the API, web, Keycloak, Mailpit, OpenSandbox server, and OpenSandbox gateway forwards, and stores logs/PIDs under `/tmp/harakiri-portforwards`.
When `tmux` is available, the forwards run in a persistent `harakiri-port-forwards` tmux session.

```bash
pnpm ports:status
pnpm ports:stop
pnpm ports:restart
bash infra/scripts/port-forward.sh attach
```

## Member Invitations

Harakiri stores invitation state and organization access. Keycloak owns user
identity, password setup, and email verification. The API needs Keycloak admin
credentials to create users and trigger required-action setup emails:

```bash
KEYCLOAK_ADMIN_BASE_URL=http://keycloak.keycloak.svc.cluster.local:8080
KEYCLOAK_ADMIN_REALM=harakiri
KEYCLOAK_ADMIN_TOKEN_REALM=master
KEYCLOAK_ADMIN_CLIENT_ID=admin-cli
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_ADMIN_PASSWORD=...
KEYCLOAK_INVITATION_CLIENT_ID=harakiri-web
KEYCLOAK_INVITATION_REDIRECT_URI=http://127.0.0.1:15173/#dashboard/sandboxes
```

The k0s development manifests use the local Keycloak admin account and Mailpit.
After `pnpm deploy:k0s && pnpm ports:restart`, open Mailpit at
`http://127.0.0.1:18086` to inspect invitation emails.

To verify manually:

```bash
curl http://127.0.0.1:18082/v1/org/invitations \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"email":"invite-smoke@example.com"}'
```

Then open Mailpit, follow the Keycloak action link, set a password, and sign in
with the invited email. The next login accepts the pending invitation, creates
the membership, and routes the user into the invited organization. A regular
member should not see the Members navigation item; direct member-management API
requests should return `403`.

For production, replace Mailpit with real SMTP in Keycloak and use a Keycloak
service account or managed admin secret instead of the development admin user.

## Web OIDC Client

The browser app is a public OIDC client. Keep the Keycloak client aligned with
these settings:

- Standard flow enabled.
- Implicit flow disabled.
- PKCE code challenge method set to `S256`.
- Valid redirect URIs include the web origin/path used by the dashboard.
- Valid post-logout redirect URIs include the same web origin/path, or use `+`
  in Keycloak to mirror the valid redirect URI list.
- Web origins include the deployed web origin.

The web bundle reads:

```bash
PUBLIC_KEYCLOAK_URL=https://...
PUBLIC_KEYCLOAK_REALM=harakiri
PUBLIC_KEYCLOAK_CLIENT_ID=harakiri-web
PUBLIC_KEYCLOAK_SILENT_CHECK_SSO=false
```

Keep `PUBLIC_KEYCLOAK_SILENT_CHECK_SSO=false` unless
`https://<web-host>/silent-check-sso.html` is also registered as a valid
redirect URI. Without silent check-sso, reloads still use Keycloak `check-sso`,
but the browser may briefly leave and return to the app while the SSO session is
checked.

The frontend disables Keycloak's session-status iframe. Do not depend on that
iframe for browser logout detection; use short access-token lifetimes, refresh
failure handling, and Harakiri's same-app tab broadcast instead.

## Smoke Test

Core platform checks:

```bash
pnpm smoke
pnpm smoke:members
pnpm smoke:ttl
pnpm smoke:renew
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
`pnpm smoke:renew` runs the SDK beyond the original expiration deadline and
checks final expiration plus a short TTL. Allow about three minutes with the
scheduler running. See [lease coordination](./sandbox-lease-operations.md) for
migration 036 and coordinated API/scheduler upgrade requirements.
`pnpm smoke:template-redaction` submits secret-shaped build args and metadata
through the deployed API, verifies responses are redacted, and checks
PostgreSQL did not retain the original secret values.
`pnpm smoke:template-limits` verifies over-limit template resources return
`422 template_resource_limit_exceeded` and that the fourth queued build returns
`429 template_build_concurrency_limit_exceeded` with the default active build
limit of `3`.
`pnpm smoke:template-policy` verifies disallowed template images and disallowed
Dockerfile `FROM` references return `422 template_image_policy_violation`.
`pnpm smoke:sandbox-env` creates a sandbox with `env`, verifies the value is
available inside the runtime, and checks control-plane events record only the
env key name plus runtime workdir metadata.

The smoke tests check API health, template listing, sandbox create/run/kill, TTL scheduler cleanup, and an exposed HTTP route through the OpenSandbox gateway. The Playwright E2E verifies Keycloak login, Keycloak JWT API auth, API key creation, sandbox create, terminal command execution, detail tabs, and browser kill. Screenshots are written to `docs/artifacts/`.
`pnpm smoke:members` verifies admin member-management capability, Keycloak
invitation delivery to Mailpit when available, existing-Keycloak-user
membership activation, and regular-member `403` authorization.

Environment-specific public route checks are intentionally outside the generic
runbook:

```bash
pnpm env:harakiri:route-preflight
pnpm env:harakiri:route-public
```

Those commands are examples for one maintainer environment. See
`infra/scripts/env/harakiri/README.md` for the Cloudflare tunnel, DNS, and
certificate details.

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
- `SANDBOX_ROUTE_BASE_DOMAIN=<sandbox-route-base-domain>`
- `SANDBOX_ROUTE_PUBLIC_SCHEME=https`
- wildcard Ingress `*.<sandbox-route-base-domain> -> opensandbox-ingress-gateway`
- route limits `SANDBOX_MAX_ROUTES_PER_SANDBOX=8` and `SANDBOX_MAX_ROUTES_PER_ORG=200`

TLS secret `harakiri-sandbox-wildcard-tls` must exist in
`opensandbox-system`. For local k0s verification, the deploy script creates a
short-lived self-signed wildcard secret by default:


```bash
pnpm route:tls-dev
pnpm smoke:route-ingress
```

Use your own DNS and certificate automation for a public deployment. The
harakiri.io Cloudflare DNS-01 and tunnel example is documented separately in
`infra/scripts/env/harakiri/README.md`.

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
harakiri template init --name open-agents-dev --dockerfile Dockerfile --port 3000 --port 5173 --tag hot
```

Create a template definition and Dockerfile build record:

```bash
harakiri template build --name open-agents-dev .
harakiri template build --name open-agents-dev examples/templates/open-agents-dev
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

Template registry configuration is also carried by `harakiri-config`:

- `TEMPLATE_REGISTRY_PUSH_HOST` is the registry host the Kubernetes builder
  pushes to from inside k0s. In local development this is
  `harakiri-registry.harakiri.svc.cluster.local:5000`.
- `TEMPLATE_REGISTRY_RUNTIME_HOST` is the registry host stored on ready
  template versions for OpenSandbox to pull. In local development this is
  `127.0.0.1:5000`, matching the k0s node import/forwarding setup.
- `TEMPLATE_REGISTRY_REPOSITORY_PREFIX` scopes generated image names. The
  prototype uses `harakiri/templates`; generated Dockerfile images and cache
  layers are further isolated under `org-<organization-id>/<template-id>`.
- `TEMPLATE_REGISTRY_CREDENTIAL_KEY` enables encrypted registry-secret storage
  in PostgreSQL for the credential API. Rotate it through a real secret manager
  in production; the committed k0s value is development-only.
- `TEMPLATE_SCANNER_WEBHOOK_URL` optionally points to an external scanner hook
  that receives the digest-pinned image/provenance payload before a ready
  version is inserted.
- `TEMPLATE_SCANNER_TIMEOUT_MS` defaults to `10000`.
- `TEMPLATE_SCANNER_FAIL_ON_ERROR=1` makes scanner HTTP errors, timeouts, or
  invalid responses fail the template build; the default `0` persists
  `scan_failed` and keeps the ready version usable for manual review.
- `TEMPLATE_RUNTIME_PULL_PREFLIGHT_ENABLED=1` makes the builder prove a
  digest-pinned image can be pulled before inserting a ready version.
- `TEMPLATE_RUNTIME_PULL_PREFLIGHT_NAMESPACE=opensandbox` is where the
  disposable preflight Pod is created in the local k0s stack. It should match
  the OpenSandbox runtime namespace or equivalent pull-secret context in
  production.
- `TEMPLATE_RUNTIME_PULL_PREFLIGHT_TIMEOUT_MS=120000` bounds preflight wait
  time before the build fails.
- `TEMPLATE_IMAGE_PREPULL_ENABLED=1` enables optional hot-template image
  pre-pull after runtime preflight succeeds.
- `TEMPLATE_IMAGE_PREPULL_NAMESPACE=opensandbox` is where per-node disposable
  pre-pull Pods run.
- `TEMPLATE_IMAGE_PREPULL_HOT_TAGS=hot,prepull,warm` defines which template
  tags request cache warming.
- `TEMPLATE_IMAGE_PREPULL_FAIL_ON_ERROR=0` records pre-pull failures without
  failing the build. Set it to `1` only if image cache warming is a hard gate.
- `TEMPLATE_RETENTION_ENABLED=1` keeps scheduler retention active.
- `TEMPLATE_RETENTION_INTERVAL_MS=3600000` runs retention roughly hourly.
- `TEMPLATE_BUILD_LOG_RETENTION_DAYS=14` prunes old terminal build logs.
- `TEMPLATE_BUILD_CONTEXT_RETENTION_DAYS=7` prunes uploaded context archives
  after terminal builds complete.
- `TEMPLATE_BUILD_RETENTION_DAYS=30` removes old terminal build rows only when
  no template version references the build.
- `TEMPLATE_VERSION_RETENTION_DAYS=90` retires unused old ready versions that
  are not latest/stable and are not used by active sandboxes.
- `TEMPLATE_BUILDER_JOB_RETENTION_DAYS=1` prunes completed Kubernetes builder
  Jobs when `TEMPLATE_RETENTION_DELETE_BUILDER_JOBS=1`.

Inspect the deployed values before debugging a pull or push issue:

```bash
kubectl -n harakiri get configmap harakiri-config -o jsonpath='{.data.TEMPLATE_REGISTRY_PUSH_HOST}{"\n"}{.data.TEMPLATE_REGISTRY_RUNTIME_HOST}{"\n"}{.data.TEMPLATE_REGISTRY_REPOSITORY_PREFIX}{"\n"}{.data.TEMPLATE_SCANNER_WEBHOOK_URL}{"\n"}{.data.TEMPLATE_RUNTIME_PULL_PREFLIGHT_ENABLED}{"\n"}'
kubectl -n harakiri get pods,svc -l app=harakiri-registry
```

The local k0s registry is intentionally unauthenticated and should only be used
for development. A production registry setup should use separate least-privilege
credentials:

- Builder push credential: scoped to write only the Harakiri template namespace.
- Runtime pull credential: scoped to read only images that OpenSandbox may run.
- Optional base-image pull credential: scoped to approved private base-image
  namespaces when Dockerfile builds need them.
- Per-organization namespaces when teams must not see or overwrite each other's
  images. Harakiri generated-image paths include the organization namespace by
  default.

Do not pass registry passwords through template build args, metadata, or
Dockerfile content. Those surfaces are redacted, but they are not credential
stores. `template_registry_credentials` stores org-scoped registry host,
purpose, repository prefix, external Secret references, and optional encrypted
secret material. API responses never return raw secret material.

For an external registry rollout, the operator sequence is:

1. Create the registry namespace/repository and least-privilege push/pull
   credentials outside Harakiri.
2. Configure the builder environment to use the push credential and the
   OpenSandbox runtime or node image pull path to use the pull credential. Track
   the control-plane record with `POST /v1/registry-credentials`, including
   `purpose`, `repositoryPrefix`, `pullSecretRef`, and `pushSecretRef`. When
   the credential also includes `username` plus encrypted `secret` material,
   Harakiri can pass it to OpenSandbox `image.auth` during sandbox creation.
3. Set `TEMPLATE_REGISTRY_PUSH_HOST`, `TEMPLATE_REGISTRY_RUNTIME_HOST`, and
   `TEMPLATE_REGISTRY_REPOSITORY_PREFIX` to the external registry path.
4. Add the external registry and repository prefix to
   `TEMPLATE_IMAGE_ALLOW_REGISTRIES` and `TEMPLATE_IMAGE_ALLOW_PREFIXES`.
5. Run `pnpm smoke:template-build` and verify the resulting
   `template_versions.image_uri` is a digest-pinned reference and the build
   metadata contains `runtimePullPreflight.status = ok`.

Scanner webhook payloads are JSON:

```json
{
  "buildId": "bld_...",
  "templateId": "open-agents-dev",
  "organizationId": "org_...",
  "sourceType": "dockerfile",
  "imageUri": "registry.example.com/harakiri/templates/open-agents-dev@sha256:...",
  "imageDigest": "sha256:...",
  "provenance": { "builder": { "kind": "buildkit" } }
}
```

A scanner should return `2xx` JSON with a `status` field and any summary fields
that are useful in the dashboard/API:

```json
{ "status": "clean", "critical": 0, "high": 0 }
```

Harakiri normalizes the status into `template_versions.scan_status` and stores
the redacted body as `scan_summary`. Non-2xx responses, timeouts, and malformed
responses become `scan_failed` unless `TEMPLATE_SCANNER_FAIL_ON_ERROR=1`.

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
context, running the rootless BuildKit Kubernetes builder, pushing to the k0s
registry, and creating a digest-pinned ready template version. New versions
also include deferred SBOM, provenance, and scan fields. The scheduler prunes
old logs, uploaded contexts, unversioned terminal build rows, unused superseded
versions, and completed builder Jobs. Registry credential records and
Kubernetes Secret references are available for production push/pull rollout;
Git source builds, registry blob garbage collection, and real vulnerability
scanning remain part of the active custom template execution plan.

Inspect builder Jobs and logs:

```bash
kubectl -n harakiri get jobs,pods -l app=harakiri-template-build
kubectl -n harakiri logs job/<job-name> -c context-exporter
kubectl -n harakiri logs job/<job-name> -c buildkit
# Legacy compatibility only:
kubectl -n harakiri logs job/<job-name> -c kaniko
```

Builder health checks:

```bash
kubectl -n harakiri get deploy harakiri-template-builder
kubectl -n harakiri logs deploy/harakiri-template-builder --tail=200
kubectl -n harakiri exec deploy/harakiri-postgres -- psql -U harakiri -d harakiri -c \
  "select status, count(*) from template_builds group by status order by status;"
```

Correlate API build records with the Kubernetes Job, Pod, and node that handled
the build, plus the runtime pull preflight Pod and node:

```bash
kubectl -n harakiri exec deploy/harakiri-postgres -- psql -U harakiri -d harakiri -c \
  "select id, metadata->>'builderJobName' as job, metadata->>'builderPodName' as pod, metadata->>'builderNodeName' as node, metadata->'runtimePullPreflight'->>'podName' as preflight_pod, metadata->'runtimePullPreflight'->>'nodeName' as preflight_node from template_builds order by created_at desc limit 10;"
```

Failed image imports and pull debugging:

```bash
kubectl -n harakiri exec deploy/harakiri-postgres -- psql -U harakiri -d harakiri -c \
  "select id, template_id, source_type, image_destination, status, image_digest, error from template_builds where status = 'failed' order by updated_at desc limit 20;"

kubectl -n harakiri logs deploy/harakiri-template-builder --since=30m | grep -i "registry\\|manifest\\|digest\\|failed"
```

If the error is `registry manifest lookup failed`, verify the image exists,
the tag is public or credentials are configured, the registry is allowed by
`TEMPLATE_IMAGE_ALLOW_REGISTRIES`, and the manifest endpoint returns a
`Docker-Content-Digest` sha256 value. If OpenSandbox fails after a successful
build, compare `template_versions.image_uri` with the registry host reachable
from the k0s node and verify the image can be pulled from that host.

Troubleshooting matrix:

| Symptom | First checks | Usual fix |
| --- | --- | --- |
| Builds stay `queued` | `kubectl -n harakiri get deploy harakiri-template-builder`; active build count query above | Roll out or restart the builder, or cancel stale queued/building rows that are consuming the org limit |
| Dockerfile build stays `building` | `kubectl -n harakiri get jobs,pods -l app=harakiri-template-build`; `kubectl -n harakiri describe job/<job-name>` | Inspect `context-exporter` and builder container logs, then retry after fixing the Dockerfile, base image policy, or registry push path |
| Builder reports no digest | `kubectl -n harakiri logs job/<job-name> -c buildkit`; build metadata query above | Confirm the destination registry accepts pushes, BuildKit can write to `TEMPLATE_REGISTRY_PUSH_HOST`, and `TEMPLATE_BUILDKIT_REGISTRY_INSECURE` matches the registry scheme |
| Legacy builder reports no digest | `kubectl -n harakiri logs job/<job-name> -c kaniko`; build metadata query above | Confirm the destination registry accepts pushes and the legacy builder can write to `TEMPLATE_REGISTRY_PUSH_HOST` |
| Image import cannot resolve a digest | Builder logs filtered for `registry`, `manifest`, or `digest`; API error body | Fix the tag, registry visibility, registry policy, or operator-provided pull credentials |
| Runtime pull preflight fails | Build logs containing `runtime image pull preflight`; preflight Pod events before it is deleted; build metadata | Make `TEMPLATE_REGISTRY_RUNTIME_HOST` reachable from the k0s node and configure pull credentials in the preflight/runtime namespace |
| Hot-template pre-pull fails | Build metadata `runtimeImagePrepull`, API build detail, and `kubectl get pods -n opensandbox -l app=harakiri-template-image-prepull` while the build is running | Confirm Harakiri can list nodes, create Pods in the pre-pull namespace, and pull the final image on each ready node; disable fail-on-error if warming is only an optimization |
| Sandbox create fails after a successful build | Compare `template_versions.image_uri`, sandbox event metadata, selected `runtimeRegistryCredentialId`, and OpenSandbox logs | Make the runtime pull host reachable to OpenSandbox and configure either encrypted pull credentials for `image.auth` or runtime/node pull credentials for the OpenSandbox path |
| Sandbox env value is missing at runtime | Inspect the `POST /v1/sandboxes` payload, sandbox event `envKeys`, and run `env | sort` in the sandbox | Use `env` on sandbox creation or `harakiri create --env KEY=value`; command-level env is not retroactively added to an existing sandbox |
| Registry disk keeps growing | Registry `du -sh`; old ready/retired versions and retained build rows | Let scheduler retention retire unused versions first, then run registry GC only for blobs not referenced by `template_versions` |

Automated retention cleanup:

```bash
kubectl -n harakiri logs deploy/harakiri-scheduler --since=2h | grep "template retention cleanup" || true
kubectl -n harakiri exec deploy/harakiri-postgres -- psql -U harakiri -d harakiri -c \
  "select status, count(*) from template_versions group by status order by status;"
kubectl -n harakiri exec deploy/harakiri-postgres -- psql -U harakiri -d harakiri -c \
  "select action, target_id, metadata, created_at from audit_events where action = 'template.version.retired' order by created_at desc limit 20;"
```

Local registry and manual cache cleanup for development:

```bash
kubectl -n harakiri get pods,svc -l app=harakiri-registry
kubectl -n harakiri exec deploy/harakiri-registry -- du -sh /var/lib/registry || true
kubectl -n harakiri delete job -l app=harakiri-template-build --field-selector status.successful=1
kubectl -n harakiri delete job -l app=harakiri-template-build --field-selector status.failed=1
```

Do not delete registry blobs that are referenced by `template_versions` unless
the corresponding templates and versions have been retired and no rollback path
depends on them. The current automated retention pass protects database audit
records; registry blob garbage collection remains an explicit operator action.

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

Verify template visibility and mutation scope:

```bash
pnpm smoke:template-visibility
```

## Credential Vault Day-Two Checks

Credential Vault requires OpenSandbox `dns+nft`, Credential Proxy, and a
positive `credentialVaultReady` provider attestation. Check desired and
observed state without querying raw values:

```bash
harakiri vault inspect sbx_... --json
harakiri vault audit --target-id sbx_... --json
kubectl -n harakiri logs deploy/harakiri-scheduler --since=30m
```

Back up PostgreSQL and every referenced wrapping key together. Validate
external references and GitHub App issuers after cluster, RBAC, or credential
rotation changes. See [Credential Vault Operations](credential-vault-operations.md)
for enablement, restore drills, OpenShift constraints, and incident response.

## Teardown

```bash
infra/k0s/teardown.sh
```
