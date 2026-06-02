# Capabilities And Limits

This page is the compact runtime contract for OSS integrators. It describes
what applications can rely on without knowing OpenSandbox internals.

## Available

| Capability | Public surface | Notes |
| --- | --- | --- |
| Create sandbox | API, SDK, CLI | Supports templates, env, TTL, wait/async, idempotency keys. |
| List/get/kill | API, SDK, CLI | Harakiri IDs are stable control-plane IDs. |
| Renew TTL | API, SDK, CLI | Extends the running sandbox lease. |
| Blocking command | API, SDK, CLI | Supports cwd, env, stdin, timeout, stdout/stderr. |
| Tracked command | API, SDK, CLI | Supports command IDs, detached mode, status, logs, kill. |
| Filesystem | API, SDK, CLI | List, stat, read, write, mkdir, remove, rename. |
| Artifacts | API, SDK, CLI | Base64 JSON upload/download with size and sha256 validation. |
| Logs | API, SDK, dashboard | Runtime logs plus command-scoped logs. |
| Metrics | API, SDK, CLI, dashboard | Current snapshot and time-series shape. |
| Public routes | API, SDK, CLI, dashboard | Direct OpenSandbox preview URL. |
| Token routes | API, SDK, CLI | Harakiri proxy URL with one-time route token. |
| Outbound access | API, SDK, CLI, dashboard | Open, restricted, blocked, custom; presets and diagnostics. |
| Runtime capabilities | API, SDK, CLI | State plus contract metadata: formal OpenSandbox API, OpenSandbox provider behavior, Harakiri control-plane overlay, unavailable, or unsupported. |
| Templates | API, SDK, CLI, dashboard | OCI images, BuildKit builds, versions, aliases, promotion. |

## Partial

| Capability | Current behavior | Integration guidance |
| --- | --- | --- |
| Large artifacts | JSON base64 transfer is bounded by `SANDBOX_FILE_ARTIFACT_MAX_BYTES`. | Use the current API for small/medium artifacts; plan for signed URLs or streaming later. |
| Interactive terminal | Dashboard terminal exists; SDK PTY streams are not a stable contract. | Use tracked commands for automated workflows. |
| Route access analytics | Labels, creator metadata, token hints, and token-route `lastUsedAt` are stored. Direct public route usage may bypass Harakiri. | Use token routes when the caller needs Harakiri-observed access timestamps. |
| Provider capability display | Runtime capabilities are available through API, SDK, and CLI; richer dashboard degraded-state UX is still evolving. | Read `getRuntimeCapabilities()`, prefer `opensandbox_spec` for portable automation, and handle `HarakiriUnsupportedCapabilityError` plus `HarakiriProviderUnavailableError`. |

## Not V1 Guarantees

- Pause/resume.
- Running sandbox snapshots.
- Organization-authenticated preview routes.
- Unlimited file streaming.
- Direct Kubernetes pod access.
- OpenSandbox-specific IDs as public integration keys.

## Limits To Read From Configuration

- `SANDBOX_MAX_ROUTES_PER_SANDBOX`
- `SANDBOX_MAX_ROUTES_PER_ORG`
- `SANDBOX_FILE_ARTIFACT_MAX_BYTES`
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
