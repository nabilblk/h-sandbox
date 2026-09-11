import { podEvidence, logEvidence } from "./diagnostics.mjs";
import { runtimeNamespace } from "./operator.mjs";
import { AcceptanceCheckError } from "./context.mjs";

export function runtimeStateEvidence(workload) {
  const status = workload.status ?? {};
  const phases = ["Pending", "Succeed", "Running", "Failed", "Pausing", "Paused", "Resuming"];
  const count = value => Number.isSafeInteger(value) ? value : null;
  return { phase: phases.includes(status.phase) ? status.phase : "unknown", ready: count(status.ready), allocated: count(status.allocated), replicas: count(status.replicas) };
}

export async function observeStartup(ctx, action, intervalMs = 10000) {
  const observations = [];
  ctx.startupObservations = observations;
  const started = Date.now();
  const abort = new AbortController();
  let previous;
  const capture = () => {
    if (observations.length >= 80) return;
    try {
      const args = ["-n", runtimeNamespace];
      const pods = JSON.parse(ctx.k([...args, "get", "pods", "-o", "json", "--request-timeout=5s"], { timeout: 10000 })).items;
      const workloads = JSON.parse(ctx.k([...args, "get", "batchsandboxes", "-o", "json", "--request-timeout=5s"], { timeout: 10000 })).items;
      const state = { pods: pods.map(podEvidence), workloads: workloads.map(runtimeStateEvidence), errors: [] };
      for (const pod of pods) {
        if (pod.status.phase !== "Running") continue;
        try {
          const logs = ctx.k([...args, "logs", pod.metadata.name, "--all-containers=true", "--tail=30", "--request-timeout=5s"], { timeout: 10000 });
          state.errors.push(logEvidence(logs));
        } catch { /* A container may disappear between its status and logs. */ }
      }
      const fingerprint = JSON.stringify(state);
      if (fingerprint !== previous) {
        observations.push({ elapsedSeconds: Math.floor((Date.now() - started) / 1000), ...state });
        previous = fingerprint;
      }
      const failed = pods.flatMap(pod => pod.status.containerStatuses ?? [])
        .find(container => container.name === "sandbox" && container.state?.terminated?.exitCode > 0);
      if (failed) abort.abort(new AcceptanceCheckError(`Native sandbox bootstrap exited before readiness: ${failed.state.terminated.exitCode}`));
    } catch { /* Diagnostics must not replace the published client's outcome. */ }
  };
  // Capture before provider rollback removes the failed pod; never export raw logs.
  const timer = setInterval(capture, intervalMs);
  try { return await action(abort.signal); }
  finally { clearInterval(timer); }
}
