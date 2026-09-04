# Credential Vault

Runtime and source support varies by deployment profile. Read the
[Credential Vault compatibility and support matrix](credential-vault-support.md)
for the stable public contract and the authoritative shipped, preview, planned,
degraded, unsupported, and operator-action states.

Credential Vault lets a sandbox call selected external services without the
sandbox process receiving the real credential value.

Harakiri owns the product contract: API authorization, organization scoping,
attachment metadata, audit events, SDK/CLI workflows, and redaction. The runtime
provider owns the dataplane injection. The OpenSandbox provider uses
OpenSandbox Credential Vault through the egress sidecar; Harakiri does not use
Kubernetes exec, mounted Kubernetes Secrets, command-line secrets, or real
sandbox environment variables as the normal injection mechanism.

## Current Scope

The current product surface includes:

- create-time and running-sandbox attachment for one-time, encrypted workspace,
  Kubernetes-reference, and GitHub App dynamic sources;
- sanitized list, provider inspection, test, refresh, rehydrate, and detach;
- built-in presets for model APIs, Git hosting, and package registries;
- required and optional template slots, including exact-host custom private API
  profiles, immutable version snapshots, and explicit launch mapping;
- envelope-encrypted workspace custody with rotation, disable/enable, deletion,
  usage summaries, and explicit member-use policy;
- Kubernetes Secret references with operator allowlists and get-only RBAC;
- short-lived, repository-scoped GitHub App installation issuers;
- dashboard Vault management, template slot authoring, launch mapping, sandbox
  diagnostics, and admin-only audit history;
- resume and background reconciliation for resolvable sources, with truthful
  `requires_reinjection` state for forgotten ephemeral values; and
- matching API, OpenAPI, TypeScript SDK, CLI, examples, and typed errors.

Direct HashiCorp Vault/cloud secret-manager resolvers and dynamic issuers other
than GitHub App are extension points, not shipped adapters. Runtime support is
also deployment-dependent; read the
[support matrix](credential-vault-support.md) before enabling the feature.

`inline_ephemeral` means Harakiri applies the value to the provider-side vault
and then forgets it. The raw value is not stored in PostgreSQL. Because Harakiri
does not retain the value, an ephemeral attachment cannot be rehydrated after a
runtime restart. After resume, reattach the credential with a fresh value.

`harakiri_encrypted` means a workspace admin can store a reusable credential in
the control plane with server-side encryption. The value is write-only: it can
be set or rotated, but API, SDK, CLI, UI, logs, and audit events only return
sanitized metadata. The current create and runtime attach flows can resolve an
active workspace secret server-side and inject it into a sandbox. Template-slot
mapping can use either an active workspace secret or a one-time inline value.
After resume, Harakiri rehydrates attachments backed by active encrypted
workspace secrets. If the secret is disabled, deleted, missing, or cannot be
decrypted, the attachment stays `requires_reinjection` with a redacted reason.

`external_ref` means Harakiri stores a locator and resolves the value from an
operator-approved source only when it must inject or rehydrate a credential.
The shipped resolver reads one key from a Kubernetes Secret. External Secrets
Operator can synchronize Vault or a cloud secret manager into that Secret
without introducing an ESO-specific public contract. See
[External Secret References](external-secret-references.md) for Helm, RBAC,
rotation, API, and CLI instructions.

`dynamic` means Harakiri asks an operator-configured issuer for short-lived
material at injection time. The first implementation uses a GitHub App
installation and stores only installation/repository scope, permissions,
expiry, validation state, and usage metadata. The token is never persisted.
The scheduler refreshes it before expiry and reissues it after provider-state
loss while the issuer remains active and valid.

## Access And Usage

Workspace secrets default to `usePolicy: "admins_only"`. An organization admin
can change a secret to `organization_members`; members can then discover that
secret in launch controls and attach it to sandboxes in the same organization.
Members cannot create, rotate, disable, delete, or read workspace secrets. A
shared secret is still write-only, and changing its policy never returns or
re-encrypts the value.

