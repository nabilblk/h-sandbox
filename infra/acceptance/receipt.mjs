import { AcceptanceCheckError } from "./context.mjs";

const flags = new Set([
  "anonymousArtifacts", "freshInstallation", "oidcOnboarding", "pkceS256", "modelFreeOpenCode", "publishedCli", "publishedSdk", "protectedRoute", "capacityDenial", "idempotency", "reattachment",
  "databaseRestore", "workspaceRestore", "oidcIdentity", "retainedApiKey", "encryptedVaultUse", "credentialBoundary", "providerInterruption", "controlPlaneRestart", "retainedOwnership",
  "noDuplicateExecution", "explicitVaultRehydration", "confirmedRelease", "configurationUpgrade", "configurationRollback", "preservedKeys", "preservedWorkspace", "logout", "keyRevoked"
]);

export function publicEvidence(details) {
  const result = {};
  for (const [key, value] of Object.entries(details ?? {})) {
    if (flags.has(key) && typeof value === "boolean") result[key] = value;
    if (["envelopeSha256", "fileSha256"].includes(key) && typeof value === "string" && /^[a-f0-9]{64}$/.test(value)) result[key] = value;
    if (key === "negativeCases" && Array.isArray(value)) result[key] = value.filter(item => ["missing", "incorrect"].includes(item));
  }
  return result;
}

export function publicFailure(error) {
  if (error instanceof AcceptanceCheckError) return { kind: "acceptance_check", check: error.message };
  if (Number.isInteger(error.status) && error.status >= 400 && error.status <= 599) return { kind: "http", status: error.status };
  return { kind: "withheld", check: "Detailed exception withheld because it may contain credentials or browser state." };
}
