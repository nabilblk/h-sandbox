# Execution Plan: Organization Capacity Admission

**Created**: 2026-09-10
**Author**: Codex with the maintainer
**Status**: In Progress; rc.9 published, deployed and natively verified; registry headroom and explicitly unverified runtime matrix remain
**Priority**: P1; next agreed engineering step, point 2 in the roadmap
**Estimated effort**: 10-15 engineering days, provisional, excluding release approval and unavailable test infrastructure
**Source baseline**: `1fc0e7a4bfa67896d9313cf3ca3526539987ffdf`

## Context

### Cold-Start Readiness Follow-Up (September 11)

The owner authorized this engineering gate separately from registry storage and
publication. Native acceptance reproduced a lifecycle `running` response before
the execution daemon accepted connections. A read-only readiness observation must
precede the first workload; retrying writes or recreating the sandbox is not a fix.

- [x] Trace the lifecycle/execd race and verify OpenSandbox's authenticated `GET /ping` contract.
- [x] Add a provider-neutral, tenant-scoped readiness observation, independent of lifecycle and capacity.
- [x] Make synchronous HTTP creation and default SDK waiting require execution readiness; preserve accepted IDs, async creation, cancellation and bounded waits.
- [x] Cover delayed startup, unavailable health, authorization, transition races and first mutations submitted once with regression tests.
- [x] Prove first-write/first-command success on the isolated native k0s fixture and clean up only test-owned runtimes.
- [x] Document the readiness contract in API/SDK/public docs and record source acceptance separately from the completed rc.9 delivery receipt.

Design boundary: health probes do not mutate lifecycle, provision again, release
capacity, or retry commands/filesystem writes. Health is a point-in-time execution
service observation, not application/route readiness. No customer installer or
BackgroundAgent dependency is introduced.

The next step after publishing the standalone Kubernetes installation guide is
to make the organization's concurrency setting a real admission limit. Today,
`maxConcurrency` is a configuration target. The API and documentation correctly
say `concurrencyLimitEnforced: false`; this disclosure is not enforcement.

The product outcome is predictable shared use: developers can create, restore
and resume sandboxes without overrunning their organization's configured limit,
and can understand a rejection without inspecting provider or Kubernetes state.
Operators can recover from interrupted provisioning without guessing which
slots are safe to reuse.

This is a control-plane capability. OpenSandbox is the current execution
adapter, not the product identity or the place to implement organization policy.
Provider observations establish runtime facts; PostgreSQL owns admission.

The owner selected point 2, authorized implementation with "build it", then
requested "commit and deploy" on September 11. The current delivery scope is
protected-branch integration, matching immutable API/web deployment images and
coordinated migration/activation of the existing public k0s lab. A new npm/chart
release, credential rotation and changes to existing organization limits are not
part of this request. No Brain files are needed or modified. The unrelated
`docs/cot/` material remains outside scope.

Related work:

- [Roadmap and plan index](../README.md): capacity precedes the next major SDK expansion.
- [Kubernetes documentation](../completed/kubernetes-installation-docs.md) and
  [delivery](../completed/kubernetes-docs-deployment.md): installation guidance is
  published, not certification of every deployment profile.
- [Authorization consolidation](../completed/authorization-consolidation.md):
  retain admin-only settings writes, scoped automation and tenant isolation.
- [Delivery and workspaces](delivery-readiness-and-persistent-workspaces.md):
  retain workspace ownership and renewal/expiry correctness; do not reopen the
  customer integration bundle or make BackgroundAgent an acceptance dependency.
- [OSS preview](oss-developer-preview-launch.md): full admission was deliberately
  deferred, while misleading usage history was removed.

## Source Assessment

These are source findings, not newly reproduced production failures. Line
numbers refer to the baseline above and may move during implementation.

| Area | Evidence | Consequence for this plan |
| --- | --- | --- |
| Setting and usage | `apps/api/src/services/org-settings.ts`, `usage.ts`; migration 001 | No admission check; usage counts running records only. Settings read and merge before an unlocked update, so an unrelated save can overwrite a concurrent limit change. |
| Create | `apps/api/src/services/sandboxes.ts`, `createSandbox`, around line 754 | Sandbox insert, operation enqueue and encrypted replay data are separate writes. Capacity, workspace attachment and accepted intent must commit together. |
| Duplicate dispatch | `sandboxes.ts`, `claimSandboxOperationById(...) ?? operation`; corresponding lifecycle helpers | A caller that did not claim an operation can still proceed. A counter alone would not prevent duplicate provider effects. |
| Idempotency | `sandbox-operations.ts`, migration 013 | Organization/kind/key uniqueness exists, but lookup/enqueue surrounds a prior sandbox insert and does not compare create intent. Reuse must precede new admission. |
| Worker replay | `sandbox-operation-worker.ts`, `executeProvisionOperation` | Synchronous and worker provisioning differ. The worker does not forward the stored restore snapshot to provider creation. Restore must not silently produce an empty template. |
| Unknown outcomes | `sandboxes.ts`, credential rollback; worker retry and stale-provision paths | Cleanup failures can be swallowed; failed operations can still have live resources. A missing list match or elapsed worker lease is not proof of absence. |
| Lifecycle | `sandbox-lifecycle.ts` | Pause/resume use their own transitions. Polling can return before the expected state; errors can restore the old database status despite an uncertain provider effect. |
| Renewal and expiry | `sandbox-lease.ts` | Existing correctness relies on sandbox row locking and rechecking expiry. Provider calls currently occur inside the transaction. Do not add an organization-wide lock around those calls. |
| Reconciliation | `scheduler.ts` | A `LIMIT 100` scan without ordering covers running/pending/idle records only; a capacity scan must also reach uncertain/error/transition records fairly. |
| Workspace ownership | migration 035; `persistent-workspaces.ts` | Sandbox insertion reserves a workspace through a trigger. Attachment-attempt markers deliberately prevent ambiguous reattachment. Capacity release must not bypass these protections. |
| Provider boundary | `providers/runtime/provider.ts`, OpenSandbox transport | Create has no declared idempotency guarantee; delete returns `void`; state is a string; list completeness is not declared. Only an authoritative get-404 currently maps to absence. |
| Browser retry | `apps/web/src/api-client/request.ts`, `sandboxes.ts` | The browser retries a network failure, including POST; create does not generate a stable key automatically. Lost responses need the same intent, not another sandbox. |
| Public contracts | `packages/shared/src/index.ts`, `openapi.ts`, generated SDK protocol; web settings/usage/preview docs | The enforcement flag is literally typed `false`, and settings say target. Change these only with the actual implemented gate and upgrade behavior. |

## Scope and Product Decisions

### What the Limit Means

One slot is permission for one Harakiri-managed sandbox execution to exist or
start. It is not a CPU, memory, disk, PVC, process, command, HTTP request, billing
or cluster-wide scheduler quota. Multiple organizations' limits can exceed host
capacity. Operators still need infrastructure resource controls.

Keep the existing `maxConcurrency` name and validation range, 1 through 10,000.
Keep the current default of 200 for compatibility, but explain that this is not
a recommended cluster sizing value. Zero is not a new suspension mode in this
change. Installation examples must select a limit appropriate for their lab.

| Situation | Slot policy |
| --- | --- |
| Accepted create, including `wait:false` and snapshot restore | Reserve before any runtime creation. Queued provisioning already consumes a slot. |
| Pending, provisioning, running or idle sandbox | Hold one slot. Idle is not the same as paused. |
| Pausing | Hold until a trusted provider observation confirms execution is suspended and no earlier conflicting effect is unsettled. |
| Confirmed paused | Release only if the adapter's pause contract guarantees no executing workload. Retained storage or memory does not make this a resource quota. Otherwise keep the slot and disclose the limitation. |
| Resume from a released paused state | Obtain a new reservation before calling the provider; leave the sandbox paused if admission is denied. |
| Already running/resuming, or repeat of an accepted operation | Reuse its hold and operation; never reserve twice. |
| Deleting, terminating, expired locally, failed cleanup, lost provider response | Keep the hold while execution may still exist or start. |
| Confirmed absence/terminal state with no unsettled producer | Release once using guarded finalization. |
| Canceled before dispatch, or definitive pre-dispatch validation failure | Atomically fence dispatch, cancel intent and release. |
| Workspace, stored snapshot, or command in an existing sandbox | No additional execution slot. Restoring into a new sandbox counts as create. Workspace storage quota remains separate. |

