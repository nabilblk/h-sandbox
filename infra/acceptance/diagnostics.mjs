import { platformNamespace, runtimeNamespace } from "./operator.mjs";

const reasons = new Set(["ImagePullBackOff", "ErrImagePull", "CrashLoopBackOff", "CreateContainerConfigError", "CreateContainerError", "ContainerCreating", "PodInitializing", "OOMKilled", "Error", "Completed", "InvalidImageName"]);
const phases = new Set(["Pending", "Running", "Succeeded", "Failed", "Unknown"]);

export function logEvidence(text) {
  const sqlStates = ["23502", "23503", "23505", "23514", "40001", "40P01", "42501", "42601", "42702", "42703", "42804", "42883", "42P01", "42P08", "42P18", "53300", "57P03"];
  const resources = ["pods", "pods/exec", "pods/status", "nodes", "events", "leases", "configmaps", "secrets", "persistentvolumeclaims", "batchsandboxes", "batchsandboxes/status", "pools", "sandboxsnapshots", "tokenreviews", "subjectaccessreviews"];
  const providerCodes = ["KUBERNETES::INITIALIZATION_ERROR", "KUBERNETES::POD_FAILED", "KUBERNETES::POD_READY_TIMEOUT", "KUBERNETES::API_ERROR", "KUBERNETES::POD_IP_NOT_AVAILABLE", "SANDBOX::UNKNOWN_ERROR", "SANDBOX::INVALID_METADATA_LABEL", "SANDBOX::INVALID_PARAMETER", "SANDBOX::INTERNAL_ERROR", "VOLUME::INVALID_NAME", "VOLUME::INVALID_BACKEND", "VOLUME::INVALID_MOUNT_PATH", "VOLUME::INVALID_PVC_NAME", "VOLUME::UNSUPPORTED_BACKEND", "VOLUME::PVC_NOT_FOUND", "VOLUME::PVC_INSPECT_FAILED"];
  const symptoms = [
    ["ambiguous_parameter_type", /inconsistent types deduced for parameter|could not determine data type of parameter/],
    ["missing_relation", /relation [^\n]+ does not exist/],
    ["missing_column", /column [^\n]+ does not exist/],
    ["permission_denied", /permission denied|Forbidden|forbidden/],
    ["image_pull_failed", /ImagePullBackOff|ErrImagePull|failed to pull|Failed to pull/],
    ["scheduling_failed", /FailedScheduling|Insufficient cpu|Insufficient memory/],
    ["volume_failed", /FailedMount|FailedAttachVolume|ProvisioningFailed/],
    ["readiness_failed", /Readiness probe failed|Startup probe failed|not ready/],
    ["connection_refused", /ECONNREFUSED|Connection refused/],
    ["dns_failure", /ENOTFOUND|Name or service not known/],
    ["timeout", /ETIMEDOUT|timed out|TimeoutError/]
  ];
  const modules = ["scheduler.js", "services/sandbox-operation-worker.js", "services/sandbox-capacity-reconciler.js", "services/sandbox-runtime-effects.js", "services/persistent-workspaces.js", "services/sandbox-provision.js"];
  return {
    sqlStates: sqlStates.filter(code => new RegExp(`\\bcode[\\s\"']*:[\\s\"']*${code}\\b`).test(text)),
    providerHttpStatuses: [...new Set([...text.matchAll(/\bOpenSandbox ([45][0-9]{2}):/g)].map(match => Number(match[1])))],
    providerCodes: providerCodes.filter(code => text.includes(code)),
    providerLastStates: ["Pending", "Allocated", "Running", "Failed"].filter(state => text.includes(`Last state: ${state}`)),
    deniedResources: resources.filter(resource => new RegExp(`cannot (?:get|list|watch|create|update|patch|delete) resource .{0,4}${resource}.{0,4} in API group`).test(text)),
    symptoms: symptoms.filter(([, pattern]) => pattern.test(text)).map(([name]) => name),
    modules: modules.filter(name => text.includes(`/${name}:`))
  };
}

export function eventEvidence(event) {
  const knownReasons = new Set(["Failed", "FailedCreate", "FailedScheduling", "FailedMount", "FailedAttachVolume", "FailedBinding", "ProvisioningFailed", "BackOff", "Unhealthy", "Killing", "Pulling", "Pulled", "Started", "Created"]);
  return {
    reason: knownReasons.has(event.reason) ? event.reason : "unknown",
    count: Number.isSafeInteger(event.count) ? event.count : null,
    details: logEvidence(typeof event.message === "string" ? event.message : "")
  };
}

