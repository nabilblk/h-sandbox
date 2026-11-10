# Native Agent Observability: Technical Contract

Unreleased source candidate. The [execution plan](exec-plans/active/native-agent-observability.md)
remains active. This document describes implemented boundaries, not automatic
instrumentation or a completed operational qualification.

## Module Map

| Module | Responsibility |
| --- | --- |
| `packages/shared/src/observability.ts` | Wire types; opaque IDs, exact nanoseconds, explicit partial reads |
| `apps/api/src/services/observability/control-store.ts` | Tenant/run ownership, policy, hashed grants, atomic admission |
| `apps/api/src/services/observability/database.ts` | Independent bounded connection pool, no execution pool consumption |
| `apps/api/src/services/observability/ingestion.ts` | Opaque JSON/protobuf transport, decoding bounds, credential substitution |
| `apps/api/src/services/observability/normalize.ts` | Schema/privacy checks, exact timing, duplicate/conflict/parent normalization |
| `apps/api/src/services/observability/victoria.ts` | Fixed-origin, fixed-query, bounded Victoria LogSQL adapter |
| `apps/api/src/routes/agent-runs.ts` | Authorized product queries/control; no raw query passthrough |
| `apps/api/src/routes/telemetry-ingestion.ts` | Separate write-only authentication before body parsing |
| `apps/web/src/routes/agent-runs.tsx` | Shared dashboard/Workbench investigation surface |
| `apps/web/src/llm-observability.ts` | Bounded text/tool-message parsing and reported generation usage semantics |
| `apps/web/src/components/llm-inspector.tsx` | Generation facts, role-labelled conversation, exact raw fallback and tool drill-down |
| `infra/observability` | Locked protocol, framework and render-only qualification |
| `packages/sdk/src/telemetry` | Optional explicit OTel providers, run cleanup and command observation |
| `packages/python-sdk/src/harakiri/telemetry.py` | Optional sync/async recording and official exporter setup |

The runtime provider interface is unchanged. PostgreSQL stores no raw spans/logs
or plaintext grants. The `htg_` bearer is random; only SHA-256 is persisted. Grant
authorization resolves the live issuer and scopes on every ingest admission.
One database timestamp determines issuance and expiry; separate volatile clock
reads would intermittently violate the exact fifteen-minute constraint.

## HTTP and Authorization

| Operation | Permission |
| --- | --- |
| GET `/v1/observability/policy` | `runs:read` |
| PATCH `/v1/observability/policy` | Signed-in organization admin; not API keys |
| GET `/v1/agent-runs`, `/:runId`, `/:runId/spans`, `/:runId/logs` | `runs:read`; content also needs `runs:content` |
| POST `/v1/agent-runs`, `/:runId/grants` | `runs:write` + `sandboxes:write`; content also needs `runs:content` |
| POST `/:runId/close`, DELETE `/:runId/grants/:grantId` | `runs:write` |
| POST `/v1/telemetry/traces`, `/v1/telemetry/logs` | Valid write-only telemetry grant; normal API/JWT credentials do not apply |

Run-relative paths above have the `/v1/agent-runs` prefix. Shared authorization
matrix and [generated OpenAPI](openapi.json) are authoritative. Migration 041
allows explicit new scopes but does not broaden existing/default API keys.
Content is admin-only. Admission cannot widen policy after the body was read.

## Trusted Ingestion

```text
Official exporter -> Harakiri grant authorization -> bounded decoded body
  -> atomic org quota + grant revalidation -> fixed Collector with internal token
  -> overwrite binding + minimize content -> tenant-only batch context
  -> persistent bounded queues -> VictoriaLogs / VictoriaTraces
```

Collector ingress has its own bearer authentication. Namespace NetworkPolicy
additionally excludes direct workload access. The producer's tenant headers,
identity resource attributes and source labels are overwritten. The batch
processor rebuilds context with only numeric tenant identity: raw Authorization
must not enter persistent queues. A workload cannot claim control-plane provenance.

Metadata-only capture drops content before queues, including status messages,
events/links and application log bodies. Names/allowlisted labels remain untrusted
and are not a universal secret-redaction mechanism. Structured log bodies are
serialized before export to prevent flattening from shadowing trusted identity.
VictoriaLogs stream labels include service name, not run/sandbox IDs.

The allowlist includes generation provider/model, temperature/top-p/output limit,
finish reasons, tool call ID, input/output and cache/reasoning token counts, and
`harakiri.llm.first_token_ms`. System instructions and tool definitions are
**content**, never metadata. Content string attributes have a 32,768-character
bound; Collector marks clipping before truncation. Optional SDK helpers use a
lower 8,192-character string-attribute bound and report producer clipping with a
boolean marker. Non-boolean markers are discarded. Normalization preserves that
marker as `truncated_record`. Log bodies retain the 16,384-character bound.

## Query and UI Semantics

Run-list cursors preserve PostgreSQL microseconds and bind to the same filters.
Organization always comes from authentication, never the cursor. Span/log reads
are bounded snapshots, at most 1,000 rows and 31 days. A record-limit warning is
not a pagination cursor. `partial=false` means no known read limitation, **not**
that all agent activity was captured.

