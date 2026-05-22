import assert from "node:assert/strict";
import test from "node:test";
import { normalizeState } from "./scheduler.js";

test("normalizeState maps OpenSandbox states to Harakiri statuses", () => {
  assert.equal(normalizeState("Running"), "running");
  assert.equal(normalizeState("READY_WITH_IP"), "running");
  assert.equal(normalizeState("Pending"), "pending");
  assert.equal(normalizeState("Failed"), "error");
  assert.equal(normalizeState("Terminating"), "terminated");
});

