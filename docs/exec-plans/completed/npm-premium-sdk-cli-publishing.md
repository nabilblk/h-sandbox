# Execution Plan: Premium SDK And CLI Publishing

**Created**: 2026-05-29
**Author**: Codex
**Status**: Completed
**Priority**: {P0-P3}
**Estimated effort**: 2-4 engineering days

## Context
Harakiri is ready to expose a public developer integration surface through an
npm SDK and CLI. The monorepo also contains `@harakiri/shared`, but publishing
that package would expose an internal contract between the API, SDK, CLI, and
OpenAPI generator.

The chosen direction is Option B: keep `@harakiri/shared` internal and publish
only the public developer products:

- `@h-sandbox/sdk`
- `@h-sandbox/cli`

This keeps the npm surface small, premium, and stable. Users should install
Harakiri as a product, not reason about internal package boundaries.

Current facts:

- npm organization scope is `h-sandbox`.
- npm package names `@h-sandbox/sdk` and `@h-sandbox/cli` are published at
  version `0.1.0`.
- npm registry authentication is present:
  `npm whoami` returns `nabilblk` and `npm org ls h-sandbox` returns owner
  access.
- The maintainer configured a granular npm token that can bypass 2FA for package
  publishing.
- `pnpm publish --dry-run` succeeds for `@h-sandbox/sdk` and `@h-sandbox/cli`
  without publishing `@harakiri/shared`.
- SDK package is self-contained and no longer depends on `@harakiri/shared`.
- CLI package depends on `@h-sandbox/sdk` and normal public dependencies only.
- npm versions are immutable; a bad `0.1.0` publish would require a new version.

## Product Principles

- The public npm surface must feel intentional: one SDK package for application
  integrations and one CLI package for operators/developers.
- `@harakiri/shared` remains private to the repository unless Harakiri later
  decides to support it as a public API.
- Published packages must not contain test files, source-only internals,
  build scripts, local environment assumptions, or workspace-only dependencies.
- SDK users should get excellent TypeScript autocomplete, stable error classes,
  and examples without importing implementation details.
- CLI users should get a normal executable: `npm install -g @h-sandbox/cli`,
  then `harakiri login`, with no `node dist/index.js` workflow.
- Release quality must be reproducible locally and in CI before npm publish.

## Success Criteria

- [x] `@h-sandbox/sdk` can be installed from a packed tarball in a clean external
      project without installing `@harakiri/shared`.
- [x] `@h-sandbox/cli` can be installed globally from a packed tarball in a clean
      environment and runs `harakiri --version` without workspace packages.
- [x] Published package manifests have no `workspace:*` dependencies and no
      dependency on `@harakiri/shared`.
- [x] SDK exports all public types, request/response shapes, error classes, and
      helpers needed by external integrations.
- [x] CLI depends only on public packages and normal third-party dependencies.
- [x] Package tarballs contain only intended files: compiled JS, declarations,
      README, license, package metadata, and optional changelog.
- [x] pnpm publish dry-run passes for SDK and CLI.
- [x] A clean install smoke test passes for both tarballs outside the monorepo.
- [x] Documentation gives premium install, auth, quickstart, troubleshooting,
      and versioning guidance.
- [x] Release automation can publish with provenance/trusted publishing or a
      documented maintainer fallback.

## Phases

### Phase 1: Public Package Boundary Audit
**Status**: Complete
- [x] List every SDK import from `@harakiri/shared`.
- [x] List every CLI import from `@harakiri/shared`.
- [x] Classify each shared export as:
      public SDK contract, SDK implementation detail, API-only internal, or
      OpenAPI-generation-only.
- [x] Identify runtime imports versus type-only imports.
- [x] Decide the SDK-owned public type names and error exports that must remain
      stable for integrators.
- [x] Document the boundary in `docs/sdk.md` and package README language:
      users import from `@h-sandbox/sdk`, never from `@harakiri/shared`.

### Phase 2: Make SDK Self-Contained
**Status**: Complete
- [x] Remove `@harakiri/shared` from `packages/sdk/package.json`.
- [x] Move or copy public runtime DTOs into SDK-owned source files, or add a
      build step that generates SDK-local public types from shared source while
      producing declarations that reference only `@h-sandbox/sdk`.
- [x] Move stable SDK error classes and API error mapping into SDK-owned source,
      or generate SDK-local wrappers from shared error definitions.
- [x] Ensure compiled SDK JS has no `@harakiri/shared` imports.
- [x] Ensure generated SDK `.d.ts` files have no `@harakiri/shared` imports.
- [x] Keep backend/OpenAPI shared source as the server-side source of truth, but
      do not expose the package as part of the npm install graph.
