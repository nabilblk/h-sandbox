import assert from "node:assert/strict";
import test from "node:test";
import {
  TEMPLATES,
  apiPath,
  canTransitionSandboxStatus,
  formatApiErrorResponse,
  openApiDocument,
  openApiPathMethodPairs,
  parseApiErrorResponse
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

test("OpenAPI contract publishes the current HTTP surface", () => {
  assert.equal(openApiDocument.openapi, "3.1.0");
  assert.deepEqual([...openApiPathMethodPairs].sort(), [
    "DELETE /v1/api-keys/{id}",
    "DELETE /v1/org/members/{id}",
    "DELETE /v1/registry-credentials/{id}",
    "DELETE /v1/sandboxes/{id}",
    "DELETE /v1/sandboxes/{id}/routes/{port}",
    "GET /health",
    "GET /openapi.json",
    "GET /v1/api-keys",
    "GET /v1/bootstrap",
    "GET /v1/me",
    "GET /v1/org/members",
    "GET /v1/org/settings",
    "GET /v1/registry-credentials",
    "GET /v1/sandboxes",
    "GET /v1/sandboxes/{id}",
    "GET /v1/sandboxes/{id}/egress",
    "GET /v1/sandboxes/{id}/files",
    "GET /v1/sandboxes/{id}/logs",
    "GET /v1/sandboxes/{id}/metrics",
    "GET /v1/sandboxes/{id}/routes",
    "GET /v1/template-builds",
    "GET /v1/template-builds/{id}",
    "GET /v1/template-builds/{id}/logs",
    "GET /v1/templates",
    "GET /v1/templates/{id}",
    "GET /v1/templates/{id}/versions",
    "GET /v1/usage",
    "PATCH /v1/org/settings",
    "PATCH /v1/sandboxes/{id}/egress",
    "PATCH /v1/templates/{id}/egress",
    "POST /v1/api-keys",
    "POST /v1/me/onboarding/complete",
    "POST /v1/org/invitations",
    "POST /v1/org/invitations/{id}/cancel",
    "POST /v1/org/invitations/{id}/resend",
    "POST /v1/org/members",
    "POST /v1/registry-credentials",
    "POST /v1/sandboxes",
    "POST /v1/sandboxes/{id}/egress/test",
    "POST /v1/sandboxes/{id}/renew",
    "POST /v1/sandboxes/{id}/routes",
    "POST /v1/sandboxes/{id}/run",
    "POST /v1/template-builds/{id}/cancel",
    "POST /v1/template-builds/{id}/context",
    "POST /v1/template-builds/{id}/retry",
    "POST /v1/templates",
    "POST /v1/templates/{id}/archive",
    "POST /v1/templates/{id}/builds",
    "POST /v1/templates/{id}/promote"
  ]);
});
