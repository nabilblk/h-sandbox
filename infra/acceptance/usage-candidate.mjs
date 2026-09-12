import fs from "node:fs";
import { check, origins, pinned } from "./context.mjs";
import { platformNamespace } from "./operator.mjs";

// Invoked only after the existing runner/cluster ownership guard. Images and
// tarballs stay on this disposable machine; no publish command is used.
export async function installUsageCandidate(ctx) {
  ctx.guard();
  check(process.env.HARAKIRI_USAGE_ACCEPTANCE === "1", "Source usage acceptance was not explicitly selected");
  check(/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? ""), "Candidate needs an exact source SHA");
  const tag = `usage-${ctx.identity.id}`;
  const images = {};
  for (const name of ["api", "web"]) {
    const reference = `localhost/harakiri/harakiri-${name}:${tag}`;
    ctx.execute("docker", ["build", "--platform=linux/amd64", "-f", `apps/${name}/Dockerfile`, "-t", reference, "."], `Build isolated candidate ${name}`);
    const id = ctx.execute("docker", ["image", "inspect", "--format={{.Id}}", reference], "Identify source candidate image").trim();
    check(/^sha256:[a-f0-9]{64}$/.test(id), "Candidate image identity missing");
    images[name] = { reference, id };
    ctx.execute("docker", ["image", "save", "--output", ctx.file(`candidate-${name}.tar`), reference], "Export owned candidate image");
    ctx.guard();
    ctx.execute("sudo", ["/usr/local/bin/k0s", "ctr", "--namespace", "k8s.io", "images", "import", ctx.file(`candidate-${name}.tar`)], "Import candidate into owned containerd");
    fs.unlinkSync(ctx.file(`candidate-${name}.tar`));
  }
  const baseline = ctx.read("harakiri-values.json");
  ctx.save("baseline-harakiri-values.json", baseline);
  const values = structuredClone(baseline);
  values.image = { registry: "localhost", repository: "harakiri", pullPolicy: "IfNotPresent", api: { name: "harakiri-api", tag }, web: { name: "harakiri-web", tag } };
  values.config.TEMPLATE_BUILDER_JOB_IMAGE = images.api.reference;
  ctx.save("harakiri-values.json", values);
  ctx.helm(["upgrade", "harakiri", "infra/charts/harakiri", "-n", platformNamespace, "-f", ctx.file("harakiri-values.json"), "--wait", "--timeout", "10m"]);
  await ctx.forwardAll();
  const consumerEnv = { ...process.env, NPM_CONFIG_USERCONFIG: ctx.file("npmrc"), NPM_CONFIG_GLOBALCONFIG: ctx.file("npmrc-global"), NPM_CONFIG_REGISTRY: "https://registry.npmjs.org" };
  delete consumerEnv.NPM_TOKEN; delete consumerEnv.NODE_AUTH_TOKEN;
  const archives = [];
  for (const name of ["sdk", "cli"]) {
    ctx.execute("pnpm", ["--filter", `@h-sandbox/${name}`, "build"], "Build source consumer package");
    ctx.execute("pnpm", ["--filter", `@h-sandbox/${name}`, "pack", "--pack-destination", ctx.identity.directory], "Pack source consumer package");
    const candidates = fs.readdirSync(ctx.identity.directory).filter(file => file.startsWith(`h-sandbox-${name}-`) && file.endsWith(".tgz"));
    check(candidates.length === 1, "Ambiguous source consumer archive");
    archives.push(ctx.file(candidates[0]));
  }
  ctx.execute("npm", ["install", "--prefix", ctx.consumer, "--ignore-scripts", "--no-audit", "--no-fund", ...archives], "Install isolated source consumer archives", { env: consumerEnv });
  ctx.candidateUsage = true;
  const evidence = { source: process.env.GITHUB_SHA, published: false, baseline: pinned.version, schema: 39, images };
  ctx.save("usage-candidate.json", evidence);
  const response = await fetch(`${origins.api}/health`, { signal: AbortSignal.timeout(10000) });
  check(response.ok, "Source candidate API did not become healthy");
  return { sourceCandidate: true };
}
