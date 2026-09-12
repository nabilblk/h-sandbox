import type { DocPage } from "./docs-content";
import { CodeBlock } from "./components/docs-code";

export const usageHistoryExample = `const to = new Date();
const history = await client.usageHistory({
  from: new Date(to.getTime() - 24 * 60 * 60 * 1000).toISOString(),
  to: to.toISOString(),
  resolution: "1m"
});
console.log(history.coverage);
console.log(history.summary.acceptedOperations);
console.log(history.summary.heldSlotSeconds);
console.log(history.summary.readiness);`;

export const usageObservationsDocs: DocPage = {
  id: "usage-observations", section: "Concepts", title: "Usage observations",
  lede: "Understand accepted work, held execution slots and observed readiness without confusing them with physical compute or billing.",
  toc: ["Availability", "What is measured", "Time and coverage", "Read your history", "Interpret readiness", "Limits and errors", "Collection and recovery"],
  body: <>
    <h2>Availability</h2>
    <aside className="docs-notice"><p><strong>Developer Preview: 0.5.0-rc.10.</strong> Requires migration 039 and matching API, scheduler, SDK and CLI versions. Earlier rc.9 provides current capacity but no history endpoint. Install the exact candidate or the npm next channel; stable latest remains 0.4.0. Read the <a href="https://github.com/nabilblk/h-sandbox/releases/tag/v0.5.0-rc.10">release notes and artifact receipt</a> for installation and qualification boundaries.</p></aside>
    <p>The dashboard's Usage page keeps live <a href="#docs/execution-capacity">execution capacity</a> separate from historical activity. Retained record totals are not the selected period's accepted work.</p>
    <h2>What is measured</h2>
    <table className="docs-data-table"><thead><tr><th scope="col">Metric</th><th scope="col">Meaning</th><th scope="col">Unit and source</th></tr></thead><tbody>
      <tr><td>Accepted operations</td><td>Unique creates, snapshot restores and resumes accepted during covered time. Retrying the same intent does not add another operation. Denied requests and no-op resumes do not count.</td><td>Operations / durable operation IDs</td></tr>
      <tr><td>Held slot-hours</td><td>Recorded occupied execution slots integrated over covered time. Includes starting, retained-paused and cleanup-pending work.</td><td>API slot-seconds divided by 3,600 / reservation intervals</td></tr>
      <tr><td>Peak held slots</td><td>Largest overlap of recorded reservations during covered time, not a sampled physical-container peak.</td><td>Slots / reservation intervals</td></tr>
      <tr><td>Observed readiness p50 / p95</td><td>Time from an accepted execution cycle to its first successful independent, fenced execution-ready probe.</td><td>Milliseconds / scheduler observations</td></tr>
      <tr><td>Operation outcomes</td><td>Latest terminal operation records with completion inside the window. They may have been accepted earlier.</td><td>Operations / recorded terminal timestamps</td></tr>
    </tbody></table>
    <p>One slot held for 30 minutes is 0.5 held slot-hours, regardless of its allocated CPU. Two simultaneous slots for 30 minutes are 1 held slot-hour and a peak of 2. Neither example establishes CPU utilization, billable compute, memory consumption or infrastructure cost.</p>
    <p>This is operational usage, not billing. A failed provider probe is not evidence that execution stopped. Reservation release remains the responsibility of the existing capacity protocol.</p>
    <h2>Time and coverage</h2>
    <p>All ranges are half-open: <code>[from, to)</code>. Boundaries use UTC, with partial first and last buckets when the request is not aligned. The returned window is normalized to UTC.</p>
    <ul><li><code>complete</code>: the full requested duration is covered.</li><li><code>partial</code>: some time is covered; totals include only that time, without extrapolation.</li><li><code>unavailable</code>: no time is covered; measured values are null, not zero.</li></ul>
    <p>A covered bucket with no activity is genuinely zero. A gap has no measurement. For partial buckets, average held slots equals slot-seconds divided by <code>coveredSeconds</code>, not the full bucket duration. The chart marks gaps and provides exact bucket values in a table.</p>
    <p>Coverage starts no earlier than the collection epoch, organization creation or the retention cutoff. There is no backfill from current sandbox status. The observer records continuity with a 30-second tolerance; longer interruptions create explicit gaps. A query ending at the present normally has a short uncovered tail after the latest heartbeat.</p>
    <h2>Read your history</h2>
    <p>Human members and admins can read their organization. API keys require <code>org:read</code>; a runtime-only key is not silently granted additional scope. The endpoint does not accept a caller-selected organization.</p>
    <CodeBlock language="bash">{`harakiri usage --period 24h
harakiri usage --period 7d --json
harakiri usage --period 30d --json

curl --fail-with-body --get "$HARAKIRI_API_URL/v1/usage/history" \\
  -H "x-api-key: $HARAKIRI_API_KEY" \\
  --data-urlencode "from=2026-09-12T00:00:00Z" \\
  --data-urlencode "to=2026-09-13T00:00:00Z" \\
  --data-urlencode "resolution=1m"`}</CodeBlock>
    <p>The curl dates illustrate an explicit window; choose dates within your deployment's actual coverage. SDK authentication follows <a href="#docs/sdk-cli">Install and connect</a>.</p>
    <CodeBlock language="typescript">{usageHistoryExample}</CodeBlock>
    <p>Pass <code>{"{ signal }"}</code> as the second SDK argument to cancel a read. Neither history requests nor readiness reads create commands, renew a lifetime or mutate reservations.</p>
    <h2>Interpret readiness</h2>
    <p>This is not a provider cold-start benchmark. It includes queueing, provisioning and observation delay. The worker checks every ten seconds, with bounded throughput, so an unobserved short-lived sandbox may have executed successfully.</p>
    <p><code>sampleCount</code> identifies the observed sample set. <code>unobservedCount</code> includes pending, interrupted, replaced and timed-out cycles. <code>unsupportedCount</code> identifies cycles whose provider cannot supply the probe. A p95 computed from two successful observations does not describe twenty unobserved operations.</p>
    <p>Percentiles use eligible observations from operations accepted inside the covered window, whose ready timestamp is also inside the window. They are not averages of bucket percentiles. Outcomes use completion time instead; dividing outcomes by accepted operations does not produce a valid success rate.</p>
    <p>Outcomes are not an append-only attempt log. If an operation is retried after failure, its recorded terminal state and completion time can change, revising the earlier outcome count. The accepted operation still counts once.</p>
    <h2>Limits and errors</h2>
    <table className="docs-data-table"><thead><tr><th scope="col">Contract</th><th scope="col">Bound</th></tr></thead><tbody>
      <tr><td>Window</td><td>Positive duration, at most 30 days</td></tr><tr><td>Resolution</td><td>1m, 15m or 1h; at most 1,500 buckets</td></tr>
      <tr><td>Query</td><td>100,000 rows per source and a two-second timeout per database statement</td></tr><tr><td>Retention</td><td>30 days by default; operator configurable from 1 to 30</td></tr>
    </tbody></table>
    <p><code>400 validation_error</code> means invalid parameters or too many buckets. On a supported server, <code>403 forbidden</code> requires correct organization access or key scope. The older rc.9 server also returns 403 for its unknown history route, even with a valid reader key; upgrade that server instead of broadening permissions. A <code>404</code> can also indicate an unsupported endpoint. <code>503 usage_history_limit_exceeded</code> calls for a shorter window. <code>503 usage_history_unavailable</code> means a read failed or exceeded its budget; retry the read, not the original sandbox command.</p>
    <p>The legacy <code>GET /v1/usage</code> response is unchanged. Its old numeric placeholders and empty series are still unmeasured. New clients must use the separate history endpoint.</p>
    <h2>Collection and recovery</h2>
    <p>History is reproducible from PostgreSQL reservation and operation facts plus durable readiness observations and continuity windows. Closing the dashboard does not stop collection. Short claims coordinate multiple observers; this does not expand the overall scheduler's documented deployment profile.</p>
    <p>Retention prunes old observations and continuity windows, not live holds or operational records. Lowering retention removes older coverage; increasing it again cannot recover discarded observations. Back up the database and preserve existing encryption/storage recovery requirements.</p>
    <p>Continue with <a href="#docs/usage-tutorial">a checked usage tutorial</a>, <a href="#docs/operator-monitoring">operator monitoring</a> and <a href="#docs/backup-recovery">backup and recovery</a>.</p>
  </>
};

