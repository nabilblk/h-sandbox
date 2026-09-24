import fs from "node:fs";
import path from "node:path";
import { AcceptanceCheckError, check, origins, sha256, until } from "../acceptance/context.mjs";
import { modelFailure } from "./model-failure.mjs";

export const model = Object.freeze({
  image: "ollama/ollama@sha256:fcf18828940c6919f6b9997d8f7a9730144c8df657589959732a73005a3464a3",
  name: "qwen3:4b",
  digest: "359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7"
});

export async function exerciseFramework(ctx, template, gate) {
  ctx.guard();
  const pkg = new URL("../../packages/deepagents/", import.meta.url);
  ctx.execute("pnpm", ["--filter", "@h-sandbox/deepagents", "build"], "Build adapter");
  ctx.execute("pnpm", ["--filter", "@h-sandbox/deepagents", "pack", "--pack-destination", ctx.identity.directory], "Pack adapter");
  const archives = fs.readdirSync(ctx.identity.directory).filter(name => /^h-sandbox-deepagents-.*\.tgz$/.test(name));
  check(archives.length === 1, "Adapter archive is ambiguous");
  const archive = ctx.file(archives[0]);
  const manifest = JSON.parse(fs.readFileSync(new URL("package.json", pkg)));
  const peers = Object.entries(manifest.devDependencies).filter(([name]) => name !== "@h-sandbox/sdk")
    .map(([name, version]) => `${name}@${version}`);
  const env = { ...process.env, NPM_CONFIG_USERCONFIG: ctx.file("npmrc"), NPM_CONFIG_GLOBALCONFIG: ctx.file("npmrc-global"),
    NPM_CONFIG_REGISTRY: "https://registry.npmjs.org", LANGSMITH_TRACING: "false", LANGCHAIN_TRACING_V2: "false",
    HARAKIRI_DEEPAGENTS_ACCEPTANCE: "disposable-runtime", HARAKIRI_API_URL: origins.api,
    HARAKIRI_API_KEY: ctx.read("client-key.json").token, HARAKIRI_TEMPLATE: template };
  delete env.NPM_TOKEN; delete env.NODE_AUTH_TOKEN;
  ctx.execute("npm", ["install", "--prefix", ctx.consumer, "--ignore-scripts", "--no-audit", "--no-fund",
    archive, ...peers, "@langchain/ollama@1.3.0"], "Install adapter consumer", { env });
  for (const name of ["test/native.mts", "test/scripted-model.ts", "examples/run-repair.ts"]) {
    fs.copyFileSync(new URL(name, pkg), path.join(ctx.consumer, path.basename(name)));
  }
  fs.copyFileSync(new URL("./model-repair.mts", import.meta.url), path.join(ctx.consumer, "model-repair.mts"));
  fs.copyFileSync(new URL("./model-failure.mjs", import.meta.url), path.join(ctx.consumer, "model-failure.mjs"));
  const run = file => ctx.execute("node", ["--import", "tsx", file], "Framework runtime verification", { cwd: ctx.consumer, env });
  await gate("framework-native-tools", () => run("native.mts"));

  await gate("framework-model-repair", async () => {
    ctx.guard();
    const name = `harakiri-model-${ctx.identity.id}`;
    let container;
    try {
      container = ctx.execute("docker", ["run", "--detach", "--name", name, "--label", `harakiri.acceptance=${ctx.identity.id}`,
        "--publish", "127.0.0.1:11434:11434", "--memory", "6g", "--cpus", "3", "--env", "OLLAMA_NO_CLOUD=1",
        model.image], "Start isolated inference").trim();
      check(/^[a-f0-9]{64}$/.test(container), "Invalid owned model container identity");
      await until("Runner-local model server", async () => {
        try { return (await fetch("http://127.0.0.1:11434/api/version", { signal: AbortSignal.timeout(2000) })).ok; }
        catch { return false; }
      });
      ctx.execute("docker", ["exec", container, "ollama", "pull", model.name], "Pull tool-capable model");
      const response = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(10000) });
      check(response.ok, "Cannot verify model digest");
      const models = (await response.json()).models;
      check(models.some(item => item.name === model.name && item.digest === model.digest), "Model digest drift");
      try { run("model-repair.mts"); }
      catch (error) {
        const file = path.join(ctx.consumer, "model-failure.json");
        if (!fs.existsSync(file)) throw error;
        const failure = JSON.parse(fs.readFileSync(file, "utf8"));
        // Validate again at the public evidence boundary, including fixed stage names.
        const safe = modelFailure(failure);
        throw new AcceptanceCheckError(`Model repair: ${JSON.stringify(safe)}`);
      }
    } finally {
      if (container && /^[a-f0-9]{64}$/.test(container)) {
        const owned = JSON.parse(ctx.execute("docker", ["inspect", container], "Inspect owned model container"))[0];
        check(owned.Config.Labels["harakiri.acceptance"] === ctx.identity.id, "Refuse unrelated model cleanup");
        ctx.execute("docker", ["rm", "--force", container], "Remove owned model container");
      }
    }
  });
  return { adapterTarballSha256: sha256(fs.readFileSync(archive)), framework: manifest.peerDependencies.deepagents, model };
}
