# Execution Plan: Native Provider File Transfers

**Created**: 2026-10-01
**Author**: Codex
**Status**: Completed (qualified PR preparation only)
**Priority**: {P0-P3}
**Estimated effort**: 1-2 days including isolated native acceptance

## Context

Python candidate PR [#66](https://github.com/nabilblk/h-sandbox/pull/66)
reproduced a public API `502 runtime_files_unavailable` uploading a valid 1 MiB
artifact against published server `0.5.0-rc.10`. Small uploads pass. The existing
Harakiri provider embeds base64 bytes in one shell command, making the transfer
subject to operating-system argument limits. This is a provider bridge issue,
not a Python-specific transport requirement.

Review also reproduced a related large-download defect: command-event parsing
inserts newlines between stdout chunks, corrupting canonical base64. Native
binary download is part of the same complete file round-trip fix. Artifact
downloads pass their existing byte ceiling into the provider and reject/cancel
oversized responses before buffering the whole file; ordinary text reads retain
their existing contract.

The user authorized a separate provider-fix PR and disposable GitHub-hosted
acceptance. No merge, publication, lab deployment, or local cluster operation is
authorized. The original Python worktree and user-owned files stay untouched.

## Success Criteria

- [x] Reproduce and identify the command-size failure without exposing secrets.
- [x] Upload bytes through OpenSandbox's native multipart endpoint, retaining
  Harakiri's public API, path normalization, parent-creation option, modes,
  atomic target replacement, and typed errors.
- [x] No payload bytes in shell arguments; no dependency on Kubernetes exec.
- [x] Regression tests cover binary/UTF-8, empty and large files, errors,
  temporary-file cleanup, authentication/routing, and mutation retry safety.
- [x] Native amd64 public-API round trips pass at 1 MiB and the advertised
  16 MiB boundary, with byte counts/checksums and existing-file preservation.
- [x] A separate PR records exact candidate identity and sanitized acceptance
  evidence; no claim that the unchanged published baseline has been fixed.

## Phases

### Phase 1: Diagnose and Define Compatibility
**Status**: Complete
- [x] Create a dedicated worktree/branch from `main`, outside Python PR #66.
- [x] Inspect file service/provider and pinned execd `v1.1.0` upload source.
- [x] Reproduce oversized shell argument failure and define regression assertions.

### Phase 2: Provider Fix and Hermetic Tests
**Status**: Complete
- [x] Use native multipart transfer into a private same-filesystem staging file.
- [x] Retain short commands for preparation, permissions, atomic replacement,
  metadata, and cleanup; never interpolate payloads into commands.
- [x] Test success, failure, parent/mode/path handling, and no ambiguous replay.
- [x] Run provider, service, route, boundary tests and API typecheck.

### Phase 3: Native Qualification and PR
**Status**: Complete
- [x] Add a focused runner-only acceptance entrypoint using existing ownership
  guards and immutable published dependencies; build/load only the candidate API.
- [x] Prove baseline failure then candidate 1 MiB/16 MiB public-API success,
  replacement and error semantics, key revocation, and owned-resource cleanup.
- [x] Push the separate branch/PR and run isolated GitHub acceptance.
- [x] Document evidence and link the Python release prerequisite to this PR.

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-10-01 | Fix the provider, not the Python SDK | All SDKs use the same file API; payload-to-command conversion is below that contract. | Python shell chunking, reduced artifact limit. |
| 2026-10-01 | Stage native uploads beside the destination, then rename | Native execd creates parents and truncates destinations directly; staging preserves Harakiri's semantics and atomic replacement. | Upload directly to the final path. |
| 2026-10-01 | Keep published dependencies and candidate API identities distinct | Qualification must not pretend a source fix is already released. | Republishing/deploying before review. |
| 2026-10-01 | Use native binary downloads as well as multipart uploads | A 1 MiB command output split into 171 valid events acquired 170 artificial newlines. Generic command parsing must not encode file transfer semantics. | Stripping base64 whitespace or modifying shared command output handling. |
| 2026-10-01 | Use a private temporary symlink only for paths containing `$` | Pinned execd expands environment variables in native paths; Harakiri paths are literal. The alias preserves the actual location and same-filesystem staging without changing runtime environment variables. | Rejecting valid filenames, an upstream image patch, cross-filesystem temporary copies. |

## Source Evidence

- [Python native failure](https://github.com/nabilblk/h-sandbox/actions/runs/36873196244).
- [Pinned execd upload implementation](https://github.com/opensandbox-group/OpenSandbox/blob/48b0215f1bd097b31d0f022a44640e00c11ac49d/components/execd/pkg/web/controller/filesystem_upload.go).
- [Pinned file metadata contract](https://github.com/opensandbox-group/OpenSandbox/blob/48b0215f1bd097b31d0f022a44640e00c11ac49d/components/execd/pkg/web/model/filesystem.go).
- [Pinned path expansion](https://github.com/opensandbox-group/OpenSandbox/blob/48b0215f1bd097b31d0f022a44640e00c11ac49d/components/execd/pkg/util/pathutil/path.go).
- The `opensandbox-files.ts` Git blob is identical in published rc.9, published
  rc.10 and pre-fix main: `67c829e3f00e1187d9274e72ba110327283891ab`.
- Local hermetic reproduction: a 1 MiB base64 command argument fails with `E2BIG`.
  Provider tests now assert every generated command stays below 8 KiB for the
  same payload and a 16 MiB payload. Final local API suite: 373 passed,
  9 environment-dependent skips; acceptance contracts: 28 passed; API typecheck
  passed. Linux filesystem contracts passed on the native runners.
- Provider PR: [#67](https://github.com/nabilblk/h-sandbox/pull/67).
- Final implementation: `2cd66c1613152e47d7f861a996ba7499638df469`.
  [Native run 36888651066](https://github.com/nabilblk/h-sandbox/actions/runs/36888651066)
  passed against synthetic PR merge `3ecff37bfcd08b4c991c78d2c3eb7e15f02b889b`.
  [Standard CI](https://github.com/nabilblk/h-sandbox/actions/runs/36888651136)
  also passed. The [sanitized receipt](../../release-notes/evidence/provider-file-transfer-2026-10-01.json)
  preserves baseline failure, candidate identity, all four round-trip checksums,
  byte ceilings, literal paths and successful resource/credential cleanup.

## Tech Debt Incurred

Public transfers retain the existing buffered JSON/base64 contract. A process
crash or unreachable provider can leave temporary staging files or path aliases;
retained workspaces may require later cleanup. No crash-time garbage collector
or distributed write transaction is claimed. These limits are documented in
the [unreleased candidate note](../../release-notes/provider-file-transfer.md).

## Completion Notes

Prepared the separate provider fix and verified it on a disposable GitHub-hosted
amd64 cluster. The same runtime that rejected a 1 MiB baseline upload completed
exact uploads/downloads through the 16 MiB limit after loading the source API
candidate. Native, Linux filesystem, hermetic transport, service and CI checks
passed, including fixture cleanup and key revocation.

The scoped task ends at review-ready PR preparation. No merge, publication or
lab deployment was performed, and the original Python worktree was untouched.
After separately authorized merge and server release, pin Python PR #66 to the
corrected immutable manifest and rerun its full native SDK/framework acceptance.
