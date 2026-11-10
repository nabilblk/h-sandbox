import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HarakiriClient } from "../../packages/sdk/dist/index.js";
import { docker, until } from "./docker.mjs";

const execute = promisify(execFile);
const image = "ollama/ollama:0.34.3@sha256:7ab595e4ead391f6818c7215297781282babe0701f6d9a9f8862ac591360a58b";
const model = "qwen3:4b-instruct";
const digest = "0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0";
const statePath = process.argv[2];
assert.ok(statePath, "Pass the running local preview's state.json");
const state = JSON.parse(await readFile(statePath, "utf8"));
assert.equal(state.kind, "harakiri-local-telemetry-demo");
assert.match(state.owner, /^hs-otel-[a-f0-9]{12}$/);
assert.equal(new URL(state.apiUrl).hostname, "127.0.0.1");
assert.ok(Date.parse(state.expiresAt) > Date.now() + 900_000, "Preview needs at least 15 minutes remaining");
const health = await (await fetch(`${state.apiUrl}/health`, { signal: AbortSignal.timeout(2000) })).json();
assert.equal(health.owner, state.owner);
const producer = JSON.parse(await readFile(state.producerPath, "utf8"));
const client = new HarakiriClient({ apiUrl: state.apiUrl, apiKey: producer.apiKey });
const directory = path.dirname(statePath), container = `${state.owner}-model`;
const configPath = path.join(directory, "llm-workload.json"), resultPath = path.join(directory, "llm-result.json");
const controller = new AbortController();
const interrupt = () => controller.abort();
process.on("SIGINT", interrupt); process.on("SIGTERM", interrupt);
let created = false;
try {
  const architecture = await docker(["info", "--format", "{{.Architecture}}"]);
  const platform = { aarch64: "linux/arm64", arm64: "linux/arm64", x86_64: "linux/amd64", amd64: "linux/amd64" }[architecture];
  assert.ok(platform, "Real-model qualification requires a native arm64 or amd64 Docker engine");
  const modelCache = path.join(directory, "model-cache");
  await mkdir(modelCache, { recursive: true, mode: 0o700 });
  await docker(["create", "--platform", platform, "--name", container, "--label", `io.harakiri.observability-qualification=${state.owner}`,
    "--network", state.owner, "--publish", "127.0.0.1::11434", "--cpus", "3", "--memory", "6g", "--pids-limit", "512",
    "--mount", `type=bind,source=${modelCache},target=/root/.ollama`, "--env", "GOMAXPROCS=3",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--env", "OLLAMA_NO_CLOUD=1", "--env", "OLLAMA_NUM_PARALLEL=1", image],
    { timeout: 600_000, signal: controller.signal });
  created = true;
  await docker(["start", container]);
  const ports = JSON.parse(await docker(["inspect", "--format", "{{json .NetworkSettings.Ports}}", container]));
  const modelUrl = `http://127.0.0.1:${ports["11434/tcp"][0].HostPort}`;
  await until("local model server", async () => {
    try { return (await fetch(`${modelUrl}/api/version`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(1000)]) })).ok; }
    catch { controller.signal.throwIfAborted(); return false; }
  });
  console.log("Downloading the pinned local 4B model; inference is CPU-limited and cloud is disabled.");
  const pull = await fetch(`${modelUrl}/api/pull`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, stream: true }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(600_000)]) });
  assert.ok(pull.ok && pull.body, "Local model download failed");
  let downloaded = false;
  for await (const line of createInterface({ input: Readable.fromWeb(pull.body) })) {
    const progress = JSON.parse(line);
    assert.equal(progress.error, undefined, "Local model download failed");
    downloaded = progress.status === "success";
  }
  assert.ok(downloaded, "Local model download did not complete");
  const tags = await (await fetch(`${modelUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })).json();
  assert.ok(tags.models.some((entry) => entry.name === model && entry.digest === digest), "Pinned model digest changed");
  const runs = [];
  for (const capture of ["content", "metadata"]) {
    controller.signal.throwIfAborted();
    const { run } = await client.agentRuns.create({ name: `LLM / Order reconciliation / ${capture}`, capture, sandboxId: producer.sandboxId });
    const grant = await client.agentRuns.grant(run.id, producer.sandboxId);
    let outcome = "unknown";
    try {
      const options = grant.exporterOptions("traces");
      const token = options.headers.Authorization.replace(/^Bearer /, "");
      await writeFile(configPath, JSON.stringify({ modelUrl, model, endpoint: options.url, token, captureContent: capture === "content", resultPath }), { mode: 0o600 });
      console.log(`Running the real model/tool workflow (${capture}).`);
      await rm(resultPath, { force: true });
      try {
        await execute(process.execPath, ["--import", "tsx", "real-agent.ts", configPath], {
          cwd: fileURLToPath(new URL("./frameworks/", import.meta.url)), env: { PATH: process.env.PATH, HOME: process.env.HOME },
          timeout: 300_000, maxBuffer: 1024 * 1024, signal: controller.signal
        });
      } catch (error) {
        await writeFile(path.join(directory, "llm-failure.log"), String(error.stderr ?? "Workload interrupted"), { mode: 0o600 });
        throw new Error(`Real agent failed; private diagnostic at ${path.join(directory, "llm-failure.log")}`);
      }
      const result = JSON.parse(await readFile(resultPath, "utf8"));
      assert.equal(result.verified, true);
      const window = { from: run.createdAt, to: new Date().toISOString(), includeContent: true, limit: 1000 };
      const snapshot = await until("actual generations and tool results are queryable", async () => {
        const read = await client.agentRuns.spans(run.id, window);
        const models = read.records.filter((span) => span.attributes["gen_ai.operation.name"] === "chat");
        const tools = read.records.filter((span) => span.attributes["gen_ai.tool.name"]);
        // Parent and child batches can become queryable at different times.
        return !read.partial && read.records.length === result.expectedSpans && models.length === result.generations
          && tools.length === result.calls.length ? read : false;
      }, 60_000);
      assert.equal(snapshot.partial, false, "The bounded demo must have complete span records");
      assert.equal(new Set(snapshot.records.map((span) => span.traceId)).size, 1, "One invocation must retain one trace");
      const generations = snapshot.records.filter((span) => span.attributes["gen_ai.operation.name"] === "chat");
      assert.equal(generations.reduce((sum, span) => sum + Number(span.attributes["gen_ai.usage.input_tokens"]), 0), result.inputTokens);
      assert.equal(generations.reduce((sum, span) => sum + Number(span.attributes["gen_ai.usage.output_tokens"]), 0), result.outputTokens);
      for (const span of generations) {
        assert.equal(span.attributes["gen_ai.provider.name"], "ollama");
        assert.ok(span.attributes["gen_ai.response.finish_reasons"], "Provider finish reason must survive");
        if (capture === "content") {
          assert.ok(JSON.parse(span.content.attributes["gen_ai.input.messages"]).length);
          assert.ok(JSON.parse(span.content.attributes["gen_ai.output.messages"]).length);
        } else assert.deepEqual(span.content.attributes, {});
      }
      const hidden = await client.agentRuns.spans(run.id, { ...window, includeContent: false });
      assert.ok(hidden.records.every((span) => !Object.keys(span.content.attributes).length));
      outcome = "succeeded";
      runs.push({ id: run.id, name: run.name, capture, outcome, model, modelDigest: digest, ...result,
        spans: snapshot.records.length, failedTools: snapshot.records.filter((span) => span.attributes["gen_ai.tool.name"] && span.status === "error").length,
        url: `${state.webUrl}/#dashboard/runs?run=${run.id}` });
    } finally {
      try { await client.agentRuns.close(run.id, outcome); }
      finally { await client.agentRuns.revokeGrant(run.id, grant.id); await rm(configPath, { force: true }); }
    }
  }
  state.runs = [...(state.runs ?? []), ...runs];
  await writeFile(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
  await writeFile(path.join(directory, "llm-evidence.json"), JSON.stringify({ model, image, digest, runs,
    boundary: "Real local inference and controlled tools. No sandbox runtime; association is test metadata. No external inference or paid API." }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(runs, null, 2));
} finally {
  process.off("SIGINT", interrupt); process.off("SIGTERM", interrupt);
  await rm(configPath, { force: true });
  if (created) {
    const owner = await docker(["inspect", "--format", '{{index .Config.Labels "io.harakiri.observability-qualification"}}', container]);
    assert.equal(owner, state.owner, "Refuse unrelated model cleanup");
    try {
      const logs = await execute("docker", ["logs", container], { timeout: 5000, maxBuffer: 4 * 1024 * 1024 });
      await writeFile(path.join(directory, "model.log"), logs.stdout + logs.stderr, { mode: 0o600 });
    } finally { await docker(["rm", "--force", container]); }
  }
}
