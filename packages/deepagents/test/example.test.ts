import assert from "node:assert/strict";
import test from "node:test";
import { AIMessage } from "@langchain/core/messages";
import { HarakiriRunError } from "@h-sandbox/sdk";
import { repairRepository } from "../examples/run-repair.js";
import { fixture } from "./fixture.js";
import { ScriptedModel } from "./scripted-model.js";

process.env.LANGSMITH_TRACING = "false";
process.env.LANGCHAIN_TRACING_V2 = "false";

const cwd = "/tmp/harakiri-repair";
const edit = (file: string, oldString: string, newString: string) => new AIMessage({
  content: "", tool_calls: [{
    name: "edit_file", id: "repair_1", type: "tool_call",
    args: { file_path: `${cwd}/${file}`, old_string: oldString, new_string: newString }
  }]
});

/** Synthetic runtime responses: verifies the example's orchestration, not native Git or Node. */
function repairFixture() {
  const f = fixture();
  f.state.onCommand = command => {
    Object.assign(f.state.output, { exitCode: 0, stdout: "", stderr: "" });
    if (command === "node --test invoice.test.mjs") {
      const repaired = new TextDecoder().decode(f.files.get(`${cwd}/invoice.mjs`)).includes("item.price * item.quantity");
      f.state.output.exitCode = repaired ? 0 : 1;
      f.state.output.stdout = repaired ? "3 passing tests" : "quantity assertion failed";
    }
    if (command === "git diff -- invoice.mjs") f.state.output.stdout = "+ item.price * item.quantity\n";
  };
  return f;
}

test("single-file repair example uses real Deep Agents tools, verifies its result and confirms cleanup", async () => {
  const f = repairFixture();
  const model = new ScriptedModel([
    edit("invoice.mjs", "sum + item.price", "sum + item.price * item.quantity"),
    new AIMessage("The repair is ready.")
  ]);
  const result = await repairRepository(f.client, model, "synthetic-node-template");
  assert.equal(result.testReport, "3 passing tests");
  assert.match(result.patch, /item\.quantity/);
  assert.equal(result.sandboxId, f.summary.id);
  assert.equal(f.summary.status, "terminated");
  assert.equal(f.summary.capacityPhase, "released");
  const create = f.requests.find(r => r.url.pathname === "/v1/sandboxes" && r.method === "POST");
  assert.deepEqual(create?.body.egress, { mode: "blocked" });
  assert.equal(f.requests.filter(r => r.method === "DELETE").length, 1);
  assert.equal(f.requests.filter(r => r.body.command === "node --test invoice.test.mjs").length, 2);
});

test("single-file example rejects a model's success claim when the repair still fails and cleans up", async () => {
  const f = repairFixture();
  await assert.rejects(repairRepository(f.client, new ScriptedModel([new AIMessage("All tests pass!")]), "synthetic-template"), HarakiriRunError);
  assert.equal(f.summary.capacityPhase, "released");
  assert.ok(!f.requests.some(r => r.body.command === "git diff -- invoice.mjs"));
});

test("single-file example detects edited verification tests and cleans up", async () => {
  const f = repairFixture();
  const model = new ScriptedModel([
    edit("invoice.test.mjs", "300", "100"), new AIMessage("All tests pass!")
  ]);
  await assert.rejects(repairRepository(f.client, model, "synthetic-template"), /test contract must remain unchanged/);
  assert.equal(f.summary.capacityPhase, "released");
  assert.equal(f.requests.filter(r => r.body.command === "node --test invoice.test.mjs").length, 1);
});
