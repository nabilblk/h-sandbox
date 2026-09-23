import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { HarakiriClient } from "@h-sandbox/sdk";
import { withHarakiriSandbox } from "@h-sandbox/deepagents";
import { createDeepAgent } from "deepagents";
import { initChatModel } from "langchain/chat_models/universal";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

const cwd = "/tmp/harakiri-repair";
const source = `export function total(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}
`;
const tests = `import assert from 'node:assert/strict';
import test from 'node:test';
import { total } from './invoice.mjs';
test('empty invoice', () => assert.equal(total([]), 0));
test('quantity is included', () => {
  assert.equal(total([{price: 100, quantity: 3}]), 300);
});
test('multiple lines', () => {
  assert.equal(total([{price: 25, quantity: 2}, {price: 40, quantity: 1}]), 90);
});
`;
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Model selection and credentials stay outside the execution sandbox. */
export async function repairRepository(
  client: HarakiriClient, model: BaseChatModel, template: string
) {
  return withHarakiriSandbox(
    client,
    { template, ttlSeconds: 600, egress: { mode: "blocked" } },
    async ({ sandbox, backend }) => {
      await sandbox.files.mkdir({ path: cwd, recursive: true });
      const uploaded = await backend.uploadFiles([
        [`${cwd}/invoice.mjs`, new TextEncoder().encode(source)],
        [`${cwd}/invoice.test.mjs`, new TextEncoder().encode(tests)]
      ]);
      assert.ok(uploaded.every(r => r.error === null), "Repository upload must succeed.");
      await sandbox.run([
        "git init -q", "git add .",
        "git -c user.name=Harakiri -c user.email=example@example.invalid commit -qm baseline"
      ].join(" && "), { cwd, check: true });
      const before = await sandbox.run("node --test invoice.test.mjs", { cwd });
      assert.notEqual(before.exitCode, 0, "The fixture must fail before the repair.");
      const originalTests = sha256(await sandbox.files.readBytes(`${cwd}/invoice.test.mjs`));
      const agent = createDeepAgent({
        model, backend,
        systemPrompt: [
          `Repair the invoice calculation in ${cwd}/invoice.mjs. Quantity must be included.`,
          "Do not modify invoice.test.mjs. Use the sandbox tools;",
          "do not install dependencies or use the network."
        ].join(" "),
        subagents: [], memory: [], skills: []
      });
      await agent.invoke({ messages: [{
        role: "user", content: "Inspect the repository, fix the bug and run its tests."
      }] }, { recursionLimit: 30 });
      // The application checks the outcome, independently of the model's final message.
      assert.equal(
        sha256(await sandbox.files.readBytes(`${cwd}/invoice.test.mjs`)),
        originalTests, "The test contract must remain unchanged."
      );
      const verified = await sandbox.run("node --test invoice.test.mjs", { cwd, check: true });
      const patch = await sandbox.run("git diff -- invoice.mjs", { cwd, check: true });
      assert.ok(patch.stdout.trim(), "Expected a patch to the implementation.");
      return { sandboxId: sandbox.id, testReport: verified.stdout, patch: patch.stdout };
    },
    { backend: { cwd, timeoutMs: 60_000 }, cleanupTimeoutMs: 90_000 }
  );
}

// Importing this file for tests does not create a sandbox or call a model.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const modelName = process.env.HARAKIRI_AGENT_MODEL;
  const template = process.env.HARAKIRI_TEMPLATE;
  if (!modelName || !template) {
    throw new Error("Set HARAKIRI_AGENT_MODEL and HARAKIRI_TEMPLATE before creating a sandbox.");
  }
  // Install your chosen LangChain model-provider package in this application.
  const model = await initChatModel(modelName);
  const result = await repairRepository(HarakiriClient.fromEnv(), model, template);
  console.log(result.testReport);
  console.log(result.patch);
  console.log(`Verified and cleaned up sandbox ${result.sandboxId}.`);
}
