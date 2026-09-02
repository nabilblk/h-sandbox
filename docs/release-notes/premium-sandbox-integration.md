# Premium Sandbox Integration Release Notes

Date: 2026-05-29
Last updated: 2026-09-03

This release expands Harakiri from a dashboard-first OpenSandbox control plane
into a public sandbox integration surface for OSS applications.

## 2026-09-03 Lifecycle Persistence Update

Harakiri now exposes OpenSandbox-native pause, resume, snapshot, and restore
through the same public integration surfaces as the rest of the runtime
contract. Provider snapshot IDs stay internal; external integrations use stable
Harakiri `snp_...` IDs.

New API endpoints:

- `POST /v1/sandboxes/{id}/pause`
- `POST /v1/sandboxes/{id}/resume`
- `POST /v1/sandboxes/{id}/snapshots`
- `GET /v1/snapshots`
- `GET /v1/snapshots/{snapshotId}`
- `DELETE /v1/snapshots/{snapshotId}`
- `POST /v1/sandboxes` with `snapshotId`

SDK additions:

- `sandbox.pause()`
- `sandbox.resume()`
- `sandbox.snapshot()`
- `client.snapshots.list()`
- `client.snapshots.get()`
- `client.snapshots.delete()`
- `client.snapshots.wait()`
- `client.sandboxes.create({ snapshotId })`

CLI additions:

- `harakiri pause`
- `harakiri resume`
- `harakiri snapshot`
- `harakiri snapshots list`
- `harakiri snapshots inspect`
- `harakiri snapshots delete`
- `harakiri create --snapshot`

Dashboard additions:

- Pause/resume actions on sandbox detail.
- A Snapshots tab with create, restore, delete, status, provenance, and
  retention metadata.
- Deep-linkable sandbox detail routes that survive hosted Keycloak OIDC
  redirects.

## New Runtime APIs

- Tracked command resources:
  - `POST /v1/sandboxes/{id}/commands`
  - `GET /v1/sandboxes/{id}/commands`
  - `GET /v1/sandboxes/{id}/commands/{commandId}`
  - `GET /v1/sandboxes/{id}/commands/{commandId}/logs`
  - `DELETE /v1/sandboxes/{id}/commands/{commandId}`
- Blocking `/run` now supports `cwd`, per-run `env`, and `timeoutMs`.
- Filesystem operations now include stat, read, write, mkdir, remove, rename,
  artifact upload, and artifact download.
- Routes now support `accessMode: "public"` and `accessMode: "token"`.
- Token routes return a Harakiri proxy URL plus a one-time route token. The
  route token is stored only as a hash.
- Metrics, logs, renew, egress, and registry credential APIs are covered by SDK
  helpers.

## SDK Changes

- Added namespaced helpers:
  - `commands.*`
  - `files.*`
  - `routes.*`
- Added wait helpers:
  - `waitForSandbox`
  - `commands.wait`
- Added typed errors for external adapters:
  - authentication, authorization, validation, not-found, conflict, rate-limit,
    unsupported capability, provider unavailable, timeout, server, and wait
    timeout errors.
- Added outbound access aliases:
  - `getOutboundAccess`
  - `setOutboundAccess`
  - `allowDomains`
  - `denyDomains`
  - `blockOutboundAccess`
  - `testOutboundAccess`

## CLI Changes

- Added or expanded commands for renew, metrics, file operations, tracked
  commands, route delete, route access mode, and egress policy operations.
- `harakiri expose --access token` prints the proxy URL and route token header.

## Migration Notes

- Existing public route creation remains backward compatible. If `accessMode` is
  omitted, Harakiri uses `public`.
- Store route tokens when creating token routes. Later route list calls expose
  only `tokenHint`.
- Use tracked command APIs for long-running servers or agent subprocesses.
  Keep `/run` for short foreground commands.
- Use Harakiri sandbox IDs and command IDs as public integration identifiers.
  Do not persist OpenSandbox IDs.
- Lifecycle now includes capability-gated pause, resume, snapshot, snapshot
  list/delete, and restore from Harakiri `snp_...` IDs. Gate these actions on
  runtime capability state because provider/runtime modes can still differ.
- Credential Vault entries are process-local to the OpenSandbox egress sidecar
  and must be re-injected after Kubernetes-backed pause/resume.
- Large artifact transfer is currently JSON/base64 with a configured size
  limit. Streaming or signed URL transfer remains a future scale-up path.

## Verification

- `pnpm openapi:check`
- `pnpm examples:check`
- `pnpm conformance:sdk`
- `pnpm conformance:cli`
- `pnpm conformance:dev`
- `pnpm smoke:lifecycle`
- `pnpm smoke:lifecycle-persistence`
- hosted browser smoke through `https://sb.harakiri.io`
- Focused shared, API, SDK, and CLI tests documented in the execution plan.
