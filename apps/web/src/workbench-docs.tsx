import type { DocPage } from "./docs-content";
import { CodeBlock } from "./components/docs-code";

export const workbenchDocs: DocPage = {
  id: "sandbox-workbench",
  section: "Sandboxes",
  title: "Sandbox workbench",
  lede: "Inspect execution, connect to a terminal, retrieve results and diagnose failures in the same sandbox.",
  toc: ["Availability", "Start with readiness", "Run and inspect a command", "Use the terminal", "Inspect and transfer files", "Diagnose with logs and metrics", "Continue from the CLI", "Limits and recovery"],
  body: <>
    <h2>Availability</h2>
    <p><strong>Requires 0.5.0-rc.13.</strong> Sandbox Workbench targets matching rc.13 web, API and CLI versions. This is a release candidate for npm <code>next</code>, not a stable promotion; SDK/CLI <code>latest</code> remains 0.4.0. No database migration is required. See <a href="#docs/developer-preview">Preview scope</a> for qualification and delivery status before installing.</p>
    <h2>Start with readiness</h2>
    <p>Open a sandbox from the dashboard. Overview checks the execution service, separately from lifecycle status, and shows expiry, execution-slot state, template, working directory, workspace and runtime capabilities. A ready execution service does not prove your application or external model is healthy.</p>
    <p>Switch sandboxes in the left navigation, or the selector on mobile. The selected pane stays open. Copy a workbench link to return to this sandbox; recipients must sign in and have access to the same organization.</p>
    <h2>Run and inspect a command</h2>
    <p>In Commands, use the runtime working directory and run this small check in a template with Python 3:</p>
    <CodeBlock language="bash">{`python -c 'import json; from pathlib import Path; Path("report.json").write_text(json.dumps({"tests": 4, "passed": 4})); print("report.json written")'`}</CodeBlock>
    <p>Verify the command succeeds with exit code 0. Open Filesystem, select <code>report.json</code>, and inspect or download the result. Command links identify one tracked command, not a new submission. Closing the output viewer does not terminate the command; Terminate is a separate, confirmed action.</p>
    <p>Refresh reads the selected command by ID even when it is older than the recent-command list. After output completes, the viewer refreshes its final status and exit code, or <code>finishReason</code> when no exit code is available. Refreshing never resubmits the command.</p>
    <h2>Use the terminal</h2>
    <p>Terminal is a lazy-loaded xterm.js PTY with ANSI rendering, raw keyboard input, control keys and resize. Opening it requests a one-time authorized connection ticket. The terminal is loaded only when selected; opening Overview does not start a shell.</p>
    <p>Interrupt sends Ctrl-C to the foreground process. Disconnect closes the connection. Reconnect requests a new connection and is explicit after a failure. Do not assume it restores an old shell or its history; use tracked Commands for work that needs a recoverable command identity.</p>
    <h2>Inspect and transfer files</h2>
    <p>Paths are inside the sandbox. Navigate from its configured working directory. Text previews support regular UTF-8 files up to 256 KiB and render markup as inert text after size and SHA-256 checks. Binary files can be downloaded. No editor, deletion UI or embedded HTML execution is provided.</p>
    <p>Refresh files reloads the selected preview even when the file keeps the same name and size. If the refreshed listing no longer contains a deleted file, its preview disappears. A failed listing hides the old preview rather than presenting stale contents as current.</p>
    <p>Upload asks you to confirm the destination, including replacement of any existing file. Transfers verify byte size and SHA-256. The browser limit is 16 MiB decoded or the server's lower limit; the transport buffers JSON/base64 in memory. The dashboard lists at most 300 directory entries.</p>
    <p>Cancel stops the browser request, not a write already accepted by the server. After an interrupted upload, refresh and inspect the destination before retrying. SHA-256 detects transfer corruption; it does not establish that content from an untrusted sandbox is safe.</p>
    <h2>Diagnose with logs and metrics</h2>
    <p>Logs can be searched by text and filtered by source or level/event. Refresh fetches one snapshot. Follow fetches serial snapshots every three seconds while the page is visible. It is not a durable replay stream: provider retention still applies, and the browser displays at most 1,000 entries and 500,000 characters.</p>
    <p>A failed log refresh labels the retained snapshot. Metrics refresh every five seconds and distinguish provider observation time from browser fetch time. Failed reads show unavailable values, not cached measurements. Fields that the provider does not measure, including current OpenSandbox disk I/O and network counters, are unavailable rather than zero.</p>
    <p>The rc.13 metrics API returns <code>503 sandbox_metrics_unavailable</code> when current provider metrics cannot be read; an absent sandbox returns 404. Optional <code>availableFields</code> identifies measured fields and <code>observedAt</code> records provider observation time, with <code>null</code> meaning unknown. Legacy numeric placeholders are not measurements. Deploy API and web together; a new client cannot correct an older server's cached fallback.</p>
    <p>Use <a href="#docs/outbound-access">Network</a> for policy and reachability, <a href="#docs/credential-vault">Vault</a> for attachment diagnostics, and <a href="#docs/execution-capacity">execution capacity</a> when no slot can be admitted.</p>
    <h2>Continue from the CLI</h2>
    <p>With CLI 0.5.0-rc.13, configure your own API key and deployment URLs. The <code>doctor</code> and <code>status</code> diagnostics only read public APIs; they never execute a command or access Kubernetes. <code>attach</code> separately opens an interactive terminal.</p>
    <CodeBlock language="bash">{`export HARAKIRI_API_URL=https://api.sandbox.example.com
export HARAKIRI_WEB_URL=https://sandbox.example.com
# Set HARAKIRI_API_KEY privately, not in a shared transcript.
harakiri doctor
harakiri doctor sbx_example --json --timeout-ms 10000
harakiri status sbx_example --check --json
harakiri attach sbx_example`}</CodeBlock>
    <p><code>doctor</code> checks configuration and an authenticated capacity read (<code>org:read</code>); an optional sandbox ID adds execution readiness (<code>sandboxes:read</code>). Success does not certify every scope, provider capability or network destination. Failed checks exit 1. <code>status --check</code> also exits 1 for a non-ready runtime.</p>
    <p><code>status --web-url https://sandbox.example.com</code> or <code>HARAKIRI_WEB_URL</code> adds a workbench link. The CLI does not guess the dashboard origin from the API host. Normal attach and file operations retain their existing execution/file permissions.</p>
    <h2>Limits and recovery</h2>
    <p>Refreshing a pane never resubmits work. Failed mutations are not automatically retried after a lost network response. Keep command and sandbox IDs, inspect state and then decide whether a new operation is appropriate.</p>
    <p>Terminal scrollback is limited to 3,000 lines and queued output to 2 MiB; overload disconnects with an error. Filesystem previews and logs are bounded displays, not durable storage. An ephemeral sandbox's files may disappear when its runtime is deleted; use <a href="#docs/workspaces">persistent workspaces</a> or download results before cleanup.</p>
    <p>Local fixture tests are separate from native runtime and independent developer acceptance. Consult the versioned release records linked from <a href="#docs/developer-preview">Preview scope</a> for qualified runtime profiles. This candidate does not promise durable PTY reconnection, streaming large-file transfers, historical resource charts or application-level health checks.</p>
  </>
};
