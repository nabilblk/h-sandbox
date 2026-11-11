# Real Local LLM Investigation Evidence

Date: 2026-11-09 UTC. Unreleased source candidate, macOS arm64 with a native
arm64 Docker engine. No production deployment, package publication or k0s change.

## Workload and Boundary

Actual LangChain 1.5.11 `createAgent`, Core 1.2.12 and ChatOllama 1.3.0.
Qwen generated the tool decisions and final responses; there was no scripted
fallback. Two controlled tools read a synthetic order ledger and independently
validate the submitted result. No arbitrary shell or repository access was given.

- Model: `qwen3:4b-instruct`.
- Model digest: `0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0`.
- Ollama: `0.34.3`, multi-architecture index
  `sha256:7ab595e4ead391f6818c7215297781282babe0701f6d9a9f8862ac591360a58b`.
- Native arm64 manifest:
  `sha256:6c008733894b7110ef3a59c5bf269249e65ad52776b7502fa736dd505aee8db1`.
- Bounded inference: 3 CPUs, 6 GiB, one concurrent inference, 4,096 context tokens,
  512 maximum output tokens, temperature zero, thinking disabled, no cloud inference.
- Explicit per-invocation callbacks, no global tracer or framework patch.

The agent and controlled tools ran locally, **not in a Harakiri sandbox runtime**.
The sandbox association is test metadata. The browser uses real local Keycloak
sign-in; the API, PostgreSQL grants, OTLP exporter, Collector and Victoria queries
are actual components. This is not proof of automatic instrumentation or arbitrary
provider support.

## Results

| Capture | Run | Model calls | Tool calls | Failed tools | Spans exported/read | Reported input/output tokens |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Content | `run_b2f8100c365240e8ba7f416307fffe55` | 5 | 4 | 1 | 25 / 25 | 2,650 / 240 |
| Metadata | `run_acf5182e27429e8b60f3d227d704647d` | 5 | 4 | 1 | 25 / 25 | 2,650 / 234 |

Both executions requested `read_orders`, submitted an incorrect 3,200-cent
revenue, read the source again, and submitted the correct 3,500-cent revenue.
The independent assertion accepted **two paid orders, 3,500 cents revenue and
one refunded order**. Each invocation retained one trace. The failed child
remains visible; the overall reported outcome is succeeded only after verification.

Queryable generation counts and input/output totals match the actual model
responses. Acceptance waits for every callback-created span, not just the first
query containing model calls: parent and child batches can be indexed separately.
No cost or unreported cache usage was inferred. First text token appears only
where the application actually observed a nonempty text callback.

Content mode retains role-labelled messages, model-requested tool calls,
definitions, executed tool arguments/results and opted-in errors. Reads without
content permission return no content. Metadata capture retains no message/tool
payloads even when the reader explicitly requests content.

## Verification

- 13 actual component gates, including privacy before durable queues, Collector
  crash recovery, two-tenant isolation and real 32,768-character clipping:
  [pipeline receipt](agent-observability-llm-pipeline-2026-11-09.json).
- 141 web tests, 13 query-normalization tests, 5 framework tests, 6 collector/demo
  tests and 8 render-only chart tests pass.
- 12 Playwright scenarios pass: model/tool drill-down, reported token semantics,
  framework error navigation, raw fallback, hostile payloads, denied refresh,
  1,000 spans, desktop/mobile, keyboard interaction and contrast.
- API, web and framework typechecks pass. Production web build and documentation
  export pass; the existing application bundle-size warning remains.
- Actual authenticated browser inspection covered generation details,
  system/user/assistant messages, tool requests/results, failed validation,
  metadata privacy, desktop 1440x900 and mobile 390x844. Mobile document width
  equals 390px; no external message images were loaded.

Screenshots are local verification artifacts under `/tmp/harakiri-llm-*.png`,
not published product assets. The temporary preview expires automatically;
its run links are not permanent public evidence. Reproduce with
[the local recipe](../../../infra/observability/demo.md#real-local-llm-agent).

## Issues Found and Corrected

1. The pinned LangChain callback declaration disagrees with its runtime argument
   order. The private recipe follows the pinned dispatcher, with a real-framework
   ancestry regression test.
2. The previous amd64-specific model image crashed under arm64 emulation. This
   recipe pins a multi-architecture index and explicitly selects the engine's
   native architecture. No Docker-engine configuration was changed.
3. Early reads could observe all model spans before all parent/utility spans.
   Qualification now waits for the independently recorded callback count and no
   known partial evidence, without replaying model calls on read retries.
4. Tool exceptions initially exposed only an error status. The callback now
   preserves bounded error text exclusively in content mode, while error type
   remains metadata. Framework error navigation opens Overview instead of
   assuming an application log exists.

Owned model containers and qualification stacks were removed. Only the
four-hour interactive preview remains, with generated private credentials and
its own scheduled cleanup. Existing containers and Kubernetes workloads were
not modified. The full observability execution plan remains active.
