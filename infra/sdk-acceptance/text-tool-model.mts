import { ChatOllama } from "@langchain/ollama";
import { ToolMessage, type BaseMessage } from "@langchain/core/messages";

/** Ollama 1.3.0 rejects even text-only content blocks returned by Deep Agents. */
export function textToolMessages(messages: BaseMessage[]): BaseMessage[] {
  return messages.map(message => {
    if (!ToolMessage.isInstance(message) || typeof message.content === "string") return message;
    if (!message.content.every(block => block.type === "text" && typeof block.text === "string")) {
      throw new TypeError("The acceptance model supports text-only tool results.");
    }
    return new ToolMessage({ ...message, content: message.content.map(block => block.text).join("\n") });
  });
}

// This transport compatibility belongs to the disposable model harness, not the adapter.
export class TextToolChatOllama extends ChatOllama {
  override _streamResponseChunks(...args: Parameters<ChatOllama["_streamResponseChunks"]>) {
    const [messages, options, manager] = args;
    return super._streamResponseChunks(textToolMessages(messages), options, manager);
  }

  override _streamChatModelEvents(...args: Parameters<ChatOllama["_streamChatModelEvents"]>) {
    const [messages, options, manager] = args;
    return super._streamChatModelEvents(textToolMessages(messages), options, manager);
  }
}