At capacity, reject new work immediately. This is **not** a waiting-list product,
fair scheduler or automatic eviction feature. Preserve form input and give a
clear next action. Async provisioning is a queue of already admitted work, not
an overflow queue beyond the limit.

Lowering a limit below current use does not kill or pause anything. Report
`available = 0` and the over-limit amount, and block additional reservations
until use falls below the new limit. Raising a limit takes effect at its database
commit. Authenticated members can inspect permitted capacity information; only
human organization admins may change the setting.

### Explicit Non-Goals

- Historical usage, billing, burst credits, weighted CPU/RAM admission or global host scheduling.
- Warm pools, priority queues, autoscaling or automatic termination to make room.
- A Redis semaphore, distributed workflow engine or general operation-queue rewrite.
- New runtime providers, Kubernetes exec fallbacks, customer OCP-install or BackgroundAgent integration.
- New asynchronous credential support, new snapshot capability or broader pause support.
- A new public admin force-release API, new permissions system or a stable-release promise.
- Repository-wide settings, scheduler, SDK or UI refactoring unrelated to this invariant.

## Safety Contract

For each organization, let `H` be the number of committed, unreleased execution
reservations, including unresolved effects. A new reservation is committed only
when `H < maxConcurrency`. All admission writers serialize this decision in the
same database protocol. After a limit reduction or conservative migration,
`H > maxConcurrency` is allowed as existing debt, never as permission for new work.

Additional invariants:

1. One sandbox has at most one unreleased reservation. One accepted create intent
   has one sandbox and one provision operation, even with multiple API replicas.
2. No create/restore/resume provider dispatch occurs without its committed hold
   and current dispatch ownership. Losing a claim is not permission to proceed.
3. Caller timeout, socket closure, worker lease expiry, exhausted retries and a
   local `error`/`terminated` label do not prove that execution is absent.
4. No hold is released while an earlier effect can still create or reactivate
   that execution. Database fencing prevents stale writes; it does not cancel
   a request already delivered to a provider.
5. A confirmed release is idempotent. A stale completion cannot resurrect a
   terminal sandbox, release a newer generation or detach its workspace.
6. No transaction holding the organization admission lock does provider, registry,
   secret-resolver or network work. Database retries retry database work only.
7. Counts are organization-scoped and derived from the ledger, not cached running
   totals, user identity, process-local mutexes or a runtime list length.
8. If ledger/provider correspondence cannot be established, admission fails closed
   for the affected organization. Missing data must not appear as zero usage.

This is an admission guarantee for work managed through Harakiri and a conforming
provider. It is not a physical quota against out-of-band provider administrators
or a provider duplicating one request internally. Detect such divergence,
quarantine affected admission and surface it; do not claim exactly-once provider
execution that the adapter cannot guarantee.

## Technical Design

### 1. Durable Reservations, Not a Mutable Running Counter

Add an append-only migration after the then-current migration head; 037 is the
head at authoring time. Do not edit earlier migrations or assume 038 remains free.

Introduce `sandbox_capacity_reservations` with organization, sandbox, generation,
operation, phase, dispatch ownership/effect evidence, creation/update times and
release time/reason. The implementation should reuse operation fields where
they already express ownership, rather than create two competing lease systems.

Required schema properties:

- Tenant-safe references, a unique sandbox/generation identity and a partial
  unique index permitting at most one unreleased reservation per sandbox.
- Phases `reserved`, `active`, `releasing`, `uncertain`, `released`, with constraints
  ensuring the release timestamp agrees with the phase. The first four count.
- An indexed organization/unreleased lookup; derive totals instead of introducing
  a second mutable counter. Index due reconciliation work separately.
- Monotonic effect/claim generation and guarded state updates. Do not overload
  sandbox TTL or ordinary operation retry count as provider ownership.
- No cascade or ordinary history cleanup that can erase an unreleased hold.
  Released tombstones and idempotency evidence follow an explicit retention rule.
- Organization capacity protocol/readiness state and a limit revision for
  optimistic admin edits. New organizations initialize through the same protocol.
- Database validation of the supported limit range. Detect invalid legacy values
  in preflight and require an explicit correction; do not silently clamp them or
  interpret a missing/invalid value as unlimited.

The exact physical columns are a Phase 1 design/test deliverable. Capacity state,
operation state and sandbox UI state have different meanings; do not compress
them into a single overloaded status enum.

### 2. Short, Serialized Admission

Use the existing connection-pinned `transaction` helper in `apps/api/src/db.ts`.
Within an explicit READ COMMITTED transaction:

1. Lock the organization's row with `FOR NO KEY UPDATE` and read its current limit
   and admission readiness. This serializes admissions and limit changes without
   unnecessarily conflicting with ordinary foreign-key key-share locks.
2. In a **subsequent statement**, look up the current idempotency record. Return an
   already accepted matching intent even when the organization is now full.
3. Check tenant ownership, relevant mutable preconditions and current unreleased
   count; deny if full or capacity recovery is blocking admission.
4. Atomically insert the pending sandbox, workspace reservation through its
   existing trigger, provision intent, execution hold and encrypted replay input.
   The intent is dispatchable only when its preparation is complete. A failure
   rolls back all of them.
5. Commit, then claim and dispatch provider work outside the transaction.

