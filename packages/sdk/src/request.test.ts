import assert from "node:assert/strict";
import test from "node:test";
import {
  HarakiriClient, HarakiriRequestTimeoutError, HarakiriAuthorizationError,
  HarakiriSandboxCreationError, type SandboxSummary
} from "./index.js";

const client = (fetch: typeof globalThis.fetch, requestTimeoutMs = 50) => new HarakiriClient({
  apiUrl: "https://api.example.invalid", apiKey: "synthetic-request-key", fetch, requestTimeoutMs
});
const summary = { id: "sbx_request", runtimeMetadata: {
  workdir: "/workspace", limits: { fileArtifactMaxBytes: 1024 }
} } as SandboxSummary;
const never = () => new Promise<Response>(() => {});

test("request deadline covers an uncooperative fetch and never retries a submission", async () => {
  let attempts = 0;
  let signal: AbortSignal | null | undefined;
  const sdk = client(async (_url, init) => { attempts++; signal = init?.signal; return never(); });
  await assert.rejects(sdk.commands.start("sbx_request", { command: "side-effect" }), error => {
    assert.ok(error instanceof HarakiriRequestTimeoutError);
    assert.equal(error.requestTimeoutMs, 50);
    assert.equal(error.method, "POST");
    assert.equal(error.retryable, false);
    assert.doesNotMatch(error.message, /synthetic-request-key|side-effect/);
    return true;
  });
  assert.equal(attempts, 1);
  assert.ok(signal?.aborted);
});

test("deadlines cover success and error response bodies", async () => {
  for (const status of [200, 503]) {
    const sdk = client(async (_url, init) => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{"));
        init!.signal!.addEventListener("abort", () => controller.error(init!.signal!.reason), { once: true });
      }
    }), { status }));
    await assert.rejects(sdk.files.read("sbx_request", "/workspace/file"), HarakiriRequestTimeoutError);
  }
});

test("caller cancellation preserves the exact reason before and during a request", async () => {
  const reason = new Error("caller stopped waiting");
  let attempts = 0;
  const aborted = new AbortController(); aborted.abort(reason);
  const sdk = client(async () => { attempts++; return never(); }, 1000);
  await assert.rejects(sdk.processes.start("sbx_request", { command: "task" }, { signal: aborted.signal }), e => e === reason);
  assert.equal(attempts, 0);
  const active = new AbortController();
  const waiting = sdk.files.download("sbx_request", "/workspace/result", { signal: active.signal });
  const timer = setTimeout(() => active.abort(reason), 10);
  try { await assert.rejects(waiting, e => e === reason); }
  finally { clearTimeout(timer); }
  assert.equal(attempts, 1);
});

test("per-call overrides work and neither signals nor deadlines enter wire bodies or queries", async () => {
  const sdk = client(async (url, init) => {
    assert.ok(init?.signal);
    const body = String(init?.body ?? "");
    assert.doesNotMatch(body, /requestTimeoutMs|signal/);
    assert.doesNotMatch(String(url), /requestTimeoutMs|signal/);
    await new Promise(resolve => setTimeout(resolve, 15));
    return Response.json({ file: { path: "/workspace/file" }, content: "hello", command: { id: "cmd_one" }, result: { exitCode: 0 } });
  }, 1);
  const options = { requestTimeoutMs: 1000, signal: new AbortController().signal };
  const sandbox = sdk.sandboxes.wrap(summary);
  await sandbox.files.write("file", "hello", options);
  await sandbox.files.write({ path: "/workspace/file", content: "hello" }, options);
  assert.equal(await sandbox.files.readText("file", options), "hello");
  await sandbox.files.stat("file", options);
  await sandbox.files.remove("file", { ...options, recursive: true });
  await sandbox.processes.start({ command: "task", timeoutMs: 4000 }, options);
  await sandbox.processes.logs("cmd_one", { ...options, cursor: 12, tail: 2 });
  await sandbox.run("task", { ...options, timeoutMs: 4000 });
});

test("timeouts are validated and successful API errors keep their classification", async () => {
  for (const value of [0, -1, NaN, Infinity, 1.5, 2_147_483_648]) {
    assert.throws(() => client(never, value), RangeError);
    await assert.rejects(async () => client(never).getSandbox("sbx_request", { requestTimeoutMs: value }), RangeError);
  }
  const sdk = client(async () => Response.json({ error: "forbidden" }, { status: 403 }));
  await assert.rejects(sdk.getSandbox("sbx_request"), HarakiriAuthorizationError);
});

test("fromEnv carries the configured deadline", async () => {
  const sdk = HarakiriClient.fromEnv({
    env: { HARAKIRI_API_URL: "https://api.example.invalid", HARAKIRI_API_KEY: "synthetic-request-key" },
    requestTimeoutMs: 25, fetch: never
  });
  await assert.rejects(sdk.getSandbox("sbx_request"), e => e instanceof HarakiriRequestTimeoutError && e.requestTimeoutMs === 25);
});

test("acknowledged creation preserves its ID when a later readiness request times out", async () => {
  let creates = 0;
  const sdk = client(async (_url, init) => {
    if (init?.method === "POST") { creates++; return Response.json({ sandbox: summary }); }
    return never();
  });
  await assert.rejects(sdk.sandboxes.create({ template: "fixture" }), error => {
    assert.ok(error instanceof HarakiriSandboxCreationError);
    assert.equal(error.sandboxId, summary.id);
    assert.ok(error.cause instanceof HarakiriRequestTimeoutError);
    return true;
  });
  assert.equal(creates, 1);
});

test("per-request overrides reach all lifecycle observers without replacing the total budget", async () => {
  const sdk = client(never, 1000);
  const options = { timeoutMs: 2000, requestTimeoutMs: 20 };
  for (const operation of [
    () => sdk.waitForSandbox("sbx_request", options),
    () => sdk.waitForSandboxTermination("sbx_request", options),
    () => sdk.waitForSnapshot("snap_request", options),
    () => sdk.workspaces.wait("ws_request", options)
  ]) {
    await assert.rejects(operation(), error => error instanceof HarakiriRequestTimeoutError && error.requestTimeoutMs === 20);
  }
});

test("a late response is discarded after cancellation instead of consuming its body", async () => {
  let complete!: (response: Response) => void;
  let discarded = false;
  const sdk = client(() => new Promise(resolve => { complete = resolve; }));
  await assert.rejects(sdk.getSandbox("sbx_request"), HarakiriRequestTimeoutError);
  complete(new Response(new ReadableStream({ cancel() { discarded = true; } })));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(discarded, true);
});
