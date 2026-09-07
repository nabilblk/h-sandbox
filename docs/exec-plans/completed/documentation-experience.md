# Execution Plan: Documentation Experience

**Created**: 2026-09-07
**Author**: Codex
**Status**: Completed
**Priority**: User-requested
**Estimated effort**: Multi-phase documentation and frontend work

## Context

The public `#docs` site has useful material but lacks a coherent progression.
Live desktop and mobile review found an overlong undifferentiated navigation,
unlabelled monochrome snippets, no copy/search/next-page controls, and an
architecture drawing whose labels shrink to illegible sizes. The quickstart
terminates its sandbox before demonstrating a preview. The vision page reads
as a feature inventory and mixes runtime, policy and storage responsibilities.

Scope: public documentation UI, information architecture, vision narrative,
diagrams, example presentation, and contributor guidance. Preserve existing
page URLs, product behavior, homepage, recordings, and current release caveats.
No runtime deployment, npm publication, or BackgroundAgent changes are required.

## Success Criteria

- [x] Documentation has a clear start, concepts, guides, examples, reference and operations progression.
- [x] Vision explains purpose, principles, concrete workflows, ownership boundaries and current limits without speculative promises.
- [x] Two accessible diagrams distinguish system responsibilities and a task's lifecycle; labels remain legible on mobile.
- [x] Every documentation snippet has explicit language metadata, real syntax highlighting and an accessible copy action with success/failure feedback.
- [x] Search, section permalinks, active navigation, previous/next and mobile navigation work with keyboard, history and unavailable browser storage.
- [x] Quickstart runs in a sensible order and clearly states prerequisites, verification and cleanup.
- [x] Regression tests, typecheck, production build and desktop/mobile browser checks pass; screenshots and results are recorded.

## Phases

### Phase 1: Audit and Content Design
**Status**: Complete
- [x] Inspect live docs at 1440px and 390px, source, existing tests and technical architecture.
- [x] Identify quickstart ordering defect, diagram readability and code/navigation gaps.
- [x] Preserve the OpenSandbox runtime boundary, distinguish metadata from retained files, and retain capability/preview limits.

### Phase 2: Reading and Navigation Foundation
**Status**: Complete
- [x] Add explicit docs ordering, an overview, search, contextual progression and section links.
- [x] Add a shared code component using a small explicit grammar set; migrate existing snippets without changing their raw content.
- [x] Introduce scoped responsive documentation styles and accessible states.

### Phase 3: Vision, Architecture and Onboarding
**Status**: Complete
- [x] Rewrite vision and architecture with accurate ownership and non-goals.
- [x] Replace the old graphic with a system map and task lifecycle diagram.
- [x] Rewrite quickstart and add runnable CLI/TypeScript paths with release-aware prerequisites.
- [x] Document content-authoring conventions and source-of-truth boundaries.

### Phase 4: Verification and Handoff
**Status**: Complete
- [x] Test metadata, internal links, snippets, search, navigation and narrative invariants.
- [x] Run frontend tests/typecheck/build and doc-link validation sequentially.
- [x] Browser-test desktop/mobile, copy, deep links/history, keyboard navigation, diagrams, search and representative long pages.
- [x] Record limitations honestly, leave a local preview URL, and archive only when complete.

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
| --- | --- | --- | --- |
| 2026-09-07 | Keep React/Vite and existing hash page IDs | Improve the current product without a docs framework migration or broken integrations | Separate docs platform |
| 2026-09-07 | Explicit languages with Lowlight/Highlight.js AST rendering | Proven grammars, escaped React text, small language subset; no ad hoc token regex or HTML injection | Heavy all-language highlighter, DOM post-processing |
| 2026-09-07 | Responsive code-native diagrams | Legible labels and clear relationships at every viewport; accessible text equivalent | Scaling the fixed-width SVG down on phones |
| 2026-09-07 | Lazy-load the docs route; move navigation preference into a small independent module | Keep content and grammar code out of the initial app bundle | Eagerly loading syntax grammars across the application |
| 2026-09-07 | Fix additional audit findings while preserving runtime behavior | Literal backticks, stale npm copy and overflowing Vault paths were reader-facing defects | Cosmetic-only changes |

## Verification References

- Live audit: `https://sb.harakiri.io/#docs` and `#docs/vision-architecture`.
- Before screenshots: `/tmp/harakiri-docs-before.png`, `/tmp/harakiri-vision-before.png`, `/tmp/harakiri-docs-mobile-before.png`.
- Architecture: `docs/architecture.md`, `docs/opensandbox-boundaries.md`, provider contracts, workspace docs and rc.3 delivery receipt.
- Interface audit: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
- Syntax highlighter: https://github.com/wooorm/lowlight

## Tech Debt Incurred

No new runtime or release debt. The existing SPA hash-routing/SEO limitations
and Vite warning for the main bundle exceeding 500 kB remain outside this
documentation redesign. Syntax grammars and documentation content are now a
separate lazy-loaded chunk. Existing provider/release acceptance limits remain
visible, including the unfinished OpenShift workspace acceptance.

## Completion Notes

Completed locally on September 7, 2026. Reorganized 33 pages, added a guided
overview and checked CLI/TypeScript quickstart, rewrote the vision, replaced the
fixed SVG with two responsive figures, and standardized 126 rendered code
blocks with language labels, highlighting and copy feedback. Preserved page
IDs, recorded demo evidence, the homepage and runtime behavior. Contributor
guidance lives in [documentation-experience.md](../../internal/documentation-experience.md).

Verification on the final implementation:

- Web tests: 60 passed; demo tests: 27 passed.
- Web and demo typechecks, production web build and `pnpm docs:check`: passed.
- Playwright: 6 passed against the production build at port 19476; covered all
  33 pages at 1440x1000, 390x844 and 320x740, plus search, history, section focus,
  keyboard tabs, copy success/denial and exact raw clipboard content.
- Additional manual browser checks at 1024x900 and 1920x1080: no document or
  diagram overflow. Desktop and mobile screenshots were visually inspected.
- Quickstart syntax and a controlled Bash harness test verified ID capture
  despite CLI progress output and cleanup on both success and failure. These
  are not a claim that a new live sandbox was run during this docs task.
- Production assets: docs chunk 220.37 kB (60.03 kB gzip); main chunk 528.83 kB
  (147.95 kB gzip). The existing main-chunk warning is not a build failure.

Local screenshot evidence is in ignored `docs/artifacts/docs-redesign/`:
`overview-desktop.png`, `quickstart-typescript-desktop.png`,
`vision-wide-desktop.png`, and `system-{1440,390,320}.png` /
`lifecycle-{1440,390,320}.png`. Browser tests can regenerate diagram captures.

Preview: `http://127.0.0.1:19475/#docs/overview`. This completion covers source
changes and local acceptance only; no commit, production deployment, npm
publication or rerun of all historical runtime tutorials is implied.