The separate count statement matters: READ COMMITTED refreshes the snapshot per
statement, whereas a combined lock/count statement can retain a snapshot from
before waiting. The locking design above is our application design based on
[PostgreSQL row-lock behavior](https://www.postgresql.org/docs/16/explicit-locking.html#LOCKING-ROWS)
and [READ COMMITTED semantics](https://www.postgresql.org/docs/16/transaction-iso.html#XACT-READ-COMMITTED).

Set bounded lock/statement timeouts locally. Retry deadlock/serialization failures
only within a bounded, side-effect-free database phase. A busy database must not
be mistaken for a full organization.

Adopt and test one lock order: organization, existing sandbox, workspace, operation,
reservation. Sandbox insert-trigger workspace locking must fit this order.
Queue claims commit before entering this transaction; never retain an operation
lock and then acquire the organization lock. Code paths that touch only a subset
must preserve the same relative order. Review FK-trigger locks with real PostgreSQL.

Limit edits use this organization lock and compare `expectedCapacityRevision`.
Require a current revision when changing `maxConcurrency`; report a structured
conflict for missing/stale revisions. Patch only supplied fields. Settings and
onboarding must send only edited fields, not resave a stale entire organization.
Document the compatibility change for older direct settings clients.

### 3. Accepted Intent and Provider Dispatch

Normalize create intent once, before expanding mutable template aliases or
resolving secret values. Matching retries return the original pinned resolution,
not a new template version after an alias or organization default changes.
Exclude transport preferences (`wait`, wait timeout) from identity; include
effectful template/snapshot/workspace, TTL, name, env, source and credential
references. Same organization/kind/key with different intent returns
`idempotency_conflict`. A quota rejection creates no accepted operation or hold.

Use domain-separated HMAC fingerprints for sensitive intent comparison with the
existing control-plane secret key. Inline-ephemeral values are never persisted,
even as encrypted replay input. Only runtime env replay uses existing encrypted
operation-secret storage. Inputs with env, credentials or source require that
key; non-sensitive intent can use a public-input hash when no key is configured.
Transport wait preferences do not affect identity. Key rotation or an old
unfingerprinted intent that cannot be verified returns a conflict and the existing
operation reference, never a new dispatch. Resolved credentials are not part of
intent and cannot be replayed by a generic worker.

Split create preparation into local/DB validation and effectful credential or
provider preparation. Do not mint dynamic credentials for a capacity rejection.
After admission, failure before provider dispatch can release the hold; revoke
or track any issued credential separately through the existing Vault lifecycle.
After provider dispatch, failed credential attachment and failed runtime cleanup
leave capacity held. Keep the existing restrictions on asynchronous credentials.

Persist an explicit preparation/dispatchability gate on the accepted operation.
A generic worker must not claim a partially prepared create or turn a synchronous,
non-replayable credential request into an ordinary credential-free sandbox.
Finish preparation under its claim outside the admission transaction, then
atomically publish the ready input/dispatch state. A failed or interrupted
non-replayable preparation is canceled/reconciled, not replayed with missing
credentials. Late preparation cannot make a canceled generation dispatchable.

Share the capacity-sensitive provisioning executor between the synchronous path
and the worker. Preserve existing wait/202 semantics. In particular:

- A failed claim returns/observes the accepted operation; it never falls back to
  executing an unclaimed operation.
- Persist dispatch intent before the network call. Fence completion, failure,
  cancellation and stale adoption against the current claim and generation.
- Worker lease expiry permits observation/reconciliation, not a blind second
  create or resume. A dispatched effect with unknown outcome remains uncertain.
- Retry a provider mutation only when its contract proves safe idempotent replay
  or proves no effect occurred and no earlier producer can still dispatch. HTTP
  5xx, malformed success bodies and timeouts do not provide that proof.
- Reuse current ownership metadata, adding a stable operation/generation reference
  where needed. Metadata helps adoption but is not provider idempotency.
- Forward the same restore snapshot, workspace and runtime configuration in both
  synchronous and replay paths. Retain source bootstrap and credential behavior.
- Distinguish provider acceptance from execution readiness: a provider `pending`
  response still holds a reserved slot and is not evidence of active execution.
  Preserve request wait semantics without inventing a running observation.

Client-generated idempotency protects repeated requests for the same intent.
Different keys, or omitted keys from raw API clients, are different intents but
are still subject to atomic capacity admission. Publish this distinction.

### 4. Lifecycle and Release Evidence

Create, pause, resume, explicit delete, TTL expiry, provider reconciliation and
credential rollback must use the same reservation transition/finalization helpers.
Keep these helpers in focused services, not another large conditional inside
`sandboxes.ts`.

Resume atomically validates paused state and reserves before dispatch. Repeated
resume of an accepted transition observes that operation. Pause does not release
just because a request succeeded; release requires confirmed non-execution.
An ambiguous resume cannot revert to a free paused slot based on a local catch.

For a pending sandbox, deletion/cancellation must atomically win against dispatch.
If dispatch is already possible, retain the hold and follow its cleanup operation;
return a clear in-progress/conflict result instead of marking a null-provider-ID
sandbox terminated and forgetting its producer. Preserve workspace attachment
ambiguity protection even where cancellation was previously allowed elsewhere.

Define adapter-level observation evidence for present, confirmed suspended,
confirmed absent and unknown. Generic substrings such as `deleting`, a successful
DELETE response, an expired timestamp or an empty provider list are insufficient.
An authoritative get-404 is useful only for the correct immutable provider
identity and after ruling out an unsettled create/resume for that generation.

First audit the current transport's timeout, fallback and pagination behavior.
Synthetic fallback output must never establish absence in enforced native mode.
Use positive ownership matches for orphan adoption. Multiple matches are an
invariant incident, not permission to adopt the first and ignore the others.
An incomplete list cannot prove a negative. Add a narrow provider observation or
lookup contract only where needed; never reach into Kubernetes from the API.

Preserve the existing renew-versus-expire ordering. Any move of provider I/O out
of `sandbox-lease.ts` transactions needs an explicit claimed lifecycle intent,
revalidation of the effective deadline, and serialized conflicting effects.
A database epoch alone cannot stop a stale provider DELETE. Do not dispatch a
competing renew/delete/resume while an earlier effect is unsettled. Extend the
existing race tests before replacing the locking behavior; do not simply drop
the locks to shorten the function.

### 5. Bounded Recovery and Operational Visibility

Use the existing scheduler/operation infrastructure with due-time ordering,
bounded batches, backoff and database-owned claims. Include unresolved holds in
all sandbox statuses and organizations; do not reuse the unordered first-100
running-record scan as the only recovery source. Separate recovery observation
ownership from permission to dispatch a new mutation.

Safe automatic recovery includes undispatched canceled reservations, confirmed
provider absence, positive orphan adoption and confirmed pause. It does not
include releasing after an arbitrary timeout or reducing counts to match a
database status. Fail closed on unknown outcomes and expose their age and reason.

Provide an operator dry-run inspection/repair command using the same services and
provider contract. Mutating repair must require an explicit target, evidence and
an audit event; it is not a raw SQL counter reset. If the provider cannot prove an
unsettled request has ended, retain the hold and document escalation. Do not
invent a time threshold that turns uncertainty into proof.

Record structured admission outcome, reservation transition and recovery logs,
with organization/sandbox/operation references and redacted reason codes. Add
bounded-cardinality metrics for decisions, lock wait/transaction latency,
recovery age, provider observation failure and invariant violations. Do not put
arbitrary organization IDs or secrets in metrics labels. Reuse existing audit
delivery for limit changes and repairs; a post-commit audit failure must not
release accepted work or cause another provider dispatch.

## API, SDK, CLI and UI Contract

### Public API

Add `GET /v1/org/capacity`, authorized with existing `org:read`, returning one
consistent database observation:

- `limit`, `inUse`, `available`, `overLimit` and breakdown of reserved, active,
  releasing and uncertain slots.
- `observedAt` and enforcement/recovery state. During incomplete inventory,
  unknown totals are nullable/unavailable, not zero.
- Counts only for the authenticated organization; no credential payloads,
  provider IDs or cross-tenant details.

Reuse this read service for usage/settings. A create-only key need not receive
`org:read` just to create; its own admission denial includes the bounded capacity
summary needed to understand that operation. Listing organization capacity still
requires the documented read scope.

Use the existing error envelope and add documented codes:

| HTTP/code | Meaning | Caller action |
| --- | --- | --- |
| `409 organization_capacity_exceeded` | No slot was reserved and no runtime creation started for this request | End/pause eligible work, ask an admin, or explicitly retry later. No automatic hot retry. |
| `503 organization_capacity_unavailable` | Recovery, migration or an invariant incident prevents a safe admission decision | Observe recovery; a repeated mutation must retain its idempotency key. |
| `409 idempotency_conflict` | Key does not identify the same effectful intent | Correct the request/key; do not create another sandbox automatically. |
| `409 organization_capacity_settings_conflict` | Missing/stale limit revision | Reload settings, show the new value and let the admin decide. |

Include `limit`, `inUse`, `available` and `observedAt` for a known quota conflict,
and an operation/reference where applicable. Do not expose precise free capacity
when inventory is unknown. A database lock timeout is service unavailability,
not a capacity-exceeded claim. Do not guess `Retry-After`: sandbox release time
is not predictable from TTL alone.

Choose 409 rather than 429 for capacity: the current SDK treats 429 as a retryable
rate limit, but filling every sandbox slot is a state conflict, not request rate.
Do not renumber unrelated existing route-limit errors.

Change `coverage.concurrencyLimitEnforced` from literal `false` to an actual
boolean only when this implementation is delivered. Derive it from effective
protocol/readiness, not merely the presence of a setting. Publish how recovery
blocks admission and how older servers report unenforced behavior. Keep the
existing running-record count distinct from occupied slots. Historical usage
remains unavailable rather than becoming fabricated capacity history.

### TypeScript SDK and CLI

- Add `client.capacity()` through the normal request/error path and typed capacity
  metadata. Preserve the existing conflict category with `retryable: false` for
  a full organization; a typed capacity-error subclass is optional, not required
  if code/details give a clear ergonomic branch.
- Generate one idempotency key per SDK/UI create invocation when omitted, reuse
  it for transport retry, and allow callers to supply/persist their own for
  recovery across process restarts. Add optional resume key plumbing without
  breaking existing `resumeSandbox(id)`/`sandbox.resume()` calls.
- Do not introduce a generic POST retry policy, repeat Git bootstrap on uncertain
  success, or silently retry a capacity denial. Existing wait helpers must
  distinguish accepted-but-pending work from rejected admission.
- Add `harakiri capacity` with compact human output and `--json`, matching current
  CLI conventions. Create/restore/resume failures need actionable messages, stable
  JSON errors and nonzero exits; never report a denied create as started.
- Regenerate the SDK protocol/error copies from `packages/shared` using the
  existing build pipeline. Update OpenAPI and package examples; no manual fork
  of generated contracts or new public shared package.

### Dashboard Experience

- Replace "Concurrency target" with "Maximum concurrent sandboxes" only against
  an enforced-capable API. Show current occupied slots, the limit and recovery
  state next to the setting. Keep controls admin-only and edits conflict-aware.
- In sandbox list/create/restore and paused-sandbox resume, use a compact shared
  capacity summary. Example: `3 of 4 slots in use`, with a details disclosure for
  active, starting, releasing and uncertain counts. Avoid a new dashboard of cards.
- Treat preflight counts as advisory; the server is authoritative. Preserve form
  input and the accepted operation reference on errors/lost responses. Disable
  duplicate submit while that intent is pending and reuse its idempotency key.
- Explain a real full condition concisely: "All 4 slots are in use. Stop a sandbox
  or ask an administrator to raise the limit." Offer existing relevant actions,
  with pause only when this deployment supports slot-releasing pause.
- Say "Stopping; slot still reserved" or "Checking runtime state" when appropriate.
  Never decrement the displayed count optimistically on a DELETE acknowledgement.
- Keep members out of admin settings actions. Show an unavailable/stale state on
  failed capacity reads; no fake zero, modal loop or forced logout on a 409.
- Preserve responsive layout, keyboard/focus behavior, accessible status changes
  and the existing control system. Test the full create/restore/resume interaction,
  not only static screenshots.

## Migration, Activation and Rollback

An additive table does not make old API/worker images enforce admission. A normal
mixed-version rolling update is **not** sufficient proof of safety.

1. Back up the database and required encryption keys; inventory active operations,
   provider workload identities and workspace attachments. Use the standalone
   installation path, not the customer package. Record what was actually observed.
2. During an approved bounded maintenance window, stop new create/resume admission
   at the serving boundary, drain/fence old mutation producers and stop old
   API/worker instances. Keep runtime workloads, auth, databases and public origins
   unchanged. Review TTL exposure before the window; do not silently renew or
   terminate user workloads.
3. Apply the append-only migration and start compatible code with admission closed.
   Backfill holds for live/pending/transitioning work and any terminal/error history
   that still has unresolved provider effects. Do not release history solely from
   its old status. Reconcile known identities and positive ownership matches.
4. Reconcile no-ID dispatched operations conservatively. Record excess provider
   matches as incidents. An organization with unresolved inventory is not ready
   for open admission. Existing use above the configured limit is grandfathered
   and accurately shown; do not evict it to make the migration pass.
5. Activate the database protocol/readiness gate only with compatible API and
   scheduler instances and sufficient inventory evidence. Exercise denial and
   recovery in a test organization before reopening production admission.
6. Check the live UI/CLI/API contract, public OIDC origins, existing runtime access
   and held/released totals. Publish a receipt with versions and remaining limits.

A fresh installation has an empty inventory and initializes the same protocol
without a legacy backfill. Startup/migration concurrency must remain safe through
the existing connection-pinned migration lock. Tests must cover new organizations,
restarts during backfill and partial activation, not only an empty schema.

Rollback must not run an older admission-unaware image behind open mutation
traffic. Prefer a known compatible image and retain the ledger/schema. If no
compatible rollback exists, keep create/resume closed while repairing; do not
drop holds or silently restore unenforced behavior. Recovery from an older
database backup also starts admission-closed and reconciles provider inventory
before activation. The new ledger and replay keys belong in coordinated backup
and restore instructions.

## Implementation Map

The implementation follows these ownership boundaries. Concrete new services
and their contracts are listed in the operator/contributor runbook.

| Responsibility | Existing and proposed locations |
| --- | --- |
| Schema and admission service | New migration; `apps/api/src/db.ts`; proposed `services/organization-capacity.ts`, focused reservation/transition helpers |
| Provision orchestration | `services/sandboxes.ts`, `sandbox-operation-worker.ts`, `sandbox-operations.ts`; shared capacity-sensitive executor |
| Lifecycle and recovery | `sandbox-lifecycle.ts`, `sandbox-lease.ts`, `scheduler.ts`, existing workspace/Vault cleanup integration |
| Provider evidence | `providers/runtime/provider.ts`, `opensandbox-provider.ts`, `opensandbox-transport.ts`; conformance fakes |
| Admin and read routes | `org-settings.ts`, `org-settings.schema.ts`, `usage.ts`; proposed capacity route; `authorization.ts`, `routes.ts` dependency wiring |
| Public protocol | `packages/shared/src/index.ts`, `api-errors.ts`, `openapi.ts`; generated SDK sources |
| Developer tools | `packages/sdk/src/index.ts`, SDK tests; CLI command registration, command tests and README |
| UI | API requester/client, create/restore/resume views, `routes/settings.tsx`, `routes/onboarding.tsx`, usage/list and a shared capacity component |
| Acceptance | New PostgreSQL capacity tests beside `authorization-postgres.test.ts`; existing lifecycle/lease/worker/workspace/Vault tests; browser and conformance suites |
| Operations | Standalone chart/install guidance, focused capacity inspection/acceptance script and release receipt; no customer assets |

## Success Criteria

- [x] Concurrent requests through multiple API/worker instances cannot admit more
  new execution holds than the current organization limit permits.
- [x] Every create path, async worker, snapshot restore and resume uses the same
  invariant; running count is never the admission authority.
- [x] Same-key retries produce one accepted intent and no duplicate dispatch;
  stale completions and uncertain provider effects cannot free a newer hold.
- [x] Pause, delete, expiry, failed credential cleanup and provider loss follow
  tested release evidence rules without regressing workspace ownership or TTL renewal.
- [x] Lowered limits, existing over-limit work and concurrent admin edits behave
  predictably without preemption or lost updates.
- [x] API, generated SDK, CLI and dashboard expose consistent errors and capacity
  state, including unknown/stale/recovery conditions and least-privilege access.
- [ ] Migration/backfill, old-writer exclusion, backup recovery and compatible
  rollback are demonstrated, not assumed from a healthy deployment.
- [x] Real PostgreSQL concurrency tests and native standalone create/delete/async
  acceptance pass. Unsupported provider capabilities are separately disclosed.
- [x] Technical, public concept/API, operator and developer tutorials match the
  source contract and explicitly say unreleased; historical evidence is unchanged.

## Phases

Execute sequentially. Each implementation phase updates this file with evidence
and remaining risks. Local completion is not deployed or published delivery.

### Phase 0: Assessment and Persistent Plan

**Status**: Complete (planning only)

- [x] Trace creation, queue replay, pause/resume, delete, TTL, settings, workspaces,
  provider evidence and client retries against the source baseline.
- [x] Establish the counting policy, fail-closed boundary and non-goals.
- [x] Record implementation, documentation, migration and acceptance phases.
- [x] Add the plan to the repository index without beginning implementation.

### Phase 1: Database Invariant and Contract Fixtures

**Status**: Complete

- [x] Define schema, lock order, state transitions, revision and activation protocol;
  settle intent canonicalization/encryption and legacy retry rules in tests.
- [x] Add migration constraints/indexes and focused service interfaces using the
  existing `Transaction` dependency. Specify release evidence in typed contracts.
- [x] Build a mandatory real-PostgreSQL multi-connection test harness with isolated
  schemas and synchronized contention, not mocked-query concurrency tests.
- [x] Prove limit 1 and N admission, duplicate key, rollback, tenant separation,
  concurrent settings updates and lowering below use before integrating provider I/O.
- [x] Review query plans/index use and FK/trigger lock interactions; keep transactions
  bounded and avoid a single global serialization lock.

**Exit**: The transactional admission proof passes with competing connections;
it is not yet an end-to-end feature or an enforced public claim.

### Phase 2: Create, Async Provision and Restore

**Status**: Implemented; focused persistence and HTTP-disconnect acceptance complete

- [x] Make sandbox/workspace/hold/operation/replay-input admission atomic; ensure
  denial occurs before credential issuance or provider mutation.
- [x] Gate dispatch on complete preparation and preserve synchronous credential
  requests as non-replayable; a worker cannot create an incomplete credential-free
  runtime or dispatch after that preparation was canceled.
- [x] Remove unclaimed-operation execution and share the provision executor between
  synchronous and asynchronous paths. Preserve 201/202/wait behavior.
- [x] Add persisted dispatch ownership, guarded completion/cancellation and safe
  retry classification. Unknown dispatched outcomes retain their reservation.
- [x] Correct worker snapshot forwarding and verify pinned template/workspace/source
  configuration survives replay without replaying sensitive credential attachment.
- [x] Cover provider success followed by persistence failure, response loss,
  same-key changed intent and create-time credential rollback.
- [x] Broaden fault-injection acceptance across create, credential preparation,
  provision failure and deletion write/commit boundaries, plus a real HTTP caller
  disconnect during credential preparation. The 121-checkpoint matrix and two
  socket-disconnect cases do not certify optional native lifecycle combinations.

**Exit**: No create/restore path bypasses admission or dispatch ownership, including
accepted work that outlives the originating HTTP request.

### Phase 3: Lifecycle, TTL and Recovery

**Status**: Complete for implementation and supported runtime evidence

- [x] Integrate pause/resume and pending cancellation with reservation generations
  and mutually exclusive provider effects.
- [x] Unify release after explicit delete, expiry, provider reconciliation and
  credential cleanup; never release from a status string or ignored cleanup error.
- [x] Preserve renew/expire safety while restructuring lock/network boundaries;
  prove old-worker and late-response behavior with deterministic race barriers.
- [x] Define/test real adapter evidence, timeout/fallback and list completeness
  limits. Add only the narrow observation contract needed for recovery.
- [x] Add fair, bounded reconciliation of all held phases, positive orphan adoption,
  incident/quarantine behavior and auditable operator inspection/repair.
- [x] Preserve workspace detach guards, leases, credentials and route cleanup;
  capacity recovery must not become a second independent lifecycle implementation.

**Exit**: Fault injection cannot cause an unsafe release or blind duplicate mutation;
known outcomes eventually converge and unknown ones remain visible and held.

### Phase 4: Developer and Dashboard Experience

**Status**: Implemented; broader optional lifecycle browser matrix remains

- [x] Implement scoped capacity reads, known error codes/details and conflict-aware
  admin limit updates. Extend authorization coverage for the new route.
- [x] Generate shared/OpenAPI/SDK contracts and add SDK/CLI capacity and retry-key
  ergonomics without background auto-retry or new dependencies.
- [x] Preserve parsed error details in the web requester and supply stable intent
  keys to mutating workflows affected by browser/network retries.
- [x] Implement compact count/recovery UI, changed-field settings/onboarding saves,
  non-admin actions and form-preserving capacity conflicts.
- [x] Test create/retry and settings on desktop/mobile, keyboard/focus, stale
  data, old-server behavior and unchanged-intent recovery at full capacity.
- [ ] Extend browser acceptance to supported native restore and pause/resume;
  database/provider-contract tests do not certify those native capabilities.
- [x] Keep running observations and historical usage disclosures truthful while
  switching the enforcement flag only for effective admission.

**Exit**: The same conflict means the same thing in API, CLI, SDK and browser; a
developer can identify their next action without access to provider internals.

### Phase 5: Upgrade and Native Acceptance

**Status**: Core native, older-backup and compatible rollback acceptance complete; cold-start and optional matrix limits remain

- [x] Implement and test fresh initialization, migration/backfill and activation;
  reject admission while an organization lacks a trustworthy inventory.
- [x] Exercise real older-backup recovery with native provider work surviving
  outside the restored database snapshot; confirm quarantine and denied dispatch.
- [x] Exercise deployment rollback with a compatible image. A separate arm64
  fixture retained its native runtime, held slot, replay and workspace file
  across local source-build upgrade and rollback to the published capacity-aware
  source image. Packaged rc.8 remains an incompatible pre-capacity target.
- [x] Run native create, duplicate/full admission, async worker, execution/renewal,
  lost-response recovery, local TTL deletion and the authenticated SDK tutorial
  against an isolated API/database and the current native provider API.
- [ ] Complete remaining matrix combinations before expanding runtime claims;
  optional native pause/snapshot/Vault scenarios are explicitly not certified.
- [x] Verify existing user workloads are outside cleanup scope. Clean only resources
  created by acceptance and retain evidence for any unreconciled test operation.
- [x] Record exact versions, architectures, provider capabilities, database test
  output, timings and skipped/unsupported cases. Do not label a fake-provider
  pause/snapshot pass as native support.

**Exit**: The supported native create/async/delete path and upgrade invariant are
proven. Optional runtime capabilities have either native evidence or explicit
support limits; neither customer installation nor unrelated application tests
are prerequisites.

### Phase 6: Documentation and Examples

**Status**: Complete for the published rc.9 contract and delivery evidence

| Audience | Required material | Acceptance |
| --- | --- | --- |
| Public concepts | First-class Capacity and limits page in the public docs navigation, not only a tutorial; counting/state table, pause/storage distinction, retries and over-limit behavior | Accurate against shipped server modes; no claim of physical cluster quota or billing |
| API developers | OpenAPI, error reference, request/response examples, idempotency lifetime, settings revision and capacity read scope | Regeneration/checks pass; examples run with least-privilege credentials |
| SDK/CLI users | SDK and CLI reference/READMEs; executable limit-1 create/deny/delete/retry tutorial, plus resume/restore cases where supported | Real return codes, operation IDs and preserved retry intent; no secret values in examples |
| Self-hosting operators | `docs/install-kubernetes.md`, public Kubernetes page, chart/settings descriptions; limit sizing, maintenance activation, unknown holds, dry-run repair, alerts, backup and rollback | Fresh install and upgrade steps reviewed against Phase 5 evidence; no customer bundle or SCC assumptions |
| Contributors | Focused technical design/ADR for admission, lock order, claim fencing, provider evidence, module ownership, failure matrix and real DB test command | A contributor can add a lifecycle path without bypassing admission |
| Internal operations | Repo-owned capacity runbook and redacted acceptance/release receipts; explicit escalation when absence cannot be proven | Auditable recovery without raw counter edits; private evidence and credentials stay outside Git/Brain |
| Existing product docs | Preview, usage, security/architecture, getting-started and SDK examples that describe the old boundary | Update present-tense claims only; retain historical rc.8 and launch receipts |

- [x] Build the documentation inventory and dedicated concept page using the
  existing TSX/docs-export pipeline; keep generated Markdown synchronized.
- [x] Add copyable examples with language tags and the existing code highlighting.
  Demonstrate SDK error branching and CLI JSON, not just dashboard screenshots.
- [x] Write the operator and contributor material while implementing their phases,
  then validate it from a clean reader perspective in this phase.
- [x] Run link/export/example checks and browser navigation/mobile acceptance.
  Note which scenarios need an optional native runtime capability.

**Exit**: The feature is discoverable and independently operable, not something
that only the implementing maintainer knows how to recover.

### Phase 7: Delivery and Closure

**Status**: Published and deployed as rc.9; plan closure awaits explicitly unresolved gates

- [x] Review the full diff and effective test evidence, including non-skipped real
  PostgreSQL tests and native receipts; resolve safety blockers before release.
- [x] Choose the release version/channel and publish through protected existing
  CI. Update source, chart/images, OpenAPI and affected SDK/CLI packages coherently.
  Do not hardcode an unapproved next version or promote npm `latest` implicitly.
- [x] With deployment approval, apply the tested maintenance/backfill sequence,
  verify public origins/auth, inspect live capacity and run isolated acceptance.
- [x] Publish accurate release notes/support limits and the delivery receipt;
  update roadmap status without claiming historical metering or broader support.
- [ ] Archive this plan only after required gates pass, or explicitly rescope a
  remaining task with an owner and reason. Implementation complete is not the
  same as deployed, published or natively verified.

## Acceptance Matrix

Tests must assert both database state **and provider call/effect counts**. A full
HTTP response matrix over mocked SQL does not establish atomic admission.

| Scenario | Required result |
| --- | --- |
| 100 simultaneous unique creates, limit 1 and limit N, two API instances/worker claimants | At most N accepted new holds; rejected requests make no provider mutation; enforce with separate database connections and barriers |
| Cross-organization load | Each limit independent; another organization's transaction does not consume or globally lock capacity |
| Same key concurrently and after lost response | One sandbox, operation, hold and authorized dispatch; replay works even when remaining capacity is zero |
| Same key, changed env/template/workspace/snapshot/TTL | Explicit conflict; no sensitive input returned or new runtime effect |
| Failure after each database write, including workspace trigger and encrypted input | Full rollback before acceptance, no partial attachment/hold/operation |
| `wait:false`, wait timeout, HTTP disconnect | Accepted reservation persists and worker converges; no second reservation or implicit cancellation |
| Sync/worker race and stale worker | Only owner dispatches; stale completion/failure cannot overwrite the current generation |
| Worker dies before dispatch versus after possible dispatch | First safely reclaimable when fenced; second observed/held, not blindly recreated |
| Provider 5xx/timeout/malformed create reply; empty/incomplete list | Unknown outcome stays held; no zero-match inference or retry-driven duplicate |
| Multiple matching provider identities | Invariant incident and blocked affected admission; extra runtime not ignored |
| Delete acknowledgement but runtime still exists; delayed deletion | Slot stays held until authoritative release evidence |
| Pending create canceled while dispatch starts | Atomic winner; late producer cannot run after a safe cancellation; uncertain winner retains capacity |
| Local error/TTL expiry/provider outage | No unverified release; existing renewal-versus-expiry tests still pass |
| Pause timeout, confirmed pause, resume at capacity, concurrent resumes | Only proven pause frees; denied resume leaves paused; one successful resume hold/dispatch |
| Late resume after timeout, pause/delete competing with renewal | No premature free slot and no stale provider effect treated as canceled by a DB epoch |
| Snapshot restore, async snapshot restore, workspace replacement | Correct snapshot/attachment used; exactly one admission per new execution; no busy-workspace reuse |
| Credential preparation/attach/bootstrap failure, cleanup failure | No issuance on quota denial; no capacity free while failed cleanup may leave execution alive |
| Worker races credential preparation or preparation finishes after cancellation | No generic credential-free dispatch, no replay of non-replayable input, no late activation of a canceled generation |
| Limit shrink/raise; two admin editors; onboarding/unrelated save | No eviction or stale overwrite; fresh revision required for limit change |
| API key/member/admin and revoked/wrong-tenant credentials | Existing authorization enforced; no cross-tenant summary, setting mutation or workspace/snapshot disclosure |
| More than 100 due holds, repeated scheduler restarts | Fair bounded recovery reaches later work, with no indefinitely starved first-page scan |
| Seeded legacy work, over-limit inventory, old producer, partial migration | Gate remains closed until safe activation; no rolling-old-image admission bypass |
| Restored older DB with newer surviving provider resources | Reconcile before admission, detect ownership divergence, never start from a falsely empty ledger |
| UI/SDK/CLI under conflict, stale reads and service recovery | Actionable stable errors, no fabricated zero/no hot retry, preserved inputs and accepted operation |

## Verification Commands and Evidence

Use the existing commands below as the implementation baseline. Add a dedicated
mandatory CI capacity/PostgreSQL job; the existing optional authorization test's
`SANDBOX_TEST_DATABASE_URL` skip must not let the new admission proof silently pass.
The capacity harness needs multiple connections sharing one isolated schema,
unlike a single-client migration test. Never point it at a production database.

```sh
pnpm --filter @harakiri/api test
pnpm --filter @h-sandbox/sdk test
pnpm --filter @h-sandbox/cli test
pnpm --filter @harakiri/web test
pnpm typecheck
pnpm openapi:check
pnpm docs:check
pnpm examples:check
git diff --check
```

Add focused browser and native capacity conformance commands in their respective
phases. Scope stress tests to a controlled fake provider for high request counts;
native acceptance should use small dedicated limits rather than launch 100 real
workloads on the shared lab. Repeat synchronized races; record counts, outcomes,
lock/transaction latency and environment. Set the performance threshold from the
recorded baseline before optimizing, and verify that slow provider I/O does not
hold the organization lock or exhaust the database pool.

For plan authoring, only documentation/link/whitespace checks are appropriate.
No new product tests, live quota tests, migration or deployment are represented
as having run by creating this document.

## Decision Log

The original design decisions and implementation refinements are recorded here.
They describe the source implementation, not the currently published rc.8 runtime.

| Date | Decision | Rationale | Alternatives considered |
| --- | --- | --- | --- |
| 2026-09-10 | Keep capacity in PostgreSQL behind a provider-neutral service | All replicas need the same admission authority and durable recovery evidence | In-process lock, provider-side org policy, new Redis dependency |
| 2026-09-10 | Use indexed held reservations plus short organization locking | Atomic admission with one accounting source; unknown effects remain represented | Count running statuses; unsynchronized counter; provider list on every request |
| 2026-09-10 | Hold pending/resuming/releasing/uncertain execution | Timeout and local status are not absence proof | Free on lease expiry, catch blocks or delete acknowledgement |
| 2026-09-10 | Free pause only under a confirmed non-execution contract | Match execution concurrency without pretending storage/CPU accounting | Free on any pause response; promise universal native pause support |
| 2026-09-10 | Reject full capacity with 409; no waiting list or preemption | Clear developer recovery and existing non-retryable conflict semantics | Retryable 429, implicit queue, automatic kill |
| 2026-09-10 | Grandfather work after lowering the limit | Admin change must not unexpectedly terminate accepted work | Reject all reductions below use; evict oldest sandbox |
| 2026-09-10 | Include narrowly scoped dispatch and renewal safety work | A reservation counter is insufficient if old workers can duplicate effects | Add create-only check now and patch lifecycle races later |
| 2026-09-10 | Stage activation without old mutation producers | An additive schema cannot constrain old application code automatically | Assume ordinary mixed-version rolling deployment is safe |
| 2026-09-10 | Public concept, operator and SDK/CLI docs are delivery gates | Capacity must be understandable and recoverable without maintainer access | Tutorial-only documentation or internal-only implementation notes |
| 2026-09-10 | Keep historical usage, customer OCP and Python outside this plan | Finish one coherent trust capability without turning it into a platform rewrite | Reopen every delivery/adoption project before this can ship |
| 2026-09-11 | Separate preparation from provider dispatch with durable effects | Workers cannot replay interrupted credential preparation or duplicate a dispatched create | Reusing the ordinary worker timeout as an execution fence |
| 2026-09-11 | Keep lifecycle network calls outside admission locks | Renewal, expiry and deletion retain generation/effect fences without locking the whole organization during provider I/O | Organization lock held while waiting for the runtime |
| 2026-09-11 | Treat stop as a request across SDK, CLI and UI | Native deletion acknowledgement is not absence; competing confirmation must still return success | Optimistically reporting terminated or returning an error after recovery already completed deletion |
| 2026-09-11 | Use bounded indexed recovery candidates and per-row locking | Ten thousand released generations must not drive a history scan; 150 due holds remain reachable | Scanning arbitrary running rows or joining all released history before limiting |
| 2026-09-11 | Label docs and package guidance unreleased | Public rc.8 cannot be represented as having admission enforcement | Changing historical release notes or silently choosing a new version |

## Risks and Stop Conditions

- Provider ambiguity is the main risk. If safe absence/idempotent replay cannot
  be proven, preserve the hold and document operator escalation. Do not erase the
  safety contract to make an automated test eventually pass.
- Renewal currently has important race protection. A shorter transaction is not
  an improvement if it permits an old expiry action to delete renewed execution.
- Existing settings/onboarding send snapshots; implementing only a server lock
  without fixing client edit intent would still permit stale limit changes.
- Mixed-version activation and backup restoration can lose correspondence with
  provider resources. Keep admission closed until inventory is reconciled.
- Native pause/snapshot capability may be unavailable in the selected profile.
  Record the limitation and test fail-closed behavior; do not emulate it with
  Kubernetes exec or broaden the advertised runtime support to finish this plan.
- Available disk/cluster capacity must be checked before native tests. Do not
  prune shared images, resize hosts, restart tunnels or delete existing workloads
  merely to obtain a passing acceptance run.

## Tech Debt Incurred

First-release gates remain explicit: remaining readiness/lifecycle acceptance,
durable release infrastructure and a matching release. Compatible rollback was
rehearsed on the isolated arm64 fixture, but pre-capacity packages are not valid
rollback targets. Without a capacity-aware build, keep admission closed until repair.
Unknown provider outcomes still require evidence or operator escalation, not
automatic timed release. Released ledger/effect tombstones are retained; any
future retention policy must preserve replay and generation-fence guarantees.

## Completion Notes

Implementation is present locally. Commit and lab deployment were subsequently
authorized; the delivery checkpoint below records progress separately from the
local acceptance. Existing credentials, organization limits and public origins
must be preserved.

Authoring verification, 2026-09-10: `pnpm docs:check` and `git diff --check`
passed; the new plan also passed a separate no-index whitespace check. No
application tests, runtime acceptance or deployment were run for plan authoring.

### Implementation Checkpoint, 2026-09-11

The ledger, runtime-effect protocol, shared provision executor, lifecycle and
recovery services, operator inventory command, API/SDK/CLI and dashboard are
implemented. The full workspace suite has 631 passing tests and one intentionally
opt-in native test, exercised separately. The real PostgreSQL proof has 33
passing checks, including 100 competing requests, duplicate dispatch prevention,
revision conflicts, workspace rollback, delayed deletion/pause, persistence
failure, exact orphan adoption, 150 due holds and a 10,000-generation query plan.
Native create, async dispatch, renewal, local expiry, lost-response adoption and
the authenticated SDK limit-one tutorial pass against the provider's API with
fallback disabled. The native suite has eight passing checks, including actual
pg_dump/pg_restore recovery while an owned execution survives. All eight test
runtimes were confirmed absent after cleanup. Twenty-nine browser checks cover
1440, 390 and 320px, keyboard/focus, stale/unknown counts and input-preserving
conflicts. Build, workspace type checks, OpenAPI, docs links/exports, runnable
example checks and the Vault boundary check pass. The matching source SDK
tutorial also ran against the authenticated native HTTP API.

See [local acceptance](../../operations/execution-capacity-acceptance.md) and
the [operator runbook](../../operations/execution-capacity.md) for reproducible
commands, exact evidence and remaining limits. The plan remains active for
extended fault/lifecycle acceptance, delivery and a separately requested package
release.

### Deployment Checkpoint, 2026-09-11

- [x] Confirmed all six public lab deployments healthy at Helm revision 36;
  existing API/scheduler/builder use rc.8 and schema activation needs maintenance.
- [x] Merge the implementation after required protected-branch CI checks.
- [x] Publish immutable API and web images from the same reviewed source without
  replacing rc.8 or npm channels; preserve the existing chart and configuration.
- [x] Back up the database and required operator state, stop every old writer,
  migrate, inspect authoritative runtime inventory and activate each organization.
- [x] Start matching writers, verify isolated capacity acceptance, public docs
  and public OIDC, then record the receipt and remaining limits.

The generic bootstrap wrapper is not an upgrade procedure for this deployment.
Do not use automatic rollback to an old image after migration 038: keep mutations
closed until a compatible repair is ready. Test workloads must be dedicated and
cleaned by their exact owned IDs; existing workloads must not be deleted to free
capacity.

PR #32 merged as `be8f650118aba757c3e0a87c9046779420f7bac4` after all eight
required checks passed; the additional demo checks and main-branch CI also passed.
API workflow 34548677721 and web workflow 34548679993 (attempt 2) published
`0.5.0-rc.8-capacity.be8f650` for amd64 and arm64 with matching source labels.
The first web upload hit Harbor filesystem error 28. Dry-run GC 1296 identified
10 unreferenced blobs and zero manifests; GC 1297 reclaimed 124 MB with both
tag and untagged-image deletion disabled. An empty upload probe then succeeded
and was cancelled. Existing artifacts/channels were not replaced. Registry
storage headroom remains an operational follow-up, not a resolved capacity issue.

Public k0s deployment completed at revision 38 after an admission-closed revision
37, coordinated database/five-volume backup, migration 038 and inventory
activation of all seven existing organizations/179 records. Limits, key
permissions, public OIDC and retained workspace state were preserved. The live
SDK limit-one tutorial, async replay/native command, built CLI capacity read,
signed-in dashboard and sign-out passed. Seven public documentation browser
checks and media/export checks passed. All four owned runtimes were confirmed
absent; the temporary key was revoked, its membership removed and the operator
pod deleted. Non-executing audit/ledger records are retained.

See the [delivery receipt](../../release-notes/2026-09-11-capacity-delivery.md)
for exact digests, maintenance times, harness limitations and recovery boundaries.
Npm/chart publication and the remaining fault/lifecycle/rollback matrix are not
complete; keep this plan active. The new source-commit deployment is not a
silent replacement of published rc.8 artifacts.

### Release Closure Checkpoint, 2026-09-11

The owner approved the recommended next work: focused safety acceptance,
durable registry headroom, coherent candidate publication and clean standalone
installation/upgrade from the public instructions. Execute in that order, with
destructive recovery tests isolated from the public lab. Do not change npm
`latest`, customer deployments, Brain files or unrelated `docs/cot/` material.

- [x] Exercise create/credential persistence write boundaries and an actual HTTP
  disconnect during credential preparation with real PostgreSQL.
- [x] Rehearse compatible-image rollback with admission accounting preserved in
  an isolated deployment; never reopen pre-capacity writers against migration 038.
- [ ] Establish Harbor filesystem/inode headroom and durable monitoring or
  expansion. API health and successful garbage collection alone are insufficient.
- [x] Select an unused candidate, publish matching SDK/CLI/images/chart via
  protected CI and verify anonymous artifact consumption.
- [x] Follow the public standalone installation/upgrade instructions with those
  artifacts, verify OIDC and real runtime/SDK/CLI/capacity workflows, and clean
  only the explicitly owned acceptance resources.
  The published rc.9 bundle upgraded the existing isolated installation; this
  does not claim a second fresh blank-cluster installation of rc.9.
- [x] Resolve or explicitly triage the observed cold-start readiness gap before
  claiming a reliably ready first task. Published rc.8 reported running before
  its execd file endpoint accepted the first write; a manual retry is not a fix.
- [x] Record precise release/install evidence, update discoverable public docs
  and plan placement; retain explicit limits for optional unverified runtimes.

Harbor API credentials are available locally, but its host/cluster access is not
configured in the current workspace. Host access was requested while safety
acceptance proceeds. No tagged artifact deletion is authorized as a substitute
for storage capacity.

The focused PostgreSQL gate passed 157 tests: the existing 33 admission checks
plus 121 write/commit checkpoints, two real HTTP disconnect cases and the new
suite parent. Required CI now provisions PostgreSQL and forbids silently skipping
this gate. See the [fault acceptance receipt](../../operations/execution-capacity-fault-acceptance.md)
for the explicit operator-recovery boundary and fixture limitations.

PR #34 and main CI passed all required checks. The separate cluster installed
published rc.8, completed browser OIDC/onboarding and imported the pinned OpenCode
image through the published CLI. Native model-free smoke, protected routes,
binary artifacts and retained workspace files passed after the recorded cold
readiness failure. Migration 038 accounted for a surviving runtime at limit one;
the fixture then upgraded to a local-only `19790c5` image and rolled back to the
capacity-aware `be8f650` image at Helm revision 5. Native identity, checkpoint,
hold, 409 denial and idempotent replay were preserved. Both owned runtimes were
subsequently confirmed absent, their holds released and the workspace archived.

See the [installation/rollback receipt](../../operations/execution-capacity-install-acceptance.md).
This is not a new candidate release or a universal recovery certification.
Harbor host access and npm trusted-publisher setup were requested from the owner;
the current token's trust query returned 403. No new version/tag/channel was
published. Local Colima storage was full, so a rootless builder in the disposable
cluster was used without pruning or restarting other projects. Keep this plan
active until the named gates are actually closed.

### npm Trust Confirmation, 2026-09-11

The owner confirmed that both package-side trusted publishers were configured.
Local inspection still returns 403 with the existing token; this is not evidence
that the owner's GitHub publisher settings failed. Verify using the real protected
`npm-release.yml` identity without publishing an unfinished candidate.

- [x] Record owner confirmation and check that the workflow still matches
  owner `nabilblk`, repository `h-sandbox` and environment `npm`.
- [x] Add and test a verification-only workflow mode with no package or dist-tag
  writes; keep its credential boundary identical to publication.
- [x] Run the protected GitHub OIDC exchange against both npm packages and
  record the actual result separately from full publication acceptance.

No version bump or publication is part of this authentication check. Harbor
physical storage access, the cold-start readiness fix and coherent candidate
installation/upgrade remain separate release gates.

PR #36 passed all eight required checks and merged as `2092d6c`. Verification
run [34598935295](https://github.com/nabilblk/h-sandbox/actions/runs/34598935295)
entered the protected `npm` environment and skipped publication. The SDK exchange
returned HTTP 201, but the first checker required auxiliary response fields from
an API documentation example that npm's actual CLI does not require. Correct
the checker to validate the successful response's non-empty `token`, matching
the [npm CLI exchange contract](https://github.com/npm/cli/blob/v11.19.1/lib/utils/oidc.js),
before rerunning both package exchanges. This is a checker defect, not evidence
that the owner misconfigured npm. No tokens were printed or retained.

PR #37 passed all eight required checks and merged as `ebc8bb1`. Corrected run
[34599562524](https://github.com/nabilblk/h-sandbox/actions/runs/34599562524)
passed both the SDK and CLI package-scoped exchanges under the unchanged `npm`
environment approval rule; the publishing job was skipped. Nine focused
release/trust tests pass. The exchanged credentials were not printed, retained
or used for package writes. A registry read afterward confirmed both packages
remain `next=0.5.0-rc.8`, `latest=0.4.0`.

The owner no longer needs to supply an npm token or repeat publisher setup.
Authentication is proven; direct publication and coherent candidate acceptance
still require the real release. Harbor host/cluster access remains outstanding,
and the cold-start readiness bug remains engineering work on Harakiri, not an
owner-configuration task. No runtime code, live deployment or Brain files were
changed by this authentication follow-up.

### Cold-Start Engineering Checkpoint

The subsequent owner-authorized readiness work is implemented in the working
tree. The [technical contract and acceptance receipt](../../operations/execution-readiness.md)
records a provider-neutral execution-health endpoint, synchronous create and SDK
wait gates, async/cancellation behavior, the onboarding guard and CLI status
correction. Six fresh native runtimes passed first writes/commands without
recreation or mutation retries, using a local source API against the isolated
k0s provider/database. All owned runtimes and temporary keys were cleaned up.
The native smoke is repeatable from `tests/conformance/readiness-smoke.mjs`.

This closes the source readiness defect, not publication or coherent artifact
installation. No public deployment, npm version or dist-tag changed. Keep this
plan active until the remaining registry/candidate/installation gates are met.

### Candidate Delivery Checkpoint

The owner explicitly requested commit, deployment, publication and release.
Selected `0.5.0-rc.9` after confirming npm and all three Harbor artifact
coordinates were unused. The registry accepted an empty diagnostic upload,
which was cancelled; filesystem/inode headroom is still unverified and access
was requested again. No garbage collection or artifact deletion is part of this
release. Keep stable npm `latest` at `0.4.0` and preserve existing public OIDC
origins, Secrets, capacity activation and user workloads.

- [x] Prepare matching source/package/chart versions, real changelog and
  readiness/capacity installation guidance.
- [x] Commit through protected PR checks and merge reviewed source.
- [x] Publish immutable matching images/chart and SDK/CLI using trusted CI.
- [x] Verify anonymous artifacts and test the published bundle on the isolated
  native fixture before updating the populated public lab.
- [x] Deploy with preserved operator values, verify public identity and native
  first tasks, publish the delivery receipt and GitHub prerelease.

PR #39 merged as `f626226`; immutable `v0.5.0-rc.9` now publishes the API/web,
chart and SDK/CLI on `next`. Stable `latest` remains `0.4.0`. The isolated
fixture upgraded to Helm revision 6 and the populated public lab to revision 39,
preserving operator origins and Secret values. Published-client native tests,
capacity denial/cleanup, browser OIDC sign-in/out and the repeated public docs
suite passed. See the [delivery receipt](../../release-notes/0.5.0-rc.9-delivery.md)
and [GitHub prerelease](https://github.com/nabilblk/h-sandbox/releases/tag/v0.5.0-rc.9).

The original npm job published both packages but its immediate metadata check
hit propagation 404. PR #40 added bounded anonymous polling and a read-only
verification mode; protected CI and the subsequent read-only workflow passed.
Nothing was republished or retagged. The receipt retains the first fixture
CLI-harness error and transient public rollout 502s before successful reruns.

The explicit owner delivery request proceeded with Harbor uploads working but
physical disk/inode headroom still unavailable. That gate is not waived or
marked complete. Keep this plan active for registry monitoring/headroom and
explicitly unverified optional runtime combinations; do not describe publication
as pending or expand deployment/recovery support claims. Only owned acceptance
resources were cleaned, and the isolated VM returned to its prior stopped state.

### Harbor Retest, September 11 at 15:10 UTC

The owner requested a fresh check because storage may have been repaired.
Harbor v2.12.2 reports all eight components healthy, read-only mode disabled and
an unlimited project storage quota. Two separate 8 MiB registry upload writes
returned 202 with their full ranges; both were cancelled (204) and confirmed
absent (404), without publishing an image or tag. The disk-full error did not
recur. Publication and anonymous downloads also passed earlier in this delivery.

The volume API returns `{"storage":[{}]}` rather than capacity/free-space
figures. Treat Harbor as operational, with disk/inode headroom and monitoring
still an operator follow-up, not a currently reproduced publication failure.
Do not infer storage expansion or mark that measurement gate complete from
successful writes alone. The delivery receipt includes this retest.