- [x] Add tests that inspect packed SDK contents and fail if
      `@harakiri/shared` appears in `package.json`, JS, or declarations.

### Phase 3: Make CLI Depend Only On Public Runtime
**Status**: Complete
- [x] Remove direct `@harakiri/shared` dependency from
      `packages/cli/package.json`.
- [x] Replace direct shared imports in CLI with SDK exports or CLI-local types.
- [x] Keep `commander` as the normal CLI dependency.
- [x] Confirm the CLI package installs the `harakiri` binary with executable
      permissions.
- [x] Add a clean global install smoke test from the packed CLI tarball:
      `npm install -g ...`, `harakiri --version`, and `harakiri help`.
- [x] Confirm CLI commands produce helpful errors when `HARAKIRI_API_URL` or
      `HARAKIRI_API_KEY` are missing.

### Phase 4: Package Metadata And Tarball Hygiene
**Status**: Complete
- [x] Add `publishConfig: { "access": "public" }` to SDK and CLI.
- [x] Add package metadata:
      `repository`, `homepage`, `bugs`, `keywords`, `engines`, and
      `sideEffects` where appropriate.
- [x] Decide and document the supported Node.js range.
- [x] Narrow package `files` so tarballs exclude tests, source internals,
      local scripts, temp files, and TypeScript configs unless intentionally
      shipped.
- [x] Ensure SDK and CLI READMEs are included and optimized for npm.
- [x] Include root `LICENSE` in both tarballs.
- [x] Add `.npmignore` only if package `files` is insufficient.
- [x] Verify `npm pack --dry-run` output by file count and contents, not just
      exit code.

### Phase 5: Premium SDK Experience
**Status**: Complete
- [x] Ensure SDK exports a single primary `HarakiriClient`.
- [x] Ensure namespaced helpers are discoverable:
      `commands`, `files`, `routes`, `templates`, `egress`.
- [x] Export stable error classes and retryability metadata.
- [x] Export public type aliases for common integration surfaces:
      sandbox, command, file, route, egress, template, and capability responses.
- [x] Add quickstart examples for:
      create sandbox, run command, write/read file, expose preview route,
      restricted egress, detached dev server, and cleanup.
- [x] Add a "known lifecycle semantics" section:
      TTL, renew, kill, and current pause/snapshot status.
- [x] Add integration notes for agent systems:
      idempotency keys, long-running commands, route protection, egress, and
      artifact persistence.
- [x] Add a typed SDK smoke example under `examples/` that can run against
      `https://sb-api.harakiri.io` with an API key.

### Phase 6: Premium CLI Experience
**Status**: Complete
- [x] Ensure `harakiri --help` and command help read as a product, not a test
      harness.
- [x] Add install docs for npm global install, npx execution, and local tarball
      testing.
- [x] Add first-run guidance:
      `harakiri login --api-url ... --api-key ...`.
- [x] Add version output that includes CLI version and optionally API/server
      compatibility when configured.
- [x] Standardize CLI error formatting for auth failures, provider
      unavailability, validation errors, and missing config.
- [x] Confirm CLI examples use public URLs by default in docs:
      `https://sb-api.harakiri.io`.
- [x] Add a CLI smoke script that creates a sandbox, runs a command, exposes a
      route lifecycle, and cleans up against a configured API.

### Phase 7: Release Automation And Supply Chain Safety
**Status**: Complete
- [x] Add a release checklist document in `docs/release-notes/` or
      `docs/integrations/`.
- [x] Add package scripts:
      `pack:sdk`, `pack:cli`, `publish:dry-run`, `publish:local-check`, and
      `publish:postcheck`.
- [x] Add CI workflow steps for:
      typecheck, tests, build, OpenAPI check, package dry-runs, tarball install
      smoke tests, and CLI binary smoke.
- [x] Prefer npm trusted publishing with GitHub Actions provenance for official
      releases.
- [x] Document maintainer fallback:
      `npm login`, 2FA/OTP expectations, and manual publish order.
- [x] Add a prepublish guard that refuses to publish from a dirty worktree or
      without passing package smoke checks.
- [x] Add an automated check that package versions are aligned between SDK and
      CLI for coordinated releases.

### Phase 8: Clean External Install Verification
**Status**: Complete
- [x] Create temporary external projects outside the monorepo for smoke tests.
- [x] Install packed SDK tarball into a clean Node/TypeScript project.
- [x] Compile a small TypeScript SDK example with `tsc`.
- [x] Run a JavaScript SDK example against the deployed Harakiri API when
      `HARAKIRI_API_KEY` is available.
