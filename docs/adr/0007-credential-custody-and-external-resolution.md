# ADR 0007: Credential Custody And External Resolution

- Status: Accepted
- Date: 2026-09-03

## Context

OSS installations need both a self-contained workspace Vault and integration
with operator-owned secret systems. A public API tied to one cloud KMS or
secret-manager vendor would be difficult to self-host and evolve.

## Decision

Harakiri encrypted custody uses per-record envelope encryption behind an
internal key-provider boundary. External sources persist typed locators and
resolve values only at injection time through a resolver registry. Kubernetes
Secret is the first resolver; External Secrets Operator composes by
materializing that Secret. Dynamic issuers persist scope and expiry metadata,
not issued tokens.

All credential APIs are write-only for values. Deletion clears encrypted
custody but retains metadata required for audit.

## Consequences

Operators can choose Harakiri custody or keep the source of truth elsewhere.
Wrapping-key backup is mandatory for encrypted records. Direct HashiCorp Vault,
cloud manager, or KMS implementations can be added without changing the public
source vocabulary, but each needs its own authorization and support review.
