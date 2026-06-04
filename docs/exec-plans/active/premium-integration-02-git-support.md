# Execution Plan: Premium Integration 02 Git Support

**Created**: 2026-06-03
**Author**: Codex
**Status**: In Progress
**Priority**: {P0-P3}
**Estimated effort**: 1-2 engineering weeks

## Context
Agent and developer-tool sandboxes usually start from source code. Today
Harakiri examples clone repositories by running raw shell commands inside the
sandbox. That works, but it leaves every integrator to solve authentication,
secret redaction, shallow clone options, branch checkout, status parsing, git
identity, and push/pull ergonomics on their own.

E2B's Git integration documentation presents the target class of experience:
`sandbox.git` methods for authentication, clone, branch/status inspection,
branch management, add/commit, pull/push, remotes, and git config. Harakiri
should offer a similarly first-class developer experience while preserving its
OSS architecture boundary: Git operations run through Harakiri's public runtime
command/session APIs and OpenSandbox-supported transport, not direct Kubernetes
pod exec.

Reference: https://e2b.dev/docs/sandbox/git-integration

## Success Criteria
- [x] `@h-sandbox/sdk` exposes `sandbox.git` and/or `harakiri.git` helpers for
      common Git workflows.
- [x] `createSandbox` supports an optional source bootstrap contract for Git
      repositories, including URL, branch, commit, target path, shallow clone,
      submodule policy, and optional credentials.
- [x] Git credentials can be passed safely for a single operation without being
      persisted in `.git/config` by default.
- [x] Any intentionally persisted credential mode is explicit, named with a
      danger prefix, documented, and auditable.
- [x] Git command output, route logs, command logs, UI, and API errors redact
      tokens and passwords.
- [x] Public/private repository clone, status, branch, commit, pull, push,
      remotes, and config are documented and tested.
- [ ] Egress restrictions are handled clearly: Git presets can be applied at
      sandbox creation, and failed Git network access produces actionable
      errors.
- [x] The implementation uses tracked command/session primitives and does not
      introduce Kubernetes exec fallback.

## Phases

### Phase 1: Contract Design
**Status**: Complete
- [x] Define `SandboxGitOptions`, `GitCredentials`, `GitCloneOptions`,
      `GitStatus`, `GitBranchList`, `GitRemote`, and `GitCommitOptions`.
- [x] Define source bootstrap input on `CreateSandboxInput`, for example
      `source: { type: "git", url, branch?, commit?, path?, depth?,
      submodules?, credentials?, egressPreset? }`.
- [x] Define credential modes:
      one-shot inline credentials, credential helper authentication, and
      intentionally stored remote credentials.
- [x] Choose safe defaults: credentials stripped from remote URLs, shallow clone
      optional, no implicit push credentials, and redacted logs.
- [x] Define provider capability metadata for Git support so API/UI/SDK can
      report unavailable Git behavior honestly.

### Phase 2: API And Control Plane State
**Status**: In Progress
- [x] Add API schemas for source bootstrap and Git source provenance responses.
- [x] Store sanitized Git provenance on sandbox records: repo URL without
      credentials, branch, commit, target path, status, duration, and failure
      reason.
- [x] Add explicit Git operation audit events for commit, push, pull, and config
      changes.
- [x] Add sanitized source provenance on create/queued audit metadata, plus
      source update audit/events for cloning, ready, failed, and cleared states.
- [x] Add secret-redaction helpers shared by API services, logs, and command
      response formatting.
- [x] Ensure idempotency keys keep the sanitized source bootstrap request in the
      queued operation payload.

### Phase 3: Runtime Git Operations
**Status**: Complete
- [x] Implement Git operations by composing Harakiri tracked commands and
      command sessions.
- [x] Add `git.clone(url, options)` with branch, depth, path, submodules, and
      credential options.
- [x] Add `git.status(path)` with structured branch, ahead/behind, and file
      status parsing.