- [x] Install packed CLI tarball globally or into a temp npm prefix.
- [x] Run `harakiri --version`, `harakiri help`, and a no-auth command error
      check.
- [x] Run configured CLI conformance against the deployed k0s-backed API.
- [x] Confirm no package install pulls `@harakiri/shared`.

### Phase 9: Documentation And Website Update
**Status**: Complete
- [x] Update `packages/sdk/README.md` for npm installation and clean examples.
- [x] Update `packages/cli/README.md` for npm global install and first run.
- [x] Update `docs/sdk.md` with public package installation and API key setup.
- [x] Update website docs content to show npm SDK/CLI install paths.
- [x] Add troubleshooting:
      npm login, org scope access, 2FA/OTP, package not found, API key issues,
      and public versus local API URLs.
- [x] Add a short "package policy" note:
      `@harakiri/shared` is internal and not published.
- [x] Add migration guidance for local prototype users currently running
      `node packages/cli/dist/index.js`.

### Phase 10: First Public Publish
**Status**: Complete
- [x] Verify npm account and org ownership:
      `npm whoami`, `npm org ls h-sandbox`.
- [x] Verify names are still available:
      `npm view @h-sandbox/sdk`, `npm view @h-sandbox/cli`.
- [x] Run full local checks:
      typecheck, tests, build, OpenAPI check, examples check, package smoke.
- [x] Publish `@h-sandbox/sdk` first with public access.
- [x] Install `@h-sandbox/sdk` from npm into a clean external project and run
      the quickstart compile smoke.
- [x] Publish `@h-sandbox/cli` with public access.
- [x] Install `@h-sandbox/cli` globally from npm and run `harakiri --version`.
- [x] Tag the release in git and write release notes.
- [x] Update docs to remove any "tarball until published" language.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-05-29 | Do not publish `@harakiri/shared` for the first public npm release | `shared` is an internal contract package; publishing it expands the public API surface and creates support obligations before the boundary is mature | Publish all three packages; rename shared to an explicitly internal package; merge all shared code into SDK manually |
| 2026-05-29 | Publish only `@h-sandbox/sdk` and `@h-sandbox/cli` | These are the two user-facing developer products and match the intended premium OSS experience | Publish a single package with SDK and CLI together; publish CLI only; publish SDK only |
| 2026-05-29 | Require clean external install smoke tests before real npm publish | Publish dry-runs validate packaging but do not prove the installed package works outside the monorepo | Rely only on `pnpm publish --dry-run`; publish manually and patch with `0.1.1` if broken |
| 2026-05-29 | Keep the SDK protocol and error surface SDK-owned for npm `0.1.0` | This removes the public dependency on `@harakiri/shared` and lets SDK consumers import one package with stable TypeScript autocomplete | Publish `@harakiri/shared`; generate SDK types during publish; keep workspace dependency and rely on npm publishing all packages |
| 2026-05-29 | Guard real publish from a dirty worktree but allow publish dry-runs in the current development tree | Real npm versions are immutable, while dry-run is needed during active implementation and should not mutate the registry | Block all dry-runs until the entire repository is clean; rely on maintainer discipline |
| 2026-05-29 | Stop before actual npm publish until explicit maintainer approval | `npm publish` is irreversible for a version and should be a deliberate release action after reviewing the tarball and package names | Publish immediately after local green checks |
| 2026-05-31 | Use `pnpm publish` instead of `npm publish` for workspace packages | The CLI source manifest intentionally uses `@h-sandbox/sdk: workspace:*`; pnpm rewrites that dependency to the package version in the public tarball, while npm is not the correct publisher for this workspace boundary | Replace the source dependency with an exact version before every release; publish SDK, then manually edit CLI package metadata |
| 2026-05-31 | Add a dedicated post-publish smoke command | The final release needs proof that npm registry installs work, not just local tarballs; `pnpm publish:postcheck` gives one repeatable command for SDK compile and CLI binary verification | Keep manual npm install steps only; rely on workflow publish success |
| 2026-05-31 | Use npm scope `@h-sandbox` for the public SDK and CLI | The npm organization name is `h-sandbox`, and the authenticated maintainer has owner access there; publishing under `@harakiri` would target the wrong scope | Keep `@harakiri/sdk` and request access to a separate npm org |
| 2026-05-31 | Keep real publish pending until npm 2FA publish requirements are satisfied | npm accepts the credentials for identity and org ownership but rejects package publish with `E403` requiring either a current OTP or a granular token with publish 2FA bypass | Retry with the same token; disable account 2FA; publish from an unknown credential |
| 2026-06-01 | Publish `@h-sandbox/sdk` before `@h-sandbox/cli` | The CLI package depends on the SDK, and pnpm rewrites the workspace dependency to `0.1.0` in the packed public manifest | Publish both simultaneously; publish CLI first |
| 2026-06-01 | Wait for npm packument propagation before publishing the CLI | npm accepted the SDK publish and exposed dist-tags/access metadata before `npm view` could read the package document; waiting avoided building the CLI release on an unverified registry state | Publish CLI immediately after the SDK publish success message |

