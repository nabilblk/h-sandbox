import assert from "node:assert/strict";
import test from "node:test";
import { agentFailure } from "./agent-failure.ts";

test("agent failure receipts include classification, never messages or payloads", () => {
  const error = { name: "GraphRecursionError", message: "PRIVATE_PROMPT", status: 503,
    cause: { code: "ECONNRESET", message: "PRIVATE_URL" },
    stack: "Error: PRIVATE_PROMPT\n at run (/private/path/orders-agent.ts:70:10)\n at PRIVATE_FRAME" };
  assert.deepEqual(agentFailure(error), { name: "GraphRecursionError", status: 503, code: "ECONNRESET", sources: ["orders-agent.ts:70:10"] });
  assert.deepEqual(agentFailure({ name: "PRIVATE_NAME", status: "PRIVATE_STATUS", code: "PRIVATE_CODE" }), { name: "Error", sources: [] });
  assert.equal(JSON.stringify(agentFailure(error)).includes("PRIVATE"), false);
  assert.deepEqual(agentFailure(agentFailure(error)), agentFailure(error));
  assert.deepEqual(agentFailure(null), { name: "Error", sources: [] });
});

test("actual SDK execution errors retain only their type", () => {
  for (const name of ["HarakiriCommandEndedError", "HarakiriCommandObservationError", "HarakiriRunError"]) {
    const failure = agentFailure({ name, message: "PRIVATE_COMMAND", status: "failed", stdout: "PRIVATE_OUTPUT" });
    assert.deepEqual(failure, { name, sources: [] });
  }
});
