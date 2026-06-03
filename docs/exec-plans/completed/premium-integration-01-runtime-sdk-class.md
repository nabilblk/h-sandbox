# Execution Plan: Premium Integration 01 Runtime SDK Class

**Created**: 2026-06-03
**Author**: Codex
**Status**: Completed
**Priority**: {P0-P3}
**Estimated effort**: 3-5 engineering days

## Context
Harakiri's TypeScript SDK exposes the needed runtime primitives through
`HarakiriClient`, flat helpers, and namespaced helpers for commands, files,
routes, egress, and templates. That is enough for integration, but premium
sandbox SDKs usually give callers an object that represents a single sandbox
and exposes instance methods such as `sandbox.run()`, `sandbox.files.read()`,
`sandbox.routes.expose()`, and `sandbox.kill()`.

The goal is to add a high-level SDK runtime class without hiding the existing
API contract or introducing provider-specific behavior. External applications
should be able to integrate Harakiri as a first-class sandbox provider using
small, readable code while still having access to the lower-level client when
needed.

## Success Criteria
- [x] `@h-sandbox/sdk` exports a `HarakiriSandbox` or equivalent runtime class
      that wraps a sandbox ID, current summary, and client reference.
- [x] SDK callers can create, connect to, refresh, renew, kill, run commands,
      manage files, expose routes, update egress, and read logs/metrics from
      the sandbox instance.
- [x] The instance API is additive and does not break current `HarakiriClient`
      methods, CLI behavior, or published TypeScript types.
- [x] The instance class uses only public Harakiri API operations and does not
      depend on OpenSandbox internals or Kubernetes access.
- [x] README, website docs, and examples show both quick-start and adapter-style
      usage.
- [x] SDK tests cover instance construction, create/connect flows, typed error
      propagation, and namespace delegation.

## Phases

### Phase 1: Public API Shape
**Status**: Complete
- [x] Audit current SDK exports in `packages/sdk/src/index.ts` and
      `packages/sdk/src/protocol.ts`.
- [x] Define the instance methods and naming conventions:
      `run`, `renew`, `kill`, `refresh`, `commands`, `files`, `routes`,
      `egress`, `logs`, and `metrics`.
- [x] Decide whether creation should be `HarakiriSandbox.create(client, input)`,
      `client.sandboxes.create(input)`, or both.
- [x] Define `connect` semantics for rehydrating an instance from a sandbox ID
      without changing sandbox state.
- [x] Document what data is cached on the instance and when `refresh()` is
      required.

### Phase 2: SDK Implementation
**Status**: Complete
- [x] Add the runtime class and exported types in the SDK.
- [x] Add `client.sandboxes` namespace methods if they improve readability
      without duplicating too much code.
- [x] Delegate all instance operations to existing client methods so behavior
      stays consistent.
- [x] Ensure typed SDK errors retain the same classes and codes when called from
      the instance API.
- [x] Avoid importing or publishing internal monorepo packages beyond the
      already bundled SDK contract.

### Phase 3: Documentation And Examples
**Status**: Complete
- [x] Update `packages/sdk/README.md` and `docs/sdk.md` with instance-based
      quick starts.
- [x] Update website product docs with a concise "Sandbox object" section.
- [x] Add one adapter-oriented example that shows create/connect/run/files/
      routes/cleanup through the instance API.
- [x] Keep lower-level `HarakiriClient` docs available for callers that prefer
      operation-shaped methods.

### Phase 4: Verification And Publish Readiness
**Status**: Complete
- [x] Add SDK unit tests for the new class and namespace helpers.
- [x] Run SDK typecheck, tests, and build.
- [x] Run website docs build if docs are changed.
- [x] Run `git diff --check`.
- [x] Update changelog/release notes and npm publish plan if package exports
      change.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-06-03 | Add a high-level runtime class as an additive SDK layer | The low-level SDK is functional, but adapter authors need a smaller object-oriented integration surface. | Keep only `HarakiriClient`; create a separate adapter package; expose provider-specific OpenSandbox objects. |
| 2026-06-03 | Ship both `HarakiriSandbox.create/connect/wrap` and `client.sandboxes.create/connect/wrap` | Static constructors are explicit and easy to import; client namespace helpers make application code concise without removing lower-level methods. | Only static constructors; only client namespace; replace existing `createSandbox` with object return values. |
| 2026-06-03 | Keep the object as a thin delegating layer over public client methods | This preserves API paths, typed errors, OpenSandbox boundaries, and CLI compatibility while improving ergonomics. | Reimplement request logic in the object; introduce provider-specific runtime handles; add API endpoints only for the object model. |

## Tech Debt Incurred
None planned.

## Completion Notes
Completed on 2026-06-03.

Delivered `HarakiriSandbox` in `@h-sandbox/sdk` with create/connect/wrap,
cached summary access, refresh/wait, renew/kill, blocking run, logs, metrics,
bound command/file/route/egress/terminal helpers, and `client.sandboxes`
namespace helpers. The object delegates to existing public Harakiri API methods
only, so existing `HarakiriClient` methods, typed errors, and provider boundary
rules remain intact.

Documentation now covers the sandbox object in `packages/sdk/README.md`,
`docs/sdk.md`, website docs content, and `docs/integrations/provider-adapter.md`.
Added `examples/sdk-sandbox-object/index.ts` and included it in
`examples/tsconfig.json`. Publish-readiness notes were added in
`docs/release-notes/sdk-sandbox-object.md`, and the website changelog now calls
out the new high-level SDK object.

Verification passed:

- `pnpm --filter @h-sandbox/sdk typecheck`
- `pnpm --filter @h-sandbox/sdk test`
- `pnpm --filter @h-sandbox/sdk build`
- `pnpm examples:check`
- `pnpm --filter @harakiri/web typecheck`
- `pnpm --filter @harakiri/web test`
- `pnpm --filter @harakiri/web build`
- `git diff --check`
