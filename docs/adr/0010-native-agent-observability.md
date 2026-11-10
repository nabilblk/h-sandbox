# ADR 0010: Native Agent Telemetry Boundaries

Status: source candidate, 2026-11-09. Ingestion/query components, persisted
control services, SDK methods, native viewer and an experimental Helm profile
are implemented locally. The full framework/operational matrix is not qualified.

## Decision

Use OTLP/HTTP through an authenticated Harakiri boundary, then one OpenTelemetry
Collector, with VictoriaLogs and VictoriaTraces behind authorized Harakiri query
APIs. Vector can be an operator-owned interoperability component; it is not a
second mandatory collection pipeline. VictoriaMetrics is outside this increment.

The API transports opaque JSON/protobuf using maintained upstream codecs in
Collector. It does not implement protobuf, capture arbitrary subprocesses, or
scrape Kubernetes node/container logs. Runtime operations remain behind the
existing provider interface. This increment adds no Kubernetes permissions.

The registered ingestion route uses persisted grants, organization policy and
atomic PostgreSQL request/byte quotas. It authenticates before reading the body
and revalidates after bounded decoding. Normal JWT/API keys cannot substitute
for a telemetry grant. The feature remains disabled unless explicitly configured;
disabled installations create no telemetry connection pool or storage dependency.
Telemetry has a separate three-connection pool with acquisition/query deadlines.

## Identity and Privacy

Write-only `htg_` grants resolve to server-owned tenant, organization, run,
sandbox, capture policy and expiry. They are distinct from API keys. The gateway
forwards only trusted binding headers and replaces the grant with its internal
Collector credential. Neither producer headers nor payload attributes authorize
a different tenant or broader content capture.

Collector validates routing metadata, replaces reserved resource attributes and
filters content before batching and persistent queues. The batch processor
creates fresh request context containing only the tenant key. This is necessary:
the persistent queue retains client metadata, so simply enabling durable storage
on a raw receiver would also persist authentication headers.

The candidate queue is bounded by serialized bytes (8 MiB per signal) and each
queue database by 32 MiB. Retry is bounded at 60 seconds. The batch processor has
a fixed 128-tenant lifetime cardinality ceiling, not one partition per run.
These are qualification bounds, not measured production capacity defaults.

Metadata-only capture removes prompt/output attributes, log bodies, status
messages, events and links. Names and explicitly allowlisted metadata are still
untrusted, visible labels and must not contain credentials. Opt-in content is
not guaranteed secret-free and requires the separate `runs:content` read
permission. Unknown attributes are dropped. Policy changes cannot erase prior
copies in queues, storage or backups.

Map log bodies are serialized before export. VictoriaLogs otherwise flattens
their keys into top-level fields, where producer content can collide with trusted
identity fields. Log body truncation is explicitly marked. Log stream fields
are restricted to `service.name`; the default of indexing every resource
attribute would create a stream for each run/sandbox.

## Evidence and Upstream Behaviors

The reproducible [qualification harness](../../infra/observability/README.md)
uses exact digests recorded in its `images.json`:

| Component | Version | Qualification notes |
| --- | --- | --- |
| OTel Collector contrib | 0.165.0 | `headers_setter` is alpha; transform, bearer authentication and file storage are beta |
| VictoriaLogs | 1.53.0 | OTLP log ingestion, tenant queries and asynchronous deletion exercised |
| VictoriaTraces | 0.13.0 | OTLP trace ingestion, nanoseconds, tenant queries, deletion and duplicate behavior exercised |
| OTel JS | API 1.10.0, SDK 3.1.0, exporters 0.301.0 | Private qualification dependencies only; not the framework compatibility promise |
| OTel Python | 1.45.2 | Official HTTP/protobuf trace and log exporters exercised |
| TS Deep Agents / OpenInference | 1.14.0 / 4.1.5 | Deterministic real-framework callbacks, scoped concurrent runs; private OTel 2.12.0 workspace |
| Python Deep Agents / OpenInference | 0.7.21 / 0.1.82 | Deterministic callbacks, ContextVar isolation and instrumentor teardown |

The 2026-11-09 local arm64 run passed eleven integration gates: authentication,
JSON/protobuf round trips, private-queue crash recovery, content opt-in, Python
export, scoped deletion, expired-timestamp rejection, duplicate/late delivery,
normalized private queries and concurrent TS/Python framework callback export.
The latest run finished at 15:55:37 UTC; all owned resources were removed.
These are small deterministic checks, not model quality or throughput benchmarks.
PostgreSQL/HTTP, browser fixture and chart-render tests are separate evidence;
they do not constitute a real sandbox-backed agent investigation or cluster install.
The running k0s lab was untouched.

Specific upstream behavior changes the design:

1. Collector 0.165.0 exposes header values to OTTL as **lists**, despite the
   context documentation describing strings. Validate exactly one value and
   read index zero. `set(span.events, nil)` clears the typed slice; `[]` is not a
   compatible value and fails closed.
