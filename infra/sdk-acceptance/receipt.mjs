// Gate names are the public evidence. Never export fixture return values, URLs or errors.
export const sdkGates = Object.freeze([
  "published-installation", "candidate-package", "oidc-onboarding", "template-import",
  "creation-and-finite-tasks", "atomic-capacity-error", "text-and-binary-files",
  "process-reconnect-and-cancellation", "protected-http-and-local-git",
  "retained-workspace-and-confirmed-release", "partial-source-recovery", "unconfirmed-cleanup-and-expiry",
  "key-revocation"
]);

export function sdkGateReceipt(name, durationMs) {
  if (!sdkGates.includes(name)) throw new Error("Unknown SDK acceptance gate");
  if (!Number.isFinite(durationMs) || durationMs < 0) throw new Error("Invalid gate duration");
  return { gate: name, status: "passed", durationMs };
}

function coordinates(error) {
  const location = /\/sdk-workflows\.mjs:(\d+):(\d+)/.exec(error?.stack ?? "");
  return location ? { fixtureLine: Number(location[1]), fixtureColumn: Number(location[2]) } : {};
}

export function fixtureFailureLocation(error) {
  const cause = coordinates(error?.cause);
  return { ...coordinates(error), ...(Object.keys(cause).length ? { cause } : {}) };
}
