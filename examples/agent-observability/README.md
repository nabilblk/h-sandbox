# First Recorded Command

**Unreleased source candidate**, not present in npm rc.15 or PyPI 0.1.0rc2.
This is an executable smoke recipe for the public helpers, not an LLM agent or
proof of automatic framework instrumentation. Native sandbox execution of these
recipes is still an acceptance gate; installed-package tests cover their imports,
types, lifecycle, privacy and OTLP export separately.

## Prepare

Use a disposable sandbox on a matching candidate API with migration 041 and the
optional telemetry profile enabled. Do not enable the profile in production:
image-audit findings and operational qualification are still release blockers.
An organization administrator must enable capture. Keep content disabled initially.

Set `HARAKIRI_API_URL`, `HARAKIRI_API_KEY` and `HARAKIRI_SANDBOX_ID` privately.
The key needs `sandboxes:read`, `sandboxes:write`, `runs:read` and `runs:write`.
Do not pass the platform API key to the sandbox or print environment values.
These recipes borrow the sandbox, submit one short `printf` command, and leave
the sandbox alive. They create/close a run and issue/revoke its write-only grant.

### TypeScript

From this source checkout, build and pack the matching SDK. In a clean consumer
directory install that local archive, not the currently published version:

```sh
npm install /absolute/path/to/h-sandbox-sdk-0.5.0-rc.15.tgz
npm install @opentelemetry/api@1.9.1 @opentelemetry/resources@2.12.0 \
  @opentelemetry/sdk-trace@2.12.0 @opentelemetry/sdk-logs@0.223.0 \
  @opentelemetry/exporter-trace-otlp-proto@0.223.0 \
  @opentelemetry/exporter-logs-otlp-proto@0.223.0
npm install --save-dev tsx typescript
npx tsx first-trace.ts
```

The core SDK does not automatically install these optional peers. The standalone
provider uses standard OTLP exporters, without replacing a global provider,
context manager or propagator. The root SDK still imports without OTel installed.

### Python

In a clean virtual environment, install the source-built wheel with its extra:

```sh
python -m pip install '/absolute/path/to/h_sandbox-0.1.0rc2-py3-none-any.whl[telemetry]'
python first_trace.py
```

Both the wheel and source distribution are package-tested. Python 3.11 or newer
is required. Async applications use `async_agent_run` and
`async_observe_recorded_process` with `AsyncHarakiriClient` instead.

## Inspect the Result

Open **Agent runs** and find the printed run ID. The observation span links to the
printed command ID. Its duration is how long the client observed that command,
not a measurement of all remote process activity. A succeeded callback reports
success; query visibility and capture completeness remain separate facts.

Metadata mode deliberately stores no stdout/stderr bodies. To capture bounded
output, the operator ceiling and organization policy must allow content, the key
must have `runs:content`, and the run must request `capture: "content"` (Python:
`capture="content"`). Also set `includeOutput: true` / `include_output=True` on
the observer. This is explicit capture, not interception of every tool call.

For a failure investigation, replace the command with
`printf 'synthetic validation failure\\n' >&2; exit 1`. Expect an error observation
and a failed reported run. In content mode, enable **Sensitive content**, then open
the step's **Logs**. Stderr is labelled as a stream, not automatically classified
as an error. Truncated command output has an explicit marker.

After the run closes, terminate this disposable sandbox through its normal UI or
SDK lifecycle. Reopen the same run: retained reads are independent of runtime
availability until the access deadline. This sequence is a native acceptance
procedure, not a claim that local fixture tests executed it.

## Ownership and Limits

- Helpers own the run/grant, not the sandbox. They flush before closing the run
  and revoking the grant; only `ownership: "owned"` / `ownership="owned"` shuts
  down the supplied provider. Borrowed providers remain usable by their owner.
- Cleanup has a five-second budget per stage, not a five-second total. It uses
  fresh requests after cancellation. Diagnostic callbacks receive fixed codes,
  not raw exporter errors or credentials. Handle them without throwing.
- Command observation never resubmits or kills work. A cancellation or exception
  preserves the original recovery error/reference. A remote command may continue.
- Short-run providers use grants valid for at most 15 minutes. They do not renew
  credentials automatically. Long-running workflows must explicitly rotate an
  exporter through its supported lifecycle; never treat an expired grant as a
  permanent API key.
- Metadata minimization happens before the helper's batch queue and again at the
  Collector. Names and allowlisted metadata are still untrusted labels. Never
  place secrets in them. Opted-in payloads are not guaranteed to be secret-free.
- Existing Langfuse/LangSmith users must route only the intended run to this
  destination. Borrowing a provider does not magically add a run-specific exporter.
  No framework patches or automatic model tracing are installed by these helpers.

See [the technical contract](../../docs/observability.md) and
[operator fan-out instructions](../../docs/operations/agent-observability.md).
