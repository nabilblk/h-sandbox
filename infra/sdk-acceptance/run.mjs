import fs from "node:fs";
import { context, pinned, check, origins } from "../acceptance/context.mjs";
import { install } from "../acceptance/install.mjs";
import { operatorSession } from "../acceptance/browser.mjs";
import { importAcceptanceTemplate } from "../acceptance/first-task.mjs";
import { replicas } from "../acceptance/operator.mjs";
import { finishReceipt, publicFailure } from "../acceptance/receipt.mjs";
import { diagnostics } from "../acceptance/diagnostics.mjs";
import { installSdkCandidate } from "./candidate.mjs";
import { sdkGateReceipt, sdkGates } from "./receipt.mjs";

process.umask(0o077);
const ctx = context();
ctx.guard();
const receipt = {
  kind: "typescript-sdk-dx", baseline: pinned.version, applicationSource: pinned.source,
  candidateSource: process.env.GITHUB_SHA, published: false, architecture: "amd64",
  node: process.version, runId: ctx.identity.id, startedAt: new Date().toISOString(), results: [],
  limits: ["No LLM inference", "Unreplayable cursor contract, not a retention-expiry simulation", "No distributed exactly-once Git bootstrap claim", "No package publication or deployment outside this runner"]
};
const publish = () => fs.writeFileSync("standalone-acceptance-report.json", `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
let activeGate = "published-installation";
let operator;
async function gate(name, action) {
  check(sdkGates.includes(name), "Unknown SDK acceptance gate");
  activeGate = name;
  const started = Date.now();
  const disk = fs.statfsSync(ctx.identity.directory);
  check(disk.bavail * disk.bsize >= 2 * 1024 ** 3, "SDK runner has less than 2 GiB disk headroom");
  console.log(`SDK acceptance: ${name}`);
  const result = await action();
  receipt.results.push(sdkGateReceipt(name, Date.now() - started));
  publish();
  return result;
}
try {
  await gate("published-installation", () => install(ctx));
  const candidate = await gate("candidate-package", () => installSdkCandidate(ctx));
  receipt.tarballSha256 = candidate.tarballSha256;
  operator = await gate("oidc-onboarding", () => operatorSession(ctx));
  const template = await gate("template-import", () => importAcceptanceTemplate(ctx, operator.client));
  const { exerciseSdk } = await import(candidate.fixture);
  await exerciseSdk({ apiUrl: origins.api, apiKey: ctx.read("client-key.json").token, template, runId: ctx.identity.id }, gate,
    available => replicas(ctx, ["opensandbox-server"], available ? 1 : 0));
  await gate("key-revocation", async () => {
    await operator.request(`/v1/api-keys/${ctx.read("client-key.json").id}`, "DELETE");
    const response = await fetch(`${origins.api}/v1/templates`, { headers: { "x-api-key": ctx.read("client-key.json").token }, signal: AbortSignal.timeout(10000) });
    check(response.status === 401, "SDK acceptance key was not revoked");
  });
  receipt.status = "configured_gates_passed";
} catch (error) {
  ctx.save("sdk-failure.json", { gate: activeGate, message: error.message, stack: error.stack, body: error.body });
  receipt.results.push({ gate: activeGate, status: "failed", failure: publicFailure(error) });
  receipt.infrastructure = diagnostics(ctx);
  receipt.status = "failed";
  process.exitCode = 1;
  console.error(`SDK acceptance failed: ${activeGate}`);
} finally {
  await finishReceipt(receipt, {
    browser: async () => { if (operator) await operator.browser.close(); },
    portForwards: () => ctx.stopForwards()
  });
  if (receipt.status === "failed") process.exitCode = 1;
  publish();
}
