import assert from "node:assert/strict";
import test from "node:test";
import { configuredComplete, gateReceipt, nativeGates } from "./contracts.mjs";

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
