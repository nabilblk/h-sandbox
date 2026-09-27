# Execution Plan: Deep Agents First-Task Experience

**Created**: 2026-09-27
**Author**: Codex
**Status**: Completed
**Priority**: User-requested
**Estimated effort**: One focused implementation and verification session

## Context

The adapter already supports standard `createDeepAgent({ model, backend })`.
The current guide jumps from an incomplete attachment fragment to a large repair
fixture. Make the simplest local-to-sandbox transition concrete without adding
another agent factory or hiding framework code. Scope is examples, documentation,
presentation and tests, not a new SDK contract or release.

## Success Criteria

- [x] Two executable programs visibly import Deep Agents and use the same model,
  task, agent configuration and reliable resource cleanup.
- [x] Local execution is explicitly not isolation; model and API credentials stay
  in the application. Disposable cleanup is distinct from persistent ownership.
- [x] The public guide starts with before/after and progresses through setup,
  existing sandboxes, approval, persistence, diagnostics and advanced repair.
- [x] Displayed code equals runnable code and survives copy and Markdown export.
- [x] Real framework contract tests and clean installed-package checks pass.
- [x] Desktop/mobile browser checks confirm readable, usable comparison panels.

## Phases

### Phase 1: Runnable Comparison
**Status**: Complete
- [x] Inspect released adapter, pinned framework and documentation tests.
- [x] Add explicit shared model configuration and two small entry programs.
- [x] Test unchanged programs using scripted model decisions, bounded local shell
  commands in a temporary directory and a synthetic Harakiri transport.
- [x] Cover false success, model failure, missing configuration and cleanup.

### Phase 2: Progressive Documentation
**Status**: Complete
- [x] Lead the public guide with the comparison; retain recovery deep links.
- [x] Document prerequisites, commands, expected outcome and ownership boundaries.
- [x] Align package README, technical guide and example navigation.
- [x] Extend displayed-source and clean-consumer checks; keep versions unchanged.

### Phase 3: Verification
**Status**: Complete
- [x] Run package tests/typechecks and anonymous installed-package qualification.
- [x] Run web documentation tests, typecheck and production build.
- [x] Browser-test copying, navigation, exports and desktop/mobile layouts.
- [x] Record evidence, archive the completed plan and provide a local preview.

### Phase 4: Example Readability
**Status**: Complete

The user found the first-task programs too verbose and test-like. Keep the
framework API visible while separating a minimal integration example from
production result verification. Reopened after the initial verification below
and completed with the follow-up evidence recorded at the end.

- [x] Remove assertions and command re-execution from entry programs; keep them
  in regression tests and the larger verified-repair recipe.
- [x] Use named prompts, contextually typed message tuples, destructured results and the
  framework's text accessor. Return the callback promise without redundant await.
- [x] Correct documentation claims and synchronize displayed/downloadable code.
- [x] Verify real framework dispatch, structured text, failures and cleanup;
  rerun installed-package and browser checks.

### Phase 5: Comparison Layout
**Status**: Complete

The desktop comparison aligned its sections but not their internal rows. Wrapped
descriptions shifted the code panels, and forced code wrapping made the two
programs different heights. Reopened for a documentation-only presentation fix.

- [x] Align headings, descriptions, toolbars and panel boundaries intrinsically.
- [x] Preserve source indentation and keep any long-line scrolling inside code.
- [x] Verify desktop, breakpoint and mobile layouts, including copy feedback.

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
| --- | --- | --- | --- |
| 2026-09-27 | Keep the released backend and lifecycle helper | First-use friction is presentation and onboarding, not a missing agent API | A second agent factory or automatic lifecycle magic |
| 2026-09-27 | Use LocalShellBackend for the baseline | Default state-backed files do not offer equivalent shell execution | Misleading comparison with default `createDeepAgent()` |
| 2026-09-27 | Share only explicit model setup | Both programs must visibly construct and invoke the actual framework | Hiding the agent in an imported task function |
| 2026-09-27 | No running lab or customer environment changes | Synthetic transport and disposable local fixtures cover this docs/examples change | k0s deployment or paid model execution |
| 2026-09-27 | Export TypeScript downloads from the same documentation constants | Copy, Markdown, download and runnable source must remain equal | Manually maintained public file copies |
| 2026-09-27 | Keep first-task programs focused on agent integration | User feedback: assertions and shell re-execution obscure the backend change | Moving the whole agent into a helper, adding resource-disposal shims or inventing an agent factory |
| 2026-09-27 | Use shared intrinsic CSS grid rows for the comparison | Captions can wrap independently while code tops and bottoms remain aligned | Fixed caption heights, JavaScript measurements or changing source to fit the layout |
| 2026-09-27 | Restore standard code-block scrolling for long lines | Preserve source indentation and identifiers at a readable font size; contain scrolling inside each keyboard-focusable code block | Arbitrary token wrapping or shrinking code text |

## Tech Debt Incurred

None intended. Model-driven native qualification from the prior release remains
separate evidence; scripted checks of the new examples are not inference evidence.

