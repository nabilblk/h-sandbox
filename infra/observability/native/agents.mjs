import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { check, origins, until } from "../../acceptance/context.mjs";
import { withModel, pinnedModel } from "./model.mjs";
import { agentFailure, AgentAcceptanceError } from "./agent-failure.ts";

const agentEnvironment = { LANGSMITH_TRACING: "false", LANGCHAIN_TRACING_V2: "false", LANGCHAIN_CALLBACKS_BACKGROUND: "false" };
const source = name => fs.readFileSync(new URL(name, import.meta.url));
const execute = promisify(execFile);

async function qualifySignals(client, run, result) {
  console.log("Real-agent check: query model and tool spans");
  check(result.verified && result.generations >= 2, "The real agent did not complete its tool workflow");
  const window = { from: run.createdAt, to: new Date().toISOString(), includeContent: true, limit: 1000 };
  const spans = await until("Real model and tool telemetry", async () => {
    const snapshot = await client.agentRuns.spans(run.runId, window);
    const models = snapshot.records.filter(span => span.attributes["openinference.span.kind"] === "LLM");
    const tools = snapshot.records.filter(span => span.attributes["openinference.span.kind"] === "TOOL");
    return !snapshot.partial && models.length === result.generations && tools.length === result.calls.length
      && models.every(span => span.parent === "present") ? snapshot : false;
  }, 90_000);
  const models = spans.records.filter(span => span.attributes["openinference.span.kind"] === "LLM");
  check(models.every(span => span.parent === "present"), "Model spans must have resolvable parents");
  check(models.reduce((sum, span) => sum + Number(span.attributes["llm.token_count.prompt"]), 0) === result.inputTokens, "Actual input-token totals differ");
  check(models.reduce((sum, span) => sum + Number(span.attributes["llm.token_count.completion"]), 0) === result.outputTokens, "Actual output-token totals differ");
  check(models.some(span => Object.keys(span.content.attributes).length > 0), "Opted-in model content was not captured");
  const logs = await until("Actual validator log", async () => {
    const snapshot = await client.agentRuns.logs(run.runId, window);
    return snapshot.records.some(log => log.content.body?.includes('"verified": true')) ? snapshot : false;
  }, 90_000);
  console.log("Real-agent check: authorized content and validator output received");
  const hidden = await client.agentRuns.spans(run.runId, { ...window, includeContent: false });
  check(hidden.records.every(span => Object.keys(span.content.attributes).length === 0), "Metadata reads exposed model content");
  return { runId: run.runId, ...result, spans: spans.records.length, logs: logs.records.length, modelStepId: models[0].id };
}

/** Infrastructure owns only the model. All workload execution uses the public SDK. */
export async function exerciseAgents(ctx, client, sandbox, apiKey, gate, browser) {
  ctx.guard();
  const evidence = { model: pinnedModel, workflows: [] };
  await sandbox.files.write("verify-orders.py", source("../../../examples/agent-observability/verify-orders.py"));
  await withModel(ctx, gate, async model => {
    await gate("real-agent-host-tools", async () => {
      const configName = "telemetry-host-agent.json", resultName = "telemetry-host-result.json";
      ctx.save(configName, { apiUrl: origins.api, apiKey, sandboxId: sandbox.id, modelUrl: model.localUrl,
        model: model.name, resultPath: ctx.file(resultName) });
      try {
        // Keep SDK connections and the signed-in browser responsive during inference.
        try {
          await execute(process.execPath, ["--import", "tsx", "host-agent.ts", ctx.file(configName)], {
            cwd: ctx.consumer, env: { PATH: process.env.PATH, HOME: process.env.HOME, ...agentEnvironment },
            timeout: 420_000, maxBuffer: 1024 * 1024
          });
        } catch (error) {
          ctx.save("telemetry-host-failure.json", { code: error.code, stdout: error.stdout, stderr: error.stderr });
          const detail = fs.existsSync(ctx.file(resultName)) ? ctx.read(resultName).failure : error;
          throw new AgentAcceptanceError(agentFailure(detail));
        }
        const result = ctx.read(resultName);
        console.log("Real-agent check: host inference and sandbox validation completed");
        const signals = await qualifySignals(client, result, result);
        evidence.workflows.push({ topology: "host-agent-sandbox-tools", ...signals });
        await browser(result.runId, signals.modelStepId);
      } finally { fs.rmSync(ctx.file(configName), { force: true }); }
    });
    await gate("real-agent-in-sandbox", async () => {
      // Only a short-lived write-only grant enters the workload, never the host API key.
      const { run } = await client.agentRuns.create({ name: "Real LangChain agent inside sandbox", sandboxId: sandbox.id, capture: "content" });
      const grant = await client.agentRuns.grant(run.id, sandbox.id);
      let outcome = "failed";
      let grantPath;
      try {
        const archive = fs.readdirSync(ctx.identity.directory).find(name => /^h-sandbox-sdk-.*\.tgz$/.test(name));
        check(archive, "Source SDK tarball missing");
        const consumer = JSON.parse(fs.readFileSync(path.join(ctx.consumer, "package.json")));
        const allowed = new Set(["@langchain/core", "@langchain/ollama", "langchain",
          "@arizeai/openinference-instrumentation-langchain", "tsx", "typescript", "@types/node"]);
        const dependencies = Object.fromEntries(Object.entries(consumer.dependencies)
          .filter(([name]) => name.startsWith("@opentelemetry/") || allowed.has(name)));
        dependencies["@h-sandbox/sdk"] = "file:./sdk.tgz";
        await sandbox.files.write("sdk.tgz", fs.readFileSync(ctx.file(archive)));
        await sandbox.files.write("package.json", JSON.stringify({ private: true, type: "module", dependencies }));
        for (const file of ["sandbox-agent.ts", "orders-agent.ts", "local-model.ts"]) {
          await sandbox.files.write(file, fs.readFileSync(path.join(ctx.consumer, file)));
        }
        await sandbox.run("npm install --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org", { check: true, timeoutMs: 180_000 });
        const token = grant.exporterOptions("traces").headers.Authorization.slice("Bearer ".length);
        const grantFile = await sandbox.files.write(".telemetry-agent.json", JSON.stringify({ model: model.name, modelUrl: model.remoteUrl,
          apiUrl: "http://harakiri-api.harakiri-preview.svc.cluster.local:8080", grant: { ...grant.toJSON(), token } }), { mode: "0600" });
        grantPath = grantFile.path;
        const command = await sandbox.processes.start({ command: "node --import tsx sandbox-agent.ts", env: agentEnvironment, timeoutMs: 420_000, detached: true });
        await command.wait({ timeoutMs: 450_000 });
        const result = JSON.parse(await sandbox.files.readText("agent-result.json"));
        const signals = await qualifySignals(client, { runId: run.id, createdAt: run.createdAt }, result);
        evidence.workflows.push({ topology: "agent-inside-sandbox", commandId: command.id, ...signals });
        outcome = "succeeded";
      } finally {
        try { if (grantPath) await sandbox.files.remove(grantPath); }
        finally {
          try { await client.agentRuns.close(run.id, outcome); }
          finally { await client.agentRuns.revokeGrant(run.id, grant.id); }
        }
      }
    });
  });
  return evidence;
}
