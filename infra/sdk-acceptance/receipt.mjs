// Gate names are the public evidence. Never export fixture return values, URLs or errors.
export const sdkGates = Object.freeze([
  "published-installation", "candidate-package", "oidc-onboarding", "template-import",
  "creation-and-finite-tasks", "atomic-capacity-error", "text-and-binary-files",
  "process-reconnect-and-cancellation", "protected-http-and-local-git",
  "retained-workspace-and-confirmed-release", "partial-source-and-unconfirmed-cleanup",
  "key-revocation"
]);

export function sdkGateReceipt(name, durationMs) {
  if (!sdkGates.includes(name)) throw new Error("Unknown SDK acceptance gate");
  if (!Number.isFinite(durationMs) || durationMs < 0) throw new Error("Invalid gate duration");
  return { gate: name, status: "passed", durationMs };
}