Normalization requires schema 1 and matching trusted org/run/sandbox provenance.
IDs and nanoseconds remain strings. Duration is recomputed with integer arithmetic.
Duplicate span IDs are collapsed with delivery counts; conflicting authorized
payloads are labelled. Hidden payload differences cannot leak through conflict
indicators. Repeated logs are not collapsed. Parent cycles/missing ancestors are
marked and iterative tree construction cannot recurse indefinitely.

The viewer treats payloads as inert text. Content is opt-in and disappears after
failed/denied refresh; stale authorized data is not kept visible after permission
loss. Follow serially polls visible pages. Command links are producer-reported
correlation hints, not an authorization bypass; the command read reauthorizes.

LLM presentation accepts bounded role-labelled text, OpenAI-style tool calls and
OTel text/tool parts. Unsupported or clipped JSON stays available as raw text;
images and URLs are never fetched. Tool links require one matching call ID in the
same trace. Copy returns the original captured string. Cache read/creation are
subsets of input, reasoning is a subset of output, and none is added twice.
Absent metrics are unknown. First-text-token latency is callback-observed, not
provider service time; cost and hidden reasoning are not inferred.

## SDK and Framework Ownership

TypeScript `client.agentRuns` and Python `client.agent_runs` expose typed policy,
create/list/get/close, spans/logs, grant and revoke operations. No exporter or agent
framework dependency is required by either core SDK. Exporter credentials are
revealed only through an explicit method; normal grant serialization hides them.
The application owns exporter flush, credential renewal and sandbox cleanup.

The optional `@h-sandbox/sdk/telemetry` subpath and `h-sandbox[telemetry]` extra
now provide explicit lifecycle helpers and official trace/log providers. They
minimize producer data before batch queues, use explicit resources instead of
environment resource detection, and never register global providers. Metadata is
the default. Command observation records the known command ID and optional bounded
output through the existing SDK, not Kubernetes access. Its duration is client
observation time, not inferred remote execution duration. Stderr is not severity.

`withAgentRun`, `agent_run` and `async_agent_run` own run/grant cleanup, not sandbox
cleanup. They preserve original errors/recovery references, bound each cleanup
stage, close the run and revoke the grant with fresh requests. They flush borrowed
providers but shut down only explicitly owned providers. Fixed diagnostic codes
report cleanup failures without logging credentials. Provider construction and
grant issuance errors remain explicit; a caller must not treat an aborted setup
as a recorded run. The grant has a finite lifetime; automatic renewal is not
implemented. See the [executable recipes](../examples/agent-observability/README.md).

Private qualification uses maintained OpenInference instrumentation against real
Deep Agents callbacks and deterministic models. TS requires foreground LangChain
callbacks: its default background queue lost per-run context in a concurrent test.
Manual ESM instrumentation has no public unpatch method, so the recipe is
process-lifetime test infrastructure and refuses an existing instrumentor. It is
not a public drop-in helper. Python's instrumentor restores its patch in finally.

An additional private `LangChainTrace` recipe uses callbacks explicitly supplied
to one invocation, without installing an instrumentor or global provider. It
captures text chat and tool calls, with content disabled unless explicitly
requested. It bounds its callback lifecycle to 1,000 spans and ends unfinished
spans as errors at close. Its pinned Core 1.2.12 runtime dispatches chain-start
arguments differently from its declarations; the framework regression test
checks real parent relationships. It is not a universal callback API contract,
batch-generation integration or public framework package. See the optional
[local real-model scenario](../infra/observability/demo.md#real-local-llm-agent).

The installed npm tarball and Python wheel/source distributions exercise actual
public control/query methods with a mocked transport. Optional installed consumers
also export real protobuf to a private loopback receiver and check producer privacy
and unchanged global providers. A separate real-stack gate
uses the built TypeScript SDK, actual API-key authentication and persisted grants
through Collector and both storage services, including the public lifecycle helper.
Neither check starts a sandbox.

Global OTel providers are not replaced in either fixture. Host-plus-sandbox trace
continuity, automatic command output capture, OpenCode instrumentation, installed
agent recipes and compatibility with existing customer instrumentation still
need dedicated acceptance. Do not infer these from model/tool callback tests.

## Operational Boundaries

Read deadlines differ from physical retention. A terminated sandbox's metadata
survives; expired telemetry reads return 410. Accepted queues can replay after
revocation. Erasure, backup reconciliation and metadata maintenance are not yet
implemented as a coordinated product operation. Operator flags are disabled by
default; the candidate Helm profile refuses restricted OpenShift until tested.

Optional external OTLP fan-out shares the Collector's privacy filter, but uses
separate bounded queues and an operator Secret. Its real-receiver test checks
both signals and filtered canaries; Vector itself and cluster egress policies
remain separate qualifications. External destinations are trusted with all
exported tenant content. They do not implement the viewer's query interface.

The pinned Victoria images currently fail the high/critical dependency audit.
See the [audit decision](operations/evidence/agent-observability-image-audit-2026-11-10.md).
No vulnerability exception was granted by implementing this feature.

See [ADR 0010](adr/0010-native-agent-observability.md),
[operator instructions](operations/agent-observability.md) and
[repeatable local checks](../infra/observability/README.md).
