# Execution Plan: Native Agent Observability

**Created**: 2026-11-09
**Author**: Codex with product direction from the maintainer
**Status**: In Progress - optional recording helpers and external OTLP fan-out locally verified; automatic agent capture and operational acceptance incomplete; image audit blocks release
**Priority**: Unassigned; milestone approved, relative backlog priority not reassessed
**Estimated effort**: Multi-week, cross-stack work; re-estimate after the qualification spike
**Baseline**: `c83253746f3b767782f644b36bed582f404acbc7`

## Context

Harakiri should make sandbox-backed agent execution understandable without
requiring every adopter to assemble an observability product. The intended
experience is to enable capture, run a supported workload, and investigate its
steps, commands, output and failures directly in the Workbench.

The approved architectural direction is authenticated OpenTelemetry ingestion,
OpenTelemetry Collector as the default pipeline, VictoriaLogs and VictoriaTraces
as the first bundled storage implementations, and optional VictoriaMetrics.
Vector remains an interoperability option, not a required second pipeline.

The UI should learn from Braintrust, Langfuse and W&B Weave while retaining
Harakiri's existing design and runtime-control context. The distinguishing value
is the connection between reported agent activity and concrete sandbox execution,
not another generic monitoring dashboard or an evaluation platform.

This warrants a full execution plan: capture semantics, isolation, credentials,
retention, public SDK contracts, cluster installation and visual interaction all
depend on each other. A beautiful viewer cannot compensate for missing spans,
incorrect attribution, silently lost logs or a fragile installation.

### Source-grounded baseline

These are code observations, not new runtime qualification:

| Existing surface | Current behavior | Integration boundary |
| --- | --- | --- |
| `apps/api/src/services/sandbox-runtime.ts` | Combines control-plane events and provider log snapshots; exposes tracked commands and live metrics | Preserve runtime-provider ownership; add correlation without Kubernetes exec/log shortcuts |
| `apps/api/src/providers/runtime/provider.ts` | `RuntimeLogEntry` has timestamp, level, message and source, not trace/run identity | Do not claim existing log entries already carry distributed context |
| `packages/shared/src/command-events.ts` | Command output/status/reconnect stream contract | Preserve cursors, termination and recovery semantics |
| `packages/sdk/src` and `packages/python-sdk/src/harakiri` | Client lifecycle, command observation and recovery | Optional telemetry integration must not change execution or cleanup behavior |
| `packages/deepagents/src` and `packages/python-deepagents/src/harakiri_deepagents` | Framework tools execute remotely, but the agent loop/model calls remain in the trusted application | Instrument both sides and propagate context; an in-sandbox collector alone is insufficient |
| `apps/web/src/routes/sandbox-detail.tsx`, `workbench.ts`, `routes/sandbox-logs.tsx` | Workbench tabs, sandbox navigation, command permalinks, bounded log snapshots | Extend navigation rather than replace existing terminal/files/log workflows |
| `docs/operations/operator-monitoring.md` | Private operational metrics and bounded product usage observations | Keep operator telemetry, product usage and agent-run telemetry distinct |
| `infra/charts/harakiri` and `infra/openshift/standalone` | Helm deployment and restricted OpenShift onboarding | Optional namespace-local profile; no implicit SCC or node-access requirement |

No Brain files, historical active plans or customer-specific `OCP-install`
content were used to define this milestone. The untracked `docs/cot/` material
is outside its scope.

## Product Contract

### Questions the first release must answer

1. Which run is executing, and what activity has actually been observed?
2. Which reported step failed, timed out or retried?
3. Which Harakiri command, output or available artifact belongs to that step?
4. Where was time spent, including overlapping operations and missing coverage?
5. Can the same investigation be reopened after the sandbox has terminated?

### Capture levels

| Level | Evidence | Promise and limit |
| --- | --- | --- |
| Runtime | Harakiri-managed lifecycle/commands and provider-supported output/measurements | No claim to capture every subprocess, file write, network request or model call |
| Instrumented agent | Agent/model/tool spans from a qualified integration | Exact supported integration/version matrix; arbitrary code is not automatically instrumented |
| Content capture | Opt-in prompt, completion, tool payload and application log bodies | Explicit organization policy, restricted access, size limits and retention; never assume redaction is perfect |

The UI must distinguish configuration from received evidence: disabled,
awaiting telemetry, runtime only, agent instrumentation connected, stale,
partial, unavailable and expired. Absence of errors is not success. Missing
usage or cost is not zero. Do not expose or claim to recover internal model
reasoning; observable messages and actions are the product's evidence.

### First-release boundary

- Native run discovery and detail, trace tree/waterfall, correlated retained logs,
  command links, capture configuration and instrumentation diagnostics.
- TypeScript and Python integration through standard OTel facilities, with one
  qualified Deep Agents host-plus-sandbox recipe in each language.
- One supported agent-in-sandbox recipe. OpenCode is the preferred candidate,
  but its actual event/plugin coverage must pass Phase 1; do not promise model
  spans by parsing arbitrary console text or silently intercepting TLS.
- A tested bundled logs/traces profile and clearly described external export.
- Metadata-only defaults with optional content capture under separate permission.
- Retained investigation after termination, not deterministic execution replay.

Deferred: evaluation datasets, scoring/review queues, prompt management, model
gateways, automatic cost/pricing engines, inferred goal drift, autonomous incident
diagnosis, universal framework support, general-purpose graph dashboards and
historical resource storage in VictoriaMetrics. Existing measurements can be
linked with their original availability/coverage labels.

## Architecture and Ownership

```text
Trusted caller                         Sandbox workload
Agent/framework + optional SDK         Qualified instrumentation / log capture
             |                           |
             +---- OTLP + run context ---+
                               |
              Harakiri-authenticated ingestion boundary
              Scoped grants, policy, quota, trusted binding
                               |
                    OpenTelemetry Collector
              Normalize / filter before durable buffering
              Bounded queues, retry and loss accounting
                               |
                +--------------+---------------+
                |                              |
          VictoriaLogs                   VictoriaTraces
                |                              |
                +------ authorized queries ----+
                               |
                  Harakiri observability API
                               |
                  Runs / Workbench inspector

PostgreSQL: run index, ownership, correlation bindings, capture policy,
           grant lifecycle, ingestion/coverage watermarks; not raw telemetry.
Optional later: VictoriaMetrics for qualified historical measurements.
Optional export: existing OTLP destination, including an operator-owned Vector.
```

### Boundaries to preserve

- Runtime lifecycle and commands remain behind `RuntimeProvider`. Telemetry
  cannot authorize sandbox creation, release capacity or change execution state.
