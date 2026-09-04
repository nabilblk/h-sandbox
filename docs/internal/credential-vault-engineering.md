# Credential Vault Engineering Guide

This guide is for maintainers extending Credential Vault. Start with the
public contract in [Credential Vault](../credential-vault.md), the runtime
matrix in [Credential Vault Support](../credential-vault-support.md), and the
security boundary in the [threat model](../security/credential-vault-threat-model.md).

## Ownership Boundaries

| Concern | Owner |
| --- | --- |
| Public domain types and preset catalog | `packages/shared/src/index.ts` |
| OpenAPI publication | `packages/shared/src/openapi.ts` |
| Request validation and HTTP errors | `apps/api/src/routes/*credential*` and `routes/sandbox-runtime.ts` |
| Source material resolution | `apps/api/src/services/credential-source-material.ts` |
| Encrypted custody | `apps/api/src/services/workspace-credential-secrets.ts` and `credential-envelope.ts` |
| External references | `apps/api/src/services/external-secret-references.ts` and `providers/secrets/` |
| Dynamic issuance | `apps/api/src/services/dynamic-credential-issuers.ts` and `providers/credentials/` |
| Attachment state machine | `apps/api/src/services/credential-vault.ts` |
| Create-time orchestration and rollback | `apps/api/src/services/sandboxes.ts` |
| Runtime abstraction | `apps/api/src/providers/runtime/provider.ts` |
| OpenSandbox sidecar adapter | `apps/api/src/providers/runtime/opensandbox-credential-vault.ts` |
| Inspection and repair | `apps/api/src/services/credential-vault-reconciler.ts` and `scheduler.ts` |
| Dashboard | `apps/web/src/routes/vault*.tsx`, `sandbox-vault.tsx`, and template/create routes |
| SDK and CLI | `packages/sdk/src/index.ts` and `packages/cli/src/commands/vault*.ts` |

API routes authorize and validate. Domain services own state transitions.
Source adapters may briefly hold real material. Runtime adapters translate the
provider-neutral request. No other layer may read credential values.

## Non-Negotiable Invariants

1. A real value crosses only an authenticated write boundary, a source
   resolver, and the trusted runtime adapter. It is never returned.
2. `inline_ephemeral` values are not persisted. Synchronous launch is required
   because no durable replay material exists.
3. Encrypted custody persists ciphertext and a wrapped per-record data key,
   never plaintext or a reusable unwrapped data key.
4. External and dynamic records persist locator, scope, expiry, and validation
   metadata only.
5. Templates and snapshots contain credential requirements, never source IDs,
   source values, or provider vault contents.
6. A credential-bearing create fails closed and deletes the provider sandbox
   if egress attestation or any attachment fails.
7. `injected` means observed provider state, not merely a successful historical
   request. Missing provider state becomes `requires_reinjection`.
8. Credential egress requires OpenSandbox `dns+nft` and
   `credentialVaultReady: true`. DNS-only mode is rejected.
9. Vault code never uses `kubectl`, Kubernetes pod exec, or pod filesystem
   access. Runtime work goes through `RuntimeProvider`.
10. Audit and error metadata is redacted before persistence, not only before
    response serialization.

The static gate in `scripts/check-credential-vault-boundary.mjs` protects a
subset of these invariants. Tests remain required for behavior it cannot prove.

## Source Adapter Contract

A resolvable source returns one internal `ResolvedCredentialSourceMaterial`:
source identity, provider profile, one transient `secretValue`, fake env,
binding, optional expiry, and sanitized source metadata. It returns a typed
failure instead of falling back to another source.

To add a source type:

1. Add the discriminated public request and sanitized response types.
2. Add custody or locator persistence without a plaintext column.
3. Implement user and system resolution paths. System resolution is required
   only if the source is rehydratable.
4. Map failures in `credential-source-material.ts` without upstream bodies.
5. Add API, SDK, CLI, UI, OpenAPI, audit, redaction, and lifecycle tests.
6. Update the support matrix and threat model before calling it shipped.

Do not add source-specific branches to sandbox creation or provider adapters.

## Provider Adapter Contract

`RuntimeProvider` advertises capabilities and implements apply, inspect,
delete, and policy operations. The OpenSandbox implementation resolves port
`18080` through the OpenSandbox endpoint API and calls the sidecar API. Sidecar
URLs, revisions, and raw payloads are internal.

An apply operation is successful only after:

- the sandbox is active;
- restricted egress is applied and attested safe for Vault;
- the provider accepts the credential and binding; and
- sanitized attachment state is persisted.

Create-time failure invokes compensating deletion of the provider sandbox and
marks operation, sandbox, attachments, events, and audit state consistently.

## Lifecycle State

- `pending`: desired attachment exists; provider application is in progress.
- `injected`: the provider reports the credential and binding.
- `requires_reinjection`: desired state exists but provider state is missing.
- `detached`: provider entries were removed and the attachment is inactive.
- `failed`: apply or reconciliation failed with a sanitized reason.

Resume marks active attachments stale before attempting repair. Encrypted,
external, and dynamic sources are resolvable and can be rehydrated. Ephemeral
sources remain stale until a caller supplies a new value. The scheduler first
inspects provider state, then refreshes expiring dynamic credentials and
rehydrates each affected sandbox once per bounded lease.

Snapshot restore is explicit: callers map template slots again. Provider vault
state and old source selections are not inherited from a snapshot.

## Migration Rules

- Migrations are additive and immutable after merge.
- Credential tables must have organization ownership and lifecycle timestamps.
- Value-bearing columns are permitted only on encrypted custody records and
  must be named as ciphertext, IV/tag, wrapped key, and key ID.
- Add indexes for organization, active status, due reconciliation, and source
  references before enabling scheduler scans.
- Deletion clears encrypted custody while preserving metadata needed for audit.
- Add a migration contract test for every credential schema change.

## Test Matrix

| Change | Minimum tests |
| --- | --- |
| Validation or public type | Shared/schema tests, OpenAPI generation, SDK mirror |
| Source adapter | Success, missing, forbidden, disabled, malformed, unavailable, redaction |
| Provider adapter | Apply, inspect, detach, stale revision, unavailable, DNS-only rejection |
| Lifecycle | Resume/restore/sidecar loss, partial failure, retry, ephemeral stale state |
| RBAC | Admin management, member shared use, member direct-route rejection |
| UI | Empty/loading/error/success, desktop/mobile, keyboard, no secret readback |
| Operator config | Helm lint and rendered least-privilege RBAC |

Run the repository gates from the root:

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

## Review Checklist

- Does the public contract remain provider-neutral and backward compatible?
- Can a secret appear in an error, log, command, env record, event, audit row,
  provider metadata, URL, snapshot, screenshot, or fixture?
- Does every failure occur before misleading state, or have explicit rollback?
- Is source authorization checked both for user resolution and system repair?
- Does member use avoid granting custody management or organization-wide
  enumeration?
- Are egress hosts derived from the same binding that receives credentials?
- Are retry and reconciliation operations idempotent and bounded?
- Are runtime and OpenShift support claims backed by current evidence?
- Were public, operator, security, integration, and release docs updated?

## Known Extension Limits

The first dynamic issuer is a GitHub App installation. The first external
resolver is a Kubernetes Secret. Their registries are extension points, but a
new adapter is not shipped until its custody, scope, revocation, and operator
story pass the same gates. The SDK currently mirrors public protocol types by
hand; keep its tests and OpenAPI contract synchronized until generation is
introduced.
