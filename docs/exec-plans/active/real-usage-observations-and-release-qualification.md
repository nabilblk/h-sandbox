# Execution Plan: Real Usage Observations and Release Qualification

**Created**: 2026-09-12
**Author**: Codex, for the Harakiri maintainer
**Status**: In Progress
**Priority**: {P0-P3}; next owner-selected milestone, Point 4 of the agreed sequence
**Estimated effort**: Multiple engineering days plus isolated acceptance and release qualification; size the phases after Phase 0
**Source baseline**: `main` at `8f25dfa2f1b9cd3e06db10e3eda87268f686917c`
**Authorization for this session**: Following the local implementation review, the owner explicitly requested commit, push, k0s deployment, release and any needed public documentation. Isolated hosted qualification may run before publication. The populated lab may receive the reviewed application upgrade with preserved configuration; destructive acceptance must remain off the Mac and existing clusters.

## Context

The north star is independent teams installing Harakiri, safely running useful agent workloads and returning to use it. Harakiri owns the sandbox control plane and developer contract; OpenSandbox is the current runtime provider, not the limit of the product's identity.

This plan follows the owner's agreed sequence, updated against source and delivery evidence rather than old active plans:

1. Kubernetes installation is discoverable in the public documentation.
2. Database-backed capacity admission and execution readiness shipped in `0.5.0-rc.9`.
3. Standalone native amd64 installation and bounded recovery qualification passed. Distinct-release/schema compatibility remains open.
4. **Now make historical usage and release operations trustworthy**, including the small first-run gap found during acceptance.
5. Then reassess a focused Python SDK against actual adopter needs. Do not insert another template catalog, provider or framework adapter ahead of this milestone.

The [rc.9 delivery receipt](../../release-notes/0.5.0-rc.9-delivery.md) records published artifacts and actual npm Trusted Publishing. The [September 12 delivery receipt](../../release-notes/2026-09-12-standalone-recovery-docs.md) records three consecutive passing native runs, public recovery documentation and a web-only deployment. These are historical receipts, not evidence that every installation or rollback profile is supported.

The remaining recovery gate is specific: the existing Helm rollback changes configuration within rc.9. It does not exercise two different application releases with a schema change. The next useful application release should supply that second version; do not mint an empty release just to turn a gate green.

### Verified Starting Point

| Surface | What the source/evidence actually establishes | Consequence |
| --- | --- | --- |
| [Usage service](../../../apps/api/src/services/usage.ts) | Counts retained sandbox records; legacy numeric placeholders remain zero, `series` is empty and coverage declares unmeasured metrics. | Add real history without silently redefining the legacy wire contract. |
| [Usage screen](../../../apps/web/src/routes/usage.tsx) | Shows current capacity and retained records; explicitly says history is not measured. | Preserve this honesty while introducing useful observations. |
| [Capacity migration](../../../db/migrations/038_organization_capacity.sql) | Durable reservation generations, recorded hold/release timestamps and runtime effects already exist. | Reuse those facts; do not build a second admission ledger. |
| [Operations migration](../../../db/migrations/013_sandbox_operations.sql) | Accepted operations and terminal outcomes have stable identities and timestamps. | Count operations, not retries, and define window/cohort semantics. |
| [Readiness service](../../../apps/api/src/services/sandbox-readiness.ts) | A read-only, fenced provider probe; reading readiness does not persist a first-ready timestamp. | History cannot depend on who happens to poll the SDK or dashboard. |
| [Scheduler](../../../apps/api/src/scheduler.ts) | Capacity, operation, lease, Vault and workspace maintenance share a bounded tick. | New observation work must not delay cleanup or capacity reconciliation. |
| [Onboarding](../../../apps/web/src/routes/onboarding.tsx) | The first task hardcodes `python-3.12`; the reference fresh catalog does not contain it. | Make the task catalog-aware, including a useful empty-catalog state. |
| [Native browser acceptance](../../../infra/acceptance/browser.mjs) | Exercises real OIDC but skips the wizard's first task in favor of later CLI/SDK work. | Test the actual first-task interaction, not just dashboard access. |
| [Release operations](../../ci-release.md) | Immutable artifact checks, protected workflows, npm OIDC publishing and read-only post-publication verification exist. | Extend qualification and operator evidence; do not rebuild publishing. |
| [Standalone recovery](../../operations/standalone-recovery.md) | Single-node k0s/local-path recovery is qualified; Harbor physical disk/inode headroom is not. | Preserve support boundaries and distinguish service health from storage capacity. |

No other Brain notes or old active plans were used as implementation authority. Customer OpenShift installation and BackgroundAgent remain outside this work.

## Outcome and Scope

An organization can answer: what operations were accepted, how many execution slots were held over time, how long execution readiness took to observe, and where the data is incomplete. An operator can detect observation lag and storage exhaustion, and install a qualified release with a specific upgrade/rollback contract.

This is **operational usage**, not an invoice, a CPU profiler, an agent-reasoning monitor or a replacement for an organization's observability platform.

### In Scope

- A reliable first sandbox task using the installed, authorized template catalog.
- Durable, organization-scoped usage history with explicit time windows, units, quality, retention and collection gaps.
- An additive API contract, TypeScript SDK access, a focused CLI command and an accessible Usage screen.
- Optional operator monitoring, tested storage/inode alert examples and documented ownership of missing infrastructure evidence.
- Extension of existing native acceptance and release verification to two genuinely different, capacity-compatible application versions.
- Public concepts, tutorials and references; technical design; operator and maintainer runbooks; truthful release receipts.

### Explicit Non-Goals

