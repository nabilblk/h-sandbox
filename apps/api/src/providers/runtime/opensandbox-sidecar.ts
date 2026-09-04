import { config } from "../../config.js";
import { callOpenSandbox, joinUrl, OpenSandboxHttpError, openSandboxUrl } from "./opensandbox-client.js";
import type { ProviderEndpoint } from "./opensandbox-types.js";

export const OPEN_SANDBOX_EGRESS_PORT = 18_080;

const SIDECAR_READY_RETRY_STATUSES = new Set([502, 503, 504]);
const SIDECAR_READY_RETRY_DELAYS_MS = [150, 300, 600, 1_000];

const getHeader = (headersToCheck: Record<string, string>, name: string) => {
  const key = Object.keys(headersToCheck).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? headersToCheck[key] : undefined;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const resolveSandboxSidecarEndpoint = async (opensandboxId: string, port: number, label: string) => {
  const result = await callOpenSandbox<ProviderEndpoint>(
    `/v1/sandboxes/${opensandboxId}/endpoints/${port}?use_server_proxy=true`
  );
  const endpoint = result.endpoint ?? result.url;
  if (!endpoint) throw new Error(`OpenSandbox did not return a ${label} endpoint for ${opensandboxId}`);
  const headers = result.headers ?? {};
  const gatewayRoute = getHeader(headers, "OpenSandbox-Ingress-To");
  return {
    baseUrl: gatewayRoute ? config.openSandboxGatewayUrl.replace(/\/+$/, "") : openSandboxUrl(endpoint),
    headers
  };
};

export const callSandboxSidecarText = async (
  opensandboxId: string,
  port: number,
  label: string,
  path: string,
  init: RequestInit = {}
) => {
  const endpoint = await resolveSandboxSidecarEndpoint(opensandboxId, port, label);
  let lastError: OpenSandboxHttpError | null = null;
  for (let attempt = 0; attempt <= SIDECAR_READY_RETRY_DELAYS_MS.length; attempt += 1) {
    const response = await fetch(joinUrl(endpoint.baseUrl, path), {
      ...init,
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...endpoint.headers,
        ...(init.headers ?? {})
      }
    });
    const body = await response.text();
    if (response.ok) return body;
    lastError = new OpenSandboxHttpError(response.status, body);
    const retryDelay = SIDECAR_READY_RETRY_DELAYS_MS[attempt];
    if (!SIDECAR_READY_RETRY_STATUSES.has(response.status) || retryDelay === undefined) break;
    await sleep(retryDelay);
  }
  throw lastError ?? new Error(`OpenSandbox ${label} request failed`);
};
