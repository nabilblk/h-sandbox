import fs from "node:fs";
import { context, pinned, check, until } from "../acceptance/context.mjs";
import { install } from "../acceptance/install.mjs";
import { operatorSession } from "../acceptance/browser.mjs";
import { importAcceptanceTemplate } from "../acceptance/first-task.mjs";
import { finishReceipt, publicFailure } from "../acceptance/receipt.mjs";
import { installProviderCandidate } from "./candidate.mjs";
import { fileApi, reproduceBaseline, verifyTransfers } from "./workload.mjs";

process.umask(0o077);
const ctx = context();
ctx.guard();
const receipt = { kind: "provider-file-transfer", architecture: "amd64", published: false,
  baseline: { version: pinned.version, source: pinned.source, apiImage: pinned.images.api },
  candidateSource: process.env.GITHUB_SHA, runId: ctx.identity.id, results: [], startedAt: new Date().toISOString() };
const publish = () => fs.writeFileSync("standalone-acceptance-report.json", `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
let activeGate;
let operator;
let sandboxId;
async function gate(name, action) {
  activeGate = name;
  const disk = fs.statfsSync(ctx.identity.directory);
  check(disk.bavail * disk.bsize >= 2 * 1024 ** 3, "Provider runner has less than 2 GiB disk headroom");
  console.log(`Provider file acceptance: ${name}`);
  const started = Date.now();
  const evidence = await action();
  receipt.results.push({ gate: name, status: "passed", elapsedMs: Date.now() - started, evidence });
  publish();
  return evidence;
}
try {
  await gate("published-installation", async () => { await install(ctx); return { immutableArtifacts: true }; });
  await gate("oidc-onboarding", async () => { operator = await operatorSession(ctx); return { pkce: true }; });
  const template = await importAcceptanceTemplate(ctx, operator.client);
  await gate("native-runtime", async () => {
    const { sandbox } = await operator.client.createSandbox({ template, ttlSeconds: 2400, wait: false });
    sandboxId = sandbox.id;
    await operator.client.waitForSandbox(sandboxId, { timeoutMs: 600000 });
    return { ready: true };
  });
  const request = fileApi(ctx.read("client-key.json").token, sandboxId);
  await gate("baseline-reproduction", () => reproduceBaseline(request));
  receipt.candidate = await gate("candidate-installation", () => installProviderCandidate(ctx));
  await gate("candidate-file-contract", () => verifyTransfers(request, operator.client, sandboxId));
  receipt.status = "configured_gates_passed";
} catch (error) {
  ctx.save("provider-file-failure.json", { gate: activeGate, message: error.message, stack: error.stack });
  receipt.results.push({ gate: activeGate, status: "failed", failure: publicFailure(error) });
  receipt.status = "failed";
  process.exitCode = 1;
  console.error(`Provider file acceptance failed: ${activeGate}`);
} finally {
  await finishReceipt(receipt, {
    sandbox: async () => {
      if (!sandboxId) return;
      await operator.client.killSandbox(sandboxId);
      await until("Provider acceptance capacity release", async () => (await operator.client.capacity()).capacity.inUse === 0, 180000);
    },
    key: async () => { if (operator) await operator.request(`/v1/api-keys/${ctx.read("client-key.json").id}`, "DELETE"); },
    browser: async () => { if (operator) await operator.browser.close(); },
    portForwards: () => ctx.stopForwards()
  });
  if (receipt.status === "failed") process.exitCode = 1;
  publish();
}
