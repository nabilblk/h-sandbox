import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { check, sha256 } from "./context.mjs";
import { applyOwned, get, literalId, platformNamespace, postgres, query, removeVolumePod, replicas, runtimeNamespace, volumePod, writers } from "./operator.mjs";
import { assertRetained, createRuntime, released } from "./workload.mjs";
import { assertCredentialBoundary, credentialFixture, probeCredential } from "./credential-fixture.mjs";

function envelopeFingerprint(ctx, secretId, deployment = "preview-postgres") {
  const text = query(ctx, `SELECT json_build_array(id, encryption_scheme, key_id, secret_ciphertext, secret_iv, secret_tag, wrapped_dek_ciphertext, wrapped_dek_iv, wrapped_dek_tag) FROM workspace_credential_secrets WHERE id = ${literalId(secretId)} AND deleted_at IS NULL;`, deployment);
  const row = JSON.parse(text);
  check(row[0] === secretId && row[1] === "envelope-v1" && row.slice(2).every(Boolean), "Recovery fixture has no complete encrypted envelope");
  return sha256(text);
}

function archiveOperation(ctx, name, args, options = {}) {
  check(["acceptance-volume-read", "acceptance-volume-write"].includes(name), "Unexpected archive pod");
  return ctx.k(["-n", runtimeNamespace, "exec", ...(options.input ? ["-i"] : []), name, "--", ...args], { ...options, label: "Detached operator volume archive" });
}

function restoreDatabases(ctx) {
  const name = "acceptance-recovered-postgres";
  const source = get(ctx, "deployment", "preview-postgres");
  const spec = structuredClone(source.spec);
  spec.selector.matchLabels = { app: name };
  spec.template.metadata = { labels: { app: name } };
  spec.template.spec.volumes.find(item => item.name === "data").persistentVolumeClaim.claimName = name;
  spec.template.spec.containers[0].readinessProbe.exec.command = ["pg_isready", "-h", "127.0.0.1", "-U", "postgres"];
  applyOwned(ctx, { apiVersion: "v1", kind: "List", items: [
    { apiVersion: "v1", kind: "PersistentVolumeClaim", metadata: { name, namespace: platformNamespace }, spec: { accessModes: ["ReadWriteOnce"], storageClassName: "local-path", resources: { requests: { storage: "5Gi" } } } },
    { apiVersion: "apps/v1", kind: "Deployment", metadata: { name, namespace: platformNamespace }, spec },
    { apiVersion: "v1", kind: "Service", metadata: { name, namespace: platformNamespace }, spec: { selector: { app: name }, ports: [{ port: 5432, targetPort: 5432 }] } }
  ] }, "recovered-postgres.json");
  ctx.k(["-n", platformNamespace, "rollout", "status", `deployment/${name}`, "--timeout=300s"]);
  for (const database of ["harakiri", "keycloak"]) {
    const tables = query(ctx, "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';", name, database);
    check(tables === "0", "Restore target is not empty");
    const archive = fs.readFileSync(ctx.file(`${database}.dump`));
    check(sha256(archive) === ctx.read("backup.json").files[`${database}.dump`], "Database backup checksum mismatch");
    postgres(ctx, ["pg_restore", "--exit-on-error", "--no-owner", "--no-acl", "-U", "postgres", "--role", database, "-d", database], { deployment: name, input: archive });
  }
  check(get(ctx, "pvc", name).metadata.uid !== get(ctx, "pvc", "preview-postgres").metadata.uid, "Database restore reused the source volume");
  return name;
}

