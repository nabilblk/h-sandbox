# Execution Plan: Sandbox Workbench

**Created**: 2026-10-15
**Author**: Codex with project maintainer
**Status**: Review fixes and release qualification in progress
**Priority**: P1 (next milestone selected by maintainer)
**Estimated effort**: Multi-session feature and acceptance work

## Context

The October 14 comparison with E2B found that Harakiri's existing command,
filesystem, credential and lifecycle APIs exceed what its dashboard exposes.
The terminal strips terminal control sequences, files cannot be inspected or
downloaded, runtime logs load once, and failed metrics reads can look current.
Complete the developer loop without building an IDE or agent orchestrator.

Baseline: main 981e790. Derive implementation from current code, not older plans.
Do not touch docs/cot, Brain or customer installations. On October 16 the
maintainer authorized review, correction, merge, deployment and release. Use a
dedicated PR, isolated hosted acceptance and a guarded Helm upgrade of the
existing k0s lab, preserving operator values, secrets and unrelated workloads.

## Success Criteria
- [x] Browser terminal faithfully handles raw keys, ANSI/VT output, resize,
      disconnect and explicit reconnection with bounded memory and cleanup.
- [x] Developers can inspect safe file previews and upload/download checked
      artifacts with cancellation, explicit limits and no silent overwrite.
- [x] Runtime logs support refresh, follow, search and source/level filters;
      snapshots and retention limits are not presented as a durable event log.
- [x] Metrics never substitute cached observations or unavailable counters for
      current measured values. Loading, failure and observation time are explicit.
- [x] Overview exposes readiness, commands, expiry, workspace, capacity and
      provider capabilities with useful links and actionable failures.
- [x] Tab/command deep links survive refresh and navigation; CLI inspection and
      setup validation use public control-plane APIs and never Kubernetes exec.
- [x] Focused contracts/unit/browser tests pass, including mobile layouts,
      stale-response races, cancellation, denied access and untrusted output.
- [x] Technical/public documentation describes delivered behavior and limits.
- [ ] Native acceptance and independent developer acceptance are recorded
      separately from fixture tests, without unapproved lab operations.

## Scope And Boundaries

- Reuse runtime provider, auth, one-time terminal tickets, commands, file artifact
  integrity checks, readiness and capability contracts. No credential shortcuts.
- Use xterm.js, lazy-loaded for the terminal pane, not a homegrown emulator.
- Text previews render as text; no HTML/SVG execution or same-origin iframe.
- Keep bounded JSON/base64 transfers for this milestone. Stage indicators are
  not fabricated network-progress percentages; cancellation does not undo an
  upload already accepted by the server.
- Unknown remote command outcomes are not automatically retried. Reconnection
  does not promise persistence of an old PTY session.
- Lifecycle webhooks, OTLP export, large streaming artifacts, new providers,
  memory-fork/auto-resume and additional frameworks remain separate milestones.

## Phases

### Phase 1: Contracts And Structure
**Status**: Complete locally
- [x] Inspect current routes, browser fixtures, API contracts and provider metrics.
- [x] Extract focused workbench panes and small testable transport/file helpers.
- [x] Define backwards-compatible measured-metric metadata and explicit failure.
- [x] Add strict tab/command deep-link parsing and tests.

### Phase 2: Interactive Terminal
**Status**: Implemented; fixture acceptance passed
- [x] Pin xterm and fit addon; lazy-load without affecting public page bundles.
- [x] Handle binary framing, UTF-8, keyboard, resize, bounded output and disposal.
- [x] Retain ticket authorization and require explicit reconnection after loss.
- [x] Cover real emulator behavior with a fixture WebSocket in Playwright.

### Phase 3: Files And Results
**Status**: Complete locally
- [x] Directory navigation and bounded non-executable preview.
- [x] Upload/download with size/checksum validation and abort handling.
- [x] Explicit overwrite approval, unknown upload outcomes and safe filenames.
- [x] Test binary round trips, hostile content, large files and navigation races.

### Phase 4: Diagnosis
**Status**: Complete locally
- [x] Bounded, non-overlapping log following with filters and error recovery.
- [x] Truthful metrics with available-field metadata and observation time.
- [x] Overview and deep links to relevant commands, policy and runtime panes.
- [x] Preserve existing navigation, capacity and permission behavior.

### Phase 5: UI And CLI Continuity
**Status**: Implemented; CLI tests passed
- [x] Copyable workbench/command links and public-API CLI inspection.
- [x] Read-only CLI setup checks with useful failures and machine-readable output.
- [x] Tests for invalid configuration, missing permissions and unavailable services.

### Phase 6: Documentation And Local Verification
**Status**: Complete locally
- [x] Update technical and public workbench documentation, CLI reference and limits.
- [x] Run typechecks, focused API/web/CLI tests and package contract checks.
- [x] Run fixture browser tests at desktop/mobile sizes and inspect screenshots.
- [x] Record exact results, unresolved limitations and release scope.

