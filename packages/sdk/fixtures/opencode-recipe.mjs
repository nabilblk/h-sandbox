import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";

const run = promisify(execFile);
const loader = process.argv[2];
assert.ok(loader, "Pass the TypeScript loader URL for the copied public example.");

for (const providerKey of ["dummy-anthropic-secret", undefined]) {
  const model = providerKey ? "anthropic/fixture-model" : "opencode/fixture-free-model";
  const calls = [];
  let deleted = false;
  const sandbox = () => ({
    id: "sbx_recipe", status: deleted ? "terminated" : "running",
    capacityPhase: deleted ? "released" : "active",
    runtimeMetadata: { workdir: "/workspace" }
  });
  const server = createServer(async (request, response) => {
    try {
      let body = "";
      for await (const chunk of request) body += chunk;
      const call = { method: request.method, path: request.url, body: body ? JSON.parse(body) : undefined };
      calls.push(call);
      assert.equal(request.headers["x-api-key"], "dummy-control-plane-secret");
      let result;
      if (call.method === "POST" && call.path === "/v1/sandboxes") {
        result = { sandbox: sandbox(), status: "pending" };
      } else if (call.method === "GET" && call.path === "/v1/sandboxes/sbx_recipe/readiness") {
        result = { sandbox: sandbox(), readiness: { status: "ready" } };
      } else if (call.method === "POST" && call.path === "/v1/sandboxes/sbx_recipe/run") {
        result = { result: { stdout: "Synthetic OpenCode result\n", stderr: "", exitCode: 0 } };
      } else if (call.method === "DELETE" && call.path === "/v1/sandboxes/sbx_recipe") {
        deleted = true;
        result = { ok: true };
      } else if (call.method === "GET" && call.path === "/v1/sandboxes/sbx_recipe") {
        result = { sandbox: sandbox() };
      } else {
        throw new Error(`Unexpected recipe request: ${call.method} ${call.path}`);
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(result));
    } catch {
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "unexpected_fixture_request" }));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { stdout, stderr } = await run(process.execPath, ["--import", loader, "opencode-headless.ts"], {
      timeout: 15_000, maxBuffer: 1024 * 1024,
      // Never inherit actual developer credentials or optional recipe commands.
      env: {
        PATH: process.env.PATH,
        HARAKIRI_API_URL: `http://127.0.0.1:${server.address().port}`,
        HARAKIRI_API_KEY: "dummy-control-plane-secret",
        OPENCODE_MODEL: model, OPENCODE_PROMPT: "Inspect the fixture.",
        UNRELATED_SECRET: "dummy-unrelated-secret",
        ...(providerKey ? { ANTHROPIC_API_KEY: providerKey } : {})
      }
    });
    assert.deepEqual(calls.map(({ method, path }) => `${method} ${path}`), [
      "POST /v1/sandboxes", "GET /v1/sandboxes/sbx_recipe/readiness",
      "POST /v1/sandboxes/sbx_recipe/run", "DELETE /v1/sandboxes/sbx_recipe",
      "GET /v1/sandboxes/sbx_recipe"
    ]);
    assert.equal(calls[0].body.wait, false);
    assert.deepEqual(calls[0].body.env, providerKey ? { ANTHROPIC_API_KEY: providerKey } : undefined);
    assert.equal(calls[2].body.command, `opencode run --model '${model}' 'Inspect the fixture.'`);
    assert.equal(calls[2].body.cwd, "/workspace");
    assert.equal(stdout.trim(), "Synthetic OpenCode result");
    assert.equal(stderr, "");
    assert.equal(deleted, true);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}
console.log("Installed OpenCode example: explicit provider credentials, key-free use and confirmed cleanup passed.");
