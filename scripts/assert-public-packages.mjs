#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const packageNames = process.argv.slice(2);
const targets = packageNames.length ? packageNames : ["sdk", "cli"];
const seenPackages = new Map();

const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

const walk = (dir) => {
  if (!existsSync(dir)) return [];
  const results = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) results.push(...walk(path));
    else results.push(path);
  }
  return results;
};

for (const target of targets) {
  const packageDir = join(root, "packages", target);
  const packageJsonPath = join(packageDir, "package.json");
  const distDir = join(packageDir, "dist");
  if (!existsSync(packageJsonPath)) {
    fail(`missing package.json for ${target}`);
    continue;
  }
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  seenPackages.set(target, packageJson);
  const dependencyBlocks = [
    packageJson.dependencies ?? {},
    packageJson.peerDependencies ?? {},
    packageJson.optionalDependencies ?? {}
  ];
  if (dependencyBlocks.some((dependencies) => Object.prototype.hasOwnProperty.call(dependencies, "@harakiri/shared"))) {
    fail(`${packageJson.name} must not depend on @harakiri/shared`);
  }
  if (!packageJson.publishConfig || packageJson.publishConfig.access !== "public") {
    fail(`${packageJson.name} must declare publishConfig.access=public`);
  }
  if (!existsSync(distDir)) {
    fail(`${packageJson.name} must be built before package assertion`);
    continue;
  }
  for (const file of walk(distDir)) {
    if (/\.test\.[cm]?[jt]s$|\.test\.d\.ts$/.test(file)) {
      fail(`${packageJson.name} dist must not include test output: ${file}`);
    }
    if (/\.(?:js|d\.ts)$/.test(file)) {
      const contents = readFileSync(file, "utf8");
      if (contents.includes("@harakiri/shared")) {
        fail(`${packageJson.name} dist must not reference @harakiri/shared: ${file}`);
      }
    }
  }
}

if (seenPackages.has("sdk") && seenPackages.has("cli")) {
  const sdk = seenPackages.get("sdk");
  const cli = seenPackages.get("cli");
  if (sdk.version !== cli.version) {
    fail(`SDK and CLI versions must stay aligned: sdk=${sdk.version}, cli=${cli.version}`);
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`public package assertions passed for ${targets.join(", ")}`);
