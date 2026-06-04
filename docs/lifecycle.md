# Sandbox Lifecycle

Harakiri's v1 lifecycle is intentionally small: create, reconnect, renew, and
kill. OpenSandbox owns the underlying runtime lifecycle; Harakiri records the
control-plane state, TTL, routes, commands, usage, and audit trail around that
runtime.

## States

| State | Meaning | Next states |
| --- | --- | --- |
| `pending` | The sandbox record exists and provisioning is queued or running. | `running`, `error`, `terminated` |
| `running` | The provider reports the runtime as available. Commands, files, routes, logs, metrics, and terminal attach may be used when their capabilities are available. | `idle`, `error`, `terminated` |
| `idle` | The runtime is retained but not actively executing work. Harakiri may renew it or kill it. | `running`, `error`, `terminated` |
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

## Unsupported Operations

Pause, resume, snapshot, and restore are not part of the current
OpenSandbox-backed lifecycle contract. The SDK exposes `pause()`, `resume()`,
and `snapshot()` only to fail fast with
`HarakiriUnsupportedLifecycleCapabilityError`, so integrations can branch on
capabilities instead of discovering the limitation through provider errors.

Runtime capability responses include:

- `lifecycleRenew`: available
- `lifecycleKill`: available
- `lifecycleReconnect`: available
- `lifecyclePause`: unavailable, unsupported
- `lifecycleResume`: unavailable, unsupported
- `lifecycleSnapshot`: unavailable, unsupported

Read `/v1/runtime/capabilities` or `sandbox.runtimeMetadata.provider.capabilities`
before building UI actions for optional lifecycle features.

## CLI

```bash
harakiri create --template python-3.12-data --name agent-runner --ttl 600
harakiri status sbx_...
harakiri status sbx_... --json
harakiri renew sbx_...
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

