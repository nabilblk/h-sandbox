import path from "node:path";
import { pathToFileURL } from "node:url";
import { check, download, origins, pinned } from "./context.mjs";
import { validateArtifactManifest } from "./safety.mjs";
import { platformNamespace } from "./operator.mjs";
import { installClients } from "./clients.mjs";
import { prepareEmptyCatalog } from "./first-task.mjs";
import { configureUsageMonitoring } from "./usage-monitoring.mjs";
import { assertRetained, denyAtCapacity } from "./workload.mjs";

export function publishedUsageIdentity(env) {
  check(env.HARAKIRI_USAGE_ACCEPTANCE !== "1", "Source and published usage modes are mutually exclusive");
  check(/^0\.5\.0-rc\.[1-9][0-9]+$/.test(env.HARAKIRI_USAGE_RELEASE ?? ""), "Expected a post-rc.9 usage candidate");
  check(/^[a-f0-9]{64}$/.test(env.HARAKIRI_USAGE_MANIFEST_SHA256 ?? ""), "A reviewed published manifest checksum is required");
  return { version: env.HARAKIRI_USAGE_RELEASE, manifestSha256: env.HARAKIRI_USAGE_MANIFEST_SHA256 };
}

export async function installPublishedUsage(ctx) {
  ctx.guard();
  const identity = publishedUsageIdentity(process.env);
  const base = `https://github.com/nabilblk/h-sandbox/releases/download/v${identity.version}/`;
  const manifest = JSON.parse(await download(`${base}artifact-manifest.json`, identity.manifestSha256));
  check(/^[a-f0-9]{40}$/.test(manifest.source), "Published source identity is missing");
  for (const name of ["api", "web"]) check(/^sha256:[a-f0-9]{64}$/.test(manifest.images?.[name]?.digest ?? ""), "Published image digest is missing");
  const expected = { ...identity, source: manifest.source, images: { api: manifest.images.api.digest, web: manifest.images.web.digest },
    charts: { harakiri: { version: identity.version, digest: manifest.charts.harakiri.digest }, opensandbox: pinned.charts.opensandbox } };
  check(/^sha256:[a-f0-9]{64}$/.test(expected.charts.harakiri.digest), "Published chart digest is missing");
  validateArtifactManifest(manifest, expected);
  ctx.baselineConsumer = path.join(ctx.identity.directory, "baseline-consumer");
  await installClients({ ...ctx, consumer: ctx.baselineConsumer }, ctx.read("artifact-manifest.json"));
  const chart = manifest.charts.harakiri;
  ctx.save(chart.archive, await download(`${base}${chart.archive}`, chart.sha256));
  const baseline = ctx.read("harakiri-values.json");
  ctx.save("baseline-harakiri-values.json", baseline);
  const values = structuredClone(baseline);
  values.image = { api: { tag: `${identity.version}@${manifest.images.api.digest}` }, web: { tag: `${identity.version}@${manifest.images.web.digest}` } };
  values.config.TEMPLATE_BUILDER_JOB_IMAGE = manifest.images.api.image;
  configureUsageMonitoring(ctx, values);
  ctx.save("harakiri-values.json", values);
  ctx.candidateChart = ctx.file(chart.archive);
  ctx.helm(["upgrade", "harakiri", ctx.candidateChart, "-n", platformNamespace, "-f", ctx.file("harakiri-values.json"), "--wait", "--timeout", "10m"]);
  await ctx.forwardAll();
  await installClients(ctx, manifest);
  prepareEmptyCatalog(ctx);
  ctx.candidateUsage = true;
  ctx.publishedUsage = true;
  ctx.save("usage-published.json", { ...identity, source: manifest.source, baseline: pinned.version, schema: 39, images: expected.images });
  return { publishedCandidate: true, publishedSdk: true, publishedCli: true, anonymousArtifacts: true };
}

export async function verifyOldClient(ctx, state, id) {
  const { HarakiriClient } = await import(pathToFileURL(path.join(ctx.baselineConsumer, "acceptance-client.mjs")).href);
  const client = new HarakiriClient({ apiUrl: origins.api, apiKey: ctx.read("client-key.json").token });
  await assertRetained(client, id, state);
  await denyAtCapacity(client, state.templateId);
  check((await client.capacity()).capacity.inUse === 1, "Old SDK did not retain the capacity contract on the new API");
}
