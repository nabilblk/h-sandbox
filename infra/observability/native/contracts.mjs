export const nativeGates = Object.freeze([
  "published-installation", "source-candidate", "oidc-policy", "template-import",
  "native-command-retry", "native-browser-investigation", "collector-outage-execution",
  "sandbox-otlp-producer", "local-model-start", "real-agent-host-tools", "real-agent-in-sandbox",
  "retained-after-termination", "storage-restart", "coordinated-cold-recovery", "key-revocation"
]);

export function gateReceipt(name, elapsedMs) {
  if (!nativeGates.includes(name) || !Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new Error("Invalid observability acceptance gate");
  }
  return { name, elapsedMs: Math.round(elapsedMs), status: "passed" };
}

export function configuredComplete(results) {
  return results.length === nativeGates.length
    && nativeGates.every((name) => results.filter((item) => item.name === name && item.status === "passed").length === 1);
}

/** Keep source locations and known network codes, never exception messages or URLs. */
export function diagnosticLocation(error) {
  const frames = typeof error?.stack === "string" ? error.stack.split("\n").slice(1) : [];
  const sources = frames.flatMap(frame => {
    const match = frame.match(/\/infra\/observability\/native\/(agents|model|run|workflows)\.mjs:(\d+):(\d+)\)?$/);
    return match ? [`${match[1]}.mjs:${match[2]}:${match[3]}`] : [];
  }).slice(0, 4);
  const codes = new Set(["ECONNREFUSED", "ECONNRESET", "EPIPE", "ETIMEDOUT", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT"]);
  const code = error?.cause?.code;
  return { ...(sources.length ? { sources } : {}), ...(codes.has(code) ? { transportCode: code } : {}) };
}

export function workloadDiagnostics(pods) {
  const reasons = new Set(["OOMKilled", "Error", "Completed", "ContainerCannotRun", "CrashLoopBackOff", "ImagePullBackOff", "ErrImagePull"]);
  const state = value => value ? { ...(reasons.has(value.reason) ? { reason: value.reason } : {}),
    ...(Number.isInteger(value.exitCode) ? { exitCode: value.exitCode } : {}) } : undefined;
  return (Array.isArray(pods?.items) ? pods.items : []).slice(0, 32).map(pod => ({
    phase: ["Pending", "Running", "Succeeded", "Failed", "Unknown"].includes(pod.status?.phase) ? pod.status.phase : "Unknown",
    containers: (pod.status?.containerStatuses ?? []).slice(0, 8).map(container => ({
      name: ["api", "web", "model", "keycloak", "postgresql", "collector", "logs", "traces"].includes(container.name) ? container.name : "other",
      ready: container.ready === true,
      restarts: Number.isSafeInteger(container.restartCount) ? container.restartCount : 0,
      lastTermination: state(container.lastState?.terminated),
      current: state(container.state?.terminated ?? container.state?.waiting)
    }))
  }));
}