- [x] Add branch helpers: list, checkout, create, and delete.
- [x] Add `git.add`, `git.commit`, `git.pull`, `git.push`, `git.remoteAdd`,
      `git.setConfig`, `git.getConfig`, and `git.configureUser`.
- [x] Detect missing `git` binary and return a typed unsupported-runtime error
      with template guidance.

### Phase 4: SDK And CLI Experience
**Status**: Complete
- [x] Add SDK helpers on the new runtime class and on the existing client where
      appropriate.
- [x] Add CLI commands such as `harakiri git clone`, `git status`, `git push`,
      or a practical subset if command count becomes too large.
- [x] Add `harakiri create --git <url>` with branch, path, depth, and preset
      flags for the common bootstrap path.
- [x] Ensure CLI secret handling uses env vars, prompts, or config references
      rather than showing tokens in shell history.
- [x] Keep all Git helpers generic and not specific to any downstream project.

### Phase 5: Documentation
**Status**: Complete
- [x] Add Git integration docs to `docs/sdk.md`, `packages/sdk/README.md`, and
      website docs.
- [x] Include examples for public clone, private clone with one-shot token,
      configure identity, branch, commit, push, and source bootstrap during
      sandbox creation.
- [x] Add troubleshooting for missing git binary, private repo auth failures,
      egress blocked, branch not found, dirty worktree, and push rejected.
- [x] Explicitly explain credential persistence risks and redaction limits.

### Phase 6: Verification
**Status**: In Progress
- [x] Unit test command composition and structured parser behavior.
- [x] Mock API/SDK tests for Git helpers, create-source payloads, capability
      metadata, and redaction behavior.
- [ ] Live smoke public repo clone in k0s.
- [ ] Live smoke private repo clone using a short-lived test token if available.
- [ ] Verify no token appears in API logs, command logs, CLI output, DB
      provenance, or browser UI.
- [x] Run SDK/API/CLI typecheck, tests, build, OpenAPI generation/check, and
      `git diff --check`.
      Shared, SDK, CLI, and API tests passed. Shared, SDK, CLI, API, and web
      typechecks passed. API, web, and CLI builds passed. OpenAPI write/check
      and `git diff --check` passed. Live k0s clone smokes remain.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-06-03 | Model Git as a first-class SDK/CLI surface inspired by E2B's `sandbox.git` docs | Source checkout is a common agent workflow and should not require every integrator to hand-roll shell commands. | Leave Git as raw command examples; create a project-specific adapter; depend on direct Kubernetes exec. |
| 2026-06-03 | Default to one-shot credentials and strip credentials from remotes | Private repo support is necessary, but storing credentials inside the sandbox should be explicit and risky by name. | Always store credentials; require only public repositories; hide credentials in a global Harakiri secret store before a clear product design. |
| 2026-06-04 | Implement the first slice in the SDK/CLI instead of changing the API schema | This ships a useful public integration surface immediately while keeping the API body stable and preserving the OpenSandbox control-plane boundary. | Add server-side Git endpoints and provenance first; keep Git as docs-only shell snippets. |
| 2026-06-04 | Use `GIT_ASKPASS` for default private repository credentials | Passing credentials in repository URLs can leak through provider stderr or stored command logs. Askpass keeps command text and Git remotes credential-free by default. | Credentialed URL expansion; persistent credential helpers; direct Kubernetes exec. |

## Tech Debt Incurred
Current slice leaves dashboard source provenance UI and live k0s Git smoke
tests for follow-up.
If shell-based Git command composition becomes too complex, track the follow-up
to move to a small in-sandbox Git helper binary or provider-native Git API once
OpenSandbox exposes one.

## Completion Notes
2026-06-04 slice:
- Added SDK `client.git.*` and `sandbox.git.*` helpers for clone, status,
  branches, checkout, create branch, add, commit, pull, push, remotes, config,
  and Git user configuration.
- Added SDK `createSandbox({ source: { type: "git" } })` bootstrap. The SDK
  sends only sanitized source provenance to `/v1/sandboxes`, waits for the
  sandbox to become ready, then uses tracked command APIs for the clone.
