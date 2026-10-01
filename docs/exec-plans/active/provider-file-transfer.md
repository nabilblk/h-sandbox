# Execution Plan: Native Provider File Transfers

**Created**: 2026-10-01
**Author**: Codex
**Status**: In Progress
**Priority**: P1 (Python qualification prerequisite)
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
acceptance. No merge, publication, deployment, or local cluster operation is
authorized. The original Python worktree and user-owned files stay untouched.

## Success Criteria

- [x] Reproduce and identify the command-size failure without exposing secrets.
- [x] Upload bytes through OpenSandbox's native multipart endpoint, retaining
  Harakiri's public API, path normalization, parent-creation option, modes,
  atomic target replacement, and typed errors.
- [x] No payload bytes in shell arguments; no dependency on Kubernetes exec.
- [x] Regression tests cover binary/UTF-8, empty and large files, errors,
  temporary-file cleanup, authentication/routing, and mutation retry safety.
- [ ] Native amd64 public-API round trips pass at 1 MiB and the advertised
  16 MiB boundary, with byte counts/checksums and existing-file preservation.
- [ ] A separate PR records exact candidate identity and sanitized acceptance
  evidence; no claim that the unchanged published baseline has been fixed.

## Phases

### Phase 1: Diagnose and Define Compatibility
**Status**: Complete
- [x] Create a dedicated worktree/branch from `main`, outside Python PR #66.
- [x] Inspect file service/provider and pinned execd `v1.1.0` upload source.
- [x] Reproduce oversized shell argument failure and define regression assertions.

### Phase 2: Provider Fix and Hermetic Tests
**Status**: Complete locally; GNU/Linux filesystem cases await CI
- [x] Use native multipart transfer into a private same-filesystem staging file.
- [x] Retain short commands for preparation, permissions, atomic replacement,
  metadata, and cleanup; never interpolate payloads into commands.
- [x] Test success, failure, parent/mode/path handling, and no ambiguous replay.
- [x] Run provider, service, route, boundary tests and API typecheck.

### Phase 3: Native Qualification and PR
**Status**: In Progress
- [x] Add a focused runner-only acceptance entrypoint using existing ownership
  guards and immutable published dependencies; build/load only the candidate API.
- [ ] Prove baseline failure then candidate 1 MiB/16 MiB public-API success,
  replacement and error semantics, key revocation, and owned-resource cleanup.
- [ ] Push the separate branch/PR and run isolated GitHub acceptance.
- [ ] Document evidence and link the Python release prerequisite to this PR.

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-10-01 | Fix the provider, not the Python SDK | All SDKs use the same file API; payload-to-command conversion is below that contract. | Python shell chunking, reduced artifact limit. |
| 2026-10-01 | Stage native uploads beside the destination, then rename | Native execd creates parents and truncates destinations directly; staging preserves Harakiri's semantics and atomic replacement. | Upload directly to the final path. |
| 2026-10-01 | Keep published dependencies and candidate API identities distinct | Qualification must not pretend a source fix is already released. | Republishing/deploying before review. |
| 2026-10-01 | Use native binary downloads as well as multipart uploads | A 1 MiB command output split into 171 valid events acquired 170 artificial newlines. Generic command parsing must not encode file transfer semantics. | Stripping base64 whitespace or modifying shared command output handling. |

## Source Evidence

- [Python native failure](https://github.com/nabilblk/h-sandbox/actions/runs/36873196244).
- [Pinned execd upload implementation](https://github.com/opensandbox-group/OpenSandbox/blob/48b0215f1bd097b31d0f022a44640e00c11ac49d/components/execd/pkg/web/controller/filesystem_upload.go).
- [Pinned file metadata contract](https://github.com/opensandbox-group/OpenSandbox/blob/48b0215f1bd097b31d0f022a44640e00c11ac49d/components/execd/pkg/web/model/filesystem.go).
- Local hermetic reproduction: a 1 MiB base64 command argument fails with `E2BIG`.
  Provider tests now assert every generated command stays below 8 KiB for the
  same payload and a 16 MiB payload. Focused provider/service/route/boundary suite:
  82 passed; safety/acceptance contracts: 16 passed; API typecheck passed.
- Initial full API suite: 361 passed, 9 environment-dependent skips. Linux
  filesystem contracts passed on the first native runner's hermetic test step.
- Draft provider PR: [#67](https://github.com/nabilblk/h-sandbox/pull/67).

## Tech Debt Incurred

None identified yet. This work does not promise streamed public transfers or
change the existing buffered JSON/base64 artifact contract.

## Completion Notes

Pending implementation and isolated acceptance. Python publication remains
blocked until the provider fix is qualified and made available in a server release.
