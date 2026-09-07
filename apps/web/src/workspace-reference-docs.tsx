import type { DocPage } from "./docs-content";
import { WorkspaceReleaseNote } from "./workspace-docs";

export const workspaceOperations = [
  ["GET", "/v1/workspaces", "List workspace records and the operator's storage policy. Returns { workspaces, policy }."],
  ["POST", "/v1/workspaces", 'Create metadata with { "name": "agent-project" }. Returns 201 { workspace }; backing storage is requested on first attachment.'],
  ["GET", "/v1/workspaces/{id}", "Read one workspace. Returns { workspace }."],
  ["POST", "/v1/workspaces/{id}/archive", "Archive a detached workspace, retaining storage and quota. Returns { workspace }; repeated archive is allowed."]
] as const;

const errors = [
  ["400", "validation_error", "Check the name format and request fields. Creating from a snapshot with workspaceId also fails validation."],
  ["401", "unauthorized", "Supply valid organization credentials; do not put credentials in the URL."],
  ["404", "workspace_not_found", "Verify the workspace ID and authenticated organization. Cross-organization lookups do not expose the record."],
  ["409", "workspace_name_conflict", "Choose another name. Archived records still reserve their names."],
  ["409", "workspace_quota_exceeded", "The allocation is full or busy. Archive does not free quota; contact the operator."],
  ["409", "workspace_unavailable", "The workspace is attached or archived. Wait for Available or choose another workspace."],
  ["409", "workspace_attached", "Terminate the owning sandbox and wait for confirmed release before archive."],
  ["409", "workspace_provider_mismatch", "Use a compatible operator deployment. Changing providers does not migrate existing storage."],
  ["409", "workspace_attachment_ambiguous", "An attachment was already attempted. Reconcile its outcome; do not blindly retry a provider create."],
  ["409", "workspace_reservation_missing", "The sandbox no longer owns the reservation. Inspect workspace and lifecycle operation state."],
  ["409", "workspace_snapshot_unsupported", "Back up workspace files separately. A snapshot of a workspace-backed sandbox is unsupported."],
  ["501", "workspaces_unavailable", "Ask the operator to enable a valid storage profile, supported provider and fail-closed runtime configuration."]
] as const;

