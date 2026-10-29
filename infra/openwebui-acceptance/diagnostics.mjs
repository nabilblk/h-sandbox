import { ownedDocker } from "./stack.mjs";

const failures = new Set(["context_busy", "sandbox_service_unavailable", "workspace_creation_unconfirmed", "workspace_release_unconfirmed",
  "sandbox_recovery_required", "session_expired", "route_creation_unconfirmed", "service_grant_unavailable", "binding_decryption_failed",
  "organization_capacity_exceeded", "personal_context_only", "invalid_context", "unsupported_service_path"]);
const reasons = new Set(["CrashLoopBackOff", "ErrImagePull", "ImagePullBackOff", "CreateContainerConfigError", "CreateContainerError",
  "ContainerCreating", "PodInitializing", "OOMKilled", "Error", "Completed"]);
const signatures = ["Permission denied", "Operation not permitted", "Read-only file system", "Address already in use",
  "ModuleNotFoundError", "No such command", "No such file or directory", "Traceback"];

export function adapterFailures(logs) {
  return logs.split("\n").flatMap(line => {
    try {
      const entry = JSON.parse(line);
      return failures.has(entry.failure) ? [{ code: entry.failure,
        ...(Number.isInteger(entry.upstreamStatus) && entry.upstreamStatus >= 400 && entry.upstreamStatus <= 599 ? { status: entry.upstreamStatus } : {}) }] : [];
    } catch { return []; }
  });
}

export function runtimeState(pod, logs) {
  const containers = [...pod.status?.initContainerStatuses ?? [], ...pod.status?.containerStatuses ?? []];
  return {
    phase: ["Pending", "Running", "Succeeded", "Failed", "Unknown"].includes(pod.status?.phase) ? pod.status.phase : "Unknown",
    containers: containers.map(container => {
      const state = container.state?.waiting ?? container.state?.terminated ?? {};
      return { ready: container.ready === true,
        ...(reasons.has(state.reason) ? { reason: state.reason } : {}),
        ...(Number.isInteger(state.exitCode) && state.exitCode >= 0 && state.exitCode <= 255 ? { exitCode: state.exitCode } : {}) };
    }),
    errors: signatures.filter(signature => logs.includes(signature))
  };
}

export async function diagnose(ctx, client, template) {
  try {
    console.log(`OpenWebUI adapter failure categories: ${JSON.stringify(adapterFailures(ownedDocker(ctx, "adapter", ["logs", "--tail", "100"])))}`);
  } catch { console.log("OpenWebUI adapter diagnostics unavailable"); }
  try {
    const inventory = (await client.listSandboxes()).sandboxes.filter(item => item.template === template);
    console.log(`OpenWebUI runtime status counts: ${JSON.stringify(Object.fromEntries(
      ["pending", "running", "idle", "paused", "resuming", "error", "terminated"].map(status => [status, inventory.filter(item => item.status === status).length])))}`);
    const running = inventory.filter(item => item.status === "running");
    if (running.length === 1) {
      const { files } = await client.files.list(running[0].id, "/workspace/demo", { requestTimeoutMs: 10000 });
      const names = new Set(files.map(file => file.name));
      console.log(`OpenWebUI expected artifact presence: ${JSON.stringify(Object.fromEntries(
        ["sales.csv", "report.json", "chart.png", "report.pdf", "index.html"].map(name => [name, names.has(name)])))}`);
    }
  } catch { console.log("OpenWebUI runtime inventory unavailable"); }
  try {
    // Read-only infrastructure diagnostics in the ownership-guarded test cluster,
    // never an alternate execution/transport path for the application.
    const pods = JSON.parse(ctx.k(["get", "pods", "-n", "harakiri-preview-runtime", "-o", "json"])).items;
    for (const pod of pods.slice(0, 10)) {
      let logs = "";
      try { logs = ctx.k(["logs", "-n", "harakiri-preview-runtime", pod.metadata.name, "--all-containers", "--tail=100"]); }
      catch { /* Waiting containers may not have logs yet. */ }
      console.log(`OpenWebUI runtime health categories: ${JSON.stringify(runtimeState(pod, logs))}`);
    }
  } catch { console.log("OpenWebUI owned runtime diagnostics unavailable"); }
}
