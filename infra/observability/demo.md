# Try the observability viewer locally

This is an isolated, temporary source preview, not an installation or a release.
It uses the actual Harakiri viewer, API authentication and telemetry routes,
PostgreSQL, an OpenTelemetry Collector, VictoriaLogs and VictoriaTraces.
Browser sign-in uses a separate local Keycloak realm with generated credentials.

**The default workload is real local Node execution, not an LLM or a sandbox runtime.**
The sandbox association is explicitly labelled test metadata. The producer adds
OpenTelemetry instrumentation itself; this does not demonstrate automatic agent
capture. No model provider, production credentials or Kubernetes access is used.
An optional real local LLM scenario is described below; neither path creates a
Harakiri sandbox runtime.

## Start

Use the requirements in [the qualification guide](README.md). The demo also
needs the root workspace dependencies installed. It adds one Keycloak container
capped at 1 CPU / 768 MiB to the three resource-limited telemetry containers.
PostgreSQL listens only on its own private Unix socket. All HTTP ports bind to
`127.0.0.1`; the browser port defaults to `15229` and must be unused.

```bash
pnpm --dir infra/observability install --frozen-lockfile
pnpm --filter @harakiri/shared build
pnpm --filter @h-sandbox/sdk build
pnpm --dir infra/observability demo start
```

The command builds a digest-pinned local Keycloak image without credentials or
realm data in its layers. On first use Docker may need to download the images.
It then runs three workloads and waits until their spans and logs are queryable.
Startup prints the web address, direct run links, expiry, `statePath` and
`credentialsPath`. No password or API key is printed.

Open <http://127.0.0.1:15229/#dashboard/runs>, click **Sign in**, and use the
generated `username` and `password` in `credentialsPath`. The username is
`observer`. These are not your existing Harakiri credentials. The JSON files are
owner-readable only, in a private directory under
`~/.cache/harakiri-observability-qualification/`. Keep them private.

To use another port, set `HARAKIRI_DEMO_WEB_PORT` before starting. Do not expose
this HTTP development environment publicly.

## Inspect the scenarios

| Run | What happened | What to inspect |
| --- | --- | --- |
| Failure, repair and verified report | A real subprocess fails an assertion by concatenating CSV amounts. A retry converts the values to numbers. A separate process verifies the report: 3 orders, total 42. | Five spans including the parent; the failed first attempt; successful repair and verification; actual stdout and stderr. |
| Failed, no retry | The same assertion fails, without a repair. | Three spans including the parent, reported outcome `failed`, error step and correlated stderr. |
| Metadata-only privacy | The repair workflow runs again, without content capture. | Timings and error status remain visible; log bodies say `Body not captured`, including when content viewing is enabled. |

1. Open the first run. The root is selected initially. Click **1 error** to open
   **Validate total / first attempt** and its **Logs** directly.
2. Enable **Sensitive content**. The actual assertion shows
   `'015207' !== 42`. These inputs are controlled test data, not user data.
   Choose **Error** in Log severity and search for `AssertionError`. Copy the
   exact log body from its copy control. Filters apply only to loaded records.
3. Select **Convert amounts and retry**, then **Independently verify the report**.
   Their logs confirm the successful result. Disable **This step only** to see
   logs across the run.
4. Try **Timeline** and **Tree**, **Errors only**, step search, **Next step**,
   the time-window selector, **Copy run link**, the resizable inspector and
   **Export JSON**. The export contains the current
   bounded span read, not all retained logs or an archival backup.
5. Compare the failed run and metadata-only run. The capture disclosure keeps
   model evidence explicit as unknown; the summary omits token metrics when no
   model calls were observed. No model was called and no usage is fabricated.

The enabled surfaces in this minimal environment are **Agent runs** and public
documentation, including
<http://127.0.0.1:15229/#docs/agent-observability>. Other dashboard links and the
sandbox association do not represent working sandbox-management APIs here.
They remain visible because this is the actual application shell.

