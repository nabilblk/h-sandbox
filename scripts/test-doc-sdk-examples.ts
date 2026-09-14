import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishedSdkExamples, publishedSdkVersion } from "../apps/web/src/sdk-doc-examples.js";
import { fileUploadSchema } from "../apps/api/src/routes/sandbox-runtime.schema.js";

// Run the exact displayed programs with registry packages, never workspace links,
// maintainer credentials, a live sandbox, or an LLM. The fixture is protocol-only.
const directory = await mkdtemp(join(tmpdir(), "harakiri-doc-sdk-"));
const env = { PATH: process.env.PATH, HOME: directory, TMPDIR: directory };
type Example = keyof typeof publishedSdkExamples;
type Scenario = {
  example: Example;
  fault?: "readiness" | "command" | "cleanup" | "both" | "hung-cleanup" | "checksum" | "redirect";
  providerKey?: boolean;
  missingModel?: boolean;
};
type Call = { method: string; path: string; body: Record<string, any>; query: URLSearchParams };

async function run(command: string, args: string[], extraEnv: Record<string, string> = {}) {
  const child = spawn(command, args, { cwd: directory, env: { ...env, ...extraEnv }, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 120_000);
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    return { code, stdout, stderr };
  } finally { clearTimeout(timeout); }
}