export const usageTutorialDocs: DocPage = {
  id: "usage-tutorial", section: "Tutorials", title: "Observe a sandbox task",
  lede: "Run a model-free task, release its runtime and inspect real activity with explicit coverage.",
  toc: ["Before you start", "Use the first-task wizard", "Create measured activity", "Check the observations", "Exercise a collection gap", "Clean up"],
  body: <>
    <h2>Before you start</h2>
    <p>This tutorial needs version 0.5.0-rc.10 or a compatible later release described in <a href="#docs/usage-observations">Usage observations</a>, matching SDK/CLI, an authorized key with <code>org:read</code>, <code>sandboxes:read</code>, <code>sandboxes:write</code> and <code>templates:read</code>, and one approved ready Linux template with a shell. Use a dedicated test organization; do not lower a shared organization's capacity.</p>
    <h2>Use the first-task wizard</h2>
    <p>Get started lists eligible installed templates. Legacy installations may include built-ins; eligibility alone is not proof that an image meets your organization's policy. If there is no eligible template, an admin follows <a href="#docs/install-kubernetes">the template import procedure</a>; a member asks an admin to import an approved image. Return to onboarding and refresh the catalog. Choose the approved template, which need not be named Python, and run the first task.</p>
    <p>The task prints <code>Harakiri is ready</code> from the template's working directory. The sandbox has a five-minute lifetime. Check first task continues observing the same accepted sandbox and command after a timeout. Stop waiting only disconnects the wait; Open sandbox shows the runtime for inspection or explicit termination. When browser session storage is available, recovery is scoped to the current user and organization in the same browser tab. Without it, keep the page open and retain the displayed sandbox ID.</p>
    <h2>Create measured activity</h2>
    <p>For a programmatic check, use <a href="https://github.com/nabilblk/h-sandbox/tree/main/examples/sdk-usage-observations">the complete SDK usage example</a>. It creates one sandbox using a stable intent, retries the same create to verify identity, executes one finite command, waits for an observation, and confirms termination in a finally block.</p>
    <CodeBlock language="bash">{`# From the matching release checkout with dependencies installed:
export HARAKIRI_TEMPLATE=your-approved-template
pnpm --filter @harakiri/api exec tsx --tsconfig ../../examples/tsconfig.json ../../examples/sdk-usage-observations/index.ts
harakiri usage --period 24h
harakiri capacity --json`}</CodeBlock>
    <h2>Check the observations</h2>
    <p>The example checks a change of exactly one accepted create in a dedicated organization. A retry is not another admission. Slot-seconds should increase; after confirmed termination live capacity returns to its original value. History remains available, including the released interval.</p>
    <p>In Usage, compare period selection, coverage, sample counts and bucket values. Missing readiness is reported as unobserved or unsupported, not a zero-millisecond success. A new installation has no earlier history, so most of its first 24-hour view is initially uncovered.</p>
    <h2>Exercise a collection gap</h2>
    <p>Operators can test an interruption in an isolated installation only. Set the chart's <code>usage.observerEnabled</code> to false through your normal values review, wait more than 30 seconds, then re-enable it. Do not scale the whole scheduler down on a populated cluster: that would also stop TTL and capacity maintenance.</p>
    <p>The history response reports disabled or stale collection, preserves the earlier observations, and marks the interruption as a gap after restart. Open reservations remain occupied. Creating activity during the gap does not fabricate a complete historical bucket later.</p>
    <h2>Clean up</h2>
    <p>The example terminates only the sandbox it created, and waits for its terminal state. After an interrupted process, use its printed ID to inspect and terminate that owned runtime. Restore your observer setting, revoke the tutorial key, and keep only sanitized measurements. Templates are reused, not archived or deleted by this tutorial.</p>
  </>
};

