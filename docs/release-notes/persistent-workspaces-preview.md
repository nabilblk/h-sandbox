# v0.5.0-rc.2: Persistent Workspaces and Live Commands

September 7, 2026. Test release candidate; not a stable or production-readiness
claim. Use matching `0.5.0-rc.2` API/web, Helm chart, SDK and CLI artifacts.
The npm `latest` channel remains `0.4.0`; the candidate uses `next`.
Publication and hosted deployment evidence is recorded in the active plan.

## Added

- Organization-owned persistent workspace IDs, fixed operator storage profiles,
  exclusive sandbox attachment and logical archive with explicit retained quota.
- Native OpenSandbox retained PVC creation/reuse at `/workspace`; no Kubernetes
  exec, file, or volume-management fallback in runtime APIs.
- Authenticated command SSE output with command-bound cursors, completion,
  expiry/revocation checks, bounded polling, disconnection and reconnection.
- SDK workspace helpers and async command events; CLI workspace and follow
  commands; dashboard workspace management and tracked command output.
- Staged registry-only OpenShift installation, protected template image release
  workflow and independent public-lab origin/tunnel supervision.

## Fixed During Live Acceptance

- `command run --follow --json` keeps command progress on stderr so stdout is
  valid newline-delimited JSON, including when starting and following together.
- CLI environment credentials and API origin take precedence over saved config,
  matching the documented automation contract without rewriting local config.
- `0.5.0-rc.1` was a validation build, superseded before npm publication. Its
  immutable image/chart artifacts and tag are not overwritten.

## Compatibility and Limits

Migration 035 is additive but older API/scheduler images do not understand
workspace reservations. Do not attach persistent storage before deploying both
updated services. Review the [operator rollback procedure](../persistent-workspace-operations.md)
before downgrading. Storage is opt-in and must not silently fall back to an
ephemeral runtime. Snapshot/restore with persistent workspaces is rejected.

Archiving does not delete PVCs or release quota. Physical reclamation is an
operator task. Command output replay depends on provider log retention, not a
new durable event database. Closing a viewer never kills a command.

## Acceptance Still Required

The source-level, PostgreSQL, desktop/mobile browser and k0s SDK
checkpoint/reconnect tests are passing. Clean restricted OpenShift install,
remaining template architectures, final hosted acceptance and deployment are tracked in
the [active execution plan](../exec-plans/active/delivery-readiness-and-persistent-workspaces.md).
Do not use this candidate as a production readiness claim. BackgroundAgent is
an external consumer and is not installed or changed by this release.
