# External Secret References

External references let Harakiri use credentials owned by the cluster or an
external secret manager without storing plaintext values in the Harakiri
database. Harakiri stores only a locator, provider preset, use policy,
validation state, and usage metadata.

On migration-037 installations, management examples require an admin-created
API key with `credentials:manage`. Runtime keys with `credentials:use` can attach
only references shared with organization members and also need the sandbox
operation's scope. See [Authorization](authorization.md) for upgrade ordering.

## Custody Boundary

The shipped resolver reads one key from an approved Kubernetes Secret at
injection or rehydration time. The value exists briefly in trusted API memory,
is sent through the runtime provider boundary to OpenSandbox Credential Vault,
and is not returned or persisted by Harakiri.

The sandbox process still receives only the preset's fake environment value.
OpenSandbox injects the real credential only when an outbound request matches
the credential binding. External references do not bypass the Credential Vault
or egress-policy requirements described in [credential-vault.md](credential-vault.md).

Harakiri intentionally exposes the Kubernetes namespace, Secret name, and key
as management metadata. These identify custody but are not secret values. Avoid
putting confidential information in resource names or metadata.

## Operator Setup

External resolution is off by default. Enable it with the Helm values below:

```yaml
credentialVault:
  externalSecrets:
    kubernetes:
      enabled: true
      defaultNamespace: harakiri
      allowedNamespaces:
        - harakiri
      allowedNames:
        - harakiri-vault-agents
      allowedNamePrefixes: []
```

The chart creates a Role and RoleBinding in each allowed namespace when
`rbac.create=true`. The permission contains only `get` on Secrets. Exact names
can be enforced with Kubernetes `resourceNames`. Prefix matching is not
supported by Kubernetes RBAC, so prefix policies grant namespace-wide `get`
and Harakiri rejects disallowed names before the API request. Prefer exact names
for installations with a fixed credential inventory.

Create a source Secret without placing its value in a values file:

```bash
kubectl -n harakiri create secret generic harakiri-vault-agents \
  --from-literal=OPENAI_API_KEY="$OPENAI_API_KEY"
```

## External Secrets Operator

External Secrets Operator (ESO) can synchronize an external provider into the
same standard Kubernetes Secret contract. Harakiri does not depend on ESO and
does not need access to the upstream provider.

```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: harakiri-vault-agents
  namespace: harakiri
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: organization-vault
    kind: ClusterSecretStore
  target:
    name: harakiri-vault-agents
  data:
    - secretKey: OPENAI_API_KEY
      remoteRef:
        key: agents/openai
```

When ESO rotates the Kubernetes Secret, the next Harakiri attachment or
rehydration reads the new value. Existing provider-side injections are not
silently mutated; rehydrate or reattach them when immediate rotation is
required. Validation reports the Kubernetes `resourceVersion` as sanitized
version metadata.

## API Workflow

Create and validate a reference as an organization admin:

```bash
curl "$HARAKIRI_API_URL/v1/external-secret-references" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "name": "OpenAI from cluster",
    "providerPresetId": "openai",
    "resolverType": "kubernetes_secret",
    "reference": {
      "namespace": "harakiri",
      "name": "harakiri-vault-agents",
      "key": "OPENAI_API_KEY"
    },
    "usePolicy": "organization_members"
  }'

curl -X POST \
  "$HARAKIRI_API_URL/v1/external-secret-references/$REFERENCE_ID/validate" \
  -H "x-api-key: $HK_KEY"
```

Attach it to a running sandbox:

```bash
curl "$HARAKIRI_API_URL/v1/sandboxes/$SANDBOX_ID/credentials" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "sourceType": "external_ref",
    "referenceId": "xsr_..."
  }'
```

Template slot mappings use the same source object. The reference must use the
same provider preset as the slot.

## CLI Workflow

```bash
harakiri vault references create \
  --name "OpenAI from cluster" \
  --preset openai \
  --namespace harakiri \
  --secret-name harakiri-vault-agents \
  --key OPENAI_API_KEY \
  --share

harakiri vault references validate xsr_...
harakiri vault attach-reference sbx_... xsr_...
harakiri vault references list --json
```

Reference creation never accepts a raw credential value. Admins manage
references; members can discover and attach only active references with
`usePolicy: organization_members`.

## Failure States

| Validation state | Meaning | Operator action |
| --- | --- | --- |
| `unvalidated` | New or changed locator | Validate before use |
| `valid` | Secret and key resolved | None |
| `not_found` | Secret or key is absent | Fix the locator or synchronization |
| `forbidden` | Allowlist or Kubernetes RBAC denied access | Narrowly grant access or correct policy |
| `invalid` | Value is empty or not valid UTF-8 | Replace the source value |
| `unavailable` | Resolver is disabled or Kubernetes is unreachable | Enable/configure the resolver and check API connectivity |

Resolution failures are explicit and sanitized. Harakiri never falls back to a
different namespace, Secret, key, source type, or plaintext environment value.

## Supported And Planned Resolvers

`kubernetes_secret` is the only shipped resolver. ESO integrates through that
standard Kubernetes contract. HashiCorp Vault and cloud secret-manager
resolvers are future adapters behind the same `ExternalSecretResolver`
interface; they are not advertised as available until implemented and tested.
