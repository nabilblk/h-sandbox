# Credential Vault Threat Model

**Review date:** 2026-09-04
**Scope:** Credential sources, Harakiri control plane, OpenSandbox credential
injection, lifecycle repair, and user-facing metadata.

## Security Objective

A sandbox may authenticate to explicitly matched HTTPS destinations while its
workload receives only fake values. Compromise of a sandbox should not provide
the reusable credential value or allow it to be replayed against an arbitrary
destination through the supported path.

Credential Vault reduces credential exposure. It does not make hostile code
safe, validate the behavior of an allowed remote service, or replace least
privilege at the credential issuer.

## Assets

- Inline credential values during one API operation.
- Encrypted workspace credential values and wrapping keys.
- Kubernetes Secret values resolved at injection time.
- GitHub App private key and short-lived installation tokens.
- Binding rules, organization membership, audit records, and provider vault
  state.

## Trust Boundaries

1. **Caller to Harakiri API:** TLS and API key or OIDC authentication protect
   write-only input. The caller remains responsible for its own process env and
   CI secret store.
2. **Harakiri custody:** PostgreSQL is untrusted for plaintext secrecy.
   Workspace values use envelope encryption; external and dynamic values are
   not persisted.
3. **Harakiri to source provider:** Kubernetes API and GitHub API credentials
   are operator-owned. Allowlist and issuer scope limit what workspace admins
   can request.
4. **Harakiri to runtime provider:** Real material is sent to the sandbox-local
   OpenSandbox egress sidecar, not to the workload environment or filesystem.
5. **Sandbox to internet:** `dns+nft` interception and a default-deny outbound
   policy constrain where matching auth can be injected.

## Threats And Controls

| Threat | Primary controls | Residual risk |
| --- | --- | --- |
| Database dump reveals secrets | Per-record AEAD encryption, wrapped data keys, operator key outside PostgreSQL | A combined DB and active key compromise can decrypt Harakiri-custodied values |
| API/UI reads a stored value | Write-only DTOs, dedicated response types, OpenAPI/static boundary checks | A future unsafe query or log requires code review and tests to catch it |
| Sandbox reads a real env value | Only fake env is launched; real value goes to sidecar | A malicious allowed destination can reflect received credentials in its response |
| Sandbox sends credentials to another host | Exact/wildcard host, HTTPS, method, and path bindings plus restricted egress | DNS, certificate, or provider bugs are outside Harakiri's application boundary |
| Direct-IP bypass | Vault rejects runtimes not attested as `credentialVaultReady`; OpenSandbox must use `dns+nft` | Restricted OpenShift profiles may not permit the required network capability |
| Ambiguous credential injection | Harakiri rejects duplicate provider credential names; OpenSandbox fails ambiguous binding matches closed | Overlapping but differently named bindings still require careful operator review |
| Error or audit leakage | Central redaction before persistence; upstream bodies are not returned | Remote service behavior can place sensitive data in application output outside Vault APIs |
| Workspace member escalates to custody admin | Admin-only CRUD; explicit `organization_members` use policy; organization scoping | Shared use lets a member cause scoped requests even though value readback is denied |
| Workspace admin reads arbitrary Kubernetes Secrets | Resolver disabled by default, namespace/name allowlist, generated get-only RBAC | Prefix policies require namespace-level `get` RBAC and rely on Harakiri's application check |
| Long-lived Git credential leaks | GitHub App installation tokens are scoped, expire, refresh, and are not persisted | GitHub App private-key compromise can mint additional tokens within App permissions |
| Pause/resume silently loses protection | Attachments become `requires_reinjection`; provider inspection and reconciliation repair resolvable sources | Ephemeral values cannot be repaired without new caller input |
| Snapshot captures credential state | Snapshots do not persist source mappings or sidecar vault state; restore requires explicit mapping | Files written by user code may still contain credentials obtained outside Vault |
| Service mesh bypass or conflict | Transparent service-mesh sidecars are unsupported with the current interception model | An operator can still deploy an unvalidated combination outside support policy |

## Authorization Model

- Organization admins create, rotate, validate, disable, enable, and delete
  reusable sources and view organization Vault audit history.
- Members can use only active sources explicitly marked
  `organization_members`. They cannot manage custody or access audit identities.
- All reads and writes are scoped by organization before source resolution.
- System reconciliation uses the existing attachment's organization and source
  reference. It cannot discover or substitute another source.

## Cryptographic Custody

Each encrypted workspace value receives a random data-encryption key (DEK). The
value is encrypted with authenticated encryption; the DEK is wrapped by the
operator-selected key ID. A JSON keyring may contain active and previous keys
to permit rotation. Removing a referenced wrapping key makes those records
undecryptable by design.

Harakiri does not claim hardware-backed key custody. Deployments requiring KMS
or HSM policy should supply a future key-provider implementation or use an
external reference so Harakiri never stores the value.

## Logging And Redaction

Never log request bodies on Vault routes. Persist only stable IDs, source type,
provider profile, binding host/method/path metadata, status, expiry, and
sanitized error categories. Raw provider response bodies, authorization
headers, private keys, access tokens, ciphertext, and wrapped keys are not
audit metadata.

The runtime test endpoint returns status and redacted diagnostics, never the
remote response body. This avoids turning a credential-reflecting endpoint into
a value readback channel through the Harakiri API.

## Incident Response

1. Disable the affected source or dynamic issuer immediately.
2. Detach affected sandbox attachments or terminate the sandboxes.
3. Revoke or rotate the upstream credential. Harakiri rotation does not revoke
   the old value at its issuer.
4. Inspect organization audit events by target and action prefix.
5. Rotate the Harakiri wrapping key if key custody is suspected. Keep old keys
   only long enough to migrate or delete records that reference them.
6. For a GitHub App compromise, revoke the App private key and installation
   tokens at GitHub before replacing cluster configuration.
7. Record the affected source IDs, attachment IDs, sandbox IDs, time range, and
   runtime profile. Do not put raw values in the incident ticket.

## Explicit Non-Goals

- Protecting a credential from the external service that legitimately receives
  it.
- Preventing an allowed service from reflecting a credential to sandbox code.
- Scanning arbitrary sandbox files or process memory for user-managed secrets.
- Supporting plaintext HTTP credential injection.
- Circumventing OpenShift SCC policy or installing privileged networking
  without operator approval.
- Replacing upstream token scope, expiry, revocation, or organization policy.

## Security Release Checklist

- `pnpm credential-vault:check` passes.
- Positive and negative provider tests use disposable values.
- OpenAPI and UI expose no value-bearing response field.
- The current OpenSandbox version and `dns+nft` attestation are recorded.
- RBAC tests cover admin, shared member, and forbidden member paths.
- Helm rendering proves least-privilege external Secret access.
- Support and operator docs identify unsupported OpenShift/service-mesh
  profiles before users enable Vault.
