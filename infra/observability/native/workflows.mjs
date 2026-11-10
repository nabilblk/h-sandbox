// Installed-consumer fixture: no workspace imports and no Kubernetes access.
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { ROOT_CONTEXT, SpanStatusCode, trace } from "@opentelemetry/api";
import { HarakiriClient } from "@h-sandbox/sdk";
import { createRunTelemetry, observeRecordedProcess, withAgentRun } from "@h-sandbox/sdk/telemetry";

const window = (run) => ({ from: run.createdAt, to: new Date().toISOString(), limit: 100 });
async function visible(label, read, accept, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (accept(value)) return value;
    await delay(500);
  }
  throw new Error(`Native telemetry visibility deadline: ${label}`);
}

export async function exerciseNative({ apiUrl, apiKey, template, runId, producerSource }, gate, infrastructure) {
  const client = new HarakiriClient({ apiUrl, apiKey, requestTimeoutMs: 30_000 });
  let sandbox, recording;
  const diagnostics = [];
  try {
    sandbox = await client.sandboxes.create({ template, name: `telemetry-${runId}`, ttlSeconds: 1800, wait: false });
    await sandbox.wait({ timeoutMs: 600_000 });
    await gate("native-command-retry", async () => {
      await withAgentRun(client, {
        name: "Native validation and repair", sandboxId: sandbox.id, capture: "content",
        runtime: createRunTelemetry, ownership: "owned", onDiagnostic: ({ code }) => diagnostics.push(code)
      }, async ({ run, runtime }) => {
        recording = run;
        const root = runtime.tracer.startSpan("Validate and repair");
        const parent = trace.setSpan(ROOT_CONTEXT, root);
        try {
          const failed = await sandbox.processes.start({ command: "printf 'Synthetic validation failed\\n' >&2; exit 1", timeoutMs: 10_000 });
          await assert.rejects(observeRecordedProcess(failed, runtime, { parent, includeOutput: true }),
            (error) => error.commandId === failed.id && error.command?.exitCode === 1);
          const repair = await sandbox.processes.start({ command: "printf 'verified\\n' > telemetry-proof.txt; cat telemetry-proof.txt", timeoutMs: 10_000 });
          await observeRecordedProcess(repair, runtime, { parent, includeOutput: true });
          assert.equal(await sandbox.files.readText("telemetry-proof.txt"), "verified\n");
          root.setStatus({ code: SpanStatusCode.OK });
        } finally { root.end(); }
      });
      assert.deepEqual(diagnostics, []);
      await visible("spans", () => client.agentRuns.spans(recording.id, window(recording)), (value) => value.records.length === 3);
      const logs = await visible("logs", () => client.agentRuns.logs(recording.id, { ...window(recording), includeContent: true }),
        (value) => value.records.length === 2);
      assert.ok(logs.records.some((item) => item.content.body.includes("Synthetic validation failed")));
      assert.ok(logs.records.some((item) => item.content.body.includes("verified")));
      assert.equal((await client.agentRuns.get(recording.id)).run.reportedOutcome, "succeeded");
    });

    await gate("native-browser-investigation", () => infrastructure.browser(recording.id));

    await gate("collector-outage-execution", async () => {
      await infrastructure.collector(false);
      try {
        const started = Date.now();
        const codes = [];
        const result = await withAgentRun(client, { name: "Execution during telemetry outage", sandboxId: sandbox.id,
          runtime: createRunTelemetry, ownership: "owned", onDiagnostic: ({ code }) => codes.push(code)
        }, async ({ runtime }) => {
          const command = await sandbox.processes.start({ command: "printf 'still-running\\n'", timeoutMs: 10_000 });
          return observeRecordedProcess(command, runtime, { timeoutMs: 30_000 });
        });
        assert.equal(result.exitCode, 0);
        assert.ok(Date.now() - started < 60_000);
        assert.ok(codes.includes("flush_failed"));
      } finally { await infrastructure.collector(true); }
    });

    await gate("sandbox-otlp-producer", async () => {
      // This is an actual in-sandbox official OTel producer, not a model agent.
      await sandbox.run("python3 -m venv .telemetry-venv && .telemetry-venv/bin/python -m pip install --disable-pip-version-check opentelemetry-sdk==1.45.2 opentelemetry-exporter-otlp-proto-http==1.45.2", {
        check: true, timeoutMs: 180_000, requestTimeoutMs: 200_000
      });
      const { run } = await client.agentRuns.create({ name: "In-sandbox OTel producer", sandboxId: sandbox.id, capture: "metadata" });
      const grant = await client.agentRuns.grant(run.id, sandbox.id);
      let outcome = "failed";
      try {
        await sandbox.files.write("telemetry-producer.py", producerSource);
        await sandbox.files.write(".telemetry-grant.json", JSON.stringify({
          endpoint: "http://harakiri-api.harakiri-preview.svc.cluster.local:8080/v1/telemetry/traces",
          headers: grant.exporterOptions("traces").headers
        }), { mode: "0600" });
        await sandbox.run(".telemetry-venv/bin/python telemetry-producer.py", { check: true, timeoutMs: 30_000 });
        await visible("in-sandbox export", () => client.agentRuns.spans(run.id, window(run)),
          (value) => value.records.length === 1 && value.records[0].name === "Inside the sandbox");
        outcome = "succeeded";
      } finally {
        try { await sandbox.run("rm -f .telemetry-grant.json", { check: true, timeoutMs: 10_000 }); }
        finally {
          try { await client.agentRuns.close(run.id, outcome); }
          finally { await client.agentRuns.revokeGrant(run.id, grant.id); }
        }
      }
    });

    await gate("retained-after-termination", async () => {
      await sandbox.kill({ wait: true, timeoutMs: 180_000 });
      assert.equal((await client.agentRuns.spans(recording.id, window(recording))).records.length, 3);
      assert.equal((await client.agentRuns.logs(recording.id, { ...window(recording), includeContent: true })).records.length, 2);
    });
    await gate("storage-restart", async () => {
      await infrastructure.restart();
      await visible("retained restart", () => client.agentRuns.spans(recording.id, window(recording)), (value) => value.records.length === 3);
      assert.equal((await client.agentRuns.logs(recording.id, { ...window(recording), includeContent: true })).records.length, 2);
    });
    await gate("coordinated-cold-recovery", async () => {
      await infrastructure.recover();
      await visible("restored traces", () => client.agentRuns.spans(recording.id, window(recording)), (value) => value.records.length === 3);
      const logs = await visible("restored logs", () => client.agentRuns.logs(recording.id, { ...window(recording), includeContent: true }),
        (value) => value.records.length === 2);
      assert.ok(logs.records.some((item) => item.content.body.includes("Synthetic validation failed")));
      assert.ok(logs.records.some((item) => item.content.body.includes("verified")));
      assert.equal((await client.agentRuns.get(recording.id)).run.reportedOutcome, "succeeded");
      await infrastructure.browser(recording.id);
    });
  } finally {
    if (sandbox) await sandbox.kill({ wait: true, timeoutMs: 180_000 });
  }
}
