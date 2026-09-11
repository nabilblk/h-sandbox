import { apiErrorResponse, defaultApiKeyScopes, type ApiKeyScope } from "@harakiri/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthContext } from "./auth-context.js";

export type RoutePermission = { scopes?: ApiKeyScope[]; humanOnly?: boolean; adminOnly?: boolean };
const permissions = new Map<string, RoutePermission>();
const add = (method: string, paths: string[], permission: RoutePermission) => {
  for (const path of paths) permissions.set(`${method} ${path}`, permission);
};

add("GET", ["/v1/me"], { humanOnly: true });
add("POST", ["/v1/me/onboarding/complete"], { humanOnly: true });
for (const method of ["GET", "POST"]) add(method, ["/v1/api-keys"], { humanOnly: true });
add("DELETE", ["/v1/api-keys/:id"], { humanOnly: true });
add("GET", ["/v1/org/settings", "/v1/org/capacity", "/v1/usage"], { scopes: ["org:read"] });
add("PATCH", ["/v1/org/settings"], { humanOnly: true, adminOnly: true });
add("GET", ["/v1/org/members"], { humanOnly: true, adminOnly: true });
add("POST", ["/v1/org/members", "/v1/org/invitations", "/v1/org/invitations/:id/resend", "/v1/org/invitations/:id/cancel"], { humanOnly: true, adminOnly: true });
add("DELETE", ["/v1/org/members/:id"], { humanOnly: true, adminOnly: true });
add("GET", ["/v1/audit-events"], { scopes: ["audit:read"] });

add("GET", ["/v1/templates", "/v1/templates/:id", "/v1/templates/:id/versions", "/v1/template-builds", "/v1/template-builds/:id", "/v1/template-builds/:id/logs"], { scopes: ["templates:read"] });
add("POST", ["/v1/templates", "/v1/templates/:id/builds", "/v1/templates/:id/promote", "/v1/templates/:id/archive", "/v1/template-builds/:id/context", "/v1/template-builds/:id/cancel", "/v1/template-builds/:id/retry"], { scopes: ["templates:write"] });
add("PATCH", ["/v1/templates/:id/egress"], { scopes: ["templates:write"] });
add("GET", ["/v1/registry-credentials"], { scopes: ["registry:manage"] });
add("POST", ["/v1/registry-credentials"], { scopes: ["registry:manage"] });
add("DELETE", ["/v1/registry-credentials/:id"], { scopes: ["registry:manage"] });

add("GET", ["/v1/workspaces", "/v1/workspaces/:id"], { scopes: ["workspaces:read"] });
add("POST", ["/v1/workspaces", "/v1/workspaces/:id/archive"], { scopes: ["workspaces:write"] });
add("GET", ["/v1/sandboxes", "/v1/sandboxes/:id", "/v1/snapshots", "/v1/snapshots/:snapshotId", "/v1/runtime/capabilities"], { scopes: ["sandboxes:read"] });
add("GET", ["/v1/sandboxes/:id/readiness"], { scopes: ["sandboxes:read"] });
add("POST", ["/v1/sandboxes", "/v1/sandboxes/:id/pause", "/v1/sandboxes/:id/resume", "/v1/sandboxes/:id/snapshots", "/v1/sandboxes/:id/renew"], { scopes: ["sandboxes:write"] });
add("DELETE", ["/v1/sandboxes/:id", "/v1/snapshots/:snapshotId"], { scopes: ["sandboxes:write"] });
add("PATCH", ["/v1/sandboxes/:id/source"], { scopes: ["sandboxes:write"] });

