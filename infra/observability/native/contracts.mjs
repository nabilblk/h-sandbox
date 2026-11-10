export const nativeGates = Object.freeze([
  "published-installation", "source-candidate", "oidc-policy", "template-import",
  "native-command-retry", "native-browser-investigation", "collector-outage-execution",
  "sandbox-otlp-producer", "retained-after-termination", "storage-restart", "coordinated-cold-recovery", "key-revocation"
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
