import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// Installed-package verification uses only synthetic endpoints and a loopback redirect test.
const root = fileURLToPath(new URL("../", import.meta.url));
const sdk = join(root, "packages/sdk");
const require = createRequire(join(sdk, "package.json"));
// Repo tooling needs Node 22; the installed consumer can run on an older supported Node.
const consumerNode = process.env.HARAKIRI_SDK_TEST_NODE ?? process.execPath;
const directory = mkdtempSync(join(tmpdir(), "harakiri-sdk-package-"));
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: "inherit" });
try {
  run("pnpm", ["build"], sdk);
  run("pnpm", ["pack", "--pack-destination", directory], sdk);
  const archives = readdirSync(directory).filter((file) => file.endsWith(".tgz"));
  if (archives.length !== 1) throw new Error("Expected exactly one SDK package archive.");
  writeFileSync(join(directory, "package.json"), JSON.stringify({ private: true, type: "module" }));
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org", join(directory, archives[0])], directory);

  // Reuse the same conformance tests, but resolve imports exclusively from the installed tarball.
  const tests = readFileSync(join(sdk, "src/developer-experience.test.ts"), "utf8");
  if (!tests.includes('from "./index.js"')) throw new Error("Public import rewrite marker is missing.");
  writeFileSync(join(directory, "installed.test.ts"), tests.replace('from "./index.js"', 'from "@h-sandbox/sdk"'));
  writeFileSync(join(directory, "request.test.ts"), readFileSync(join(sdk, "src/request.test.ts"), "utf8")
    .replace('from "./index.js"', 'from "@h-sandbox/sdk"'));
  writeFileSync(join(directory, "api.ts"), readFileSync(join(sdk, "type-tests/api.ts")));
  for (const fixture of ["large-artifact.mjs", "opencode-recipe.mjs", "agent-observability.mjs"]) {
    writeFileSync(join(directory, fixture), readFileSync(join(sdk, "fixtures", fixture)));
  }
  writeFileSync(join(directory, "opencode-headless.ts"), readFileSync(join(root, "examples/sdk-opencode-headless/index.ts")));
  run(consumerNode, ["--version"], directory);
  run(consumerNode, ["--import", pathToFileURL(require.resolve("tsx")).href, "--test", "installed.test.ts", "request.test.ts"], directory);
  run(consumerNode, ["opencode-recipe.mjs", pathToFileURL(require.resolve("tsx")).href], directory);
  run(consumerNode, ["agent-observability.mjs"], directory);
  run(consumerNode, ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import { HarakiriClient } from '@h-sandbox/sdk';
    assert.equal(typeof HarakiriClient, 'function');
    assert.throws(() => import.meta.resolve('@opentelemetry/sdk-trace'), { code: 'ERR_MODULE_NOT_FOUND' });
  `], directory);
  run(consumerNode, ["--max-old-space-size=128", "large-artifact.mjs"], directory);
  run(consumerNode, [resolve(root, "node_modules/typescript/bin/tsc"), "--noEmit", "--strict", "--skipLibCheck", "--target", "ES2022",
    "--module", "NodeNext", "--typeRoots", resolve(root, "node_modules/@types"), "api.ts"], directory);
  console.log("Installed SDK: runtime contracts, public ESM imports and declaration compatibility passed.");

  // Core consumers do not install OTel. Qualify the optional public subpath separately.
  const manifest = JSON.parse(readFileSync(join(sdk, "package.json"), "utf8"));
  const telemetryDependencies = Object.keys(manifest.peerDependencies)
    .filter((name) => name.startsWith("@opentelemetry/"))
    .map((name) => `${name}@${manifest.devDependencies[name]}`);
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org", ...telemetryDependencies], directory);
  const telemetryTests = readFileSync(join(sdk, "src/telemetry.test.ts"), "utf8")
    .replaceAll('from "./index.js"', 'from "@h-sandbox/sdk"')
    .replaceAll('from "./protocol.js"', 'from "@h-sandbox/sdk"')
    .replaceAll('from "./telemetry.js"', 'from "@h-sandbox/sdk/telemetry"');
  writeFileSync(join(directory, "telemetry.test.ts"), telemetryTests);
  run(consumerNode, ["--import", pathToFileURL(require.resolve("tsx")).href, "--test", "telemetry.test.ts"], directory);
  writeFileSync(join(directory, "telemetry.ts"), readFileSync(join(sdk, "type-tests/telemetry.ts")));
  run(consumerNode, [resolve(root, "node_modules/typescript/bin/tsc"), "--noEmit", "--strict", "--skipLibCheck", "--target", "ES2022",
    "--module", "NodeNext", "--typeRoots", resolve(root, "node_modules/@types"), "telemetry.ts"], directory);
  console.log("Installed SDK: optional telemetry lifecycle, privacy, exporter and declarations passed.");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
