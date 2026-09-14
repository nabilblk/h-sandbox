import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { HarakiriClient } from "@h-sandbox/sdk";

const apiUrl = process.env.HARAKIRI_API_URL;
const apiKey = process.env.HARAKIRI_API_KEY;
if (!apiUrl || !apiKey) throw new Error("Set HARAKIRI_API_URL and HARAKIRI_API_KEY");
const client = new HarakiriClient({ apiUrl, apiKey });
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
    path: "/workspace/task.py", content: "print('sdk-worker-ready')\n", createParents: true
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
}
