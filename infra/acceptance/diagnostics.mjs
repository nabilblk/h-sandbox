import { platformNamespace, runtimeNamespace } from "./operator.mjs";

const reasons = new Set(["ImagePullBackOff", "ErrImagePull", "CrashLoopBackOff", "CreateContainerConfigError", "CreateContainerError", "ContainerCreating", "PodInitializing", "OOMKilled", "Error", "Completed", "InvalidImageName"]);
const phases = new Set(["Pending", "Running", "Succeeded", "Failed", "Unknown"]);

export function podEvidence(pod) {
  return {
    name: pod.metadata.name,
    phase: phases.has(pod.status.phase) ? pod.status.phase : "Unknown",
    ready: pod.status.conditions?.some(condition => condition.type === "Ready" && condition.status === "True") ?? false,
    containers: [...(pod.status.initContainerStatuses ?? []), ...(pod.status.containerStatuses ?? [])].map(container => ({
      name: container.name,
      ready: container.ready === true,
      restarts: Number.isSafeInteger(container.restartCount) ? container.restartCount : null,
      reason: [container.state?.waiting?.reason, container.state?.terminated?.reason, container.lastState?.terminated?.reason].find(reason => reasons.has(reason)) ?? null
    }))
  };
}

export function diagnostics(ctx) {
  const result = {};
  for (const namespace of [platformNamespace, runtimeNamespace]) {
    try {
      const pods = JSON.parse(ctx.k(["-n", namespace, "get", "pods", "-o", "json", "--request-timeout=10s"], { timeout: 15000 }));
      result[namespace] = pods.items.map(podEvidence);
    } catch { result[namespace] = "unavailable"; }
  }
  return result;
}
