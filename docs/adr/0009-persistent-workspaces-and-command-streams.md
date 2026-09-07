# ADR 0009: Persistent Workspaces and Tracked Command Streams

Status: accepted for implementation, 2026-09-07. Customer OpenShift acceptance
and release publication are separate gates; see the active execution plan.

## Decision

A workspace is organization-owned persistent **storage**, not an organization,
sandbox, snapshot, command session, Git checkout, or Credential Vault. Public
contracts use `wsp_` IDs. The generated provider volume name, storage class and
provisioning configuration stay private to the control plane.

PostgreSQL owns metadata, per-organization allocation slots and an exclusive
sandbox reservation. A BEFORE INSERT trigger reserves the workspace before
foreign-key checks; its deferred sandbox FK permits an atomic reservation in
the same statement. Competing attachments fail with 409, not a shared mount.
Archived records still consume allocation slots. A quota counts requested
volumes, not actual measured bytes, and does not imply a disk-usage meter.

OpenSandbox owns native volume provisioning and mounting. The configured
profile is opt-in and fail-closed, with one RWO volume at `/workspace` and a
fixed operator-selected size/class. The development provider does not emulate
durability. OpenSandbox fallback must be disabled. Native Kubernetes PVC
provision/reuse was tested against server v0.2.3 on k0s.

## Failure and Retention

- A durable first-provision marker prevents silently recreating missing data.
- A separate per-attachment attempt marker prevents replaying an ambiguous
  provider create into a second runtime instance. Recovery is operator-led.
- Release follows provider-confirmed absence, with no queued/running lifecycle
  operation. An unknown provider ID after an attempted create stays reserved.
- Kill, TTL and external runtime deletion retain files. Pause retains the same
  exclusive reservation. It does not make the workspace available for reuse.
- Snapshot creation for workspace-backed sandboxes and snapshot restore with
  `workspaceId` are rejected. No promise that PVC data is in a runtime snapshot.
- Archive is logical retirement, not secure erasure. No runtime-provider volume
  deletion endpoint exists in the pinned upstream API. Physical reclaim remains
  an explicitly approved operator procedure, never a hidden cleanup sandbox.
- Credentials written by agents into ordinary files may persist. Revoking a
  Vault credential does not scrub files, logs, backups or external copies.

## Command Observation

Authenticated `GET /v1/sandboxes/:id/commands/:commandId/events` exposes SSE
`output`, `status`, `complete`, `error` and `reconnect` events. The underlying
detached OpenSandbox log endpoint is cursor-polled once per second; this is not
advertised as native end-to-end push. Each atomic output batch carries a cursor
bound to its command and source. Readers resume using `cursor` or Last-Event-ID.

Streams revalidate authorization, heartbeat, rotate after 60 seconds, limit
viewers per organization/API process, bound frames and respect backpressure.
The SDK uses the maintained eventsource-parser package, not an ad-hoc parser.
Iterator return or AbortSignal closes only the observer. Killing a command is
an explicit separate operation. Replay depends on retained provider logs;
missing/reset history is an error, not successful completion.

## Alternatives Not Chosen

Kubernetes exec/claim deletion from public runtime APIs violates the provider
boundary. Shared writable multi-sandbox mounts add correctness and permission
risks. Mapping snapshots to workspaces hides data-loss semantics. Automatic
retries of ambiguous mounts risk duplicate writers. All are excluded here.

## Sources

- [OpenSandbox v0.2.3 lifecycle schema](https://github.com/opensandbox-group/OpenSandbox/blob/server/v0.2.3/specs/sandbox-lifecycle.yml)
- [Native PVC example](https://github.com/opensandbox-group/OpenSandbox/blob/server/v0.2.3/docs/examples/kubernetes-pvc-volume-mount.md)
- [execd command/log contract](https://github.com/opensandbox-group/OpenSandbox/blob/server/v0.2.3/specs/execd-api.yaml)
- [SSE parser](https://github.com/rexxars/eventsource-parser)
