import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { check, download, pinned } from "./context.mjs";

export async function installClients(ctx, manifest) {
  fs.mkdirSync(ctx.consumer, { mode: 0o700, recursive: true });
  fs.writeFileSync(path.join(ctx.consumer, "package.json"), JSON.stringify({ private: true, type: "module" }), { mode: 0o600 });
  fs.copyFileSync(new URL("./consumer.mjs", import.meta.url), path.join(ctx.consumer, "acceptance-client.mjs"));
  fs.chmodSync(path.join(ctx.consumer, "acceptance-client.mjs"), 0o600);
  fs.copyFileSync(new URL("./sdk-consumer.mjs", import.meta.url), path.join(ctx.consumer, "sdk-client.mjs"));
  fs.chmodSync(path.join(ctx.consumer, "sdk-client.mjs"), 0o600);
  ctx.save("npmrc", "");
  ctx.save("npmrc-global", "");
  const env = { ...process.env, NPM_CONFIG_USERCONFIG: ctx.file("npmrc"), NPM_CONFIG_GLOBALCONFIG: ctx.file("npmrc-global"), NPM_CONFIG_REGISTRY: "https://registry.npmjs.org", NPM_CONFIG_CACHE: path.join(ctx.consumer, "npm-cache") };
  delete env.NODE_AUTH_TOKEN; delete env.NPM_TOKEN;
  for (const name of ["sdk", "cli"]) {
    const pkg = manifest.npm[name];
    const archive = await download(pkg.tarball);
    check(`sha512-${createHash("sha512").update(archive).digest("base64")}` === pkg.integrity, "Published npm integrity mismatch");
    ctx.save(`${name}.tgz`, archive);
  }
  ctx.execute("npm", ["install", "--prefix", ctx.consumer, "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact", ctx.file("sdk.tgz"), ctx.file("cli.tgz"), `@playwright/test@${pinned.playwright}`], "Anonymous published-client install", { env });
  const version = ctx.execute("node", [path.join(ctx.consumer, "node_modules/@h-sandbox/cli/dist/index.js"), "--version"], "Published CLI version").trim();
  check(version === manifest.version, "Installed CLI version mismatch");
  for (const name of ["sdk", "cli"]) {
    const metadata = JSON.parse(fs.readFileSync(path.join(ctx.consumer, "node_modules/@h-sandbox", name, "package.json")));
    check(metadata.version === manifest.version, "Installed package version mismatch");
  }
  return { publishedSdk: true, publishedCli: true };
}
