import fs from "node:fs";
import path from "node:path";
import { AcceptanceCheckError, check, origins, sha256, until } from "../acceptance/context.mjs";
import { modelCounters, modelFailure } from "./model-failure.mjs";

export const model = Object.freeze({
  image: "ollama/ollama@sha256:fcf18828940c6919f6b9997d8f7a9730144c8df657589959732a73005a3464a3",
  name: "qwen3:4b-instruct",
  digest: "0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0"
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
  for (const name of ["text-tool-model.mts", "text-tool-model.test.mts"]) {
    fs.copyFileSync(new URL(name, import.meta.url), path.join(ctx.consumer, name));
  }
  ctx.execute("node", ["--import", "tsx", "--test", "text-tool-model.test.mts"], "Verify model transport compatibility", { cwd: ctx.consumer, env });
  const run = file => ctx.execute("node", ["--import", "tsx", file], "Framework runtime verification", { cwd: ctx.consumer, env });
  await gate("framework-native-tools", () => run("native.mts"));
  await gate("framework-durable-recovery", async () => {
    ctx.guard();
    for (const directory of ["test", "examples"]) fs.mkdirSync(path.join(ctx.consumer, directory), { recursive: true });
    for (const name of ["test/durable-worker.ts", "test/scripted-model.ts", "examples/durable-store.ts", "examples/durable-workflow.ts"]) {
      fs.copyFileSync(new URL(name, pkg), path.join(ctx.consumer, name));
    }
    fs.copyFileSync(new URL("./durable-workflows.mts", import.meta.url), path.join(ctx.consumer, "durable-workflows.mts"));
    let container;
    try {
      container = ctx.execute("docker", ["run", "--detach", "--name", `harakiri-framework-pg-${ctx.identity.id}`,
        "--label", `harakiri.acceptance=${ctx.identity.id}`, "--publish", "127.0.0.1::5432",
        "--memory", "256m", "--cpus", "1", "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:16.15-alpine"],
      "Start isolated workflow checkpoint database").trim();
      check(/^[a-f0-9]{64}$/.test(container), "Invalid owned workflow database identity");
      const address = ctx.execute("docker", ["port", container, "5432/tcp"], "Resolve isolated workflow database").trim();
      check(/^127\.0\.0\.1:\d+$/.test(address), "Workflow database must be runner-loopback only");
      await until("Workflow PostgreSQL readiness", async () => {
        try { ctx.execute("docker", ["exec", container, "pg_isready", "-U", "postgres"], "Check isolated database"); return true; }
        catch { return false; }
      });
      ctx.execute("node", ["--import", "tsx", "durable-workflows.mts"], "Verify native workflow recovery", {
        cwd: ctx.consumer, env: { ...env, WORKFLOW_DATABASE_URL: `postgresql://postgres@${address}/postgres` }
      });
    } finally {
      if (container && /^[a-f0-9]{64}$/.test(container)) {
        const owned = JSON.parse(ctx.execute("docker", ["inspect", container], "Inspect owned workflow database"))[0];
        check(owned.Config.Labels["harakiri.acceptance"] === ctx.identity.id, "Refuse unrelated workflow database cleanup");
        ctx.execute("docker", ["rm", "--force", container], "Remove owned workflow database");
      }
    }
  });
  let modelCalls;

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
      const result = JSON.parse(fs.readFileSync(path.join(ctx.consumer, "model-result.json"), "utf8"));
      check(result.status === "verified", "Model repair did not record independent verification");
      modelCalls = modelCounters(result.model);
      check(modelCalls.responses > 0, "Model repair did not call the model");
    } finally {
      if (container && /^[a-f0-9]{64}$/.test(container)) {
        const owned = JSON.parse(ctx.execute("docker", ["inspect", container], "Inspect owned model container"))[0];
        check(owned.Config.Labels["harakiri.acceptance"] === ctx.identity.id, "Refuse unrelated model cleanup");
        ctx.execute("docker", ["rm", "--force", container], "Remove owned model container");
      }
    }
  });
  return { adapterTarballSha256: sha256(fs.readFileSync(archive)), framework: manifest.peerDependencies.deepagents, model, modelCalls };
}
