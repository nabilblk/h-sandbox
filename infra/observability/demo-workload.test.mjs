import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { HarakiriTelemetryGrant } from "../../packages/sdk/dist/agent-runs.js";
import { recordDemoWorkload } from "./demo-workload.mjs";

test("local demo actually fails validation, repairs and verifies output; every step exports telemetry", async () => {
  const signals = [];
  const server = createServer((request, response) => {
    request.resume();
    request.once("end", () => {
      signals.push(request.url);
      response.writeHead(200, { "Content-Type": "application/x-protobuf" });
      response.end();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const grant = new HarakiriTelemetryGrant({ id: "demo", token: "test-only", capture: "content", expiresAt: new Date(Date.now() + 60_000).toISOString() },
      `http://127.0.0.1:${server.address().port}`);
    const repaired = await recordDemoWorkload(grant);
    assert.equal(repaired.outcome, "succeeded");
    assert.deepEqual(repaired.steps.map((step) => step.exitCode), [0, 1, 0, 0]);
    assert.equal(signals.filter((signal) => signal === "/v1/telemetry/traces").length, 5);
    assert.equal(signals.filter((signal) => signal === "/v1/telemetry/logs").length, 4);
    const failed = await recordDemoWorkload(grant, { repair: false });
    assert.equal(failed.outcome, "failed");
    assert.deepEqual(failed.steps.map((step) => step.exitCode), [0, 1]);
    assert.notEqual(repaired.traceId, failed.traceId);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
