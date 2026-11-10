import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

test("actual SDK tarball consumers typecheck and execute the real-agent recipes", { timeout: 240_000 }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "harakiri-agent-recipes-"));
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const env = { PATH: process.env.PATH, HOME: directory, NPM_CONFIG_USERCONFIG: path.join(directory, "npmrc"), NPM_CONFIG_GLOBALCONFIG: path.join(directory, "npmrc-global"),
    LANGSMITH_TRACING: "false", LANGCHAIN_TRACING_V2: "false", LANGCHAIN_CALLBACKS_BACKGROUND: "false" };
  const execute = (command, args, cwd = directory) => execFileSync(command, args, { cwd, env, timeout: 180_000, stdio: "pipe" });
  try {
    execute("pnpm", ["--filter", "@h-sandbox/sdk", "build"], root);
    execute("pnpm", ["--filter", "@h-sandbox/sdk", "pack", "--pack-destination", directory], root);
    const archive = fs.readdirSync(directory).find(name => name.endsWith(".tgz"));
    const sdk = JSON.parse(fs.readFileSync(path.join(root, "packages/sdk/package.json")));
    const framework = JSON.parse(fs.readFileSync(new URL("./frameworks/package.json", import.meta.url)));
    const dependencies = Object.fromEntries(Object.keys(sdk.peerDependencies).filter(name => name.startsWith("@opentelemetry/"))
      .map(name => [name, sdk.devDependencies[name]]));
    for (const name of ["@langchain/core", "@langchain/ollama", "langchain", "@arizeai/openinference-instrumentation-langchain", "tsx", "typescript", "@types/node"]) {
      dependencies[name] = framework.devDependencies[name];
    }
    dependencies["@h-sandbox/sdk"] = `file:./${archive}`;
    fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ private: true, type: "module", dependencies }));
    execute("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org"]);
    for (const name of ["host-agent.ts", "sandbox-agent.ts", "recipe.test.ts"]) {
      fs.copyFileSync(new URL(`./native/${name}`, import.meta.url), path.join(directory, name));
    }
    for (const name of ["orders-agent.ts", "local-model.ts", "host-workflow.ts", "first-agent.ts", "verify-orders.py"]) {
      fs.copyFileSync(path.join(root, "examples/agent-observability", name), path.join(directory, name));
    }
    execute(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit", "--strict", "--skipLibCheck", "--target", "ES2022",
      "--module", "NodeNext", "--moduleResolution", "NodeNext", "host-agent.ts", "sandbox-agent.ts", "first-agent.ts", "recipe.test.ts"]);
    execute(process.execPath, ["--import", "tsx", "--test", "recipe.test.ts"]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