async function restoreVolume(ctx, backup) {
  const old = get(ctx, "pvc", backup.claim, runtimeNamespace);
  check(old.metadata.uid === backup.claimUid, "Workspace volume changed since backup");
  const archive = fs.readFileSync(ctx.file("workspace.tar"));
  check(sha256(archive) === backup.files["workspace.tar"], "Workspace backup checksum mismatch");
  // The source data is deliberately removed only in this owned disposable cluster.
  ctx.k(["-n", runtimeNamespace, "delete", "pvc", backup.claim, "--wait=true", "--timeout=120s"]);
  applyOwned(ctx, { apiVersion: "v1", kind: "PersistentVolumeClaim", metadata: { name: backup.claim, namespace: runtimeNamespace }, spec: {
    accessModes: old.spec.accessModes, storageClassName: old.spec.storageClassName, volumeMode: old.spec.volumeMode,
    resources: { requests: old.spec.resources.requests }
  } }, "restored-workspace-pvc.json");
  await volumePod(ctx, backup.claim, "acceptance-volume-write", false);
  check(get(ctx, "pvc", backup.claim, runtimeNamespace).metadata.uid !== backup.claimUid, "Workspace restore reused the old PVC");
  check(archiveOperation(ctx, "acceptance-volume-write", ["find", "/restore", "-mindepth", "1"]).trim() === "", "Workspace restore destination was not empty");
  archiveOperation(ctx, "acceptance-volume-write", ["tar", "-C", "/restore", "-xpf", "-"], { input: archive });
  removeVolumePod(ctx, "acceptance-volume-write");
}

function configureRestoredDatabases(ctx, deployment) {
  const secrets = ctx.read("secrets.json");
  const api = secrets.items.find(item => item.metadata.name === "preview-api");
  const database = new URL(api.stringData.DATABASE_URL);
  database.hostname = deployment;
  api.stringData.DATABASE_URL = database.toString();
  const keycloak = secrets.items.find(item => item.metadata.name === "preview-keycloak");
  const jdbc = new URL(keycloak.stringData.KC_DB_URL.slice("jdbc:".length));
  jdbc.hostname = deployment;
  keycloak.stringData.KC_DB_URL = `jdbc:${jdbc}`;
  applyOwned(ctx, { apiVersion: "v1", kind: "List", items: [api, keycloak] }, "restored-secrets.json");
}

async function setWrappingKey(ctx, value) {
  await replicas(ctx, writers, 0);
  const secret = get(ctx, "secret", "preview-api");
  if (value === null) delete secret.data.CREDENTIAL_VAULT_KEY;
  else secret.data.CREDENTIAL_VAULT_KEY = Buffer.from(value).toString("base64");
  delete secret.metadata.managedFields;
  ctx.save("key-case.json", secret);
  // Replace uses the current resourceVersion, including removal of an absent key.
  ctx.k(["replace", "-f", ctx.file("key-case.json")]);
  await replicas(ctx, writers, 1);
  await ctx.forward("harakiri-api", 28482, 8080);
}

