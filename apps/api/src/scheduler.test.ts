import assert from "node:assert/strict";
import test from "node:test";
import { normalizeState, shouldRunTemplateRetention } from "./scheduler.js";

test("normalizeState maps OpenSandbox states to Harakiri statuses", () => {
  assert.equal(normalizeState("Running"), "running");
  assert.equal(normalizeState("READY_WITH_IP"), "running");
  assert.equal(normalizeState("Pending"), "pending");
  assert.equal(normalizeState("Failed"), "error");
  assert.equal(normalizeState("Terminating"), "terminated");
});

test("shouldRunTemplateRetention respects interval boundaries", () => {
  assert.equal(shouldRunTemplateRetention(0, 1000, 1000), true);
  assert.equal(shouldRunTemplateRetention(1000, 1500, 1000), false);
  assert.equal(shouldRunTemplateRetention(1000, 2000, 1000), true);
  assert.equal(shouldRunTemplateRetention(0, 10_000, 0), false);
});
