import { compatibility } from "./stack.mjs";
import { model } from "../sdk-acceptance/framework.mjs";

export const gates = new Set([
  "published-installation", "source-candidate", "candidate-images", "private-registry", "oidc-onboarding",
  "native-template", "applications", "native-admin-setup", "native-cold-start", "native-model-artifacts",
  "native-shell", "native-previews", "native-transfers-isolation", "adapter-restart",
  "grant-revocation-recovery", "runtime-replacement", "two-users-quota",
  "native-live-files", "native-transfer-failures", "native-svg-mobile"
]);
const flags = new Set([
  "singleSubmission", "realModel", "nativeTools", "generatedFilesVisible", "shellInput", "ansiOutput",
  "remoteResize", "interrupt", "reconnect", "jsonPreview", "imagePreview", "pdfPreview", "htmlPreview",
  "relativeAssets", "binaryRoundTrip", "hostileParentBlocked", "hostileStorageBlocked", "sameRuntime",
  "durableMapping", "nativeQuotaDenial", "twoUsers", "identityTamperingDenied", "noDuplicateRuntime",
  "confirmedRelease", "retainedWorkspace", "replacement", "discoveryNoAllocation", "ready",
  "revokedSocketClosed", "revokedHttpDenied", "operatorGrantRecovered", "textRoundTrip", "nativeEdit",
  "freshPreview", "oversizeRejected", "interruptedUpload", "noUploadReplay", "svgScriptBlocked", "mobilePreview"
]);
const cleanups = new Set(["browser", "runtimes", "workspaces", "key", "docker", "portForwards"]);

export function publicReceipt(receipt) {
  const result = { kind: "openwebui-native", published: false, architecture: "amd64", openwebui: compatibility.openwebui, openTerminal: compatibility.openTerminal, model,
    status: ["running", "failed", "configured_gates_passed"].includes(receipt.status) ? receipt.status : "failed",
    results: (receipt.results ?? []).filter(item => gates.has(item.gate)).map(item => ({ gate: item.gate, status: item.status === "passed" ? "passed" : "failed",
      evidence: Object.fromEntries(Object.entries(item.evidence ?? {}).filter(([key, value]) =>
        (flags.has(key) && typeof value === "boolean") || (["downloadSha256", "fileSha256"].includes(key) && typeof value === "string" && /^[a-f0-9]{64}$/.test(value))
        || (key === "bytes" && Number.isSafeInteger(value) && value >= 0))),
      ...(item.failure ? { failure: { kind: ["http", "browser", "exception", "acceptance_check"].includes(item.failure.kind) ? item.failure.kind : "withheld" } } : {}) })) };
  if (typeof receipt.source === "string" && /^[a-f0-9]{40}$/.test(receipt.source)) result.source = receipt.source;
  if (typeof receipt.runId === "string" && /^\d+-\d+$/.test(receipt.runId)) result.runId = receipt.runId;
  if (receipt.images) {
    result.images = {};
    for (const name of ["api", "apiWithRegistryCa", "web", "adapter", "terminal"]) {
      const digest = receipt.images[name]?.imageConfigDigest;
      if (typeof digest === "string" && /^sha256:[a-f0-9]{64}$/.test(digest)) result.images[name] = { imageConfigDigest: digest };
    }
  }
  if (receipt.runnerProcesses) result.runnerProcesses = { status: receipt.runnerProcesses.status === "passed" ? "passed" : "failed",
    checks: receipt.runnerProcesses.checks.filter(item => cleanups.has(item.name)).map(item => ({ name: item.name, status: item.status === "passed" ? "passed" : "failed" })) };
  return result;
}
