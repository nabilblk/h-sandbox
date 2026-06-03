# Execution Plan: Premium Integration 02 Git Support

**Created**: 2026-06-03
**Author**: Codex
**Status**: Not Started
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
- [ ] `@h-sandbox/sdk` exposes `sandbox.git` and/or `harakiri.git` helpers for
      common Git workflows.
- [ ] `createSandbox` supports an optional source bootstrap contract for Git
      repositories, including URL, branch, commit, target path, shallow clone,
      submodule policy, and optional credentials.
- [ ] Git credentials can be passed safely for a single operation without being
      persisted in `.git/config` by default.
- [ ] Any intentionally persisted credential mode is explicit, named with a
      danger prefix, documented, and auditable.
- [ ] Git command output, route logs, command logs, UI, and API errors redact
      tokens and passwords.
- [ ] Public/private repository clone, status, branch, commit, pull, push,
      remotes, and config are documented and tested.
- [ ] Egress restrictions are handled clearly: Git presets can be applied at
      sandbox creation, and failed Git network access produces actionable
      errors.
- [ ] The implementation uses tracked command/session primitives and does not
      introduce Kubernetes exec fallback.

## Phases

### Phase 1: Contract Design
**Status**: Not Started
- [ ] Define `SandboxGitOptions`, `GitCredentials`, `GitCloneOptions`,
      `GitStatus`, `GitBranchList`, `GitRemote`, and `GitCommitOptions`.
- [ ] Define source bootstrap input on `CreateSandboxInput`, for example
      `source: { type: "git", url, branch?, commit?, path?, depth?,
      submodules?, credentials?, egressPreset? }`.
- [ ] Define credential modes:
      one-shot inline credentials, credential helper authentication, and
      intentionally stored remote credentials.
- [ ] Choose safe defaults: credentials stripped from remote URLs, shallow clone
      optional, no implicit push credentials, and redacted logs.
- [ ] Define provider capability metadata for Git support so API/UI/SDK can
      report unavailable Git behavior honestly.

### Phase 2: API And Control Plane State
**Status**: Not Started
- [ ] Add API schemas for source bootstrap and Git operation responses.
- [ ] Store sanitized Git provenance on sandbox records: repo URL without
      credentials, branch, commit, target path, status, duration, and failure
      reason.
- [ ] Add audit events for clone, auth mode selection, commit, push, and source
      bootstrap failures.
- [ ] Add secret-redaction helpers shared by API services, logs, and command
      response formatting.
- [ ] Ensure idempotency keys work when source bootstrap is requested.

### Phase 3: Runtime Git Operations
**Status**: Not Started
- [ ] Implement Git operations by composing Harakiri tracked commands and
      command sessions.
- [ ] Add `git.clone(url, options)` with branch, depth, path, submodules, and
      credential options.
- [ ] Add `git.status(path)` with structured branch, ahead/behind, and file
      status parsing.
- [ ] Add branch helpers: list, checkout, create, and delete.
- [ ] Add `git.add`, `git.commit`, `git.pull`, `git.push`, `git.remoteAdd`,
      `git.setConfig`, `git.getConfig`, and `git.configureUser`.
- [ ] Detect missing `git` binary and return a typed unsupported-runtime error
      with template guidance.

### Phase 4: SDK And CLI Experience
**Status**: Not Started
- [ ] Add SDK helpers on the new runtime class and on the existing client where
      appropriate.
- [ ] Add CLI commands such as `harakiri git clone`, `git status`, `git push`,
      or a practical subset if command count becomes too large.
- [ ] Add `harakiri create --git <url>` with branch, path, depth, and preset
      flags for the common bootstrap path.
- [ ] Ensure CLI secret handling uses env vars, prompts, or config references
      rather than showing tokens in shell history.
- [ ] Keep all Git helpers generic and not specific to any downstream project.

### Phase 5: Documentation
**Status**: Not Started
- [ ] Add Git integration docs to `docs/sdk.md`, `packages/sdk/README.md`, and
      website docs.
- [ ] Include examples for public clone, private clone with one-shot token,
      configure identity, branch, commit, push, and source bootstrap during
      sandbox creation.
- [ ] Add troubleshooting for missing git binary, private repo auth failures,
      egress blocked, branch not found, dirty worktree, and push rejected.
- [ ] Explicitly explain credential persistence risks and redaction limits.

### Phase 6: Verification
**Status**: Not Started
- [ ] Unit test command composition and structured parser behavior.
- [ ] Mock API/SDK tests for all Git methods and create-source payloads.
- [ ] Live smoke public repo clone in k0s.
- [ ] Live smoke private repo clone using a short-lived test token if available.
- [ ] Verify no token appears in API logs, command logs, CLI output, DB
      provenance, or browser UI.
- [ ] Run SDK/API/CLI typecheck, tests, build, OpenAPI generation/check, and
      `git diff --check`.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-06-03 | Model Git as a first-class SDK/CLI surface inspired by E2B's `sandbox.git` docs | Source checkout is a common agent workflow and should not require every integrator to hand-roll shell commands. | Leave Git as raw command examples; create a project-specific adapter; depend on direct Kubernetes exec. |
| 2026-06-03 | Default to one-shot credentials and strip credentials from remotes | Private repo support is necessary, but storing credentials inside the sandbox should be explicit and risky by name. | Always store credentials; require only public repositories; hide credentials in a global Harakiri secret store before a clear product design. |

## Tech Debt Incurred
None planned. If shell-based Git command composition becomes too complex, track
the follow-up to move to a small in-sandbox Git helper binary or provider-native
Git API once OpenSandbox exposes one.

## Completion Notes
Fill in when complete.
