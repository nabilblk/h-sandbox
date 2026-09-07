# Persistent Workspace Operations

## Enable Deliberately

Use an API/scheduler build containing migration `035_persistent_workspaces.sql`.
Back up PostgreSQL and apply migrations before enabling workspace creation. Both
processes must receive the same settings and provider configuration:

```yaml
config:
  PERSISTENT_WORKSPACES_ENABLED: "1"
  WORKSPACE_STORAGE_CLASS: "your-approved-rwo-class"
  WORKSPACE_SIZE_GIB: "10"
  WORKSPACE_MAX_PER_ORGANIZATION: "20"
  OPEN_SANDBOX_ALLOW_FALLBACK: "0"
```

The Helm chart distributes `config` to both API and scheduler. A blank class
uses the cluster default; verify it before enabling. Harakiri does not create
StorageClasses, grant SCCs, set arbitrary host paths, or allow client-specified
claim names. OpenSandbox requires permission to provision PVCs in its runtime
namespace. Customer disk/namespace quotas still apply.

Validate both architectures/templates you deploy, arbitrary UID permissions,
mount ownership/fsGroup behavior and an actual two-sandbox write/read test.
Overlaying `/workspace` means image-layer permissions at that path do not prove
the PVC is writable. OpenShift acceptance must use its real assigned UID and
approved storage class; a Docker arbitrary-UID smoke is necessary but not enough.

## Recovery States

`attached` includes provisioning/running/paused owners. `releasing` means the
sandbox terminated but provider absence is not yet confirmed. `recovery_required`
means an errored sandbox still owns the reservation. Start with the operation
record, scheduler logs and provider API. Keep storage reserved while the provider
is unavailable. Never infer that a timeout means the runtime was not created.

Each attachment is attempted once. After an ambiguous create, inspect provider
metadata for the Harakiri sandbox ID and confirm whether a runtime exists.
Terminate any orphan via the OpenSandbox API. Only after confirming absence may
an operator associate its known provider ID with the failed Harakiri sandbox so
the reconciler can release it. If no runtime ever existed, an operator-approved,
audited metadata repair may clear that reservation. Stop lifecycle workers during
manual repair and record before/after evidence; there is no automatic force-unlock
or public provider-ID override endpoint.

If a previously provisioned volume disappears, subsequent attachment fails
instead of creating an empty replacement. Restore the volume from backup or
allocate a new workspace with an explicit data-loss decision. Do not reset the
first-provision marker as a shortcut.

## Reclaim Retained Storage

1. Obtain data-owner approval and backup/retention confirmation.
2. Confirm the workspace is archived, detached, and has no in-flight operation.
3. Resolve its private generated volume reference from the control-plane DB;
   restrict access to this lookup. Do not publish provider identifiers to users.
4. Confirm no provider sandbox mounts that volume. Delete the exact approved PVC
   using the operator's normal storage tooling, not a Harakiri runtime endpoint.
5. Check the PV reclaim policy and backing storage. PVC deletion alone is not
   evidence of secure erasure. Preserve audit evidence and backups per policy.

Allocation slots are deliberately not automatically recycled after manual PVC
deletion. Raising the organization allocation limit or an audited DB retention
procedure is currently required. An upstream volume-delete/reclaim contract is
a follow-up, not an unimplemented API advertised as available.

## Upgrade, Disable and Rollback

Migration 035 is additive. The migration runner now uses one connection for its
advisory lock and each transaction. Never run down-migrations that discard
workspace ownership while volumes exist. Disable new attachment with the feature
flag if necessary; preserve metadata and reservations. Keep the matching scheduler
running until in-flight cleanup is complete before disabling reconciliation.

Restore the compatible API/web/scheduler images together on rollback. An older
version does not understand workspace reservations; do not allow it to create or
mutate workspace-backed sandboxes. Database backup restore and PVC restore must
refer to a coherent recovery point; neither replaces the other.

The default restricted OpenShift profile does not enable egress/Vault sidecars
that need NET_ADMIN. Persistent file storage does not change that security policy.
