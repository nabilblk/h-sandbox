# v0.5.0-rc.2: Persistent Workspaces and Live Commands

September 7, 2026. Test release candidate; not a stable or production-readiness
claim. Use matching `0.5.0-rc.2` API/web, Helm chart, SDK and CLI artifacts.
API/web images and the Helm chart are published in Harbor and deployed to the
public k0s lab. SDK/CLI tarballs are attached to the GitHub prerelease and pass
installed-package acceptance. npm publication is pending authentication: neither
package is on `next` yet, and `latest` remains `0.4.0`.

See the [artifact and deployment receipt](./0.5.0-rc.2-delivery.md) for exact
digests, installation commands, checks and remaining gates.

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

Some existing ephemeral templates do not contain `/workspace`. For these, set
Commands working directory to an existing path such as `/`; automatic selection
from runtime metadata remains a UI follow-up. Attached persistent workspaces
provide `/workspace` as documented.

## Acceptance Still Required

**Known renewal defect:** the idle schedule can terminate a renewed sandbox at
its original deadline, despite a later reported expiry. This predates this
candidate and was reproduced during release acceptance. Do not rely on renewal
or terminal activity to extend a job's lifetime in this preview. Select a
sufficient initial TTL for bounded tests. Correcting scheduler/renewal
coordination and testing it with PostgreSQL is a stable-release blocker.

Source CI, PostgreSQL tests and real public k0s checkpoint/reconnect, CLI and
credential-revocation acceptance passed. The template workflow passed 11 of 12
architecture jobs; the OpenCode amd64 arbitrary-UID check timed out. No combined
template candidate or alias was promoted. Clean restricted OpenShift install,
template acceptance, host-login recovery and coherent rollback validation remain in
the [active execution plan](../exec-plans/active/delivery-readiness-and-persistent-workspaces.md).
Do not use this candidate as a production readiness claim. BackgroundAgent is
an external consumer and is not installed or changed by this release.
