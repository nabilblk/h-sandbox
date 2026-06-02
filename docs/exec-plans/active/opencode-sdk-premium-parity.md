# Execution Plan: OpenCode SDK Premium Parity

**Created**: 2026-06-02
**Author**: Codex
**Status**: In Progress
**Priority**: {P0-P3}
**Estimated effort**: 2-4 days for parity-quality docs/examples; 1 week if SDK helpers are added and published

## Context
The `opencode` Harakiri template now exists and has passed local Docker smoke,
k0s template build, deployed template smoke, and public route smoke. That proves
the runtime can host OpenCode in three modes: interactive TUI, headless
`opencode run`, and `opencode serve` on port `4096`.

The remaining gap is developer experience. Harakiri's TypeScript SDK already
has the generic primitives needed to create the sandbox, run commands, start a
detached server, expose a route, and access files. It does not yet present
OpenCode as a premium, copy-paste-ready integration path. External reference
docs for this class of workflow show four expected experiences:

- CLI: create an `opencode` sandbox and start the TUI.
- Headless: create an `opencode` sandbox with provider credentials and run
  `opencode run`.
- Repository workflow: clone a repository, run OpenCode against it, then read
  the resulting diff.
- Server workflow: start `opencode serve --hostname 0.0.0.0 --port 4096`,
  wait for `/global/health`, expose the port, and connect through
  `@opencode-ai/sdk`.

OpenCode's own server docs confirm the defaults that matter for Harakiri:
`opencode serve` listens on port `4096`, binds to `127.0.0.1` by default, can be
bound with `--hostname`, and supports HTTP basic auth through
`OPENCODE_SERVER_PASSWORD` and `OPENCODE_SERVER_USERNAME`. Harakiri docs and SDK
examples must keep using `--hostname 0.0.0.0` for routed access.

The goal is not to hard-code OpenCode deeply into the core SDK. The goal is to
make the generic SDK feel excellent for agent integrations, then add
OpenCode-specific examples that are as easy to consume as a first-party guide.
Any SDK helper added for this work should be useful beyond OpenCode.

## Success Criteria
- [x] `@h-sandbox/sdk` docs include a first-class OpenCode guide with
      copy-paste TypeScript examples for TUI, headless, repository, and server
      workflows.
- [x] Website product docs expose the same OpenCode SDK guide with premium,
      focused snippets and clear route-token/basic-auth handling.
- [x] The SDK either already has, or gains, ergonomic generic helpers for the
      repeated OpenCode workflow pieces: detached command wait, route URL
      polling, route-token headers, and optional authenticated route fetches.
- [x] Example code demonstrates connecting `@opencode-ai/sdk` to an OpenCode
      server running inside a Harakiri sandbox without using OpenSandbox or
      Kubernetes internals.
- [x] CLI docs align with SDK docs: create, attach, run, expose, routes, and
      troubleshooting are consistent.
- [x] At least one checked example is typechecked or executed against a mocked
      Harakiri client; the live smoke path is documented for maintainers.
- [ ] Public npm package documentation and website docs are updated before the
      next `@h-sandbox/sdk` / `@h-sandbox/cli` publish.

## Phases

### Phase 1: Gap Validation And UX Contract
**Status**: Complete
- [x] Confirm the current Harakiri SDK exposes the required low-level
      primitives: `createSandbox`, `commands.start`, `commands.wait`,
      `commands.logs`, `runSandbox`, `files.*`, `routes.expose`, and
      `routes.getHost`.
- [x] Confirm the current docs mention OpenCode but do not provide SDK-level
      parity examples.
- [x] Validate OpenCode server requirements from upstream docs: port `4096`,
      default loopback bind, `--hostname 0.0.0.0` for routed access, and optional
      HTTP basic auth.
- [x] Identify the external parity workflow shape: CLI, headless run, cloned
      repository workflow, server route, and OpenCode SDK connection.

### Phase 2: SDK Ergonomics Design
**Status**: Complete
- [x] Audit `SandboxRouteSummary` and `SandboxRouteResponse` to ensure route
      token headers are always typed and obvious to consumers.
- [x] Decide whether `routes.getHost` should remain documented as a URL helper
      or whether the SDK should add clearer aliases such as `routes.getUrl` and
      `routes.exposeAndWait`.
- [x] Design a generic `routes.fetch` or `createRouteFetch` helper that injects
      Harakiri route-token headers and optionally composes HTTP basic auth,
      without making OpenCode special in the core SDK.
- [x] Evaluate a generic `waitForHttp` / `waitForRoute` helper for server
      readiness checks such as `/global/health`.
- [x] Evaluate a generic `git.clone` namespace helper. If added, it should wrap
      normal sandbox command execution, support shallow clones and credentials,
      redact secrets from logs where possible, and remain provider-neutral.
- [x] Decide whether a separate `@h-sandbox/opencode` integration package is
      warranted now. Default assumption: defer until two or more agent-specific
      integrations need shared helpers.