- Added CLI `harakiri git ...` commands and `harakiri create --git ...`.
- Added one-shot token handling through env vars and `GIT_ASKPASS`, with
  `dangerously-store-in-remote` / `--preserve-credentials` as the explicit
  persistent credential mode.
- Updated SDK docs, CLI docs, website docs, and examples.
- Verified SDK tests/typecheck, CLI tests/typecheck/build, examples typecheck,
  web typecheck, and `git diff --check`.

2026-06-04 redaction/capability slice:
- Added the `git` runtime capability to shared protocol types, the SDK
  protocol mirror, OpenAPI generation, and API capability responses. It reports
  as a Harakiri control-plane overlay and remains degraded when command
  execution exists but template-level Git availability is not guaranteed.
- Redacted command text, command stdout/stderr/errors, command logs, command
  session output, sandbox event messages, and sandbox event metadata before
  API responses or persistence.
- Kept raw commands flowing to the runtime provider so one-shot credential
  workflows still work while stored command records remain sanitized.
- Added branch deletion support to `sandbox.git`, `client.git`, and
  `harakiri git branch-delete` / `branch-rm`.
- Added troubleshooting docs for missing Git binaries, private repository auth,
  egress blocks, branch errors, dirty worktrees, missing commit identity, and
  push failures across SDK, CLI, and website docs.
- Verified shared, SDK, CLI, and API tests; shared, SDK, CLI, API, and web
  typechecks; API, web, and CLI builds; OpenAPI write/check; and
  `git diff --check`.

2026-06-04 missing-runtime slice:
- Added `HarakiriGitUnsupportedRuntimeError`, a typed SDK subclass for the
  known `git binary not found in sandbox image` case. It exposes stable
  `code: "git_runtime_unsupported"`, `reason: "missing_git_binary"`, and
  `templateGuidance` fields.
- Kept normal non-zero Git commands on `HarakiriGitCommandError`, so ordinary
  Git failures continue to expose the redacted command result.
- Added SDK and CLI regression tests for the missing-Git path; the CLI now
  prints template guidance through the same top-level error handling path.
- Updated SDK, CLI, product docs, and website docs to document the typed error.
- Verified SDK tests/typecheck, CLI tests/build, and web typecheck for this
  slice.

2026-06-04 source-provenance slice:
- Added `source_provenance` persistence on sandbox records with sanitized Git
  URL, branch, commit, target path, status, duration, and redacted failure
  reason.
- Added create-source and patch-source protocol types, OpenAPI schemas, API
  validation, and `PATCH /v1/sandboxes/{id}/source`.
- Updated SDK `createSandbox({ source })` to send sanitized source metadata,
  patch status through `cloning`, `ready`, or `failed`, and never send Git
  credentials to the API provenance contract.
- Added API service tests, SDK tests, CLI tests, shared OpenAPI surface tests,
  and regenerated `docs/openapi.json`.
- Updated SDK, CLI, product, and website docs to describe sanitized source
  provenance and the safe dashboard/reconnect use case.
- Verified shared, SDK, CLI, and API tests; shared, SDK, CLI, API, and web
  typechecks; API, web, and CLI builds; OpenAPI write/check; and
  `git diff --check`.

2026-06-04 Git audit metadata slice:
- Added constrained `SandboxCommandMetadata` / `SandboxGitOperationMetadata`
  to the public runtime command contract and OpenAPI document.
- SDK Git helpers now send sanitized operation metadata for clone, status,
  branch, commit, pull, push, remote, config, and configure-user operations.
- API runtime command handling records structured `git.*` sandbox events for
  Git helper calls and `sandbox.git.*` audit entries for mutating operations.
- Metadata sanitization strips URL credentials and redacts sensitive strings
  before events or audit records are persisted.
- Verified SDK tests/typecheck, API tests/typecheck, shared tests,
  OpenAPI write/check, and CLI tests for this slice.
