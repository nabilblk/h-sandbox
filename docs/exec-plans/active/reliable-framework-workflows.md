# Execution Plan: Reliable Framework Workflows

**Created**: 2026-09-25
**Author**: Codex
**Status**: Remote Qualification In Progress
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
- [ ] The new native recovery gate passes on an isolated authorized runner and
  produces a reviewed receipt before the milestone is closed.

## Phases

### Phase 1: Transport And Framework Reliability
**Status**: Complete
- [x] Introduce a small transport/deadline module with focused fault tests.
- [x] Propagate request controls through command/process/file/lifecycle entry points.
- [x] Bound adapter submissions, final logs and in-flight transfers; preserve errors.
- [x] Run SDK, adapter, type-contract and regression tests.

### Phase 2: Persistent Workflow Reference
**Status**: Implemented; native acceptance pending
- [x] Inspect official persistent checkpointer and interrupt contracts.
- [x] Implement an independently runnable persistent example with explicit ownership.
- [x] Add separate-process PostgreSQL tests for interruption/resumption and failures.
- [x] Connect the scenario to isolated native acceptance without touching the lab.
- [ ] Run and review the native gate on an authorized disposable GitHub runner.

### Phase 3: Compatibility And Packaging
**Status**: Complete Locally; Remote CI Pending
- [x] Test a minimal direct dependency set rather than requiring unnecessary pins.
- [x] Qualify npm/pnpm consumers and Node 22/24; document Node 20 legacy status.
- [x] Add bounded scheduled upstream compatibility checks with no publishing rights.

### Phase 4: Documentation And Acceptance
**Status**: Documentation And Local Checks Complete; Native Acceptance Pending
- [x] Update SDK/adapter READMEs, integration guide and public docs.
- [x] Add technical recovery/compatibility guidance and unreleased delivery notes.
- [x] Run package, documentation and workflow checks; inspect the final diff.
- [ ] Record remaining acceptance evidence honestly and archive only when complete.

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
runtime versions, commands and evidence boundaries. No deployment, publication,
push or native runtime acceptance has been performed for this milestone.

The user approved a dedicated branch/PR and disposable GitHub-hosted acceptance
on 2026-09-25. The remaining gate is the new isolated native-runtime scenario.
Do not use the running lab as a substitute. Keep this plan active until that
receipt passes. This approval does not authorize merging, publication or deployment.
Release versioning and publication require a separate SDK-first release; unchanged
package version numbers do not mean registry artifacts contain these changes.
