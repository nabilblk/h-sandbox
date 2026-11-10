import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { check } from "../../acceptance/context.mjs";
import { applyOwned, platformNamespace, ownedNamespace } from "../../acceptance/operator.mjs";
import { installWorkbenchCandidate } from "../../workbench-acceptance/candidate.mjs";
import { installSdkCandidate } from "../../sdk-acceptance/candidate.mjs";

export async function installCandidate(ctx) {
  ctx.guard();
  const candidate = await installWorkbenchCandidate(ctx);
  applyOwned(ctx, { apiVersion: "v1", kind: "Secret", metadata: {
    name: "acceptance-telemetry", namespace: platformNamespace
  }, stringData: { token: randomBytes(32).toString("hex") } }, "telemetry-secret.json");
  const values = ctx.read("workbench-values.json");
  values.observability = { enabled: true, acknowledgePreview: true, allowContent: true,
    collectorTokenSecret: { name: "acceptance-telemetry", key: "token" },
    storageClass: "local-path", logsSize: "1Gi", tracesSize: "1Gi", queueSize: "1Gi" };
  ctx.save("telemetry-values.json", values);
  ctx.helm(["upgrade", "harakiri", "infra/charts/harakiri", "-n", platformNamespace,
    "-f", ctx.file("telemetry-values.json"), "--wait", "--timeout", "10m"]);
  await ctx.forwardAll();
  const sdk = await installSdkCandidate(ctx);
  const manifest = JSON.parse(fs.readFileSync(new URL("../../../packages/sdk/package.json", import.meta.url)));
  const peers = Object.keys(manifest.peerDependencies).filter((name) => name.startsWith("@opentelemetry/"))
    .map((name) => `${name}@${manifest.devDependencies[name]}`);
  const env = { ...process.env, NPM_CONFIG_USERCONFIG: ctx.file("npmrc"), NPM_CONFIG_GLOBALCONFIG: ctx.file("npmrc-global") };
  delete env.NPM_TOKEN; delete env.NODE_AUTH_TOKEN;
  ctx.execute("npm", ["install", "--prefix", ctx.consumer, "--ignore-scripts", "--no-audit", "--no-fund",
    "--registry=https://registry.npmjs.org", ...peers], "Install optional telemetry peers", { env });
  const fixture = path.join(ctx.consumer, "telemetry-native.mjs");
  fs.copyFileSync(new URL("./workflows.mjs", import.meta.url), fixture);
  return { source: candidate.source, images: candidate.images, tarballSha256: sdk.tarballSha256,
    fixture: pathToFileURL(fixture).href };
}

const components = new Set(["collector", "logs", "traces"]);
export async function componentReplicas(ctx, component, replicas) {
  check(components.has(component) && [0, 1].includes(replicas), "Unexpected telemetry fault target");
  ownedNamespace(ctx, platformNamespace);
  const name = `harakiri-observe-${component}`;
  const statefulset = JSON.parse(ctx.k(["-n", platformNamespace, "get", "statefulset", name, "-o", "json"]));
  check(statefulset.metadata.labels?.["app.kubernetes.io/instance"] === "harakiri"
    && statefulset.metadata.labels?.["app.kubernetes.io/component"] === `observe-${component}`, "Telemetry workload identity mismatch");
  ctx.k(["-n", platformNamespace, "scale", `statefulset/${name}`, `--replicas=${replicas}`]);
  if (replicas) ctx.k(["-n", platformNamespace, "rollout", "status", `statefulset/${name}`, "--timeout=300s"]);
  else ctx.k(["-n", platformNamespace, "wait", "--for=delete", "pod", "-l",
    `app.kubernetes.io/instance=harakiri,app.kubernetes.io/component=observe-${component}`, "--timeout=120s"]);
}