export const operatorMonitoringDocs: DocPage = {
  id: "operator-monitoring", section: "Self-hosting", title: "Operator monitoring",
  lede: "Monitor collector health and storage pressure without adding a mandatory monitoring stack or exposing organization activity publicly.",
  toc: ["Two separate surfaces", "Enable private metrics", "Scrape and network boundaries", "Alerts and storage ownership", "Recovery and release qualification"],
  body: <>
    <h2>Two separate surfaces</h2>
    <p>Available in the 0.5.0-rc.10 candidate. Product history uses PostgreSQL and organization authorization. Optional Prometheus process metrics use a separate private listener and a dedicated operator bearer token. Process counters reset on restart and cannot replace historical usage.</p>
    <h2>Enable private metrics</h2>
    <p>No monitor CRD, metrics service, ingress or extra credential is required by a default install. Collection itself is enabled independently. Add the following non-secret settings to your reviewed values file only after creating an operator-owned Secret with a random token of at least 32 characters. Do not put the token in Helm values or a public repository.</p>
    <CodeBlock language="yaml">{`usage:
  observerEnabled: true
  retentionDays: 30
metrics:
  enabled: true
  host: "127.0.0.1"
  port: 9130
  tokenSecret:
    name: harakiri-private-metrics
    key: token
  podMonitor:
    enabled: false`}</CodeBlock>
    <p>The loopback default supports an explicitly authorized port-forward. Both API and scheduler pods use <code>GET /metrics</code> with <code>Authorization: Bearer</code>. This token is not a Harakiri API key and grants no product API access. A metrics listener failure is logged without disabling execution.</p>
    <h2>Scrape and network boundaries</h2>
    <p>For pod-network scraping, deliberately set <code>metrics.host</code> to <code>0.0.0.0</code>. Operators must restrict port 9130 to their monitoring namespace and pod selectors through their existing NetworkPolicies, and use a trusted network or a TLS-enabled mesh/proxy. The HTTP listener is not a TLS endpoint; bearer authentication alone does not encrypt traffic.</p>
    <p>The chart never adds a permissive NetworkPolicy that could widen an existing policy. Do not expose the metrics port through the public gateway, tunnel, ingress or route. The optional <code>metrics.podMonitor.enabled</code> requires an already installed Prometheus Operator CRD and explicit pod-network binding. Configure its labels to match your Prometheus selection and grant that operator read access to the selected Secret.</p>
    <p>Missing or short tokens prevent the metrics listener from starting. Missing Secret references prevent affected pods from starting. Rotate the dedicated Secret through your deployment procedure; processes read it at startup.</p>
    <h2>Alerts and storage ownership</h2>
    <p><a href="https://github.com/nabilblk/h-sandbox/tree/main/infra/monitoring">Versioned alert rules and promtool fixtures</a> cover collection lag, observation backlog, scheduler delay, denial pressure, missing series, low free bytes and low free inodes. These are examples with thresholds to review, not a capacity SLA.</p>
    <p>The application exposes no user, organization, sandbox, workspace, domain or credential labels. Denial counters count HTTP attempts, not unique jobs. Check per-organization capacity through the authenticated API; an aggregate denial rate cannot establish utilization.</p>
    <p>Storage evidence comes from your existing node, kubelet, database and registry exporters. Map only the actual registry, database and workspace filesystems into the example labels. Configure expected-target series as documented in <a href="https://github.com/nabilblk/h-sandbox/blob/main/docs/operations/operator-monitoring.md">the operator runbook</a>; otherwise absent exporters cannot be detected reliably.</p>
    <p>A healthy Harbor HTTP endpoint, successful image push or project quota is not physical disk/inode headroom. The registry operator owns dated evidence for the actual storage path, available bytes, free inodes and growth. Harakiri does not resize or prune that storage automatically.</p>
    <h2>Recovery and release qualification</h2>
    <p>Back up usage tables with the application database. Old binaries do not collect history; binary rollback must retain additive schema and represent missing collection as gaps. Never reintroduce pre-capacity writers or delete reservation rows to make graphs look correct.</p>
    <p>Distinct-release upgrade and rollback remain unqualified until a receipt identifies two actual published releases and passing recovery gates. The existing same-version configuration rollback does not establish that contract. Follow <a href="#docs/backup-recovery">the supported recovery profile</a>.</p>
  </>
};
