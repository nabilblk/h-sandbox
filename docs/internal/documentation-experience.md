# Public Documentation: Structure and Authoring

## Reader Journey

The public documentation is a product interface, not a mirror of the repository
tree. It starts with a working task and progressively introduces the contracts
that task depends on:

1. **Getting started:** overview, quickstart, vision and architecture, installation.
   **Self-hosting** follows with a dedicated Kubernetes installation path for operators.
2. **Concepts:** retained workspaces and the security model.
3. **Sandbox guides:** lifecycle, commands, files, routes, outbound access and credentials.
4. **Templates:** prepare, build, version and use an execution environment.
5. **Tutorials and agent workflows:** complete scenarios with prerequisites,
   independent verification, failure behavior and cleanup.
6. **Reference:** exact API, CLI and workspace operations and errors.
7. **Administration:** identity, organization membership and storage operations.

The overview provides direct starting points; it is not a marketing landing
page. Reference material should not interrupt a beginner's first execution.
Existing `#docs/<page-id>` URLs remain valid. Section permalinks use
`#docs/<page-id>?section=<heading-slug>` and remain public routes.

## Source Map

| Concern | Source |
| --- | --- |
| Page registry and established guides | `apps/web/src/docs-content.tsx` |
| Overview and checked quickstart | `apps/web/src/getting-started-docs.tsx` |
| Kubernetes installation and model-free acceptance example | `apps/web/src/kubernetes-install-docs.tsx`; repository entry point `docs/install-kubernetes.md` |
| Vision narrative | `apps/web/src/vision-docs.tsx` |
| Responsive architecture and lifecycle figures | `apps/web/src/components/docs-diagrams.tsx` |
| Editorial order and local search | `apps/web/src/docs-navigation.ts` |
| URL, history, navigation and section handling | `apps/web/src/routes/docs.tsx` |
| Remembered page, without loading docs content elsewhere | `apps/web/src/docs-selection.ts` |
| Highlighted code and synchronized examples | `apps/web/src/components/docs-code.tsx` |
| Reading-surface styles | `apps/web/src/styles-docs.css` |
| Workspace concept/tutorial/reference/operations | `apps/web/src/workspace-*-docs.tsx` and `workspace-docs.tsx` |
| Authorization concept, API keys and staged operator upgrade | `apps/web/src/authorization-docs.tsx` and `docs/authorization.md` |
| Recorded workflow text and snippets | `apps/web/src/*-demo-walkthrough.ts` |

The `DocPage` registry stores page identity, title, category, lede, table of
contents and content. `docGroups` defines reading order independently of file
location. Every page must occur exactly once in that navigation. An optional
`navTitle` keeps long workflow titles manageable without changing the article
title or URL.

Search indexes titles, descriptions, headings and declarative content/code in
memory. It does not send queries to an external service, execute components to
index their output, or index generated video transcripts. A component-owned
page must expose its important topics in its title, lede and heading metadata.

## Content Contract

- Explain the user's problem before listing operations. State prerequisites
  before code, and observable success and cleanup after code.
- Distinguish a template, runtime filesystem, persistent workspace, command
  context and provider snapshot. They are not interchangeable forms of state.
- The application owns agent orchestration and task correctness. Harakiri owns
  product records and policy; OpenSandbox owns runtime execution. Platform
  operators own the infrastructure and its isolation/storage guarantees.
- Check implementation contracts, release receipts and capability gates before
  claiming a feature works. Keep preview, provider and OpenShift acceptance
  limits adjacent to the feature rather than hiding them in release notes.
- Keep immutable recording evidence and its original package/model versions.
  A documentation redesign does not mean a historical demo was rerun.
- Pin versions in reproducible scenarios. Distinguish npm `latest`, `next`,
  exact package versions and the installed API/scheduler versions.
- Never ask readers to place a Harakiri control-plane key in the sandbox. Keep
  illustrative placeholders unmistakable and never include real credentials.
