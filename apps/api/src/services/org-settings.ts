import { query as defaultQuery } from "../db.js";
import type { Query } from "./query.js";
import { CapacityError } from "./organization-capacity.js";
import {
  defaultEgressPolicyInput,
  egressPresetIds,
  type EgressPolicyInput,
  type EgressPresetId
} from "@harakiri/shared";

export type OrganizationSettingsUpdate = {
  name?: string;
  slug?: string;
  idleTtlSeconds?: number;
  maxConcurrency?: number;
  expectedCapacityRevision?: number;
  defaultTemplateId?: string;
  defaultEgressPolicy?: EgressPolicyInput;
  egressAllowedPresets?: EgressPresetId[];
  egressCustomDomainsEnabled?: boolean;
  egressMaxRules?: number;
  egressRedactDomains?: boolean;
};

export type OrganizationSettings = {
  id: string;
  name: string;
  slug: string;
  defaultTemplateId: string | null;
  idleTtlSeconds: number;
  maxConcurrency: number;
  capacityRevision: number;
  defaultEgressPolicy: EgressPolicyInput;
  egressAllowedPresets: EgressPresetId[];
  egressCustomDomainsEnabled: boolean;
  egressMaxRules: number;
  egressRedactDomains: boolean;
};

const defaultEgressAllowedPresets = [...egressPresetIds];

const normalizeSettings = (row: OrganizationSettings): OrganizationSettings => ({
  ...row,
  defaultEgressPolicy: row.defaultEgressPolicy ?? defaultEgressPolicyInput,
  egressAllowedPresets: row.egressAllowedPresets?.length ? row.egressAllowedPresets : defaultEgressAllowedPresets,
  egressCustomDomainsEnabled: row.egressCustomDomainsEnabled ?? true,
  egressMaxRules: row.egressMaxRules ?? 128,
  egressRedactDomains: row.egressRedactDomains ?? false
});

export const getOrganizationSettings = async (
  input: { organizationId: string },
  query: Query = defaultQuery
) => {
  const result = await query<OrganizationSettings>(
    `SELECT id, name, slug, default_template_id AS "defaultTemplateId",
            idle_ttl_seconds AS "idleTtlSeconds", max_concurrency AS "maxConcurrency",
            capacity_revision AS "capacityRevision",
            default_egress_policy AS "defaultEgressPolicy",
            egress_allowed_presets AS "egressAllowedPresets",
            egress_custom_domains_enabled AS "egressCustomDomainsEnabled",
            egress_max_rules AS "egressMaxRules",
            egress_redact_domains AS "egressRedactDomains"
     FROM organizations WHERE id = $1`,
    [input.organizationId]
  );
  return normalizeSettings(result.rows[0]);
};

export const updateOrganizationSettings = async (
  input: { organizationId: string; patch: OrganizationSettingsUpdate },
  query: Query = defaultQuery
) => {
  if (input.patch.maxConcurrency !== undefined && input.patch.expectedCapacityRevision === undefined) {
    throw new CapacityError("organization_capacity_settings_conflict", "Reload settings before changing the concurrency limit.");
  }
  const fields: Array<[keyof OrganizationSettingsUpdate, string, string?]> = [
    ["name", "name"], ["slug", "slug"], ["defaultTemplateId", "default_template_id"],
    ["idleTtlSeconds", "idle_ttl_seconds"], ["maxConcurrency", "max_concurrency"],
    ["defaultEgressPolicy", "default_egress_policy", "jsonb"],
    ["egressAllowedPresets", "egress_allowed_presets", "text[]"],
    ["egressCustomDomainsEnabled", "egress_custom_domains_enabled"],
    ["egressMaxRules", "egress_max_rules"], ["egressRedactDomains", "egress_redact_domains"]
  ];
  const params: unknown[] = [input.organizationId];
  const updates = ["updated_at = now()"];
  for (const [field, column, cast] of fields) {
    const value = input.patch[field];
    if (value === undefined) continue;
    params.push(cast === "jsonb" ? JSON.stringify(value) : value);
    updates.push(`${column} = $${params.length}${cast ? `::${cast}` : ""}`);
  }
  let revisionClause = "";
  if (input.patch.maxConcurrency !== undefined) {
    params.push(input.patch.expectedCapacityRevision);
    revisionClause = ` AND capacity_revision = $${params.length}`;
    updates.push("capacity_revision = capacity_revision + 1");
  }
  // A single UPDATE serializes with admission and only changes explicitly supplied fields.
  const result = await query<OrganizationSettings>(
    `UPDATE organizations
     SET ${updates.join(", ")}
     WHERE id = $1${revisionClause}
     RETURNING id, name, slug, default_template_id AS "defaultTemplateId",
               idle_ttl_seconds AS "idleTtlSeconds", max_concurrency AS "maxConcurrency",
               capacity_revision AS "capacityRevision",
               default_egress_policy AS "defaultEgressPolicy",
               egress_allowed_presets AS "egressAllowedPresets",
               egress_custom_domains_enabled AS "egressCustomDomainsEnabled",
               egress_max_rules AS "egressMaxRules",
               egress_redact_domains AS "egressRedactDomains"`,
    params
  );
  if (!result.rows[0]) throw new CapacityError("organization_capacity_settings_conflict", "Settings changed. Reload them before saving the concurrency limit.");
  return normalizeSettings(result.rows[0]);
};
