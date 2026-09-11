# Standalone Recovery and Upgrade Qualification

This runbook defines the recovery contract for a standalone Harakiri installation.
It does not certify a profile merely because its commands or tests exist.

**Evidence status, September 11, 2026:** isolated native amd64 installation,
browser OIDC onboarding, published CLI/SDK tasks, protected routes, admission
denial and retained workspace reuse passed in
[run 34658975916](https://github.com/nabilblk/h-sandbox/actions/runs/34658975916).
Coordinated restoration of both databases and workspace storage also passed,
including real encrypted Vault use and missing/wrong-key rejection. The next
gate stopped before provider state-loss injection because the harness expected
a gateway header on a server-proxy endpoint; that fixture assumption is being
corrected. State rehydration, final revocation and configuration rollback are
not yet qualified; see the per-run results in
[PR 42](https://github.com/nabilblk/h-sandbox/pull/42). HA, arbitrary CSI
drivers and unchanged restricted OpenShift remain outside this qualification.
See [the delivery record](../release-notes/0.5.0-rc.9-delivery.md) and
[the acceptance harness](../../infra/acceptance/README.md).

## One Recovery Point, Four Kinds of State

| State | Why it must be preserved |
| --- | --- |
| Harakiri PostgreSQL | Organizations, scoped key hashes, templates, encrypted credentials, operations, execution reservations and workspace ownership |
| Keycloak PostgreSQL | Users, password hashes, realms, clients and identity/signing configuration; realm import is not a database backup |
| Workspace volumes | Agent-written files; a database dump contains references to this data, not the data itself |
| Operator configuration and wrapping keys | Public issuers/redirects, provider settings, database credentials, all required Vault key IDs, registry encryption material, chart versions and image digests |

Losing a Vault wrapping key means encrypted values may be unrecoverable. Creating
a new random key with the same environment-variable name does not restore the
old one. Keep older key versions while any retained backup depends on them.
External references and short-lived issuers also require their independently
managed stores/permissions; this runbook's encrypted-source test is not evidence
of external-provider recovery.
An unset `CREDENTIAL_VAULT_KEY` can fall back to the control-plane encryption key.
The fixture uses an explicitly empty value for its missing-material case so that
fallback cannot turn it into a second wrong-key test. This fault injection belongs
only in a disposable target; it is not an instruction to erase production keys.

## Prepare the Rehearsal

1. Choose a disposable target with a different cluster UID from the source.
   Do not conduct deletion, missing-key or outage tests in a shared cluster.
   The CI fixture additionally refuses any inherited context or existing k0s.
2. Record both kubeconfigs, namespaces, cluster UIDs, application/chart digests,
   PostgreSQL version, storage driver and PV reclaim policy. Keep kubeconfigs
   private. Every operator command must name its kubeconfig explicitly.
3. Create a retained workspace through Harakiri. Write a deterministic file,
   record its SHA-256 and prove it survives one runtime replacement.
4. Create an encrypted Vault source using a disposable credential. Prove actual
   runtime injection against an owned upstream before attempting recovery.
   A nonempty row or a sanitized metadata response is not sufficient.
5. Record the organization, user and test key identities privately. Have a
   separate recovery administrator and verified access to wrapping-key backups.

Do not give application clients Kubernetes credentials. Runtime commands,
file operations, route access and lifecycle tasks use Harakiri's public API,
SDK or CLI. Operator database/volume backup is a separate infrastructure duty.

## Quiesce and Capture

Stop task producers first. Terminate the owned test runtimes through Harakiri,
wait for authoritative provider absence, and verify both execution-slot release
and workspace detachment. A `terminated` UI label alone is not a release proof.
There must be no active template build jobs or in-flight lifecycle operations.

Record the configured replica counts, then stop the API, scheduler and template
builder. Stop Keycloak before taking its database backup. A namespace label or
readiness failure does not quiesce writers. The acceptance runner checks that
their pods are actually gone.

For the reference profile, after the source identity and maintenance window have
been approved, backup commands have this shape:

```bash
: "${SOURCE_KUBECONFIG:?Set the approved source kubeconfig}"
: "${SOURCE_CLUSTER_UID:?Set the independently recorded source cluster UID}"
test -f "$SOURCE_KUBECONFIG" || exit 1
test "$(kubectl --kubeconfig "$SOURCE_KUBECONFIG" \
  get namespace kube-system -o jsonpath='{.metadata.uid}')" \
  = "$SOURCE_CLUSTER_UID" || exit 1
umask 077
mkdir recovery-point
kubectl --kubeconfig "$SOURCE_KUBECONFIG" -n harakiri-preview \
  exec deployment/preview-postgres -- \
  pg_dump -U postgres -d harakiri -Fc --no-owner --no-acl \
  > recovery-point/harakiri.dump
kubectl --kubeconfig "$SOURCE_KUBECONFIG" -n harakiri-preview \
  exec deployment/preview-postgres -- \
  pg_dump -U postgres -d keycloak -Fc --no-owner --no-acl \
  > recovery-point/keycloak.dump
kubectl --kubeconfig "$SOURCE_KUBECONFIG" -n harakiri-preview \
  get secrets,configmaps,deployments -o json \
  > recovery-point/operator-state.json
```

These files are sensitive and **not encrypted backup archives**. Keep them out
of Git, issue attachments, screenshots and public CI artifacts. Encrypt them
using your approved backup system before transfer or retention. Managed
PostgreSQL installations should use their supported backup tooling and roles.

Capture the **detached** workspace volume at this same quiesced point using your
storage provider's approved snapshot/file-backup procedure. For the single-node
local-path test only, an operator-owned archive pod mounts the detached PVC and
streams a tar archive. This is not a runtime execution fallback, CSI snapshot or
portable full-cluster backup.

Record checksums, storage identifiers, the recovery-point time, versions and key
inventory together. An operator-state JSON export is evidence/inventory, not a
manifest to apply blindly: remove server-assigned fields and restore reviewed
configuration and secrets deliberately. Keep source writers stopped until the
capture is coherent or abandon and retake the whole recovery point.

## Restore, Then Prove It

Provision an empty compatible PostgreSQL instance and the same database roles.
Restore the two databases without starting application writers. For the
reference database names, the restore commands are:

```bash
: "${SOURCE_CLUSTER_UID:?Set the recorded source cluster UID}"
: "${TARGET_KUBECONFIG:?Set the approved disposable target kubeconfig}"
: "${TARGET_CLUSTER_UID:?Set the independently recorded target cluster UID}"
test -f "$TARGET_KUBECONFIG" || exit 1
test "$TARGET_CLUSTER_UID" != "$SOURCE_CLUSTER_UID" || exit 1
test "$(kubectl --kubeconfig "$TARGET_KUBECONFIG" \
  get namespace kube-system -o jsonpath='{.metadata.uid}')" \
  = "$TARGET_CLUSTER_UID" || exit 1
kubectl --kubeconfig "$TARGET_KUBECONFIG" -n harakiri-preview \
  exec -i deployment/preview-postgres -- \
  pg_restore --exit-on-error --no-owner --no-acl -U postgres \
  --role harakiri -d harakiri < recovery-point/harakiri.dump
kubectl --kubeconfig "$TARGET_KUBECONFIG" -n harakiri-preview \
  exec -i deployment/preview-postgres -- \
  pg_restore --exit-on-error --no-owner --no-acl -U postgres \
  --role keycloak -d keycloak < recovery-point/keycloak.dump
```

Restore workspace files into empty storage with the provider volume identity
referenced by the restored database. Preserve ownership, modes and provider
attachment semantics. Verify node affinity for local storage. Do not reset the
first-provision marker or clear a reservation to make a missing volume appear
healthy; Harakiri deliberately refuses to replace previously provisioned data
with an empty volume.

Restore the required wrapping keys and operator settings. Repoint private
database/provider endpoints for the new target without changing public OIDC
issuer identities accidentally. Where the target has a different public origin,
configure its redirects and allowed issuer deliberately before exposing it.
Never run two control planes against the same runtime inventory/storage during
a recovery rehearsal.

Start Keycloak, then matching Harakiri API, scheduler and builder versions. For
a restore containing outstanding operations or live runtime ownership, follow
[capacity recovery](execution-capacity.md) and reconcile authoritative inventory
before allowing new tasks. The automated fixture instead drains all runtimes
before its backup, restores both databases onto a new PVC, stops the original
database, and recreates its owned workspace PVC. Its results do not cover
restoring a live, ambiguous inventory into a different provider.

Acceptance requires all of these observations:

- Normal browser OIDC login preserves the user and organization identity; no
  password-grant shortcut or development authentication bypass.
- The retained scoped API key works, and its subsequent revocation is enforced.
- A new runtime reads the expected workspace bytes with the same SHA-256 and
  working directory. Surviving source storage must not satisfy this test.
- The restored encrypted envelope matches the captured ciphertext/key metadata.
- A real credential request through the runtime proxy succeeds using the
  recovered source. The real secret never appears in sandbox environment,
  command text, API output or public evidence.
- In the disposable target only, missing and incorrect wrapping keys reject
  attachment, install no provider credential and do not rewrite ciphertext.
  Restoring the correct key makes the same source usable again.

## Provider Interruption Is Not Provider Absence

Keep execution and workspace ownership while the provider is unreachable.
Do not clear records, force-unlock storage or automatically replay an ambiguous
create/command to make the dashboard look healthy. Reconcile against the
provider once it returns. A connection failure is not authoritative absence.

The isolated test stops only its provider control API, restarts Harakiri while a
known runtime survives, and checks the original provider identity and retained
ownership. Its detached command writes a start marker exactly once. A second
execution must be denied even during uncertainty; generic HTTP failure is not
accepted as evidence that capacity admission worked.

Vault desired state is tested separately: remove only the owned provider binding
and credential, inspect through Harakiri, then call the explicit rehydration API.
Confirm real credential use afterward. This is not evidence that every runtime
provider supports rehydration or that the background reconciliation timer has
been qualified under all failures.

## Upgrade and Rollback Boundaries

| Change | Rule |
| --- | --- |
| Helm configuration, unchanged compatible images/schema | Preserve private values and keys. Apply an observable change and prove real runtime/state behavior before and after rollback. |
| Application release or migration | Read both release notes; verify all writers understand stored state. Rehearse with a coherent backup and two explicit immutable release identities. |
| rc.9 database back to pre-capacity rc.8 writers | Not supported. Migration 038 reservations would not be enforced by older writers. |
| Workspace/Vault downgrade | Never remove metadata, attachment ownership or wrapping keys while retained state depends on them. |

The current acceptance workflow exercises a genuine Helm resource-request
change and rollback **within the same rc.9 images**. It must not be cited as
cross-release or schema rollback evidence. A distinct capacity-compatible
published pair is still required; the receipt records this as `not_tested`.
See [execution capacity maintenance](execution-capacity.md),
[workspace operations](../persistent-workspace-operations.md) and
[Vault operations](../credential-vault-operations.md).

## Close Out

Record passed and failed gates separately with exact artifacts, architecture,
storage profile and cleanup outcome. Measure recovery duration before setting
an RTO/RPO promise. Revoke test keys and remove owned runtimes before deleting
test namespaces. Runtime resources must disappear before their controllers.
Never delete shared CRDs, prune a shared registry or stop an unrelated VM.

Only an allowlisted receipt belongs in public CI. Private recovery material
needs your backup-retention policy; the disposable test runner removes its copy
and is discarded. A failed cleanup is a failed cleanup even when application
assertions passed.
