// Explicit published baseline: the workspace package also contains unreleased APIs.
export const publishedSdkVersion = "0.5.0-rc.10";
export const publishedSdkInstall = `npm install --save-exact @h-sandbox/sdk@${publishedSdkVersion}`;
export const publishedCliInstall = `npm install -g @h-sandbox/cli@${publishedSdkVersion}`;

const setup = `import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { HarakiriClient } from "@h-sandbox/sdk";

const apiUrl = process.env.HARAKIRI_API_URL;
const apiKey = process.env.HARAKIRI_API_KEY;
if (!apiUrl || !apiKey) throw new Error("Set HARAKIRI_API_URL and HARAKIRI_API_KEY");
const client = new HarakiriClient({ apiUrl, apiKey });`;

// rc.10 has no kill({ wait:true }); confirmation must observe this sandbox's reservation.
const cleanup = `
// A DELETE acknowledgement alone does not prove runtime absence or capacity release.
async function cleanupSandbox(id, primaryError, requestDelete = true) {
  const signal = AbortSignal.timeout(90_000);
  const cleanupClient = new HarakiriClient({
    apiUrl, apiKey,
    fetch: (url, init) => fetch(url, { ...init, signal })
  });
  try {
    if (requestDelete) await cleanupClient.killSandbox(id);
    while (true) {
      signal.throwIfAborted();
      const { sandbox } = await cleanupClient.getSandbox(id);
      if (sandbox.status === "terminated" && sandbox.capacityPhase === "released") return;
      await delay(500, undefined, { signal });
    }
  } catch (error) {
    const message = "Cleanup unconfirmed for " + id + "; inspect this ID before retrying.";
    throw new AggregateError(primaryError ? [primaryError, error] : [error], message);
  }
}`;

export const publishedQuickstart = `${setup}
const sandbox = await client.sandboxes.create({
  template: "python-3.12-data", name: "first-task", ttlSeconds: 600, wait: false
});
console.log("Accepted sandbox", sandbox.id);
let failure;
try {
  await sandbox.wait({ timeoutMs: 120_000 });
  const { result } = await sandbox.run({ command: "python -c 'print(2 + 2)'" });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), "4");
  console.log(result.stdout.trim());
} catch (error) {
  failure = error;
  throw error;
} finally {
  await cleanupSandbox(sandbox.id, failure);
}
console.log("PASS: task checked and cleanup confirmed");
${cleanup}`;

export const publishedWorker = `${setup}
const jobId = process.env.JOB_ID ?? crypto.randomUUID();
const { sandbox } = await client.createSandbox({
  template: "python-3.12-data", name: "tutorial-sdk-worker", ttlSeconds: 600,
  wait: false, idempotencyKey: "tutorial-job-" + jobId
});
console.log("Accepted sandbox", sandbox.id);
let failure;
try {
  await client.waitForSandbox(sandbox.id, { timeoutMs: 120_000 });
  await client.files.write(sandbox.id, {
    path: "/workspace/task.py", content: "print('sdk-worker-ready')\\n", createParents: true
  });
  const { result } = await client.runSandbox(sandbox.id, { command: "python /workspace/task.py" });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), "sdk-worker-ready");
} catch (error) {
  failure = error;
  throw error;
} finally {
  await cleanupSandbox(sandbox.id, failure);
}
console.log("PASS: worker result checked and cleanup confirmed");
${cleanup}`;

export const publishedArtifacts = `import { createHash } from "node:crypto";
${setup}
const sandbox = await client.sandboxes.create({ template: "python-3.12", ttlSeconds: 600, wait: false });
console.log("Accepted sandbox", sandbox.id);
let failure;
try {
  await sandbox.wait({ timeoutMs: 120_000 });
  const bytes = Buffer.from([0, 128, 255]);
  const sha256 = "sha256:" + createHash("sha256").update(bytes).digest("hex");
  await sandbox.artifacts.upload({
    path: "/workspace/out.bin", createParents: true,
    contentBase64: bytes.toString("base64"), sizeBytes: bytes.length, sha256
  });
  const artifact = await sandbox.artifacts.download("/workspace/out.bin");
  assert.equal(artifact.transfer.mode, "json-base64");
  assert.equal(artifact.transfer.encoding, "base64");
  assert.equal(artifact.sizeBytes, bytes.length);
  assert.ok(artifact.sizeBytes <= artifact.transfer.maxBytes);
  const downloaded = Buffer.from(artifact.contentBase64, "base64");
  assert.equal(downloaded.length, artifact.sizeBytes);
  assert.equal("sha256:" + createHash("sha256").update(downloaded).digest("hex"), artifact.sha256);
  assert.deepEqual(downloaded, bytes);
} catch (error) {
  failure = error;
  throw error;
} finally {
  await cleanupSandbox(sandbox.id, failure);
}
console.log("PASS: binary bytes verified and cleanup confirmed");
${cleanup}`;