- Collection/transport, storage queries, run identity and presentation are
  separate modules. Do not grow `sandbox-runtime.ts` into an observability engine.
- Use maintained OTel receivers/exporters and official SDKs. Do not implement a
  custom OTLP codec, framework tracer, log database or time-series database.
- OTLP is an ingestion contract, not a portable query API. Introduce a small,
  tested query interface with one Victoria implementation, not a speculative
  multi-backend framework.
- Backend URLs, tenant headers and storage credentials are operator-controlled.
  Browsers and sandbox workloads never query Victoria directly.
- Normal application API authentication is separate from write-only telemetry
  grants. Instrumentation must not inherit a general Harakiri API key.
- Existing Langfuse/LangSmith/OTel users must not get a second global tracer
  provider, duplicate spans or replaced propagators. Reuse supplied context and
  providers; make standalone setup explicit and ownership-aware.

### Run and signal model

Define shared contracts before API/UI implementation:

- A stable Harakiri run ID distinct from sandbox ID, framework thread ID,
  command ID and OTel trace ID. A sandbox may host multiple runs. A run may have
  several authorized sandbox/trace links; never assume one trace equals one pod.
- Organization and run-to-sandbox bindings owned by the control plane. Framework
  correlation identifiers are untrusted, length-bounded metadata, not permissions.
- Span parentage, span links, kind, status, timing, resource/scope attributes and
  schema version. Preserve IDs and nanosecond values without JavaScript precision
  loss; derive bounded UI timing values separately.
- Log timestamp and observed timestamp, severity, source, trace/span/command
  correlation when supplied, and explicit truncation/retention information.
- Reported run outcome separate from observed runtime outcome and telemetry
  completeness. A closed root span or a failed child does not alone prove the
  overall job's success or failure. Staleness must not manufacture completion.
- Live activity events for supported integrations: final-span export alone cannot
  report a step while it is still running. Document any integration that exposes
  only completed spans. Do not animate fabricated progress.
- Unknown/missing parents, late/out-of-order records, duplicate deliveries,
  clock skew, retries and interrupted writers handled explicitly.
- Token accounting based on recorded model-call usage; avoid summing both child
  and aggregate parent counters. Partial measurements stay labelled partial.

### Security, privacy and reliability

- Derive tenant and run bindings from authenticated grants, not caller-supplied
  tenant headers, resource attributes or trace IDs. Strip/overwrite reserved
  fields. A producer cannot label itself as trusted control-plane evidence.
- All list, search, detail, follow, export and deletion queries enforce server-side
  authorization. Cross-tenant trace-ID collisions must remain isolated.
- Separate metadata reading, sensitive-content reading, capture configuration
  and ingestion privileges. Add narrowly defined scopes and migration behavior
  to the existing authorization matrix; never silently expand old API keys.
- Short-lived ingestion grants need revocation, sandbox/run binding, bounded
  final-flush rules and rate limits. Tokens are never in URLs, trace attributes,
  command history, browser persistent storage or public examples.
- Protect Collector ingress against direct bypass of the Harakiri gateway using
  authenticated transport and NetworkPolicy, not network location alone. Qualify
  trusted tenant propagation through batching; context must not cross batches.
- Minimize data at the producer and enforce policy before persistent queues,
  exporter buffers, debug logs or storage. Apply it to events, exception text,
  resource attributes and log bodies, not just prompt fields. No raw dead-letter
  destination may bypass the content policy.
- Content capture is an explicit decision. Define precedence as operator ceiling,
  organization policy, then run/template choices; downstream choices cannot
  widen an upstream restriction. Changing a default does not retroactively erase
  retained data; deletion is a separate operation with a tested contract.
- Limit compressed and decompressed request bytes, nesting, attribute count,
  record size, cardinality, throughput, query range and export size. Use explicit
  overload errors and bounded retries; no unbounded agent output in PostgreSQL.
- Keep telemetry off the execution-critical path. Observe queue saturation,
  dropped/rejected events, storage pressure and accepted-versus-queryable delay.
  Do not claim exactly-once delivery or durable storage from an enqueue response.
- Lifecycle/security audit records keep their existing authoritative path and
  retention policy. Workload telemetry is diagnostic, potentially falsifiable
  data, not a compliance-grade audit trail.
- Egress-restricted workloads receive only the narrowly scoped telemetry path;
  never open general Internet access to make tracing work.

## UI/UX Specification

### Research translated into Harakiri decisions

Reference documentation and public screenshots were inspected on 2026-11-09.
No proprietary UI assets are to be copied into the product.

