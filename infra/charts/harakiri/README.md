# Harakiri Sandbox Helm chart

Deploys the Harakiri **control plane** — API, dashboard (web), TTL/retention
scheduler, template-build worker, and the in-cluster template registry.

> [!IMPORTANT]
> This chart deploys only the Harakiri components. **PostgreSQL, Keycloak, and
> OpenSandbox are prerequisites** you run separately (see `infra/k8s/` and
> `docs/`). Point `config.DATABASE_URL`/`KEYCLOAK_*`/`OPEN_SANDBOX_*` and the
> Secret values at your instances.

## Install

```bash
# 1. Authenticate Helm to Harbor (one-time, for OCI pulls).
helm registry login core.campus.clusterdiali.me

# 2. Create the namespace.
kubectl create namespace harakiri

# 3. Provide secrets out-of-band (recommended over putting them in values).
kubectl -n harakiri create secret generic harakiri-api \
  --from-literal=DATABASE_URL='postgres://harakiri:CHANGEME@harakiri-postgres.harakiri.svc.cluster.local:5432/harakiri' \
  --from-literal=OPEN_SANDBOX_API_KEY='CHANGEME' \
  --from-literal=KEYCLOAK_ADMIN_USERNAME='admin' \
  --from-literal=KEYCLOAK_ADMIN_PASSWORD='CHANGEME'

# 4. Install from Harbor (OCI). Release name `harakiri` is recommended so the
#    in-cluster service DNS names line up with the bundled config defaults.
helm install harakiri oci://core.campus.clusterdiali.me/harakiri/charts/harakiri \
  --version 0.1.0 \
  --namespace harakiri \
  --set secret.existingSecret=harakiri-api \
  -f my-values.yaml
```

A minimal `my-values.yaml` for a real environment overrides the public URLs:

```yaml
config:
  PUBLIC_API_URL: "https://api.campus.clusterdiali.me"
  PUBLIC_WEB_URL: "https://app.campus.clusterdiali.me"
  PUBLIC_KEYCLOAK_URL: "https://auth.campus.clusterdiali.me"
  SANDBOX_ROUTE_BASE_DOMAIN: "sbx.campus.clusterdiali.me"
  KEYCLOAK_ISSUER: "https://auth.campus.clusterdiali.me/realms/harakiri"
  KEYCLOAK_JWKS_URL: "https://auth.campus.clusterdiali.me/realms/harakiri/protocol/openid-connect/certs"
  KEYCLOAK_ISSUER_ALLOWLIST: "https://auth.campus.clusterdiali.me/realms/harakiri"

ingress:
  enabled: true
  className: nginx
  web: { host: app.campus.clusterdiali.me }
  api: { host: api.campus.clusterdiali.me }
  tls:
    - hosts: [app.campus.clusterdiali.me, api.campus.clusterdiali.me]
      secretName: harakiri-tls
```

## Images

The chart pulls `{{ image.registry }}/{{ image.repository }}/harakiri-{api,web}`,
tag defaulting to the chart's `appVersion`. These are exactly what the
`Release (Harbor)` workflow publishes. The `scheduler` and `template-builder`
reuse the **api** image with a different container command.

If Harbor requires auth to pull, either reference a pre-created pull secret:

```yaml
imagePullSecrets:
  - name: harakiri-harbor
```

or let the chart render one (kept out of git — supply via `--set` or a private
values file):

```yaml
harborPullSecret:
  create: true
  username: robot$harakiri+pull
  password: "<token>"
```

## Key values

| Key | Default | Notes |
|-----|---------|-------|
| `image.registry` / `image.repository` | `core.campus.clusterdiali.me` / `harakiri` | Harbor host + project |
| `image.api.tag` / `image.web.tag` | `""` → `Chart.appVersion` | pin a specific image tag |
| `secret.existingSecret` | `""` | reference a Secret instead of rendering one |
| `secret.data.*` | empty | only used when `existingSecret` is unset |
| `config.*` | mirrors `infra/k8s` | non-secret env (ConfigMap) |
| `registry.enabled` | `true` | in-cluster template registry; disable to use an external one |
| `ingress.enabled` | `false` | dashboard/API ingress |
| `{api,scheduler,templateBuilder,web}.resources` | set | resource requests/limits |

Run `helm show values infra/charts/harakiri` for the full list.

## Production hardening

This chart adds resource limits, a dedicated ServiceAccount, and config/secret
checksums (rolling restart on change) on top of the raw `infra/k8s` manifests.
Still TODO before a production deployment (tracked in the security audit):

- **HA:** `scheduler.replicas` must stay `1` (no leader election yet). Run the
  API at `replicas >= 2` behind the Service; add a PodDisruptionBudget.
- **Pod security:** set `podSecurityContext`/`securityContext`
  (`runAsNonRoot: true`, `seccompProfile: RuntimeDefault`, drop capabilities).
- **Secrets:** prefer `existingSecret` backed by an external secrets manager.
- **Stateful deps:** run PostgreSQL with backups/PITR and Keycloak with HA;
  this chart does not manage them.

## Upgrade

```bash
helm upgrade harakiri oci://core.campus.clusterdiali.me/harakiri/charts/harakiri \
  --version <new> -n harakiri --reuse-values
```

`AUTO_MIGRATE=1` (default) runs DB migrations on API start.
