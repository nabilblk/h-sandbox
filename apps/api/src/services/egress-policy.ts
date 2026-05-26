import {
  compileEgressPolicy,
  defaultEgressPolicyInput,
  egressPresetIds,
  type EgressPolicyInput,
  type EgressNetworkPolicy,
  type EgressPolicySummary,
  type EgressPresetId
} from "@harakiri/shared";
import { query as defaultQuery } from "../db.js";
import type { Query } from "./query.js";

export type EgressGovernance = {
  defaultEgressPolicy: EgressPolicyInput;
  egressAllowedPresets: EgressPresetId[];
  egressCustomDomainsEnabled: boolean;
  egressMaxRules: number;
  egressRedactDomains: boolean;
};

export type EgressValidationResult =
  | { kind: "ok"; summary: EgressPolicySummary; governance: EgressGovernance }
  | { kind: "invalid_policy"; message: string }
  | { kind: "rule_limit_exceeded"; limit: number }
  | { kind: "preset_not_allowed"; preset: EgressPresetId }
  | { kind: "custom_domains_disabled" };

const defaultGovernance: EgressGovernance = {
  defaultEgressPolicy: defaultEgressPolicyInput,
  egressAllowedPresets: [...egressPresetIds],
  egressCustomDomainsEnabled: true,
  egressMaxRules: 128,
  egressRedactDomains: false
};

export const getEgressGovernance = async (
  input: { organizationId: string },
  query: Query = defaultQuery
): Promise<EgressGovernance> => {
  const result = await query<EgressGovernance>(
    `SELECT default_egress_policy AS "defaultEgressPolicy",
            egress_allowed_presets AS "egressAllowedPresets",
            egress_custom_domains_enabled AS "egressCustomDomainsEnabled",
            egress_max_rules AS "egressMaxRules",
            egress_redact_domains AS "egressRedactDomains"
     FROM organizations WHERE id = $1`,
    [input.organizationId]
  );
  const row = result.rows[0] ?? defaultGovernance;
  return {
    defaultEgressPolicy: row.defaultEgressPolicy ?? defaultEgressPolicyInput,
    egressAllowedPresets: row.egressAllowedPresets?.length ? row.egressAllowedPresets : [...egressPresetIds],
    egressCustomDomainsEnabled: row.egressCustomDomainsEnabled ?? true,
    egressMaxRules: row.egressMaxRules ?? 128,
    egressRedactDomains: row.egressRedactDomains ?? false
  };
};

export const policyUsesCustomDomains = (policy: EgressPolicyInput | null | undefined) =>
  (policy?.allow?.length ?? 0) > 0 || (policy?.deny?.length ?? 0) > 0 || policy?.mode === "custom";

export const validateEgressPolicyForOrganization = async (
  input: { organizationId: string; policy: EgressPolicyInput | null | undefined },
  query: Query = defaultQuery
): Promise<EgressValidationResult> => {
  const governance = await getEgressGovernance({ organizationId: input.organizationId }, query);
  let summary: EgressPolicySummary;
  try {
    summary = compileEgressPolicy(input.policy ?? governance.defaultEgressPolicy ?? defaultEgressPolicyInput);
  } catch (error) {
    return { kind: "invalid_policy", message: error instanceof Error ? error.message : String(error) };
  }
  const allowedPresets = new Set(governance.egressAllowedPresets);
  const disallowedPreset = summary.presets.find((preset) => !allowedPresets.has(preset));
  if (disallowedPreset) return { kind: "preset_not_allowed", preset: disallowedPreset };
  if (!governance.egressCustomDomainsEnabled && policyUsesCustomDomains(input.policy)) {
    return { kind: "custom_domains_disabled" };
  }
  if (summary.rules.length > governance.egressMaxRules) {
    return { kind: "rule_limit_exceeded", limit: governance.egressMaxRules };
  }
  return { kind: "ok", summary, governance };
};

export const policyInputFromSummary = (summary: EgressPolicySummary): EgressPolicyInput => ({
  mode: summary.mode,
  presets: summary.presets,
  allow: summary.allow,
  deny: summary.deny
});

export const runtimeEgressPolicyFromSummary = (summary: EgressPolicySummary): EgressNetworkPolicy =>
  summary.compiledPolicy ?? { defaultAction: "allow", egress: [] };
