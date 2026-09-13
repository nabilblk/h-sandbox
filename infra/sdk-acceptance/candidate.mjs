import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { check, sha256 } from "../acceptance/context.mjs";

export async function installSdkCandidate(ctx) {
  ctx.guard();
  check(/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? ""), "SDK candidate needs an exact source SHA");
  ctx.execute("pnpm", ["--filter", "@h-sandbox/sdk", "build"], "Build candidate SDK");
  ctx.execute("pnpm", ["--filter", "@h-sandbox/sdk", "pack", "--pack-destination", ctx.identity.directory], "Pack candidate SDK");
  const archives = fs.readdirSync(ctx.identity.directory).filter(name => /^h-sandbox-sdk-.*\.tgz$/.test(name));
  check(archives.length === 1, "SDK candidate archive is ambiguous");
  const archive = ctx.file(archives[0]);
  const env = { ...process.env, NPM_CONFIG_USERCONFIG: ctx.file("npmrc"), NPM_CONFIG_GLOBALCONFIG: ctx.file("npmrc-global"), NPM_CONFIG_REGISTRY: "https://registry.npmjs.org" };
  delete env.NPM_TOKEN; delete env.NODE_AUTH_TOKEN;
  ctx.execute("npm", ["install", "--prefix", ctx.consumer, "--ignore-scripts", "--no-audit", "--no-fund", archive], "Install unpublished SDK tarball", { env });
  const fixture = path.join(ctx.consumer, "sdk-workflows.mjs");
  fs.copyFileSync(new URL("./workflows.mjs", import.meta.url), fixture);
  fs.chmodSync(fixture, 0o600);
  return { fixture: pathToFileURL(fixture).href, tarballSha256: sha256(fs.readFileSync(archive)) };
}
