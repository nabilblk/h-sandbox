import path from "node:path";
import { createConfiguration } from "../preview/configure.mjs";
import { check, download, origins, pinned } from "./context.mjs";
import { namespaces, ownershipLabel, validateArtifactManifest } from "./safety.mjs";
import { installClients } from "./clients.mjs";

export async function install(ctx) {
  const base = `https://github.com/nabilblk/h-sandbox/releases/download/v${pinned.version}/`;
  const bytes = await download(`${base}artifact-manifest.json`, pinned.manifestSha256);
  const manifest = validateArtifactManifest(JSON.parse(bytes), pinned);
  ctx.save("artifact-manifest.json", manifest);
  for (const name of ["harakiri", "opensandbox"]) {
    const chart = manifest.charts[name];
    ctx.save(chart.archive, await download(`${base}${chart.archive}`, chart.sha256));
  }
  const configuration = createConfiguration({ webOrigin: origins.web, apiOrigin: origins.api, authOrigin: origins.auth, email: "operator@acceptance.example.test" });
  const values = configuration["harakiri-values.json"];
  values.image = { api: { tag: `${pinned.version}@${pinned.images.api}` }, web: { tag: `${pinned.version}@${pinned.images.web}` } };
  values.config.TEMPLATE_BUILDER_JOB_IMAGE = manifest.images.api.image;
  for (const [name, value] of Object.entries(configuration)) ctx.save(name, value);
  ctx.k(["apply", "-f", "infra/preview/dependencies.yaml"]);
  for (const name of namespaces) ctx.k(["label", "namespace", name, `${ownershipLabel}=${ctx.identity.id}`]);
  ctx.k(["apply", "-f", ctx.file("secrets.json")]);
  for (const name of ["preview-postgres", "preview-keycloak"]) ctx.k(["-n", "harakiri-preview", "rollout", "status", `deployment/${name}`, "--timeout=600s"]);
  ctx.helm(["install", "preview-runtime", ctx.file(manifest.charts.opensandbox.archive), "--namespace", "harakiri-preview", "-f", ctx.file("opensandbox-values.json"), "--wait", "--timeout", "10m"]);
  ctx.helm(["install", "harakiri", ctx.file(manifest.charts.harakiri.archive), "--namespace", "harakiri-preview", "-f", ctx.file("harakiri-values.json"), "--wait", "--timeout", "10m"]);
  await installClients(ctx, manifest);
  ctx.execute("node", [path.join(ctx.consumer, "node_modules/playwright/cli.js"), "install", "--with-deps", "chromium"], "Acceptance browser installation");
  // Browser dependency installation can restart services; open forwards afterwards.
  await ctx.forwardAll();
  for (const [url, expected] of [[`${origins.api}/health`, 200], [`${origins.web}/docs/install-kubernetes.md`, 200], [`${origins.auth}/realms/harakiri/.well-known/openid-configuration`, 200]]) {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    check(response.status === expected, "Installed public endpoint check failed");
    if (url.includes("openid-configuration")) check((await response.json()).issuer === `${origins.auth}/realms/harakiri`, "Installed issuer mismatch");
  }
  return { version: pinned.version, source: pinned.source, architecture: "amd64", anonymousArtifacts: true, freshInstallation: true };
}
