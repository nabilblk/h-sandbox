# Execution Plan: Deep Agents Preview Release

**Created**: 2026-09-23
**Author**: Codex
**Status**: In Progress
**Priority**: P1
**Estimated effort**: One release session plus external npm setup

## Context

Publish the reviewed framework-first integration and its required TypeScript
SDK improvements. The current npm SDK rc.10 predates the convenience API. The
new adapter has never been published. Source, public documentation, installed
packages and release notes must describe the same availability and limitations.

## Success Criteria

- [ ] Reviewed source and documentation merged after CI.
- [ ] Native adapter and real-model repair evidence from a disposable runner.
- [ ] Matching SDK/CLI prerelease available anonymously, without changing latest.
- [ ] Adapter preview available anonymously with a compatible SDK peer.
- [ ] GitHub release, repository receipt and public changelog report actual evidence.
- [ ] Private research, customer installations and running local services untouched.

## Phases

### Phase 1: Qualification
**Status**: In Progress
- [x] Inspect release guards and current package availability.
- [x] Confirm SDK/CLI trusted publishing exists; new adapter requires npm bootstrap.
- [ ] Commit framework integration and run isolated CI/native acceptance.
- [ ] Record real-model repair and confirmed cleanup evidence.

### Phase 2: Coordinated Publication
**Status**: Not Started
- [ ] Select unused versions and align manifests, installation guides and checks.
- [ ] Extend package verification and adapter publication guards.
- [ ] Merge source and create immutable release tag.
- [ ] Publish and anonymously verify packages and release artifacts.

### Phase 3: Documentation and Closure
**Status**: Not Started
- [ ] Publish factual GitHub notes, public changelog and repository delivery receipt.
- [ ] Record remaining external blockers explicitly, without announcing unpublished packages.
- [ ] Archive only after the requested delivery is complete.

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
| --- | --- | --- | --- |
| 2026-09-23 | Native checks on disposable GitHub-hosted runners only | Preserve running k0s and host processes | Local live acceptance rejected |
| 2026-09-23 | Keep stable npm latest unchanged | This is a developer preview with an exact framework compatibility target | Premature stable promotion rejected |
| 2026-09-23 | No cluster deployment implied | User requests commit, push, release and documentation, not production rollout | Reusing old deployment permissions rejected |

## Tech Debt Incurred

None. New-package npm credentials/trust are an external release dependency,
not grounds to bypass qualification or publish misleading installation steps.

## Completion Notes

Pending. Local npm authentication returned 401; user asked to refresh credentials
locally without sharing secrets in chat. Existing source/contract checks passed
in the preceding implementation session; CI and native evidence remain required.