- Replacing admission, changing slot-release rules or inferring physical runtime absence from telemetry.
- Backfilling plausible-looking history from today's sandbox status, template boot estimates or configured resource limits.
- CPU/vCPU billing, pricing, invoices, long-term analytics, per-command tracing or arbitrary user-defined dashboards.
- A mandatory Prometheus/Grafana/Redis/queue installation, a general event bus or a new runtime provider interface just for this feature.
- Installing BackgroundAgent, modifying customer OCP material, changing SCCs, adding cluster-wide privileges or using Kubernetes exec as a product API.
- HA, arbitrary CSI, external-KMS recovery, a zero-downtime lab guarantee or automatic stable promotion.

## Success Criteria

- [ ] A fresh install with an empty catalog has a clear, permission-appropriate next action; an installed non-default template completes the actual first UI task exactly once.
- [ ] Usage remains correct under concurrent admission, idempotent retries, pause/resume, restore, provider uncertainty and confirmed cleanup, without changing admission decisions.
- [ ] History is stored or reproducible from retained durable facts, survives process restarts and the supported database restore, and never depends on a browser being open.
- [x] Every displayed metric has a documented source, unit, window, denominator and completeness rule; missing observations never become fabricated zeroes. Local pure/contract fixtures pass; native measurements remain separate below.
- [x] New API/SDK/CLI and UI contracts are organization-scoped, bounded and backward-compatible with the existing summary endpoint. Local route, transport and compatibility fixtures pass; PostgreSQL/native execution remains open.
- [ ] Multi-replica collection and retention pass real PostgreSQL tests; collection cannot monopolize the database pool or the maintenance scheduler.
- [ ] Operators can detect stale collection, exhausted capacity and low storage bytes/inodes using tested, optional integrations without extra core API privileges.
- [ ] Clean, isolated native amd64 acceptance includes first-run UI, real history, backup/restore and a distinct-release upgrade, supported rollback and re-upgrade.
- [ ] Release verification consumes actual published images, charts and packages by immutable identity, preserving npm `latest` until a separately approved stable decision.
- [ ] Public and internal documentation, exported docs and the release receipt agree on delivered behavior and remaining limitations.
- [ ] No existing Mac VM, k0s/CRC cluster, tunnel, unrelated container or user workload is changed by development or destructive acceptance.

## Design Contract

The following contract is implemented in the working tree. It is not yet a published or deployed feature. The hosted database/performance and native runtime gates remain open; local fixtures do not establish those claims.

### 1. Metric Dictionary

| Metric | Source and calculation | Honest interpretation |
| --- | --- | --- |
| Accepted operations | Unique accepted operation IDs in `[from, to)`, grouped by the actual create/restore/resume operation kind mapping. | A retried HTTP request is not another operation. Denial before admission is not an accepted operation. |
| Operation outcomes | Latest terminal operation records grouped by recorded completion timestamp and outcome at query time. | Explicit retries can revise prior outcome counts without adding another admission. This is not an immutable attempt log or a success-rate denominator for the admission cohort. |
| Held execution slots | Intersections of recorded reservation intervals with each bucket, using the existing reservation identity and release semantics. | Includes reserved, running, retained-paused or uncertain holds as applicable. It is not a count of physically running containers. |
| Held slot-seconds | Integral of recorded held slots over the covered portion of the requested window. | Capacity occupancy, not CPU-seconds, vCPU-hours or a billing measure. |
| Recorded peak slots | Maximum overlap of qualified recorded hold intervals within the window. | A historical peak of control-plane reservations, not a sampled physical-runtime peak. |
| Observed execution-ready latency | Time from accepted execution-cycle operation to the first successful independent, fenced readiness observation; include sample count, p50/p95 and collection resolution. | Includes queuing and provisioning. It is an observed upper bound on readiness latency, not a provider cold-start benchmark. |
| Readiness observation outcomes | Ready observations, pending/right-censored cycles, unsupported probes and interrupted observation windows. | Unobserved or failed probes never become a zero-millisecond success. |
| Current status and capacity | Existing record summary and authoritative capacity response. | Keep current values separate from historical aggregates. A current limit is not a historical limit series. |
| CPU consumption, compute hours, physical runtime duration | Unavailable unless a separately validated measurement source is introduced later. | Do not multiply allocated CPU by held-slot time or relabel occupancy as compute. |

Only publish historical status-phase breakdowns or limit changes if their transitions are actually recorded. The existing mutable reservation `phase` does not establish its entire past. Template rankings stay explicitly retained-record rankings until a time-windowed operation-based ranking is implemented and named accordingly.

### 2. Reuse Facts, Add Only Missing Observations

Start with reservation intervals and operation records as the source of historical capacity and activity. Define an explicit collection/coverage epoch; reject historical claims before a known-good boundary. Legacy migration backfills, removed records and uncertain start times must not be advertised as complete historical observations.

Add small, typed persistence only for information not already retained: readiness observation work/results and coverage/collector progress. Proposed ownership is separate `usage-history` and `usage-observer` services, with migrations under `db/migrations/`. Reuse the repository's injected query/transaction APIs. Do not place collection, presentation and capacity state machines in one service.

