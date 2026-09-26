# Execution Plan: Reliable Framework Workflows

**Created**: 2026-09-25
**Author**: Codex
**Status**: Completed
**Priority**: User-selected next milestone
**Estimated effort**: Multi-session, cross-package implementation and qualification

## Context

The TypeScript SDK and published Deep Agents preview already expose real sandbox
execution. The next milestone is reliability in application workflows, not more
framework adapters. The user selected items 1-3 of the SDK/framework backlog:
bounded requests and cancellation, persistent framework recovery, and installation
and compatibility. Assessment uses current source, not older active plans.

The SDK currently exposes cancellation inconsistently; its shared JSON transport
does not bound response-body reads. Deep Agents only checks cancellation between
some operations. The checkpoint example uses MemorySaver within one process, not
durable recovery. Installed consumer CI covers Node 20/22 although Node 20 is EOL.

## Scope And Boundaries

- Core SDK stays framework-independent. Frameworks own checkpoints and approvals;
  Harakiri owns runtime execution, lifecycle, capacity and policy.
- Preserve existing method shapes with additive request options. Separate HTTP
  deadlines, remote execution timeouts, observation budgets and sandbox TTL.
- Never retry command submission automatically. An unacknowledged submission has
  an unknown outcome; cancellation does not prove remote work was stopped.
- Durable examples use real LangGraph/Deep Agents and an official PostgreSQL
  checkpointer. No custom checkpoint framework, Kubernetes exec or provider bypass.
- Examples must authorize tenant/thread/resource associations before connecting.
  A replacement sandbox cannot inherit a previous runtime's command identifiers.
- No changes to the running k0s cluster, customer OpenShift, host supervisors,
  ports, registries, npm tags or releases. Tests use disposable owned resources.
- Do not inspect or change Brain, customer installation files or docs/cot.
- Deferred: Python SDK, additional framework packages, general progress telemetry,
  streaming large files and generic exactly-once command execution.

## Success Criteria

- [x] Shared JSON requests include fetch and response-body deadlines with typed
  timeout failures, caller cancellation, configurable defaults and per-call options.
- [x] Commands, files and framework paths propagate request options without
  serializing them into API payloads; no automatic mutation retries are introduced.
- [x] Adapter failures retain references/causes/completed paths; cleanup remains
  independent of an aborted task signal.
- [x] A PostgreSQL-backed example survives separate worker processes and human
  approval, observes an acknowledged command without resubmission, and handles
  rejection, wrong ownership and expired sandbox/workspace recovery explicitly.
- [x] Installed npm/pnpm consumers and supported Node LTS versions have automated
  compatibility gates, with explicit legacy Node 20 policy and scheduled checks.
- [x] Public and repository docs explain installation, execution ownership,
  cancellation, durable recovery, expiry, limitations and verification commands.
- [x] Qualification records distinguish local contracts/real PostgreSQL from
  native runtime/model acceptance, with no unsupported completion claims.
- [x] The new native recovery gate passes on an isolated authorized runner and
  produces a reviewed receipt before the milestone is closed.

## Phases

### Phase 1: Transport And Framework Reliability
**Status**: Complete
- [x] Introduce a small transport/deadline module with focused fault tests.
- [x] Propagate request controls through command/process/file/lifecycle entry points.
- [x] Bound adapter submissions, final logs and in-flight transfers; preserve errors.
- [x] Run SDK, adapter, type-contract and regression tests.

### Phase 2: Persistent Workflow Reference
**Status**: Complete
- [x] Inspect official persistent checkpointer and interrupt contracts.
- [x] Implement an independently runnable persistent example with explicit ownership.
- [x] Add separate-process PostgreSQL tests for interruption/resumption and failures.
- [x] Connect the scenario to isolated native acceptance without touching the lab.
- [x] Run and review the native gate on an authorized disposable GitHub runner.

### Phase 3: Compatibility And Packaging
**Status**: Complete
- [x] Test a minimal direct dependency set rather than requiring unnecessary pins.
- [x] Qualify npm/pnpm consumers and Node 22/24; document Node 20 legacy status.
- [x] Add bounded scheduled upstream compatibility checks with no publishing rights.

### Phase 4: Documentation And Acceptance
**Status**: Complete
- [x] Update SDK/adapter READMEs, integration guide and public docs.
- [x] Add technical recovery/compatibility guidance and unreleased delivery notes.
- [x] Run package, documentation and workflow checks; inspect the final diff.
- [x] Record acceptance evidence and archive the completed implementation plan.

## Decision Log
| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-09-25 | Implement current backlog items 1-3 as one milestone | Selected by the user; prioritizes reliable adoption over adapter breadth | Additional frameworks or Python first |
| 2026-09-25 | Keep durable workflow orchestration in a reference application | Avoid coupling the SDK to a framework or owning tenant authorization/checkpoint storage | Ship a workflow engine in the adapter |
| 2026-09-25 | No automatic submission retries or exactly-once claims | HTTP failures can occur after remote effects; existing command references support observation only | Retry mutations after every timeout |
| 2026-09-25 | Bind approval to the exact checkpoint ID | A delayed approval must not authorize a newer pending action | Resume the latest interrupt using only a thread ID |
| 2026-09-25 | Qualify minimal and full dependency manifests in separate clean installs | pnpm can retain nominally incompatible dependency instances after incremental graph changes | Suppress TypeScript errors or force undocumented peer overrides |
| 2026-09-25 | Push a dedicated PR and run disposable GitHub-hosted acceptance | Explicit user approval; native recovery must be proven without touching the running lab | Using the host's existing k0s cluster |

## Tech Debt Incurred

None recorded yet. Cross-service submission/checkpoint atomicity is an explicit
existing boundary, not something this milestone can promise away.

## Completion Notes

Implementation and local qualification are complete. See the
[delivery record](../../release-notes/reliable-framework-workflows.md) for counts,
runtime versions, commands and evidence boundaries. [PR #59](https://github.com/nabilblk/h-sandbox/pull/59)
contains the implementation on `codex/reliable-framework-workflows` at
`f1906749a19c17e8e2794b4d4fea20f6de17f227`. All 18 jobs in the
[CI run](https://github.com/nabilblk/h-sandbox/actions/runs/36137161697) passed,
including real PostgreSQL, clean npm/pnpm consumers on Node 20/22/24, browser
contracts, documentation and image builds without publication. Product demo
checks and the isolated SDK installation matrix also passed. No merge,
deployment or publication has been performed for this milestone.

The user approved a dedicated branch/PR and disposable GitHub-hosted acceptance
on 2026-09-25. [Native run 36137161754](https://github.com/nabilblk/h-sandbox/actions/runs/36137161754)
passed all 16 gates, including persistent approvals, worker-crash observation
without resubmission, real server-side expiry, retained-file recovery and the
separate digest-pinned real-model repair. The reviewed
[receipt](../../release-notes/reliable-framework-workflows.acceptance.json)
confirms cleanup and private-material removal. The tested PR merge candidate
and pushed implementation have the same tree. The k0s lab was not accessed.
This closes implementation and qualification, not a release or deployment.
Approval did not authorize merging, publication or deployment.
Release versioning and publication require a separate SDK-first release; unchanged
package version numbers do not mean registry artifacts contain these changes.
