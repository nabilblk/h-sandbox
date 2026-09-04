import type { EgressNetworkPolicy, EgressNetworkRule } from "@harakiri/shared";
import type { RuntimeEgressPolicyStatus } from "./provider.js";
import { callSandboxSidecarText, OPEN_SANDBOX_EGRESS_PORT } from "./opensandbox-sidecar.js";

type OpenSandboxEgressPolicyResponse = {
  status?: string;
  mode?: string;
  enforcementMode?: string;
  reason?: string;
  policy?: EgressNetworkPolicy;
};

const parsePolicyResponse = (body: string, fallbackPolicy: EgressNetworkPolicy | null): RuntimeEgressPolicyStatus => {
  if (!body.trim()) return { status: "ok", policy: fallbackPolicy };
  const parsed = JSON.parse(body) as OpenSandboxEgressPolicyResponse;
  return {
    status: parsed.status,
    mode: parsed.mode,
    enforcementMode: parsed.enforcementMode,
    credentialVaultReady: parsed.enforcementMode === "dns+nft",
    reason: parsed.reason,
    policy: parsed.policy ?? fallbackPolicy
  };
};

const callEgress = async (
  opensandboxId: string,
  path: string,
  init: RequestInit = {},
  fallbackPolicy: EgressNetworkPolicy | null = null
) => {
  const body = await callSandboxSidecarText(opensandboxId, OPEN_SANDBOX_EGRESS_PORT, "egress", path, init);
  return parsePolicyResponse(body, fallbackPolicy);
};

export const getSandboxEgressPolicy = async (opensandboxId: string) =>
  callEgress(opensandboxId, "/policy");

export const setSandboxEgressPolicy = async (opensandboxId: string, policy: EgressNetworkPolicy) =>
  callEgress(opensandboxId, "/policy", { method: "POST", body: JSON.stringify(policy) }, policy);

export const patchSandboxEgressRules = async (opensandboxId: string, rules: EgressNetworkRule[]) =>
  callEgress(opensandboxId, "/policy", { method: "PATCH", body: JSON.stringify(rules) });
