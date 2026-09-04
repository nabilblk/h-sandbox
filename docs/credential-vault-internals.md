# Credential Vault Internals

This document describes the complete technical architecture. Maintainer
checklists and code ownership live in
[Credential Vault Engineering](internal/credential-vault-engineering.md).

## Domain Model

- `CredentialProviderPreset` is a value-free built-in binding.
- `CustomCredentialProfile` is an exact-host private API binding.
- `TemplateCredentialSlot` is a required or optional value-free template
  contract.
- `WorkspaceCredentialSecret`, `ExternalSecretReference`, and
  `DynamicCredentialIssuer` are reusable source records.
- `SandboxCredentialAttachment` is desired state plus sanitized observed
  provider state.
- `VaultInjection` is an internal provider operation, never a public sidecar
  contract.

The source discriminant is stable:
`inline_ephemeral`, `harakiri_encrypted`, `external_ref`, or `dynamic`.

## Data And Custody

Migrations `025` through `034` add attachments, template slots, encrypted
workspace sources, member-use policy, external references, dynamic issuers,
refresh/reconciliation state, per-record envelopes, provider observations, and
custom profiles.

Only encrypted workspace custody has value-bearing columns. A random DEK
encrypts each value; an operator key wraps the DEK. PostgreSQL also stores IV,
authentication tag, wrapping key ID, source version, and sanitized metadata.
External references store Kubernetes locators. Dynamic issuers store GitHub App
installation/repository scope and expiry metadata. Attachments store source IDs,
binding policy, fake env, state, and provider revision, never material.

Delete clears encrypted custody and preserves metadata-only audit history.
Templates and snapshots never persist source IDs or runtime vault contents.

## Source Resolution

`apps/api/src/services/credential-source-material.ts` is the source-neutral
dispatcher. User paths enforce current organization role and source use policy.
System paths resolve only the source already recorded on an attachment and are
used by lifecycle repair.

- `inline_ephemeral`: request-local and non-rehydratable.
- `harakiri_encrypted`: decrypt active workspace custody.
- `external_ref`: call an allowlisted resolver; Kubernetes Secret is shipped.
- `dynamic`: call an issuer; GitHub App installation is shipped.

Every source returns the same internal material shape. Failure is typed and
never falls back to another source or returns an upstream response body.

## Provider Boundary

`RuntimeProvider` exposes capabilities for credential apply, inspect, and
delete plus egress policy. The OpenSandbox adapter resolves sidecar port `18080`
through the OpenSandbox endpoint API and translates the provider-neutral
credential/binding payload. Harakiri public APIs never expose that URL,
revision, pod identity, or raw response.

Before every apply, Harakiri sets credential-derived restricted egress and
requires a sanitized runtime attestation with `credentialVaultReady: true`.
OpenSandbox must use `dns+nft`; DNS-only mode is rejected. Apply creates or
patches the sidecar vault. Inspect reads names, bindings, and revision only.
Detach removes the provider credential and binding.

No Vault path uses Kubernetes exec, pod filesystem access, or env injection of
the real value.

## Create-Time Transaction

1. Validate all direct attachments and template mappings.
2. Resolve reusable sources and hold real values only in request memory.
3. Merge fake env and derive restricted egress hosts from bindings.
4. Provision synchronously with Credential Proxy enabled.
5. Attest `dns+nft` Vault readiness and attach every credential.
6. Persist sanitized success state and complete the operation.

Async create is rejected because request-local values cannot be replayed. If
any attachment or egress attestation fails after provisioning, Harakiri deletes
the provider sandbox, marks the control-plane sandbox and operation failed,
closes schedules, marks attachments failed/missing, and records redacted event
and audit metadata. It never returns a partially usable sandbox as success.

## Running Attachment State Machine

1. Confirm organization ownership and active sandbox state.
2. Resolve and authorize the source.
3. Reject fake env equal to real material and duplicate provider credential
   names.
4. Persist `pending` metadata.
5. Attest egress and apply through `RuntimeProvider`.
6. Persist `injected` and provider revision, or `failed` with a sanitized code.
7. Record metadata-only sandbox and organization audit events.

Test access rejects a target outside the binding before running anything. A
matching probe runs inside the sandbox through the normal command provider and
returns only redacted status, stdout/stderr summary, and HTTP status. It never
returns the response body. Detach removes provider state before marking the
attachment inactive.

## Templates And Restore

Template slots own provider profile, fake env, binding, egress hosts, required
state, and default test target. Built-in slots reference the static catalog;
custom slots capture one exact HTTPS host with bounded auth/method/path fields.
Builds snapshot expanded slot metadata in the immutable template version.

Launch maps each required slot to one source. A source profile must match the
slot profile. Direct low-level attachments do not implicitly satisfy a named
slot. Snapshot restore follows the same launch path and requires explicit
source mappings, so old permissions or values are not inherited.

## Reconciliation And Refresh

OpenSandbox vault state is in-memory. Resume marks all active injected
attachments `requires_reinjection` before repair. The scheduler uses bounded,
leased work:

1. Inspect active provider vaults at the configured interval.
2. Mark absent entries `requires_reinjection`.
3. Refresh dynamic credentials due within the renewal window.
4. Resolve and reapply encrypted, external, and dynamic sources once per
   affected sandbox.
5. Leave ephemeral sources stale until a caller supplies a new value.
6. Persist sanitized status, expiry, attempt time, retry time, events, and audit.

The default batch is 20. Failed work is retried after 60 seconds; provider
inspection defaults to five minutes. Refresh failure before expiry preserves a
working provider attachment and records the failed attempt instead of deleting
it.

## RBAC And Audit

Organization admins manage reusable sources and view all Vault audit history.
Members can discover and attach only active sources with
`organization_members` use policy. Management routes still enforce admin role
even if clients hide the UI.

Audit records include actor, action, target, source type, provider profile,
status, scope, expiry, and sanitized failure category. The API supports
organization-scoped target/action pagination. Members cannot access it because
actor identities and organization-wide activity are admin information.

## Failure Classes

- Validation: malformed binding, exact-host/custom profile, slot, or source.
- Authorization: organization or source use policy denied.
- Source: missing, disabled, deleted, undecryptable, unresolved, or expired.
- Runtime safety: unsupported provider, DNS-only egress, no Credential Proxy,
  missing sidecar, or conflicting interception profile.
- Provider state: missing entry, stale revision, rejected apply, or unavailable
  endpoint.
- Lifecycle: ephemeral needs reinjection or stored-source repair failed.

Failures use stable Harakiri codes and redacted messages. The support matrix
distinguishes unsupported configuration from transient unavailability.

## Extension Points

`ExternalSecretResolverRegistry` can add direct secret-manager adapters.
`DynamicCredentialIssuerRegistry` can add OAuth, OIDC, or cloud STS issuance.
`CredentialKeyProvider` can add KMS/HSM wrapping. `RuntimeProvider` can map the
same public attachment contract to another sandbox runtime.

An adapter is not shipped merely because the interface exists. It needs
authorization, custody, redaction, lifecycle, operator, conformance, threat
model, and support-matrix evidence.

## Verification

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm openapi:check
pnpm credential-vault:check
pnpm docs:check
pnpm examples:check
helm lint infra/charts/harakiri
```

Real-runtime promotion additionally requires the k0s smoke and browser matrix
recorded in [Test Report](test-report.md).
