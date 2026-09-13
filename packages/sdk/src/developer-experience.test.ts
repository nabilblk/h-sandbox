import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import {
  HarakiriClient, HarakiriCommandEndedError, HarakiriRunError, HarakiriSandboxCreationError,
  HarakiriWaitTimeoutError, createRouteFetch, waitForRouteHttp,
  type SandboxRouteResponse, type SandboxSummary
} from "./index.js";

const sandboxSummary = (extra: Partial<SandboxSummary> = {}) => ({
  id: "sbx_dx", status: "running", capacityPhase: "active",
  runtimeMetadata: { workdir: "/app", limits: { fileArtifactMaxBytes: 16_777_216 } }, ...extra
}) as SandboxSummary;
const command = (status = "running") => ({ id: "cmd_dx", sandboxId: "sbx_dx", status, command: "node worker.mjs", exitCode: status === "succeeded" ? 0 : null });
const route = (url = "https://api.example.invalid/route/one"): SandboxRouteResponse => ({
  route: { url, routeKey: "route_one", accessMode: "token", accessHeaderName: "x-route-token", port: 3000 } as SandboxRouteResponse["route"],
  accessToken: "dummy-route-secret"
});
const clientFor = (fetch: typeof globalThis.fetch) => new HarakiriClient({ apiUrl: "https://control.example.invalid", apiKey: "dummy-api-secret", fetch });

test("scoped fetch rejects foreign origins and sibling or encoded paths before sending anything", async () => {
  let calls = 0;
  const scoped = createRouteFetch(route(), { fetch: async () => { calls++; return new Response(); } });
  for (const input of [
    "https://foreign.invalid/", "//foreign.invalid/", "http://api.example.invalid/route/one",
    "https://api.example.invalid/route/two", "https://api.example.invalid/route/one-more",
    "https://user:secret@api.example.invalid/route/one", "../two", "%2e%2e/two",
    "%252e%252e/two", "child%2f..%2f..%2fother", "child%5c..%5cother"
  ]) await assert.rejects(scoped(input), TypeError);
  assert.equal(calls, 0);
});

test("scoped fetch preserves Request bodies, headers, cancellation and init replacement semantics", async () => {
  const controller = new AbortController();
  const requests: Request[] = [];
  const scoped = createRouteFetch(route(), {
    headers: { "x-default": "default" }, basicAuth: { username: "agent", password: "dummy" },
    fetch: async (input, init) => { requests.push(new Request(input, init)); return new Response(); }
  });
  await scoped(new Request("https://api.example.invalid/route/one/task", {
    method: "POST", body: "input", headers: { "x-original": "retained" }, signal: controller.signal
  }));
  assert.equal(requests[0].method, "POST");
  assert.equal(await requests[0].text(), "input");
  assert.equal(requests[0].headers.get("x-original"), "retained");
  assert.equal(requests[0].headers.get("x-default"), "default");
  assert.equal(requests[0].headers.get("x-route-token"), "dummy-route-secret");
  assert.equal(requests[0].headers.get("x-api-key"), null);
  assert.equal(requests[0].redirect, "manual");
  controller.abort();
  assert.equal(requests[0].signal.aborted, true);
  await scoped(new Request("https://api.example.invalid/route/one/task", {
    method: "POST", body: "old", headers: { "x-original": "discarded" }
  }), { method: "PUT", body: "new", headers: { "x-replacement": "yes" }, redirect: "follow" });
  assert.equal(requests[1].method, "PUT");
  assert.equal(await requests[1].text(), "new");
  assert.equal(requests[1].headers.get("x-original"), null);
  assert.equal(requests[1].headers.get("x-replacement"), "yes");
  assert.equal(requests[1].redirect, "manual");
});

