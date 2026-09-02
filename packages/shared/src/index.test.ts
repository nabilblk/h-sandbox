import assert from "node:assert/strict";
import test from "node:test";
import {
  TEMPLATES,
  apiPath,
  canTransitionSandboxStatus,
  formatApiErrorResponse,
  isKnownSandboxRuntimeApiErrorCode,
  openApiDocument,
  openApiPathMethodPairs,
  parseApiErrorResponse,
  providerUnavailableApiErrorCodes,
  runtimeCapabilityContracts,
  runtimeCapabilityNames,
  runtimePolicyApiErrorCodes,
  sandboxConflictApiErrorCodes,
  sandboxRuntimeApiErrorCodes,
  timeoutApiErrorCodes,
  unsupportedCapabilityApiErrorCodes
} from "./index.js";

test("templates include the required Python data template", () => {
  assert.ok(TEMPLATES.some((template) => template.id === "python-3.12-data"));
});

test("apiPath normalizes v1 paths", () => {
  assert.equal(apiPath("sandboxes"), "/v1/sandboxes");
  assert.equal(apiPath("/templates"), "/v1/templates");
});

test("sandbox status transitions preserve terminal state", () => {
  assert.equal(canTransitionSandboxStatus("pending", "running"), true);
  assert.equal(canTransitionSandboxStatus("running", "terminated"), true);
  assert.equal(canTransitionSandboxStatus("terminated", "running"), false);
});

test("API error helpers parse and format shared envelopes", () => {
  const parsed = parseApiErrorResponse(JSON.stringify({ error: "template_not_found", message: "Missing template" }));
  assert.equal(parsed?.error, "template_not_found");
  assert.equal(formatApiErrorResponse(404, JSON.stringify(parsed)), "Harakiri API 404: template_not_found: Missing template");
  assert.equal(parseApiErrorResponse("not json"), null);
  assert.equal(formatApiErrorResponse(500, ""), "Harakiri API 500: request failed");
});

test("sandbox runtime error vocabulary is stable and categorized", () => {
  assert.equal(new Set(sandboxRuntimeApiErrorCodes).size, sandboxRuntimeApiErrorCodes.length);
  assert.equal(isKnownSandboxRuntimeApiErrorCode("sandbox_not_found"), true);
  assert.equal(isKnownSandboxRuntimeApiErrorCode("not_a_runtime_code"), false);
  for (const group of [
    unsupportedCapabilityApiErrorCodes,
    providerUnavailableApiErrorCodes,
    timeoutApiErrorCodes,
    sandboxConflictApiErrorCodes,
    runtimePolicyApiErrorCodes
  ]) {
    for (const code of group) assert.ok(sandboxRuntimeApiErrorCodes.includes(code));
  }
  assert.ok(unsupportedCapabilityApiErrorCodes.includes("runtime_command_unsupported"));
  assert.ok(unsupportedCapabilityApiErrorCodes.includes("runtime_terminal_unsupported"));
  assert.ok(providerUnavailableApiErrorCodes.includes("egress_provider_unavailable"));
  assert.ok(providerUnavailableApiErrorCodes.includes("runtime_terminal_unavailable"));
  assert.ok(providerUnavailableApiErrorCodes.includes("runtime_command_unavailable"));
  assert.ok(timeoutApiErrorCodes.includes("sandbox_command_timeout"));
});

test("runtime capability vocabulary separates command and interactive terminal support", () => {
  assert.ok(runtimeCapabilityNames.includes("commandRun"));
  assert.ok(runtimeCapabilityNames.includes("terminalAttach"));
  assert.ok(runtimeCapabilityNames.includes("terminalResize"));
  assert.ok(runtimeCapabilityNames.includes("shellSessions"));
  assert.ok(runtimeCapabilityNames.includes("sessionCommands"));
  assert.ok(runtimeCapabilityNames.includes("lifecyclePause"));
  assert.ok(runtimeCapabilityNames.includes("lifecycleResume"));
  assert.ok(runtimeCapabilityNames.includes("lifecycleSnapshot"));
  assert.ok(runtimeCapabilityNames.includes("snapshotList"));
  assert.ok(runtimeCapabilityNames.includes("snapshotDelete"));
  assert.ok(runtimeCapabilityNames.includes("createFromSnapshot"));
  assert.ok(runtimeCapabilityNames.includes("git"));
  assert.ok(runtimeCapabilityContracts.includes("opensandbox_spec"));
  assert.ok(runtimeCapabilityContracts.includes("opensandbox_provider"));
  assert.ok(runtimeCapabilityContracts.includes("harakiri_control_plane"));
  assert.ok(runtimeCapabilityContracts.includes("unavailable"));
  assert.ok(runtimeCapabilityContracts.includes("unsupported"));
});

