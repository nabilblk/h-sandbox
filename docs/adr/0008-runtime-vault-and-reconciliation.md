# ADR 0008: Runtime Vault And Reconciliation

- Status: Accepted
- Date: 2026-09-03

## Context

OpenSandbox Credential Vault is in-memory in the egress sidecar. Pod recreation
can erase provider state while Harakiri still has desired attachment metadata.
Credential injection is also unsafe when egress enforcement is DNS-only.

## Decision

Use OpenSandbox Credential Vault behind `RuntimeProvider`. Require `dns+nft`,
Credential Proxy, restricted credential-derived egress, and a positive
`credentialVaultReady` attestation. Create-time attachment failure triggers
provider sandbox rollback.

Treat PostgreSQL attachment rows as desired state and sanitized sidecar
inspection as observed state. Resume and the scheduler mark missing entries
`requires_reinjection`; encrypted, external, and dynamic sources are repaired.
Ephemeral values require caller reinjection. Snapshot restore requires explicit
source mappings.

## Consequences

The control plane can report and repair drift without Kubernetes exec or pod
knowledge. Runtime support depends on OpenSandbox networking capability.
Restricted OpenShift remains operator-action-required when `NET_ADMIN` is not
approved.
