# Execution Plan: Deep Agents TypeScript Integration

**Created**: 2026-09-22
**Author**: Codex
**Status**: Complete (source implementation; external release gates below)
**Priority**: P1
**Estimated effort**: Multiple implementation and verification phases

## Context

The approved milestone is framework-led adoption, not another runtime provider
or a second agent harness. Add an optional Deep Agents sandbox backend over the
Harakiri TypeScript SDK, with a real LangGraph checkpoint/reconnect example.
This plan is based on the current source and published framework contract, not
older active plans. No Brain files, customer projects, running Kubernetes
resources or maintainer credentials are part of this implementation.

Deep Agents 1.14.0 is the inspected npm release. Its BaseSandbox implements the
V2 filesystem contract using execute, uploadFiles and downloadFiles. Reuse it;
do not copy its shell/file implementation. Framework dependencies belong in the
optional integration package, never in the SDK, API, CLI or web runtime.

The improved SDK is still unpublished. This implementation must not claim that
npm rc.10 contains the candidate helpers. Adapter publication, SDK version
alignment, trusted publishing and external native/model acceptance are explicit
delivery gates, not inferred from local tests. Do not publish or deploy from
this implementation session.

## Success Criteria

- [x] A separately packaged, typed adapter implements the pinned upstream
  sandbox contract and uses only the public Harakiri SDK.
- [x] Borrowed sandboxes are never automatically destroyed; owned-task cleanup
  confirms termination and retains both workload and cleanup failures.
- [x] Execution budgets, output truncation, file limits and partial transfer
  failures are explicit. Transport/auth errors never become successful shell
  results or misleading file-not-found results.
- [x] Checkpoint references contain IDs and configuration, not clients or keys.
  Reconnection never implicitly creates a runtime or repeats a command.
- [x] Actual Deep Agents/LangGraph tests, adapter contracts, strict consumer
  compilation and installed-tarball checks run without live service credentials.
- [x] Runnable repository-repair and checkpoint/reconnect examples, package and
  technical docs, and a searchable public integration guide agree on availability.
- [x] Verification evidence distinguishes fixtures, native runtime and real-model
  execution. No production or customer deployment is modified.

## Phases

### Phase 1: Contract and Architecture
**Status**: Complete
- [x] Inspect SDK, packaging, CI and public-doc conventions.
- [x] Inspect upstream docs and exact Deep Agents 1.14.0 package declarations.
- [x] Record public API, ownership, bounds and version/distribution decisions.

### Phase 2: Adapter and Ownership
**Status**: Complete
- [x] Add optional package, exports, declarations and dependency boundaries.
- [x] Implement execution and verified buffered file transfers via the SDK.
- [x] Implement borrowed backend and explicit owned-task helper with honest
  cancellation, reconnection and cleanup behavior.
- [x] Cover errors, isolation-by-handle, output bounds and transfer integrity.

### Phase 3: Framework and Consumer Acceptance
**Status**: Complete (local contracts; external acceptance is a release gate)
- [x] Run the actual framework with deterministic model/API fixtures.
- [x] Test LangGraph interruption, checkpoint serialization and backend reconnect.
- [x] Pack/install into an isolated consumer and compile public examples.
- [x] Add CI coverage and an explicit opt-in native acceptance path.

### Phase 4: Examples and Documentation
**Status**: Complete
- [x] Repository-repair example with independent verification and cleanup.
- [x] Checkpoint/reconnect example with application-owned identity mapping.
- [x] Package README, architecture/compatibility/operations documentation.
- [x] Public integration guide, navigation, exports and documentation tests.

### Phase 5: Verification and Delivery Boundary
**Status**: Complete
- [x] Run focused adapter, SDK, declaration, packaging and web checks.
- [x] Verify public-doc layout/navigation with a local browser.
- [x] Review changes for unintended dependencies, secrets and lifecycle hazards.
- [x] Record results and remaining publication/native/model gates accurately.

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
| --- | --- | --- | --- |
| 2026-09-22 | TypeScript Deep Agents first | Uses the existing SDK and a concrete published sandbox extension point | Full Python SDK first; broad framework wrappers |
| 2026-09-22 | Extend upstream BaseSandbox | Avoid maintaining a second file-tool implementation | Copy scripts; implement an agent harness |
| 2026-09-22 | Borrowed backend, explicit owned-task helper | Checkpointed/shared lifetimes must not be ended implicitly | Backend automatically owns every connected sandbox |
| 2026-09-22 | Keep distribution as a labelled source candidate until coordinated release | Current npm SDK does not contain the new file/cleanup helpers | Incorrect rc.10 peer support; duplicate the SDK transport in the adapter |
| 2026-09-22 | Align Zod at 4.4.3 in the fixture | Mixed Zod peers instantiated two nominally distinct LangGraph Command types | Cast away the consumer type error |
| 2026-09-22 | Use SDK status polling directly on reconnect | The first status request must be inside the polling deadline | Unbounded preliminary process-connect GET |

## Tech Debt Incurred

Upstream BaseSandbox file edits are read/modify/write, not
atomic concurrent edits. Framework checkpoints do not make shell submissions
exactly-once, and a working directory is not a filesystem security boundary.
The SDK transport controls deadlines for submission, final logs and files;
the adapter's observationTimeoutMs bounds status polling only. These limits are
publicly documented rather than hidden behind an unabortable Promise.race.

## Completion Notes

Implemented 2026-09-22. Optional `@h-sandbox/deepagents` package, no core SDK or
server runtime changes; real upstream BaseSandbox; scoped command recovery;
verified file transfers; owned-task cleanup; repair and checkpoint examples;
technical/package docs; public Integrations guide with shared syntax highlighting,
Markdown export, navigation and copy checks; isolated Node 20/22 CI consumer job.

Evidence collected locally:

- Strict adapter, example and web type checks passed.
- Packed SDK plus adapter installed into temporary consumers: 29 tests passed
  on Node 20.20.2 and 22.23.2. Public examples and exact displayed programs also
  passed strict declaration compilation. Framework decisions/API were fixtures.
- SDK regression: 95 passed. CLI regression: 83 passed. Web: 105 passed.
- Playwright docs: 10 passed, including all public pages at 1440/390/320px,
  copied code/export equality, navigation and no page-width overflow.
- Agent-browser desktop/mobile screenshots visually inspected; new tables were
  corrected to the existing docs-data-table component style. No browser errors.
- Web production build passed; the existing >500kB main-chunk advisory remains.
- Frozen lockfile install and public-package assertions passed. Dependency audit
  reported no known vulnerabilities. Gitleaks 8.30.1 passed a whitelist of the
  33 changed/new implementation files; unrelated private material was excluded.
- Opt-in native runner refused to proceed without explicit acknowledgement.

One web test attempt overlapped the SDK's clean build and saw missing dist files;
the sequential rerun passed all 105 tests. No product change was made to hide that
test orchestration race. One search assertion was corrected to require discovery,
not first-result ranking, because the SDK guide also mentions LangGraph.

Not performed or claimed: live sandbox/native Linux acceptance, real-model
inference, persistent-checkpointer process-restart proof, registry publication,
GitHub CI execution, push or deployment. Existing clusters, host processes,
customer repositories and Brain files were untouched. Only an isolated local
documentation preview was started; browser test processes were closed.

Before release, run the opt-in native and selected-model examples on an isolated
test installation, align the new SDK/adapter versions and npm trusted publishing,
remove the package's private release guard, verify published consumers, then
update the candidate installation guidance. The operational checklist lives in
`docs/integrations/deepagents.md`; these delivery gates are not silently marked
complete by archiving this implementation plan.