### Phase 7: Native And Independent Acceptance
**Status**: Authorized October 16; runner harness ready for CI
- [x] Request approval for disposable-runner native acceptance when local checks pass.
- [x] Add source API/web installation and sanitized native browser receipts with
      ownership-guarded cleanup; 27 hermetic harness checks passed.
- [ ] Prove interactive tool, transfer, denial diagnosis, observer recovery and cleanup.
- [ ] Record independent developer acceptance without treating CI as adoption.
- [ ] Release/deploy only on explicit instruction; archive only when accepted scope is complete.

## Review Follow-Up (October 16)

- Reproduced stale file previews after directory refresh and deletion in a new
  browser regression; bind preview selection to the current listing and reload
  content after refresh.
- Reproduced stale deep-linked command status outside the recent list; refresh
  the selected command through its canonical endpoint, cancel obsolete reads and
  expose abnormal finish reasons alongside nullable exit codes.
- Add the Workbench spec to the mandatory browser CI job. Previous local success
  was not continuous coverage.
- Fix stalled token refresh ignoring caller cancellation: snapshot and transfer
  deadlines now reject the caller's authentication wait without cancelling the
  shared Keycloak refresh or sending a late request. Cover initial and forced
  token-refresh paths with unit regressions.
- Native acceptance and independent adoption remain distinct. Automated native
  evidence does not substitute for an external developer's experience.
- The first CI pass exposed an independent-version test bug: adapter consumers
  installed core rc.13 despite their exact rc.12 peer. Consumer CI now uses the
  declared published peer; native framework tests have a separate consumer and
  record that SDK version. No peer override or adapter compatibility change.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-10-15 | Use existing public API/provider boundary | Keep one authorization and execution contract | Direct cluster access (rejected) |
| 2026-10-15 | xterm.js with official fit addon | Existing PTY requires a real emulator; maintained upstream implementation | Extend stripped-text terminal (rejected) |
| 2026-10-15 | Explicit bounded transfer stages | Existing transport is buffered JSON, not streaming | Invented percentage or unqualified new transport (rejected) |
| 2026-10-15 | Local isolated fixture testing first | Protect running host and k0s workloads | Live destructive testing (rejected) |
| 2026-10-15 | Extend status and add read-only doctor | Reuse the existing CLI workflow without another inspection abstraction | New SDK diagnostic facade (not needed) |
| 2026-10-15 | Retain legacy metric wire fields with measured-field metadata | Older consumers can still parse responses; new readers do not call placeholders measurements | Breaking nullable-field migration (deferred) |

## Tech Debt Incurred
Legacy numeric disk/network placeholders remain in the metrics wire contract for
compatibility. New UI/CLI readers rely on availableFields. Older clients must be
upgraded before assuming those fields are measured. Existing buffered-transfer
and provider log-retention limits remain explicit. The production build still
warns about the main application's >500 kB chunk; terminal JS (335 kB, 85 kB
gzip) and CSS are separately lazy-loaded, not added to initial page loading.

## Completion Notes
Local implementation and verification completed on 2026-10-15:

| Check | Result |
| --- | --- |
| Web unit and documentation/export tests | 114 passed |
| Focused API provider/service/route tests | 62 passed |
| SDK tests | 104 passed |
| CLI tests | 88 passed |
| Shared contract tests | 16 passed |
| Installed SDK package | 35 conformance tests, public declarations, OpenCode recipe and 16 MiB download under a 128 MiB heap passed |
| Playwright sandbox detail/workbench | 26 passed; actual xterm + fixture WebSocket, transfer integrity/cancellation, oversized input, preview timeout, deep links and failure states |
| Viewports | Navigation/logs: 1920, 1440, 1024, 768, 390, 320 px; overview/files: 1440, 1024, 768, 390, 320 px |
| Typechecks/builds | Web, API, CLI and shared passed; production web/API/CLI builds passed |
| Contracts/docs | OpenAPI generation/check, local documentation links and public-package assertions passed |
| Dependency gate | Passed with the pre-existing approved braces exception only; 9 moderate findings remain below the unchanged high-severity gate |

Screenshots inspected under `/tmp/harakiri-workbench-*.png` and
`/tmp/harakiri-sandbox-detail-*.png`. Public guide navigation was also exercised
with agent-browser on localhost. These are ephemeral local verification assets,
not release evidence for a real provider.

The first browser pass exposed two test-fixture mistakes (invalid SSE fixture
cursor/status and an ambiguous status locator); corrected fixtures passed the
full rerun. Added oversized-transfer and preview-timeout tests also passed.

The October 15 implementation did not perform a cluster operation, publication,
push or deployment. The October 16 maintainer instruction now authorizes the
reviewed release workflow. Core manifests/chart and general client examples are
aligned to rc.13; adapter peers and historical installation pins are preserved.
The 28 detail/Workbench browser regressions, 13 requester tests, typechecks,
production web build, installed SDK/CLI package smoke, docs links and OpenAPI
checks passed locally. GitHub-to-npm read-only Trusted Publishing verification
passed in run 38928329760. These checks are not native or deployment evidence.
No new database migration is required. docs/cot and Brain remain untouched.
Keep this plan active until its remaining acceptance has actual evidence.
