# Credential Vault Operations

This is the operator runbook for enabling and maintaining Credential Vault.
Developer workflows are in [Credential Vault](credential-vault.md); the current
profile classifications are in [Credential Vault Support](credential-vault-support.md).

## Runtime Prerequisites

The supported OpenSandbox profile requires:

- OpenSandbox server `v0.2.3` or a compatible later version that exposes the
  Credential Vault and endpoint APIs;
- OpenSandbox Helm chart `0.2.2` or a compatible later chart;
- egress sidecar `v1.1.7` or a compatible later image;
- egress mode `dns+nft` with `NET_ADMIN` available to the sidecar;
- `credentialProxy.enabled` on credential-bearing sandboxes;
- no competing transparent service-mesh proxy in the sandbox network
  namespace; and
- a sandbox image with `curl` or Python when users need access tests.

Harakiri reads the provider's sanitized egress status and requires
`credentialVaultReady: true`. A reachable sidecar without that attestation is
not considered safe.

## Encryption Key Setup

Generate a 32-byte wrapping key and store it in the existing Harakiri Secret:

```bash
openssl rand -base64 32
kubectl -n harakiri create secret generic harakiri-vault-key \
  --from-literal=CREDENTIAL_VAULT_KEY='<base64-key>'
```

Reference an existing Secret through the chart, or use the versioned keyring
mount for rotation:

```json
{
  "activeKeyId": "kek-2026-09",
  "keys": {
    "kek-2026-06": "<previous-32-byte-base64-key>",
    "kek-2026-09": "<active-32-byte-base64-key>"
  }
}
```

```bash
kubectl -n harakiri create secret generic harakiri-vault-keyring \
  --from-file=keyring.json=./keyring.json

helm upgrade --install harakiri ./infra/charts/harakiri \
  --namespace harakiri \
  --set credentialVault.encryption.keyId=kek-2026-09 \
  --set credentialVault.encryption.keyringSecret.name=harakiri-vault-keyring
```

Add the new key and switch `activeKeyId` before removing an old key. Keep every
key ID referenced by live database rows. Test database restore with the keyring
before retiring any key.

## Kubernetes External References

The resolver is disabled by default. Enable only approved namespaces and names:

```bash
helm upgrade --install harakiri ./infra/charts/harakiri \
  --namespace harakiri \
  --set credentialVault.externalSecrets.kubernetes.enabled=true \
  --set 'credentialVault.externalSecrets.kubernetes.allowedNamespaces[0]=harakiri' \
  --set 'credentialVault.externalSecrets.kubernetes.allowedNames[0]=harakiri-vault-agents' \
  --set-json 'credentialVault.externalSecrets.kubernetes.allowedNamePrefixes=[]'
```

Exact names let Helm render `resourceNames` with `get` only. Prefix rules
require namespace-level Secret `get` permission because Kubernetes RBAC cannot
match prefixes; Harakiri still checks the prefix before every read. It never
needs `list` or `watch`. External Secrets Operator can materialize the allowed
Secret without an ESO-specific Harakiri adapter.

## GitHub App Dynamic Credentials

Create one platform GitHub App with only the permissions that workspaces may
request. Install it on approved repositories. Put the private key in the
Harakiri Secret, then configure the non-secret client ID:

```bash
kubectl -n harakiri create secret generic harakiri-runtime-secrets \
  --from-file=DYNAMIC_GITHUB_APP_PRIVATE_KEY=./github-app-private-key.pem

helm upgrade --install harakiri ./infra/charts/harakiri \
  --namespace harakiri \
  --set credentialVault.dynamicCredentials.githubApp.enabled=true \
  --set credentialVault.dynamicCredentials.githubApp.clientId='<github-app-client-id>'
```

Use the chart's existing secret mechanism in real installs rather than creating
a second Secret if `secret.existingSecret` is already set. Workspace admins can
configure only installation IDs, repository names, and bounded permissions;
they never receive the App private key or issued token.

## Backup And Restore

Back up together:

- PostgreSQL, including credential metadata, encrypted envelopes, audit events,
  and attachment desired state;
- every wrapping key still referenced by encrypted records;
- Harakiri configuration and versioned Helm values; and
- operator-owned Kubernetes Secrets or external-secret definitions.

Do not expect sandbox snapshots to contain Vault state. After control-plane
restore, run normal provider inspection and reconciliation. After sandbox
snapshot restore, callers must supply explicit slot mappings.

Restore drill:

1. Restore PostgreSQL into an isolated namespace.
2. Mount the complete keyring and start only API/scheduler components.
3. List sanitized workspace sources and verify decryption through a disposable
   attachment, never by adding a readback endpoint.
4. Validate external references and dynamic issuers.
5. Create a disposable credential-bearing sandbox and inspect provider state.
6. Remove all disposable sources and sandboxes.

## Upgrade Order

1. Back up PostgreSQL and keys.
2. Review `docs/credential-vault-support.md` for changed provider versions.
3. Apply database migrations before serving new API traffic.
4. Upgrade OpenSandbox and its egress sidecar if required.
5. Upgrade Harakiri API and scheduler with the same image version.
6. Run capability, Helm, API, provider, and browser smoke tests.
7. Roll back application images only while retaining additive migrations and
   every old wrapping key.

## Health And Diagnostics

```bash
kubectl -n harakiri get deploy,pods
kubectl -n opensandbox-system get deploy,pods
curl -fsS "$HARAKIRI_API_URL/health"
harakiri vault presets --json
harakiri vault inspect "$SANDBOX_ID" --json
harakiri vault audit --target-id "$SANDBOX_ID" --json
```

The scheduler should continuously inspect bounded batches, refresh dynamic
credentials before expiry, and rehydrate missing provider entries. Investigate
repeated `requires_reinjection` or `failed` state instead of increasing retry
frequency.

## OpenShift And Service Mesh

The chart does not create or modify an SCC. Current `dns+nft` enforcement needs
`NET_ADMIN`, which `restricted-v2` does not grant. Credential Vault is therefore
**operator-action-required** on restricted OpenShift until the customer
approves a suitable runtime profile or OpenSandbox provides an enforcement mode
compatible with that SCC. Set `OPEN_SANDBOX_SEND_OPEN_NETWORK_POLICY=0` only to
run open-network sandboxes without the sidecar; that does not make Vault
available.

Do not inject Istio, Linkerd, or another transparent proxy into sandbox pods
that use the OpenSandbox egress sidecar. Namespace-level mesh exclusion must be
explicit and reviewed.

## Disable And Incident Procedure

To stop new Vault use, disable the feature in product policy or deploy a
runtime profile that reports it unsupported; do not advertise a degraded
success. Disable compromised sources, terminate affected sandboxes, revoke
upstream credentials, and use metadata-only audit history for scope. Follow the
[threat model incident response](security/credential-vault-threat-model.md#incident-response).

## Acceptance Gate

- Helm lint and a rendered-values review pass.
- External resolver RBAC has only required `get` access.
- API and scheduler receive key material; web and template builder do not.
- A live positive attachment, denied destination, mismatch, detach, resume,
  inspection, and rehydration scenario passes.
- Browser tests prove admin management and member denial.
- The version and result are recorded in `docs/test-report.md`.