- Treat headings as durable links. Renaming a heading changes its section
  slug; avoid gratuitous changes after publication. Page IDs must not change.
- Keep the public article and its technical Markdown companion aligned when
  changing behavior. Public vision is the product explanation;
  [architecture.md](../architecture.md) and source contracts contain internals.

## Code Blocks

Use `CodeBlock` with a required `language` and optional `filename`; pass the
exact runnable text as its child. Do not add prompt characters, fabricated
output or display-only ellipses to a supposedly complete script. Mark excerpts
as excerpts in surrounding prose.

Available languages: `bash`, `typescript`, `javascript`, `json`, `yaml`, `toml`,
`python`, and `plaintext`. Prompts, CSV and mixed output should remain readable
plain text rather than receiving a misleading programming-language label.

Lowlight supplies syntax trees through a small explicitly registered
Highlight.js grammar set. React renders token spans and escapes text; the
component does not inject arbitrary highlighted HTML. See the
[Lowlight API](https://github.com/wooorm/lowlight#api).

Use `CodeTabs` only for real alternative implementations. Connect `value` and
`onValueChange` when a choice must stay consistent across steps, as with the
quickstart's installation and implementation. Do not present a language switch
for SDKs that Harakiri does not ship.

Copy uses the original string, not rendered text. It reports success through a
live region, handles unavailable/blocked clipboard access without crashing, and
leaves the raw code selectable. Only the code region scrolls horizontally.

## Diagrams

The system map and task lifecycle are semantic HTML figures with CSS grid and
connectors. Their labels remain native text: desktop layouts reflow vertically
on mobile instead of scaling a fixed SVG canvas into unreadability. Figure
captions explain the same ownership and storage relationships as the drawing.

Keep labels short and distinguish metadata from retained files. Do not imply
PostgreSQL executes commands, workspaces preserve process memory, or all runtime
providers support the same features. Do not use decorative cards or arrows that
have no architectural meaning.

For isolated diagram screenshots, the browser test temporarily hides fixed
navigation chrome only during capture. It also tests normal viewports and
section focus without that override. A tall element screenshot with a sticky
header drawn through it is not useful visual evidence.

## Verification

Run checks sequentially from the repository root:

```sh
pnpm --filter @harakiri/web test
pnpm --filter @harakiri/web typecheck
pnpm --filter @harakiri/web build
pnpm docs:check
```

Start a preview on an unused port, then run:

```sh
HARAKIRI_WEB_URL=http://127.0.0.1:19475 \
  pnpm exec playwright test tests/e2e/docs-experience.spec.ts
```

Acceptance includes all page IDs, 1440/390/320px widths, mobile selection,
keyboard tabs, consistent language choice, copy success/failure and byte equality,
search results/empty state, section reload/back history, skip link and unknown
page recovery. Diagram captures go to ignored `docs/artifacts/docs-redesign/`.
Review full-page and ordinary viewport captures as well as isolated figures.

The docs are lazy-loaded so their grammar and content bundle is not required by
the landing page or dashboard. Do not import route functions from `routes/docs`
into eager routes; use `docs-selection` for navigation preferences instead.

## September 2026 Review

The audit found and corrected:

- A quickstart that terminated its sandbox before its preview step.
- A mixed reading order, missing overview/search/progression and no section URLs.
- A fixed-size architecture graphic that became unreadable on mobile.
- Monochrome, unlabelled code and missing copy/keyboard/failure states.
- Literal Markdown backticks rendered as prose instead of inline code.
- Long Vault endpoint paths overflowing narrow screens.
- Workspace installation copy still describing the earlier npm publishing blocker.
- Docs imports that would otherwise put the new highlighter into the initial app bundle.

This work changes documentation, not backend guarantees. Runtime tests of every
historical tutorial, production deployment, a release and translation into other
human languages are separate tasks, not implied by passing the browser suite.
