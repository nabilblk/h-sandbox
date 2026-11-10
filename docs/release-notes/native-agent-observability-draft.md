# Native Agent Observability: Unreleased Candidate

This is a source-change inventory, not an announcement or deployment receipt.
No version/tag promotion, package publication or live deployment is implied.

Implemented locally:

- Organization Agent runs and Workbench Runs with a trace tree/waterfall,
  correlated logs, privacy-aware inspector, filters, bounded follow and deep links.
  Explicit UTC ranges are preserved in shared investigations; keyboard navigation
  and resizable panes work without pointer-only controls.
- A compact investigation layout with root-first selection, tree/timeline modes,
  direct error-to-log navigation, persistent selected-step context and sequential
  step controls. Logs have bounded local search/severity filters; captured JSON
  has syntax highlighting and exact-value copying. Capture policy and unknown
  model evidence remain accessible without dominating the investigation.
- Model-call filtering, generation parameters/finish reasons, reported token
  details and first-text-token delay when observed. Role-labelled conversations
  show tool requests with links to matching tool execution. Raw JSON remains
  available; token subsets are not double-counted and cost is not invented.
- Opted-in framework error messages and bounded 32,768-character LLM payloads
  with explicit clipping markers. Metadata-only capture still removes content
  before durable queues. Framework exceptions open their evidence rather than
  assuming an application log exists.
- Separate short-lived ingestion credentials, policy/permission checks, atomic
  request/byte quotas, normalized queries and PostgreSQL migration 041.
- TypeScript and async/sync Python control/query APIs without new core tracing
  dependencies or global provider initialization.
- Optional TypeScript telemetry subpath and Python extra for explicit run/grant
  lifecycle, official exporters and command observation. Owned cleanup is bounded;
  borrowed providers and original command recovery failures are preserved.
  Metadata minimization precedes the producer queue. Large-message and in-flight
  flush regressions have focused tests. These helpers do not automatically patch
  a framework or instrument arbitrary processes.
- Optional post-filter OTLP forwarding with separate bounded queues, Secret-based
  authentication and explicit Helm egress. The native viewer still uses Victoria;
  Vector-specific configuration and native networking remain unqualified.
- Opt-in candidate Collector/Victoria Helm composition with private services,
  retained PVCs, digest-pinned images and namespace NetworkPolicies.
- Source-candidate concept, API/SDK, operator and maintainer documentation.

Compatibility qualification pins Collector 0.165.0, VictoriaLogs 1.53.0 and
VictoriaTraces 0.13.0. The internal framework spike uses TS Deep Agents 1.14.0
and Python Deep Agents 0.7.21 with maintained OpenInference instrumentation.

Local evidence includes fourteen real-component gates, including the built SDK
through actual API-key authentication, persisted grants and both storage services.
Twelve browser scenarios exercise the viewer with labelled adversarial fixtures,
including computed text contrast, keyboard control, desktop/mobile layouts,
collapsed-parent reveal, privacy-aware log search and exact content copying.
The local authenticated preview was checked with actual subprocess stderr and
two real Qwen/LangChain workflows using controlled tools. Each model workflow
made five generations, recovered from a failed report validation, and retained
all 25 callback-created spans. Metadata-only capture was checked independently.
See [real-model evidence](../operations/evidence/agent-observability-real-llm-2026-11-09.md).
Installed npm/Python distributions exercise the new APIs without introducing
tracing dependencies into the core SDKs. These are not sandbox-backed model runs
or native installation evidence.

Not yet release-qualified: automatic framework setup and command correlation,
real sandbox-backed/agent-in-sandbox workflows,
signal-history pagination, complete per-run delivery/loss accounting, native external
export, physical erasure/recovery, measured production sizing and native restricted
OpenShift. The completed image inventory **fails** the security gate on both
architectures: VictoriaLogs has 11 high/critical matches; VictoriaTraces has one
high match. Patched artifacts are required, not an implicit audit exception.
See the [audit decision](../operations/evidence/agent-observability-image-audit-2026-11-10.md).
These remain explicit gates
in the [active plan](../exec-plans/active/native-agent-observability.md).

Metadata is the default; opted-in content is not guaranteed secret-free.
Workload-reported telemetry is diagnostic evidence, not a compliance audit or
access to hidden model reasoning. No stable-release availability is claimed.
