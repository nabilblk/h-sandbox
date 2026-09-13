// Copied into the isolated consumer: no workspace source imports or provider SDK.
import assert from "node:assert/strict";
import {
  HarakiriClient, HarakiriRunError, HarakiriCommandEndedError,
  HarakiriWaitTimeoutError, HarakiriSandboxCreationError, CommandStreamError
} from "@h-sandbox/sdk";

export async function exerciseSdk({ apiUrl, apiKey, template, runId }, gate, setProviderAvailable) {
  const env = { HARAKIRI_API_URL: apiUrl, HARAKIRI_API_KEY: apiKey };
  const client = HarakiriClient.fromEnv({ env });
  const owned = new Map();
  let workspace;
  const create = async (options = {}) => {
    const sandbox = await client.sandboxes.create({ template, ttlSeconds: 1200, wait: false, ...options });
    owned.set(sandbox.id, sandbox);
    await sandbox.wait({ timeoutMs: 600000 });
    return sandbox;
  };
  const release = async sandbox => {
    await sandbox.kill({ wait: true, timeoutMs: 180000 });
    assert.equal(sandbox.status, "terminated");
    owned.delete(sandbox.id);
  };
  try {
    workspace = await client.workspaces.create({ name: `sdk-${runId}` });
    const sandbox = await gate("creation-and-finite-tasks", async () => {
      const sandbox = await create({ workspaceId: workspace.id, name: "sdk-first-task" });
      assert.equal(sandbox.creation.sandbox.id, sandbox.id);
      assert.equal(sandbox.readiness.status, "ready");
      const result = await sandbox.run("python3 -c 'print(6 * 7)'", { check: true });
      assert.equal(result.stdout.trim(), "42");
      assert.equal((await sandbox.run("pwd", { check: true })).stdout.trim(), sandbox.runtimeMetadata.workdir);
      assert.equal((await sandbox.run({ command: "printf legacy" })).result.stdout, "legacy");
      assert.equal((await sandbox.run("exit 7")).exitCode, 7);
      await assert.rejects(sandbox.run("printf failure >&2; exit 7", { check: true }), error =>
        error instanceof HarakiriRunError && error.exitCode === 7 && error.stderr.includes("failure"));
      const listed = await client.listSandboxes({ q: "sdk-first-task", status: "all", limit: 10 });
      assert.ok(listed.sandboxes.some(item => item.id === sandbox.id));
      return sandbox;
    });
    await gate("atomic-capacity-error", async () => {
      await assert.rejects(client.sandboxes.create({ template, wait: false }), error =>
        error.status === 409 && error.code === "organization_capacity_exceeded");
      assert.equal((await client.capacity()).capacity.inUse, 1);
    });
    await gate("text-and-binary-files", async () => {
      await sandbox.files.write("checkpoint.txt", "retained SDK checkpoint\n");
      assert.equal(await sandbox.files.readText("checkpoint.txt"), "retained SDK checkpoint\n");
      const bytes = new Uint8Array([0, 1, 128, 255]);
      await sandbox.files.write("input.bin", bytes);
      await sandbox.run("python3 -c \"from pathlib import Path; Path('output.bin').write_bytes(Path('input.bin').read_bytes()[::-1])\"", { check: true });
      assert.deepEqual(await sandbox.files.readBytes("output.bin"), new Uint8Array([255, 128, 1, 0]));
    });
    await gate("process-reconnect-and-cancellation", async () => {
      await sandbox.files.write("worker.py", `import time\nfrom pathlib import Path\nwith Path('started.txt').open('a') as f: f.write('once\\n')\nprint('first', flush=True)\ntime.sleep(8)\nprint('last', flush=True)\n`);
      const task = await sandbox.processes.start({ command: "python3 worker.py", timeoutMs: 90000 });
      await assert.rejects(task.wait({ timeoutMs: 10 }), error => error instanceof HarakiriWaitTimeoutError);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error("Viewer disconnected")), 50);
      try { await assert.rejects(task.wait({ signal: controller.signal }), /Viewer disconnected/); }
      finally { clearTimeout(timer); }
      await task.refresh();
      assert.ok(["queued", "running"].includes(task.status));
      let cursor;
      let output = "";
      for await (const event of task.events({ signal: AbortSignal.timeout(60000) })) {
        cursor = event.cursor;
        if (event.type === "output") { output += event.stdout; break; }
      }
      assert.ok(cursor);
      const secondClient = HarakiriClient.fromEnv({ env });
      const connected = await secondClient.sandboxes.connect(task.reference.sandboxId);
      const resumed = await connected.processes.connect(task.reference.commandId);
      assert.deepEqual(resumed.reference, task.reference);
      assert.equal(JSON.stringify(resumed).includes(apiKey), false);
      for await (const event of resumed.events({ cursor, signal: AbortSignal.timeout(60000) })) {
        if (event.type === "output") output += event.stdout;
      }
      assert.equal((await resumed.wait()).exitCode, 0);
      assert.equal(output, "first\nlast\n");
      assert.equal(await sandbox.files.readText("started.txt"), "once\n");
      assert.ok((await resumed.logs()).stdout.includes("last"));
      // A cursor from the wrong log source cannot silently restart or claim complete output.
      await assert.rejects(async () => {
        for await (const _event of resumed.events({ cursor: `v1:${resumed.id}:s:1`, signal: AbortSignal.timeout(30000) })) { /* consume */ }
      }, error => error instanceof CommandStreamError && error.code === "command_stream_unavailable");
      assert.equal(await sandbox.files.readText("started.txt"), "once\n");
      const failed = await sandbox.processes.start({ command: "exit 9", timeoutMs: 30000 });
      await assert.rejects(failed.wait(), error => error instanceof HarakiriCommandEndedError && error.command.exitCode === 9);
      assert.equal(failed.status, "failed");
    });
    await gate("protected-http-and-local-git", async () => {
      await sandbox.run("git init fixture && git -C fixture config user.email sdk@example.test && git -C fixture config user.name SDK && printf fixture > fixture/README.md && git -C fixture add README.md && git -C fixture commit -m fixture && git clone --bare fixture repo.git && git --git-dir=repo.git update-server-info", { check: true });
      const server = await sandbox.processes.start({ command: "python3 -m http.server 8088 --bind 0.0.0.0", timeoutMs: 300000 });
      const route = await sandbox.routes.expose({ port: 8088, accessMode: "token" });
      assert.equal(new URL(route.url).origin, apiUrl);
      const ready = await route.waitForHttp({ path: "/checkpoint.txt", timeoutMs: 90000 });
      assert.equal(await ready.text(), "retained SDK checkpoint\n");
      const anonymous = await fetch(route.url, { redirect: "manual", signal: AbortSignal.timeout(10000) });
      assert.ok([401, 403].includes(anonymous.status));
      await anonymous.body?.cancel();
      const request = new Request(`${route.url.replace(/\/$/, "")}/checkpoint.txt`, { method: "HEAD", headers: { "x-sdk-fixture": "request-object" } });
      assert.equal((await route.fetch(request)).status, 200);
      assert.equal(await (await route.fetch("checkpoint.txt")).text(), "retained SDK checkpoint\n");
      await sandbox.git.clone("http://127.0.0.1:8088/repo.git", { targetPath: "/workspace/clone" });
      assert.equal(await sandbox.files.readText("clone/README.md"), "fixture");
      await route.delete();
      await server.kill();
    });
    await gate("retained-workspace-and-confirmed-release", async () => {
      const firstId = sandbox.id;
      await release(sandbox);
      await workspace.wait({ timeoutMs: 180000 });
      const reconnectedWorkspace = await client.workspaces.connect(workspace.id);
      assert.equal(reconnectedWorkspace.status, "available");
      const replacement = await create({ workspaceId: workspace.id, name: "sdk-replacement" });
      assert.notEqual(replacement.id, firstId);
      assert.equal(await replacement.files.readText("checkpoint.txt"), "retained SDK checkpoint\n");
      await release(replacement);
      await workspace.wait({ timeoutMs: 180000 });
    });
    await gate("partial-source-and-unconfirmed-cleanup", async () => {
      let failed;
      // Port 1 is closed inside this fresh sandbox. No third-party Git host or model is needed.
      await assert.rejects(client.sandboxes.create({ template, ttlSeconds: 600, waitTimeoutMs: 600000,
        source: { type: "git", url: "http://127.0.0.1:1/missing.git", targetPath: "/workspace/missing", timeoutMs: 10000 }
      }), error => {
        if (!(error instanceof HarakiriSandboxCreationError) || error.stage !== "source") return false;
        failed = error;
        return error.cleanup === "not_requested" && Boolean(error.sandboxId);
      });
      const retained = await client.sandboxes.connect(failed.sandboxId);
      owned.set(retained.id, retained);
      assert.equal((await client.getSandbox(retained.id)).sandbox.source.status, "failed");
      await setProviderAvailable(false);
      try {
        await assert.rejects(retained.kill({ wait: true, timeoutMs: 1500 }));
        const { capacity } = await client.capacity();
        assert.equal(capacity.inUse, 1);
        assert.notEqual((await client.getSandbox(retained.id)).sandbox.capacityPhase, "released");
      } finally { await setProviderAvailable(true); }
      await release(retained);
    });
  } finally {
    const failures = [];
    for (const sandbox of owned.values()) {
      try { await release(sandbox); } catch (error) { failures.push(error); }
    }
    if (workspace) {
      try { await workspace.wait({ timeoutMs: 180000 }); await workspace.archive(); }
      catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, "SDK acceptance cleanup was not confirmed");
  }
}
