import type { DocPage } from "./docs-content";
import { CodeBlock } from "./components/docs-code";

const evidence = "https://github.com/nabilblk/h-sandbox/blob/main/docs/operations/evidence/standalone-34659892741.json";
const runbook = "https://github.com/nabilblk/h-sandbox/blob/main/docs/operations/standalone-recovery.md";

export const recoveryCommands = {
  backup: `: "\${SOURCE_KUBECONFIG:?Set the approved source kubeconfig}"
: "\${SOURCE_CLUSTER_UID:?Set the independently recorded source cluster UID}"
test -f "$SOURCE_KUBECONFIG" || exit 1
test "$(kubectl --kubeconfig "$SOURCE_KUBECONFIG" \\
  get namespace kube-system -o jsonpath='{.metadata.uid}')" \\
  = "$SOURCE_CLUSTER_UID" || exit 1
umask 077
mkdir recovery-point
kubectl --kubeconfig "$SOURCE_KUBECONFIG" -n harakiri-preview \\
  exec deployment/preview-postgres -- \\
  pg_dump -U postgres -d harakiri -Fc --no-owner --no-acl \\
  > recovery-point/harakiri.dump
kubectl --kubeconfig "$SOURCE_KUBECONFIG" -n harakiri-preview \\
  exec deployment/preview-postgres -- \\
  pg_dump -U postgres -d keycloak -Fc --no-owner --no-acl \\
  > recovery-point/keycloak.dump
kubectl --kubeconfig "$SOURCE_KUBECONFIG" -n harakiri-preview \\
  get secrets,configmaps,deployments -o json \\
  > recovery-point/operator-state.json`,
  restore: `: "\${SOURCE_CLUSTER_UID:?Set the recorded source cluster UID}"
: "\${TARGET_KUBECONFIG:?Set the approved disposable target kubeconfig}"
: "\${TARGET_CLUSTER_UID:?Set the independently recorded target cluster UID}"
test -f "$TARGET_KUBECONFIG" || exit 1
test "$TARGET_CLUSTER_UID" != "$SOURCE_CLUSTER_UID" || exit 1
test "$(kubectl --kubeconfig "$TARGET_KUBECONFIG" \\
  get namespace kube-system -o jsonpath='{.metadata.uid}')" \\
  = "$TARGET_CLUSTER_UID" || exit 1
kubectl --kubeconfig "$TARGET_KUBECONFIG" -n harakiri-preview \\
  exec -i deployment/preview-postgres -- \\
  pg_restore --exit-on-error --no-owner --no-acl -U postgres \\
  --role harakiri -d harakiri < recovery-point/harakiri.dump
kubectl --kubeconfig "$TARGET_KUBECONFIG" -n harakiri-preview \\
  exec -i deployment/preview-postgres -- \\
  pg_restore --exit-on-error --no-owner --no-acl -U postgres \\
  --role keycloak -d keycloak < recovery-point/keycloak.dump`
};

