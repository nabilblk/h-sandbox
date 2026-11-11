import assert from "node:assert/strict";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage } from "@langchain/core/messages";
import { createDeepAgent } from "deepagents";

export const canary = "FRAMEWORK_PRIVATE_CONTENT";

/** Deterministic model decisions; the agent graph and callbacks are real. */
class ScriptedModel extends BaseChatModel {
  constructor(private readonly messages: AIMessage[]) { super({}); }
  _llmType() { return "observability-qualification"; }
  bindTools() { return this; }
  async _generate() {
    const message = this.messages.shift();
    assert.ok(message);
    return { generations: [{ text: "", message }] };
  }
}

export async function invoke(id: string) {
  const model = new ScriptedModel([
    new AIMessage({ content: "", tool_calls: [{ name: "write_file", args: { file_path: `/report-${id}.txt`, content: canary }, id: `tool_${id}`, type: "tool_call" }],
      usage_metadata: { input_tokens: 12, output_tokens: 8, total_tokens: 20 } }),
    new AIMessage({ content: "Written", usage_metadata: { input_tokens: 20, output_tokens: 2, total_tokens: 22 } })
  ]);
  const agent = createDeepAgent({ model, subagents: [], memory: [], skills: [] });
  const result = await agent.invoke({ messages: [{ role: "user", content: canary }] }, { runName: `qualification-${id}` });
  assert.equal(result.messages.at(-1)?.content, "Written");
}
