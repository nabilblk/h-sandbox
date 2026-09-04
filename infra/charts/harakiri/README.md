# Harakiri Sandbox Helm chart

Deploys the Harakiri **control plane** — API, dashboard (web), TTL/retention
scheduler, template-build worker, and the in-cluster template registry.

> [!IMPORTANT]
> This chart deploys only the Harakiri components. **PostgreSQL, Keycloak, and
> OpenSandbox are prerequisites** you run separately (see `infra/k8s/` and
> `docs/`). Point `config.DATABASE_URL`/`KEYCLOAK_*`/`OPEN_SANDBOX_*` and the
> Secret values at your instances.

See [`docs/release-artifacts.md`](../../../docs/release-artifacts.md) for the
image, chart, npm, OpenSandbox, and template artifact map used by release
handoffs.

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
| `config.OPEN_SANDBOX_SEND_OPEN_NETWORK_POLICY` | `1` | send no-op allow-all OpenSandbox `networkPolicy` at create time so k0s can mutate egress later; set `0` only for restricted OpenShift profiles that cannot run the egress sidecar |
| `credentialVault.encryption.keyId` | `local-v1` | identifier persisted with newly encrypted workspace credentials |
| `credentialVault.encryption.keyringSecret.name` | `""` | optional versioned keyring Secret mounted into the API and scheduler |
| `secret.data.CREDENTIAL_VAULT_KEY` | empty | base64 or text wrapping key for simple single-key installs; prefer an existing Secret |
| `credentialVault.externalSecrets.kubernetes.enabled` | `false` | allow the API to resolve approved Kubernetes Secret references |
| `credentialVault.externalSecrets.kubernetes.allowedNamespaces` | release namespace | namespaces in which references may resolve |
| `credentialVault.externalSecrets.kubernetes.allowedNames` | `[]` | exact Secret names; Helm can scope RBAC with `resourceNames` when no prefixes are configured |
| `credentialVault.externalSecrets.kubernetes.allowedNamePrefixes` | `[harakiri-vault-]` | permitted name prefixes; Harakiri enforces these because Kubernetes RBAC cannot match prefixes |
| `credentialVault.dynamicCredentials.githubApp.enabled` | `false` | enable GitHub App installation token issuance |
| `credentialVault.dynamicCredentials.githubApp.clientId` | `""` | operator-owned GitHub App client ID; required when enabled |
| `secret.data.DYNAMIC_GITHUB_APP_PRIVATE_KEY` | empty | GitHub App PEM private key; prefer `secret.existingSecret` |
| `registry.enabled` | `true` | in-cluster template registry; disable to use an external one |
| `ingress.enabled` | `false` | dashboard/API ingress |
| `{api,scheduler,templateBuilder,web}.resources` | set | resource requests/limits |

Run `helm show values infra/charts/harakiri` for the full list.

## Credential Vault encryption keys

Workspace credential values use a random data-encryption key per record. The
data key is wrapped by the active operator-owned key; PostgreSQL stores only
ciphertext, the wrapped data key, and its key identifier.

For a simple installation, put a 32-byte base64 key in the existing API Secret
as `CREDENTIAL_VAULT_KEY` and keep `credentialVault.encryption.keyId` stable.
For rotation, create a versioned JSON keyring instead:

```bash
kubectl -n harakiri create secret generic harakiri-vault-keyring \
  --from-file=keyring.json=./keyring.json

helm upgrade --install harakiri ./infra/charts/harakiri \
  --namespace harakiri \
  --set credentialVault.encryption.keyringSecret.name=harakiri-vault-keyring
```

```json
{
  "activeKeyId": "kek-2026-09",
  "keys": {
    "kek-2026-06": "<previous-32-byte-base64-key>",
    "kek-2026-09": "<active-32-byte-base64-key>"
  }
}
```

Add the new key and switch `activeKeyId` before removing an old key. Records
remain readable through the key ID stored with each envelope. Removing a key
that is still referenced makes those credentials intentionally undecryptable;
test restore and rollback before retiring it. Template-builder and web pods do
not receive the keyring.

> [!NOTE]
> The **web runtime is chart-configured**. The chart renders `config.PUBLIC_*`
> into a `config.js` ConfigMap and mounts it into the nginx document root. It
> also mounts an nginx config that listens on an unprivileged port, so the web
> pod works under restricted OpenShift without mutating `/usr/share/nginx/html`.

## External Secret references

Harakiri can resolve a credential from an existing Kubernetes Secret without
storing its value in PostgreSQL. The resolver is disabled by default because it
grants the API service account read access to selected Secrets.

Create the source Secret and enable the smallest practical allowlist:

```bash
kubectl -n harakiri create secret generic harakiri-vault-agents \
  --from-literal=OPENAI_API_KEY="$OPENAI_API_KEY"

helm upgrade --install harakiri ./infra/charts/harakiri \
  --namespace harakiri \
  --set credentialVault.externalSecrets.kubernetes.enabled=true \
  --set 'credentialVault.externalSecrets.kubernetes.allowedNamespaces[0]=harakiri' \
  --set 'credentialVault.externalSecrets.kubernetes.allowedNames[0]=harakiri-vault-agents' \
  --set-json 'credentialVault.externalSecrets.kubernetes.allowedNamePrefixes=[]'
```

With exact names and no prefixes, the generated Role uses Kubernetes
`resourceNames`. Prefix allowlists require a namespace-wide `get` permission,
then the API enforces the prefix before making a Kubernetes request. If
`rbac.create=false`, provision equivalent `get` permission for the configured
service account yourself. Harakiri never needs `list` or `watch` for this
resolver.

External Secrets Operator can manage the source Secret: configure an
`ExternalSecret` to materialize `harakiri-vault-agents`, then reference the
resulting Kubernetes Secret from Harakiri. No ESO-specific Harakiri adapter is
required. See
[`docs/external-secret-references.md`](../../../docs/external-secret-references.md)
for the complete custody and rotation workflow.

## Dynamic GitHub App credentials

The optional dynamic adapter mints short-lived installation tokens and stores
only scope, expiry, validation, and usage metadata. Configure the App identity
as operator-owned input:

```bash
helm upgrade --install harakiri ./infra/charts/harakiri \
  --namespace harakiri \
  --set credentialVault.dynamicCredentials.githubApp.enabled=true \
  --set credentialVault.dynamicCredentials.githubApp.clientId='<client-id>' \
  --set-file secret.data.DYNAMIC_GITHUB_APP_PRIVATE_KEY=./github-app-private-key.pem
```

For a real installation, put the PEM in `secret.existingSecret` rather than
Helm command history. Workspace admins configure only installation IDs,
repository names, and bounded permissions. See
[`docs/credential-vault-operations.md`](../../../docs/credential-vault-operations.md).

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