### Phase 3: TypeScript SDK Examples
**Status**: Complete
- [x] Add an SDK README section for the shortest OpenCode headless workflow:
      create sandbox, pass `ANTHROPIC_API_KEY` or another provider key, run
      `opencode run`, print stdout, and kill the sandbox in `finally`.
- [x] Add a repository workflow example: clone a repository into `/workspace`,
      run `opencode run` in that directory, stream or tail logs, read
      `git diff`, and clean up.
- [x] Add a server workflow example: start `opencode serve --hostname 0.0.0.0
      --port 4096`, expose port `4096`, wait for `/global/health`, and build a
      route-aware `baseUrl`.
- [x] Add an example showing `@opencode-ai/sdk` connected to the routed server.
      It must explain how Harakiri route-token headers and OpenCode basic auth
      are passed, and call out any limitation if the OpenCode SDK cannot inject
      custom headers cleanly.
- [x] Add error-handling examples for template not ready, provider key missing,
      route not ready, and command timeout.

### Phase 4: Example Package And Tests
**Status**: Complete
- [x] Add `examples/sdk/opencode-headless.ts` or an equivalent checked example
      that uses only public npm package imports.
- [x] Add `examples/sdk/opencode-server.ts` or an equivalent checked example for
      the route/server/OpenCode SDK flow.
- [x] Add example README instructions for local OSS defaults and public
      deployment defaults.
- [x] Typecheck the examples without requiring live credentials.
- [x] Add mocked SDK tests if new helper APIs are introduced.
- [x] Add a maintainer-only live smoke command that can be run with
      `HARAKIRI_API_URL`, `HARAKIRI_API_KEY`, and a model-provider key.

### Phase 5: CLI And Product Docs
**Status**: Complete
- [x] Update `packages/cli/README.md` with the OpenCode template workflow:
      build or use the ready template, create, attach, run headless, expose
      server, list routes, and unexpose.
- [x] Update website docs to include an "OpenCode SDK" page or expand the
      current "OpenCode template" page with a dedicated SDK section.
- [x] Add a docs navigation entry if the product docs structure supports it.
- [x] Keep public docs phrased as Harakiri-native guidance. External platforms
      may inform the internal acceptance criteria, but should not appear as
      product positioning.
- [x] Add troubleshooting notes for the most likely user failures:
      missing model-provider credentials, server bound to `127.0.0.1`, missing
      route-token header, OpenCode basic-auth mismatch, and template version not
      promoted.

### Phase 6: Verification, Publish, And Deployment
**Status**: In Progress
- [x] Run SDK tests and typecheck after any SDK API or docs-snippet changes.
- [x] Run web docs typecheck/build after product docs changes.
- [x] Run CLI build/tests after CLI README/help changes if command examples are
      adjusted.
- [x] Run `git diff --check`.
- [ ] If SDK helpers are added, update package versioning/changelog and publish
      `@h-sandbox/sdk` according to the npm publish runbook.
- [ ] If CLI docs/help or package metadata change, update and publish
      `@h-sandbox/cli` as needed.
- [x] Deploy the updated website docs to k0s and verify the public docs bundle
      contains the new OpenCode SDK content.
- [ ] Record verification evidence in `docs/test-report.md`.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-06-02 | Treat OpenCode parity as SDK/docs integration work, not a new runtime-provider feature | The live template, command execution, routes, files, and route proxy already work. The missing piece is a polished developer path. | Add provider-specific OpenSandbox code; add Kubernetes exec fallback; build a separate OpenCode service outside sandboxes. |
| 2026-06-02 | Prefer generic SDK helpers over OpenCode-specific methods in the core SDK | Harakiri should stay a clean OSS sandbox control plane. Route fetch/wait and git clone helpers help many agent templates, not only OpenCode. | Add `harakiri.opencode.*` methods directly to `HarakiriClient`; create a separate `@h-sandbox/opencode` package immediately; only write docs and add no helpers. |
| 2026-06-02 | Keep OpenCode server startup explicit rather than making the template auto-start it | Explicit startup avoids exposing an agent API before the user chooses credentials, auth, and TTL. It also preserves TUI and headless modes. | Change the template `start_command` to `opencode serve`; create a second always-on `opencode-server` template. |
| 2026-06-02 | Add route helpers, defer `git.clone` and `@h-sandbox/opencode` | Route-token headers, route-aware fetch, and HTTP readiness are reusable and remove the main OpenCode integration friction. A git helper needs a broader secret-redaction and command UX design; a separate OpenCode package is premature for one integration. | Keep only docs; add OpenCode-specific SDK methods; add a full git namespace in this slice. |

## Tech Debt Incurred
None yet. This plan should avoid adding template-specific branching inside the
core SDK unless there is a clear reusable abstraction.

## Completion Notes
To be filled when the SDK/docs parity work is implemented, verified, deployed,
and published.