Sanitized secret summaries include `usage.activeSandboxCount`,
`usage.attachmentCount`, and `usage.lastAttachedAt`. These values are derived
from sandbox attachment records. Templates declare provider slots, not concrete
workspace secret IDs, so a template never becomes a persistent reference to a
secret.

External references use the same `admins_only` and `organization_members`
policy. Admins own the locator and validation lifecycle. Members can discover
and attach only references that an admin explicitly shares; they never receive
the resolved value or management permission.

## Provider Presets

Provider presets are reusable binding defaults for common services. They
include fake env names, provider-local credential and binding names, auth
shape, destination hosts, egress domains, and a default test target. Presets do
not contain real values.

```bash
harakiri vault presets
harakiri vault preset openai
```

Current built-in presets:

| Preset | Category | Env | Auth | Binding hosts |
| --- | --- | --- | --- | --- |
| `openai` | model API | `OPENAI_API_KEY` | bearer | `api.openai.com` |
| `anthropic` | model API | `ANTHROPIC_API_KEY` | `x-api-key` | `api.anthropic.com` |
| `openrouter` | model API | `OPENROUTER_API_KEY` | bearer | `openrouter.ai` |
| `github` | Git hosting | `GITHUB_TOKEN` | bearer | `api.github.com` |
| `gitlab` | Git hosting | `GITLAB_TOKEN` | `PRIVATE-TOKEN` | `gitlab.com/api/v4` |
| `npm` | package registry | `NPM_TOKEN` | bearer | `registry.npmjs.org` |
| `pypi-publish` | package registry | `PYPI_TOKEN` | basic | `upload.pypi.org/legacy` |

Use a preset when the target service matches the built-in provider. Use a
direct custom binding for private APIs, self-hosted Git, private package
indexes, or provider-specific paths that are not covered by the catalog.

## Template Credential Slots

Templates can declare which provider credentials they expect without storing a
real value. Slots are metadata only: provider preset or custom profile,
required/optional state, fake env name, binding preview, allowed egress domains,
and default test target. Built-in presets cover common services. A custom slot
requires one exact HTTPS host and supports bearer or one API-key header plus
optional method/path restrictions.

In `harakiri.toml`, use `credential_slots` for required slots and
`optional_credential_slots` for optional slots:

```toml
credential_slots = ["openai"]
optional_credential_slots = ["github", "npm"]

[[credential_slot]]
id = "private-model"
provider = "custom"
required = false
host = "api.internal.example"
auth = "api-key"
header = "x-api-key"
methods = ["GET", "POST"]
paths = ["/v1/*"]
env_name = "PRIVATE_MODEL_KEY"
test_path = "/v1/health"
```

Builds snapshot the expanded slot metadata into the resulting template version,
so `open-agents-dev:stable` can keep a stable credential contract even after the
mutable template definition changes.

```bash
harakiri template init \
  --name open-agents-dev \
  --dockerfile Dockerfile \
  --credential-slot openai \
  --optional-credential-slot github

harakiri template build --name open-agents-dev .
harakiri template inspect open-agents-dev
```

`credentialSlots` also appears on `Template`, `TemplateVersionSummary`, and
`CreateTemplateBody` for API and SDK users. The slots never include raw
credential values. Required slots must be satisfied at sandbox creation through
`credentialMappings`; direct low-level credential attachments do not satisfy a
template's named slot.

## Security Model

The trusted path is:

1. A caller sends a secret to Harakiri over an authenticated API request.
2. Harakiri validates the host/path/method binding and applies it to the
   provider-side vault.
3. The sandbox sees only fake environment variables or no variables at all.
4. The provider injects the real auth material only for outbound requests that
   match the binding.
5. Harakiri stores sanitized metadata and audit events, never the secret value.

Credential-bearing sandboxes should use restricted outbound access with
explicit allowed destinations. OpenSandbox Credential Vault requires the egress
sidecar and strict `dns+nft` mode for deny-by-default enforcement. In clusters
where the sidecar capability is unavailable, Harakiri reports the feature as
unsupported or provider unavailable rather than pretending credentials were
enforced.

