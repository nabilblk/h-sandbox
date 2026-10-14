# Execution Plan: Dependency Security Release Unblock

**Created**: 2026-10-10
**Author**: Codex, with Nabil
**Status**: Completed
**Priority**: Release prerequisite; numeric priority not assigned
**Estimated effort**: 1-2 engineering days, with external review separate

## Context

Python implementation PR #66 and delivery PR #68 are held by the existing
JavaScript dependency audit. Fresh inspection reports three high findings:
`braces` 3.0.3 through the TypeScript Deep Agents peer, `source-map-js` 1.2.1
through web/demo tooling, and `sharp` 0.35.4 in demo verification tooling.
Patched `source-map-js` 1.2.2 and `sharp` 0.35.5 are published. No patched
`braces` release is published; the upstream maintainer disputes the advisory.
The latest Deep Agents 1.14.2 still depends on the affected matcher tree, so a
framework upgrade alone does not remove the finding.

This is a separate branch from `main`. Preserve the Python branches and the
untracked user-owned `docs/cot/`. Do not read Brain or unrelated active plans.
No k0s, Lima, tunnel, customer installation, model or live sandbox operations.
Local checks use bounded subprocesses and synthetic transports; hosted CI may
use its existing disposable fixtures. No release or deployment is performed by
this dependency correction itself.

## Success Criteria

- [x] Published fixes resolve the affected `source-map-js` and `sharp` versions
  without unrelated lockfile or framework-version churn.
- [x] A bounded reproducer and actual framework-path tests distinguish installed
  vulnerable code from reachable Harakiri behavior; no blanket safety claim.
- [x] Any `braces` correction or risk decision is explicit, tested, reviewable
  and does not silently lower the workspace audit threshold or hide other paths.
- [x] Installed consumers retain documented matching behavior and public API
  compatibility; repository, package, web and demo checks pass as applicable.
- [x] A dedicated PR records evidence, remaining risks and the next release gate.

## Phases

### Phase 1: Establish Exposure and Apply Published Fixes

**Status**: Complete

- [x] Recheck registry versions, advisory state and the actual dependency paths.
- [x] Follow framework glob, grep, permission and local/remote backend paths.
- [x] Reproduce the advisory only inside resource/time-bounded subprocesses.
- [x] Apply narrow security floors and update the directly pinned demo dependency.

### Phase 2: Resolve the Unpatched Dependency Deliberately

**Status**: Complete

- [x] Choose the smallest maintainable correction from proven exposure, not the
  audit label alone; document any limitation of a repository-only patch for npm
  peer consumers.
- [x] Add regression and ordinary-pattern compatibility tests against installed
  framework packages, including boundary cases and failure reporting.
- [x] Require explicit review for any scoped, expiring risk exception. A hidden
  ignore, fabricated fixed version or downgrade of the audit gate is not a fix.

### Phase 3: Qualify and Deliver the Correction

**Status**: Complete

- [x] Run focused checks and inspect the regenerated dependency diff.
- [x] Run complete relevant checks on the dedicated branch; use hosted PostgreSQL
  and browser CI rather than the developer's running services.
- [x] Document exact results, support boundaries and release impact.
- [x] Commit/push a dedicated PR without merging or publishing failing changes.
- [x] Update this plan after qualification; keep incomplete gates explicit.

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
| --- | --- | --- | --- |
| 2026-10-10 | Use a clean worktree based on `main` for the security correction. | Independent review and backport into the Python delivery chain without changing its package artifacts. | Mix the fix into the publishing PR. |
| 2026-10-10 | Preserve the current audit gate while assessing `braces`. | Upstream has no published fix; dependency presence and actual exposure must be distinguished with evidence. | Blanket ignore; fabricated 3.0.4 override; unqualified framework upgrade. |
| 2026-10-14 | Accept only the exact two tested `braces` paths until 2026-11-13T00:00:00Z, with owner approval. | Nabil explicitly approved the 30-day exception after reviewing remote versus local exposure. CI checks versions, paths, report completeness, expiry and actual matcher-boundary tests. | Blanket ignore; indefinite waiver; pretend a repository patch protects independent peer consumers. |

## References

- [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
- [Upstream discussion](https://github.com/micromatch/braces/issues/70)
- [source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
- [sharp advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)
- [Python implementation](https://github.com/nabilblk/h-sandbox/pull/66)
- [Python delivery](https://github.com/nabilblk/h-sandbox/pull/68)

## Tech Debt Incurred

The unresolved `braces` advisory is accepted only under the scoped gate described
in [the exposure report](../../security/dependency-audit-2026-10.md). Owner:
`nabilblk`; expiry: 2026-11-13T00:00:00Z. Remove after an upstream correction is
qualified or the dependency is removed. Renewal requires explicit review.
Follow-up: [issue #70](https://github.com/nabilblk/h-sandbox/issues/70), assigned
to `nabilblk`. Completing this delivery plan does not resolve that advisory.

## Completion Notes

Delivered on October 14 through [PR #69](https://github.com/nabilblk/h-sandbox/pull/69),
merged as `a9035431b71fe5361c73b934fc47d84ba37c1637` after all checks passed.
Full workspace build, Deep Agents typecheck, 47 focused
adapter/framework tests, 105 web tests and seven audit-policy tests pass. The
matcher suite includes five exposure tests. Hosted
[repository CI](https://github.com/nabilblk/h-sandbox/actions/runs/38622474759)
passed, including PostgreSQL/browser contracts, image builds and all six
Node 20/22/24 npm/pnpm framework consumers.
[Demo checks](https://github.com/nabilblk/h-sandbox/actions/runs/38622474682) and
[native SDK acceptance](https://github.com/nabilblk/h-sandbox/actions/runs/38622474214)
also passed, including the real model repair and owned cleanup on disposable
infrastructure. No local model, live sandbox, package publication or existing
deployment change was performed by this correction. Python publication remains
a separate delivery gate.
