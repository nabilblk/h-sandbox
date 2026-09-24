import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { waitForNpmVersion } from "./wait-npm-version.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const integration = join(root, "packages/deepagents");
const require = createRequire(join(integration, "package.json"));
const tooling = createRequire(join(root, "package.json"));
const ts = tooling("typescript");
const consumerNode = process.env.HARAKIRI_DEEPAGENTS_TEST_NODE ?? process.execPath;
const mode = process.argv[2] ?? "--source";
assert.ok(process.argv.length <= 3 && ["--source", "--release-candidate", "--published"].includes(mode), "Unknown package verification mode");
const directory = mkdtempSync(join(tmpdir(), "harakiri-deepagents-package-"));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(npm_config_|npm_token$|node_auth_token$)/i.test(key)));
env.NPM_CONFIG_USERCONFIG = join(directory, "empty-user.npmrc");
env.NPM_CONFIG_GLOBALCONFIG = join(directory, "empty-global.npmrc");
env.NPM_CONFIG_REGISTRY = "https://registry.npmjs.org";
env.LANGSMITH_TRACING = "false";
env.LANGCHAIN_TRACING_V2 = "false";
const run = (command, args, cwd) => execFileSync(command, args, { cwd, env, stdio: "inherit" });

try {
  const manifest = JSON.parse(readFileSync(join(integration, "package.json"), "utf8"));
  const packages = [];
  if (mode !== "--source") {
    assert.notEqual(manifest.private, true, "Adapter is not qualified for publication");
    const sdkVersion = manifest.peerDependencies["@h-sandbox/sdk"];
    assert.match(sdkVersion, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "Release must pin a published SDK");
    await waitForNpmVersion("@h-sandbox/sdk", sdkVersion);
    packages.push(`@h-sandbox/sdk@${sdkVersion}`);
  }
  if (mode === "--published") {
    await waitForNpmVersion(manifest.name, manifest.version);
    packages.push(`${manifest.name}@${manifest.version}`);
  } else {
    run("pnpm", ["build"], integration);
    for (const name of mode === "--source" ? ["sdk", "deepagents"] : ["deepagents"]) {
      run("pnpm", ["pack", "--pack-destination", directory], join(root, "packages", name));
    }
    const archives = readdirSync(directory).filter(file => file.endsWith(".tgz"));
    assert.equal(archives.length, mode === "--source" ? 2 : 1, "Unexpected candidate archives");
    packages.push(...archives.map(file => join(directory, file)));
  }
  const dependencies = Object.fromEntries(Object.entries(manifest.devDependencies)
    .filter(([name]) => name !== "@h-sandbox/sdk" && name !== "tsx"));
  writeFileSync(join(directory, "package.json"), JSON.stringify({ private: true, type: "module", dependencies }));
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org",
    ...packages], directory);
  run("npm", ["ls", "@h-sandbox/sdk", "@h-sandbox/deepagents", "deepagents", "@langchain/langgraph"], directory);

  const installed = join(directory, "node_modules/@h-sandbox/deepagents");
  const installedManifest = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
  assert.equal(installedManifest.name, manifest.name);
  assert.equal(installedManifest.version, manifest.version);
  assert.equal(installedManifest.repository.url, "git+https://github.com/nabilblk/h-sandbox.git");
  assert.equal(installedManifest.repository.directory, "packages/deepagents");
  assert.equal(installedManifest.publishConfig.access, "public");
  assert.ok(!JSON.stringify(installedManifest.peerDependencies).includes("workspace:"));
  if (mode !== "--source") {
    assert.deepEqual(installedManifest.peerDependencies, manifest.peerDependencies);
    const sdk = JSON.parse(readFileSync(join(directory, "node_modules/@h-sandbox/sdk/package.json"), "utf8"));
    assert.equal(sdk.version, manifest.peerDependencies["@h-sandbox/sdk"]);
  }
  assert.ok(readFileSync(join(installed, "LICENSE"), "utf8").includes("Apache License"));
  assert.ok(readFileSync(join(installed, "README.md"), "utf8").includes("createDeepAgent"));
  assert.deepEqual(readdirSync(installed).sort(), ["LICENSE", "README.md", "dist", "package.json"]);
  assert.ok(readdirSync(join(installed, "dist")).every(file => /\.(?:js|d\.ts)$/.test(file) && !file.includes("test")));
  for (const folder of ["test", "examples"]) mkdirSync(join(directory, folder));
  for (const file of readdirSync(join(integration, "test")).filter(file => file.endsWith(".ts"))) {
    const source = readFileSync(join(integration, "test", file), "utf8")
      .replaceAll('from "../src/index.js"', 'from "@h-sandbox/deepagents"');
    assert.ok(!source.includes('from "../src/'), "Package tests must use only public exports.");
    writeFileSync(join(directory, "test", file), source);
  }
  for (const file of readdirSync(join(integration, "examples")).filter(file => file.endsWith(".ts"))) {
    writeFileSync(join(directory, "examples", file), readFileSync(join(integration, "examples", file)));
  }
  // Compile the exact displayed programs, not a hand-maintained imitation.
  const docs = ts.createSourceFile("deepagents-docs.tsx", readFileSync(join(root, "apps/web/src/deepagents-docs.tsx"), "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const programsByName = new Map();
  for (const statement of docs.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer && ts.isNoSubstitutionTemplateLiteral(declaration.initializer)) {
        programsByName.set(declaration.name.text, declaration.initializer.text);
      }
    }
  }
  for (const name of ["deepagentsFirstTask", "deepagentsAgentTask"]) {
    assert.ok(programsByName.has(name), `Missing complete documentation program: ${name}`);
    writeFileSync(join(directory, "examples", `${name}.ts`), programsByName.get(name));
  }
  assert.equal(programsByName.get("deepagentsAgentTask"), readFileSync(join(integration, "examples/run-repair.ts"), "utf8").trimEnd(),
    "The displayed real-agent program must be the same single-file example tested through Deep Agents.");
  writeFileSync(join(directory, "test", "docs.test.ts"), `
import assert from "node:assert/strict";
import test from "node:test";
import { HarakiriClient } from "@h-sandbox/sdk";
import { fixture } from "./fixture.js";
test("the exact documented model-free program confirms cleanup", async () => {
  const f = fixture();
  const original = HarakiriClient.fromEnv;
  const previous = process.env.HARAKIRI_TEMPLATE;
  HarakiriClient.fromEnv = () => f.client;
  process.env.HARAKIRI_TEMPLATE = "synthetic-template";
  try {
    await import("../examples/deepagentsFirstTask.js");
    assert.equal(f.summary.capacityPhase, "released");
    assert.equal(f.commands.size, 1);
    assert.equal(f.commands.get("cmd_1")?.command, "printf 'hello from Harakiri\\\\n'");
  } finally {
    HarakiriClient.fromEnv = original;
    if (previous === undefined) delete process.env.HARAKIRI_TEMPLATE;
    else process.env.HARAKIRI_TEMPLATE = previous;
  }
});
`);
  const tests = readdirSync(join(directory, "test")).filter(file => file.endsWith(".test.ts"));
  run(consumerNode, ["--version"], directory);
  run(consumerNode, ["--import", pathToFileURL(require.resolve("tsx")).href, "--test", ...tests.map(file => `test/${file}`)], directory);
  const programs = ["test", "examples"].flatMap(folder => readdirSync(join(directory, folder))
    .filter(file => file.endsWith(".ts")).map(file => `${folder}/${file}`));
  run(consumerNode, [resolve(root, "node_modules/typescript/bin/tsc"), "--noEmit", "--strict", "--skipLibCheck",
    "--target", "ES2022", "--module", "NodeNext", "--typeRoots", resolve(root, "node_modules/@types"), ...programs], directory);
  console.log(`Installed Deep Agents adapter ${manifest.version} (${mode}): anonymous install, framework behavior, public exports and examples passed. No live runtime or model was used.`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
