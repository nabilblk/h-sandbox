import fs from "node:fs";
import { context, check, until } from "../acceptance/context.mjs";
import { install } from "../acceptance/install.mjs";
import { operatorSession } from "../acceptance/browser.mjs";
import { importAcceptanceTemplate } from "../acceptance/first-task.mjs";
import { finishReceipt, publicFailure } from "../acceptance/receipt.mjs";
import { installWorkbenchCandidate } from "./candidate.mjs";
import { sandboxPath, probeKey } from "./fixtures.mjs";
import { publicReceipt, gates } from "./receipt.mjs";
import { verifyOverview, verifyPty, verifyFiles, verifyLogs, verifyMetrics, verifyCommands, verifyDeniedAttach } from "./browser.mjs";

process.umask(0o077);
const ctx = context();
ctx.guard();
const receipt = { status: "running", source: process.env.GITHUB_SHA, runId: ctx.identity.id, results: [], startedAt: new Date().toISOString() };
// Keep the shared filename so guarded cleanup can append its final result.
const publish = () => fs.writeFileSync("standalone-acceptance-report.json", `${JSON.stringify(publicReceipt(receipt), null, 2)}\n`, { mode: 0o600 });
let activeGate;
let operator;
let sandboxId;
let readOnlyKey;
async function gate(name, action) {
  check(gates.has(name), "Unknown Workbench gate");
  activeGate = name;
  ctx.guard();
  const disk = fs.statfsSync(ctx.identity.directory);
  check(disk.bavail * disk.bsize >= 2 * 1024 ** 3, "Workbench runner has less than 2 GiB disk headroom");
  console.log(`Workbench acceptance: ${name}`);
  const started = Date.now();
  const evidence = await action();
  receipt.results.push({ gate: name, status: "passed", elapsedMs: Date.now() - started, evidence });
  publish();
}
try {
  publish();
  await gate("published-installation", async () => { await install(ctx); return { immutableArtifacts: true }; });
  await gate("source-candidate", async () => { receipt.candidate = await installWorkbenchCandidate(ctx); });
  await gate("oidc-onboarding", async () => { operator = await operatorSession(ctx); return { pkce: operator.pkceS256, scopedKey: true }; });
  await gate("native-runtime", async () => {
    const template = await importAcceptanceTemplate(ctx, operator.client);
    const { sandbox } = await operator.client.createSandbox({ template, ttlSeconds: 2400, wait: false });
    sandboxPath(sandbox.id);
    sandboxId = sandbox.id;
    ctx.save("workbench-sandbox.json", { sandboxId, template });
    await operator.client.waitForSandbox(sandboxId, { timeoutMs: 600000 });
    return { ready: true };
  });
  for (const [name, verify] of [["overview", verifyOverview], ["pty", verifyPty], ["files", verifyFiles], ["logs", verifyLogs], ["metrics", verifyMetrics], ["commands", verifyCommands]]) {
    await gate(name, () => verify(operator.page, sandboxId));
  }
  await gate("denied-attach", async () => {
    readOnlyKey = await operator.request("/v1/api-keys", "POST", { name: "workbench-read-only", scopes: ["sandboxes:read"], expiresAt: new Date(Date.now() + 3600000).toISOString() }, 201);
    ctx.save("workbench-read-key.json", { id: readOnlyKey.key.id, token: readOnlyKey.token });
    return verifyDeniedAttach(operator.page, sandboxId, readOnlyKey.token);
  });
  receipt.status = "configured_gates_passed";
} catch (error) {
  ctx.save("workbench-failure.json", { gate: activeGate, message: error.message, stack: error.stack });
  receipt.results.push({ gate: activeGate, status: "failed", failure: publicFailure(error) });
  receipt.status = "failed";
  process.exitCode = 1;
  console.error(`Workbench acceptance failed: ${activeGate}`);
} finally {
  await finishReceipt(receipt, {
    sandbox: async () => {
      if (!sandboxId) return;
      ctx.guard();
      await operator.client.killSandbox(sandboxId);
      await until("Workbench capacity release", async () => (await operator.client.capacity()).capacity.inUse === 0, 180000);
    },
    readOnlyKey: async () => {
      if (!readOnlyKey) return;
      ctx.guard();
      await operator.request(`/v1/api-keys/${readOnlyKey.key.id}`, "DELETE");
      await probeKey(sandboxId, readOnlyKey.token, 401);
    },
    key: async () => {
      if (!operator) return;
      ctx.guard();
      const key = ctx.read("client-key.json");
      await operator.request(`/v1/api-keys/${key.id}`, "DELETE");
      if (sandboxId) await probeKey(sandboxId, key.token, 401);
    },
    browser: async () => { if (operator) await operator.browser.close(); },
    portForwards: () => ctx.stopForwards()
  });
  if (receipt.status === "failed") process.exitCode = 1;
  publish();
}
