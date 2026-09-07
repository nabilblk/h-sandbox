import type { DocPage } from "./docs-content";

export const WorkspaceReleaseNote = () => <aside className="docs-notice" aria-label="Release availability">
  <p><strong>Preview: 0.5.0-rc.2.</strong> Persistent storage is opt-in and requires matching API, scheduler, SDK and CLI versions. Stable 0.4.0 does not include it. k0s acceptance has passed; restricted OpenShift acceptance is pending.</p>
  <p>At this candidate's release, npm publication was still pending. See <a href="#docs/workspace-reference">Distribution and prerequisites</a> before installing. A known TTL-renewal issue can end a sandbox at its original deadline; use a sufficient initial TTL for bounded tests.</p>
</aside>;

export const workspaceStates = [
  ["available", "No sandbox owns the reservation. A compatible sandbox in the same organization can attach."],
  ["attached", "One sandbox owns the reservation, including while provisioning or paused. Another sandbox cannot attach."],
  ["releasing", "The sandbox has terminated, but runtime absence and lifecycle cleanup have not yet been confirmed."],
  ["recovery_required", "An errored sandbox still owns the reservation. An operator must reconcile an uncertain runtime outcome."],
  ["archived", "The detached workspace has been retired. New attachment is rejected; files and quota remain retained."]
] as const;

export const workspaceDocs: DocPage = {
  id: "workspaces",
  section: "Concepts",
  title: "Workspaces",
  lede: "A workspace keeps project files beyond the lifetime of the sandbox that uses them.",
  toc: ["The storage and runtime model", "When to use a workspace", "Ownership and isolation", "Lifecycle", "What persists", "Retention and limits", "Next steps"],
  body: <div className="workspace-doc">
    <section><h2>The storage and runtime model</h2>
      <p>A <strong>sandbox</strong> is an isolated runtime: processes, memory and a runtime filesystem. A <strong>workspace</strong> is organization-owned persistent storage mounted at <code>/workspace</code>. Replacing a sandbox does not replace its workspace. Integrations keep a <code>wsp_...</code> ID and attach it when creating a new sandbox.</p>
      <figure className="workspace-model">
        <ol>
          <li><strong>Sandbox A</strong><span>Writes a checkpoint, then terminates</span></li>
          <li><strong>Workspace</strong><span>Retains the project files</span></li>
          <li><strong>Sandbox B</strong><span>Attaches later and reads the checkpoint</span></li>
        </ol>
        <figcaption>Two runtime lifetimes. One workspace. Never two simultaneous sandbox owners.</figcaption>
      </figure>
      <dl className="docs-definitions">
        <div><dt>Organization</dt><dd>The team, membership and authorization boundary. It owns workspaces and sandboxes. Some older screens call this a team workspace; it is not a persistent storage resource.</dd></div>
        <div><dt>Template</dt><dd>The image and runtime defaults used to create a sandbox. It does not hold the workspace's evolving project files.</dd></div>
        <div><dt>Snapshot</dt><dd>A separate provider lifecycle mechanism. This preview does not support snapshots of workspace-backed sandboxes or attaching a workspace during snapshot restore.</dd></div>
        <div><dt>Command session</dt><dd>An execution context for command working directory and environment, not retained file storage or a replacement for a workspace.</dd></div>
      </dl>
    </section>
    <section><h2>When to use a workspace</h2>
      <p>Use one when a code agent revisits a repository, a job checkpoints intermediate results, or a developer resumes work in a replacement runtime. Reuse is sequential: an application releases its old sandbox before attaching the same files to a new one.</p>
      <p>Use an ordinary ephemeral sandbox for disposable execution. Download finished artifacts when you only need the result. A workspace is not shared writable storage for parallel agents, a public file share or a credential store.</p>
    </section>
    <section><h2>Ownership and isolation</h2>
      <p>Workspace operations are scoped to the caller's authenticated organization. A workspace is not private to its creator and does not grant new membership or a separate per-workspace ACL. Use the organization's access controls and treat retained files as organization data.</p>
      <p>Harakiri atomically reserves a workspace for one sandbox. A competing attachment is rejected rather than sharing the mount. Pause retains that reservation. Unknown provider outcomes also keep it reserved; an error is not permission to start a second writer.</p>
      <p>Clients use Harakiri IDs, not PVC names, node paths or provider IDs. Storage class, size and provider compatibility are controlled by the operator. Allocation does not start a sandbox: backing storage is requested on first attachment.</p>
    </section>
    <section><h2>Lifecycle</h2>
      <table className="docs-data-table"><caption>Workspace states</caption><thead><tr><th scope="col">State</th><th scope="col">Meaning</th></tr></thead><tbody>
        {workspaceStates.map(([status, meaning]) => <tr key={status}><th scope="row"><code>{status}</code></th><td>{meaning}</td></tr>)}
      </tbody></table>
      <p>The usual path is <code>available</code>, <code>attached</code>, <code>releasing</code>, then <code>available</code> again. Termination may complete quickly enough that a reader does not observe Releasing. Wait for Available before attaching a replacement; an accepted kill request alone is insufficient.</p>
      <p>Archive is allowed only after the reservation is released. It is a logical retirement, not a backup, unmount shortcut or delete-volume operation. There is no public unarchive, force-detach or physical-delete operation in this preview.</p>
    </section>
    <section><h2>What persists</h2>
      <p>Files written under the mounted <code>/workspace</code> survive sandbox termination and can be read by a replacement. Process memory, running jobs and shell state do not become persistent just because their working directory is a workspace. Files elsewhere in the sandbox are outside this storage contract.</p>
      <p>The mount hides image files already present at <code>/workspace</code>; it does not copy or seed them. Initialize the workspace explicitly. Installing a system package outside that path does not make the package part of the workspace. Check runtime and filesystem compatibility before changing templates.</p>
      <p>Command reconnection observes the same running command through retained provider logs. It neither recreates a terminated process nor guarantees logs remain available after sandbox deletion. Persist checkpoints or download artifacts separately.</p>
    </section>
    <section><h2>Retention and limits</h2>
      <p>Creating a workspace consumes an organization allocation slot. Its configured capacity is not a measurement of used bytes. Archiving, sandbox TTL expiry and manual volume reclamation do not automatically free that slot.</p>
      <p>Durability, encryption, backups and disaster recovery depend on the operator's storage system. A local-path volume is not protection against node loss. Back up project files as well as control-plane metadata.</p>
      <p>Keep long-lived secrets in <a href="#docs/credential-vault">Credential Vault</a>. Revocation cannot erase credentials that an agent has copied into ordinary files, logs or backups. Persistent storage does not change sandbox egress policy or grant cluster access.</p>
      <WorkspaceReleaseNote />
    </section>
    <section><h2>Next steps</h2>
      <ul>
        <li><a href="#docs/persistent-workspaces">Tutorial: reuse files across sandboxes</a>, with dashboard steps and a complete SDK scenario.</li>
        <li><a href="#docs/workspace-reference">Workspace API, SDK and CLI</a> for operations, parameters, policy and errors.</li>
        <li><a href="#docs/workspace-operations">Persistent storage operations</a> for enablement, retention, recovery and backup.</li>
      </ul>
    </section>
  </div>
};
