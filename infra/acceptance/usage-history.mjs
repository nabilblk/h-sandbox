import { setTimeout as delay } from "node:timers/promises";
import { check, sha256, until } from "./context.mjs";
import { platformNamespace, replicas } from "./operator.mjs";
import { assertRetained, createRuntime, denyAtCapacity, released } from "./workload.mjs";
import { verifyOldClient } from "./usage-published.mjs";

export const usageFingerprint = history => sha256(JSON.stringify({ window: history.window, summary: history.summary, buckets: history.buckets, gaps: history.coverage.gaps }));

export async function freezeUsage(ctx, operator) {
  const options = { from: ctx.read("first-task.json").from, to: new Date().toISOString(), resolution: "1m" };
  check(typeof operator.client.usageHistory === "function", "Source SDK lacks history support");
  const history = await until("Independent observation cutoff", async () => {
    const result = await operator.client.usageHistory(options);
    return Date.parse(result.coverage.lastObservedAt ?? "") >= Date.parse(options.to) && result;
  }, 60000);
  check(history.summary.acceptedOperations?.create === 3, "Native first task and two workload creates were not counted exactly once");
  check(history.summary.heldSlotSeconds > 0 && history.summary.peakHeldSlots === 1, "Native occupancy is not positive or exceeds the limit");
  check(history.summary.readiness.sampleCount >= 1, "No independent native readiness observation was recorded");
  const fingerprint = usageFingerprint(history);
  ctx.save("usage-history.json", { options, fingerprint });
  return { realUsage: true, uniqueUsageOperations: true, independentReadiness: true };
}

export async function verifyRestoredUsage(ctx, operator) {
  const saved = ctx.read("usage-history.json");
  const actual = await operator.client.usageHistory(saved.options);
  check(usageFingerprint(actual) === saved.fingerprint, "Historical window changed after replacement-database recovery");
  return { usageDatabaseRestore: true };
}

export async function usageBinaryRehearsal(ctx, operator) {
  const { client } = operator;
  const state = ctx.read("recovered-workload.json");
  const id = await createRuntime(client, state, "usage-binary-compatibility");
  if (ctx.publishedUsage) await verifyOldClient(ctx, state, id);
  const gapFrom = new Date().toISOString();
  await replicas(ctx, ["harakiri-scheduler"], 0);
  const baseline = ctx.read("baseline-harakiri-values.json");
  ctx.save("usage-rollback-values.json", baseline);
  const chart = ctx.file(ctx.read("artifact-manifest.json").charts.harakiri.archive);
  ctx.helm(["upgrade", "harakiri", chart, "-n", platformNamespace, "-f", ctx.file("usage-rollback-values.json"), "--wait", "--timeout", "10m"]);
  await ctx.forwardAll();
  check((await client.capacity()).capacity.inUse === 1, "Capacity changed under baseline binaries with additive usage schema");
  await assertRetained(client, id, state); await denyAtCapacity(client, state.templateId);
  const summary = await client.usage();
  check(Array.isArray(summary.series) && summary.series.length === 0, "Legacy usage summary was redefined");
  let absent = false;
  try { await client.usageHistory({ from: gapFrom, to: new Date().toISOString(), resolution: "1m" }); }
  catch (error) { check(error.status === 404, "Older API returned an unexpected history error"); absent = true; }
  check(absent, "Baseline unexpectedly claims the new history capability");
  await delay(35000);
  ctx.helm(["upgrade", "harakiri", ctx.candidateChart ?? "infra/charts/harakiri", "-n", platformNamespace, "-f", ctx.file("harakiri-values.json"), "--wait", "--timeout", "10m"]);
  await ctx.forwardAll();
  await assertRetained(client, id, state); await denyAtCapacity(client, state.templateId);
  check((await client.capacity()).capacity.inUse === 1, "Re-upgrade changed the surviving reservation");
  await verifyRestoredUsage(ctx, operator);
  await until("Usage collector resumes after older binaries", async () => {
    const history = await client.usageHistory({ from: gapFrom, to: new Date().toISOString(), resolution: "1m" });
    return history.coverage.observer === "active" && history.coverage.gaps.some(gap => Date.parse(gap.to) - Date.parse(gap.from) > 30000);
  }, 60000);
  await released(client, id, state.workspaceId);
  return { sourceBinaryRehearsal: !ctx.publishedUsage, publishedBinaryCompatibility: Boolean(ctx.publishedUsage), oldClientNewServer: Boolean(ctx.publishedUsage), usageRollbackGap: true, preservedKeys: true, preservedWorkspace: true };
}