- Identify an observation by organization, sandbox, execution-cycle operation and fenced runtime identity. Reservation generation alone is insufficient: a retained slot can cover more than one pause/resume cycle.
- Discover accepted cycles from durable operations, not an in-memory callback after an HTTP response. Recover discovery after a restart; do not use a timestamp-only cursor that can skip late commits or later terminal updates.
- Probe only eligible cycles awaiting their first ready observation. Do not continuously probe every running sandbox to populate a chart.
- Use short, leased database claims and idempotent result keys for multiple workers. Release transactions before network calls; fence identity again before committing a result. An expired claim does not authorize a stale result.
- Extract/reuse the pure readiness probe. Keep GET readiness and SDK waits read-only. Neither metrics reads nor probes may renew leases, execute commands or alter admission state.
- Preserve a bounded observation window and distinguish timeout, unsupported capability, provider outage and collector lag. Missing observations cannot prove a sandbox was never ready.
- Use an independently budgeted observer loop in an existing worker process. Do not append an unbounded sequence of provider calls ahead of TTL cleanup in the existing scheduler.
- Source-ledger retention must cover the advertised history window. If a cleanup path can remove required facts sooner, add a minimal typed projection with proven copy-before-prune semantics, or shorten declared coverage. Do not make an unverified polling copy an accounting source.
- Observation write/query failures report a coverage gap and operator health failure. They must not turn an already accepted operation into a client-visible failure that encourages a destructive replay.
- Persist no command text, environment, request bodies, effect context, authorization headers, credential values, domain events or user emails. Use allowlisted identifiers, timestamps, states and numeric values only.

Historical reads are read-only and scoped to the authenticated organization. They never take the organization admission lock or repair capacity as a side effect. Existing ledger phase and provider-absence rules remain authoritative.

### 3. Time, Coverage and Retention