See the [Credential Vault threat model](security/credential-vault-threat-model.md)
for custody boundaries, residual risks, RBAC, and incident response.

## API

Create a sandbox with one ephemeral credential:

```bash
curl "$HARAKIRI_API_URL/v1/sandboxes" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "template": "python-3.12-data",
    "name": "agent-with-vault",
    "credentials": [{
      "displayName": "OpenAI API",
      "credentialName": "openai-runtime",
      "value": "replace-with-real-value",
      "fakeEnv": { "OPENAI_API_KEY": "fake-openai-key" },
      "binding": {
        "name": "openai-api",
        "match": {
          "hosts": ["api.openai.com"],
          "schemes": ["https"],
          "methods": ["GET", "POST"],
          "paths": ["/v1/*"]
        },
        "auth": { "type": "bearer" }
      }
    }]
  }'
```

Create a sandbox by satisfying a template credential slot with an encrypted
workspace secret:

```bash
curl "$HARAKIRI_API_URL/v1/sandboxes" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "template": "open-agents-dev",
    "name": "slotted-vault-agent",
    "credentialMappings": [{
      "slotId": "llm",
      "source": {
        "sourceType": "harakiri_encrypted",
        "secretId": "vlt_...",
        "displayName": "OpenAI production"
      }
    }]
  }'
```

The same mapping can use `providerPresetId` when a template has only one slot
for that provider:

```json
{
  "credentialMappings": [{
    "providerPresetId": "openai",
    "source": {
      "sourceType": "inline_ephemeral",
      "value": "replace-with-real-value"
    }
  }]
}
```

For mapped credentials, the template slot owns the binding, fake env defaults,
and egress destinations. The source only supplies the secret material or a
stored secret reference. Harakiri rejects ambiguous provider-preset mappings,
unknown slots, provider mismatches, unsatisfied required slots, and duplicate
binding names before the sandbox is created.

Create-time credentials require synchronous sandbox creation. Do not combine
them with `wait:false`, `Prefer: respond-async`, or `waitTimeoutMs`; Harakiri
does not persist raw credential values for later replay. Fake env values are
merged into the sandbox launch environment, and the response returns sanitized
`credentialAttachments`.

List attachments:

```bash
curl "$HARAKIRI_API_URL/v1/sandboxes/$SANDBOX_ID/credentials" \
  -H "x-api-key: $HK_KEY"
```

Discover provider presets:

```bash
curl "$HARAKIRI_API_URL/v1/credential-presets" \
  -H "x-api-key: $HK_KEY"

curl "$HARAKIRI_API_URL/v1/credential-presets/openai" \
  -H "x-api-key: $HK_KEY"
```

Manage encrypted workspace secrets:

```bash
curl "$HARAKIRI_API_URL/v1/credential-secrets" \
  -H "x-api-key: $HK_KEY"

curl "$HARAKIRI_API_URL/v1/credential-secrets" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "name": "openai-prod",
    "providerPresetId": "openai",
    "value": "replace-with-real-value",
    "usePolicy": "admins_only",
    "fakeEnv": { "OPENAI_API_KEY": "fake-openai-key" }
  }'

curl -X PATCH "$HARAKIRI_API_URL/v1/credential-secrets/vlt_..." \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"usePolicy":"organization_members"}'

curl "$HARAKIRI_API_URL/v1/credential-secrets/vlt_.../rotate" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"value":"replace-with-new-real-value"}'

curl "$HARAKIRI_API_URL/v1/credential-secrets/vlt_.../disable" \
  -H "x-api-key: $HK_KEY" \
  -X POST

curl "$HARAKIRI_API_URL/v1/credential-secrets/vlt_..." \
  -H "x-api-key: $HK_KEY" \
  -X DELETE
```

Workspace secret mutation APIs require organization admin role. Admins can list
all workspace secrets; members can list and attach only active secrets whose
`usePolicy` is `organization_members`. Responses include name, provider preset,
status, version, use policy, usage metadata, fake env keys, binding metadata,
egress domains, timestamps, and `hasEncryptedSecret`; they never return the raw
value. Delete removes encrypted value custody and keeps metadata-only history.

