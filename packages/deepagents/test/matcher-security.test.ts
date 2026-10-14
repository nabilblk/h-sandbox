import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import test, { type TestContext } from "node:test";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { createDeepAgent } from "deepagents";
import { HarakiriSandboxBackend } from "@h-sandbox/deepagents";
import { fixture } from "./fixture.js";
import { ScriptedModel } from "./scripted-model.js";

process.env.LANGSMITH_TRACING = "false";
process.env.LANGCHAIN_TRACING_V2 = "false";

const require = createRequire(import.meta.url);
const frameworkRequire = createRequire(require.resolve("deepagents"));
const matcherRequire = createRequire(frameworkRequire.resolve("micromatch"));
const braces = matcherRequire("braces") as Record<string, (...args: unknown[]) => unknown>;
const nestedPattern = "{".repeat(4_000) + "a,b" + "}".repeat(4_000);

// Instrument the installed dependency, not a replacement matcher. Node isolates
// this test file; TestContext restores the methods after each test.
function forbidBraceParsing(t: TestContext) {
  return ["create", "parse", "compile", "expand", "stringify"].map(method =>
    t.mock.method(braces, method, () => { throw new Error(`Unexpected braces.${method} call`); })
  );
}

test("the installed advisory reproduces only in bounded child processes", () => {
  assert.equal(matcherRequire("braces/package.json").version, "3.0.3", "Reassess the advisory when braces changes.");
  for (const method of ["compile", "expand"]) {
    const script = `
      const braces = require(${JSON.stringify(matcherRequire.resolve("braces"))});
      try {
        braces[${JSON.stringify(method)}](${JSON.stringify(nestedPattern)});
        process.stdout.write("completed");
      } catch (error) {
        process.stdout.write(error.name + ": " + error.message);
      }
    `;
    const result = spawnSync(process.execPath, ["--max-old-space-size=64", "--stack-size=512", "-e", script], {
      encoding: "utf8", timeout: 3_000, maxBuffer: 8_192
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "RangeError: Maximum call stack size exceeded");
  }
});

test("instrumentation detects the fast-glob expansion used by local filesystem backends", t => {
  const guards = forbidBraceParsing(t);
  const fastGlob = frameworkRequire("fast-glob") as { generateTasks: (pattern: string) => unknown };
  assert.throws(() => fastGlob.generateTasks("*.{ts,js}"), /Unexpected braces\./);
  assert.ok(guards.some(guard => guard.mock.callCount() > 0));
});

test("the installed micromatch permission matcher does not use brace expansion", t => {
  const guards = forbidBraceParsing(t);
  const matcher = frameworkRequire("micromatch") as {
    isMatch: (path: string, pattern: string, options: { dot: boolean }) => boolean;
  };
  assert.equal(matcher.isMatch("/app/a.txt", "/app{,/**}", { dot: true }), true);
  assert.equal(matcher.isMatch("/app/a.txt", nestedPattern, { dot: true }), false);
  for (const guard of guards) assert.equal(guard.mock.callCount(), 0);
});

test("Harakiri glob and grep do not invoke braces, including nested agent input", async t => {
  const guards = forbidBraceParsing(t);
  const f = fixture();
  const backend = new HarakiriSandboxBackend(f.sandbox);
  f.state.output.stdout = "6\t1700000000\tf\t/app/src/a.ts\n6\t1700000000\tf\t/app/a.txt\n";
  assert.deepEqual((await backend.glob("**/*.ts", "/app")).files?.map(file => file.path), ["src/a.ts"]);
  assert.deepEqual((await backend.glob("a.?xt", "/app")).files?.map(file => file.path), ["a.txt"]);
  assert.deepEqual((await backend.glob(nestedPattern, "/app")).files, []);
  f.state.output.stdout = "/app/src/a.ts:1:hello\n";
  assert.equal((await backend.grep("hello", "/app", "*.ts")).matches?.[0].text, "hello");
  await backend.grep("hello", "/app", nestedPattern);
  assert.equal(f.commands.size, 5, "Search uses the selected remote sandbox transport.");
  for (const guard of guards) assert.equal(guard.mock.callCount(), 0);
});

test("real framework search tools retain the parser boundary", async t => {
  const guards = forbidBraceParsing(t);
  const f = fixture();
  const toolCall = (name: string, args: Record<string, unknown>, id: string) => new AIMessage({
    content: "", tool_calls: [{ name, args, id, type: "tool_call" }]
  });
  f.state.override = request => {
    if (!request.url.pathname.endsWith("/logs")) return;
    const stdout = request.url.pathname.includes("/cmd_3/")
      ? "/app/a.txt:1:hello\n"
      : "6\t1700000000\tf\t/app/a.txt\n";
    return Response.json({ ...f.state.output, stdout });
  };
  const agent = createDeepAgent({
    model: new ScriptedModel([
      toolCall("glob", { pattern: "*.txt", path: "/app" }, "glob_ordinary"),
      toolCall("glob", { pattern: nestedPattern, path: "/app" }, "glob_nested"),
      toolCall("grep", { pattern: "hello", path: "/app", glob: "*.txt" }, "grep_ordinary"),
      new AIMessage("done")
    ]),
    backend: new HarakiriSandboxBackend(f.sandbox), subagents: [], memory: [], skills: []
  });
  const result = await agent.invoke({ messages: [{ role: "user", content: "Find the file and search it." }] });
  const responses = result.messages.filter(message => message instanceof ToolMessage);
  assert.equal(responses.length, 3);
  assert.match(String(responses[0].content), /a\.txt/);
  assert.match(String(responses[1].content), /No files found/);
  assert.match(String(responses[2].content), /a\.txt/);
  assert.equal(f.commands.size, 3);
  for (const guard of guards) assert.equal(guard.mock.callCount(), 0);
});
