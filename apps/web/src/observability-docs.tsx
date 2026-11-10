import type { DocPage } from "./docs-content";
import { CodeBlock } from "./components/docs-code";

export const observabilityDocs: DocPage = {
  id: "agent-observability",
  section: "Concepts",
  title: "Agent observability",
  lede: "Connect reported agent steps to sandbox execution, without confusing missing evidence with success.",
  toc: ["Candidate availability", "Runs, traces and runtime logs", "Enable capture", "Create a run", "Connect an exporter", "Record a command", "Investigate a failure", "Inspect a model call", "Read and retain evidence", "External OTLP forwarding", "Privacy and limits"],
  body: <>
    <h2>Candidate availability</h2>
    <p><strong>Unreleased source candidate.</strong> This page describes the matching API, web and SDK changes in the native observability milestone, not the published rc.15 packages. The feature is off by default. The optional Helm profile is experimental; restricted OpenShift, production sizing and sandbox-backed agent acceptance are not yet qualified.</p>
    <p>The implemented surface includes authenticated OTLP/HTTP ingestion, organization-scoped run management, bounded telemetry reads and a native trace/log viewer. Automatic Deep Agents/OpenCode setup, command context propagation and sandbox-backed model tutorials remain release gates. Installing the profile does not automatically instrument arbitrary code.</p>
    <p><strong>Do not enable this candidate in production.</strong> The pinned Victoria storage images currently fail the high/critical dependency audit. Patched images and operational acceptance are required before release; successful functional tests do not remove that gate.</p>
    <h2>Runs, traces and runtime logs</h2>
    <p>An <strong>agent run</strong> is a named investigation associated with one or more authorized sandboxes. It has its own ID, independent of a framework thread, command or OpenTelemetry trace. Multiple traces can belong to one run; terminating the sandbox does not remove retained telemetry.</p>
    <p><strong>Spans</strong> report instrumented operations and parent relationships. <strong>Agent logs</strong> are application records sent through OTLP, optionally correlated by trace and span IDs. Existing Workbench <strong>Logs</strong> still shows provider/runtime snapshots. Enabling agent capture neither copies those snapshots nor records every subprocess, model call or file write.</p>
    <p>Reported outcome, Collector acknowledgement and query visibility are separate facts. A succeeded run is a caller report, not an audit attestation. A Collector acknowledgement is not proof of durable storage. No records, no usage or no errors means unknown, not zero or success.</p>
    <h2>Enable capture</h2>
    <ol>
      <li>Have an operator install the candidate logs/traces profile with matching source-built API/web images and migration <code>041_agent_observability.sql</code>. Read the <a href="https://github.com/nabilblk/h-sandbox/blob/main/docs/operations/agent-observability.md">operator guide</a> before enabling it.</li>
      <li>As an organization administrator, open Agent runs, then Capture policy. Enable telemetry. Leave content capture disabled for the first test.</li>
      <li>Create a dedicated API key with <code>runs:read</code>, <code>runs:write</code> and <code>sandboxes:write</code>. Add execution permissions only when the application needs them. Existing keys are not silently upgraded.</li>
      <li>Select an existing running sandbox in your organization. The examples below create telemetry metadata, not a sandbox.</li>
    </ol>
    <h2>Create a run</h2>
    <p>With the source-built TypeScript SDK, create a run and request its write-only exporter credential. Store the run ID for investigation; keep the grant private.</p>
    <CodeBlock language="typescript">{`import { HarakiriClient } from "@h-sandbox/sdk";

const client = HarakiriClient.fromEnv();
const sandboxId = process.env.HARAKIRI_SANDBOX_ID;
if (!sandboxId) throw new Error("Set HARAKIRI_SANDBOX_ID.");

const { run } = await client.agentRuns.create({
  name: "Investigate parser repair",
  sandboxId,
  capture: "metadata",
});
const grant = await client.agentRuns.grant(run.id, sandboxId);
const traceOptions = grant.exporterOptions("traces");
// Pass traceOptions to your owned official OTLP/HTTP exporter.
// It contains a short-lived credential: never log it.`}</CodeBlock>
    <p>The Python SDK exposes the same boundary through synchronous and asynchronous clients. The synchronous form below does not require an event loop in your application.</p>
    <CodeBlock language="python">{`import os
from harakiri import HarakiriClient

with HarakiriClient.from_env() as client:
    sandbox_id = os.environ["HARAKIRI_SANDBOX_ID"]
    run = client.agent_runs.create(
        "Investigate parser repair", sandbox_id, capture="metadata"
    )
    grant = client.agent_runs.grant(run.id, sandbox_id)
    trace_options = grant.exporter_options("traces")
    # OTLPSpanExporter(endpoint=trace_options.endpoint,
    #                  headers=trace_options.headers, timeout=3)
    # Keep an owned exporter alive for the actual instrumented workload.`}</CodeBlock>
    <h2>Connect an exporter</h2>
    <p>Use the official OTLP/HTTP trace and log exporters for your application. TypeScript returns <code>url</code> and <code>headers</code>; Python returns <code>endpoint</code> and <code>headers</code>. Request a separate configuration for <code>logs</code>. Public gRPC and metrics ingestion are not provided.</p>
    <p>Attach the exporter to a provider you explicitly own, or use your existing tracing setup. The Harakiri SDK installs no global provider, context manager or framework patch. Do not use a platform API key as an exporter credential. Do not place grants in environment dumps, URLs, span attributes or command arguments.</p>
    <p>Grants last at most 15 minutes and cannot outlive the issuing principal. Renew explicitly before expiry for longer work, replacing exporter credentials through the exporter's supported lifecycle. Run recording lasts at most 24 hours. A closed run or terminated sandbox allows at most a two-minute final flush of an existing grant; no new grant can be issued for a closed run.</p>
    <p>When work finishes, end spans, perform a bounded exporter flush, then close the run with the outcome your application actually knows. A telemetry failure must not skip sandbox cleanup or overwrite an execution error. These APIs do not own or terminate the sandbox.</p>
    <CodeBlock language="typescript">{`await client.agentRuns.close(run.id, "unknown");
// After your final flush, revoke any remaining grant explicitly.
await client.agentRuns.revokeGrant(run.id, grant.id);`}</CodeBlock>
    <h2>Record a command</h2>
    <p>The optional <code>@h-sandbox/sdk/telemetry</code> subpath and Python <code>h-sandbox[telemetry]</code> extra add explicit run lifecycle and command observation. Core SDK imports still work without OpenTelemetry. Use the matching source-built package and the <a href="https://github.com/nabilblk/h-sandbox/tree/main/examples/agent-observability">first-trace recipes</a> for exact optional dependencies and executable files.</p>
    <CodeBlock language="typescript">{`import {
  createRunTelemetry, observeRecordedProcess, withAgentRun,
} from "@h-sandbox/sdk/telemetry";

// client and sandbox are existing handles. This borrows the sandbox.
await withAgentRun(client, {
  name: "First recorded command",
  sandboxId: sandbox.id,
  runtime: createRunTelemetry,
  ownership: "owned",
  onDiagnostic: ({ code }) => console.warn(code),
}, async ({ run, runtime }) => {
  console.log("Run:", run.id);
  const command = await sandbox.processes.start({
    command: "printf 'Hello from Harakiri\\\\n'",
    timeoutMs: 10_000,
  });
  await observeRecordedProcess(command, runtime, { timeoutMs: 30_000 });
});`}</CodeBlock>
    <CodeBlock language="python">{`from harakiri.telemetry import (
    agent_run, create_run_telemetry, observe_recorded_process,
)

with agent_run(
    client, "First recorded command", sandbox.id,
    runtime=create_run_telemetry, ownership="owned",
    on_diagnostic=print,
) as recording:
    command = sandbox.processes.start("printf 'Hello\\\\n'", timeout=10)
    result = observe_recorded_process(command, recording.runtime, timeout=30)
    if result.command.status != "succeeded" or result.command.exit_code != 0:
        raise RuntimeError(f"Command {command.id} did not succeed")`}</CodeBlock>
    <p>These helpers flush, close the run and revoke the grant; they do not delete the sandbox, resubmit a command or automatically instrument a model. Observation timing is the client's wait, not the whole remote execution. Original execution errors and recovery references survive cleanup failures. Async Python uses <code>async_agent_run</code> and <code>async_observe_recorded_process</code>.</p>
    <p>Metadata mode stores no output body. To record bounded stdout/stderr, request content capture with all required permissions and set <code>includeOutput: true</code> or <code>include_output=True</code>. Truncation is labelled. Stderr alone does not determine severity. The standalone providers do not renew their 15-minute grants automatically.</p>
    <p>Provider ownership defaults to borrowed: it is flushed but not shut down. Explicit owned mode closes it. Cleanup has a five-second budget per stage, not a five-second total. Diagnostic callbacks receive fixed codes, never raw backend errors. No global provider, context manager or propagator is replaced. An existing application provider still needs deliberate run-specific export routing; borrowing it does not export it automatically.</p>
    <h2>Investigate a failure</h2>
    <ol>
      <li>Open Agent runs from the dashboard, or Runs inside the sandbox Workbench. Search by name or ID and select the run.</li>
      <li>Start at the root of the trace. Switch between Timeline for the shared-time-axis waterfall and Tree for more name space. Errors only keeps parent context. The error count opens a failed step's Logs, or Overview for a framework exception without a command link; repeated clicks cycle through errors. Repeated attempts remain separate spans; a failed child does not determine the whole run's outcome.</li>
      <li>Select a step and open Overview for timing, identity and attributes. Previous/Next step preserves the inspector tab, and selecting a nested step reveals its collapsed parents. A reported <code>harakiri.command.id</code> links to the tracked command; this is a correlation hint, not proof of command ownership.</li>
      <li>Open Logs for records carrying that step's trace/span identity. The root initially shows all run logs; a child initially shows This step only. Clear that checkbox to broaden the scope. Search loaded logs and Log severity filter the current bounded read locally, not the complete stored history.</li>
      <li>Enable Sensitive content only when authorized. Log bodies and captured input/output remain hidden otherwise. Content renders text conversations by role, tool requests/results, or raw JSON with syntax highlighting and exact-value copy controls. Disabling content removes the payloads and resets log filters.</li>
      <li>Use Copy run link to share the investigation with an authorized colleague. Export JSON downloads the current authorized span snapshot, not an unlimited archive.</li>
    </ol>
    <p>Follow performs serial reads every five seconds while visible; it is opt-in, not a lossless event stream. Custom range accepts explicit UTC start/end times and preserves them in the investigation link. Copy run link freezes the current window, so a colleague opens the same period. Missing parents, cycles, duplicate/conflicting deliveries and record limits are labelled. Failed or denied refreshes hide previously displayed sensitive data. Capture evidence is available beside the summary; Content enabled describes the run's capture choice, not proof that every payload was collected.</p>
    <p>Observed token counters use innermost model-call spans, not both a parent aggregate and its children. Missing counters remain unknown and incomplete observations are labelled partial. This is workload-reported usage within the read window, not a billing total or a price estimate.</p>
    <h2>Inspect a model call</h2>
    <ol>
      <li>Choose Model calls in the trace's type filter. Parent steps remain visible for context. Select a generation and open Overview for its reported provider, model, input/output tokens, finish reason and request parameters.</li>
      <li>Open Content and explicitly reveal it. Input messages show the system instructions, user request and tool history sent to that generation, when recorded. Output messages show the model's answer or requested tool calls. These are observed messages, not hidden model reasoning.</li>
      <li>Inspect a tool call's name, arguments and call ID. Inspect tool opens a matching tool span only when its call ID is unique within the same trace, clearing filters that hide the destination. That span's Content shows the captured tool arguments/result and any opted-in error message. A model requesting a tool is not proof that the tool executed.</li>
      <li>Switch Messages to JSON for the exact recorded structure. Unsupported formats, multimodal payloads and clipped JSON fall back to raw text, never an externally fetched image or executable HTML. Copy preserves the captured value, not a reconstructed conversation.</li>
    </ol>
    <p>Cache-read/cache-creation counts are subsets of input tokens, and reasoning tokens are a subset of output tokens. They are not added to the total a second time. Missing usage is Not reported, including a missing cost. First text token is the application's observed delay to the first nonempty text callback, not server-side inference time; tool-only or non-streaming responses may not report it. No price catalogue or billing estimate is inferred.</p>
    <p>Capture is still explicit: an exporter alone cannot discover model messages or tools. The <a href="https://github.com/nabilblk/h-sandbox/tree/main/examples/agent-observability#run-the-agent-yourself">real-agent source recipe</a> uses a local Ollama model, maintained OpenInference instrumentation and sandbox tools to produce an independently verified order report. It defaults to metadata-only capture and borrows a disposable sandbox. Run it in a dedicated process, not inside an already instrumented application. The native acceptance job exercises the same workflow; consult its matching-source receipt before treating it as qualified.</p>
    <p>With content enabled and authorized, OpenInference payloads appear as <strong>Framework input</strong> and <strong>Framework output</strong> in the step's Content tab. Payloads are bounded and may be truncated. Framework tool spans and explicit SDK command observations do not yet share automatic parent propagation; the viewer does not fabricate that relationship.</p>
    <h2>Read and retain evidence</h2>
    <CodeBlock language="typescript">{`const page = await client.agentRuns.list({ sandboxId, limit: 50 });
const snapshot = await client.agentRuns.spans(run.id, {
  from: run.createdAt,
  to: new Date().toISOString(),
  includeContent: false,
  limit: 500,
});
if (snapshot.partial) console.warn("Partial telemetry read", snapshot.issues);
// page.nextCursor continues the same run-list filters.
// Span/log snapshots are bounded; they do not have a history cursor yet.`}</CodeBlock>
    <p>Reads are eventually consistent, bounded to 1,000 records and a 31-day window. Narrow the window when <code>record_limit</code> is reported. Raw span IDs and nanosecond timestamps remain strings; do not round them through JavaScript numbers. Repeated log lines are preserved.</p>
    <p>The authorized read window defaults to seven days. After expiry, metadata remains available and telemetry reads return <code>410 agent_run_expired</code>. This is an access deadline, not a promise of immediate physical erasure. Backups, queues and storage reclamation have separate operator policies.</p>
    <h2>External OTLP forwarding</h2>
    <p>Operators can opt in to Collector fan-out to an authenticated HTTPS OTLP destination after Harakiri's privacy filter. The native viewer still uses Victoria; an arbitrary external destination is not a supported query backend. This does not require deploying a second pipeline inside Harakiri.</p>
    <p>The <a href="https://github.com/nabilblk/h-sandbox/blob/main/docs/operations/agent-observability.md">operator guide</a> describes the Secret reference, explicit egress rules, bounded queues and destination trust. The receiver can see all exported organizations, so its access and retention need approval. Both signals have been verified with a real OTLP receiver; Vector-specific deployment and cluster network enforcement remain unqualified.</p>
    <h2>Privacy and limits</h2>
    <p>Metadata mode removes prompt/output attributes, status messages, events, links and log bodies before durable queues. Names and allowlisted metadata are still producer-controlled labels: never put secrets in them. Opted-in content is not guaranteed to be secret-free.</p>
    <p>Content requires the operator ceiling, organization policy and run choice to permit it. Reading it additionally requires <code>runs:content</code>, which is administrator-only. Grant revocation, issuer removal, key revocation and role demotion are checked at ingestion; changing capture policy cannot erase already retained records.</p>
    <p>Ingestion accepts JSON or protobuf over HTTP, optionally gzip, with a 1 MiB compressed/decompressed request limit. Per-organization budgets default to 600 requests and 16 MiB decoded bytes per minute. Overload returns 429; backend failure returns a sanitized 503. Do not retry indefinitely or treat enqueue success as complete capture.</p>
    <p>Captured message, tool and system-instruction strings are bounded to 32,768 characters each; log bodies to 16,384. Clipping is labelled as partial evidence. A truncated conversation is not suitable for exact replay. Unknown attributes are dropped, and unsupported message shapes remain raw payloads.</p>
    <p>The <a href="https://github.com/nabilblk/h-sandbox/blob/main/infra/observability/README.md">qualification guide</a> records the pinned versions and evidence. Tests cover real Deep Agents callbacks with deterministic models and a separately executed local Qwen/LangChain workflow with actual tool calls and an independently verified report. Automatic framework lifecycle integration, agent-in-sandbox capture and native OpenShift remain unqualified. This is diagnostic workload evidence, not hidden model reasoning or a compliance audit trail.</p>
  </>
};