## Initial Verification

Delivered two small entry programs plus explicit model setup, a responsive
before/after public guide, exact TypeScript downloads and progressive ownership
guidance. Updated package, integration and example documentation. No runtime,
SDK contract, dependency manifest or version changes.

Verification on 2026-09-27:

- `pnpm --filter @h-sandbox/deepagents typecheck`: passed.
- `pnpm --filter @h-sandbox/deepagents test`: 50 passed, one explicitly gated
  PostgreSQL workflow test skipped. Eight new first-task checks passed.
- `node scripts/test-deepagents-package.mjs --published` with consumer Node
  22.23.3 and npm: anonymous installation of adapter 0.1.0-rc.2 / SDK
  0.5.0-rc.12, exact examples and typechecks passed (51 tests, one DB skip).
- Same verifier with `--source`, pnpm and consumer Node 24.21.0: clean packed
  consumer passed (51 tests, one DB skip). Temporary consumers removed.
- Web tests: 105 passed. Web typecheck and production build passed; existing
  application bundle-size advisory remains, outside this change's scope.
- `HARAKIRI_WEB_URL=http://127.0.0.1:15174 pnpm exec playwright test
  tests/e2e/docs-experience.spec.ts`: all 10 passed, including every public page
  at 1440/390/320px, comparison layout, exact clipboard text, downloadable source,
  Markdown fidelity, existing section links and keyboard navigation.
- Separate `agent-browser` session and screenshots inspected at 1440/390px:
  no page or comparison-code horizontal overflow, no browser exceptions.
- `git diff --check`: passed. Existing untracked `docs/cot/` left untouched.

The first-task graph decisions and remote transport were scripted. The local
baseline executed only a fixed test-owned shell command in a disposable directory.
No new native sandbox, model-inference, PostgreSQL recovery or k0s acceptance is
claimed. Prior native/model evidence remains explicitly attributed to the repair
example. No publication, commit, push or live deployment was performed.

Local review URL: `http://127.0.0.1:15174/#docs/deepagents`.

## Completion Notes

The readability revision separates the first-use example from an acceptance
test. Each program declares its prompt, invokes the real framework with inferred
message-tuple types, and prints the final message through `.text`. The sandbox
callback returns its promise directly; its result is printed only after the
helper confirms cleanup. Environment validation, recursion limits, local
`finally` cleanup and sandbox ownership remain explicit. No casts, new agent
factory, disposal shim or configuration wrapper were added.

Independent verification remains in tests and the existing repository-repair
recipe. Updated documentation explicitly states that a model reply is not proof
of artifact correctness. Test coverage includes actual prompt delivery, local
artifact verification, structured text blocks, replies without tool calls,
model errors, missing template configuration and cleanup failure before output.

Follow-up verification on 2026-09-27:

- Adapter typecheck passed; 11 focused first-task checks passed.
- Published npm consumer on Node 22.23.3 passed 54 checks and exact-example
  typechecks. Final message-tuple refinement was then qualified through the
  published pnpm consumer on Node 24.21.0: 54 checks and typechecks passed.
  Both runs skipped the gated PostgreSQL workflow test and removed temporary
  consumers. No real model, production runtime or cluster was used.
- All 105 web tests and the production build passed after the final refinement.
- All 10 documentation browser tests passed during the revision. The focused
  Deep Agents browser test was rerun after the final tuple adjustment and passed,
  including exact downloads, copy, Markdown and 1440/390/320px layout checks.
- Final desktop screenshot inspected with `agent-browser`; no browser errors.
- No publication, commit, push or deployment. Local preview remains on port 15174.

## Comparison Layout Verification

On 2026-09-27 the user's screenshot revealed a gap in the initial layout checks:
they compared outer section positions, not code panel positions. Shortened the
captions, kept lifecycle detail below the comparison and aligned heading,
description and code rows with CSS subgrid. Desktop code panels stretch to the
same height. Narrow containers stack at natural heights. No component state,
layout measurement hooks or source/example changes were needed.

The earlier forced wrapping is removed. Long lines now use the same contained,
keyboard-accessible horizontal scrolling as other documentation code blocks;
this supersedes the initial no-code-scroll observation above. There is no
horizontal page overflow.

- All 105 web tests, web typecheck and production build passed. The existing
  application bundle-size advisory remains unchanged in scope.
- All 11 documentation browser tests passed. The comparison is checked at
  1680, 1440, 1366, 1320, 1310, 1200, 1050, 768, 390 and 320px. Tests assert
  heading, description, toolbar and code alignment, including an exact 760px
  container, deliberately longer description, and copy success/failure states.
- Exact clipboard text, downloadable programs, Markdown fidelity, section
  navigation and all public pages still pass their existing browser checks.
- Separate agent-browser screenshots inspected at 1440 and 390px. No browser
  errors; the temporary browser session was closed.
- `git diff --check` passed. Untracked user material remained untouched.
- No commit, push, publication, deployment or running-cluster changes.
