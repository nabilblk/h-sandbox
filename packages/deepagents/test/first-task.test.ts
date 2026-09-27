import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
const require = createRequire(import.meta.url);
const examples = new URL("../examples/", import.meta.url);
const command = "printf '%s\\n' \"printf '%s\\n' 'hello from Deep Agents'\" > hello.sh && bash hello.sh";
const prompt = `Write hello.sh that prints "hello from Deep Agents".
Run it with bash and report the output.`;

type Scenario = "success" | "text-blocks" | "no-tools" | "model-failure" | "missing-template" | "cleanup-failure";

/** Run the unchanged entry points in private child processes. Only the model module is replaced. */
async function runExample(name: "local" | "sandbox", scenario: Scenario = "success") {
  const directory = await mkdtemp(fileURLToPath(new URL("../.first-task-", import.meta.url)));
  const receipt = join(directory, "receipt.json");
  try {
    const source = await readFile(new URL(`first-${name}.ts`, examples), "utf8");
    await writeFile(join(directory, `first-${name}.ts`), source);
    // No live model, network, API key or production resource is reachable in this fixture.
    await writeFile(join(directory, "first-model.ts"), `
import { writeFileSync } from "node:fs";
import { AIMessage } from "@langchain/core/messages";
import { HarakiriClient } from "@h-sandbox/sdk";
import { LocalShellBackend } from "deepagents";
import { ScriptedModel } from ${JSON.stringify(new URL("./scripted-model.js", import.meta.url).href)};
import { fixture } from ${JSON.stringify(new URL("./fixture.js", import.meta.url).href)};
const f = fixture();
let written = false;
let closed = false;
const prompts = [];
f.state.onCommand = command => {
  if (command === ${JSON.stringify(command)}) written = true;
  f.state.output.exitCode = written ? 0 : 1;
  f.state.output.stdout = written ? "hello from Deep Agents\\n" : "";
};
if (${JSON.stringify(scenario)} === "cleanup-failure") {
  f.state.override = request => request.method === "DELETE"
    ? Response.json({ error: "provider_unavailable", message: "Cleanup failed." }, { status: 503 })
    : undefined;
}
HarakiriClient.fromEnv = () => f.client;
const close = LocalShellBackend.prototype.close;
LocalShellBackend.prototype.close = async function () { closed = true; await close.call(this); };
export const model = new ScriptedModel(${scenario === "model-failure" ? "[]" : `[
  ${scenario === "no-tools" ? "" : `new AIMessage({ content: "", tool_calls: [{
    name: "execute", id: "hello", type: "tool_call", args: { command: ${JSON.stringify(command)} }
  }] }),`}
  new AIMessage(${scenario === "text-blocks" ? '{ content: [{ type: "text", text: "hello from " }, { type: "text", text: "Deep Agents" }] }'
    : JSON.stringify(scenario === "no-tools" ? "I did not run any commands." : "hello from Deep Agents")})
]`});
const generate = model._generate.bind(model);
model._generate = async messages => {
  prompts.push(...messages.filter(message => message.getType() === "human").map(message => message.text));
  return generate();
};
process.on("exit", () => writeFileSync(${JSON.stringify(receipt)}, JSON.stringify({
  status: f.summary.status, capacityPhase: f.summary.capacityPhase, closed, written, prompts,
  commands: [...f.commands.values()].map(c => c.command),
  creates: f.requests.filter(r => r.method === "POST" && r.url.pathname === "/v1/sandboxes").length,
  deletes: f.requests.filter(r => r.method === "DELETE").length
})));
`);
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH, HOME: directory,
      LANGSMITH_TRACING: "false", LANGCHAIN_TRACING_V2: "false"
    };
    if (scenario !== "missing-template") env.HARAKIRI_TEMPLATE = "synthetic-linux";
    const result = await execute(process.execPath, ["--import", pathToFileURL(require.resolve("tsx")).href,
      `first-${name}.ts`], { cwd: directory, env, timeout: 30_000 }).then(
      value => ({ ...value, code: 0 }),
      (error: { stdout: string; stderr: string; code: number | string }) => error
    );
    const evidence = JSON.parse(await readFile(receipt, "utf8").catch(error => {
      throw new Error(`Example did not write its test receipt: ${result.stderr}`, { cause: error });
    }));
    const artifact = await readFile(join(directory, "deepagents-local/hello.sh"), "utf8").catch(() => null);
    const verification = artifact === null ? null : await execute("bash", ["hello.sh"], {
      cwd: join(directory, "deepagents-local"), env, timeout: 1_000
    });
    return { ...result, evidence, artifact, verification };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("first-task programs expose the framework directly without inline acceptance tests", async () => {
  for (const name of ["local", "sandbox"]) {
    const source = await readFile(new URL(`first-${name}.ts`, examples), "utf8");
    assert.match(source, /import \{ createDeepAgent/);
    assert.match(source, /createDeepAgent\(\{ model, backend \}\)/);
    assert.match(source, /recursionLimit: 12/);
    assert.doesNotMatch(source, /subagents:|memory:|skills:|node:assert|backend\.execute|as any/);
  }
});

for (const backend of ["local", "sandbox"] as const) {
  test(`${backend}: exact first-task program invokes the same prompt and real framework tools`, async () => {
    const result = await runExample(backend);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout.trim(), "hello from Deep Agents");
    assert.deepEqual(result.evidence.prompts, [prompt, prompt]);
    if (backend === "local") {
      assert.equal(result.artifact, "printf '%s\\n' 'hello from Deep Agents'\n");
      assert.equal(result.verification?.stdout.trim(), "hello from Deep Agents");
      assert.equal(result.evidence.closed, true);
      assert.equal(result.evidence.creates, 0);
    } else {
      assert.deepEqual(result.evidence.commands, [command]);
      assert.equal(result.evidence.written, true);
      assert.equal(result.evidence.status, "terminated");
      assert.equal(result.evidence.capacityPhase, "released");
      assert.equal(result.evidence.creates, 1);
      assert.equal(result.evidence.deletes, 1);
    }
  });
  test(`${backend}: structured model content is printed as text, not a JavaScript object`, async () => {
    const result = await runExample(backend, "text-blocks");
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout.trim(), "hello from Deep Agents");
  });
  test(`${backend}: model text is not presented as independent artifact verification`, async () => {
    const result = await runExample(backend, "no-tools");
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout.trim(), "I did not run any commands.");
    assert.equal(result.artifact, null);
    assert.equal(result.evidence.written, false);
    assert.equal(result.evidence.commands.length, 0);
    if (backend === "local") assert.equal(result.evidence.closed, true);
    else assert.equal(result.evidence.capacityPhase, "released");
  });
  test(`${backend}: model failure propagates and closes its owned backend`, async () => {
    const result = await runExample(backend, "model-failure");
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /unexpected extra model turn/);
    assert.equal(result.stdout.trim(), "");
    if (backend === "local") assert.equal(result.evidence.closed, true);
    else {
      assert.equal(result.evidence.capacityPhase, "released");
      assert.equal(result.evidence.deletes, 1);
    }
  });
}

test("missing template fails before creating a sandbox", async () => {
  const result = await runExample("sandbox", "missing-template");
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Set HARAKIRI_TEMPLATE/);
  assert.equal(result.evidence.creates, 0);
  assert.equal(result.evidence.deletes, 0);
});

test("sandbox cleanup failure is reported before the model's answer is printed", async () => {
  const result = await runExample("sandbox", "cleanup-failure");
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /HarakiriTaskCleanupError/);
  assert.equal(result.stdout.trim(), "");
  assert.equal(result.evidence.deletes, 1);
  assert.equal(result.evidence.capacityPhase, "active");
});
