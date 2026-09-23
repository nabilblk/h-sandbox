# Execution Plan: Framework-First Deep Agents Experience

**Created**: 2026-09-23
**Author**: Codex
**Status**: Completed
**Priority**: P2
**Estimated effort**: 2-3 hours

## Context

The user expects a recognizable Deep Agents application with a Harakiri backend,
not a shell smoke test presented as an agent integration. Lead with the upstream
framework and a single-file, verified repository-repair example. Three review
findings also require framework-visible termination, truthful search truncation
and cancellation-safe transfer recovery metadata.

Scope is local adapter, examples, documentation and tests. No release, deployment,
cluster operation, model-provider call or customer-project change is authorized.
Do not inspect private research or Brain files.

## Success Criteria

- [x] The first guide example visibly imports Deep Agents and attaches Harakiri.
- [x] One runnable file contains model setup, agent invocation, verification and cleanup.
- [x] Docs distinguish sandbox-backed tools from an agent process hosted inside a sandbox.
- [x] Real framework tool messages disclose abnormal termination and incomplete searches.
- [x] Cancelled batches retain successful paths and the original cancellation cause.
- [x] Installed-package, type, documentation and browser checks pass.

## Phases

### Phase 1: Review Corrections
**Status**: Complete
- [x] Preserve nullable exit codes and add a bounded, framework-visible termination notice.
- [x] Adapt upstream grep without copying its shell implementation or sharing per-call state.
- [x] Preserve transfer metadata on cancellation between files; cover upload and download.
- [x] Add backend and actual-framework regression tests.

### Phase 2: Framework-First Experience
**Status**: Complete
- [x] Consolidate the repair launcher and implementation into one runnable, testable example.
- [x] Lead the public guide with createDeepAgent and the Harakiri backend attachment.
- [x] Put model-free smoke tests and checkpoint recipes after the real-agent workflow.
- [x] Align package, examples and technical docs; test exact displayed code against source.

### Phase 3: Verification
**Status**: Complete
- [x] Run package contracts and installed-consumer checks on Node 20 and 22.
- [x] Run focused docs tests, web build and desktop/mobile browser checks.
- [x] Record evidence and remaining native/model/publication gates; archive this plan.

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
| --- | --- | --- | --- |
| 2026-09-23 | Keep the exact Deep Agents 1.14.0 dependency | Fix the reviewed contract without a broad framework upgrade | Unrelated dependency upgrade |
| 2026-09-23 | Keep agent/model execution in the trusted application | The backend isolates shell and file tools, not arbitrary application callbacks | Implicitly deploying the whole agent into the sandbox |
| 2026-09-23 | Add a fixed-size termination notice outside the log budget | Even a one-byte limit must not conceal abnormal termination; nullable exit codes stay intact | Fabricated numeric exit code, silently clipped status |
| 2026-09-23 | Wrap upstream grep in a per-call delegating backend | Preserve upstream escaping/parsing without shared last-command state or copied scripts | Fork shell implementation, shared mutable truncation flag |

## Tech Debt Incurred

No copied upstream scripts, shared execution state or new dependencies. The
version-specific grep adaptation and upstream generic warning wording are
documented in the technical guide and must be reassessed on framework upgrades.
Native runtime and real-model acceptance remain separate release gates;
deterministic framework tests are not inference evidence.

## Completion Notes

Completed locally on 2026-09-23. The guide leads with the actual framework import
and backend handoff, followed by one 89-line runnable repair example. Tests compare
the displayed program with its source and invoke its real framework graph with
scripted tool decisions. Model-free examples are explicitly secondary.

All three review findings are corrected. Framework ToolMessage regressions cover
empty/clipped timeout and killed results, byte-limited searches and searches where
not even one complete match fits. Backend tests also cover concurrent search
isolation, provider flags, match-count caps, and cancellation after successful
uploads/downloads with the original abort cause.

Final verification:

- Adapter typecheck and strict installed-consumer declaration compilation passed.
- Installed source-tarball checks: 38 tests passed on Node 20.20.2 and Node 22.23.2.
- Web tests: 105 passed; web typecheck passed.
- Production web build and Markdown export passed. The existing main-bundle
  size warning remains; framework dependencies were not added to the web runtime.
- Documentation Playwright suite: 10 passed, including exact code copy/export,
  navigation, keyboard behavior and layouts at 1440, 390 and 320 pixels.
- Agent-browser visual checks: desktop/mobile page layout and the complete repair
  code surface checked; no page overflow or browser errors. The desktop repair
  block fits without horizontal scrolling.
- Executable entry-point guard rejected missing model/template settings before
  any sandbox creation. No real model call or native runtime was used.
- `git diff --check` passed. Browser session closed; the existing local preview
  remains at `http://127.0.0.1:15183/#docs/deepagents`.

No commit, push, package publication, deployment, cluster operation, private
research access or Brain change was performed. Source-candidate availability and
the remaining real-model/native-runtime/publication gates remain explicit.