Attach one ephemeral credential:

```bash
curl "$HARAKIRI_API_URL/v1/sandboxes/$SANDBOX_ID/credentials" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "displayName": "OpenAI API",
    "credentialName": "openai-runtime",
    "value": "replace-with-real-value",
    "fakeEnv": { "OPENAI_API_KEY": "fake-openai-key" },
    "binding": {
      "match": {
        "hosts": ["api.openai.com"],
        "schemes": ["https"],
        "methods": ["GET", "POST"],
        "paths": ["/v1/*"]
      },
      "auth": { "type": "bearer" }
    }
  }'
```

Attach an encrypted workspace secret to a running sandbox:

```bash
curl "$HARAKIRI_API_URL/v1/sandboxes/$SANDBOX_ID/credentials" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "sourceType": "harakiri_encrypted",
    "secretId": "vlt_...",
    "displayName": "OpenAI production"
  }'
```

The server resolves the encrypted value, applies the provider preset binding
stored on the secret, and stores only sanitized attachment metadata. The
attachment response includes `sourceType: "harakiri_encrypted"` and
`sourceRef` with the workspace secret ID; it never includes the raw value.

Test a binding from inside the sandbox:

```bash
curl "$HARAKIRI_API_URL/v1/sandboxes/$SANDBOX_ID/credentials/$ATTACHMENT_ID/test" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{"target":"https://api.openai.com/v1/models","timeoutMs":10000}'
```

Detach an attachment:

```bash
curl -X DELETE "$HARAKIRI_API_URL/v1/sandboxes/$SANDBOX_ID/credentials/$ATTACHMENT_ID" \
  -H "x-api-key: $HK_KEY"
```

The test endpoint returns a diagnostic object. `ok: true` means the sandbox
could reach the target and the HTTP response looked reachable. `ok: false` may
mean a binding mismatch, a blocked or unreachable host, a missing provider-side
injection, a terminated sandbox, or an unavailable provider capability. The
response includes redacted stdout/stderr only.

## SDK

Use `credentialFromPreset` when a built-in provider matches the target. It
clones catalog metadata and accepts only the write-only value plus optional
display overrides:

```ts
import { HarakiriClient, credentialFromPreset } from "@h-sandbox/sdk";

const created = await harakiri.createSandbox({
  template: "python-3.12-data",
  credentials: [credentialFromPreset("openai", process.env.OPENAI_API_KEY!)]
});

console.log(created.credentialAttachments?.[0]?.status);

const attachment = await sandbox.credentials.attach({
  displayName: "OpenAI API",
  value: process.env.OPENAI_API_KEY!,
  fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
  binding: {
    match: {
      hosts: ["api.openai.com"],
      schemes: ["https"],
      methods: ["GET", "POST"],
      paths: ["/v1/*"]
    },
    auth: { type: "bearer" }
  }
});

const test = await sandbox.credentials.test(attachment.attachment.id, {
  target: "https://api.openai.com/v1/models",
  timeoutMs: 10_000
});

console.log(test.ok, test.status, test.httpStatus);
await sandbox.credentials.detach(attachment.attachment.id);
```

Use process environment variables, a CI secret store, or write-only workspace
secret custody for the real value. Do not hard-code secrets in source files.

Workspace secret custody is exposed through `credentialSecrets`:

```ts
const createdSecret = await harakiri.credentialSecrets.create({
  name: "openai-prod",
  providerPresetId: "openai",
  usePolicy: "admins_only",
  value: process.env.OPENAI_API_KEY!,
  fakeEnv: { OPENAI_API_KEY: "fake-openai-key" }
});

console.log(createdSecret.secret.status, createdSecret.secret.version);

await harakiri.credentialSecrets.update(createdSecret.secret.id, {
  usePolicy: "organization_members"
});

const rotatedSecret = await harakiri.credentialSecrets.rotate(
  createdSecret.secret.id,
  { value: process.env.OPENAI_API_KEY_NEXT! }
);

const storedAttachment = await sandbox.credentials.attachSecret(
  createdSecret.secret.id,
  { displayName: "OpenAI production" }
);
console.log(
  storedAttachment.attachment.sourceType,
  storedAttachment.attachment.sourceRef
);

await harakiri.credentialSecrets.disable(rotatedSecret.secret.id);
await harakiri.credentialSecrets.enable(rotatedSecret.secret.id);
await harakiri.credentialSecrets.delete(rotatedSecret.secret.id);
```