export function databaseEvidence(state) {
  const known = (value, allowed) => allowed.includes(value) ? value : "unknown";
  return {
    sandboxes: (state.sandboxes ?? []).map(row => ({ status: known(row.status, ["pending", "running", "idle", "paused", "resuming", "error", "terminated"]), hasRuntimeId: row.hasRuntimeId === true })),
    operations: (state.operations ?? []).map(row => ({ kind: known(row.kind, ["provision", "delete", "renew", "route_expose"]), state: known(row.state, ["queued", "running", "succeeded", "failed"]), attempts: Number.isSafeInteger(row.attempts) ? row.attempts : null, error: logEvidence(typeof row.error === "string" ? row.error : "") })),
    effects: (state.effects ?? []).map(row => ({ kind: known(row.kind, ["prepare", "provision", "pause", "resume", "delete", "renew"]), dispatched: row.dispatched === true, settled: row.settled === true })),
    reservations: (state.reservations ?? []).map(row => ({ phase: known(row.phase, ["reserved", "active", "releasing", "uncertain", "released"]), released: row.released === true })),
    workspaces: (state.workspaces ?? []).map(row => ({ attached: row.attached === true, attempted: row.attempted === true }))
  };
}

const stateQuery = `SELECT json_build_object(
  'sandboxes', (SELECT json_agg(json_build_object('status',status,'hasRuntimeId',opensandbox_id IS NOT NULL)) FROM sandboxes),
  'operations', (SELECT json_agg(json_build_object('kind',kind,'state',state,'attempts',attempts,'error',error)) FROM sandbox_operations),
  'effects', (SELECT json_agg(json_build_object('kind',kind,'dispatched',dispatched_at IS NOT NULL,'settled',settled_at IS NOT NULL)) FROM sandbox_runtime_effects),
  'reservations', (SELECT json_agg(json_build_object('phase',phase,'released',released_at IS NOT NULL)) FROM sandbox_capacity_reservations),
  'workspaces', (SELECT json_agg(json_build_object('attached',attached_sandbox_id IS NOT NULL,'attempted',attachment_attempted_at IS NOT NULL)) FROM persistent_workspaces)
);`;

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
  let platformPods = [];
  for (const namespace of [platformNamespace, runtimeNamespace]) {
    try {
      const pods = JSON.parse(ctx.k(["-n", namespace, "get", "pods", "-o", "json", "--request-timeout=10s"], { timeout: 15000 }));
      result[namespace] = pods.items.map(podEvidence);
      if (namespace === platformNamespace) platformPods = pods.items;
    } catch { result[namespace] = "unavailable"; }
  }
  result.platformErrors = {};
  for (const name of ["harakiri-api", "harakiri-scheduler", "opensandbox-server", "opensandbox-controller-manager"]) {
    try {
      const text = ctx.k(["-n", platformNamespace, "logs", `deployment/${name}`, "--all-containers=true", "--tail=250", "--request-timeout=10s"], { timeout: 15000, label: "Private platform failure diagnostics" });
      result.platformErrors[name] = logEvidence(text);
    } catch { result.platformErrors[name] = "unavailable"; }
  }
  result.databases = {};
  for (const name of ["preview-postgres", "acceptance-recovered-postgres"]) {
    if (!platformPods.some(pod => pod.metadata.labels?.app === name && pod.status.phase === "Running")) continue;
    try {
      const text = ctx.k(["-n", platformNamespace, "exec", "-i", `deployment/${name}`, "--", "psql", "-X", "-U", "postgres", "-d", "harakiri", "-v", "ON_ERROR_STOP=1", "-At"], { input: stateQuery, timeout: 15000, label: "Private operator state diagnostics" });
      result.databases[name] = databaseEvidence(JSON.parse(text));
    } catch { result.databases[name] = "unavailable"; }
  }
  try {
    const events = JSON.parse(ctx.k(["-n", runtimeNamespace, "get", "events", "-o", "json", "--request-timeout=10s"], { timeout: 15000, label: "Private runtime startup diagnostics" }));
    result.runtimeEvents = events.items.slice(-100).map(eventEvidence);
  } catch { result.runtimeEvents = "unavailable"; }
  return result;
}