## Real local LLM agent

This opt-in scenario downloads a pinned Qwen model (approximately 2.5 GB), then
runs an actual LangChain agent twice: content enabled, and metadata only. It uses
synthetic orders and two controlled tools: `read_orders` and `submit_report`.
The model must request the tools and calculate a report that passes an independent
assertion. There is no unrestricted shell, project access, paid API or external
inference. Failed inference fails qualification; there is no scripted fallback.

```bash
pnpm --dir infra/observability/frameworks install --frozen-lockfile
STATE='/absolute/path/printed/at/startup/state.json'
pnpm --dir infra/observability exec node --import tsx real-llm-demo.mjs "$STATE"
```

Keep at least 15 minutes of preview lifetime available. The runner verifies the
preview owner and creates a separate labelled Ollama container, capped at 3 CPUs,
6 GiB, 512 processes, one inference at a time and no Linux capabilities. Cloud
inference is disabled; its HTTP listener is published only on loopback. The
model cache is inside the preview's private directory, not your global Ollama
installation. Both model and image are digest-pinned in `real-llm-demo.mjs`.

The recipe supplies `LangChainTrace` through `callbacks: [recording]` to the
actual `agent.invoke()`. It does not patch LangChain or replace a global tracer.
It records reported generation usage, finish reason and tool-call IDs, plus
messages/definitions/results only for the content-enabled run. The callback is
private qualification code, not a released SDK helper. It currently handles one
text conversation per model callback; multimodal/batched providers need their
own acceptance. First text token is recorded only on a nonempty text callback.

After success, click **Refresh runs** and open **LLM / Order reconciliation /
content**. Filter to **Model calls**, select a generation, and inspect:

1. **Overview**: provider/model, input/output tokens, reported finish reason and
   request parameters. Missing cost is not rendered as zero.
2. **Content** with **Sensitive content** enabled: system/user messages, actual
   model-requested tool calls, their arguments and returned tool history.
3. **Inspect tool**: navigate from a requested call to the corresponding tool
   span. `submit_report` shows the independently verified result: two paid
   orders, 3,500 cents revenue, one refunded order.
4. Compare **metadata**: the same actual inference workflow, but no captured
   prompts, answers or tool arguments/results, even for an authorized reader.

The runner prints direct links and writes a private `llm-evidence.json` with the
model digest, reported usage and verification. Exporter credentials are never
printed. Its owned model container is removed after execution, including failure;
weights and private diagnostics remain with the preview until its owned cleanup.
Ctrl-C cancels owned work. Do not stop the preview while qualification is running.

This proves real local inference, controlled tool execution and authenticated
telemetry ingestion/query. It does **not** prove agent-in-sandbox execution,
automatic instrumentation, arbitrary provider compatibility or model quality.

## Rerun and stop

Use the exact `statePath` printed by your instance:

```bash
STATE='/absolute/path/printed/at/startup/state.json'
pnpm --dir infra/observability demo status "$STATE"
pnpm --dir infra/observability demo run "$STATE"
pnpm --dir infra/observability demo stop "$STATE"
```

`run` performs three new workloads and prints their new links. Click **Refresh
runs** in the browser afterwards. Earlier runs remain available until shutdown.
Changing the capture policy can prevent reruns; re-enable capture before retrying.
`Follow` refreshes an open detail view; these controlled workloads finish quickly,
so they are normally already complete when first opened.

The supervisor stops automatically after four hours, or on Ctrl-C / `stop`.
Shutdown removes only its owned containers, network, database, generated
credentials and temporary telemetry. Data is not retained between starts; old
run links expire with the instance. The downloaded images and locally built
identity image remain in Docker's cache. No existing container, k0s workload,
published package, production configuration or public site is changed.

This demo is not evidence of production sizing, automatic framework capture,
real agent-in-sandbox execution or a completed observability release. Those
acceptance gates remain in the implementation plan.
