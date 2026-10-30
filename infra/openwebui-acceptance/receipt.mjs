import { compatibility } from "./stack.mjs";
import { model } from "../sdk-acceptance/framework.mjs";

export const gates = new Set([
  "published-installation", "source-candidate", "candidate-images", "private-registry", "oidc-onboarding",
  "native-template", "applications", "native-admin-setup", "native-cold-start", "native-model-artifacts",
  "native-shell", "native-previews", "native-transfers-isolation", "adapter-restart",
  "grant-revocation-recovery", "runtime-replacement", "two-users-quota",
  "native-live-files", "native-transfer-failures", "native-svg-mobile", "native-relative-assets-limit", "native-browser-errors"
]);
const flags = new Set([
  "singleSubmission", "realModel", "nativeTools", "generatedFilesVisible", "shellInput", "ansiOutput",
  "remoteResize", "interrupt", "reconnect", "jsonPreview", "imagePreview", "pdfPreview", "htmlPreview",
  "embeddedAssets", "relativeAssetsRequireSession", "binaryRoundTrip", "hostileParentBlocked", "hostileStorageBlocked", "sameRuntime",
  "durableMapping", "nativeQuotaDenial", "twoUsers", "identityTamperingDenied", "noDuplicateRuntime",
  "confirmedRelease", "passivePollingNoAllocation", "retainedWorkspace", "replacement", "discoveryNoAllocation", "ready",
  "revokedSocketClosed", "revokedHttpDenied", "operatorGrantRecovered", "textRoundTrip", "nativeEdit",
  "freshPreview", "oversizeRejected", "uploadTransportFailure", "failureBeforeDispatch", "noUploadReplay", "svgScriptBlocked", "mobilePreview", "noBrowserScriptErrors"
]);
const cleanups = new Set(["chatBrowser", "browser", "adapter", "runtimes", "workspaces", "key", "docker", "portForwards"]);
const browserReasons = new Set(["connection_refused", "connection_reset", "navigation_aborted", "browser_executable_missing", "ambiguous_locator", "browser_closed"]);
const checks = new Set([
  "Native cold-start file listing failed", "Native file refresh failed", "No native tool event observed from real model",
  "Native model response reported an error", "Real chat submitted with terminal: deadline exceeded",
  "Real model response completed: deadline exceeded", "Native shell output: deadline exceeded",
  "Native shell connected: deadline exceeded", "Native resize frame sent: deadline exceeded",
  "Native terminal ready before revocation: deadline exceeded",
  "Native remote terminal resize: deadline exceeded", "Native shell interrupt: deadline exceeded",
  "Native shell reconnected: deadline exceeded", "Native reconnect output: deadline exceeded",
  "Native foreground command started: deadline exceeded", "Native JSON preview rendered: deadline exceeded",
  "Native PDF preview rendered: deadline exceeded",
  "Native image preview decoded: deadline exceeded", "Embedded chart in HTML preview: deadline exceeded",
  "Downloaded chart is not PNG", "Downloaded report is not PDF", "HTML preview does not show actual total",
  "Embedded chart differs from downloaded PNG", "Preview allows chat origin authority",
  "Relative asset has a finite rejected outcome: deadline exceeded",
  "Opaque preview unexpectedly has session authority for relative assets",
  "Oversize upload finishes visibly: deadline exceeded", "Rejected upload appeared as successful",
  "Interrupted native upload was replayed", "Incomplete upload appeared as successful",
  "Revoked native terminal disconnected: deadline exceeded", "Revoked grant accepted a fresh native request",
  "Operator generation missing", "Operator reset did not recover native file access", "Grant recovery replaced runtime",
  "Admin signup configuration unavailable", "Admin could not enable second user signup", "Admin signup configuration was not restored",
  "Native connection was not persisted", "Named connection grant failed", "Quota denial allocated an extra runtime",
  "Second user native file browser: deadline exceeded", "Second user sees first workspace",
  "Second user cannot read their own workspace", "Forged identity was not rejected by the isolated filesystem",
  "Adapter trusted unsigned identity",
  "Owned workspace released before archival: deadline exceeded",
  "Native polling recreated a terminated runtime",
  "Native browser has uncaught JavaScript errors", "Second native browser has uncaught JavaScript errors"
]);

export function safeFailure(failure) {
  return {
    kind: ["http", "browser", "exception", "acceptance_check"].includes(failure.kind) ? failure.kind : "withheld",
    ...(browserReasons.has(failure.reason) ? { reason: failure.reason } : {}),
    ...(checks.has(failure.check) ? { check: failure.check } : {}),
    ...(["TypeError", "TimeoutError", "SyntaxError", "ReferenceError"].includes(failure.type) ? { type: failure.type } : {}),
    ...(Number.isInteger(failure.status) && failure.status >= 400 && failure.status <= 599 ? { status: failure.status } : {})
  };
}

export function publicReceipt(receipt) {
  const result = { kind: "openwebui-native", published: false, architecture: "amd64", openwebui: compatibility.openwebui, openTerminal: compatibility.openTerminal, model,
    status: ["running", "failed", "configured_gates_passed"].includes(receipt.status) ? receipt.status : "failed",
    results: (receipt.results ?? []).filter(item => gates.has(item.gate)).map(item => ({ gate: item.gate, status: item.status === "passed" ? "passed" : "failed",
      evidence: Object.fromEntries(Object.entries(item.evidence ?? {}).filter(([key, value]) =>
        (flags.has(key) && typeof value === "boolean") || (["downloadSha256", "fileSha256"].includes(key) && typeof value === "string" && /^[a-f0-9]{64}$/.test(value))
        || (key === "bytes" && Number.isSafeInteger(value) && value >= 0))),
      ...(item.failure ? { failure: safeFailure(item.failure) } : {}) })) };
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
    checks: receipt.runnerProcesses.checks.filter(item => cleanups.has(item.name)).map(item => ({ name: item.name, status: item.status === "passed" ? "passed" : "failed",
      ...(item.failure ? { failure: safeFailure(item.failure) } : {}) })) };
  return result;
}
