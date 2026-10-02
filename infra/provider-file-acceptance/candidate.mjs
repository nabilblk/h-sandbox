import fs from "node:fs";
import { check, origins } from "../acceptance/context.mjs";
import { platformNamespace } from "../acceptance/operator.mjs";

export async function installProviderCandidate(ctx) {
  ctx.guard();
  const source = process.env.GITHUB_SHA;
  check(/^[a-f0-9]{40}$/.test(source ?? ""), "Provider candidate needs an exact source SHA");
  // This tag exists only in Docker/containerd on the owned runner. Nothing is pushed.
  const tag = `provider-files-${ctx.identity.id}`;
  const reference = `core.campus.clusterdiali.me/harakiri/harakiri-api:${tag}`;
  ctx.execute("docker", ["build", "--platform=linux/amd64", "--label", `org.opencontainers.image.revision=${source}`, "-f", "apps/api/Dockerfile", "-t", reference, "."], "Build isolated provider candidate");
  const id = ctx.execute("docker", ["image", "inspect", "--format={{.Id}}", reference], "Identify provider candidate image").trim();
  check(/^sha256:[a-f0-9]{64}$/.test(id), "Provider candidate image identity missing");
  ctx.execute("docker", ["image", "save", "--output", ctx.file("provider-candidate.tar"), reference], "Export owned provider candidate");
  ctx.guard();
  ctx.execute("sudo", ["/usr/local/bin/k0s", "ctr", "--namespace", "k8s.io", "images", "import", ctx.file("provider-candidate.tar")], "Import provider candidate into owned containerd");
  fs.unlinkSync(ctx.file("provider-candidate.tar"));
  const values = ctx.read("harakiri-values.json");
  values.image.api.tag = tag;
  values.config.TEMPLATE_BUILDER_JOB_IMAGE = reference;
  ctx.save("provider-candidate-values.json", values);
  const manifest = ctx.read("artifact-manifest.json");
  ctx.helm(["upgrade", "harakiri", ctx.file(manifest.charts.harakiri.archive), "-n", platformNamespace, "-f", ctx.file("provider-candidate-values.json"), "--wait", "--timeout", "10m"]);
  await ctx.forwardAll();
  const response = await fetch(`${origins.api}/health`, { signal: AbortSignal.timeout(10000) });
  check(response.ok, "Provider candidate API did not become healthy");
  return { source, imageConfigDigest: id, published: false };
}