add("GET", ["commands", "commands/:commandId", "commands/:commandId/logs", "commands/:commandId/events", "logs", "files", "files/stat", "files/read", "files/download", "metrics", "egress", "routes"].map((path) => `/v1/sandboxes/:id/${path}`), { scopes: ["sandboxes:read"] });
add("POST", ["run", "commands", "command-sessions", "command-sessions/:sessionId/run", "files/upload", "files/mkdir", "files/rename", "egress/test", "routes", "terminal/attach-ticket"].map((path) => `/v1/sandboxes/:id/${path}`), { scopes: ["sandboxes:write"] });
add("PUT", ["/v1/sandboxes/:id/files"], { scopes: ["sandboxes:write"] });
add("PATCH", ["/v1/sandboxes/:id/egress"], { scopes: ["sandboxes:write"] });
add("DELETE", ["commands/:commandId", "command-sessions/:sessionId", "files", "routes/:port"].map((path) => `/v1/sandboxes/:id/${path}`), { scopes: ["sandboxes:write"] });
add("GET", ["/v1/sandboxes/:id/terminal/attach"], { scopes: ["sandboxes:write"] });

add("GET", ["/v1/credential-presets", "/v1/credential-presets/:id"], { scopes: ["credentials:use"] });
for (const resource of ["credential-secrets", "external-secret-references", "dynamic-credential-issuers"]) {
  add("GET", [`/v1/${resource}`, `/v1/${resource}/:id`], { scopes: ["credentials:use"] });
  add("POST", [`/v1/${resource}`, ...["enable", "disable", ...(resource === "credential-secrets" ? ["rotate"] : ["validate"])].map((action) => `/v1/${resource}/:id/${action}`)], { scopes: ["credentials:manage"] });
  add("PATCH", [`/v1/${resource}/:id`], { scopes: ["credentials:manage"] });
  add("DELETE", [`/v1/${resource}/:id`], { scopes: ["credentials:manage"] });
}
add("GET", ["/v1/sandboxes/:id/credentials"], { scopes: ["sandboxes:read", "credentials:use"] });
add("POST", ["credentials", "credentials/inspect", "credentials/rehydrate", "credentials/:attachmentId/refresh", "credentials/:attachmentId/test"].map((path) => `/v1/sandboxes/:id/${path}`), { scopes: ["sandboxes:write", "credentials:use"] });
add("DELETE", ["/v1/sandboxes/:id/credentials/:attachmentId"], { scopes: ["sandboxes:write", "credentials:use"] });

export const routePermission = (method: string, path: string | undefined) => permissions.get(`${method === "HEAD" ? "GET" : method} ${path}`);

export const hasScope = (auth: AuthContext, scope: ApiKeyScope) => {
  if (auth.authType !== "api_key") return auth.role === "admin" || (auth.role === "member" && defaultApiKeyScopes.includes(scope));
  return auth.scopes.includes(scope) || (scope === "credentials:use" && auth.scopes.includes("credentials:manage"));
};

export const permits = (auth: AuthContext, permission: RoutePermission | undefined) => {
  if (!permission) return false;
  if (auth.authType === "api_key" && (permission.humanOnly || permission.adminOnly)) return false;
  if (auth.authType !== "api_key" && auth.role !== "admin" && auth.role !== "member") return false;
  if (permission.adminOnly && auth.role !== "admin") return false;
  return (permission.scopes ?? []).every((scope) => hasScope(auth, scope));
};

export const authorizeRequest = (request: FastifyRequest, reply: FastifyReply) => {
  if (!permits(request.auth, routePermission(request.method, request.routeOptions.url))) {
    return reply.code(403).send(apiErrorResponse("forbidden", { message: "Your identity does not have permission for this operation." }));
  }
  // Create and restore can carry credentials without using a credential URL.
  if (request.method === "POST" && request.routeOptions.url === "/v1/sandboxes") {
    const body = request.body as { credentials?: unknown[]; credentialMappings?: unknown[]; workspaceId?: unknown } | null;
    if (((body?.credentials?.length || body?.credentialMappings?.length) && !hasScope(request.auth, "credentials:use")) || (body?.workspaceId && !hasScope(request.auth, "workspaces:write"))) {
      return reply.code(403).send(apiErrorResponse("forbidden", { message: "Credential use and workspace attachment require their corresponding scopes." }));
    }
  }
};
