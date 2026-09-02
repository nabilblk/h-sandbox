# Execution Plan: OpenCode Agent Template

**Created**: 2026-06-02
**Author**: Codex
**Status**: Completed
**Priority**: P1
**Estimated effort**: 1-2 days for the first template, 1-2 weeks for the broader agent-template catalog pattern

## Context
Harakiri's current template examples prove that custom OCI images can be built,
versioned, promoted, smoked, and used through the control plane. The template
catalog is still mostly generic: Python, Node, browser, and the
`open-agents-dev` pilot. The next useful step is to add purpose-built agent
runtime templates that make Harakiri feel ready for real coding-agent projects.

The first target is an `opencode` template. OpenCode is a terminal AI coding
agent with a TUI, non-interactive `opencode run`, and a headless HTTP server
started with `opencode serve`. Current upstream docs show `opencode serve`
defaults to port `4096` and `127.0.0.1`, so Harakiri docs must explicitly use
`--hostname 0.0.0.0 --port 4096` when exposing it through a sandbox route.

The template must respect Harakiri's architecture:

- Harakiri owns catalog metadata, build records, immutable template versions,
  promotion, routes, egress defaults, and developer documentation.
- OpenSandbox owns the sandbox lifecycle, runtime execution, filesystem, logs,
  and network dataplane.
- No Kubernetes exec, hidden pod access, or provider-specific workaround should
  be added for this template.
- The public docs should present OpenCode as a Harakiri template workflow,
  without adding dependency on any competitor brand or external product UI.

## Success Criteria
- [x] `examples/templates/opencode` contains a reproducible Dockerfile,
      `harakiri.toml`, smoke script, and README.
- [x] The template installs a pinned `opencode-ai` version and verifies the
      `opencode` binary without requiring an LLM API key during smoke tests.
- [x] Runtime defaults include `/workspace`, useful coding-agent tools, and
      port `4096` for `opencode serve`.
- [x] Repo docs explain how to build, smoke, create, attach, run OpenCode, and
      expose the OpenCode server through Harakiri routes.
- [x] Website/product docs include a user-facing OpenCode template section.
- [x] The implementation passes local checks and, when the cluster is healthy,
      a real `harakiri template build` plus `template smoke` against k0s.
- [x] The plan records any deferred platform-catalog or UI work clearly.

## Phases

### Phase 1: Upstream Research And Plan
**Status**: Complete
- [x] Verify current OpenCode install package and CLI commands from upstream
      documentation and npm metadata.
- [x] Confirm `opencode serve` route requirements: port `4096`, bind
      `0.0.0.0`, and optional HTTP basic auth env vars.
- [x] Decide whether this first slice should be a built example template or a
      seeded platform catalog entry.
- [x] Create this exec-plan artifact.

### Phase 2: Template Implementation
**Status**: Complete
- [x] Add `examples/templates/opencode/Dockerfile` with pinned OpenCode install,
      Node/npm/pnpm/yarn, Git, Python, jq, ripgrep, and common coding tools.
- [x] Add `examples/templates/opencode/harakiri.toml` with internal visibility,
      agent runtime family, sensible resources, `/workspace`, aliases, tags,
      `sleep 3600`, and ports `[4096, 3000, 5173]`.
- [x] Add `examples/templates/opencode/smoke.sh` that checks the runtime
      contract without calling an LLM provider.
- [x] Add `examples/templates/opencode/README.md` with build, smoke, sandbox,
      run, attach, route, auth, and troubleshooting examples.
- [x] Update `examples/templates/README.md`.

### Phase 3: Documentation And Product Surface
**Status**: Complete
- [x] Update `README.md` so contributors discover the OpenCode template from
      the top-level template section.
- [x] Update `docs/templates.md` reference-template table and add an OpenCode
      usage subsection.
- [x] Update `apps/web/src/docs-content.tsx` with product docs for building,
      running, and exposing OpenCode.
- [x] Record verification evidence in `docs/test-report.md`.

### Phase 4: Verification
**Status**: Complete
- [x] Run repository checks relevant to template docs and shared code.
- [x] Run a local Docker build for `examples/templates/opencode` if Docker is
      available.
- [x] Build the template through the deployed Harakiri control plane when k0s,
      API, registry, and builder are healthy.
- [x] Run `harakiri template smoke opencode --cmd harakiri-opencode-smoke`.
- [x] Create a sandbox from the built template and verify `opencode --version`
      and an `opencode serve --hostname 0.0.0.0 --port 4096` route.

### Phase 5: Follow-Up Agent Template Catalog
**Status**: Deferred
- [ ] Define a reusable pattern for future `codex`, `claude`, `openclaw`, and
      other agent templates.
- [ ] Decide whether agent templates should be platform-owned seeded templates,
      organization-owned examples, or both.
- [ ] Add dashboard affordances for agent-template recommendations only after
      at least one template has passed build and smoke in k0s.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-06-02 | Start with an organization-buildable example template, not a fake platform catalog row | A template definition without a ready image version would look runnable but fail at sandbox creation. The examples path is honest, reproducible, and aligned with the existing custom-template workflow. | Seed a platform row in PostgreSQL; add `opencode` to the static `TEMPLATES` array; manually inject a built image digest. |
| 2026-06-02 | Pin `opencode-ai` instead of installing `latest` | Reproducible template builds are more important than silently picking up CLI changes. Version bumps should be deliberate. | Use `npm install -g opencode-ai`; curl the upstream install script. |
| 2026-06-02 | Do not auto-start `opencode serve` on sandbox boot | Sandboxes should start idle and let users choose TUI, headless run, or server mode. Auto-start would expose an agent API before the user decides credentials/auth. | Set `start_command` to `opencode serve`; run a supervisor in the image. |

## Tech Debt Incurred
None for the first slice. Deferred platform-catalog work is intentional until a
real image version is built, smoked, and promoted.

## Completion Notes
Completed the first OpenCode template slice on 2026-06-02.

Verification evidence:

- Local checks passed: `bash -n examples/templates/opencode/smoke.sh`,
  `pnpm --filter @harakiri/web typecheck`,
  `pnpm --filter @harakiri/web build`,
  `pnpm --filter @h-sandbox/cli build`, and `git diff --check`.
- Local image build and smoke passed:
  `docker build -t harakiri/opencode-template:local examples/templates/opencode`
  and `docker run --rm harakiri/opencode-template:local harakiri-opencode-smoke`.
- k0s template build passed through the Harakiri control plane with build
  `bld_ppJrSvnyfHwk`, version `tplv_-376iyv9hyCi`, and image digest
  `sha256:504986d309a5180a99a43e0a1db53b00d9cf26b187f78822d1642df1dfff7ccd`.
- k0s template smoke passed with sandbox `sbx_cXi36oFlNJ` and terminated the
  smoke sandbox.
- k0s route smoke passed by starting
  `opencode serve --hostname 0.0.0.0 --port 4096`, exposing port `4096`
  through the public Harakiri route proxy, and reading `/global/health` through
  the route token plus OpenCode basic auth.

Phase 5 remains a separate product backlog item. The reusable catalog pattern
should be designed only after this first agent image has been exercised by real
projects.