test("OpenAPI contract publishes the current HTTP surface", () => {
  assert.equal(openApiDocument.openapi, "3.1.0");
  assert.deepEqual([...openApiPathMethodPairs].sort(), [
    "DELETE /v1/api-keys/{id}",
    "DELETE /v1/org/members/{id}",
    "DELETE /v1/registry-credentials/{id}",
    "DELETE /v1/sandboxes/{id}",
    "DELETE /v1/sandboxes/{id}/command-sessions/{sessionId}",
    "DELETE /v1/sandboxes/{id}/commands/{commandId}",
    "DELETE /v1/sandboxes/{id}/files",
    "DELETE /v1/sandboxes/{id}/routes/{port}",
    "DELETE /v1/snapshots/{snapshotId}",
    "GET /health",
    "GET /openapi.json",
    "GET /v1/api-keys",
    "GET /v1/bootstrap",
    "GET /v1/me",
    "GET /v1/org/members",
    "GET /v1/org/settings",
    "GET /v1/registry-credentials",
    "GET /v1/runtime/capabilities",
    "GET /v1/sandboxes",
    "GET /v1/sandboxes/{id}",
    "GET /v1/sandboxes/{id}/commands",
    "GET /v1/sandboxes/{id}/commands/{commandId}",
    "GET /v1/sandboxes/{id}/commands/{commandId}/logs",
    "GET /v1/sandboxes/{id}/egress",
    "GET /v1/sandboxes/{id}/files",
    "GET /v1/sandboxes/{id}/files/download",
    "GET /v1/sandboxes/{id}/files/read",
    "GET /v1/sandboxes/{id}/files/stat",
    "GET /v1/sandboxes/{id}/logs",
    "GET /v1/sandboxes/{id}/metrics",
    "GET /v1/sandboxes/{id}/routes",
    "GET /v1/snapshots",
    "GET /v1/snapshots/{snapshotId}",
    "GET /v1/template-builds",
    "GET /v1/template-builds/{id}",
    "GET /v1/template-builds/{id}/logs",
    "GET /v1/templates",
    "GET /v1/templates/{id}",
    "GET /v1/templates/{id}/versions",
    "GET /v1/usage",
    "PATCH /v1/org/settings",
    "PATCH /v1/sandboxes/{id}/egress",
    "PATCH /v1/sandboxes/{id}/source",
    "PATCH /v1/templates/{id}/egress",
    "POST /v1/api-keys",
    "POST /v1/me/onboarding/complete",
    "POST /v1/org/invitations",
    "POST /v1/org/invitations/{id}/cancel",
    "POST /v1/org/invitations/{id}/resend",
    "POST /v1/org/members",
    "POST /v1/registry-credentials",
    "POST /v1/sandboxes",
    "POST /v1/sandboxes/{id}/command-sessions",
    "POST /v1/sandboxes/{id}/command-sessions/{sessionId}/run",
    "POST /v1/sandboxes/{id}/commands",
    "POST /v1/sandboxes/{id}/egress/test",
    "POST /v1/sandboxes/{id}/files/mkdir",
    "POST /v1/sandboxes/{id}/files/rename",
    "POST /v1/sandboxes/{id}/files/upload",
    "POST /v1/sandboxes/{id}/pause",
    "POST /v1/sandboxes/{id}/renew",
    "POST /v1/sandboxes/{id}/resume",
    "POST /v1/sandboxes/{id}/routes",
    "POST /v1/sandboxes/{id}/run",
    "POST /v1/sandboxes/{id}/snapshots",
    "POST /v1/sandboxes/{id}/terminal/attach-ticket",
    "POST /v1/template-builds/{id}/cancel",
    "POST /v1/template-builds/{id}/context",
    "POST /v1/template-builds/{id}/retry",
    "POST /v1/templates",
    "POST /v1/templates/{id}/archive",
    "POST /v1/templates/{id}/builds",
    "POST /v1/templates/{id}/promote",
    "PUT /v1/sandboxes/{id}/files"
  ]);
});
