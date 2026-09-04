# Sandbox Lifecycle

Harakiri lifecycle is explicit and control-plane backed. OpenSandbox owns the
runtime; Harakiri records the stable product state around it: IDs, templates,
TTL, routes, commands, usage, snapshots, and audit trail.

## States

| State | Meaning | Next states |
| --- | --- | --- |
| `pending` | The sandbox record exists and provisioning is queued or running. | `running`, `error`, `terminated` |
| `running` | The provider reports the runtime as available. Commands, files, routes, logs, metrics, and terminal attach may be used when their capabilities are available. | `idle`, `error`, `terminated` |
| `idle` | The runtime is retained but not actively executing work. Harakiri may renew it or kill it. | `running`, `error`, `terminated` |
| `pausing` | A provider pause request has been accepted and Harakiri is waiting for the runtime state to settle. | `paused`, `running`, `error`, `terminated` |
| `paused` | The provider has paused the runtime. Harakiri keeps the sandbox record and route/snapshot history. | `resuming`, `error`, `terminated` |
| `resuming` | A provider resume request has been accepted and Harakiri is waiting for the runtime state to settle. | `running`, `idle`, `error`, `terminated` |
| `error` | Provisioning or provider reconciliation failed. The control-plane record is retained for inspection. | `pending`, `terminated` |
| `terminated` | The runtime was killed, expired, or deleted. Reconnect returns the historical record, but runtime operations are not expected to work. | none |

Harakiri exposes provider-owned status as the sandbox `status` field and keeps
control-plane timestamps in `createdAt`, `ttlSeconds`, and `expiresAt`.

## Supported Operations

`create` starts a sandbox from a template. Pass `wait: true` when the caller
needs a ready runtime before continuing.

`reconnect` means "look up an existing sandbox by ID and refresh its current
summary." It does not resurrect a terminated runtime. In the SDK, use
`HarakiriSandbox.connect(client, id)`, `client.sandboxes.reconnect(id)`, or
`sandbox.reconnect()`.

`renew` extends the TTL and updates `expiresAt`. Use it for long running jobs or
interactive sessions that are still active.

`kill` terminates the runtime and marks the sandbox as `terminated`. Harakiri
also removes route records from the active route table as part of sandbox
cleanup.

`pause` and `resume` delegate to the provider lifecycle API when the configured
runtime provider exposes those methods. Harakiri persists intermediate states
and returns explicit `runtime_lifecycle_unsupported` or
`runtime_provider_failed` errors when the provider cannot satisfy the request.
After a successful resume, active injected Credential Vault attachments are
marked `requires_reinjection` because provider-side vault state is reset.
Harakiri immediately rehydrates attachments backed by active encrypted
workspace secrets, external references, and dynamic issuers. Ephemeral values
must be reattached by the caller because Harakiri never stored them.
Attachments whose source is disabled, deleted, missing, expired, unresolved, or
undecryptable stay `requires_reinjection` with a redacted reason. The scheduler
also inspects active provider vaults and repairs sidecar state lost outside an
explicit resume.

`snapshot` creates a Harakiri snapshot record, asks the provider to create the
runtime snapshot, stores the internal provider snapshot ID, and exposes the
public `snp_...` ID to callers. Snapshot restores call `POST /v1/sandboxes`
with `snapshotId` instead of a template.

Snapshots contain runtime filesystem/process state, not Credential Vault source
selections or provider-side values. A credential-bearing restore must provide
new `credentialMappings` for the restored template slots. The normal
create-time safety and rollback path then injects those selected sources.

## Snapshots

```bash
harakiri snapshot sbx_... --name before-upgrade --wait
harakiri snapshots list
harakiri snapshots inspect snp_...
harakiri create --snapshot snp_... --name restored-runner
harakiri snapshots delete snp_...
```

```ts
const { snapshot } = await sandbox.snapshot({
  name: "before-upgrade",
  wait: true
});

const restored = await harakiri.sandboxes.create({
  snapshotId: snapshot.id,
  name: "restored-runner",
  wait: true
});
```

Harakiri snapshot IDs are stable product IDs. Provider snapshot IDs remain
internal and are not required by SDK, CLI, or dashboard users.

## Capability Gating

Pause, resume, snapshot, snapshot list/delete, and create-from-snapshot are
provider-backed optional capabilities. Integrations should read
`/v1/runtime/capabilities` or
`sandbox.runtimeMetadata.provider.capabilities` before enabling advanced
lifecycle controls.

Runtime capability responses include:

- `lifecycleRenew`: available
- `lifecycleKill`: available
- `lifecycleReconnect`: available
- `lifecyclePause`: available when the provider exposes pause
- `lifecycleResume`: available when the provider exposes resume
- `lifecycleSnapshot`: available when the provider exposes snapshot create
- `snapshotList`: available when snapshots can be listed
- `snapshotDelete`: available when snapshots can be deleted
- `createFromSnapshot`: available when sandbox create accepts a snapshot source

The OpenSandbox provider maps these to OpenSandbox-native lifecycle and snapshot
APIs. If an installation runs an OpenSandbox build or runtime mode without a
working snapshot implementation, Harakiri returns explicit unavailable/provider
errors instead of falling back to Kubernetes operations.

## CLI

```bash
harakiri create --template python-3.12-data --name agent-runner --ttl 600
harakiri create --snapshot snp_... --name restored-runner
harakiri status sbx_...
harakiri status sbx_... --json
harakiri renew sbx_...
harakiri pause sbx_...
harakiri resume sbx_...
harakiri snapshot sbx_... --wait
harakiri snapshots list
harakiri kill sbx_...
harakiri capabilities
```

The `status` command prints TTL, expiration, provider sandbox ID, and lifecycle
capability states.

## Cleanup

Use `kill` when the caller owns the sandbox lifecycle. Use short TTLs when the
caller may crash or lose the sandbox ID. Harakiri's scheduler reconciles expired
sandboxes, records expiration or deletion events, and removes active route
records so preview URLs do not outlive their runtime.

For route-heavy workflows, delete routes explicitly when a preview server stops,
then kill the sandbox when no more runtime work is required.

## Verification

Run the basic lifecycle smoke when validating create/reconnect/renew/route/kill:

```bash
pnpm smoke:lifecycle
```

Run the persistence smoke when validating an OpenSandbox installation with a
working snapshot registry:

```bash
pnpm smoke:lifecycle-persistence
```

The persistence smoke creates a sandbox, writes a marker file, pauses and
resumes it, snapshots it, restores a second sandbox from the snapshot, verifies
the marker in both runtimes, then deletes the snapshot and sandboxes.