## Tech Debt Incurred
- SDK-local protocol and error definitions intentionally duplicate the public
  subset of the internal shared package for `0.1.0`. This keeps npm clean, but
  the next refactor should add a generation step or explicit public-contract
  source of truth so SDK and server DTOs cannot drift.
- Live deployed-API SDK/CLI conformance is now automated through temporary API
  keys, but it still depends on Keycloak and the target API being reachable.

## Completion Notes
Implementation and first public publish are complete.

Package boundary changes:

- `@h-sandbox/sdk` no longer depends on `@harakiri/shared`; SDK-owned protocol
  and API error modules are compiled into the SDK tarball.
- `@h-sandbox/cli` no longer imports or depends on `@harakiri/shared`; it uses
  SDK exports plus normal public dependencies.
- Both package manifests now include public npm metadata, Node engine policy,
  `publishConfig.access=public`, and `prepublishOnly` guards.

Release automation added:

- Root scripts: `pack:sdk`, `pack:cli`, `package:assert`,
  `publish:local-check`, `publish:dry-run`, and `publish:postcheck`.
- `scripts/assert-public-packages.mjs` verifies the public package boundary,
  aligned SDK/CLI versions, clean `dist`, and no `@harakiri/shared` references.
- `scripts/npm-package-smoke.sh` packs both packages, inspects tarballs,
  installs the SDK into a clean TypeScript project, installs the CLI into a
  clean npm prefix, and runs binary smoke checks.
- `.github/workflows/npm-release.yml` provides a manual npm release path with
  provenance/trusted publishing support and post-publish registry verification.

Verification evidence:

- `npm view @h-sandbox/sdk version` returned 404, confirming no public package
  currently occupies the name.
- `npm view @h-sandbox/cli version` returned 404, confirming no public package
  currently occupies the name.
- `npm whoami` returned `nabilblk`.
- `npm org ls h-sandbox` returned `nabilblk - owner`.
- `pnpm openapi:check` passed.
- `pnpm examples:check` passed.
- `pnpm --filter @h-sandbox/sdk test` passed: 18 tests.
- `pnpm --filter @h-sandbox/cli test` passed: 27 tests.
- `pnpm --filter @h-sandbox/sdk typecheck` passed.
- `pnpm --filter @h-sandbox/cli typecheck` passed.
- `pnpm --filter @harakiri/web typecheck` passed.
- `pnpm --filter @harakiri/web build` passed.
- `pnpm publish:local-check` passed.
- `pnpm publish:dry-run` passed for `@h-sandbox/sdk@0.1.0` and
  `@h-sandbox/cli@0.1.0`.
- Real `pnpm publish --access public --no-git-checks` for `@h-sandbox/sdk`
  reached npm and failed with `E403` because the configured credentials require
  either a current 2FA OTP or a granular publish token with 2FA bypass enabled.
- A follow-up real publish attempt after re-verifying `nabilblk` owner access to
  `h-sandbox` failed with the same npm `E403` 2FA publish gate; no package was
  published.
- After the maintainer reconfigured the npm token on 2026-06-01, real publish
  succeeded for `@h-sandbox/sdk@0.1.0`.
- `npm view @h-sandbox/sdk@0.1.0 version` returned `0.1.0`.
- A clean external install of `@h-sandbox/sdk@0.1.0` compiled the TypeScript
  quickstart and imported `HarakiriClient`.
- Real publish succeeded for `@h-sandbox/cli@0.1.0`.
- `npm view @h-sandbox/cli@0.1.0 version` returned `0.1.0`.
- `bash -n scripts/npm-postpublish-smoke.sh` passed.
- `pnpm publish:postcheck` passed against the npm registry.
- Packed `@h-sandbox/cli` manifest resolves `@h-sandbox/sdk` to `0.1.0` and
  contains no `workspace:*` dependency.
- `pnpm conformance:sdk` passed against the reachable deployed API using a
  temporary API key.
- `pnpm conformance:cli` passed against the reachable deployed API using a
  temporary API key.
- `git diff --check` passed.

Published packages:

- `@h-sandbox/sdk@0.1.0`
- `@h-sandbox/cli@0.1.0`

Release note:

- `docs/release-notes/npm-sdk-cli-0.1.0.md`

Git tag:

- `npm-v0.1.0`