export const recoveryDocs: DocPage = {
  id: "backup-recovery", section: "Self-hosting", title: "Backup and recovery",
  lede: "Recover the control plane, identities, retained files and encrypted credentials together. A healthy pod is not proof that an agent can resume useful work.",
  toc: ["What to protect", "What has been verified", "Capture a coherent recovery point", "Restore into an isolated target", "Prove recovery", "Provider interruption", "Upgrade and rollback"],
  body: <>
    <h2>What to protect</h2>
    <p>Start with <a href="#docs/install-kubernetes">Install on Kubernetes</a>. Recovery is an operator responsibility: Harakiri retains product state, but does not automatically back up your cluster. A workspace retains files, not processes or memory.</p>
    <table className="docs-data-table"><caption>Four parts of one recovery point</caption><thead><tr><th scope="col">State</th><th scope="col">Preserve</th></tr></thead><tbody>
      <tr><td>Harakiri database</td><td>Organizations, permissions, key hashes, templates, operations, capacity reservations, workspace references and encrypted Vault rows.</td></tr>
      <tr><td>Keycloak database</td><td>Users, password hashes, realms, clients and signing configuration. A realm import is not a database backup.</td></tr>
      <tr><td>Workspace storage</td><td>Retained files, ownership, permissions and the volume identity referenced by the database. Database dumps do not contain these files.</td></tr>
      <tr><td>Operator configuration</td><td>Public origins, chart/image versions, database credentials, runtime settings and every wrapping-key version needed by retained backups.</td></tr>
    </tbody></table>
    <aside className="docs-notice"><p><strong>A new key does not recover old ciphertext.</strong> Back up wrapping keys separately through an approved secret-management process. Keep older versions while any retained backup depends on them. Recovery of KMS, external secret stores or short-lived credential issuers needs its own tested procedure.</p></aside>

    <h2>What has been verified</h2>
    <p>Published <code>0.5.0-rc.9</code> passed all seven configured acceptance gates on a fresh Linux amd64, k0s 1.36.3, local-path fixture. The tests used real browser OIDC and published SDK/CLI packages, not the development provider. The <a href={evidence}>retained receipt</a> records the exact artifacts and checks; <a href="https://github.com/nabilblk/h-sandbox/actions/runs/34661147374">the final repeat</a> also passed.</p>
    <table className="docs-data-table"><caption>Verified outcomes and their boundaries</caption><thead><tr><th scope="col">Scenario</th><th scope="col">Observed result</th></tr></thead><tbody>
      <tr><td>Database and file loss</td><td>Both databases restored onto new storage, source database stopped, workspace restored into an empty replacement volume. Identity, API key and file checksums survived.</td></tr>
      <tr><td>Encrypted credential recovery</td><td>Missing and wrong wrapping keys rejected attachment without rewriting the envelope. The correct key restored real HTTPS credential injection.</td></tr>
      <tr><td>Provider interruption</td><td>A running command survived a control-plane restart. Execution capacity and workspace ownership stayed reserved; the command was not duplicated.</td></tr>
      <tr><td>Lost provider credential state</td><td>Inspection detected the missing binding. Explicit Harakiri rehydration restored credential use without replacing the runtime.</td></tr>
      <tr><td>Configuration rollback and cleanup</td><td>A same-release Helm change and rollback retained files, keys and admission. Key revocation, OIDC logout and private test-material cleanup passed.</td></tr>
    </tbody></table>
    <p>This is not HA, arbitrary CSI, full-cluster disaster recovery, restricted OpenShift or cross-release/schema rollback certification. The database restore was rehearsed on replacement storage inside the disposable cluster; it did not restore a live, ambiguous runtime inventory into another provider. Native OpenCode execution was model-free, not an LLM inference test.</p>

    <h2>Capture a coherent recovery point</h2>
    <ol>
      <li>Approve the source identity and maintenance window. Record namespaces, cluster UID, versions, storage class and reclaim policy. Store kubeconfigs privately.</li>
      <li>Stop task producers and terminate the intended runtimes through Harakiri. Wait for authoritative runtime absence, execution-slot release and workspace detachment. A terminated label alone is not enough.</li>
      <li>Drain lifecycle operations and template builds. Record replica counts, then stop API, scheduler, template-builder and Keycloak writers; confirm their pods are gone.</li>
      <li>Capture both databases, detached workspace files, operator settings and wrapping keys from that quiesced point. Keep writers stopped until the capture is coherent.</li>
    </ol>
    <p>After those checks, the reference PostgreSQL backup commands are below. They operate on the database deployment, never inside a sandbox. Managed PostgreSQL and other namespaces require their own reviewed backup roles and commands.</p>
    <CodeBlock language="bash" filename="Reference database backup">{recoveryCommands.backup}</CodeBlock>
    <p>Archive the detached workspace using your storage provider's approved procedure and record its checksum alongside the database archives. The native fixture used a detached volume archive helper; this is not a portable CSI snapshot. See <a href="#docs/workspace-operations">workspace operations</a> for attachment and retention rules.</p>
    <aside className="docs-notice"><p><strong>These archives are sensitive and not encrypted.</strong> File permissions do not encrypt backups. Use your approved encrypted backup system before transfer or retention. Never attach archives, Secrets, raw Helm values or browser state to public issues or CI artifacts.</p></aside>

    <h2>Restore into an isolated target</h2>
    <p>For your rehearsal, use a disposable target with a different cluster UID from the source. Keep application writers stopped, provision empty compatible databases and recreate the same database roles before importing. The commands below deliberately reject the source cluster.</p>
    <CodeBlock language="bash" filename="Reference database restore">{recoveryCommands.restore}</CodeBlock>
    <ol>
      <li>Restore files into empty storage with the volume identity expected by the restored database. Preserve ownership and permissions; verify node affinity for local storage.</li>
      <li>Restore reviewed settings and the required wrapping keys. An operator-state JSON export is inventory, not a manifest to apply blindly.</li>
      <li>Repoint private database/provider endpoints deliberately. Preserve the public OIDC issuer where applicable, or configure the target's new origin and redirects explicitly. Never let two control planes manage the same runtime inventory.</li>
      <li>Start Keycloak, then compatible Harakiri writers. Reconcile any outstanding runtime inventory before admitting new work. Do not force-unlock storage, clear reservations or replace missing retained data with an empty volume.</li>
    </ol>
    <p>The <a href={runbook}>technical recovery runbook</a> provides the operator sequence and qualification boundaries. Destructive volume deletion and missing-key fault injection belong only in an owned disposable fixture.</p>

    <h2>Prove recovery</h2>
    <ul>
      <li>Sign in through normal browser OIDC and verify the original user and organization. Confirm a retained scoped key works and its later revocation is enforced.</li>
      <li>Create a replacement runtime and read the expected workspace bytes with the original checksum and working directory. Surviving source storage must not satisfy the check.</li>
      <li>Use a recovered encrypted Vault source against an approved HTTPS upstream. A metadata row is insufficient; actual injection must work without exposing the source value in environment variables, command text or API output.</li>
      <li>In the isolated fixture, test missing and incorrect wrapping material. Both must reject attachment, install no credential and leave ciphertext unchanged. Restore the correct key and verify use again.</li>
      <li>Terminate owned test runtimes, confirm slot/storage release, revoke test keys and remove private test material. Keep durable backups according to your retention policy.</li>
    </ul>
    <p>Record exact versions, architecture, storage driver, checksums, failed attempts and cleanup outcome. Measure your own recovery duration and recovery-point age before setting an RTO or RPO; the hosted lab has no uptime SLA.</p>

    <h2>Provider interruption</h2>
    <p>Unreachable is not absent. Keep execution reservations and workspace ownership while the provider is unavailable. Reconcile when it returns; do not replay an ambiguous command or create just because an HTTP request timed out. See <a href="#docs/execution-capacity">execution capacity</a> for inventory activation and recovery.</p>
    <p>Credential desired state can outlive a provider binding. Inspect through Harakiri, then explicitly rehydrate a missing binding when supported. The acceptance run proved that API path, not every background reconciliation timer or automatic process recovery. See <a href="#docs/credential-vault">Credential Vault</a>.</p>

    <h2>Upgrade and rollback</h2>
    <p><strong>Same-release configuration rollback is verified; cross-release/schema rollback remains untested.</strong> Before changing application versions, select two explicit compatible release identities, review migrations, preserve operator values and keys, and rehearse with existing state in isolation.</p>
    <p>Do not reopen pre-capacity rc.8 writers against migration 038. An older chart revision is not proof of a safe downgrade. Do not use <code>--reuse-values</code> in place of reviewing configuration, regenerate credentials, or remove workspace/Vault metadata needed by retained backups.</p>
    <p>Use <a href="#docs/developer-preview">the supported preview profile</a> and <a href="https://github.com/nabilblk/h-sandbox/blob/main/docs/release-notes/0.5.0-rc.9.md">the rc.9 migration notes</a>. A documentation-only web image does not establish a new compatible application-release pair.</p>
  </>
};
