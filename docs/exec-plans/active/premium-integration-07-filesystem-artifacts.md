# Execution Plan: Premium Integration 07 Filesystem And Artifacts

**Created**: 2026-06-03
**Author**: Codex
**Status**: Not Started
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
- [ ] Filesystem APIs have documented limits, path safety rules, encoding rules,
      overwrite behavior, create-parent behavior, and error codes.
- [ ] Artifact APIs support reliable medium-to-large transfers through either
      streaming, multipart, or signed transfer URLs.
- [ ] SDK and CLI expose ergonomic upload/download helpers with checksum
      validation.
- [ ] Dashboard filesystem view handles directories, files, empty folders,
      loading, errors, binary files, and large files cleanly.
- [ ] Provider degraded states are visible and do not silently return fake data.
- [ ] Tests cover text, binary, nested paths, missing files, directory errors,
      large artifact limits, and checksum mismatch.

## Phases

### Phase 1: Contract And Limits
**Status**: Not Started
- [ ] Audit current filesystem and artifact APIs, SDK helpers, CLI commands,
      dashboard UI, and provider fallback behavior.
- [ ] Define path normalization and rejection rules.
- [ ] Define artifact size tiers and whether v1 should use streaming,
      multipart, signed URLs, or an increased base64 limit.
- [ ] Define provider metadata and warning fields for degraded filesystem
      behavior.

### Phase 2: API And Provider Improvements
**Status**: Not Started
- [ ] Add or refine API schemas for upload/download transfer modes.
- [ ] Add checksum validation and consistent error codes.
- [ ] Add directory listing pagination or limits if needed.
- [ ] Ensure provider fallbacks are observable and never presented as a perfect
      first-class listing if degraded.
- [ ] Keep all runtime filesystem operations behind provider interfaces.

### Phase 3: SDK, CLI, And UI
**Status**: Not Started
- [ ] Add SDK helpers for binary-safe upload/download and progress-friendly
      transfer where supported.
- [ ] Add CLI upload/download commands that work with local paths and stdout.
- [ ] Improve dashboard filesystem UX for empty directories, binary files,
      breadcrumbs, refresh, error states, and large-file warnings.
- [ ] Ensure no UI text overlaps or horizontal overflow appears in filesystem
      tables.

### Phase 4: Documentation And Verification
**Status**: Not Started
- [ ] Update SDK, CLI, API, website, and capabilities docs.
- [ ] Add test fixtures for text, binary, nested, empty, and too-large files.
- [ ] Run live k0s filesystem smoke with an OpenSandbox-backed sandbox.
- [ ] Run typecheck/build/OpenAPI checks and `git diff --check`.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-06-03 | Treat artifacts as a first-class integration surface beyond base64 JSON | Real projects need reliable transfer of archives, generated outputs, and binary artifacts. | Leave artifact movement as small base64 payloads; tell users to run their own upload server inside the sandbox; use Kubernetes file copy. |

## Tech Debt Incurred
None planned.

## Completion Notes
Fill in when complete.
