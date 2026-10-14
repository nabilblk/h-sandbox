import fs from "node:fs";
import path from "node:path";
import { context, pinned, check, origins, sha256, until } from "../acceptance/context.mjs";
import { install } from "../acceptance/install.mjs";
import { operatorSession } from "../acceptance/browser.mjs";
import { importAcceptanceTemplate } from "../acceptance/first-task.mjs";
import { finishReceipt, publicFailure } from "../acceptance/receipt.mjs";
import { replicas } from "../acceptance/operator.mjs";
import { model } from "../sdk-acceptance/framework.mjs";
import { foreignPrincipal, revokeForeignPrincipal } from "./authorization.mjs";
import { installPublishedApi } from "./published-api.mjs";

process.umask(0o077);
const ctx = context();
ctx.guard();
const baseline = { ...pinned, ...JSON.parse(fs.readFileSync(new URL("./versions.json", import.meta.url))) };
const receipt = {
  kind: "python-agents-candidate", published: false, candidateSource: process.env.GITHUB_SHA,
  architecture: "amd64", results: [], startedAt: new Date().toISOString(),
  limits: ["Single-worker SQLite example, not HA or exactly-once", "One real model repair, not a model benchmark", "No packages published or existing deployment changed"]
};
const publish = () => fs.writeFileSync("standalone-acceptance-report.json", JSON.stringify(receipt, null, 2));
let operator, activeGate;
async function gate(name, action) {
  activeGate = name;
  const disk = fs.statfsSync(ctx.identity.directory);
  check(disk.bavail * disk.bsize >= 2 * 1024 ** 3, "Less than 2 GiB runner disk headroom");
  console.log(`Python acceptance: ${name}`);
  const result = await action();
  receipt.results.push({ gate: name, status: "passed" });
  publish();
  return result;
}
try {
  receipt.installation = await gate("published-installation", () => install(ctx, baseline));
  receipt.apiMaintenance = await gate("published-api-maintenance", () => installPublishedApi(ctx, baseline.apiMaintenance));
  operator = await gate("oidc-onboarding", () => operatorSession(ctx));
  const template = await gate("template-import", () => importAcceptanceTemplate(ctx, operator.client));
  receipt.template = pinned.opencodeImage;
  const readonly = await operator.request("/v1/api-keys", "POST", { name: "python-read-only", scopes: ["sandboxes:read"] }, 201);
  const foreign = await gate("foreign-organization-fixture", () => foreignPrincipal(ctx));
  const env = Object.fromEntries(["PATH", "HOME", "SSL_CERT_FILE"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  Object.assign(env, { UV_NO_CONFIG: "1", PYTHONNOUSERSITE: "1", LANGSMITH_TRACING: "false", LANGCHAIN_TRACING_V2: "false",
    GITHUB_ACTIONS: process.env.GITHUB_ACTIONS, RUNNER_ENVIRONMENT: process.env.RUNNER_ENVIRONMENT,
    HARAKIRI_API_URL: origins.api, HARAKIRI_API_KEY: ctx.read("client-key.json").token,
    HARAKIRI_TEMPLATE: template, HARAKIRI_READ_ONLY_KEY: readonly.token,
    HARAKIRI_FOREIGN_KEY: foreign.token, HARAKIRI_PYTHON_ACCEPTANCE: "disposable-runner" });
  const consumer = path.join(ctx.identity.directory, "python-consumer");
  fs.mkdirSync(consumer);
  const python = path.join(consumer, "venv/bin/python");
  await gate("installed-candidate-wheels", () => {
    ctx.execute("uv", ["run", "--project", "python", "--frozen", "python", "python/check_packages.py"], "Build and verify Python candidate");
    const artifacts = fs.readdirSync("dist-packages/python").filter(name => name.endsWith(".whl"));
    check(artifacts.length === 2, "Expected exactly two Python wheels");
    receipt.wheels = Object.fromEntries(artifacts.map(name => [name, sha256(fs.readFileSync(`dist-packages/python/${name}`))]));
    ctx.execute("uv", ["venv", "--python", "3.12", path.join(consumer, "venv")], "Create isolated Python consumer", { env });
    ctx.execute("uv", ["pip", "install", "--python", python, ...artifacts.map(name => path.resolve(`dist-packages/python/${name}`)),
      "langchain-ollama==1.1.0", "langgraph-checkpoint-sqlite==3.1.1"], "Install Python candidate wheels", { env });
    for (const file of ["native.py", "model.py", "provider.py", "documented_examples.py"]) fs.copyFileSync(new URL(file, import.meta.url), path.join(consumer, file));
    for (const file of ["worker.py", "approval.py"]) fs.copyFileSync(new URL(`../../examples/python-workflow-recovery/${file}`, import.meta.url), path.join(consumer, file));
    fs.copyFileSync(new URL("../../examples/python-repository-repair/repair.py", import.meta.url), path.join(consumer, "repair.py"));
    fs.cpSync(new URL("../../examples/python-repository-repair/fixture", import.meta.url), path.join(consumer, "fixture"), { recursive: true });
  });
  const run = file => ctx.execute(python, [file], "Python installed native consumer", { cwd: consumer, env });
  await gate("installed-documentation-examples", () => {
    ctx.guard();
    ctx.execute("pnpm", ["--filter", "@harakiri/shared", "build"], "Build documentation contracts");
    ctx.execute("pnpm", ["--filter", "@harakiri/web", "docs:export"], "Extract public documentation downloads");
    const downloads = new URL("../../apps/web/public/docs/examples/python/", import.meta.url);
    const markdown = fs.readFileSync(new URL("../../apps/web/public/docs/deepagents-python.md", import.meta.url), "utf8");
    const destination = path.join(consumer, "documented-programs");
    fs.mkdirSync(destination);
    for (const name of ["first_model.py", "first_local.py", "first_sandbox.py", "first_async.py", "first_existing.py"]) {
      const download = fs.readFileSync(new URL(name, downloads), "utf8");
      const source = fs.readFileSync(new URL(`../../examples/python-first-task/${name}`, import.meta.url), "utf8");
      check(download === source && markdown.includes(source.trimEnd()), `Python documentation drift: ${name}`);
      fs.writeFileSync(path.join(destination, name), download);
    }
    try { run("documented_examples.py"); }
    finally {
      const result = path.join(consumer, "documented-examples-result.json");
      if (fs.existsSync(result)) receipt.examples = JSON.parse(fs.readFileSync(result));
    }
    check(receipt.examples.results.length === 4 && receipt.examples.results.every(item => item.status === "passed"), "Incomplete introductory examples");
  });
  await gate("native-sdk-and-framework", () => run("native.py"));
  receipt.native = JSON.parse(fs.readFileSync(path.join(consumer, "native-result.json")));
  await gate("provider-loss-and-unconfirmed-cleanup", async () => {
    const phase = name => ctx.execute(python, ["provider.py", name], "Python provider fault phase", { cwd: consumer, env });
    phase("prepare");
    try {
      await replicas(ctx, ["opensandbox-server"], 0);
      phase("unavailable");
    } finally {
      await replicas(ctx, ["opensandbox-server"], 1);
    }
    phase("observe");
  });
  for (const [name, option] of [["native-remote-deadline", "--remote-deadline"], ["native-large-artifact-limits", "--large-artifacts"]]) {
    const failure = path.join(consumer, "native-failure.json");
    fs.rmSync(failure, { force: true });
    try {
      await gate(name, () => ctx.execute(python, ["native.py", option], "Python boundary consumer", { cwd: consumer, env }));
      (receipt.boundaries ??= {})[name] = JSON.parse(fs.readFileSync(path.join(consumer, "native-result.json")));
    } catch (error) {
      receipt.results.push({ gate: name, status: "failed", failure: publicFailure(error) });
      if (fs.existsSync(failure)) (receipt.nativeFailures ??= []).push(JSON.parse(fs.readFileSync(failure)));
    } finally {
      fs.rmSync(failure, { force: true });
      publish();
    }
  }
  await gate("real-model-repair", async () => {
    ctx.guard();
    let container;
    try {
      container = ctx.execute("docker", ["run", "--detach", "--label", `harakiri.acceptance=${ctx.identity.id}`,
        "--publish", "127.0.0.1:11434:11434", "--memory", "6g", "--cpus", "3", "--env", "OLLAMA_NO_CLOUD=1", model.image], "Start owned inference").trim();
      check(/^[a-f0-9]{64}$/.test(container), "Invalid owned model identity");
      await until("Owned model readiness", async () => {
        try { return (await fetch("http://127.0.0.1:11434/api/version", { signal: AbortSignal.timeout(2000) })).ok; }
        catch { return false; }
      });
      ctx.execute("docker", ["exec", container, "ollama", "pull", model.name], "Download model");
      const tags = await (await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(10000) })).json();
      check(tags.models.some(item => item.name === model.name && item.digest === model.digest), "Model digest drift");
      run("model.py");
      receipt.model = { ...model, ...JSON.parse(fs.readFileSync(path.join(consumer, "model-result.json"))) };
      check(receipt.model.status === "verified" && receipt.model.toolResponses > 0, "Model repair incomplete");
    } finally {
      if (container && /^[a-f0-9]{64}$/.test(container)) {
        const info = JSON.parse(ctx.execute("docker", ["inspect", container], "Inspect owned model"))[0];
        check(info.Config.Labels["harakiri.acceptance"] === ctx.identity.id, "Refuse unrelated cleanup");
        ctx.execute("docker", ["rm", "--force", container], "Clean owned model");
      }
    }
  });
  await gate("key-revocation", async () => {
    revokeForeignPrincipal(ctx, foreign.id);
    const foreignResponse = await fetch(`${origins.api}/v1/sandboxes`, { headers: { "x-api-key": foreign.token }, signal: AbortSignal.timeout(10000) });
    check(foreignResponse.status === 401, "Foreign fixture key was not revoked");
    await operator.request(`/v1/api-keys/${readonly.key.id}`, "DELETE");
    await operator.request(`/v1/api-keys/${ctx.read("client-key.json").id}`, "DELETE");
    const response = await fetch(`${origins.api}/v1/templates`, { headers: { "x-api-key": env.HARAKIRI_API_KEY }, signal: AbortSignal.timeout(10000) });
    check(response.status === 401, "Candidate key was not revoked");
  });
  receipt.status = receipt.results.some(result => result.status === "failed") ? "failed" : "configured_gates_passed";
} catch (error) {
  ctx.save("python-failure.json", { gate: activeGate, message: error.message, stack: error.stack });
  receipt.results.push({ gate: activeGate, status: "failed", failure: publicFailure(error) });
  const failure = path.join(ctx.identity.directory, "python-consumer/native-failure.json");
  if (fs.existsSync(failure)) receipt.nativeFailure = JSON.parse(fs.readFileSync(failure));
  const partial = path.join(ctx.identity.directory, "python-consumer/native-result.json");
  if (!receipt.native && fs.existsSync(partial)) receipt.native = JSON.parse(fs.readFileSync(partial));
  receipt.status = "failed";
  process.exitCode = 1;
} finally {
  await finishReceipt(receipt, {
    browser: async () => { if (operator) await operator.browser.close(); },
    portForwards: () => ctx.stopForwards()
  });
  if (receipt.status === "failed") process.exitCode = 1;
  publish();
}