`credentialSecrets` returns only sanitized metadata. Use a `harakiri_encrypted`
credential body in `createSandbox` for synchronous launch injection, or
`sandbox.credentials.attachSecret(secretId)` and
`harakiri.credentials.attachSecret(sandboxId, secretId)` for an already-running
sandbox. Active encrypted sources are rehydrated after resume; use
`sandbox.credentials.rehydrate()` to retry after fixing an unavailable source.

External references are exposed through `externalSecretReferences`:

```ts
const external = await harakiri.externalSecretReferences.create({
  name: "OpenAI from cluster",
  providerPresetId: "openai",
  resolverType: "kubernetes_secret",
  reference: {
    namespace: "harakiri",
    name: "harakiri-vault-agents",
    key: "OPENAI_API_KEY"
  },
  usePolicy: "organization_members"
});

await harakiri.externalSecretReferences.validate(external.reference.id);
await sandbox.credentials.attachReference(external.reference.id);
```

Create requests and template mappings may use
`{ sourceType: "external_ref", referenceId }`. Resolution occurs server-side;
SDK responses contain only locator and validation metadata.

Dynamic issuers are exposed through `dynamicCredentialIssuers`:

```ts
const issuer = await harakiri.dynamicCredentialIssuers.create({
  name: "agent repositories",
  issuerType: "github_app_installation",
  scope: {
    installationId: "123456",
    repositories: ["agent-runtime"],
    permissions: { contents: "read", metadata: "read" }
  },
  usePolicy: "organization_members"
});

await harakiri.dynamicCredentialIssuers.validate(issuer.issuer.id);
const dynamicAttachment = await sandbox.credentials.attachIssuer(issuer.issuer.id);
await sandbox.credentials.refresh(dynamicAttachment.attachment.id);
```

Organization admins can inspect metadata-only Vault history with
`harakiri.auditEvents.list({ actionPrefix: "credential_" })`. See the checked
examples in `examples/sdk-credential-vault` and
`examples/sdk-private-api-vault`, plus the
[cookbook](credential-vault-cookbook.md).

## CLI

Prefer `--from-env`, `--from-stdin`, or `--prompt` so credential values do not
appear in shell history:

```bash
export OPENAI_API_KEY=placeholder

harakiri vault presets

harakiri create \
  --template open-agents-dev \
  --name agent-with-vault \
  --credential 'preset=openai,from-env=OPENAI_API_KEY'

harakiri vault attach "$SANDBOX_ID" \
  --preset openai \
  --from-env OPENAI_API_KEY

harakiri vault attach "$SANDBOX_ID" \
  --preset openai \
  --prompt

harakiri vault list "$SANDBOX_ID"
harakiri vault test "$SANDBOX_ID" "$ATTACHMENT_ID" \
  --target https://api.openai.com/v1/models
harakiri vault detach "$SANDBOX_ID" "$ATTACHMENT_ID"

harakiri vault secrets create \
  --name openai-prod \
  --preset openai \
  --from-env OPENAI_API_KEY \
  --member-use

harakiri vault secrets share vlt_...
harakiri vault secrets restrict vlt_...

harakiri create \
  --template open-agents-dev \
  --name stored-vault-agent \
  --credential 'secret-id=vlt_...,name=openai-prod'

harakiri vault attach-secret "$SANDBOX_ID" vlt_... \
  --name openai-prod

harakiri vault secrets list
harakiri vault secrets rotate vlt_... --prompt
harakiri vault secrets disable vlt_...
harakiri vault secrets enable vlt_...
harakiri vault secrets delete vlt_...

harakiri vault references create \
  --name "OpenAI from cluster" \
  --preset openai \
  --namespace harakiri \
  --secret-name harakiri-vault-agents \
  --key OPENAI_API_KEY \
  --member-use
harakiri vault references validate xsr_...
harakiri vault attach-reference "$SANDBOX_ID" xsr_...

harakiri vault issuers create \
  --name agent-repositories \
  --installation-id 123456 \
  --repository agent-runtime \
  --permission contents=read \
  --permission metadata=read
harakiri vault issuers validate dci_...
harakiri vault attach-issuer "$SANDBOX_ID" dci_...
harakiri vault refresh "$SANDBOX_ID" sca_...

harakiri vault audit --action-prefix credential_ --json
```

