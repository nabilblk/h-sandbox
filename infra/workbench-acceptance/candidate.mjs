import fs from "node:fs";
import { check, origins } from "../acceptance/context.mjs";
import { platformNamespace } from "../acceptance/operator.mjs";

export async function installWorkbenchCandidate(ctx) {
  ctx.guard();
  const source = process.env.GITHUB_SHA;
  check(/^[a-f0-9]{40}$/.test(source ?? ""), "Workbench candidate needs an exact source SHA");
  check(ctx.execute("git", ["rev-parse", "HEAD"], "Identify candidate checkout").trim() === source, "Candidate checkout does not match source SHA");
  check(/^\d+-\d+$/.test(ctx.identity.id), "Invalid candidate run identity");
  const tag = `workbench-${ctx.identity.id}`;
  const images = {};
  for (const name of ["api", "web"]) {
    const reference = `localhost/harakiri/harakiri-${name}:${tag}`;
    ctx.guard();
    ctx.execute("docker", ["build", "--platform=linux/amd64", "--label", `org.opencontainers.image.revision=${source}`, "-f", `apps/${name}/Dockerfile`, "-t", reference, "."], `Build isolated Workbench ${name}`);
    const digest = ctx.execute("docker", ["image", "inspect", "--format={{.Id}}", reference], "Identify candidate image").trim();
    check(/^sha256:[a-f0-9]{64}$/.test(digest), "Candidate image identity missing");
    images[name] = { reference, imageConfigDigest: digest };
    const archive = ctx.file(`workbench-${name}.tar`);
    try {
      ctx.execute("docker", ["image", "save", "--output", archive, reference], "Export owned candidate image");
      ctx.guard();
      ctx.execute("sudo", ["/usr/local/bin/k0s", "ctr", "--namespace", "k8s.io", "images", "import", archive], "Import candidate into owned containerd");
    } finally { fs.rmSync(archive, { force: true }); }
  }
  // Preserve generated credentials, issuer, runtime, storage and all other values.
  const values = structuredClone(ctx.read("harakiri-values.json"));
  values.image = { ...values.image, registry: "localhost", repository: "harakiri", pullPolicy: "Never",
    api: { ...values.image.api, name: "harakiri-api", tag }, web: { ...values.image.web, name: "harakiri-web", tag } };
  values.config.TEMPLATE_BUILDER_JOB_IMAGE = images.api.reference;
  ctx.save("workbench-values.json", values);
  const manifest = ctx.read("artifact-manifest.json");
  ctx.helm(["upgrade", "harakiri", ctx.file(manifest.charts.harakiri.archive), "-n", platformNamespace, "-f", ctx.file("workbench-values.json"), "--wait", "--timeout", "10m"]);
  const pods = JSON.parse(ctx.k(["-n", platformNamespace, "get", "pods", "-l", "app.kubernetes.io/instance=harakiri", "-o", "json"])).items;
  for (const component of ["api", "web", "scheduler", "template-builder"]) {
    const live = pods.filter(pod => !pod.metadata.deletionTimestamp && pod.metadata.labels?.["app.kubernetes.io/component"] === component);
    check(live.length > 0 && live.every(pod => {
      const container = pod.spec.containers.find(item => item.name === component);
      return container?.image === images[component === "web" ? "web" : "api"].reference && container.imagePullPolicy === "Never"
        && pod.status.containerStatuses?.some(item => item.name === component && item.ready);
    }), "Candidate workload is not running the imported image");
  }
  await ctx.forwardAll();
  for (const url of [`${origins.api}/health`, origins.web]) {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: "error" });
    check(response.ok, "Workbench candidate endpoint is unhealthy");
  }
  return { source, images, published: false };
}
