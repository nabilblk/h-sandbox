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
  const browserFailures = [
    ["net::ERR_CONNECTION_REFUSED", "connection_refused"],
    ["net::ERR_CONNECTION_RESET", "connection_reset"],
    ["net::ERR_ABORTED", "navigation_aborted"],
    ["Executable doesn't exist", "browser_executable_missing"],
    ["strict mode violation", "ambiguous_locator"],
    ["Target page, context or browser has been closed", "browser_closed"]
  ];
  for (const [signature, reason] of browserFailures) {
    if (typeof error.message === "string" && error.message.includes(signature)) return { kind: "browser", reason };
  }
  if (["TypeError", "TimeoutError", "SyntaxError", "ReferenceError"].includes(error.name)) return { kind: "exception", type: error.name };
  return { kind: "withheld", check: "Detailed exception withheld because it may contain credentials or browser state." };
}
