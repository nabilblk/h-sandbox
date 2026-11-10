import assert from "node:assert/strict";
import test from "node:test";
import type { TelemetrySpan } from "@harakiri/shared";
import { generationFacts, reportedTokens, traceMessages } from "./llm-observability";

test("text, OpenAI tool calls and OTel tool parts retain roles and call identities", () => {
  const input = [
    { role: "system", content: "Only use controlled tools." },
    { role: "assistant", content: "", tool_calls: [{ id: "call_1", function: { name: "read", arguments: '{"path":"a"}' } }] },
    { role: "tool", name: "read", tool_call_id: "call_1", content: "<script>hostile()</script>" },
    { role: "assistant", parts: [{ type: "text", content: "Result" }, { type: "tool_call", id: "call_2", name: "verify", arguments: { count: 2 } }] },
    { role: "tool", parts: [{ type: "tool_call_response", id: "call_2", result: { verified: true } }] }
  ];
  const messages = traceMessages(JSON.stringify(input))!;
  assert.equal(messages.length, 5);
  assert.deepEqual(messages[1].parts, [{ type: "call", id: "call_1", name: "read", value: '{"path":"a"}' }]);
  assert.equal(messages[2].callId, "call_1");
  assert.deepEqual(messages[2].parts, [{ type: "text", text: "<script>hostile()</script>" }]);
  assert.deepEqual(messages[3].parts[1], { type: "call", id: "call_2", name: "verify", value: { count: 2 } });
  assert.deepEqual(messages[4].parts[0], { type: "result", id: "call_2", value: { verified: true } });
});

test("unsupported, oversized and truncated messages fall back to raw payload, not empty success", () => {
  for (const value of ['[{"role":', "null", "{}", '[{"content":"missing role"}]',
    '[{"role":"user","content":[{"type":"image_url","image_url":"https://external.invalid/a"}]}]',
    '[{"role":"assistant","tool_calls":"invalid"}]', JSON.stringify(Array.from({ length: 129 }, () => ({ role: "user", content: "a" })))]) {
    assert.equal(traceMessages(value), null);
  }
  assert.deepEqual(traceMessages("[]"), []);
  assert.deepEqual(traceMessages('[{"role":"assistant","content":null}]')?.[0].parts, []);
});

test("reported usage distinguishes zero, absent and invalid without double counting subsets", () => {
  for (const value of [undefined, "-1", "NaN", "1.2", "1e3", "9007199254740992"]) assert.equal(reportedTokens(value), null);
  assert.equal(reportedTokens("0"), 0n);
  const span: Pick<TelemetrySpan, "attributes"> = { attributes: { "gen_ai.usage.input_tokens": "100", "gen_ai.usage.output_tokens": "20",
    "gen_ai.usage.cache_read.input_tokens": "70", "gen_ai.usage.cache_creation.input_tokens": "20",
    "gen_ai.usage.reasoning.output_tokens": "10", "gen_ai.response.finish_reasons": '["stop"]', "harakiri.llm.first_token_ms": "0" } };
  assert.equal(generationFacts(span).total, 120n);
  assert.equal(generationFacts(span).inconsistent, false);
  assert.equal(generationFacts(span).firstTokenMs, 0);
  assert.equal(generationFacts(span).finish, "stop");
  span.attributes["gen_ai.usage.cache_creation.input_tokens"] = "40";
  assert.equal(generationFacts(span).inconsistent, true);
  delete span.attributes["gen_ai.usage.output_tokens"];
  delete span.attributes["harakiri.llm.first_token_ms"];
  assert.equal(generationFacts(span).total, null);
  assert.equal(generationFacts(span).firstTokenMs, null);
});
