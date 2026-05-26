import type { EgressNetworkPolicy, EgressNetworkRule } from "@harakiri/shared";
import { config } from "../../config.js";
import { callOpenSandbox, joinUrl, OpenSandboxHttpError, openSandboxUrl } from "./opensandbox-client.js";
import type { RuntimeEgressPolicyStatus } from "./provider.js";
import type { ProviderEndpoint } from "./opensandbox-types.js";

const EGRESS_PORT = 18_080;
const EGRESS_READY_RETRY_STATUSES = new Set([502, 503, 504]);
const EGRESS_READY_RETRY_DELAYS_MS = [150, 300, 600, 1_000];

type OpenSandboxEgressPolicyResponse = {
  status?: string;
  mode?: string;
  enforcementMode?: string;
  reason?: string;
  policy?: EgressNetworkPolicy;
};

const getHeader = (headersToCheck: Record<string, string>, name: string) => {
  const key = Object.keys(headersToCheck).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? headersToCheck[key] : undefined;
};

const resolveEgressEndpoint = async (opensandboxId: string) => {
  const result = await callOpenSandbox<ProviderEndpoint>(
    `/v1/sandboxes/${opensandboxId}/endpoints/${EGRESS_PORT}?use_server_proxy=true`
  );
  const endpoint = result.endpoint ?? result.url;
  if (!endpoint) throw new Error(`OpenSandbox did not return an egress endpoint for ${opensandboxId}`);
  const headers = result.headers ?? {};
  const gatewayRoute = getHeader(headers, "OpenSandbox-Ingress-To");
  return {
    baseUrl: gatewayRoute ? config.openSandboxGatewayUrl.replace(/\/+$/, "") : openSandboxUrl(endpoint),
    headers
  };
};

const parsePolicyResponse = (body: string, fallbackPolicy: EgressNetworkPolicy | null): RuntimeEgressPolicyStatus => {
  if (!body.trim()) return { status: "ok", policy: fallbackPolicy };
  const parsed = JSON.parse(body) as OpenSandboxEgressPolicyResponse;
  return {
    status: parsed.status,
    mode: parsed.mode,
    enforcementMode: parsed.enforcementMode,
    reason: parsed.reason,
    policy: parsed.policy ?? fallbackPolicy
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const callEgress = async (
  opensandboxId: string,
  path: string,
  init: RequestInit = {},
  fallbackPolicy: EgressNetworkPolicy | null = null
) => {
  const endpoint = await resolveEgressEndpoint(opensandboxId);
  let lastError: OpenSandboxHttpError | null = null;
  for (let attempt = 0; attempt <= EGRESS_READY_RETRY_DELAYS_MS.length; attempt += 1) {
    const response = await fetch(joinUrl(endpoint.baseUrl, path), {
      ...init,
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...endpoint.headers,
        ...(init.headers ?? {})
      }
    });
    const body = await response.text();
    if (response.ok) return parsePolicyResponse(body, fallbackPolicy);
    lastError = new OpenSandboxHttpError(response.status, body);
    const retryDelay = EGRESS_READY_RETRY_DELAYS_MS[attempt];
    if (!EGRESS_READY_RETRY_STATUSES.has(response.status) || retryDelay === undefined) break;
    await sleep(retryDelay);
  }
  throw lastError ?? new Error("OpenSandbox egress policy request failed");
};

export const getSandboxEgressPolicy = async (opensandboxId: string) =>
  callEgress(opensandboxId, "/policy");

export const setSandboxEgressPolicy = async (opensandboxId: string, policy: EgressNetworkPolicy) =>
  callEgress(opensandboxId, "/policy", { method: "POST", body: JSON.stringify(policy) }, policy);

export const patchSandboxEgressRules = async (opensandboxId: string, rules: EgressNetworkRule[]) =>
  callEgress(opensandboxId, "/policy", { method: "PATCH", body: JSON.stringify(rules) });
