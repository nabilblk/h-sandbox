import assert from "node:assert/strict";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AIMessage } from "@langchain/core/messages";

/** Deterministic tool decisions, not model inference. The agent/tool graph remains real. */
export class ScriptedModel extends BaseChatModel {
  constructor(private readonly responses: AIMessage[]) { super({}); }
  _llmType() { return "harakiri-contract-fixture"; }
  bindTools() { return this; }
  async _generate() {
    const message = this.responses.shift();
    assert.ok(message, "The framework requested an unexpected extra model turn.");
    return { generations: [{ text: "", message }] };
  }
}