Create-time `--credential` specs can be repeated. Each spec is comma-separated
`key=value` data with either `preset`, `host`, or `secret-id`. Inline specs use
one real value source and optional `auth`, `header`, `fake-env`, `scheme`,
`method`, and `path` fields. Stored specs use `secret-id` plus optional `name`,
`credential-name`, and `binding-name`; the stored secret supplies the value,
fake env, auth, and binding. Use `from-stdin=true` when a create-time inline
value comes from stdin, or `prompt=true` for a local hidden prompt. Create-time
credentials are sync-only; the CLI rejects `--credential` with `--no-wait` or
`--wait-timeout-ms`.
`--prompt` requires an interactive TTY and fails loudly in CI.

Workspace secret management commands are admin-only and always print sanitized
metadata. `--member-use` creates a shared secret; `share` and `restrict` change
who may attach it. Secret tables include use policy and active sandbox count.
Use `--credential 'secret-id=vlt_...'` for synchronous launch injection, or
`harakiri vault attach-secret` to attach an active stored secret to a running
sandbox. After resume, `harakiri vault list` can show
`requires_reinjection` for ephemeral or unavailable sources. Use
`harakiri vault rehydrate sbx_...` to retry stored-secret rehydration after
fixing the source.

`harakiri vault references` manages external locators and never accepts a raw
secret value. Use `--credential 'reference-id=xsr_...'` for direct synchronous
creation or add `slot=...` for a template mapping.

`harakiri vault issuers` manages sanitized GitHub App installation scope. Use
`--credential 'issuer-id=dci_...'` at synchronous creation or
`vault attach-issuer` at runtime. Issued tokens never appear in CLI output.
`vault refresh` explicitly rotates one dynamic attachment; the scheduler also
refreshes due attachments before expiry. `vault audit` is admin-only and
supports target, action-prefix, limit, offset, and JSON filters.

`harakiri credentials` is an alias for `harakiri vault`.

## Binding Rules

Bindings should be narrow:

- hosts are explicit names such as `api.openai.com` or wildcard domains such as
  `*.example.com`
- schemes default to HTTPS when omitted
- methods default to the provider behavior when omitted; prefer setting them
  for write-capable APIs
- paths can be exact paths or wildcard prefixes such as `/v1/*`
- `apiKey` auth injects a named header
- `bearer` auth injects an `Authorization: Bearer ...` header
- `basic` auth injects HTTP basic auth material

The current test probe checks one concrete target. A successful probe does not
prove every path and method is safe; it proves this attachment can reach that
target from this running sandbox.

OpenSandbox fails an ambiguous binding match closed. Harakiri additionally
rejects duplicate provider credential names before apply, which keeps the
common ambiguity out of provider state.

## Operator Notes

OpenSandbox-backed Credential Vault needs:

- an OpenSandbox version with the Credential Vault sidecar API
- egress mode `dns+nft`
- `credentialProxy.enabled` on credential-bearing sandboxes
- a sandbox image with `curl` or `python3` if test probes should run
- no competing transparent service-mesh sidecar in the same network namespace
- `credentialVault.externalSecrets.kubernetes.enabled=true` plus narrowly
  scoped Kubernetes Secret `get` permission when external references are used
- a configured platform GitHub App client ID/private key when dynamic GitHub
  credentials are used

