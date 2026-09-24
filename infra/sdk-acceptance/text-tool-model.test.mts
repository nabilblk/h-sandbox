import assert from "node:assert/strict";
import test from "node:test";
import { ChatOllama } from "@langchain/ollama";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { TextToolChatOllama, textToolMessages } from "./text-tool-model.mjs";

const result = () => new ToolMessage({
  content: [{ type: "text", text: "first" }, { type: "text", text: "second" }],
  tool_call_id: "synthetic-call", name: "read_file", id: "synthetic-message", status: "success"
});

test("text tool normalization preserves identity, metadata and source messages", () => {
  const original = result();
  const normalized = textToolMessages([original])[0] as ToolMessage;
  assert.equal(normalized.content, "first\nsecond");
  for (const key of ["tool_call_id", "name", "id", "status"] as const) assert.equal(normalized[key], original[key]);
  assert.ok(Array.isArray(original.content));
  const plain = new ToolMessage({ content: "unchanged", tool_call_id: "plain" });
  const assistant = new AIMessage("unchanged");
  assert.equal(textToolMessages([plain])[0], plain);
  assert.equal(textToolMessages([assistant])[0], assistant);
  assert.throws(() => textToolMessages([new ToolMessage({
    tool_call_id: "image", content: [{ type: "image_url", image_url: "data:image/png;base64,AA==" }]
  })]), /text-only/);
});

test("the pinned provider rejects text blocks before calling its transport", async t => {
  const model = new ChatOllama({ model: "qwen3:4b", think: false, maxRetries: 0 });
  let requests = 0;
  t.mock.method(model.client, "chat", async () => { requests++; throw new Error("Unexpected network request"); });
  await assert.rejects(model.invoke([result()]), /Non string tool message content is not supported/);
  assert.equal(requests, 0);
});

test("invoke and both streaming paths pass complete text to Ollama without a real model", async t => {
  const model = new TextToolChatOllama({ model: "qwen3:4b", think: false, maxRetries: 0 });
  let requests = 0;
  t.mock.method(model.client, "chat", async (request: { messages: { role: string; content: string }[]; think: boolean }) => {
    requests++;
    assert.equal(request.think, false);
    assert.deepEqual(request.messages, [{ role: "tool", content: "first\nsecond" }]);
    return (async function* () {
      yield { message: { role: "assistant", content: "received" }, done: true, done_reason: "stop" };
    })();
  });
  assert.equal((await model.invoke([result()])).content, "received");
  for await (const _chunk of await model.stream([result()])) { /* Consume the actual provider stream. */ }
  for await (const _event of model._streamChatModelEvents([result()], {})) { /* Verify the event path too. */ }
  assert.equal(requests, 3);
});
