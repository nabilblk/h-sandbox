# Execution Plan: Premium Integration 07 Filesystem And Artifacts

**Created**: 2026-06-03
**Author**: Codex
**Status**: Completed
**Priority**: {P0-P3}
**Estimated effort**: 1-2 engineering weeks

## Context
Harakiri supports list, stat, read, write, mkdir, remove, rename, and base64
artifact upload/download. This is enough for small agent workflows, but a
top-tier integration surface needs stronger behavior around binary artifacts,
large file limits, path safety, directory traversal, checksums, transfer
progress, and clear fallbacks when OpenSandbox filesystem APIs are degraded.

The goal is to harden the generic filesystem contract, not to optimize for a
single downstream project.

## Success Criteria
- [x] Filesystem APIs have documented limits, path safety rules, encoding rules,
      overwrite behavior, create-parent behavior, and error codes.
- [x] Artifact APIs advertise a reliable v1 transfer mode, decoded size limit,
      and checksum contract; large streaming is recorded as future scale-up.
- [x] SDK and CLI expose ergonomic upload/download helpers with checksum
      validation.
- [x] Dashboard filesystem view handles directories, files, empty folders,
      loading, errors, binary files, and large files cleanly.
- [x] Provider degraded states are visible and do not silently return fake data.
- [x] Tests cover text, binary, nested paths, missing files, directory errors,
      large artifact limits, and checksum mismatch.

## Phases

### Phase 1: Contract And Limits
**Status**: Complete
- [x] Audit current filesystem and artifact APIs, SDK helpers, CLI commands,
      dashboard UI, and provider fallback behavior.
- [x] Define path normalization and rejection rules.
- [x] Define artifact size tiers and whether v1 should use streaming,
      multipart, signed URLs, or an increased base64 limit.
- [x] Define provider metadata and warning fields for degraded filesystem
      behavior.

### Phase 2: API And Provider Improvements
**Status**: Complete
- [x] Add or refine API schemas for upload/download transfer modes.
- [x] Add checksum validation and consistent error codes.
- [x] Add directory listing pagination or limits if needed.
- [x] Ensure provider fallbacks are observable and never presented as a perfect
      first-class listing if degraded.
- [x] Keep all runtime filesystem operations behind provider interfaces.

### Phase 3: SDK, CLI, And UI
**Status**: Complete
- [x] Add SDK helpers for binary-safe upload/download and progress-friendly
      transfer where supported.
- [x] Add CLI upload/download commands that work with local paths and stdout.
- [x] Improve dashboard filesystem UX for empty directories, binary files,
      breadcrumbs, refresh, error states, and large-file warnings.
- [x] Ensure no UI text overlaps or horizontal overflow appears in filesystem
      tables.

### Phase 4: Documentation And Verification
**Status**: Complete
- [x] Update SDK, CLI, API, website, and capabilities docs.
- [x] Add test fixtures for text, binary, nested, empty, and too-large files.
- [x] Run live k0s filesystem smoke with an OpenSandbox-backed sandbox.
- [x] Run typecheck/build/OpenAPI checks and `git diff --check`.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-06-03 | Treat artifacts as a first-class integration surface beyond base64 JSON | Real projects need reliable transfer of archives, generated outputs, and binary artifacts. | Leave artifact movement as small base64 payloads; tell users to run their own upload server inside the sandbox; use Kubernetes file copy. |
| 2026-06-04 | Keep v1 artifact transfer on explicit `json-base64` metadata with a 16 MiB decoded default | OpenSandbox currently exposes file operations through provider APIs, and the safest portable contract is checksum-verified JSON/base64 with a declared limit. | Introduce a Harakiri-managed object-store signed URL path now; stream through Kubernetes exec; silently accept unbounded JSON payloads. |
| 2026-06-04 | Add `artifacts.*` SDK aliases while retaining `files.upload/download` compatibility | Integrators need a clearer semantic namespace for binary transfer without breaking existing callers. | Rename existing methods only; keep artifacts hidden under generic file helpers. |

## Tech Debt Incurred
None incurred. Large streaming or signed transfer URLs remain future scale-up
work pending a provider contract that can support them cleanly.

## Completion Notes
Implemented the filesystem/artifact hardening pass without crossing the
OpenSandbox provider boundary. API upload/download responses now advertise
`transfer.mode=json-base64`, `transfer.encoding=base64`, and `transfer.maxBytes`.
CLI upload/download verifies SHA-256 against local bytes, SDK exposes
`artifacts.upload/download`, the dashboard Files tab shows provider source and
warnings, and documentation now has a dedicated filesystem/artifacts contract.

Verification completed with API, SDK, CLI, web docs, shared OpenAPI tests,
OpenAPI regeneration/check, full typecheck, web production build, `git diff
--check`, k0s deployment, local port-forward restart, live
`pnpm smoke:filesystem`, and browser docs verification.