2. Default VictoriaTraces search visibility intentionally lags by 30 seconds.
   The interactive candidate uses a 1-second trace-index flush, 3-second search
   offset and 1-second storage flush, increasing I/O. The UI must distinguish
   accepted from queryable and must not infer failure from index delay.
3. Victoria stores repeated trace/span IDs. The query adapter must deduplicate
   and flag conflicting deliveries; this normalization is implemented, while
   signal cursor pagination remains a gate. Ingestion is not exactly once. Cross-tenant
   identical IDs remain isolated by the trusted numeric tenant header.
4. Deletion is asynchronous and remains visible until its task completes.
   Revocation prevents new requests but does not retract accepted queues.
   Future deletion must hide the run immediately, handle buffered replay and
   document backup copies. Old-timestamp rejection alone does not qualify
   physical retention reclamation or backup deletion.

## Framework Compatibility Is a Separate Gate

OpenCode 1.15.13 source exposes `event`, `tool.execute.before` and
`tool.execute.after` hooks, and structured step-finish usage. These are candidate
integration points, not a qualified tracing implementation. No console parsing,
TLS interception or inferred hidden reasoning is permitted.

The pinned TypeScript Deep Agents stack includes LangSmith 0.9.0. Its experimental
OTel setup depends on the older OTel 2.x ecosystem and global setup; it cannot be
silently replaced with the qualification harness's OTel 3.x dependencies.
Maintained OpenInference LangChain instrumentation passed concurrent model/tool
callback tests with supplied providers. TS background callbacks lost per-run async
context in a reproduced test, so the candidate requires
`LANGCHAIN_CALLBACKS_BACKGROUND=false`. Manual ESM instrumentation also lacks a
public unpatch method. Its private harness refuses existing instrumentation and
disables routing on shutdown, but the module patch is process-lifetime. Do not
promote that recipe to a reusable public helper or use private upstream methods.

The core SDKs expose control/query methods without OTel dependencies. They do not
initialize a global tracer
provider, replace an application's context manager or export unrelated spans
without explicit caller action. Host-side framework loops and sandbox-side tools
require authorized cross-boundary correlation, not merely an in-sandbox agent.

## Installation and Release Boundary

The disabled-by-default chart profile reuses the qualification Collector JSON and
image digest manifest with exact drift tests. It adds three private single-replica
StatefulSets, bounded resources, retained PVCs and NetworkPolicies. Collector's
internal bearer comes only from an existing Secret. No new RBAC is granted.
The chart requires explicit preview acknowledgement and refuses restricted
OpenShift until native arbitrary-UID and network/storage acceptance is recorded.

Public candidate docs and typed APIs do not imply publication. Signal pagination,
automatic framework lifecycle/correlation, full-stack sandbox-backed acceptance,
physical erasure/replay fencing, recovery and measured sizing remain release gates.
See [the technical contract](../observability.md) and
[operator guide](../operations/agent-observability.md).

## License and Advisory Review

The selected Collector and Victoria source releases use Apache-2.0. On
2026-11-09 the private JavaScript qualification lockfile's npm audit reported no
advisories. The VictoriaLogs/Traces GitHub repositories exposed no published
security advisories in the queried list. This is **not an image vulnerability
scan or a security certification**.

Collector advisories reviewed include GHSA-8hxm-mxr2-qf9h (Prometheus receiver),
GHSA-pjv4-3c63-699f (Azure auth), GHSA-4jvg-4jfx-fmhc (Sentry),
GHSA-w5cv-pw74-4rxc (GitHub receiver), GHSA-xpvr-wrwx-rm99 (OIDC key rotation),
and GHSA-j39g-cqwj-9xvf (MongoDB dependency). Those receivers/exporters/auth
extensions are not enabled in this profile. Image/dependency inventory and
release-time advisory scanning remain mandatory before distribution.

## Sources

- [Collector request context and persistent queues](https://github.com/open-telemetry/opentelemetry-collector/blob/v0.165.0/exporter/exporterhelper/README.md)
- [Collector batch context construction](https://github.com/open-telemetry/opentelemetry-collector/blob/v0.165.0/processor/batchprocessor/batch_processor.go)
- [OTTL metadata implementation](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.165.0/pkg/ottl/contexts/internal/ctxotelcol/otelcol.go)
- [Headers setter maturity](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/v0.165.0/extension/headerssetterextension)
- [VictoriaLogs OTLP and stream fields](https://docs.victoriametrics.com/victorialogs/data-ingestion/opentelemetry/)
- [VictoriaTraces querying](https://docs.victoriametrics.com/victoriatraces/querying/)
- [VictoriaLogs deletion and retention](https://docs.victoriametrics.com/victorialogs/)
- [Collector advisories](https://github.com/open-telemetry/opentelemetry-collector-contrib/security/advisories)
- [OpenCode 1.15.13 hooks](https://github.com/anomalyco/opencode/blob/v1.15.13/packages/plugin/src/index.ts)
- [Maintained LangChain instrumentation](https://arize-ai.github.io/openinference/js/packages/openinference-instrumentation-langchain/)