export const publishedOpenCodeHeadless = `${setup}
const model = process.env.OPENCODE_MODEL;
if (!model) throw new Error("Set OPENCODE_MODEL to a model available in your OpenCode installation");
const providerKey = process.env.ANTHROPIC_API_KEY;
const sandbox = await client.sandboxes.create({
  template: "opencode", ttlSeconds: 1200, wait: false,
  env: providerKey ? { ANTHROPIC_API_KEY: providerKey } : undefined,
  egress: { mode: "restricted", presets: ["git-hosting", "llm-apis", "node-package-install"] }
});
console.log("Accepted sandbox", sandbox.id);
let failure;
try {
  await sandbox.wait({ timeoutMs: 120_000 });
  const quote = (value) => "'" + value.replaceAll("'", "'\\\\''") + "'";
  const { result } = await sandbox.run({
    command: "opencode run --model " + quote(model) + " " + quote("Write hello.py that prints hello, then run it."),
    cwd: "/workspace", timeoutMs: 300_000
  });
  assert.equal(result.exitCode, 0, "OpenCode command failed");
  // Agent output can contain sensitive data; keep it in your trusted worker.
} catch (error) {
  failure = error;
  throw error;
} finally {
  await cleanupSandbox(sandbox.id, failure);
}
console.log("PASS: OpenCode exited successfully and cleanup confirmed");
${cleanup}`;

export const publishedOpenCodeServer = `import { createOpencodeClient } from "@opencode-ai/sdk";
${setup}
const password = crypto.randomUUID();
const sandbox = await client.sandboxes.create({
  template: "opencode", ttlSeconds: 600, wait: false,
  env: { OPENCODE_SERVER_PASSWORD: password }
});
console.log("Accepted sandbox", sandbox.id);
let failure;
try {
  await sandbox.wait({ timeoutMs: 120_000 });
  await sandbox.processes.start({
    command: "opencode serve --hostname 0.0.0.0 --port 4096",
    cwd: "/workspace", timeoutMs: 300_000
  });
  const route = await sandbox.routes.expose({ port: 4096, accessMode: "token", labels: ["opencode"] });
  const basicAuth = { username: "opencode", password };
  const healthSignal = AbortSignal.timeout(30_000);
  const health = await client.routes.waitForHttp(route, {
    path: "/global/health", basicAuth, timeoutMs: 30_000,
    // Bound rc.10's fetch and disallow credential-bearing redirects.
    fetch: (url, init) => fetch(url, { ...init, signal: healthSignal, redirect: "error" }),
    expect: async (response) => response.ok && (await response.clone().json()).healthy === true
  });
  await health.body?.cancel();
  const baseUrl = new URL(route.route.url.replace(/\\/$/, "") + "/");
  const opencode = createOpencodeClient({
    baseUrl: baseUrl.toString(),
    // rc.10's route adapter does not preserve every Request field. This GET-only
    // example uses Fetch directly; the candidate supplies a full scoped adapter.
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const target = new URL(request.url);
      if (request.method !== "GET" || target.origin !== baseUrl.origin ||
          !target.pathname.startsWith(baseUrl.pathname)) throw new Error("Unexpected OpenCode request");
      const headers = new Headers(request.headers);
      for (const [name, value] of Object.entries(client.routes.headers(route, { basicAuth }))) headers.set(name, value);
      return fetch(new Request(request, { headers, redirect: "error", signal: AbortSignal.timeout(10_000) }));
    }
  });
  const config = await opencode.config.get();
  assert.equal(config.error, undefined);
  assert.ok(config.data);
} catch (error) {
  failure = error;
  throw error;
} finally {
  await cleanupSandbox(sandbox.id, failure);
}
console.log("PASS: authenticated OpenCode server checked and cleanup confirmed");
${cleanup}`;

