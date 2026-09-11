import { check, until } from "./context.mjs";
import { assertOwnedNamespace, ownershipLabel } from "./safety.mjs";

export const platformNamespace = "harakiri-preview";
export const runtimeNamespace = "harakiri-preview-runtime";
export const writers = ["harakiri-api", "harakiri-scheduler", "harakiri-template-builder"];

export function ownedNamespace(ctx, namespace) {
  assertOwnedNamespace(JSON.parse(ctx.k(["get", "namespace", namespace, "-o", "json"])), ctx.identity);
}

export function applyOwned(ctx, object, filename) {
  const items = object.kind === "List" ? object.items : [object];
  for (const item of items) {
    ownedNamespace(ctx, item.metadata.namespace);
    item.metadata.labels = { ...item.metadata.labels, [ownershipLabel]: ctx.identity.id };
  }
  ctx.save(filename, object);
  ctx.k(["apply", "-f", ctx.file(filename)]);
}

export function get(ctx, kind, name, namespace = platformNamespace) {
  ownedNamespace(ctx, namespace);
  return JSON.parse(ctx.k(["-n", namespace, "get", kind, name, "-o", "json"]));
}

export async function replicas(ctx, names, count) {
  ownedNamespace(ctx, platformNamespace);
  for (const name of names) {
    check([...writers, "preview-keycloak", "preview-postgres", "opensandbox-server"].includes(name), "Unexpected deployment in fault injection");
    ctx.k(["-n", platformNamespace, "scale", `deployment/${name}`, `--replicas=${count}`]);
    if (count) ctx.k(["-n", platformNamespace, "rollout", "status", `deployment/${name}`, "--timeout=600s"]);
    else {
      const deployment = get(ctx, "deployment", name);
      const selector = Object.entries(deployment.spec.selector.matchLabels).map(([key, value]) => `${key}=${value}`).join(",");
      await until("Writer pods fully stopped", () => JSON.parse(ctx.k(["-n", platformNamespace, "get", "pods", "-l", selector, "-o", "json"])).items.length === 0, 120000);
    }
  }
}

export function postgres(ctx, command, { deployment = "preview-postgres", input, binary = false } = {}) {
  check(["preview-postgres", "acceptance-recovered-postgres"].includes(deployment), "Unexpected PostgreSQL target");
  check(["psql", "pg_dump", "pg_restore"].includes(command[0]), "Unexpected database operation");
  return ctx.k(["-n", platformNamespace, "exec", ...(input === undefined ? [] : ["-i"]), `deployment/${deployment}`, "--", ...command], { input, binary, label: "Owned PostgreSQL recovery operation" });
}

export function query(ctx, sql, deployment = "preview-postgres", database = "harakiri") {
  check(["harakiri", "keycloak", "postgres"].includes(database), "Unexpected database");
  return postgres(ctx, ["psql", "-X", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-At"], { deployment, input: sql }).trim();
}

export function literalId(id) {
  check(/^[a-zA-Z0-9_-]+$/.test(id), "Invalid owned object identifier");
  return `'${id}'`;
}

export async function volumePod(ctx, claim, name, readOnly) {
  check(name.startsWith("acceptance-volume-"), "Unexpected recovery pod name");
  const volume = get(ctx, "pvc", claim, runtimeNamespace);
  const node = volume.spec.volumeName ? get(ctx, "pv", volume.spec.volumeName, runtimeNamespace).spec.nodeAffinity : null;
  // A retained local-path volume must return to its node; this is not CSI portability evidence.
  applyOwned(ctx, { apiVersion: "v1", kind: "Pod", metadata: { name, namespace: runtimeNamespace }, spec: {
    restartPolicy: "Never", automountServiceAccountToken: false,
    ...(node ? { affinity: { nodeAffinity: { requiredDuringSchedulingIgnoredDuringExecution: node.required } } } : {}),
    containers: [{ name: "archive", image: "postgres:16.15-alpine", command: ["sleep", "3600"],
      resources: { requests: { cpu: "10m", memory: "32Mi" }, limits: { cpu: "250m", memory: "128Mi" } },
      volumeMounts: [{ name: "workspace", mountPath: "/restore", readOnly }] }],
    volumes: [{ name: "workspace", persistentVolumeClaim: { claimName: claim, readOnly } }]
  } }, `${name}.json`);
  ctx.k(["-n", runtimeNamespace, "wait", "--for=condition=Ready", `pod/${name}`, "--timeout=180s"]);
}

export function removeVolumePod(ctx, name) {
  const pod = get(ctx, "pod", name, runtimeNamespace);
  check(pod.metadata.labels[ownershipLabel] === ctx.identity.id && name.startsWith("acceptance-volume-"), "Refusing to delete an unowned pod");
  ctx.k(["-n", runtimeNamespace, "delete", "pod", name, "--wait=true", "--timeout=120s"]);
}