Restricted OpenShift clusters may need an operator-approved runtime profile for
the egress sidecar. If that profile is not allowed, disable Credential Vault or
surface it as unavailable for that install profile.

The full setup, key rotation, backup/restore, dynamic issuer, health, and
incident procedures are in
[Credential Vault Operations](credential-vault-operations.md).

## Troubleshooting

| Symptom | Meaning | Fix |
| --- | --- | --- |
| `credential_vault_unsupported` | Active provider does not implement vault APIs. | Use an OpenSandbox profile with Credential Vault or hide vault workflows. |
| `credential_vault_provider_unavailable` | Provider sidecar endpoint could not be reached. | Wait for sandbox readiness, check OpenSandbox egress sidecar, and inspect provider capabilities. |
| `credential_vault_invalid_binding` | The binding shape or test target is invalid. | Use explicit hosts, HTTPS schemes, valid methods, and matching paths. |
| `credential_vault_required_slot_missing` | A template requires one or more credential slots that were not mapped at launch. | Send `credentialMappings` for every required slot or use a template where the slot is optional. |
| `credential_vault_secret_required` | Attach request had no real value. | Use SDK process env, CLI `--from-env`, or CLI `--from-stdin`. |
| `credential_vault_attachment_not_found` | Attachment ID is not active in this sandbox. | Refresh `vault list` and retry with the current attachment ID. |
| `credential_secret_forbidden` | Caller cannot manage or use the requested secret. | Use an admin identity for management, or ask an admin to share the secret for organization-member use. |
| `credential_secret_duplicate` | An active workspace secret with that name already exists. | Pick a different name or delete the old metadata record first. |
| `credential_secret_invalid` | Workspace secret metadata, fake env, binding, or provider preset input is invalid. | Use a known preset, keep fake values different from the real value, and use a supported binding shape. |
| `credential_secret_encryption_unavailable` | The API could not encrypt the value. | Configure the control-plane secret key and retry. |
| `credential_secret_decryption_unavailable` | The API could not decrypt a stored workspace secret for runtime injection. | Check the control-plane secret key and avoid rotating or deleting key material before migration. |
| `credential_secret_disabled` | The workspace secret is disabled and cannot be attached. | Enable or rotate the secret before attaching it. |
| `credential_secret_value_required` | Create or rotate did not include a real value. | Use SDK process env, CLI `--from-env`, `--from-stdin`, or `--prompt`. |
| `external_secret_reference_forbidden` | Caller cannot use or manage the reference. | Use an admin identity or explicitly share the reference for member use. |
| `external_secret_resolution_not_found` | The configured Secret or key is absent. | Correct the locator or wait for the external-secret controller to synchronize it. |
| `external_secret_resolution_forbidden` | Operator allowlist or Kubernetes RBAC denied resolution. | Correct the allowlist or grant the API service account narrowly scoped `get` access. |
| `external_secret_resolution_invalid` | The referenced value is empty or malformed. | Replace the source value and validate again. |
| `external_secret_resolver_unavailable` | The resolver is disabled or cannot reach Kubernetes. | Enable the resolver and check cluster API/service-account configuration. |
| `dynamic_credential_issuer_forbidden` | Caller cannot manage or use the dynamic issuer. | Use an admin identity or ask an admin to share it for organization-member use. |
| `dynamic_credential_issuer_unavailable` | The platform GitHub App is disabled, incomplete, or unreachable. | Configure the client ID and private key, then validate the issuer. |
| `dynamic_credential_issue_invalid` | Issuer scope or returned token metadata is invalid. | Correct installation, repository, and permission scope; validate again. |
| `audit_event_forbidden` | Caller is not an organization admin. | Hide audit controls for members and use an admin identity for organization history. |
| Test returns `binding_mismatch` | The requested target is outside the binding scope. | Test a matching URL or attach a narrower/different binding. |
| Attachment status is `requires_reinjection` or test returns `not_injected` | Harakiri metadata exists but provider vault state is missing after resume or provider reset. | Run `harakiri vault rehydrate sbx_...` for encrypted workspace secrets, or reattach `inline_ephemeral` values because Harakiri intentionally never stored them. |
