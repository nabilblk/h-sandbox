# Capabilities And Limits

This page is the compact runtime contract for OSS integrators. It describes
what applications can rely on without knowing OpenSandbox internals.

## Available

| Capability | Public surface | Notes |
| --- | --- | --- |
| Create sandbox | API, SDK, CLI | Supports templates, env, TTL, wait/async, idempotency keys. |
| List/get/kill | API, SDK, CLI | Harakiri IDs are stable control-plane IDs. |
| Renew TTL | API, SDK, CLI | Extends the running sandbox lease. |
| Pause/resume | API, SDK, CLI | Capability-gated provider lifecycle operations. |
| Snapshot/restore | API, SDK, CLI | Create/list/get/delete Harakiri `snp_...` snapshots and restore with `createSandbox({ snapshotId })`. |
| Blocking command | API, SDK, CLI | Supports cwd, env, stdin, timeout, stdout/stderr. |
| Detached process | API, SDK, CLI, dashboard | Supports command IDs, detached mode, wait, tail, status, finish reason, logs, and kill. |
| Filesystem | API, SDK, CLI | List, stat, read, write, mkdir, remove, rename. |
| Artifacts | API, SDK, CLI | JSON/base64 upload/download with advertised transfer metadata, decoded size, and sha256 validation. |
| Logs | API, SDK, dashboard | Runtime logs plus command-scoped logs. |
| Metrics | API, SDK, CLI, dashboard | Current snapshot and time-series shape. |
| Public routes | API, SDK, CLI, dashboard | Direct OpenSandbox preview URL. |
| Token routes | API, SDK, CLI, dashboard | Harakiri proxy URL with one-time route token shown only on creation. |
| Outbound access | API, SDK, CLI, dashboard | Open, restricted, blocked, custom; presets and diagnostics. |
| Runtime metadata | API, SDK, CLI, dashboard | Workdir, user, shell, template version/digest, ports, route defaults, egress mode, limits, TTL, and provider capability states on sandbox summaries. |
| Runtime capabilities | API, SDK, CLI | State plus contract metadata: formal OpenSandbox API, OpenSandbox provider behavior, Harakiri control-plane overlay, unavailable, or unsupported. |
| Templates | API, SDK, CLI, dashboard | OCI images, BuildKit builds, versions, aliases, promotion. |

## Partial

### Unreleased Phase 2B Preview

Matching source builds add organization-owned persistent workspaces and command
event streams through API/SDK/CLI/dashboard. These are **not included in 0.4.0**.
Workspace allocation requires operator opt-in, retained native PVC support and
disabled runtime fallback. One sandbox owns a workspace; archive retains files
and quota. Snapshot/restore with workspaces is rejected. Command events are an
authenticated polling overlay over retained provider logs, not durable replay.
See [workspace limits and acceptance](../persistent-workspaces.md).

### Existing Partial Capabilities

| Capability | Current behavior | Integration guidance |
| --- | --- | --- |
| Large artifacts | `transfer.mode=json-base64` is bounded by `SANDBOX_FILE_ARTIFACT_MAX_BYTES`. | Use the current API for small/medium artifacts; plan for signed URLs or streaming later. |
| Interactive terminal | Dashboard terminal exists; SDK PTY streams are not a stable contract. | Use tracked commands for automated workflows. |
| Route access analytics | Labels, creator metadata, token hints, and token-route `lastUsedAt` are stored. Direct public route usage may bypass Harakiri. | Use token routes when the caller needs Harakiri-observed access timestamps. |
| Provider capability display | Runtime capabilities are available through API, SDK, and CLI; richer dashboard degraded-state UX is still evolving. | Read `getRuntimeCapabilities()`, prefer `opensandbox_spec` for portable automation, and handle `HarakiriUnsupportedCapabilityError` plus `HarakiriProviderUnavailableError`. |

## Not V1 Guarantees

- Organization-authenticated preview routes.
- Unlimited file streaming.
- Direct Kubernetes pod access.
- OpenSandbox-specific IDs as public integration keys.

## Limits To Read From Configuration

- `SANDBOX_MAX_ROUTES_PER_SANDBOX`
- `SANDBOX_MAX_ROUTES_PER_ORG`
- `SANDBOX_FILE_ARTIFACT_MAX_BYTES`
- `SANDBOX_COMMAND_TIMEOUT_MS`
- `SANDBOX_RUNTIME_USER`
- `SANDBOX_RUNTIME_SHELL`
- `SANDBOX_ROUTE_DEFAULT_ACCESS_MODE`
- Template CPU, memory, port, build context, and build concurrency limits.

## Recommended External App Flow

1. Create a sandbox with an idempotency key.
2. Wait until `running` or `idle`.
3. Write project files.
4. Run setup commands.
5. Start long-running processes as detached commands.
6. Expose previews with `accessMode: "token"` unless public access is intended.
7. Apply restricted outbound access when the workflow is known.
8. Poll command status and fetch command logs.
9. Download artifacts.
10. Renew while active, then kill and delete route references on cleanup.
