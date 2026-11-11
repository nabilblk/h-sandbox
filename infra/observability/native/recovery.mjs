import fs from "node:fs";
import { check, sha256 } from "../../acceptance/context.mjs";
import { applyOwned, get, platformNamespace, postgres, query, replicas, writers } from "../../acceptance/operator.mjs";
import { configureRestoredDatabases, restoreDatabases } from "../../acceptance/recovery.mjs";
import { ownershipLabel } from "../../acceptance/safety.mjs";
import { componentReplicas } from "./install.mjs";
import { recoveryFiles, telemetryComponents, verifyRecoverySet } from "./recovery-contracts.mjs";

const mapping = (ctx, database = "preview-postgres") => query(ctx, `SELECT json_build_object(
  'tenants', (SELECT COALESCE(json_agg(t ORDER BY organization_id),'[]') FROM (SELECT organization_id,tenant_id FROM observability_policies) t),
  'sequence', (SELECT row_to_json(s) FROM (SELECT last_value,is_called FROM observability_policies_tenant_id_seq) s)
);`, database);
const podName = "acceptance-telemetry-archive";

function archive(ctx, command, options = {}) {
  const pod = get(ctx, "pod", podName);
  check(pod.metadata.labels?.[ownershipLabel] === ctx.identity.id, "Archive pod is not owned by this run");
  return ctx.k(["-n", platformNamespace, "exec", ...(options.input ? ["-i"] : []), podName, "--", ...command], {
    ...options, label: "Owned detached telemetry archive", maxBuffer: 32 * 1024 * 1024
  });
}

async function mountVolume(ctx, claim, image, readOnly) {
  const pvc = get(ctx, "pvc", claim);
  const affinity = pvc.spec.volumeName ? get(ctx, "pv", pvc.spec.volumeName).spec.nodeAffinity : null;
  applyOwned(ctx, { apiVersion: "v1", kind: "Pod", metadata: { name: podName, namespace: platformNamespace }, spec: {
    automountServiceAccountToken: false, restartPolicy: "Never", terminationGracePeriodSeconds: 5,
    securityContext: { runAsNonRoot: true, runAsUser: 10001, runAsGroup: 10001, fsGroup: 10001,
      seccompProfile: { type: "RuntimeDefault" } },
    ...(affinity ? { affinity: { nodeAffinity: { requiredDuringSchedulingIgnoredDuringExecution: affinity.required } } } : {}),
    containers: [{ name: "archive", image, command: ["sleep", "600"],
      securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ["ALL"] } },
      resources: { requests: { cpu: "10m", memory: "32Mi" }, limits: { cpu: "250m", memory: "128Mi" } },
      volumeMounts: [{ name: "state", mountPath: "/restore", readOnly }] }],
    volumes: [{ name: "state", persistentVolumeClaim: { claimName: claim, readOnly } }]
  } }, "telemetry-archive-pod.json");
  ctx.k(["-n", platformNamespace, "wait", "--for=condition=Ready", `pod/${podName}`, "--timeout=180s"]);
}

function unmountVolume(ctx) {
  check(get(ctx, "pod", podName).metadata.labels?.[ownershipLabel] === ctx.identity.id, "Refusing unowned archive cleanup");
  ctx.k(["-n", platformNamespace, "delete", "pod", podName, "--wait=true", "--timeout=120s"]);
}

