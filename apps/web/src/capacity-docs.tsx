import type { DocPage } from "./docs-content";
import { CodeBlock } from "./components/docs-code";

export const capacityDocs: DocPage = {
  id: "execution-capacity",
  section: "Concepts",
  title: "Execution capacity",
  lede: "Share a sandbox platform without admitting more executions than your organization allows.",
  toc: ["Availability", "What a slot counts", "Admission and recovery", "Inspect capacity", "Handle a full organization", "Change the limit", "Operator recovery"],
  body: <>
    <section><h2>Availability</h2>
      <aside className="docs-notice"><p><strong>Available in 0.5.0-rc.9.</strong> Requires migration 038 and matching API, scheduler, SDK and CLI builds. Older 0.5.0-rc.8 does not include this feature. Existing organizations remain closed to new execution until an operator completes inventory activation.</p></aside>
      <p>The capacity endpoint is the authority. A missing endpoint on an older server does not mean zero use. The dashboard keeps the last observation visible when refresh fails.</p>
    </section>
    <section><h2>What a slot counts</h2>
      <p>One execution slot belongs to one sandbox that may execute or start. Commands, terminals and processes inside that sandbox do not each consume a slot. This is an organization admission limit, not a CPU, RAM, storage, billing or cluster scheduling quota.</p>
      <table className="docs-data-table"><thead><tr><th scope="col">Situation</th><th scope="col">Slot</th></tr></thead><tbody>
        <tr><td>Accepted create, async create or snapshot restore</td><td>Reserved before runtime dispatch, including while queued</td></tr>
        <tr><td>Running or idle</td><td>Held</td></tr>
        <tr><td>Pausing</td><td>Held until suspension is confirmed</td></tr>
        <tr><td>Paused</td><td>Released only when the provider guarantees execution has stopped</td></tr>
        <tr><td>Resume after release</td><td>A new reservation is required; denial leaves the sandbox paused</td></tr>
        <tr><td>Stopping, expired locally, or outcome uncertain</td><td>Held until absence is confirmed and earlier effects are settled</td></tr>
        <tr><td>Stored workspace or snapshot</td><td>No execution slot; separate storage limits still apply</td></tr>
      </tbody></table>
      <p>Pausing may free an execution slot but retains <a href="#docs/workspaces">workspace ownership</a>. Another sandbox cannot attach the same workspace just because execution stopped.</p>
    </section>
    <section><h2>Admission and recovery</h2>
      <p>PostgreSQL commits the sandbox, accepted operation and reservation together. Competing API replicas serialize admission per organization. Runtime calls happen outside that transaction.</p>
      <p>A full organization receives <code>409 organization_capacity_exceeded</code>. There is no overflow queue, eviction or automatic retry loop. An unverifiable inventory receives <code>503 organization_capacity_unavailable</code>; unknown counts are null, never fabricated zeroes.</p>
      <p>Timeouts and a successful stop response do not prove that execution has ended. A scheduler reconciles known outcomes; uncertain effects retain their slot. A failed credential attachment requests cleanup without replaying the original secret.</p>
    </section>
    <section><h2>Inspect capacity</h2>
      <CodeBlock language="bash">{`harakiri capacity
harakiri capacity --json

curl --fail-with-body "$HARAKIRI_API_URL/v1/org/capacity" \\
  -H "x-api-key: $HARAKIRI_API_KEY"`}</CodeBlock>
      <CodeBlock language="typescript">{`const { capacity } = await client.capacity();
console.log(capacity.state, capacity.inUse, capacity.limit);
console.log(capacity.available, capacity.breakdown);`}</CodeBlock>
      <p>API keys need <code>org:read</code>. Counts are organization-scoped. States are <code>enforced</code>, <code>reconciling</code> and <code>quarantined</code>. Known counts include starting, active, stopping and uncertain reservations. This observation can change before your next request; it is not a reservation.</p>
    </section>
    <section><h2>Handle a full organization</h2>
      <CodeBlock language="typescript">{`import { HarakiriApiError, HarakiriClient } from "@h-sandbox/sdk";

const client = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL!,
  apiKey: process.env.HARAKIRI_API_KEY!
});
// Persist this key with the job; reuse it only for the same create input.
const intentKey = "report-job-2026-09-11-attempt-1";
try {
  const accepted = await client.createSandbox({
    template: "python-3.12-data", ttlSeconds: 300,
    wait: false, idempotencyKey: intentKey
  });
  console.log(accepted.sandbox.id, accepted.operation?.id);
} catch (error) {
  if (error instanceof HarakiriApiError &&
      error.code === "organization_capacity_exceeded") {
    console.error("No slot available", error.details?.capacity);
    // Record the conflict in your job system; do not hot-loop retries.
  } else {
    throw error;
  }
}`}</CodeBlock>
      <p>Stop an unneeded sandbox, then wait for capacity to become available. An administrator can raise the limit. In the dashboard, a rejected create retains its input. Retry the same accepted intent after a lost response; do not generate a new sandbox accidentally. Changed input with the same key returns <code>idempotency_conflict</code>.</p>
      <CodeBlock language="bash">{`harakiri create --template python-3.12-data --ttl 300 \\
  --idempotency-key report-job-2026-09-11-attempt-1
harakiri resume sbx_... --idempotency-key resume-job-2026-09-11-attempt-1
harakiri kill sbx_...
harakiri capacity --json`}</CodeBlock>
      <p>SDK-generated keys cover one method invocation. Persist your own key for retries across process restarts. Browser intent keys remain in memory, not local storage. Inspect an uncertain accepted operation before closing the dialog or restarting a job.</p>
      <p>Accepted operation keys and reservation history are retained without an automatic expiry in this release. Reusing an old key does not create a replacement execution, even after the original sandbox stops. Use a new key for genuinely new work; preserve the control-plane encryption key when restoring encrypted replay input.</p>
      <p>Run the <a href="https://github.com/nabilblk/h-sandbox/tree/main/examples/sdk-execution-capacity">limit-one SDK and CLI tutorial</a> in a dedicated organization to verify admission, rejection, same-key replay and confirmed cleanup. The SDK sandbox object keeps its last observed status after <code>kill()</code>; call <code>refresh()</code> for the server's current state.</p>
    </section>
    <section><h2>Change the limit</h2>
      <p>Human organization admins use Settings, Execution slot limit. API-key automation cannot change this setting. The range is 1 to 10,000. The compatibility default of 200 is not a cluster sizing recommendation.</p>
      <p>Lowering the limit does not kill existing work. Available becomes zero until use falls below the limit. Settings saves send only changed fields. A limit edit must include the <code>expectedCapacityRevision</code> from the preceding settings read; a concurrent change returns <code>409 organization_capacity_settings_conflict</code>. Reload before editing again.</p>
    </section>
    <section><h2>Operator recovery</h2>
      <p>Do not free slots by editing sandbox status, deleting ledger rows, waiting for a lease to expire or trusting an empty provider list. Stop older mutation producers before upgrading: an old API or worker cannot participate in the new admission protocol.</p>
      <p>Use the audited inventory command for activation and backup recovery. Review unresolved execution separately; no public force-release API exists. Follow the <a href="https://github.com/nabilblk/h-sandbox/blob/main/docs/operations/execution-capacity.md">execution capacity operations runbook</a> and <a href="#docs/install-kubernetes">Kubernetes installation guide</a>. Native provider capabilities and infrastructure resource limits remain separate requirements.</p>
    </section>
  </>
};