async function check(scenario: Scenario) {
  const calls: Call[] = [];
  const fixtureErrors: unknown[] = [];
  const sandboxes = new Map<string, { id: string; status: string; capacityPhase: string }>();
  const observations = new Map<string, number>();
  const files = new Map<string, string>();
  let password = "", started = false, archived = false;
  let uploaded: Record<string, any>;
  const server = createServer(async (req, res) => {
    const send = (data: unknown, status = 200) => {
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(data));
    };
    try {
      const url = new URL(req.url!, origin);
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      const call = { method: req.method!, path: url.pathname, body, query: url.searchParams };
      calls.push(call);
      const { method, path } = call;
      if (path.startsWith("/proxy/")) {
        assert.ok(started, "server must start before any probe or SDK call");
        assert.equal(req.headers["x-api-key"], undefined, "control-plane key must not reach the application");
        assert.equal(req.headers["x-harakiri-route-token"], "route-test-token");
        assert.equal(req.headers.authorization, "Basic " + Buffer.from("opencode:" + password).toString("base64"));
        if (path === "/proxy/r1/global/health") return send({ healthy: true });
        if (path === "/proxy/r1/config") {
          if (scenario.fault === "redirect") return void res.writeHead(302, { location: origin + "/escaped" }).end();
          return send({ model: "fixture/no-inference" });
        }
        throw new Error("Unexpected application request: " + path);
      }
      assert.equal(req.headers["x-api-key"], "hk_docs_protocol_test");
      if (method === "POST" && path === "/v1/workspaces") return send({ workspace: { id: "wsp_test", status: "available" } });
      if (method === "GET" && path === "/v1/workspaces/wsp_test") {
        const attached = [...sandboxes.values()].some((sandbox) => sandbox.capacityPhase !== "released");
        return send({ workspace: { id: "wsp_test", status: attached ? "attached" : "available" } });
      }
      if (method === "POST" && path === "/v1/workspaces/wsp_test/archive") {
        assert.ok([...sandboxes.values()].every((sandbox) => sandbox.capacityPhase === "released"));
        archived = true;
        return send({ workspace: { id: "wsp_test", status: "archived" } });
      }
      if (method === "POST" && path === "/v1/sandboxes") {
        assert.equal(body.wait, false, "retain an accepted ID before observing readiness");
        assert.equal(typeof body.idempotencyKey, "string");
        if (scenario.example === "workspace") assert.equal(body.workspaceId, "wsp_test");
        if (scenario.example === "opencode-headless") assert.deepEqual(body.env, scenario.providerKey ? { ANTHROPIC_API_KEY: "provider-test-key" } : undefined);
        password = body.env?.OPENCODE_SERVER_PASSWORD ?? "";
        const sandbox = { id: "sbx_" + (sandboxes.size + 1), status: "creating", capacityPhase: "reserved" };
        sandboxes.set(sandbox.id, sandbox);
        return send({ sandbox }, 202);
      }
      const match = path.match(/^\/v1\/sandboxes\/(sbx_\d+)(.*)$/);
      assert.ok(match, "Unexpected request: " + method + " " + path);
      const [, id, action] = match;
      const sandbox = sandboxes.get(id)!;
      if (method === "DELETE" && !action) {
        if (["cleanup", "both"].includes(scenario.fault ?? "")) return send({ error: "fixture_cleanup_failure" }, 500);
        if (scenario.fault === "hung-cleanup") return;
        sandbox.status = "terminated";
        sandbox.capacityPhase = "releasing";
        return send({ sandbox });
      }
      if (method === "GET" && !action) {
        if (sandbox.status === "terminated") {
          const count = (observations.get(id) ?? 0) + 1;
          observations.set(id, count);
          if (count >= 2) sandbox.capacityPhase = "released";
        }
        return send({ sandbox });
      }
      if (action === "/readiness") {
        const failed = ["readiness", "both"].includes(scenario.fault ?? "");
        sandbox.status = failed ? "error" : "running";
        return send({ sandbox, readiness: { status: failed ? "failed" : "ready", checkedAt: new Date().toISOString() } });
      }
      if (action === "/run" && method === "POST") {
        if (scenario.example === "opencode-headless") {
          const quoted = await run("sh", ["-c", 'opencode() { printf "%s\\n" "$@"; }; ' + body.command]);
          assert.equal(quoted.code, 0, quoted.stderr);
          assert.equal(quoted.stdout, "run\n--model\nfixture/model'quoted\nWrite hello.py that prints hello, then run it.\n");
        }
        return send({ result: { exitCode: scenario.fault === "command" ? 17 : 0, stdout: scenario.example === "worker" ? "sdk-worker-ready\n" : "4\n", stderr: "" } });
      }
      if (action === "/files" && method === "PUT") {
        if (scenario.example === "worker") assert.equal(body.content, "print('sdk-worker-ready')\n");
        files.set(body.path, body.content);
        return send({ path: body.path });
      }
      if (action === "/files/read") return send({ path: url.searchParams.get("path"), content: files.get(url.searchParams.get("path")!) });
      if (action === "/files/upload") {
        uploaded = fileUploadSchema.parse(body);
        const bytes = Buffer.from(uploaded.contentBase64, "base64");
        assert.equal(uploaded.sizeBytes, bytes.length);
        assert.equal(uploaded.sha256, "sha256:" + createHash("sha256").update(bytes).digest("hex"));
        return send({ path: body.path, sizeBytes: bytes.length, sha256: uploaded.sha256 });
      }
      if (action === "/files/download") {
        return send({ ...uploaded, sha256: scenario.fault === "checksum" ? "sha256:" + "0".repeat(64) : uploaded.sha256,
          transfer: { mode: "json-base64", encoding: "base64", maxBytes: 16 * 1024 * 1024 } });
      }
      if (action === "/commands" && method === "POST") {
        assert.equal(body.cwd, "/workspace");
        assert.equal(body.detached, true);
        if (scenario.example === "workspace") {
          const quoted = await run("sh", ["-c", 'python() { printf "%s\\n" "$@"; }; ' + body.command]);
          assert.equal(quoted.code, 0, quoted.stderr);
          assert.match(quoted.stdout, /Path\("runs.txt"\).open\("a"\).write\("once\\n"\)/);
          files.set("/workspace/runs.txt", "once\n");
        } else {
          assert.equal(body.command, "opencode serve --hostname 0.0.0.0 --port 4096");
          assert.ok(password);
          started = true;
        }
        return send({ command: { id: "cmd_test", status: "running" } }, 202);
      }
      if (action === "/commands/cmd_test/events") {
        const cursor = url.searchParams.get("cursor");
        const output = { type: "output", commandId: "cmd_test", cursor: cursor ? "v1:cmd_test:p:2" : "v1:cmd_test:p:1", stdout: cursor ? "1\n2\n3\n4\n5\n" : "0\n", stderr: "" };
        const events = cursor ? [output, { ...output, type: "complete", status: "succeeded", exitCode: 0 }] : [output];
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.end(events.map((event) => `id: ${event.cursor}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""));
        return;
      }
      if (action === "/routes" && method === "POST") {
        assert.ok(started);
        assert.equal(body.accessMode, "token");
        return send({ route: { routeKey: "r1", url: origin + "/proxy/r1", accessMode: "token" }, accessToken: "route-test-token", accessHeaderName: "x-harakiri-route-token" });
      }
      throw new Error("Unhandled request: " + method + " " + path);
    } catch (error) {
      fixtureErrors.push(error);
      send({ error: "fixture_contract_failure" }, 500);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + (server.address() as { port: number }).port;
  try {
    const result = await run(process.execPath, ["--import", "./deadline.mjs", scenario.example + ".mjs"], {
      HARAKIRI_API_URL: origin, HARAKIRI_API_KEY: "hk_docs_protocol_test",
      ...(scenario.missingModel ? {} : { OPENCODE_MODEL: "fixture/model'quoted" }),
      ...(scenario.providerKey ? { ANTHROPIC_API_KEY: "provider-test-key" } : {}),
      ...(scenario.fault === "hung-cleanup" || (scenario.example === "workspace" && scenario.fault === "cleanup") ? { TEST_SHORT_CLEANUP: "1" } : {})
    });
    assert.deepEqual(fixtureErrors, [], result.stderr);
    const success = !scenario.fault && !scenario.missingModel;
    if (success) {
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /PASS:/);
    } else {
      assert.notEqual(result.code, 0, result.stdout);
      assert.doesNotMatch(result.stdout, /PASS:/, "no false success when the task or cleanup fails");
    }
    const creates = calls.filter((call) => call.method === "POST" && call.path === "/v1/sandboxes");
    assert.equal(creates.length, scenario.missingModel ? 0 : scenario.example === "workspace" && !scenario.fault ? 2 : 1);
    for (const [id, sandbox] of sandboxes) {
      assert.equal(calls.filter((call) => call.method === "DELETE" && call.path === "/v1/sandboxes/" + id).length, 1, "cleanup must not replay an uncertain deletion");
      if (!["cleanup", "both", "hung-cleanup"].includes(scenario.fault ?? "")) {
        assert.equal(sandbox.capacityPhase, "released");
        assert.equal(observations.get(id), 2, "termination is not enough before capacity release");
      } else {
        assert.match(result.stderr, new RegExp("Cleanup unconfirmed for " + id));
      }
    }
    if (["readiness", "both"].includes(scenario.fault ?? "")) {
      assert.equal(calls.filter((call) => /\/(run|commands)$/.test(call.path)).length, 0);
      assert.match(result.stderr, /before becoming ready/);
    }
    if (scenario.fault === "both") assert.match(result.stderr, /fixture_cleanup_failure/);
    if (scenario.example === "workspace") {
      assert.equal(archived, !["cleanup", "hung-cleanup"].includes(scenario.fault ?? ""));
      if (success) {
        assert.equal(calls.filter((call) => call.method === "POST" && call.path.endsWith("/commands")).length, 1);
        assert.deepEqual(calls.filter((call) => call.path.endsWith("/events")).map((call) => call.query.get("cursor")), [null, "v1:cmd_test:p:1"]);
      }
    }
    assert.ok(!calls.some((call) => call.path === "/escaped"), "application credentials must not follow redirects");
    console.log("PASS", scenario.example, scenario.fault ?? (scenario.missingModel ? "missing-model" : scenario.providerKey ? "provider-auth" : "success"));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

try {
  await writeFile(join(directory, "package.json"), JSON.stringify({ private: true, type: "module" }));
  const install = await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org", `@h-sandbox/sdk@${publishedSdkVersion}`, "@opencode-ai/sdk@1.15.13"]);
  assert.equal(install.code, 0, install.stderr);
  const installed = JSON.parse(await readFile(join(directory, "node_modules/@h-sandbox/sdk/package.json"), "utf8"));
  assert.equal(installed.version, publishedSdkVersion);
  console.log("Registry SDK", installed.version, "Node", process.version);
  for (const [name, source] of Object.entries(publishedSdkExamples)) await writeFile(join(directory, name + ".mjs"), source);
  // Exercise the actual timeout wiring without waiting 90 seconds per fault test.
  await writeFile(join(directory, "deadline.mjs"), `
if (process.env.TEST_SHORT_CLEANUP) {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  AbortSignal.timeout = (ms) => timeout(ms === 90_000 ? 150 : ms);
}
`);
  for (const example of Object.keys(publishedSdkExamples) as Example[]) await check({ example });
  for (const fault of ["readiness", "command", "cleanup", "both", "hung-cleanup"] as const) await check({ example: "quickstart", fault });
  await check({ example: "worker", fault: "cleanup" });
  await check({ example: "artifacts", fault: "checksum" });
  await check({ example: "workspace", fault: "readiness" });
  await check({ example: "workspace", fault: "cleanup" });
  await check({ example: "opencode-headless", providerKey: true });
  await check({ example: "opencode-headless", missingModel: true });
  await check({ example: "opencode-server", fault: "redirect" });
  console.log("PASS: 18 published documentation scenarios; no live runtime or model used");
} finally {
  await rm(directory, { recursive: true, force: true });
}
