export const apiKeyScopes = [
  "sandboxes:read", "sandboxes:write", "templates:read", "templates:write",
  "workspaces:read", "workspaces:write", "credentials:use", "credentials:manage",
  "registry:manage", "audit:read", "org:read", "runs:read", "runs:write", "runs:content"
] as const;

export type ApiKeyScope = typeof apiKeyScopes[number];

export const defaultApiKeyScopes: ApiKeyScope[] = [
  "sandboxes:read", "sandboxes:write", "templates:read", "templates:write",
  "workspaces:read", "workspaces:write", "credentials:use", "org:read"
];

export const apiKeyDefaultLifetimeDays = 90;
export const apiKeyMaxLifetimeDays = 365;

export const allowedApiKeyScopes = (role: string): ApiKeyScope[] =>
  role === "admin" ? [...apiKeyScopes] : role === "member" ? [...defaultApiKeyScopes, "runs:read", "runs:write"] : [];

export const effectiveApiKeyScopes = (scopes: readonly string[], role: string): ApiKeyScope[] =>
  allowedApiKeyScopes(role).filter((scope) => scopes.includes(scope));
