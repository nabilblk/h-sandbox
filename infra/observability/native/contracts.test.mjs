import assert from "node:assert/strict";
import test from "node:test";
import { configuredComplete, diagnosticLocation, gateReceipt, nativeGates, workloadDiagnostics } from "./contracts.mjs";

test("native telemetry receipt requires every configured gate exactly once", () => {
  const receipts = nativeGates.map((name) => gateReceipt(name, 12.5));
  assert.equal(configuredComplete(receipts), true);
  assert.equal(configuredComplete(receipts.slice(1)), false);
  assert.equal(configuredComplete([...receipts, receipts[0]]), false);
  assert.equal(configuredComplete([...receipts, { name: nativeGates[0], status: "failed" }]), false);
  assert.throws(() => gateReceipt("private-token", 1));
  assert.throws(() => gateReceipt(nativeGates[0], Infinity));
  assert.deepEqual(receipts[0], { name: "published-installation", elapsedMs: 13, status: "passed" });
});

test("failure diagnostics retain only known code locations and network codes", () => {
  const error = new TypeError("PRIVATE_TOKEN", { cause: { code: "ECONNREFUSED" } });
  error.stack = "TypeError: PRIVATE_TOKEN\n    at run (file:///private/root/infra/observability/native/agents.mjs:42:9)\n    at https://user:PRIVATE_TOKEN@example.test/handler:1:2";
  assert.deepEqual(diagnosticLocation(error), { sources: ["agents.mjs:42:9"], transportCode: "ECONNREFUSED" });
  assert.deepEqual(diagnosticLocation({ cause: { code: "PRIVATE_TOKEN" }, stack: "PRIVATE_TOKEN" }), {});
  assert.deepEqual(diagnosticLocation(null), {});
});

test("workload diagnostics never retain pod metadata, image credentials or arbitrary messages", () => {
  const result = workloadDiagnostics({ items: [{ metadata: { name: "PRIVATE" }, spec: { token: "PRIVATE" }, status: {
    phase: "Running", containerStatuses: [{ name: "api", ready: false, restartCount: 2, image: "PRIVATE",
      lastState: { terminated: { reason: "OOMKilled", exitCode: 137, message: "PRIVATE" } },
      state: { waiting: { reason: "PRIVATE", message: "PRIVATE" } } }]
  } }] });
  assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
  assert.deepEqual(result[0].containers[0].lastTermination, { reason: "OOMKilled", exitCode: 137 });
  assert.deepEqual(workloadDiagnostics(null), []);
});