export async function recovery(ctx, operator, state) {
  const { client } = operator;
  const secretId = await credentialFixture(ctx, client);
  const first = await createRuntime(client, state, "vault-before-backup");
  await probeCredential(client, first, false);
  await client.credentials.attachSecret(first, secretId);
  await probeCredential(client, first, true);
  await assertCredentialBoundary(ctx, client, first);
  await released(client, first, state.workspaceId);
  await operator.logout();
  const held = (await client.capacity()).capacity.inUse;
  const workspace = (await client.workspaces.get(state.workspaceId)).workspace;
  check(held === 0 && workspace.attachedSandboxId === null, "Cannot back up active execution or attached storage");
  const jobs = JSON.parse(ctx.k(["-n", platformNamespace, "get", "jobs", "-o", "json"]));
  check(jobs.items.every(job => !job.status.active), "Cannot back up with active template jobs");
  await replicas(ctx, [...writers, "preview-keycloak"], 0);
  const files = {};
  for (const database of ["harakiri", "keycloak"]) {
    const bytes = postgres(ctx, ["pg_dump", "-U", "postgres", "-d", database, "-Fc", "--no-owner", "--no-acl"], { binary: true });
    ctx.save(`${database}.dump`, bytes);
    files[`${database}.dump`] = sha256(bytes);
  }
  const claim = query(ctx, `SELECT provider_volume_name FROM persistent_workspaces WHERE id = ${literalId(state.workspaceId)} AND attached_sandbox_id IS NULL;`);
  check(/^harakiri-wsp-[a-f0-9-]+$/.test(claim), "No detached owned workspace volume found");
  const claimUid = get(ctx, "pvc", claim, runtimeNamespace).metadata.uid;
  await volumePod(ctx, claim, "acceptance-volume-read", true);
  const archive = archiveOperation(ctx, "acceptance-volume-read", ["tar", "-C", "/restore", "-cf", "-", "."], { binary: true });
  ctx.save("workspace.tar", archive);
  files["workspace.tar"] = sha256(archive);
  removeVolumePod(ctx, "acceptance-volume-read");
  for (const name of ["secrets.json", "harakiri-values.json", "opensandbox-values.json", "operator-login.json", "recovery-login.json"]) files[name] = sha256(fs.readFileSync(ctx.file(name)));
  ctx.save("live-operator-state.json", ctx.k(["-n", platformNamespace, "get", "secrets,configmaps,deployments", "-o", "json"]));
  files["live-operator-state.json"] = sha256(fs.readFileSync(ctx.file("live-operator-state.json")));
  const fingerprint = envelopeFingerprint(ctx, secretId);
  const backup = { recoveryPoint: new Date().toISOString(), files, claim, claimUid, secretId, envelopeSha256: fingerprint };
  ctx.save("backup.json", backup);
  const target = restoreDatabases(ctx);
  check(envelopeFingerprint(ctx, secretId, target) === fingerprint, "Encrypted source changed in database restoration");
  await replicas(ctx, ["preview-postgres"], 0);
  await restoreVolume(ctx, backup);
  configureRestoredDatabases(ctx, target);
  await replicas(ctx, ["preview-keycloak", ...writers], 1);
  await ctx.forwardAll();
  const restoredAccount = await operator.login();
  const identity = ctx.read("account.json");
  check(restoredAccount.user.id === identity.userId && restoredAccount.organization.id === identity.organizationId, "OIDC or organization identity changed after recovery");
  check((await client.capacity()).capacity.limit === 1, "Restored organization policy was lost");
  const correctKey = ctx.read("secrets.json").items.find(item => item.metadata.name === "preview-api").stringData.CREDENTIAL_VAULT_KEY;
  const negativeCases = [];
  for (const [label, key] of [["missing", null], ["incorrect", randomBytes(32).toString("base64")]]) {
    await setWrappingKey(ctx, key);
    const sandbox = await createRuntime(client, state, `vault-${label}-key`);
    await assertRetained(client, sandbox, state);
    let rejected = false;
    try { await client.credentials.attachSecret(sandbox, secretId); }
    catch (error) { check(error.status === 500 && error.code === "credential_secret_decryption_unavailable", "Wrapping-key case failed for an unrelated reason"); rejected = true; }
    check(rejected, "Vault accepted unavailable wrapping-key material");
    const { vault } = await client.credentials.inspect(sandbox);
    check(!vault || vault.credentials.length === 0, "Failed decryption still installed a runtime credential");
    await probeCredential(client, sandbox, false);
    check(envelopeFingerprint(ctx, secretId, target) === fingerprint, "Key failure rewrote the encrypted source");
    await released(client, sandbox, state.workspaceId);
    negativeCases.push(label);
  }
  await setWrappingKey(ctx, correctKey);
  const recovered = await createRuntime(client, state, "vault-after-recovery");
  await assertRetained(client, recovered, state);
  const attached = await client.credentials.attachSecret(recovered, secretId);
  await probeCredential(client, recovered, true);
  await assertCredentialBoundary(ctx, client, recovered);
  ctx.save("recovered-workload.json", { ...state, secretId, sandboxId: recovered, attachment: attached.attachment, databaseDeployment: target });
  return { databaseRestore: true, workspaceRestore: true, oidcIdentity: true, retainedApiKey: true, encryptedVaultUse: true, credentialBoundary: true, negativeCases, envelopeSha256: fingerprint, fileSha256: state.fileSha256, recoveryPoint: backup.recoveryPoint };
}