export const workspaceReferenceDocs: DocPage = {
  id: "workspace-reference",
  section: "Reference",
  title: "Workspace API, SDK and CLI",
  lede: "The public contract for allocating, attaching, inspecting and archiving persistent workspaces.",
  toc: ["Distribution and prerequisites", "HTTP operations", "Parameters and responses", "SDK methods", "CLI commands", "Errors and recovery"],
  body: <div className="workspace-doc">
    <section><h2>Distribution and prerequisites</h2>
      <p>This reference targets <code>0.5.0-rc.3</code>. Use the matching release archives below, or verify that the exact candidate is available in npm before installing it. The stable <code>latest</code> channel is separate; an unversioned install of 0.4.0 does not contain workspaces.</p>
      <p>Obtain <code>h-sandbox-sdk-0.5.0-rc.3.tgz</code>, <code>h-sandbox-cli-0.5.0-rc.3.tgz</code> and their release checksums from your operator. Maintainers with repository access can also retrieve them from the GitHub prerelease. In a fresh directory with Node.js 20 or newer, install both archives together because the CLI depends on the matching SDK:</p>
      <pre>{`npm init -y
npm install ./h-sandbox-sdk-0.5.0-rc.3.tgz ./h-sandbox-cli-0.5.0-rc.3.tgz
./node_modules/.bin/harakiri --version`}</pre>
      <p>The rest of these docs use <code>harakiri</code> for the installed executable. For a local install, use <code>./node_modules/.bin/harakiri</code>. Configure <code>HARAKIRI_API_URL</code> and <code>HARAKIRI_API_KEY</code> privately. The API/scheduler must run matching workspace-aware code and an enabled storage profile.</p>
      <p>For the mental model, start with <a href="#docs/workspaces">Workspaces</a>. For a complete exercise, use <a href="#docs/persistent-workspaces">Reuse files across sandboxes</a>.</p>
    </section>
    <section><h2>HTTP operations</h2>
      <p>Authenticate with <code>x-api-key</code> or a valid Keycloak bearer token. The organization comes from authentication, not a client-supplied organization ID. List returns up to 1,000 records, including archived workspaces, newest first; this preview has no pagination or server-side list filters.</p>
      <table className="docs-data-table"><caption>Workspace endpoints</caption><thead><tr><th scope="col">Method and path</th><th scope="col">Behavior</th></tr></thead><tbody>
        {workspaceOperations.map(([method, path, behavior]) => <tr key={path + method}><th scope="row"><code>{method} {path}</code></th><td>{behavior}</td></tr>)}
      </tbody></table>
      <p>Attach at sandbox creation through <code>POST /v1/sandboxes</code> with <code>workspaceId</code> and a template. A running sandbox cannot switch workspaces. There is no rename, resize, detach, unarchive or physical-delete workspace endpoint.</p>
      <pre>{`curl --fail-with-body "$HARAKIRI_API_URL/v1/workspaces" \\
  -H "x-api-key: $HARAKIRI_API_KEY" \\
  -H 'Content-Type: application/json' \\
  --data '{"name":"agent-project"}'`}</pre>
    </section>
    <section><h2>Parameters and responses</h2>
      <p>Create accepts only <code>name</code>: trimmed, 1 to 80 characters, beginning with a Unicode letter or number. Subsequent characters may be letters, numbers, spaces, periods, underscores or hyphens. Names must be unique within the organization, including archived records. Do not add size, class or provider fields: the request schema is strict.</p>
      <dl className="docs-definitions">
        <div><dt><code>id</code>, <code>name</code></dt><dd>Stable public <code>wsp_...</code> ID and display name. Use the ID for lookups and attachment.</dd></div>
        <div><dt><code>sizeGiB</code>, <code>mountPath</code></dt><dd>Configured capacity, not used bytes; mountPath is always <code>/workspace</code>.</dd></div>
        <div><dt><code>status</code></dt><dd>One of <code>available</code>, <code>attached</code>, <code>releasing</code>, <code>recovery_required</code> or <code>archived</code>. See the <a href="#docs/workspaces">lifecycle definitions</a>.</dd></div>
        <div><dt><code>attachedSandboxId</code></dt><dd>The owning Harakiri sandbox ID, or null. A failed or terminated owner may remain until reconciliation is safe.</dd></div>
        <div><dt><code>storageRequested</code></dt><dd>Whether first provisioning was attempted. True does not prove the volume exists, is mounted or is healthy.</dd></div>
        <div><dt><code>createdAt</code>, <code>updatedAt</code>, <code>archivedAt</code></dt><dd>ISO timestamps. archivedAt is null until logical archive.</dd></div>
      </dl>
      <p>The list response's <code>policy</code> contains <code>available</code>, a nullable <code>reason</code>, <code>sizeGiB</code>, <code>maxPerOrganization</code>, <code>mountPath</code>, <code>retention: "until_operator_reclaims"</code> and <code>physicalDeletion: false</code>. Read existing records even when new creation is unavailable. Policy availability is not a live storage health probe.</p>
    </section>
    <section><h2>SDK methods</h2>
      <pre>{`const { workspaces, policy } = await client.workspaces.list();
const { workspace } = await client.workspaces.create({ name: "agent-project" });
const inspected = await client.workspaces.get(workspace.id);
const { sandbox } = await client.createSandbox({
  template: "python-3.12", workspaceId: workspace.id, ttlSeconds: 600
});
await client.waitForSandbox(sandbox.id);
// Run work, then terminate and wait for workspace.status === "available".
await client.killSandbox(sandbox.id);
// Only after release:
// await client.workspaces.archive(workspace.id);`}</pre>
      <p>These are method examples; the <a href="#docs/persistent-workspaces">complete tutorial</a> includes the client setup, bounded release polling, assertions and cleanup. <code>commands.stream(sandboxId, commandId, {"{ cursor, signal }"})</code> observes a tracked command, not a workspace. Resume the same command ID; never start it again merely to reconnect.</p>
    </section>
    <section><h2>CLI commands</h2>
      <pre>{`harakiri workspace create --name agent-project --json
harakiri workspace list --json
harakiri workspace inspect wsp_...
harakiri create --template python-3.12 --workspace wsp_... --ttl 600
# After sandbox termination and confirmed release:
harakiri workspace archive wsp_... --retain-storage`}</pre>
      <p>Create and list accept <code>--json</code>; inspect prints JSON. Archive requires <code>--retain-storage</code> as an explicit acknowledgment, not a deletion option. List includes policy in JSON output. The CLI uses the same organization-scoped API contract.</p>
    </section>
    <section><h2>Errors and recovery</h2>
      <table className="docs-data-table"><caption>Common workspace errors</caption><thead><tr><th scope="col">HTTP and code</th><th scope="col">Next action</th></tr></thead><tbody>
        {errors.map(([status, code, action]) => <tr key={code}><th scope="row">{status}<br /><code>{code}</code></th><td>{action}</td></tr>)}
      </tbody></table>
      <p>A timeout or provider failure does not prove that a runtime was never created. Inspect the workspace and sandbox operation, then follow <a href="#docs/workspace-operations">operator recovery</a>. Do not force-clear reservations or silently substitute a new empty workspace.</p>
      <WorkspaceReleaseNote />
    </section>
  </div>
};