export const publishedWorkspace = `${setup}
const { workspace } = await client.workspaces.create({ name: "checkpoint-" + crypto.randomUUID() });
const owned = new Set();
const stopping = new Set();
let failure;
try {
  const input = { template: "python-3.12", workspaceId: workspace.id, ttlSeconds: 600, wait: false };
  const { sandbox: first } = await client.createSandbox(input);
  owned.add(first.id);
  console.log("Accepted sandbox", first.id);
  await client.waitForSandbox(first.id, { timeoutMs: 120_000 });
  await client.files.write(first.id, {
    path: "/workspace/checkpoint.json", content: JSON.stringify({ step: 1 }), createParents: true
  });
  stopping.add(first.id);
  await cleanupSandbox(first.id);
  owned.delete(first.id);
  await waitUntilAvailable();

  const { sandbox: second } = await client.createSandbox(input);
  owned.add(second.id);
  console.log("Accepted sandbox", second.id);
  await client.waitForSandbox(second.id, { timeoutMs: 120_000 });
  const checkpoint = await client.files.read(second.id, "/workspace/checkpoint.json");
  assert.deepEqual(JSON.parse(checkpoint.content), { step: 1 });
  const { command } = await client.commands.start(second.id, {
    command: "python -u -c 'import time; from pathlib import Path; Path(\\\"runs.txt\\\").open(\\\"a\\\").write(\\\"once\\\\n\\\"); [(print(i, flush=True), time.sleep(1)) for i in range(6)]'",
    cwd: "/workspace", detached: true, timeoutMs: 30000
  });
  let cursor;
  let output = "";
  const signal = AbortSignal.timeout(60_000);
  for await (const event of client.commands.stream(second.id, command.id, { signal })) {
    cursor = event.cursor;
    if (event.type === "output") { output += event.stdout; break; }
  }
  // Disconnecting the observer does not kill or resubmit the command.
  let completed = false;
  for await (const event of client.commands.stream(second.id, command.id, { cursor, signal })) {
    if (event.type === "output") output += event.stdout;
    if (event.type === "complete") { assert.equal(event.exitCode, 0); completed = true; }
  }
  assert.ok(completed);
  assert.deepEqual(output.trim().split("\\n"), ["0", "1", "2", "3", "4", "5"]);
  assert.equal((await client.files.read(second.id, "/workspace/runs.txt")).content, "once\\n");
} catch (error) {
  failure = error;
  throw error;
} finally {
  const errors = [];
  for (const id of owned) {
    try { await cleanupSandbox(id, undefined, !stopping.has(id)); }
    catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(failure ? [failure, ...errors] : errors, "Workspace cleanup unconfirmed: " + workspace.id);
  try {
    await waitUntilAvailable();
    await client.workspaces.archive(workspace.id);
  } catch (error) {
    throw new AggregateError(failure ? [failure, error] : [error], "Workspace archive unconfirmed: " + workspace.id);
  }
}
console.log("PASS: checkpoint reused, command observed once, cleanup confirmed");
console.log("Archived", workspace.id, "- storage and quota retained");

async function waitUntilAvailable() {
  const signal = AbortSignal.timeout(90_000);
  const observer = new HarakiriClient({ apiUrl, apiKey, fetch: (url, init) => fetch(url, { ...init, signal }) });
  while (true) {
    signal.throwIfAborted();
    const { workspace: current } = await observer.workspaces.get(workspace.id);
    if (current.status === "available") return;
    if (["recovery_required", "archived"].includes(current.status)) throw new Error("Workspace needs recovery: " + workspace.id);
    await delay(500, undefined, { signal });
  }
}
${cleanup}`;

export const publishedSdkExamples = {
  quickstart: publishedQuickstart,
  worker: publishedWorker,
  artifacts: publishedArtifacts,
  workspace: publishedWorkspace,
  "opencode-headless": publishedOpenCodeHeadless,
  "opencode-server": publishedOpenCodeServer
};
