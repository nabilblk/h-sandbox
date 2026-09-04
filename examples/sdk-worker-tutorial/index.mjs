import { randomUUID } from "node:crypto";
import { HarakiriApiError, HarakiriClient } from "@h-sandbox/sdk";

const apiUrl = process.env.HARAKIRI_API_URL;
const apiKey = process.env.HARAKIRI_API_KEY;
if (!apiUrl || !apiKey) {
  throw new Error("HARAKIRI_API_URL and HARAKIRI_API_KEY are required");
}

const client = new HarakiriClient({ apiUrl, apiKey });
const jobId = process.env.JOB_ID ?? randomUUID();
let sandboxId;

try {
  const created = await client.createSandbox({
    template: "python-3.12-data",
    name: "tutorial-sdk-worker",
    ttlSeconds: 600,
    wait: false,
    idempotencyKey: `tutorial-job-${jobId}`
  });
  sandboxId = created.sandbox.id;
  await client.waitForSandbox(sandboxId, { timeoutMs: 90_000 });

  await client.writeSandboxFile(sandboxId, {
    path: "/workspace/task.py",
    content: "print('sdk-worker-ready')\n",
    createParents: true
  });

  const run = await client.runSandbox(sandboxId, {
    command: "python /workspace/task.py",
    timeoutMs: 30_000
  });

  if (run.result.exitCode !== 0 || !run.result.stdout.includes("sdk-worker-ready")) {
    throw new Error(run.result.stderr || "unexpected sandbox result");
  }

  console.log(`PASS: ${sandboxId} completed the worker task`);
} catch (error) {
  if (error instanceof HarakiriApiError) {
    console.error({ code: error.code, retryable: error.retryable });
  }
  throw error;
} finally {
  if (sandboxId) await client.killSandbox(sandboxId).catch(() => undefined);
}