test("real Fetch never forwards route credentials through a redirect", async (t) => {
  let escaped = 0;
  const server = createServer((request, response) => {
    if (request.url === "/route/one/") {
      assert.equal(request.headers["x-route-token"], "dummy-route-secret");
      response.writeHead(302, { Location: "/elsewhere" }); response.end();
    } else { escaped++; response.end("unexpected"); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const result = await createRouteFetch(route(`http://127.0.0.1:${address.port}/route/one`))("/", { redirect: "follow" });
  assert.equal(result.status, 302);
  await result.body?.cancel();
  assert.equal(escaped, 0);
});

for (const target of ["sandbox", "command", "snapshot", "workspace", "route"] as const) {
  test(`${target} observation interrupts a hanging transport without killing remote work`, async () => {
    let receivedSignal: AbortSignal | null | undefined;
    let calls = 0;
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      calls++; receivedSignal = init?.signal;
      assert.equal(init?.method ?? "GET", "GET");
      return new Promise<Response>(() => {});
    };
    const client = clientFor(fetch);
    const wait = (options: { timeoutMs: number; signal?: AbortSignal }) => {
      if (target === "sandbox") return client.waitForSandbox("sbx_dx", options);
      if (target === "command") return client.waitForCommand("sbx_dx", "cmd_dx", options);
      if (target === "snapshot") return client.waitForSnapshot("snp_dx", options);
      if (target === "workspace") return client.workspaces.wait("ws_dx", options);
      return waitForRouteHttp(route(), { ...options, fetch });
    };
    const before = performance.now();
    await assert.rejects(wait({ timeoutMs: 20 }), HarakiriWaitTimeoutError);
    assert.ok(performance.now() - before < 1500);
    assert.equal(receivedSignal?.aborted, true);
    const controller = new AbortController();
    const pending = wait({ timeoutMs: 2000, signal: controller.signal });
    const reason = new Error("caller stopped observing");
    controller.abort(reason);
    await assert.rejects(pending, (error) => error === reason);
    const beforeZero = calls;
    await assert.rejects(wait({ timeoutMs: 0 }), HarakiriWaitTimeoutError);
    await assert.rejects(wait({ timeoutMs: -1 }), RangeError);
    assert.equal(calls, beforeZero);
  });
}

test("deadline also bounds a hanging response body and an asynchronous health predicate", async () => {
  const body = new ReadableStream({ start() {} });
  const client = clientFor(async () => new Response(body));
  await assert.rejects(client.waitForCommand("sbx_dx", "cmd_dx", { timeoutMs: 20 }), HarakiriWaitTimeoutError);
  let canceled = false;
  await assert.rejects(waitForRouteHttp(route(), {
    timeoutMs: 20,
    fetch: async () => new Response(new ReadableStream({ cancel() { canceled = true; } })),
    expect: () => new Promise<boolean>(() => {})
  }), HarakiriWaitTimeoutError);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(canceled, true);
});

test("terminal command failures stop explicit running waits, but can be observed deliberately", async () => {
  const client = clientFor(async () => Response.json({ command: command("failed") }));
  await assert.rejects(client.waitForCommand("sbx_dx", "cmd_dx", { statuses: ["running"] }), HarakiriCommandEndedError);
  assert.equal((await client.waitForCommand("sbx_dx", "cmd_dx", { statuses: ["failed"] })).command.status, "failed");
});

test("finite run overload preserves legacy envelopes and optionally checks the exit code", async () => {
  const bodies: Record<string, unknown>[] = [];
  const client = clientFor(async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json({ result: { sandboxId: "sbx_dx", command: "false", exitCode: 1, stdout: "out", stderr: "err", durationMs: 1 } });
  });
  const sandbox = client.sandboxes.wrap(sandboxSummary());
  assert.equal((await sandbox.run({ command: "false" })).result.exitCode, 1);
  assert.equal((await sandbox.run("false")).exitCode, 1);
  assert.equal(bodies[0].cwd, undefined);
  assert.equal(bodies[1].cwd, "/app");
  await assert.rejects(sandbox.run("false", { check: true, cwd: "/custom" }), (error) => {
    assert.ok(error instanceof HarakiriRunError);
    assert.equal(error.sandboxId, "sbx_dx"); assert.equal(error.stderr, "err"); return true;
  });
  assert.equal(bodies[2].cwd, "/custom");
  assert.equal("check" in bodies[2], false);
  await assert.rejects(sandbox.run("   "), TypeError);
  await assert.rejects(sandbox.run("false", { signal: AbortSignal.abort() }));
  assert.equal(bodies.length, 3, "no implicit retries or canceled submissions");
});

test("environment setup requires an installation and never prints secret configuration", async () => {
  for (const env of [{}, { HARAKIRI_API_URL: "https://example.invalid" }, {
    HARAKIRI_API_URL: "https://user:SECRET@example.invalid", HARAKIRI_API_KEY: "SECRET"
  }]) assert.throws(() => HarakiriClient.fromEnv({ env }), (error) => {
    assert.ok(error instanceof Error); assert.doesNotMatch(error.message, /SECRET/); return true;
  });
  let url = "";
  const client = HarakiriClient.fromEnv({
    env: { HARAKIRI_API_URL: "https://example.invalid/", HARAKIRI_API_KEY: "dummy" },
    fetch: async (input) => { url = String(input); return Response.json({ sandboxes: [] }); }
  });
  await client.sandboxes.list({ status: "running", q: "a & b", limit: 5 });
  assert.equal(new URL(url).searchParams.get("q"), "a & b");
  assert.equal(new URL(url).searchParams.get("limit"), "5");
});

test("process handles retain envelopes and reconnect without another POST", async () => {
  const calls: string[] = [];
  const client = clientFor(async (url, init) => {
    calls.push(`${init?.method ?? "GET"} ${new URL(String(url)).pathname}`);
    return Response.json(String(url).endsWith("/logs") ? { commandId: "cmd_dx", stdout: "ok", stderr: "", cursor: 1 } : { command: command("succeeded") });
  });
  const sandbox = client.sandboxes.wrap(sandboxSummary());
  const started = await sandbox.processes.start({ command: "node worker.mjs" });
  assert.equal(started.id, started.command.id);
  assert.deepEqual(started.reference, { sandboxId: "sbx_dx", commandId: "cmd_dx" });
  assert.doesNotMatch(JSON.stringify(started), /dummy-api-secret|client|apiUrl/);
  const reconnected = await sandbox.processes.connect(started.reference.commandId);
  assert.equal((await reconnected.wait()).status, "succeeded");
  assert.equal((await reconnected.logs()).stdout, "ok");
  assert.equal(calls.filter((call) => call.startsWith("POST")).length, 1);
});

test("text and binary convenience methods use runtime paths and verify bytes", async () => {
  let uploaded = { path: "", contentBase64: "", sizeBytes: 0, sha256: "" };
  const client = clientFor(async (url, init) => {
    if (init?.method === "PUT") return Response.json({ file: { path: JSON.parse(String(init.body)).path } });
    if (init?.method === "POST") {
      uploaded = JSON.parse(String(init.body));
      const expected = `sha256:${createHash("sha256").update(Buffer.from(uploaded.contentBase64, "base64")).digest("hex")}`;
      assert.equal(uploaded.sha256, expected, "Artifact checksum must use the public API's algorithm-prefixed format");
      return Response.json({ ...uploaded, file: { path: uploaded.path } });
    }
    if (String(url).includes("/files/read")) return Response.json({ content: "hello", encoding: "utf8" });
    return Response.json(uploaded);
  });
  const sandbox = client.sandboxes.wrap(sandboxSummary());
  assert.equal((await sandbox.files.write("hello.txt", "hello")).path, "/app/hello.txt");
  assert.equal((await sandbox.files.write({ path: "/legacy", content: "hello" })).file.path, "/legacy");
  assert.equal(await sandbox.files.readText("hello.txt"), "hello");
  const bytes = new Uint8Array([0, 1, 128, 255]);
  assert.equal((await sandbox.files.write("result.bin", bytes)).path, "/app/result.bin");
  assert.deepEqual(await sandbox.files.readBytes("result.bin"), bytes);
  uploaded.sha256 = "incorrect";
  await assert.rejects(sandbox.files.readBytes("result.bin"), /checksum/);
  const limited = client.sandboxes.wrap(sandboxSummary({ runtimeMetadata: { workdir: "/app", limits: { fileArtifactMaxBytes: 2 } } as SandboxSummary["runtimeMetadata"] }));
  await assert.rejects(limited.files.write("large.bin", bytes), RangeError);
});

test("cleanup waits for this sandbox's release without checking unrelated organization usage", async () => {
  let reads = 0;
  const calls: string[] = [];
  const client = clientFor(async (url, init) => {
    calls.push(`${init?.method ?? "GET"} ${new URL(String(url)).pathname}`);
    if (init?.method === "DELETE") return Response.json({ ok: true });
    reads++;
    return Response.json({ sandbox: sandboxSummary({ status: "terminated", capacityPhase: reads < 2 ? "releasing" : "released" }) });
  });
  const sandbox = client.sandboxes.wrap(sandboxSummary());
  await sandbox.kill({ wait: true, intervalMs: 0, timeoutMs: 1000 });
  assert.equal(reads, 2);
  assert.equal(sandbox.status, "terminated");
  assert.equal(sandbox.summary.capacityPhase, "released");
  assert.equal(calls.filter((call) => call.startsWith("DELETE")).length, 1);
  assert.ok(calls.every((call) => call.endsWith("/v1/sandboxes/sbx_dx")));
});

test("unconfirmed cleanup is actionable and a zero-budget kill sends no mutation", async () => {
  let deletes = 0;
  const client = clientFor(async (_url, init) => {
    if (init?.method === "DELETE") { deletes++; return Response.json({ ok: true }); }
    return Response.json({ sandbox: sandboxSummary() });
  });
  await assert.rejects(client.killSandbox("sbx_dx", { wait: true, timeoutMs: 0 }), HarakiriWaitTimeoutError);
  assert.equal(deletes, 0);
  await assert.rejects(client.killSandbox("sbx_dx", { wait: true, timeoutMs: 20, intervalMs: 0 }), (error) => {
    assert.ok(error instanceof HarakiriWaitTimeoutError); assert.equal(error.id, "sbx_dx"); return true;
  });
  assert.equal(deletes, 1);
});

test("creation acknowledgement and readiness survive the sandbox facade", async () => {
  const creation = { sandbox: sandboxSummary(), readiness: { status: "starting" }, operation: { id: "op_dx" }, status: "pending" };
  const sandbox = await clientFor(async () => Response.json(creation)).sandboxes.create({ wait: false });
  assert.equal(sandbox.creation?.operation?.id, "op_dx");
  assert.equal(sandbox.readiness?.status, "starting");
  assert.equal(sandbox.status, "running");
});

test("accepted create failures retain identity and never submit creation twice", async () => {
  let posts = 0;
  const client = clientFor(async (_url, init) => {
    if (init?.method === "POST") { posts++; return Response.json({ sandbox: sandboxSummary(), operation: { id: "op_dx" } }); }
    return Response.json({ error: "provider_unavailable" }, { status: 503 });
  });
  await assert.rejects(client.sandboxes.create(), (error) => {
    assert.ok(error instanceof HarakiriSandboxCreationError);
    assert.equal(error.sandboxId, "sbx_dx"); assert.equal(error.operation?.id, "op_dx"); return true;
  });
  assert.equal(posts, 1);
});

test("known Git checkpoints are observed, not cloned or deleted again on create replay", async () => {
  for (const status of ["ready", "cloning", "failed"] as const) {
    const calls: string[] = [];
    const client = clientFor(async (url, init) => {
      calls.push(`${init?.method} ${url}`);
      return Response.json({ sandbox: sandboxSummary({ source: { type: "git", status, url: "https://git.example.invalid/repo" } as SandboxSummary["source"] }), readiness: { status: "ready" } });
    });
    const creation = client.createSandbox({ source: { type: "git", url: "https://git.example.invalid/repo" }, idempotencyKey: "same-intent", cleanupOnSourceError: true });
    if (status === "ready") await creation;
    else await assert.rejects(creation, HarakiriSandboxCreationError);
    assert.deepEqual(calls, ["POST https://control.example.invalid/v1/sandboxes"]);
  }
});

test("workspace availability polling preserves recovery-required outcomes", async () => {
  const client = clientFor(async () => Response.json({ workspace: { id: "ws_dx", status: "recovery_required" } }));
  await assert.rejects(client.workspaces.wait("ws_dx"), /explicit recovery/);
  assert.equal((await client.workspaces.wait("ws_dx", { statuses: ["recovery_required"] })).workspace.status, "recovery_required");
});

test("workspace and route handles keep wire fields without serializing the API client", async () => {
  const calls: string[] = [];
  const client = clientFor(async (url, init) => {
    calls.push(`${init?.method ?? "GET"} ${new URL(String(url)).pathname}`);
    if (String(url).includes("/routes")) return Response.json(route());
    return Response.json({ workspace: { id: "ws_dx", status: "available" } });
  });
  const workspace = await client.workspaces.create({ name: "test" });
  assert.equal(workspace.id, workspace.workspace.id);
  await workspace.wait();
  await (await client.workspaces.connect(workspace.id)).archive();
  assert.doesNotMatch(JSON.stringify(workspace), /dummy-api-secret/);
  const exposed = await client.sandboxes.wrap(sandboxSummary()).routes.expose({ port: 3000, accessMode: "token" });
  assert.equal(exposed.url, exposed.route.url);
  let headers = new Headers();
  const scoped = exposed.createFetch({ fetch: async (_url, init) => { headers = new Headers(init?.headers); return new Response("ok"); } });
  assert.equal(await (await scoped("/")).text(), "ok");
  assert.equal(headers.get("x-route-token"), "dummy-route-secret");
  assert.equal(headers.get("x-api-key"), null);
  assert.doesNotMatch(JSON.stringify(exposed), /dummy-api-secret/);
  await exposed.delete();
  assert.ok(calls.includes("DELETE /v1/sandboxes/sbx_dx/routes/3000"));
});

test("process failures refresh the handle while retaining typed terminal errors", async () => {
  const client = clientFor(async (_url, init) => Response.json({ command: command(init?.method === "POST" ? "running" : "failed") }));
  const task = await client.sandboxes.wrap(sandboxSummary()).processes.start({ command: "false" });
  await assert.rejects(task.wait(), HarakiriCommandEndedError);
  assert.equal(task.status, "failed");
});

test("source cleanup failure reports an accepted sandbox without hiding unconfirmed deletion", async () => {
  const client = clientFor(async (url, init) => {
    if (init?.method === "DELETE") throw new Error("unacknowledged deletion");
    if (String(url).endsWith("/run")) return Response.json({ result: { sandboxId: "sbx_dx", command: "git clone", stdout: "", stderr: "failure", exitCode: 1 } });
    return Response.json({ sandbox: sandboxSummary(), readiness: { status: "ready" } });
  });
  await assert.rejects(client.createSandbox({ source: { type: "git", url: "https://git.example.invalid/repo" }, cleanupOnSourceError: true }), (error) => {
    assert.ok(error instanceof HarakiriSandboxCreationError);
    assert.equal(error.cleanup, "unconfirmed");
    assert.equal(error.sandboxId, "sbx_dx");
    assert.equal(error.stage, "source");
    return true;
  });
});

test("expired snapshots can still be observed through their subsequent deletion", async () => {
  let reads = 0;
  const client = clientFor(async () => Response.json({ snapshot: { id: "snp_dx", status: ++reads === 1 ? "expired" : "deleted" } }));
  const result = await client.waitForSnapshot("snp_dx", { statuses: ["deleted"], intervalMs: 0 });
  assert.equal(result.snapshot.status, "deleted");
  assert.equal(reads, 2);
});