| Reference | Useful pattern | Harakiri adaptation |
| --- | --- | --- |
| [Braintrust trace inspection](https://www.braintrust.dev/articles/what-does-a-good-ai-agent-trace-look-like) | Tree plus common-time-axis timeline; inspect meaningful steps | Make retries/concurrency readable and link steps to commands |
| [Langfuse observability](https://langfuse.com/docs/observability/overview) | Searchable records and focused span/content inspection | Progressive disclosure, explicit capture/coverage state, correlated logs |
| [W&B Weave Trace view](https://docs.coreweave.com/products/wandb/weave/guides/tracking/trace-tree) | List-to-tree-to-detail investigation with keyboard navigation | Keep selection and filters while moving between runs and steps |

### Information architecture

1. Organization-level **Runs** entry for finding current and retained runs.
   Compact table, not decorative metric cards. Columns: name, reported outcome,
   coverage, sandbox association, started time, duration and observed token usage.
   Unknown values are explicit; optional columns do not displace the primary task.
2. **Runs** tab inside each sandbox Workbench with the same viewer and scoped
   results. Preserve the existing sandbox navigation on the left.
3. Run detail with tree/timeline navigation and a span inspector. Run list can be
   collapsed into a back link/previous-next navigation rather than forcing four
   narrow columns beside the existing sandbox sidebar.
4. Existing **Logs** remains useful without instrumentation. Add optional run/span
   correlation filters without disguising legacy snapshots as durable streaming.

```text
Sandbox navigation | Runs / Repair parser       Failed   Partial coverage
                   | Started ...  Duration ...  Model ...  Tokens unknown
                   | Tree | Timeline     Search steps     Errors only
                   +---------------------------+-------------------------+
                   | Agent run                 | Selected tool step      |
                   |   Model call              | Outcome / timing        |
                   |   Read repository         | Overview | Logs | Data  |
                   |   Run tests [failed]       | stderr and command link |
                   |   Retry ...               | available artifact link |
                   +---------------------------+-------------------------+
```

### Interaction and visual contract

- Preserve the current brand, Hanken Grotesk/JetBrains Mono typography and quiet
  operational layout. Neutral surfaces, hairline separation, restrained selection
  accents. Distinct accessible colors/icons for model, tool, command and lifecycle
  work; do not make the entire interface one hue or use color alone for status.
- No hero, card-within-card layout, decorative graphs or embedded Grafana iframe.
  Data and the investigation path are the primary visual assets.
- Stable table tracks and pane constraints. Desktop split panes have useful
  minimum widths, bounded resize behavior and independent scrolling. Long names,
  JSON and error text wrap or scroll within their own region, never into a neighbor.
- Tree expands/collapses without losing selection; keyboard navigation, accessible
  names, visible focus and a labelled resizing control. Filtering retains parent
  context and clearly counts hidden/matching records.
- Timeline uses a shared scale and exposes exact timing on focus/hover. Parallel
  calls remain parallel; total duration is not a sum of overlapping spans. Tiny,
  zero-duration, missing-end and clock-skewed spans remain inspectable.
- Inspector provides summary, correlated logs, attributes and permitted content.
  Use syntax highlighting and bounded structured-data rendering. Untrusted text
  and HTML are inert; external links are not auto-followed and images are not
  fetched merely because a payload contains a URL.
- Search, time range, outcome, signal type and coverage filters are explicit.
  Use segmented controls for Tree/Timeline, checkboxes for boolean filters and
  icon buttons with tooltips for refresh/copy/export/expand.
- Deep links preserve run, span and view; browser back/forward and refresh work.
  Shared links still require authorization. Never include credentials or payloads
  in URLs. Exports obey the same policy as the inspector.
- Follow mode is opt-in and does not steal scroll position or selection. Hide the
  previous sensitive snapshot on failed or denied refresh; a stale response must
  not retain content after permission loss. Expose read limits and gaps instead
  of silently implying a complete history.
- Mobile/tablet progressively disclose list, tree and inspector, with a working
  back path. Do not compress the whole desktop workspace into unreadable columns.
- Prefer existing components and browser APIs. Any new visualization,
  virtualization or pane library needs a license/accessibility/bundle review and
  demonstrable benefit. Do not build a custom diagram engine for a span waterfall.

### Required states

Disabled; enabled but disconnected; recording with no signals; runtime-only;
instrumented; live but stale; complete; failed; interrupted/unknown outcome;
partial/sampled/truncated; backend unavailable; permission denied; content hidden;
retention expired; sandbox terminated; empty search; malformed/orphaned span.

## Success Criteria

- [ ] A developer completes the documented supported-agent setup without editing
  collector YAML, wiring storage credentials or changing every tool call.
- [ ] A real nested agent/tool/model workflow can be investigated from run to
  failing step to command/log evidence, including its retry and recovery.
- [ ] Host-plus-sandbox and agent-in-sandbox topologies both have qualified evidence.
- [ ] UI distinguishes signal absence/loss from success and shows unknown usage.
- [ ] Queries remain useful after sandbox termination for the configured retention.
- [ ] Cross-tenant ingestion/query/export, forged run bindings and unauthorized
  content capture fail closed in automated tests.
- [ ] Collector/storage outages do not hang execution or leak owned sandboxes.
- [x] Desktop/mobile and keyboard testing demonstrate usable, non-overlapping views.
- [ ] Optional installation preserves the minimal core deployment and has a tested
  restricted OpenShift profile before that compatibility is claimed publicly.
- [ ] Technical, operator, public concept/tutorial/reference and release docs agree
  with the installed package and deployment evidence.

## Phases

### Phase 0: Discovery and product/design contract
**Status**: Complete
- [x] Inspect the current Workbench, command/log/provider contracts and SDK adapters.
- [x] Verify Collector/Vector tradeoffs and Victoria signal responsibilities.
- [x] Inspect Braintrust, Langfuse and W&B Weave reference documentation/screens.
- [x] Record capture levels, provider-neutral ownership, UI requirements and non-goals.
- [x] Preserve the live lab during discovery; implementation uses isolated local
  services and does not modify existing deployments.

### Phase 1: Risk-first qualification and architecture freeze
**Status**: In Progress
- [x] Pin Collector, VictoriaLogs and VictoriaTraces images/digests in a disposable
  local stack; inspect source licenses, published advisories and component maturity.
  The 2026-11-10 image inventory is complete for amd64/arm64 and fails the
  high/critical gate. Patched Victoria artifacts remain a distribution blocker.
- [x] Prove OTLP/HTTP with official TypeScript JSON/protobuf and Python protobuf
  exporters. Python JSON and public gRPC are not claimed.
- [x] Exercise the implemented ingestion transport against real storage using a
  hashed, in-memory qualification grant store: trusted org/run/sandbox binding,
  revocation, spoof rejection, privacy before queues and cross-tenant collisions.
- [x] Verify persisted tenant metadata survives a forced Collector restart and
  outage retry, without persisting bearer credentials or metadata-only content.
- [x] Implement persisted production grants, organization policy and atomic
  ingestion quotas; validate them separately with private PostgreSQL and HTTP tests.
- [x] Qualify external export fan-out to an actual authenticated OTLP receiver
  after the shared privacy filter. Vector-specific installation is not implied.
- [x] Round-trip parent IDs, opted-in events/links, error status, UTF-8 and exact
  nanosecond duration. Demonstrate duplicate and out-of-order raw storage behavior.
- [x] Implement normalized, bounded query snapshots with exact timing, duplicate
  and conflict reporting, missing-parent/cycle handling and explicit read limits.
- [x] Implement filter-bound keyset cursors for run metadata without timestamp
  precision loss. Span/log snapshots remain bounded; pagination is still a gate.
- [x] Exercise Victoria public query/deletion APIs and old-timestamp retention
  rejection. Measure index visibility with an explicit interactive profile.
- [ ] Qualify pagination, bounded live reads, timed physical retention and
  deletion/replay/backup coordination before claiming complete erasure.
- [x] Qualify maintained OpenInference instrumentation against real TS/Python
  Deep Agents callbacks with deterministic models and two concurrent tenants.
- [ ] Qualify sandbox-backed framework execution and the in-sandbox/OpenCode recipe.
- [x] Define schema versioning for evolving OTel GenAI conventions and safe handling
  of unknown attributes. Freeze run/outcome/coverage semantics and API permissions.
- [x] Record qualified ingestion decisions and upstream findings in ADR 0010 and
  provide a repeatable internal harness with locked dependencies and cleanup.
- [ ] Freeze the complete first-release configuration after instrumentation and
  query qualification; re-estimate remaining effort. The multi-week estimate still
  applies; local transport qualification is not the finished feature.

**Gate**: No production feature claims or bulk UI/backend implementation until the
ingestion-to-query round trip and privacy/tenant boundaries are demonstrated.
If OpenCode lacks a safe usable interface, keep its coverage runtime-only and
select a qualified in-sandbox instrumented agent recipe; do not invent traces.

### Phase 2: Domain contracts, ingestion and query services
**Status**: In Progress
- [x] Add shared run/span/log/coverage/error contracts and generated OpenAPI in
  `packages/shared`; define metadata cursors and bounded-snapshot partial-result rules.
- [x] Add new append-only SQL migrations for run ownership/index, associations,
  capture policy and grant lifecycle. Index tenant/time/filter access paths.
- [x] Implement separate run, grant, ingestion and query modules under the API;
  use injected dependencies and a narrow storage-query interface for testing.
- [x] Extend the authorization matrix and test old-key/new-scope behavior.
- [x] Implement authenticated ingestion with fixed operator destinations,
  bounded payloads, safe errors, revocation, quotas and no raw-body/token logging.
- [x] Implement filtered run list/detail and bounded span/log APIs with fixed
  storage queries and no tenant-header passthrough. The viewer follows serially
  and exports its current authorized span snapshot.
- [ ] Add stable signal-history pagination and complete-history export; qualify
  late arrivals and duplicate delivery before promising lossless follow.
- [x] Retain Collector acknowledgement and rejection watermarks separately from
  query read times; neither attests complete instrumentation or durable delivery.
- [x] Test fresh migrations, revoked principals/grants, stopped-sandbox final
  flush, retained reads, missing storage, timeouts and overload in private tests.
- [ ] Qualify coordinated database/storage recovery and native sandbox lifecycle
  without execution-state side effects.

### Phase 3: Capture and developer experience
**Status**: In Progress - installed optional providers/lifecycle pass; automatic framework and native sandbox capture remain unqualified
- [x] Add TypeScript and sync/async Python policy, run, query and private exporter
  grant methods using existing transports. No global provider or OTel dependency
  is added to core packages. Exact nanoseconds remain strings.
- [x] Add optional OTel integration without imposing exporter dependencies or
  global initialization on every core SDK consumer. Choose subpath/extra versus
  separate package in the Phase 1 ADR using existing packaging conventions.
- [x] Support caller-owned tracer providers/context, explicit owned shutdown and
  bounded flush. Handle cancellation/KeyboardInterrupt without masking the
  original exception, losing command references or changing task cleanup.
- [ ] Propagate authorized correlation through SDK/CLI command submission and
  supported framework callbacks; do not capture model keys or arbitrary baggage.
- [x] Add explicit command observation and bounded output capture through the
  existing SDK command APIs, with metadata-only defaults and original recovery
  errors preserved. Fixture/package tests pass; native correlation is still open.
- [ ] Qualify automatic capture of Harakiri-managed output in framework/CLI flows;
  never add `pods/exec`, `pods/log` or node filesystem dependencies.
- [ ] Provide a low-configuration supported template/launcher path plus minimal
  standalone TS and Python recipes. Expose disabled/disconnected coverage honestly.
- [ ] Prove compatibility with existing OTel/Langfuse setups: no duplicate tracing,
  replaced global providers or undocumented export of unrelated application data.
- [x] Test actual control/query methods and private grant serialization from an
  installed npm tarball and both Python wheel/source distributions.
- [ ] Qualify installed agent-instrumentation recipes, including bounded flush
  and failure cleanup. Control-method package tests do not establish this gate.
- [x] Verify the optional npm subpath and Python wheel/sdist extra in clean
  consumers: real OTLP export, producer privacy, explicit provider ownership and
  unchanged globals. Add first-recorded-command recipes with native limits visible.

### Phase 4: Native Runs and Workbench experience
**Status**: In Progress
- [x] Build a local interactive UI fixture against frozen contracts, with nested,
  concurrent, long-running, failed/retried and partial traces. Label fixture data;
  never use it as a production fallback or claim it is live acceptance evidence.
- [x] Implement reusable run list, trace navigation, waterfall, span inspector,
  correlated logs, coverage indicator and capture-setting components.
- [x] Integrate organization Runs and the Workbench Runs tab without duplicating
  viewers or removing existing sandbox navigation/command permalinks.
- [x] Implement loading/error/empty/privacy/expired states, bounded search and
  pagination, keyboard navigation, deep links, copy/export and follow behavior.
- [x] Verify full-viewport screenshots at 1440x900 and 1920x1080, tablet at 1024x768,
  and mobile at 390x844 and 360x800. Check long names and 200% zoom.
- [x] Verify pane resizing, selection persistence, browser back/refresh, scrolling,
  keyboard operation, hostile payload rendering and focus recovery in browser
  scenarios. Custom UTC ranges and copied links preserve the investigation window.
- [x] Check computed foreground/background contrast for rendered viewer text
  against WCAG AA ratios. This complements keyboard/responsive tests; it is not
  a claim of comprehensive assistive-technology certification.
- [x] Measure interaction on a 1,000-span/10,000-log fixture with bounded pages.
  Record environment and latency; choose virtualization only where measurements
  justify it. A fixture is not a backend throughput benchmark.
- [x] Connect the production viewer to real authorized APIs. Synthetic transport
  is intercepted only by explicitly labelled browser tests, never a live fallback.
- [ ] Repeat the browser investigation against a real sandbox-backed agent run.

### Phase 5: Optional deployment and operational controls
**Status**: In Progress - native Kubernetes installation and restart verified; cold recovery and restricted OpenShift remain open
- [x] Add opt-in chart composition for Collector + logs/traces storage,
  with pinned artifacts, resource requests/limits, PVC/StorageClass inputs, Secrets,
  readiness probes and explicit NetworkPolicy. Core installation stays unchanged.
- [x] Keep storage and Collector administrative/query ports private. Only the
  authenticated Harakiri ingest/query surfaces are externally reachable.
- [x] Test default-disabled rendering, required opt-in, digest/Secret/retention
  checks and restricted-OpenShift refusal. Eight render checks pass; none applies
  manifests or proves NetworkPolicy enforcement on a cluster.
- [ ] Define retention and capacity defaults from measured workload volume, not
  a vendor marketing benchmark. Document disk exhaustion, byte/inode monitoring,
  cardinality limits, snapshot/backup and restore order with the PostgreSQL index.
- [ ] Qualify arbitrary UID, writable paths and namespace-local permissions on
  restricted OpenShift. No SCC mutation, hostPath, privileged agent or required
  node-level DaemonSet. Native OpenShift evidence remains a separate gate.
- [x] Implement optional external OTLP fan-out with Secret-based authentication,
  HTTPS-only Helm endpoints and explicit egress. Both signals and privacy are
  verified with an independent receiver; the viewer still requires Victoria.
- [ ] Qualify customer-operated Vector and native external egress behavior.
  Export-only mode is not implemented; arbitrary OTLP storage is not a viewer backend.
- [ ] Test upgrade, rollback, revocation, retention expiry and data deletion,
  including buffer replay, backup handling and lagging indexes.

### Phase 6: End-to-end, failure and security acceptance
**Status**: In Progress - local component and browser acceptance, not live agent acceptance
- [ ] Run the matrix below against real pinned Collector/Victoria components.
- [ ] Run deterministic model-independent checks on every change; separately run
  real model-backed Deep Agents and in-sandbox agent workflows. A free model may
  be used if available, but a disappearing free endpoint cannot block CI.
- [x] Make the twelve-gate real-component harness emit an optional sanitized
  receipt after owned-resource cleanup, including exact image digests and host
  environment. Generated credentials and payloads are excluded.
- [ ] Record native agent run/trace references and the complete acceptance matrix.
- [x] Qualify native model-free sandbox commands and an in-sandbox OTLP producer
  on a disposable Linux/amd64 runner, with real OIDC/browser investigation,
  Collector outage isolation, retained reads after termination, same-PVC storage
  restart and credential/resource cleanup. Eleven gates passed in GitHub run
  42817109758, repeated in 42818677310. This is not full agent or coordinated
  backup-recovery evidence.
- [ ] Verify signed-in browser permissions and complete public onboarding from
  clean published/candidate package installation, not workspace-only dependencies.
- [x] Request authorization before pushing acceptance branches or using hosted
  runners. On 2026-11-10 the user authorized an isolated PR and GitHub-hosted
  acceptance. No merge, publication or deployment to the running lab is authorized.

| Scenario | Required evidence |
| --- | --- |
| Successful nested agent task | Model/tool/command hierarchy and independently checked result |
| Tool failure followed by retry | Both attempts retained; run outcome not inferred from one error |
| Model timeout or agent crash | Partial output, last activity, interrupted/unknown status, recoverable command identity |
| Caller-host agent with sandbox tools | Continuous authorized correlation across the boundary |
| Agent fully inside sandbox | Supported instrumentation works without privileged node collection |
| Unsupported/uninstrumented agent | Runtime-only coverage, no fabricated model/tool spans |
| Duplicate/reordered/late batches | Stable navigation, documented deduplication and aggregation behavior |
| Two tenants with colliding IDs | No cross-tenant read, export, overwrite, count or live-stream leakage |
| Forged attributes/grants | Cannot widen capture, impersonate control-plane evidence or write another run |
| Secret canaries and malformed payloads | No canaries in unauthorized views, buffers, exports or diagnostic logs |
| Collector/backend outage and full queues | Agent work continues; bounded retry/drop behavior is visible |
| Sandbox termination and retention expiry | History persists until retention; expiry is explicit rather than empty success |
| Concurrent/large/hostile traces | Bounded queries/rendering, no XSS, cycles cannot hang tree traversal |
| Restricted egress/OpenShift | Only scoped telemetry access; no relaxation of sandbox security |

### Phase 7: Documentation, release and handoff
**Status**: In Progress - source-candidate docs; no release or deployment authorized
- [x] Technical docs: ADR, data model, identity/tenant trust boundary, collector
  processing order, query adapter contract, schema compatibility and failure model.
- [x] Internal maintainer docs: local fixture/spike setup, contract-test commands,
  instrumentation limitations, sanitized receipt generation and resource ownership.
- [x] Public source concepts: Agent Runs, tracing versus runtime logs, coverage/partial
  results, content privacy and supported execution topologies. Not tutorials only.
- [ ] Public tutorials: first TS/Python trace, supported agent template, failed
  tool investigation, retained run after shutdown, external OTel interoperability.
- [x] API/SDK references: real control/query methods, scopes, errors, cursor and
  expiry contracts, compatibility boundaries and downloadable typed snippets.
- [ ] Complete the agent instrumentation/CLI references and executable tutorials.
- [x] Candidate operator docs: opt-in setup, measured-versus-provisional limits,
  private endpoints, disablement, troubleshooting and explicit recovery/OCP gates.
- [ ] Publish qualified sizing, recovery, upgrade/rollback and native OCP evidence.
- [x] Update `apps/web/src/docs-content.tsx`, navigation and Markdown export;
  add regression tests for discoverability, typed examples and candidate limits.
- [ ] Verify live documentation only after a separately authorized deployment.
- [x] Unreleased notes state exactly what is instrumented, what remains runtime-only,
  supported backend versions, capture defaults and known validation gaps.
- [ ] Stage review/merge/publish/deploy separately; verify artifacts and perform
  an opt-in, owned-resource smoke before declaring the public release available.
- [ ] Move this plan to `completed/` only when required acceptance and documentation
  are delivered, or explicitly record a reviewed scope change and remaining work.

## Local Validation Map

Existing commands to retain alongside new focused tests:

```bash
pnpm --filter @harakiri/shared build
pnpm --filter @harakiri/api test
pnpm --filter @harakiri/web test
pnpm --filter @h-sandbox/sdk test
pnpm typecheck
pnpm openapi:check
pnpm docs:check
node --test infra/openshift/standalone/*.test.mjs
git diff --check
```

Add focused API/storage/grant/policy tests and browser fixture tests rather than
requiring a live cluster for unit tests. Use isolated database/collector storage;
never infer that a local default port or kubeconfig points to disposable services.
Select a free loopback port for local UI work. Python validation must use the
repository's existing locked Python test/package workflow, not a global install.

## Decisions and Remaining Gates

| Date | Decision | Rationale | Alternatives considered |
| --- | --- | --- | --- |
| 2026-11-09 | Full execution plan before application changes | Cross-cutting trust and capture contracts must precede UI promises | UI-only prototype presented as finished functionality |
| 2026-11-09 | OTel contract and Collector default; Vector optional | Trace-first interoperability with one default pipeline | Mandatory Vector; mandatory dual collectors |
| 2026-11-09 | VictoriaLogs/Traces first; Metrics optional later | Prioritize run investigation without three required databases | Full metrics platform in the first increment |
| 2026-11-09 | Native Workbench viewer and retained organization Runs | Connect execution evidence without a separate monitoring console | Grafana iframe; standalone branded observability product |
| 2026-11-09 | Privacy minimization before durable buffers | Storage-only redaction leaves sensitive copies elsewhere | Capture everything and hide it in the UI |
| 2026-11-09 | Run identity separate from sandbox and trace identity | Existing framework integrations span host and sandbox | One pod equals one agent equals one trace |
| 2026-11-09 | Live lab untouched during planning/qualification | Avoid disrupting active workloads | Fault testing in the current k0s deployment |
| 2026-11-09 | Keep qualification OTel dependencies in a private nested workspace | OTel 3.x otherwise changes the pinned framework's optional-peer graph | Root dev dependencies that silently alter Deep Agents resolution |
| 2026-11-09 | Sanitize before batching; persist only tenant metadata | Durable queues retain HTTP client metadata, including secrets unless removed | Queuing raw receiver context |
| 2026-11-09 | Serialize log bodies and select explicit stream fields | Prevent content/identity collisions and per-run stream cardinality | VictoriaLogs default flattening/resource-field indexing |
| 2026-11-09 | Explicit interactive index delay, no immediate-visibility claim | VictoriaTraces defaults include a 30-second search offset | Treating accepted writes as immediately queryable |
| 2026-11-09 | Bounded snapshots before signal pagination | Explicit record-limit warnings are truthful; cursor stability under late/duplicate delivery needs separate qualification | A cursor that silently skips or duplicates records |
| 2026-11-09 | Isolate telemetry in a three-connection database pool | Telemetry cannot consume the execution pool during overload | Sharing the main pool without admission bounds |
| 2026-11-09 | No implicit global OTel setup in public SDK | Preserve application provider ownership and avoid exporting unrelated spans | Auto-instrumenting every process on import |
| 2026-11-09 | Hide previous content after failed/denied refresh | Retaining sensitive payloads after access rejection is unsafe | Always preserving old snapshots regardless of authorization |
| 2026-11-09 | Require foreground TS LangChain callbacks in the candidate recipe | Background callback queues lost the run's async context in a reproduced concurrent test | Claiming async tenant routing is safe with the default background callbacks |
| 2026-11-09 | Require explicit preview acknowledgement; refuse restricted OpenShift | Local rendering/non-root containers cannot prove customer-cluster compatibility | Advertising a supported profile without native acceptance |
| 2026-11-10 | Optional SDK subpath and Python extra for run lifecycle/OTel setup | Keep existing distributions and core imports lightweight; explicit provider ownership preserves application tracing | A new package requiring another publishing bootstrap; implicit global initialization |
| 2026-11-09 | Exercise persisted API authorization separately from the protocol fixture | A test-only grant store does not validate real tenant/principal lifecycle | Treating Collector round trips as full application acceptance |

Remaining engineering gates, not promises: actual sandbox-backed framework and
in-sandbox execution, automatic framework/CLI context, grant renewal for long jobs,
signal pagination, Vector/native external export, deletion replay/backup
handling, physical retention, patched images, measured sizing and native OpenShift
qualification. Local tests establish pinned ingestion/query behavior, persisted
authorization and tenant-preserving batching/crash recovery. They do not establish
a complete supported installation profile.

## Source Register

Reviewed 2026-11-09; recheck versions and component stability during qualification.

- [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/): standard
  receive/process/export pipeline; selected components still require qualification.
- [OTel zero-code limits](https://opentelemetry.io/docs/concepts/instrumentation/zero-code/):
  supported library instrumentation does not expose arbitrary application logic.
- [GenAI convention registry](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/):
  follow the maintained upstream conventions and pin the schema used by adapters.
- [Victoria OTel integration](https://docs.victoriametrics.com/opentelemetry/):
  separate ingestion/storage responsibilities for the three signals.
- [Victoria tenancy](https://docs.victoriametrics.com/victoriastack/multitenancy/):
  tenant headers need an authorization boundary; native metrics tenancy needs
  cluster mode, unlike single-node logs/traces. Never default missing identity to
  the shared `0:0` tenant.
- [VictoriaTraces](https://docs.victoriametrics.com/victoriatraces/) and
  [changelog](https://docs.victoriametrics.com/victoriatraces/changelog/): qualify
  query/ingestion behavior and upgrades rather than infer maturity from branding.
- [Vector OTLP source](https://vector.dev/docs/reference/configuration/sources/opentelemetry/)
  and [sink](https://vector.dev/docs/reference/configuration/sinks/opentelemetry/):
  traces are supported but documented as experimental; the sink is beta.
- [Vector Kubernetes collection](https://vector.dev/docs/reference/configuration/sources/kubernetes_logs/):
  node log access is not a suitable default for restricted namespace-only installs.
- [Langfuse OTLP integration](https://langfuse.com/integrations/native/opentelemetry):
  export interoperability requires destination authentication and attribute mapping,
  not only changing a URL.

## Tech Debt Incurred

Signal reads are bounded snapshots, not cursor-complete histories. Retention
currently closes the authorized query window; physical storage reclamation,
deletion replay and metadata maintenance require qualification. The private
framework recipe must not become a supported global instrumentation helper until
ownership, unpatching and host-plus-sandbox lifecycle tests pass. The Docker
qualification gateway is test-only; production uses persisted grants and quotas.

## Implementation Checkpoint: 2026-11-09

- Added digest-pinned, resource-limited, non-root Docker qualification, without
  modifying k0s, existing Docker containers, production settings or published packages.
- Added opaque OTLP ingestion, persisted grants/policy/quotas, dedicated database
  connections, run metadata cursors and authorized normalized query services.
- Shared contracts/OpenAPI, API authorization/HTTP/ingestion/query tests and a
  private PostgreSQL test harness cover the new public boundary.
- Twelve real-component gates passed, including normalized queries and actual
  TS/Python Deep Agents callbacks from deterministic models. These do not execute
  sandbox tools or contact a real model provider. The additional full-stack gate
  uses the built SDK, real HTTP authentication, all migrations, PostgreSQL grants,
  official exporters and Victoria queries in an owned isolated environment.
- Seven browser scenarios passed, including 1,000 spans, a bounded 500-record view
  of a 10,000-log fixture, denied refresh, hostile content, keyboard operation,
  custom UTC ranges/permalinks, rendered text contrast, desktop/tablet/mobile
  viewports and 200% zoom.
  Fixtures are labelled, not live data.
- Found and corrected header-list semantics, typed event/link clearing, trace
  visibility defaults, high-cardinality log stream defaults and structured-body
  identity collisions before exposing a product interface.
- Typed SDK methods, installed npm/Python distribution checks, source documentation
  and experimental Helm composition are implemented. Two private PostgreSQL checks
  and eight render-only chart checks pass. Both new JavaScript qualification
  workspaces report no known audit vulnerabilities; image scanning remains open.
- All eight workspace typechecks, 134 web tests, OpenAPI generation verification,
  documentation-link checks and the web production build pass. The existing Vite
  large-chunk warning remains; this work does not claim to fix the application bundle.
- The full API suite passes 425 tests with 12 environment-gated skips. The two
  relevant PostgreSQL suites were also run separately against owned databases.
- Gitleaks found no secrets in the 109-file candidate inventory, including new
  files and excluding unrelated `docs/cot/`. This is not an image/history audit.
- Timing review corrected missing-end spans being displayed as zero-duration
  timelines and made relative time filters refer to now for retained runs.
- Framework automation, operational acceptance and live agent investigation remain
  incomplete. No versions, published packages, deployment or public site changed.

Reproduce with `pnpm --dir infra/observability qualify`; see
[the harness guide](../../../infra/observability/README.md) and
[ADR 0010](../../adr/0010-native-agent-observability.md).
The [local receipt](../../operations/evidence/agent-observability-local-2026-11-09.json)
records the twelve-gate run ending at 16:23:58 UTC, including exact images and
successful owned-resource cleanup. It is component evidence, not a deployment
or real-model/sandbox acceptance receipt.

## Completion Notes

### Completion Work Checkpoint: 2026-11-10

This checkpoint is **not completion** and does not reduce the approved scope.

- Added optional `@h-sandbox/sdk/telemetry` and `h-sandbox[telemetry]`, using
  maintained OTel exporters instead of a new wire protocol or global tracing
  installation. Core installations still exclude the optional dependencies.
- Added run/grant ownership, bounded final flush, cancellation-safe cleanup,
  owned/borrowed providers and explicit command observation. Command recovery
  references and original exceptions survive; no runtime lifecycle is changed.
- Producer metadata filtering precedes export queues. Truncated string payloads
  carry a boolean partial-record marker; normal OTel dropped counters are not
  repurposed. Stderr does not automatically mean error. The SDK's 8,192-character
  attribute and 4,096-character log limits are lower than the Collector ceilings.
- Large-message and delayed-export tests exposed two issues in the initial helper:
  oversized default batches and revocation before an in-flight export completed.
  Queues now hold 64 records, batches eight, and final flush drains the official
  exporter. Signals flush sequentially. Wide records and saturation can still be
  rejected or dropped; no complete-delivery guarantee is made.
- Added authenticated external OTLP fan-out after privacy, separate bounded
  exporter queues, Secret references and explicit Helm egress. The native viewer
  still reads Victoria. No bundled Vector or unsupported external-query abstraction.
- Added executable first-command TS/Python recipes, installed-package checks,
  public-source documentation, operator instructions and image-audit automation.
  Real sandbox execution of those recipes and live documentation deployment are
  still unqualified, not silently replaced by mocked command evidence.
- The [component receipt](../../operations/evidence/agent-observability-pipeline-2026-11-10.json)
  records fourteen real pipeline gates with owned-resource cleanup. Its API/DB
  gate now exercises the public helper and retained correlated output. Sandbox
  associations remain fixture metadata, not a runtime deployment.
- The [image audit](../../operations/evidence/agent-observability-image-audit-2026-11-10.md)
  blocks distribution: both architectures have 11 high/critical VictoriaLogs
  matches and one high VictoriaTraces match. No newer upstream releases were
  available when checked. No exception, custom vendor build or deployment was made.

Still required: safe public framework capture/lifecycle, SDK/CLI context across
real sandbox tools, a real in-sandbox agent, stable signal-history pagination,
coordinated storage/database recovery and deletion replay, measured sizing and
native installation/OpenShift evidence. These are not merely documentation tasks.
The user authorized a dedicated PR and isolated GitHub-hosted acceptance on
2026-11-10. The native harness reuses the existing Linux/amd64 runner and
cluster-ownership guards. It checks actual sandbox commands, signed-in browser
investigation, an in-sandbox official OTLP producer, telemetry outage isolation,
retained reads and same-PVC storage restarts. Those checks do not substitute for
real-agent evidence or coordinated backup recovery. The independent image audit
remains a failing release gate, not a suppressed or waived finding.

The isolated OpenShift question remains unanswered. The existing k0s and
customer clusters have not been used or modified. No package publication or
deployment to the running lab is authorized.

#### Isolated PR checkpoint

- Draft [PR #85](https://github.com/nabilblk/h-sandbox/pull/85) contains the
  candidate. The first source commit is `6a1eb790dd4c251f96990c7165bbbbe392e5a71f`.
- [GitHub run 42817109758](https://github.com/nabilblk/h-sandbox/actions/runs/42817109758)
  passed the component/browser job and native sandbox job. Both passed again in
  [run 42818677310](https://github.com/nabilblk/h-sandbox/actions/runs/42818677310),
  including explicit scrolling to the correlated log on mobile. The latest
  [native receipt](../../operations/evidence/agent-observability-native-2026-11-10.json)
  records the tested PR merge SHA, imported image identities, packed SDK digest,
  eleven gates and confirmed owned cleanup. Desktop/mobile screenshots were
  visually inspected. Both image audits failed; the overall
  workflow is correctly red, not a successful release qualification.
- Local rechecks passed: 121 SDK tests, installed TypeScript package/declarations,
  122 Python SDK/adapter tests, strict typing and Python 3.11 wheel/sdist consumers.
  The publishable-source scan found no secrets. Unrelated `docs/cot/` is excluded.
- CI exposed Python formatting drift and an incomplete authorization reference.
  Corrected the three Python files and documented all new scopes in Git/public
  source docs. The ten authorization browser checks pass locally after correction.
- The broader PR also detects an existing Open-Terminal image audit finding,
  separate from the Victoria images. No audit gate was weakened or waived.
- Hosted Python contracts pass on 3.11 through 3.14 after formatting correction.
  The macOS consumer job was cancelled before execution because GitHub retired
  macOS 14 runners. Its matrix now selects the supported `macos-15` Arm64 runner
  per [GitHub's available images](https://github.com/actions/runner-images#available-images).
  This changes only the disposable test host, not the Python support floor.
- The macOS 15 and Windows consumer jobs passed in run 42820096324. Broad CI
  passed on retry without changing the existing usage-performance threshold;
  the first attempt exceeded its relative admission-latency budget. The third
  native observability job again passed all eleven gates in run 42820096337.
- Added a twelfth, separately named cold-recovery gate for the next hosted run:
  disable capture/revoke grants, stop writers, archive both databases plus all
  three telemetry volumes as one checksummed set, and restore into fresh PVCs.
  It verifies tenant mappings, identity, revoked grants and retained investigation.
  Unit guards pass; native execution is still pending. This is same-version cold
  recovery, not cross-version rollback or physical erasure after buffered replay.

### Viewer usability revision

The maintainer's hands-on test rejected the first viewer's product quality.
Browser inspection confirmed a 358px offset before the investigation surface at
1440x900, a narrow inspector, oversized unknown-metric summaries, no direct jump
from a reported error to its logs, and unsearchable log bodies. Passing layout
and protocol tests did not establish a good investigation experience.

This revision stays within the existing telemetry contract and local preview:

- [x] Compact run context and viewport-aware trace/inspector layout.
- [x] Hierarchy/timeline modes, meaningful timing labels and direct error navigation.
- [x] Persistent selected-step context, readable content and searchable/filterable logs.
- [x] Dense run discovery, useful empty/privacy/error states and explicit evidence limits.
- [x] Browser acceptance against real local telemetry, plus regression fixtures for
  hostile content, denied reads, long traces, small screens and keyboard access.

Verified locally on 2026-11-09: 138 web tests, typecheck, production build and ten
Playwright scenarios pass. The production build retains its main-chunk size
warning; this revision does not claim bundle-size remediation. Browser fixtures
cover root-first selection with reordered deliveries, collapsed-parent reveal,
error-to-log navigation, tree/timeline switching without extra reads, exact
clipboard output, JSON formatting/escaping, privacy filtering, denied refresh,
keyboard resizing, 1,000 steps and a bounded 500-record read from 10,000 logs.
Viewports include 1920x1080, 1440x900, 1024x768, 390x844 and 360x800 plus 200% zoom.

Separate hands-on checks used the actual authenticated local pipeline: run-list
outcome filtering, the real assertion stderr, error/search filtering, the repair
sequence and metadata-only body suppression. At 1440x900 the trace now starts at
248px and ends at 869px; the inspector has 620px instead of the original 477px.
The root, error-log, discovery and mobile screens were inspected as screenshots.
No browser exceptions were reported during these checks. Log filters intentionally
reset when changing the sensitive-content read; hidden bodies cannot be searched
or copied. Public source docs and the local preview guide describe these controls.

This closes the viewer revision, not the full observability milestone. Real
agent-in-sandbox capture, automatic instrumentation and the operational gates
below remain outstanding. No k0s change, public deployment, push or publication
was performed for this revision.

Reference patterns reviewed: [Langfuse trace navigation](https://langfuse.com/changelog/2025-03-19-new-trace-view),
[Braintrust trace inspection](https://www.braintrust.dev/articles/llm-trace-storage),
and [W&B component-level investigation](https://site.wandb.ai/articles/evaluating-llms-in-production/).
These inform navigation, progressive disclosure and inspection; they do not
justify copying evaluation, billing or instrumentation claims into this candidate.

### Real LLM investigation revision

Requested after the viewer review: use actual inference to qualify LLM-specific
investigation, not scripted model output. This is a focused extension of the
existing candidate, not a new tracing service or a deployment authorization.

- [x] Qualify a bounded agent loop with a real model and synthetic data; independently
  validate tool results and record model identity, actual usage and run links.
- [x] Preserve generation metadata (provider, model, parameters, finish reason,
  token details and tool-call IDs) through the privacy filter and query boundary.
- [x] Display input/output as role-labelled messages with tool requests/results,
  readable generation facts and raw fallback without rendering untrusted HTML.
- [x] Test malformed/truncated content, absent versus zero usage, privacy, hostile
  payloads and model/tool navigation. Keep token subsets out of aggregate totals.
- [x] Repeat real-component ingestion and browser acceptance; update source/public
  candidate documentation and evidence without claiming automatic sandbox capture.

Reference decisions: use [Langfuse observation types](https://langfuse.com/docs/observability/features/observation-types),
[role-labelled generations](https://langfuse.com/docs/observability/best-practices)
and [usage accounting](https://langfuse.com/docs/observability/features/token-and-cost-tracking)
as workflow references, with [OTel GenAI attributes](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/)
as the wire vocabulary. No inferred billing price, fake TTFT, hidden reasoning,
prompt playground, evaluation service or model-quality claim is in this revision.
All inference must be explicitly configured; prefer isolated local open weights.
The former four-hour preview has expired and cleaned up its owned resources.

Implementation checkpoint: a private per-invocation LangChain callback captures
text chat and tools without global providers or ESM patches. The pinned Core
1.2.12 runtime dispatches `handleChainStart` arguments in a different order from
its declaration; a real-framework test now checks single-trace ancestry and tool
call IDs. The earlier OpenInference recipe is unchanged and still has its stated
process-lifetime limitation. New generation fields are allowlisted, not arbitrary
metadata. Sensitive payloads are limited to 32,768 characters, with a Collector-set
truncation marker. Twelve browser fixture tests and thirteen component gates pass.
Two actual local Qwen invocations each produced five model calls, four tool calls,
one failed validation followed by a successful correction, and all 25 expected
spans. Role-labelled input/output, reported usage, tool drill-down, private error
text and metadata-only privacy were inspected in the authenticated browser at
desktop and mobile sizes. See the [real-model evidence](../../operations/evidence/agent-observability-real-llm-2026-11-09.md).

This revision is complete, not the full milestone. Agent-in-sandbox execution,
automatic/public framework lifecycle integration, Python real-model capture,
OpenCode, deployment and the remaining operator gates are still unqualified.
The local recipe pins a multi-architecture Ollama image and requires native
execution; the older amd64-specific pin crashed under local arm64 emulation.
Acceptance waits for the known exported span count because eventually consistent
storage can index parents later than children. Cost remains unknown; observed
first-text-token delay is not represented as provider-side inference time.

### Interactive local preview checkpoint

Added a separate [temporary demo harness](../../../infra/observability/demo.md)
to make the candidate inspectable without deployment. It runs the actual viewer,
normal Keycloak browser authentication, API routes, private PostgreSQL and the
qualified Collector/Victoria components. Three real local subprocess workflows
exercise a failed assertion, repair and independent verification, failure without
retry, and metadata-only privacy. No LLM or sandbox runtime executes: the sandbox
association is explicitly test metadata, and instrumentation is manual.

Browser sign-in, trace inspection, actual stderr, metadata-only body suppression,
desktop/mobile rendering and rerunning the three scenarios were checked locally.
Restart testing found and corrected Vite's independent SIGTERM exit interrupting
owned-resource cleanup; the supervisor now hosts Vite as middleware. A subsequent
start/stop completed with no demo containers or private PostgreSQL remaining.
Explicit C locale also makes the private database work in a minimal environment.
The private harness now passes six tests, including execution and export of the
actual validation workload. The demo has generated private credentials, bounded
resources, loopback listeners, four-hour expiry and owned-resource cleanup.
Only Runs and documentation are served by its minimal API; the remaining shell
navigation is not a complete local product deployment. This does not close the
automatic-capture or real-agent acceptance gates.

Not complete. Local application, migration, SDK and documentation changes are in
progress. Release claims require the remaining capture, installation and live
acceptance gates. Keep this plan active; do not deploy, publish or archive it as
complete based only on unit tests and browser fixtures.
