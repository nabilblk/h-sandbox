# Credential Vault Compatibility And Support

This is the authoritative compatibility promise for Credential Vault. The user
guide is [Credential Vault](credential-vault.md), operator requirements are in
[Credential Vault Operations](credential-vault-operations.md), and live
evidence is in [Test Report](test-report.md).

## Public Contract Promise

The following `/v1` behavior is stable for source types marked **Shipped**:

- Credential input is discriminated by `sourceType`; adding a source type does
  not change an existing source's request semantics.
- `inline_ephemeral` values are write-only and forgotten after provider
  injection.
- `harakiri_encrypted` sources use a stable `secretId`; rotation increments the
  version without changing the ID.
- `external_ref` sources use a stable `referenceId`; Harakiri stores only the
  locator and sanitized validation state.
- `dynamic` sources use a stable `issuerId`; issued values are short-lived and
  are not persisted.
- Template launches map slots to sources with `credentialMappings`. The slot
  owns binding, fake env, and egress policy.
- `/v1/sandboxes/{sandboxId}/credentials` owns attach, list, inspect, refresh,
  rehydrate, test, and detach behavior.
- Responses contain sanitized source, binding, status, expiry, provider-state,
  usage, and audit metadata. They never contain a real credential value.
- Attachment states are `pending`, `injected`, `requires_reinjection`,
  `detached`, and `failed`.
- Test access returns a diagnostic and never returns the target response body.
- New optional fields, presets, source types, capabilities, and error codes may
  be added. Clients must treat unknown enum values as unsupported, not success.

A breaking change requires a new API version or a documented deprecation
window. OpenSandbox sidecar payloads, URLs, revisions, pod identities, and
Kubernetes resources are not public Harakiri contracts.

## Status Terms

- **Shipped**: implemented and covered by local contract tests.
- **Preview**: implemented but live runtime or product evidence is incomplete.
- **Degraded**: supported with a documented loss of behavior.
- **Unsupported**: rejected because the safety contract cannot be met.
- **Operator action**: implementation exists but cluster configuration or
  external credentials are required.
- **Planned**: an extension point exists but no supported adapter is shipped.

## Feature Matrix

| Capability | Product | Dev provider | k0s + OpenSandbox | Restricted OpenShift |
| --- | --- | --- | --- | --- |
| Built-in preset discovery | Shipped | Supported | Supported | Supported |
| Built-in and custom template slots | Shipped | Supported | Supported | Supported as metadata |
| Template UI, create mapping, sandbox diagnostics | Shipped | Supported | Supported | Runtime-dependent |
| `inline_ephemeral` create/attach | Shipped | Contract support | Supported | Operator action |
| Encrypted workspace custody | Shipped | Requires wrapping key | Supported with wrapping key | Operator action |
| Admin management and explicit member use | Shipped | Supported | Supported | Supported when identity is current |
| Kubernetes external references | Shipped | Resolver tests | Operator action: allowlist and RBAC | Operator action |
| External Secrets Operator | Shipped composition | N/A | Via a materialized Kubernetes Secret | Via an approved materialized Secret |
| Direct Vault/cloud secret resolvers | Planned | Planned | Planned | Planned |
| GitHub App dynamic issuer | Shipped | Issuer contract tests | Operator action: App identity | Operator action plus runtime support |
| Other OAuth/OIDC/cloud STS issuers | Planned | Planned | Planned | Planned |
| Attach/list/inspect/test/refresh/detach | Shipped | Supported | Supported | Operator action |
| Resume repair for resolvable sources | Shipped | Lifecycle tests | Supported | Operator action |
| Sidecar-loss background reconciliation | Shipped | Reconciler tests | Preview pending live provider replacement | Operator action |
| Ephemeral state after sidecar loss | Shipped, degraded | Needs reinjection | Needs reinjection | Needs reinjection when runtime exists |
| Snapshot restore | Shipped with explicit remapping | Supported | Supported | Operator action |
| Organization Vault audit UI/API/CLI | Shipped | Supported | Supported | Supported |

The k0s classifications are backed by positive and negative runtime paths,
pause/resume repair, API and CLI smokes, browser acceptance, and cleanup
evidence recorded in `docs/test-report.md`. Sidecar-loss background
reconciliation remains Preview until a live provider-pod replacement test is
recorded; its state machine and scheduler behavior are covered by contract
tests.

## Runtime Classification

A runtime is **supported** only when all of these are true:

- OpenSandbox exposes Credential Vault apply, inspect, and delete operations;
- sandbox endpoint resolution reaches the egress sidecar;
- egress status reports `credentialVaultReady: true`;
- the sidecar runs `dns+nft`, not DNS-only mode;
- credential binding hosts are part of a default-deny outbound policy; and
- no transparent service-mesh proxy competes for interception.

If the provider API exists but transiently cannot reach the sidecar, Harakiri
reports **degraded/provider unavailable** and keeps truthful attachment state.
If the runtime cannot enforce `dns+nft`, Vault is **unsupported**. Harakiri does
not fall back to env injection, mounted Secrets, Kubernetes exec, or open
outbound access.

Current restricted OpenShift installs are **operator-action-required** because
the OpenSandbox sidecar needs `NET_ADMIN`, which `restricted-v2` does not grant.
The Harakiri chart does not create or modify SCCs.

## Contract Audit

Reviewed on 2026-09-04:

- Write-only values are absent from response DTOs, OpenAPI response schemas,
  attachment tables, source reference tables, provider metadata, audit events,
  templates, and snapshots.
- Envelope-encrypted values exist only in workspace custody records; per-record
  data keys are wrapped by an operator-owned key.
- Source resolution is behind one service boundary. Sandbox creation and the
  runtime provider do not branch on secret-manager vendor details.
- Credential-bearing creation attests safe egress before injection and rolls
  back the provider sandbox if any attachment fails.
- Harakiri rejects duplicate provider credential names before OpenSandbox sees
  an ambiguous configuration. OpenSandbox still fails ambiguous binding matches
  closed.
- Provider inspection is observed state. The scheduler repairs missing
  encrypted, external, and dynamic attachments in bounded leased batches.
- Templates snapshot slot requirements but never source selections. Restores
  require explicit mappings.
- Organization admins manage custody and audit. Members see and use only sources
  explicitly shared with the organization.

The SDK still mirrors protocol types manually. Contract and package tests are
the current drift gate until generation is introduced.

## Release Evidence Required

Before changing a real-runtime row to Shipped, record:

1. Harakiri, OpenSandbox server/chart, and egress image versions.
2. Cluster profile, egress mode, Credential Proxy, and service-mesh state.
3. Positive injection, denied destination, binding mismatch, duplicate/ambiguous
   prevention, missing sidecar, DNS-only rejection, and terminated sandbox.
4. Detach, pause/resume, explicit restore mapping, provider-state loss, dynamic
   refresh, and source-unavailable behavior.
5. Admin and member browser/API behavior at desktop and mobile widths.
6. Cleanup results and any operator action or unsupported combination.
