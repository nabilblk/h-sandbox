import { initChatModel } from "langchain/chat_models/universal";

const name = process.env.HARAKIRI_AGENT_MODEL;
if (!name) throw new Error("Set HARAKIRI_AGENT_MODEL to your tool-capable model.");

// Install and configure your model provider in this application, not the sandbox.
export const model = await initChatModel(name);
