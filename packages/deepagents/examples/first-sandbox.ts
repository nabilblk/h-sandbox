import { createDeepAgent } from "deepagents";
import { HarakiriClient } from "@h-sandbox/sdk";
import { withHarakiriSandbox } from "@h-sandbox/deepagents";
import { model } from "./first-model.js";

const prompt = `Write hello.sh that prints "hello from Deep Agents".
Run it with bash and report the output.`;

const template = process.env.HARAKIRI_TEMPLATE;
if (!template) throw new Error("Set HARAKIRI_TEMPLATE.");

const { messages } = await withHarakiriSandbox(
  HarakiriClient.fromEnv(),
  { template, ttlSeconds: 300 },
  ({ backend }) => {
    const agent = createDeepAgent({ model, backend });
    return agent.invoke(
      { messages: [["user", prompt]] },
      { recursionLimit: 12 }
    );
  }
);

console.log(messages.at(-1)?.text);