function archiveImage(ctx) {
  const deployment = get(ctx, "deployment", "preview-postgres");
  const selector = Object.entries(deployment.spec.selector.matchLabels).map(([key, value]) => `${key}=${value}`).join(",");
  const pods = JSON.parse(ctx.k(["-n", platformNamespace, "get", "pods", "-l", selector, "-o", "json"])).items;
  check(pods.length === 1, "PostgreSQL archive tool identity is ambiguous");
  const image = pods[0].status.containerStatuses[0].imageID.replace(/^docker-pullable:\/\//, "");
  check(/^docker.io\/library\/postgres@sha256:[a-f0-9]{64}$/.test(image), "Archive tool must use the running PostgreSQL image digest");
  return image;
}

/** Destructive only on the fresh, guarded GitHub cluster. Never a production installer. */
export async function coldRecovery(ctx, operator) {
  ctx.guard();
  console.log("Telemetry recovery: revoke capture and stop owned writers");
  check((await operator.client.capacity()).capacity.inUse === 0, "Recovery requires no live runtimes");
  check(query(ctx, "SELECT count(*) FROM persistent_workspaces WHERE attached_sandbox_id IS NOT NULL;") === "0",
    "Recovery requires no attached workspaces");
  const jobs = JSON.parse(ctx.k(["-n", platformNamespace, "get", "jobs", "-o", "json"]));
  check(jobs.items.every(job => !job.status.active), "Recovery requires no active template jobs");
  check(Number(query(ctx, "SELECT count(*) FROM telemetry_grants WHERE revoked_at IS NULL;")) > 0,
    "Recovery requires a sentinel grant to exercise revocation");
  await operator.request("/v1/observability/policy", "PATCH", { enabled: false, allowContent: true });
  check(query(ctx, "SELECT count(*) FROM telemetry_grants WHERE revoked_at IS NULL;") === "0", "Outstanding grants were not revoked before recovery");
  await operator.logout();
  const image = archiveImage(ctx);
  await replicas(ctx, [...writers, "preview-keycloak"], 0);
  // Collector stops first; its persisted queue joins the same cold recovery set.
  for (const component of telemetryComponents) await componentReplicas(ctx, component, 0);
  console.log("Telemetry recovery: archive the cold database and three-volume set");
  const manifest = { version: 1, runId: ctx.identity.id, source: process.env.GITHUB_SHA,
    recoveryPoint: new Date().toISOString(), tenantMappingSha256: sha256(mapping(ctx)), files: {}, volumes: {} };
  for (const database of ["harakiri", "keycloak"]) {
    ctx.save(`${database}.dump`, postgres(ctx, ["pg_dump", "-U", "postgres", "-d", database, "-Fc", "--no-owner", "--no-acl"], { binary: true }));
  }
  ctx.save("live-telemetry-config.json", ctx.k(["-n", platformNamespace, "get", "secrets,configmaps,statefulsets", "-o", "json"]));
  for (const component of telemetryComponents) {
    const claim = `state-harakiri-observe-${component}-0`;
    const pvc = get(ctx, "pvc", claim);
    manifest.volumes[component] = { name: claim, uid: pvc.metadata.uid };
    await mountVolume(ctx, claim, image, true);
    try { ctx.save(`${component}.tar`, archive(ctx, ["tar", "-C", "/restore", "-cf", "-", "."], { binary: true })); }
    finally { unmountVolume(ctx); }
  }
  for (const name of recoveryFiles) manifest.files[name] = sha256(fs.readFileSync(ctx.file(name)));
  ctx.save("backup.json", manifest);
  verifyRecoverySet(ctx.read("backup.json"), name => fs.readFileSync(ctx.file(name)), {
    runId: ctx.identity.id, source: process.env.GITHUB_SHA
  });

  console.log("Telemetry recovery: verify the complete set and restore fresh PostgreSQL storage");
  const database = restoreDatabases(ctx);
  check(sha256(mapping(ctx, database)) === manifest.tenantMappingSha256, "Restored tenant mapping or sequence differs from the recovery set");
  check(query(ctx, "SELECT count(*) FROM telemetry_grants WHERE revoked_at IS NULL;", database) === "0", "Recovery resurrected ingestion grants");
  await replicas(ctx, ["preview-postgres"], 0);
  console.log("Telemetry recovery: replace only the three owned telemetry PVCs");
  for (const component of telemetryComponents) {
    const { name: claim, uid } = manifest.volumes[component];
    const original = get(ctx, "pvc", claim);
    check(original.metadata.uid === uid, "Telemetry source PVC changed since backup");
    ctx.k(["-n", platformNamespace, "delete", "pvc", claim, "--wait=true", "--timeout=120s"]);
    applyOwned(ctx, { apiVersion: "v1", kind: "PersistentVolumeClaim", metadata: { name: claim, namespace: platformNamespace }, spec: {
      accessModes: original.spec.accessModes, storageClassName: original.spec.storageClassName,
      volumeMode: original.spec.volumeMode, resources: { requests: original.spec.resources.requests }
    } }, `telemetry-restored-${component}.json`);
    // A new local-path claim is bound by the first consumer, not by polling Bound.
    await mountVolume(ctx, claim, image, false);
    try {
      check(get(ctx, "pvc", claim).metadata.uid !== uid, "Telemetry recovery reused the old PVC");
      check(archive(ctx, ["find", "/restore", "-mindepth", "1"]).trim() === "", "Telemetry restore destination is not empty");
      archive(ctx, ["tar", "-C", "/restore", "--no-same-owner", "-xpf", "-"], { input: fs.readFileSync(ctx.file(`${component}.tar`)) });
    } finally { unmountVolume(ctx); }
  }
  configureRestoredDatabases(ctx, database);
  console.log("Telemetry recovery: restart storage and verify identity with capture disabled");
  for (const component of ["logs", "traces", "collector"]) await componentReplicas(ctx, component, 1);
  await replicas(ctx, ["preview-keycloak", ...writers], 1);
  await ctx.forwardAll();
  const account = await operator.login();
  const original = ctx.read("account.json");
  check(account.user.id === original.userId && account.organization.id === original.organizationId, "Cold recovery changed identity or organization");
  const policy = await operator.request("/v1/observability/policy");
  check(!policy.enabled, "Recovery silently enabled capture");
  check((await operator.client.capacity()).capacity.inUse === 0, "Recovery changed runtime capacity");
  return { databaseRestored: true, newTelemetryVolumes: 3, tenantMappingPreserved: true, grantsRemainRevoked: true,
    captureRemainsDisabled: true, identityPreserved: true };
}