Use database `timestamptz`, UTC bucket boundaries and half-open ranges. Keep accepted, dispatched, first-observed-ready, terminal and released times distinct. PostgreSQL `now()` is transaction-start time; use a correctly placed database `clock_timestamp()` for new observation instants, not a timestamp captured before waiting for a lock. Existing ledger timestamps retain their documented meaning. See [PostgreSQL time functions](https://www.postgresql.org/docs/16/functions-datetime.html).

- Clip holds at window boundaries and include holds that began before the window. Open holds contribute only through the response's qualified observation cutoff.
- Do not derive release time from a failed probe, provider list omission, sandbox error status or process shutdown.
- A genuinely observed empty bucket is zero. An uncovered bucket is null with a reason. Partial buckets expose their covered extent rather than silently extrapolating it.
- Include `availableFrom`, `lastObservedAt`, collection status and per-metric completeness. Return explicit gaps for disabled collection, outages, lost source history, restore and mixed-version operation where applicable.
- Supported API presets initially target 24 hours, 7 days and 30 days, using bounded resolutions such as 1 minute, 15 minutes and 1 hour. Cap responses at 1,500 buckets and reject arbitrary unbounded range/resolution combinations.
- Propose 30-day retention, subject to Phase 0 sizing and a documented operator setting. Retention never deletes a still-open hold's carry-in information or changes operational ledger state.
- Compute latency percentiles from eligible samples for the requested window. Do not average precomputed percentiles. Include ready sample and censored counts so a small successful subset is not mistaken for all operations. See [Prometheus histogram guidance](https://prometheus.io/docs/practices/histograms/).
- Start with bounded indexed queries over retained facts. Introduce rollups only if the measured query/storage budget requires them, with idempotent rebuild and late-update handling. No speculative analytics subsystem.

### 4. Public API, SDK and CLI

Preserve `GET /v1/usage` and the existing `UsageSummary` numeric types and coverage meanings. Replacing a deprecated zero with null or giving it a different meaning would break existing consumers. Keep old fields documented as unavailable; introduce real metrics through a separate additive contract.

Proposed new endpoint: `GET /v1/usage/history`, with validated `from`, `to` and an allowlisted `resolution`. A typed `UsageHistoryResponse` contains the normalized window, metric summaries, buckets and explicit per-metric coverage. Measured values may be nullable in this new contract; a successful empty response must be distinguishable from unsupported or stale collection.

- Register the route in the central authorization policy using the existing organization-read permission pattern. Never accept a client-supplied organization ID as the authorization boundary.
- Share validation and error conventions with current routes. Bound ranges, rows, query duration and response size. Return consistent validation errors, not database parser messages.
- Add `client.usageHistory(options)` beside the existing flat `client.usage()` API, following current SDK transport/abort behavior. Update the private generated protocol/bundles using existing scripts; do not publish the internal shared package.
- Add a focused `harakiri usage --period 24h` command with `--json`, consistent help, authentication and API-error behavior. Preserve the unrelated per-sandbox `metrics` command.
- Do not silently expand existing API-key scopes. A runtime-only key lacking `org:read` receives the normal actionable permission error.
- New client against old server: show a capability-unavailable state for the absent history endpoint. Old client against new server: existing summary behavior continues unchanged.
- Keep history identifiers and labels tenant-safe. Do not expose provider IDs, another organization's templates or sensitive operational context.

### 5. Usage UI and First-Run UX

Keep the current restrained operational design. The Usage screen should answer a question at a glance, not become a marketing dashboard.

Use an explicit period selector and freshness state. Keep live admission capacity separate from history. Lead with accepted operations, held-slot time, recorded peak and observed readiness where samples exist, with units in labels. Provide an accessible time-series view plus equivalent tabular values. Do not draw lines through gaps or paint today's concurrency limit across the past.

Support initial loading, no activity with valid coverage, collection disabled/unsupported, partial coverage, stale last-successful data, forbidden access and retryable errors. Avoid repeated full-page spinners during refresh. Use existing controls/icons, keyboard focus, non-color-only states and constrained chart dimensions. Verify 320/390-pixel mobile and desktop layouts with browser screenshots and interactions. A chart library choice, if needed, must be lightweight, maintained and justified; there is no chart dependency to reuse in the current web package.

For onboarding, remove the default Python-template assumption:

- Fetch the authorized catalog and offer eligible active/ready templates. Respect build state, required configuration, provider support and template working directory. Do not claim automatic architecture compatibility if metadata cannot establish it.
- For an empty catalog, give an admin a route to the documented supported import/setup path. Give a member a clear unavailable state and appropriate administrator handoff. Do not seed development data or silently pull arbitrary images.
- Use one finite, deterministic task supported by the selected template in the reference profile. No paid model, LLM credential or agent inference is needed to prove first execution.
- Retain the accepted sandbox ID and intent across pending readiness and retryable waits. Disable duplicate submission and resume observation rather than creating another sandbox.
- Submit the first command only after readiness, with existing command identity/recovery semantics. An ambiguous command response is not permission to run the command again.
- Show the created sandbox and result with an Open action. Cancellation stops waiting; deletion must use an explicit existing lifecycle action, not a surprise background deletion. Keep a finite TTL and explain the resulting resource state through existing status controls.

### 6. Operator Monitoring and Release Evidence

Product history belongs in PostgreSQL. Optional process/operational metrics are a different surface, with different reset and retention semantics. Use a proven instrumentation library, not custom metric serialization.

Expose only bounded, low-cardinality operational series: collection progress/lag/errors, pending observation work, readiness probe outcomes/duration, admission denials by bounded reason, and reconciliation health. Count HTTP denial attempts as attempts, not unique business operations. Do not use sandbox, organization, user, workspace, credential or domain IDs as metric labels. See [Prometheus instrumentation guidance](https://prometheus.io/docs/practices/instrumentation/).

Metrics exposure must be opt-in and private, with a documented scrape/auth/network policy. Do not add it to the public ingress or bypass the default-deny application authorization registry. Exporter failure must not make execution unavailable. Reuse an operator's existing monitoring stack; optional monitor CRDs must render only when explicitly enabled and available.

Provide alert/runbook examples for observation staleness, sustained capacity saturation, database/workspace storage pressure and registry storage pressure. Free bytes and free inodes are separate checks. Filesystem/volume evidence comes from the operator's existing node, kubelet, database or registry monitoring, not a new privileged Harakiri API client. Test rule behavior, including missing series, using [promtool rule tests](https://prometheus.io/docs/prometheus/latest/configuration/unit_testing_rules/).

Harbor HTTP health, successful pushes and storage quotas do not establish physical free bytes or inode headroom. A live headroom claim requires dated evidence for the relevant storage paths and an owner. Missing access remains an explicit operational follow-up; it must not be disguised as a code defect or block all OSS feature work indefinitely. Do not prune or resize the user's Harbor as part of this plan.

Existing image/chart and npm workflows remain the publication path. Preserve protected environments, immutable versions, verified source, npm Trusted Publishing and read-only verification retries. Identify any real gap in the post-approval chain before adding automation. A deliberate release approval is compatible with unattended execution after approval; it must not require pasting a personal npm token or manual package repair.

## Phases

### Phase 0: Freeze the Measurement and Acceptance Contract
**Status**: In Progress

- [x] Recheck this plan against the execution commit, without importing old active-plan assumptions. Record any delivered work or changed interfaces.
- [x] Map every create/restore/resume/pause/delete/expiry/reconciliation writer to its operation, effect, reservation and cleanup facts. The [technical contract](../../operations/usage-observations.md) records retained-pause and execution-cycle ownership; database race proof remains open below.
- [x] Finalize the metric dictionary, coverage start boundary, timestamp semantics and allowed API examples. Decide exactly which historical metrics are supported in this increment.
- [x] Audit source-record retention/deletion paths and select the minimum additional persistence. Migration 039 adds only observations, continuity and read indexes, with bounded transactional locks. Actual migration/restore execution is still unqualified.
- [x] Freeze observer interval/concurrency/time budgets, bounded query limits, retention and reference scale. The technical contract records about 1,667 observation rows/day at the 50,000-operation/30-day fixture; actual bytes/index/WAL cost remains explicitly unmeasured.
- [ ] Establish repeatable baseline measurements on a disposable PostgreSQL runner. Initial qualification targets: a 30-day/50,000-operation history fixture at 200 held slots, p95 history below one second, and no material admission/cleanup regression under collection load. Fix the runner profile and regression threshold before implementation; these are test targets, not product SLAs.
- [x] Retain the published rc.9 artifact manifest and document the intended candidate/source/schema matrix. Candidate coordinates remain unassigned; no rc.9 artifact is overwritten.
- [x] Name the registry/storage follow-up contact in the operator runbook and specify required filesystem evidence. Physical headroom is unverified; no local infrastructure inspection or mutation is performed to manufacture that proof.

**Exit gate**: A reviewable schema/API/example contract, bounded resource model and test matrix. Unmeasured CPU/billing and wider recovery promises remain excluded.

### Phase 1: Repair and Prove First-Run Onboarding
**Status**: In Progress

- [x] Implement the catalog-aware first task and admin/member empty states in the existing onboarding route, reusing current template and readiness APIs.
- [x] Preserve accepted identities through delayed readiness, errors, reload/re-entry where supported, cancellation and duplicate clicks; use existing command recovery rather than blind re-execution.
- [x] Add focused pure/browser tests for empty catalog, renamed/non-Python template, archived/unready template, member handoff, pending readiness, capacity denial and ambiguous command completion. Readiness supplies the accepted runtime's working directory, overriding stale catalog metadata.
- [x] Extend the isolated browser harness to encounter the empty catalog, perform the documented authorized import, return to onboarding, run the selected template's first task and inspect its result. Source written; native execution remains open below.
- [ ] Verify the test owns and cleans up its key, sandbox and imported fixture through supported APIs. Preserve real OIDC/PKCE/logout coverage and secret-safe artifacts.

**Exit gate**: The literal first-task button works on a clean supported install; clicking Open dashboard alone cannot satisfy this gate.

### Phase 2: Implement Durable History and Bounded Observation
**Status**: In Progress; implementation and local unit tests pass, PostgreSQL acceptance pending

- [x] Add the minimum additive schema and typed services agreed in Phase 0. Migration 039 is additive and transaction-bounded; actual binary/schema acceptance remains a separate gate.
- [x] Implement organization-scoped interval/window queries and operation counts with deterministic bucket boundaries, carry-in, open holds and terminal-outcome semantics.
- [x] Implement independent readiness discovery, leased work, fenced probes, idempotent results and collection coverage. Readiness GET and capacity transactions are unchanged.
- [x] Add bounded retention/projection maintenance, restart recovery and collector health signals. Observation cleanup never prunes operational holds or operations.
- [x] Add real PostgreSQL tests for concurrent workers, claims/reclaims, partial commits, duplicate discovery, later operation updates, terminal races, source retention and restart gaps. They require an explicit isolated database and hosted-runner guard; they were not run locally.
- [x] Run existing local admission/fault/readiness/lease/workspace regression suites. Live/isolated database tests remain skipped by their safety gates, not counted as passes.
- [ ] Execute the PostgreSQL suite and measure database pool use, statement plans, collector throughput and maintenance delay against the frozen baseline. Replacement-database proof remains in native acceptance.

**Exit gate**: Truthful history can be queried after a restart with the browser closed; observer failures do not corrupt capacity or delay confirmed cleanup.

### Phase 3: Deliver the API, SDK, CLI and Usage Screen
**Status**: Local implementation and contract/browser verification complete; native cross-surface proof pending

- [x] Add the history route, centralized authorization entry, validated query contract and shared types without changing legacy summary semantics.
- [x] Add SDK transport tests and published-shape protocol generation; add CLI human/JSON output, help, scope errors and unsupported-server behavior.
- [x] Replace the history placeholder with the scoped operational view, preserving live capacity and retained-record labels where still applicable.
- [x] Add contract/permission tests, old/new client fixtures, time-window correctness and row/query-budget error handling. Actual database timing is not established by those local fixtures.
- [x] Browser-test period selection, refresh, partial/gapped/empty/stale/error states, keyboard navigation and narrow-screen readability. All 44 selected browser checks pass; desktop/mobile Usage and first-task screenshots were visually inspected.

**Exit gate**: UI, SDK and CLI agree on the same underlying observations and quality information, with no invented values or tenant leaks.

### Phase 4: Add Optional Operator Monitoring and Close Automation Gaps
**Status**: In Progress; local HTTP, Helm and Prometheus rule fixtures pass

- [x] Add bounded process metrics and chart settings for private opt-in scraping without installing an observability stack or granting new cluster-wide permissions.
- [x] Provide storage-byte, inode, missing-metric and collection-lag alert examples with unit fixtures and diagnostic runbooks. Include deployment ownership and exporter prerequisites.
- [x] Lint default and restricted chart profiles; render disabled and explicitly enabled monitoring, including missing-CRD/Secret and invalid-config failures. Defaults add no monitor CRDs or metrics ingress.
- [ ] Test installation and explicitly enabled monitoring on the disposable native profile. Rendering fixtures do not prove an authenticated live scrape.
- [x] Audit post-approval release instructions and extend existing source acceptance/receipt wiring only. Preserve protected credentials, immutable identities and resumable read-only verification; actual published-pair qualification remains Phase 7.
- [x] Test transient npm metadata lag, partial publication, immutable-artifact conflicts and registry failure with local process fixtures. No live publication was attempted or retried.
- [x] Record the named Harbor headroom follow-up and required dated bytes/inodes/quota/growth evidence. No claim of physical headroom is made without operator evidence.

**Exit gate**: Alert behavior and the software monitoring path are proved; receipts distinguish that proof from any still-unverified infrastructure headroom.

### Phase 5: Run Isolated Feature, Migration and Recovery Acceptance
**Status**: In Progress; guarded source rehearsal added, no native execution yet

- [x] Extend the existing native amd64 harness using run-owned resources and candidate artifacts in a disposable environment. The opt-in `usage_source` workflow input builds unpublished artifacts only on its hosted runner.
- [ ] Execute create, retry, concurrent denial, async readiness, pause/resume, restore and confirmed delete; assert unique operation counts, held intervals and declared readiness coverage against known test events.
- [ ] Stop/restart the observer and interrupt provider access. Confirm gaps/censored samples, continued admission safety, eventual observation recovery and no replayed command.
- [ ] Restore the application database onto replacement storage using the existing isolated recovery procedure. Verify historical values, retention boundaries, current collection epoch and organization separation after restore.
- [ ] Run an additive-schema rehearsal with baseline capacity-aware binaries and candidate binaries, including old/new API-client combinations, mixed-writer coverage and re-upgrade. This rehearsal does not replace published-release acceptance.
- [ ] Verify migrations do not invalidate capacity constraints, overload admission locks or require reverting migration 038. No untested destructive down-migration is permitted.
- [ ] Retain allowlisted structured evidence, redacted screenshots, timings, versions and cleanup results. Failures must remain visible; never replace an earlier failure receipt with a broader success claim.

**Exit gate**: Feature and compatibility acceptance passes on the isolated reference profile, with resource/performance measurements and no local workload changes.

### Phase 6: Complete Documentation Across Audiences
**Status**: In Progress; concept, tutorial, references and operator pages added as source previews

- [x] Add a first-class public Usage and capacity-observation concept page: metric definitions, units, examples, coverage, retention, scope and non-billing boundaries. It must not exist only inside a tutorial.
- [x] Update installation/getting-started for the source-preview first-template workflow; add an executable SDK tutorial and isolated gap procedure. Examples typecheck, including against locally packed packages; live execution and cleanup remain acceptance gates.
- [x] Document history API parameters/responses/errors, SDK/CLI examples, required scopes, old-server behavior and supported retention/range configuration. Examples typecheck against the built source interfaces; runtime execution remains pending.
- [x] Add technical documentation for schema/source ownership, query semantics, observer fencing, collection failure handling, retention and recovery, with a concise source/data-flow diagram.
- [x] Add an operator monitoring/runbook page and update upgrade/recovery guidance with the intended binary/schema matrix and explicit untested rollback boundaries.
- [x] Update maintainer release instructions for post-approval automation, artifact verification, headroom evidence, partial-failure recovery and stable-channel decisions. Replace stale rc.8 publication commands with an explicit unused-version requirement.
- [x] Update public navigation, search, reading progression, Markdown exports, docs index and LLM exports. Local documentation tests pass; final full-page browser pass is recorded in the progress log.
- [x] Prepare accurate unreleased notes and a delivery-receipt template. No public changelog or delivery claim is fabricated before Phase 7.

**Exit gate**: A new operator/developer can follow public instructions without private notes, developer credentials or a maintainer silently repairing the environment.

### Phase 7: Qualify the Actual Release and Close the Milestone
**Status**: Not Started; publication and any populated-lab deployment require separate owner authorization

- [ ] Review source/tests/docs, select a previously unused version and resolve candidate artifact identities. Keep rc.9 artifacts and prior receipts immutable.
- [ ] After approval, use the existing protected Harbor/npm workflows to publish the substantive candidate and verify anonymous chart/image/package consumption, integrity and provenance where actually provided.
- [ ] On a fresh native amd64 runner, install the published rc.9 baseline, generate owned data, upgrade to the actual published candidate and exercise new history/onboarding behavior.
- [ ] Perform the documented compatible binary/chart rollback, retaining additive schema where required; then re-upgrade. Prove capacity fencing, keys, workspace files and historical data remain consistent. Record observation gaps instead of filling them during old-version operation.
- [ ] Re-run the relevant encrypted/provider recovery gates and first-work journey using published SDK/CLI, not workspace-linked packages. Record exact baseline/candidate versions, source SHAs, schema levels and image/chart/npm identities.
- [ ] If compatibility cannot be proved, stop the rollback claim and release promotion; document the supported restore/roll-forward path and the specific failing gate. A same-version Helm values change is not a substitute.
- [ ] Publish the qualification receipt and release notes only with the evidence actually obtained. An RC remains on `next`; stable `latest` promotion is a separate owner decision with an explicit supported-upgrade matrix.
- [ ] If a populated lab deployment is separately requested, use explicit context/namespace UID guards, preserved operator values and a reviewed manifest diff. Recheck public web/API/auth origins and OIDC for loopback redirects. Do not run legacy dev deployment scripts or modify unrelated workloads.
- [ ] Record delivered versus externally pending work and adopter feedback. Move this file to `completed/` only when required software, docs and release gates are satisfied, or explicitly re-scope with the owner; never mark an unresolved gate complete.

**Exit gate**: A real, qualified application release exists with credible historical usage and an evidence-backed upgrade path. The next product decision is a focused Python SDK/adopter integration, not an indefinite observability expansion.

## Verification Matrix

| Risk | Required proof |
| --- | --- |
| Duplicate accounting | Same intent/retry, worker retry and concurrent collector claims yield one accepted operation and one first-ready result per execution cycle. |
| Incomplete lifecycle identity | Retained-slot pause/resume, new-generation resume, restore and replacement provider identity cannot reuse stale observations. |
| Capacity/usage conflation | Uncertain and cleanup-pending holds remain occupied; failed probes do not release them or become zero running time. |
| Missed short operations | Durable operation discovery includes operations completed between collector polls; late commits and terminal updates are not skipped. |
| Unavailable readiness | Unsupported provider, bounded timeout and observer outage produce explicit unobserved/censored states rather than false success. |
| History quality | Empty covered buckets, uncovered buckets, retention cutoff, pre-window holds, open holds, UTC boundaries and partial windows have exact fixtures. |
| Misleading aggregates | Operation cohorts versus outcome windows are tested separately; percentiles use eligible samples and expose sample/censored counts. |
| Scope/privacy | Admin/member/API-key permissions and cross-organization queries are tested; metrics/log/receipt allowlists reject secrets and high-cardinality identifiers. |
| Operational regressions | Capacity, lease expiry and cleanup still make progress during slow probes, failed writes, pool contention and large history queries. |
| UI truth and usability | Real screenshots and interactions cover fresh install, result, no activity, gaps, stale data, permission errors and 320/390/desktop layouts. |
| Retention and restore | Restart and replacement-database recovery preserve qualified history; pruning cannot erase open-interval carry-in or active operational facts. |
| Release compatibility | Actual published rc.9 -> candidate -> supported rollback -> candidate; mixed-version feature absence is explicit and pre-capacity writers are never reopened. |
| Monitoring | Alert tests cover low bytes, low inodes despite free bytes, missing exporter series, process resets and sustained collection lag. |
| Artifact immutability | Partial publish/metadata lag recovers through verification without overwriting tags or repeating successful npm publications. |

## Safety and Execution Rules

- Implementation, branch/PR delivery, hosted qualification, candidate publication and a guarded k0s application deployment are now authorized. Stable-channel promotion, dependency upgrades and destructive local acceptance are not part of this request.
- Destructive integration tests must target a disposable GitHub-hosted native amd64 runner, using the existing standalone harness's ownership, cleanup and resource guards.
- Never use the machine's current kubecontext implicitly. Do not stop/restart Lima, k0s, CRC, Colima, Docker, cloudflared, port forwards or unrelated processes for acceptance.
- Do not read, stage, publish or delete the unrelated `docs/cot/` content. Do not use other Brain files or customer installation material as inputs.
- Never capture real secret values, public users' data or private credentials in receipts, test fixtures, screenshots or CI artifacts. Use generated short-lived test identities and cleanup them.
- Additive usage tables are not permission to run pre-capacity binaries. The migration runner has no established generic down-migration contract; document binary compatibility and schema restoration separately.
- Stop and report if testing requires permissions, resources or public-environment changes outside these boundaries. Do not turn missing operator access into invasive local diagnostics.

## Documentation and Ownership Map

| Area | Existing entry points; new files only as needed |
| --- | --- |
| API and persistence | [usage service](../../../apps/api/src/services/usage.ts), [usage route](../../../apps/api/src/routes/usage.ts), [authorization](../../../apps/api/src/authorization.ts), [readiness](../../../apps/api/src/services/sandbox-readiness.ts), [scheduler](../../../apps/api/src/scheduler.ts), `db/migrations/` |
| Contract and consumers | [shared contract](../../../packages/shared/src/index.ts), [SDK](../../../packages/sdk/src/index.ts), [CLI](../../../packages/cli/src/index.ts), [web usage client](../../../apps/web/src/api-client/usage.ts) |
| Web and public docs | [onboarding](../../../apps/web/src/routes/onboarding.tsx), [usage](../../../apps/web/src/routes/usage.tsx), [docs content](../../../apps/web/src/docs-content.tsx), [navigation](../../../apps/web/src/docs-navigation.ts), [exports](../../../apps/web/src/docs-export.tsx) |
| Internal/operator docs | [capacity operations](../../operations/execution-capacity.md), [readiness operations](../../operations/execution-readiness.md), [recovery](../../operations/standalone-recovery.md), [release operations](../../ci-release.md), new focused usage/monitoring runbooks |
| Acceptance | [native harness](../../../infra/acceptance/README.md), [artifact pins](../../../infra/acceptance/versions.json), [hosted workflow](../../../.github/workflows/standalone-acceptance.yml), targeted service/route/browser tests |
| Publication | [Harbor workflow](../../../.github/workflows/release.yml), [npm workflow](../../../.github/workflows/npm-release.yml), [source validation](../../../scripts/check-release-source.mjs), [artifact verification](../../../scripts/check-release-artifacts.mjs), `docs/release-notes/` |

## Open Decisions and Dependencies

| Item | Resolution point | Default direction |
| --- | --- | --- |
| Numeric priority and phase estimates | Owner/Phase 0 | Preserve the agreed Point 4 sequence; no invented urgency ranking. |
| Observer cadence, query scale and retention budget | Source contract fixed; isolated measurements pending | Ten-second loop, two dedicated connections, bounded eight-probe passes, 30-day history and 1,500 buckets. Tune only from the prepared measurement fixture. |
| Need for an additional lifecycle projection | Source audit completed | Reuse retained operation/reservation facts. Latest terminal outcomes are revisable, not an append-only attempt log; no duplicate lifecycle ledger added. |
| Chart and process-metrics libraries | Resolved in implementation | Bounded CSS bars with equivalent accessible table; maintained Prometheus client on private opt-in listener. No mandatory monitoring service. |
| Physical Harbor storage evidence | Operator with storage/exporter access | Track separately from HTTP availability and release checks; no automatic pruning or host changes. |
| Candidate version and supported rollback target | Release preflight and Phase 7 | Next substantive unused candidate, with rc.9 as the capacity-aware baseline if source review confirms compatibility. |
| Publication, deployment and stable promotion | Owner | Separate explicit decisions; writing or implementing this plan is not automatic authorization. |

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
| --- | --- | --- | --- |
| 2026-09-12 | Advance Point 4 rather than restart capacity admission. | Source and published receipts show the earlier control-plane work is delivered. | Follow stale checklist wording or implement Python first. |
| 2026-09-12 | Include the bounded first-task onboarding correction. | Independent install acceptance must cover what a new UI user actually clicks. | Keep skipping the wizard's first task in favor of CLI-only success. |
| 2026-09-12 | Separate reservation occupancy, observed readiness and physical compute. | Each has a different source and meaning; false precision erodes trust. | Reuse old compute/cold-start labels for convenient derived values. |
| 2026-09-12 | Reuse durable operations/reservations and add a bounded independent observer. | Avoid duplicate control-plane truth and client-polling bias. | In-memory counters, readiness GET writes, continuous polling of every runtime or a general event bus. |
| 2026-09-12 | Keep the summary contract and add typed history. | Existing numeric placeholders and coverage semantics cannot be changed silently. | Replace old zeros with nulls in place or fill the untyped numeric series. |
| 2026-09-12 | Keep infrastructure monitoring optional and operator-owned. | OSS installation must not gain a mandatory monitoring stack or privileged core component. | Give the API node access or infer disk health from successful Harbor uploads. |
| 2026-09-12 | Qualify two real releases on disposable native runners. | Same-version configuration rollback does not close the compatibility gate; the user's local services must remain undisturbed. | Empty release, reused local cluster or a rollback to pre-capacity rc.8. |
| 2026-09-12 | Include public concepts, internal design, operator guidance and maintainer release docs. | A feature is not self-serve if its definitions and recovery procedure live only in private notes or tutorials. | Add a chart and a short changelog entry only. |
| 2026-09-12 | Use a dedicated two-connection observer pool and a non-overlapping 10-second loop. | Keep provider calls and observation contention outside admission/cleanup connections and transactions. | Share the maintenance tick or keep a transaction open during probes. |
| 2026-09-12 | Use `@prometheus-io/client` 0.16.1 on a separate, disabled-by-default Bearer-protected listener. | Maintained Prometheus client, bounded process metrics, no public API metrics bypass or mandatory CRDs. | Hand-written exposition or unauthenticated metrics on the public API. |
| 2026-09-12 | Keep source rehearsal distinct from published-release qualification. | Local image/package builds can test schema 039 but cannot establish published artifact provenance or a supported release rollback. | Relabel workspace tarballs as published packages or mutate rc.9 tags. |
| 2026-09-12 | Keep all changes local, per the owner's explicit choice. | Preserve running Mac/k0s services and avoid unapproved external execution. | Push a branch or start a disposable hosted run under an older approval. |
| 2026-09-12 | Describe terminal outcomes as latest records, not immutable attempts. | Existing retries can clear/change completion state. Accurate semantics do not require a second event ledger for this increment. | Imply historical outcome counts can never change or add broad attempt analytics. |
| 2026-09-12 | Calculate indexed discovery/pruning cutoffs once from the database clock after the observer lock. | Avoid volatile per-row clock predicates without using a cursor that misses late commits. | Host-clock timestamps or timestamp-only discovery checkpoints. |
| 2026-09-12 | Verify local package installation with anonymous npm configuration and source tarballs. | Test distributable shape and example types without publishing or exposing owner credentials. | Treat workspace linking as package acceptance or publish under rc.9. |

## Progress Log

| Date | Checkpoint | Evidence and next action |
| --- | --- | --- |
| 2026-09-12 | Plan authored; implementation not started. | Reviewed source baseline, release receipts, native harness and primary time/monitoring references. Next is Phase 0 contract/sizing review when execution is authorized. No running service was changed. |
| 2026-09-12 | Source implementation spans onboarding, history, observer, API/SDK/CLI/UI, monitoring and docs. | API: 342 passed, 8 isolated/live tests skipped. SDK: 69 passed. CLI: 82 passed. Nine new browser fixtures initially passed; final state coverage and visual fixes are being rechecked. No local cluster/database changes. |
| 2026-09-12 | Optional monitoring checks pass locally. | Two Helm rendering contracts, authenticated HTTP fixtures and six `promtool` rule fixtures. The tool was checksum-verified and run without a daemon/container. Native monitoring and actual storage headroom are not established. |
| 2026-09-12 | Hosted acceptance prepared, not executed. | PostgreSQL concurrency/retention/performance suite and source rc.9/schema-039/recovery rehearsal are wired into existing CI. Branch/runner approval requested; no source branch pushed, packages published or production deployment performed. |
| 2026-09-12 | Local-only boundary confirmed; source and package checks pass. | Full workspace tests/typechecks/build, examples, OpenAPI validation, anonymous local SDK/CLI tarball consumption, Helm rendering/lint and nine promtool fixtures pass. PostgreSQL/native/physical-headroom/published-compatibility evidence remains open. Final browser regression pass follows fixture corrections. |
| 2026-09-12 | Final browser regression and visual review passed. | 44 tests cover authorization, capacity, first-task readiness/recovery, Usage states and all public docs at 1440/390/320px. Updated old `/run`/history-placeholder fixtures; isolated Vite from SDK-rebuilding typechecks to prevent artificial reloads. Web unit tests: 96 passed. Workspace tests/typechecks and example/OpenAPI checks also passed. Screenshots are local fixture evidence, not live runtime proof. |
| 2026-09-12 | Owner authorized commit, push, release and k0s deployment. | Explicit kubeconfig confirms the arm64 k0s node Ready and Harakiri rc.9 at Helm revision 40. Default kubecontext is CRC and must not be used. Proceed through hosted PostgreSQL/native gates before candidate publication; retain operator values and dependency versions. |
| 2026-09-12 | PR 45 initial CI identified a database fixture error. | Run 34704935987 passed source/history scanning, browser contracts, image builds, chart, SDK/CLI conformance and release dry-run. The new PostgreSQL suite stopped in organization setup because its shared UUID/text parameter needed an explicit UUID cast. Corrected the fixture; no acceptance assertion was removed. Source-native run 34704934903 remains separate. |

## Tech Debt Incurred

No new operational ledger is introduced. The observer deliberately ends first-ready observation after ten minutes and reports remaining cycles as unobserved; high-scale throughput must be measured before expanding the supported profile. Existing legacy numeric placeholders remain for wire compatibility. Source clients retain the existing package version until approved release preflight assigns a new version; they must not be published under the rc.9 identity. Missing physical Harbor evidence and published compatibility remain explicit open gates.

## Completion Notes

Not completed. Source implementation and local verification are present; this is not a release or native-acceptance receipt. The next authorized step, when the owner allows external work, is isolated PostgreSQL/source-native qualification, followed by any required fixes, explicit publication approval and actual published-pair acceptance. No local cluster or database is an acceptable substitute. Keep this plan in `active/` until its remaining gates are satisfied or explicitly re-scoped.
