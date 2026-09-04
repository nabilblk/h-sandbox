import { createPrivateKey } from "node:crypto";
import { SignJWT } from "jose";
import type { GitHubAppInstallationScope } from "@harakiri/shared";
import { config } from "../../config.js";
import type {
  DynamicCredentialIssuance,
  DynamicCredentialIssuerAdapter,
  DynamicCredentialValidation
} from "./provider.js";

type Fetch = typeof fetch;

type GitHubAppOptions = {
  enabled: boolean;
  clientId: string;
  privateKey: string;
  apiBaseUrl: string;
  apiVersion: string;
  timeoutMs: number;
  fetch: Fetch;
  now: () => number;
};

const defaultOptions: GitHubAppOptions = {
  enabled: config.dynamicGitHubAppEnabled,
  clientId: config.dynamicGitHubAppClientId,
  privateKey: config.dynamicGitHubAppPrivateKey.replace(/\\n/g, "\n"),
  apiBaseUrl: config.dynamicGitHubApiBaseUrl,
  apiVersion: config.dynamicGitHubApiVersion,
  timeoutMs: config.dynamicGitHubRequestTimeoutMs,
  fetch,
  now: () => Date.now()
};

const unavailableReason = (options: GitHubAppOptions) => {
  if (!options.enabled) return "GitHub App dynamic credentials are disabled by the operator";
  if (!options.clientId.trim()) return "DYNAMIC_GITHUB_APP_CLIENT_ID is not configured";
  if (!options.privateKey.trim()) return "DYNAMIC_GITHUB_APP_PRIVATE_KEY is not configured";
  return null;
};

const createAppJwt = async (options: GitHubAppOptions) => {
  const now = Math.floor(options.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 9 * 60)
    .setIssuer(options.clientId.trim())
    .sign(createPrivateKey(options.privateKey));
};

const requestHeaders = (jwt: string, options: GitHubAppOptions) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${jwt}`,
  "Content-Type": "application/json",
  "User-Agent": "harakiri-sandbox",
  "X-GitHub-Api-Version": options.apiVersion
});

const installationUrl = (scope: GitHubAppInstallationScope, options: GitHubAppOptions) =>
  `${options.apiBaseUrl.replace(/\/$/, "")}/app/installations/${encodeURIComponent(scope.installationId)}`;

const mapResponseFailure = (status: number): Exclude<DynamicCredentialValidation, { kind: "ok" }> => {
  if (status === 404) return { kind: "not_found", message: "GitHub App installation was not found" };
  if (status === 401 || status === 403) {
    return { kind: "forbidden", message: "GitHub rejected the App identity or installation access" };
  }
  if (status === 400 || status === 422) {
    return { kind: "invalid", message: "GitHub rejected the installation token scope" };
  }
  return { kind: "unavailable", message: `GitHub App API returned HTTP ${status}` };
};

const githubRequest = async (
  scope: GitHubAppInstallationScope,
  options: GitHubAppOptions,
  init: RequestInit
) => {
  const reason = unavailableReason(options);
  if (reason) return { kind: "unavailable" as const, message: reason };
  try {
    const jwt = await createAppJwt(options);
    const response = await options.fetch(installationUrl(scope, options) + (init.method === "POST" ? "/access_tokens" : ""), {
      ...init,
      headers: requestHeaders(jwt, options),
      signal: AbortSignal.timeout(options.timeoutMs)
    });
    if (!response.ok) return mapResponseFailure(response.status);
    return { kind: "ok" as const, response };
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "GitHub App API request timed out"
      : "GitHub App credentials or API connection are unavailable";
    return { kind: "unavailable" as const, message };
  }
};

const parseIssuance = async (
  response: Response,
  scope: GitHubAppInstallationScope
): Promise<DynamicCredentialIssuance> => {
  try {
    const body = await response.json() as Record<string, unknown>;
    const token = typeof body.token === "string" ? body.token : "";
    const expiresAt = typeof body.expires_at === "string" ? body.expires_at : "";
    if (!token || !expiresAt || Number.isNaN(Date.parse(expiresAt))) {
      return { kind: "invalid", message: "GitHub returned an invalid installation token response" };
    }
    return {
      kind: "ok",
      value: token,
      expiresAt: new Date(expiresAt).toISOString(),
      metadata: {
        issuerType: "github_app_installation",
        installationId: scope.installationId,
        repositories: scope.repositories,
        permissions: scope.permissions
      }
    };
  } catch {
    return { kind: "invalid", message: "GitHub returned an unreadable installation token response" };
  }
};

export const createGitHubAppInstallationIssuer = (
  overrides: Partial<GitHubAppOptions> = {}
): DynamicCredentialIssuerAdapter => {
  const options = { ...defaultOptions, ...overrides };
  return {
    type: "github_app_installation",
    async validate(scope) {
      const result = await githubRequest(scope, options, { method: "GET" });
      return result.kind === "ok" ? { kind: "ok" } : result;
    },
    async issue(scope) {
      const result = await githubRequest(scope, options, {
        method: "POST",
        body: JSON.stringify({ repositories: scope.repositories, permissions: scope.permissions })
      });
      return result.kind === "ok" ? parseIssuance(result.response, scope) : result;
    }
  };
};

export const githubAppInstallationIssuer = createGitHubAppInstallationIssuer();
