import type { DocPage } from "./docs-content";
import { WorkspaceReleaseNote } from "./workspace-docs";

export const workspaceOperationsDocs: DocPage = {
  id: "workspace-operations",
  section: "Operations",
  title: "Persistent storage operations",
  lede: "Enable a storage profile deliberately, preserve attachment ownership, and plan recovery before retaining project data.",
  toc: ["Enable a storage profile", "Validate the installation", "Retention and reclamation", "Recover an uncertain attachment", "Backup and restore", "Disable or roll back"],
  body: <div className="workspace-doc">
    <WorkspaceReleaseNote />
    <section><h2>Enable a storage profile</h2>
      <p>Back up PostgreSQL and apply migration <code>035_persistent_workspaces.sql</code> before enabling creation. API and scheduler must both understand workspace reservations. Use the same configuration and native OpenSandbox provider, with fallback disabled.</p>
      <pre>{`config:
  PERSISTENT_WORKSPACES_ENABLED: "1"
  WORKSPACE_STORAGE_CLASS: "your-approved-rwo-class"
  WORKSPACE_SIZE_GIB: "10"
  WORKSPACE_MAX_PER_ORGANIZATION: "20"
  OPEN_SANDBOX_ALLOW_FALLBACK: "0"`}</pre>
      <p>Replace the example storage class with one approved for your cluster. A blank class uses the cluster default. Size is an integer from 1 to 1,024 GiB; allocation limit is 1 to 1,000 records per organization. Capacity and storage class are captured when a workspace is created; changing defaults does not resize or migrate existing workspaces.</p>
      <p>OpenSandbox must be allowed to provision and mount PVCs in its runtime namespace. Harakiri does not create StorageClasses, accept arbitrary host paths, grant SCCs or bypass OpenShift security. The tested native contract uses OpenSandbox server v0.2.3. An arbitrary-UID image smoke alone does not prove a mounted volume is writable.</p>
    </section>
    <section><h2>Validate the installation</h2>
      <ol>
        <li>Check that <code>GET /v1/workspaces</code> reports <code>policy.available: true</code> and the expected capacity and quota.</li>
        <li>Run <a href="#docs/persistent-workspaces">the checkpoint and reconnect tutorial</a> through Harakiri on the actual runtime and storage class.</li>
        <li>Confirm a competing sandbox cannot attach, and that pause retains exclusive ownership. Wait for Available after termination before replacement.</li>
        <li>On OpenShift, test the real assigned UID and approved fsGroup permissions. Validate each template/architecture used by the installation.</li>
        <li>Exercise provider unavailability and verify failure stays explicit, without fallback execution or an empty replacement volume.</li>
      </ol>
      <p>Metadata availability and <code>storageRequested</code> are not health checks. Provisioning happens on the first attachment; verify real write/read behavior. Version 0.5.0-rc.3 corrects renewal/scheduler coordination: stop the old scheduler, apply migration 036, then deploy the matching API and scheduler. Verify renewal beyond the original deadline after upgrading.</p>
    </section>
    <section><h2>Retention and reclamation</h2>
      <p>Sandbox termination retains mounted project files. Archive retires a detached workspace, but does not remove its PVC or free its allocation slot. Harakiri exposes no physical volume-delete endpoint in this preview.</p>
      <ol>
        <li>Obtain data-owner approval and confirm retention/backup requirements.</li>
        <li>Confirm the workspace is archived, detached and has no queued or running lifecycle operation.</li>
        <li>Resolve its generated private volume reference through the restricted operator metadata lookup.</li>
        <li>Confirm no provider sandbox mounts it, then delete only that approved PVC using your normal storage tooling.</li>
        <li>Check PV reclaim policy and backing storage. Record the outcome; PVC deletion alone does not establish secure erasure.</li>
      </ol>
      <p>Allocation slots are not automatically recycled after manual reclamation. A reviewed quota increase or audited metadata-retention procedure is still required. Do not implement deletion by launching a cleanup sandbox or removing arbitrary claims.</p>
    </section>
    <section><h2>Recover an uncertain attachment</h2>
      <p><code>releasing</code> means termination is recorded but provider absence or operation completion is not yet confirmed. <code>recovery_required</code> means an errored sandbox still owns the reservation. Start with the workspace record, sandbox operation, scheduler diagnostics and provider API.</p>
      <p>An ambiguous create may have produced a real runtime. Keep the reservation, inspect provider metadata for the Harakiri sandbox ID and terminate any confirmed orphan through the provider API. If a known provider ID can be associated with the failed sandbox, the reconciler can release it after confirmed absence.</p>
      <p>If no runtime ever existed, recovery may require approved, audited metadata repair. Stop relevant lifecycle workers while repairing; record before/after evidence. Never treat a timeout as proof of absence or blindly replay creation.</p>
      <p>If previously provisioned storage disappears, attachment fails instead of recreating an empty volume. Restore its data from a valid backup or make an explicit data-loss decision and allocate a new workspace. Do not reset the first-provision marker to bypass the failure.</p>
    </section>
    <section><h2>Backup and restore</h2>
      <p>Back up two distinct things: PostgreSQL contains ownership/reservations and workspace IDs; the storage system contains project files. A database dump does not back up a PVC. Coordinate the recovery points, quiesce writers as needed and test the restoration procedure.</p>
      <p>Harakiri runtime snapshots do not cover persistent workspaces in this preview. Snapshot creation for attached workspaces and snapshot restore with a workspace ID are rejected. Storage backups and restore belong to the operator's approved system. A single-node local-path volume offers no node-loss guarantee.</p>
      <p>Set data classification, encryption and retention policies for files and backups. Vault revocation does not erase credentials that an agent already copied into retained files.</p>
    </section>
    <section><h2>Disable or roll back</h2>
      <p>Migration 035 is additive. Do not discard workspace metadata with a down-migration while volumes or reservations exist. Keep compatible API/scheduler versions together. A 0.4.0 worker does not understand workspace ownership.</p>
      <p>Complete in-flight cleanup with compatible workers before disabling workspace reconciliation. The feature flag gates creation/attachment and the workspace reconciler; it is not an automatic drain or storage deletion switch. Preserve unresolved reservations.</p>
      <p>A rollback must account for both metadata and retained files at a coherent recovery point. Never infer a tested restore from a readable backup catalog. Return to <a href="#docs/workspaces">the workspace lifecycle</a> and <a href="#docs/workspace-reference">API error handling</a> for the public behavior callers should see.</p>
    </section>
  </div>
};
