import fs from "node:fs";
import { context, origins, pinned, check } from "./context.mjs";
import { install } from "./install.mjs";
import { operatorSession } from "./browser.mjs";
import { workload } from "./workload.mjs";
import { recovery } from "./recovery.mjs";
import { interruption } from "./interruption.mjs";
import { configurationUpgrade } from "./configuration-upgrade.mjs";
import { finishReceipt, publicEvidence, publicFailure } from "./receipt.mjs";
import { diagnostics } from "./diagnostics.mjs";
import { installUsageCandidate } from "./usage-candidate.mjs";
import { freezeUsage, verifyRestoredUsage, usageBinaryRehearsal } from "./usage-history.mjs";
import { installPublishedUsage } from "./usage-published.mjs";
import { verifyUsageMonitoring } from "./usage-monitoring.mjs";

process.umask(0o077);
const ctx = context();
ctx.guard();
const receipt = {
  version: pinned.version, applicationSource: pinned.source, harnessSource: process.env.GITHUB_SHA,
  runId: ctx.identity.id, architecture: "amd64", clusterUid: ctx.read("cluster.json").uid,
  startedAt: new Date().toISOString(), results: [],
  releaseCompatibility: { status: "not_tested", reason: "A distinct capacity-compatible published release pair has not been selected. Configuration rollback does not establish schema/image rollback safety." }
};
const publish = () => fs.writeFileSync("standalone-acceptance-report.json", `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
let activeGate = "installation";
let operator;
async function gate(name, action) {
  activeGate = name;
  const start = Date.now();
  const disk = fs.statfsSync(ctx.identity.directory);
  const freeMiB = Math.floor(disk.bavail * disk.bsize / 1024 ** 2);
  check(freeMiB >= 2048, "Disposable runner has less than 2 GiB disk headroom; no more workload admitted");
  const result = await action();
  receipt.results.push({ gate: name, status: "passed", durationMs: Date.now() - start, initialFreeMiB: freeMiB, evidence: publicEvidence(result) });
  publish();
  console.log(`Acceptance gate passed: ${name}`);
  return result;
}
try {
  await gate("installation", () => install(ctx));
  if (process.env.HARAKIRI_USAGE_ACCEPTANCE === "1") {
    await gate("source-usage-candidate", () => installUsageCandidate(ctx));
    receipt.sourceCandidate = ctx.read("usage-candidate.json");
  }
  if (process.env.HARAKIRI_USAGE_RELEASE) {
    await gate("published-usage-candidate", () => installPublishedUsage(ctx));
    receipt.publishedCandidate = ctx.read("usage-published.json");
  }
  if (ctx.candidateUsage) await gate("private-live-metrics", () => verifyUsageMonitoring(ctx));
  operator = await gate("oidc-onboarding", () => operatorSession(ctx));
  const state = await gate(ctx.candidateUsage && !ctx.publishedUsage ? "source-client-workflow" : "published-client-workflow", () => workload(ctx, operator));
  if (ctx.candidateUsage) await gate("real-usage-observations", () => freezeUsage(ctx, operator));
  await gate("coordinated-encrypted-recovery", () => recovery(ctx, operator, state));
  if (ctx.candidateUsage) await gate("usage-database-recovery", () => verifyRestoredUsage(ctx, operator));
  await gate("provider-interruption-and-state-loss", () => interruption(ctx, operator));
  if (ctx.candidateUsage) {
    await gate(ctx.publishedUsage ? "published-binary-compatibility" : "source-binary-schema-rehearsal", () => usageBinaryRehearsal(ctx, operator));
    if (ctx.publishedUsage) receipt.releaseCompatibility = { status: "passed", baseline: pinned.version, candidate: receipt.publishedCandidate.version, schema: 39, scope: "Owned single-node amd64 profile; additive schema retained during binary rollback and re-upgrade." };
  }
  else await gate("configuration-upgrade-and-rollback", () => configurationUpgrade(ctx, operator));
  await gate("logout-and-key-revocation", async () => {
    await operator.request(`/v1/api-keys/${ctx.read("client-key.json").id}`, "DELETE");
    const response = await fetch(`${origins.api}/v1/templates`, { headers: { "x-api-key": ctx.read("client-key.json").token }, signal: AbortSignal.timeout(10000) });
    check(response.status === 401, "Revoked API key is still usable");
    await operator.logout();
    return { logout: true, keyRevoked: true };
  });
  receipt.status = "configured_gates_passed";
} catch (error) {
  ctx.save("failure.json", { gate: activeGate, message: error.message, stack: error.stack, body: error.body });
  receipt.results.push({ gate: activeGate, status: "failed", failure: publicFailure(error) });
  receipt.infrastructure = diagnostics(ctx);
  if (ctx.startupObservations) receipt.infrastructure.startup = ctx.startupObservations;
  receipt.status = "failed";
  process.exitCode = 1;
  publish();
  console.error(`Acceptance gate failed: ${activeGate}`);
} finally {
  await finishReceipt(receipt, {
    browser: async () => { if (operator) await operator.browser.close(); },
    portForwards: () => ctx.stopForwards()
  });
  if (receipt.status === "failed") process.exitCode = 1;
  publish();
}
