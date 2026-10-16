import { pinned } from "../acceptance/context.mjs";

export const gates = new Set(["published-installation", "source-candidate", "oidc-onboarding", "native-runtime", "overview", "pty", "files", "logs", "metrics", "commands", "denied-attach"]);
const booleans = new Set(["immutableArtifacts", "pkce", "scopedKey", "ready", "noAttach", "inputOutput", "remoteResize", "disconnected", "reconnected", "paneClosed", "verifiedBytes", "realControlPlaneLogs", "filtered", "followed", "liveMetrics", "missingFieldsUnavailable", "output", "remoteChecksum", "deeplinkReload", "singleSubmission", "actualScopedKey", "noSocket", "noRetry"]);
const numbers = new Set(["sizeBytes", "initialColumns", "resizedColumns", "cpu", "mem"]);
const cleanupNames = new Set(["sandbox", "readOnlyKey", "key", "browser", "portForwards"]);

function evidence(details = {}) {
  const result = {};
  for (const [key, value] of Object.entries(details)) {
    if (booleans.has(key) && typeof value === "boolean") result[key] = value;
    if (numbers.has(key) && Number.isFinite(value) && value >= 0) result[key] = value;
    if (key === "fileSha256" && typeof value === "string" && /^[a-f0-9]{64}$/.test(value)) result[key] = value;
  }
  return result;
}

function failure(value = {}) {
  const kinds = ["acceptance_check", "http", "readiness_timeout", "browser", "exception"];
  return { kind: kinds.includes(value.kind) ? value.kind : "withheld",
    ...(Number.isInteger(value.status) && value.status >= 400 && value.status <= 599 ? { status: value.status } : {}) };
}

// Even shared AcceptanceCheckError labels can contain API paths. Project the
// entire receipt, including cleanup failures; never serialize browser objects.
export function publicReceipt(receipt) {
  const result = { kind: "sandbox-workbench", architecture: "amd64", published: false,
    baseline: { version: pinned.version, source: pinned.source },
    status: ["running", "configured_gates_passed", "failed"].includes(receipt.status) ? receipt.status : "failed",
    results: (receipt.results ?? []).filter(item => gates.has(item.gate)).map(item => ({
      gate: item.gate, status: item.status === "passed" ? "passed" : "failed",
      ...(Number.isSafeInteger(item.elapsedMs) && item.elapsedMs >= 0 ? { elapsedMs: item.elapsedMs } : {}),
      evidence: evidence(item.evidence), ...(item.failure ? { failure: failure(item.failure) } : {})
    })) };
  if (typeof receipt.runId === "string" && /^\d+-\d+$/.test(receipt.runId)) result.runId = receipt.runId;
  if (typeof receipt.source === "string" && /^[a-f0-9]{40}$/.test(receipt.source)) result.source = receipt.source;
  if (receipt.candidate) {
    result.candidate = { published: false, images: {} };
    for (const name of ["api", "web"]) {
      const digest = receipt.candidate.images?.[name]?.imageConfigDigest;
      if (typeof digest === "string" && /^sha256:[a-f0-9]{64}$/.test(digest)) result.candidate.images[name] = { imageConfigDigest: digest };
    }
  }
  for (const field of ["startedAt", "completedAt"]) {
    if (typeof receipt[field] === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(receipt[field])) result[field] = receipt[field];
  }
  if (receipt.runnerProcesses) result.runnerProcesses = {
    status: receipt.runnerProcesses.status === "passed" ? "passed" : "failed",
    checks: receipt.runnerProcesses.checks.filter(item => cleanupNames.has(item.name)).map(item => ({
      name: item.name, status: item.status === "passed" ? "passed" : "failed", ...(item.failure ? { failure: failure(item.failure) } : {})
    }))
  };
  return result;
}
