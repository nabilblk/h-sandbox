import { createDeepAgent, LocalShellBackend } from "deepagents";
import { model } from "./first-model.js";

const prompt = `Write hello.sh that prints "hello from Deep Agents".
Run it with bash and report the output.`;

// Local shell access is not isolation.
const backend = await LocalShellBackend.create({
  rootDir: "./deepagents-local",
  inheritEnv: false
});

try {
  const agent = createDeepAgent({ model, backend });
  const { messages } = await agent.invoke(
    { messages: [["user", prompt]] },
    { recursionLimit: 12 }
  );

  console.log(messages.at(-1)?.text);
} finally {
  await backend.close();
}
