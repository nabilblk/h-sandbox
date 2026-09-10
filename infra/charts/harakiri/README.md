# Harakiri Sandbox Helm chart

Deploys the Harakiri **control plane** — API, dashboard (web), TTL/retention
scheduler, template-build worker, and the in-cluster template registry.

> [!IMPORTANT]
> This chart deploys only the Harakiri components. **PostgreSQL, Keycloak, and
> the selected runtime provider are prerequisites** you run separately.
> OpenSandbox is the current integrated provider. Supply `DATABASE_URL` and
> other credentials through `secret.existingSecret`; configure public identity
> and runtime endpoints explicitly. This chart is not a complete installation
> by itself.

See [`docs/release-artifacts.md`](../../../docs/release-artifacts.md) for the
image, chart, npm, OpenSandbox, and template artifact map used by release
handoffs.

## Install

Start with [Install on Kubernetes](../../../docs/install-kubernetes.md). The
full guide covers database/identity setup, private configuration, the two
published Helm charts, browser sign-in and a model-free native SDK check.
The [reference profile](../../preview/README.md) supplies tested operator inputs;
do not install raw development defaults on a public cluster.

The recorded candidate is `0.5.0-rc.8`, paired with the
[public-launch image overlay](../../../docs/release-notes/0.5.0-rc.8-public-values.yaml).
Anonymous reads of those published Harbor artifacts require no registry login.
Private mirrors need their own scoped read identity. Compare the chart's full
OCI digest with the [release receipt](../../../docs/release-notes/0.5.0-rc.8-delivery.md).

For existing infrastructure, review [values.yaml](values.yaml) and supply your
own namespace, database, realm and runtime settings. Use a realm-scoped service
account rather than a Keycloak master password. Keep dev authentication/seed
accounts disabled, set the expected API audience, and align public origins,
issuer, browser redirects and logout URLs. The web/API ingress values do not
configure Keycloak ingress, wildcard sandbox routes, DNS or certificates for you.

The native reference is single-node Linux/arm64 evaluation. Do not infer
restricted OpenShift, native amd64, HA or production acceptance from chart
rendering or image architecture availability.

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

- **HA:** the reference is single-node and not HA-certified. Keep the scheduler
  at one replica; review coordination, storage and recovery before scaling.
- **Pod security:** set `podSecurityContext`/`securityContext`
  (`runAsNonRoot: true`, `seccompProfile: RuntimeDefault`, drop capabilities).
- **Secrets:** prefer `existingSecret` backed by an external secrets manager.
- **Stateful deps:** run PostgreSQL with backups/PITR and Keycloak with HA;
  this chart does not manage them.

## Upgrade

Follow the target release's migration order and use its downloaded chart with
your preserved operator values and matching versioned image overlay. Do not
regenerate passwords, change public origins accidentally or rely on
`--reuse-values` instead of reviewing new configuration requirements.

`AUTO_MIGRATE=1` runs database migrations on API start. Take and test coordinated
database, Secret/keyring and workspace-volume backups first. An image rollback
alone does not undo a migration. See
[persistent workspace operations](../../../docs/persistent-workspace-operations.md)
and [Vault operations](../../../docs/credential-vault-operations.md).
