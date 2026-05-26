import { query as defaultQuery } from "../db.js";
import type { Query } from "./query.js";
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
  const current = await query<{
    name: string;
    slug: string;
    default_template_id: string | null;
    idle_ttl_seconds: number;
    max_concurrency: number;
    default_egress_policy: EgressPolicyInput | null;
    egress_allowed_presets: EgressPresetId[] | null;
    egress_custom_domains_enabled: boolean | null;
    egress_max_rules: number | null;
    egress_redact_domains: boolean | null;
  }>("SELECT * FROM organizations WHERE id = $1", [input.organizationId]);
  const next = {
    name: input.patch.name ?? current.rows[0].name,
    slug: input.patch.slug ?? current.rows[0].slug,
    defaultTemplateId: input.patch.defaultTemplateId ?? current.rows[0].default_template_id,
    idleTtlSeconds: input.patch.idleTtlSeconds ?? current.rows[0].idle_ttl_seconds,
    maxConcurrency: input.patch.maxConcurrency ?? current.rows[0].max_concurrency,
    defaultEgressPolicy: input.patch.defaultEgressPolicy ?? current.rows[0].default_egress_policy ?? defaultEgressPolicyInput,
    egressAllowedPresets: input.patch.egressAllowedPresets ?? current.rows[0].egress_allowed_presets ?? defaultEgressAllowedPresets,
    egressCustomDomainsEnabled: input.patch.egressCustomDomainsEnabled ?? current.rows[0].egress_custom_domains_enabled ?? true,
    egressMaxRules: input.patch.egressMaxRules ?? current.rows[0].egress_max_rules ?? 128,
    egressRedactDomains: input.patch.egressRedactDomains ?? current.rows[0].egress_redact_domains ?? false
  };
  const result = await query<OrganizationSettings>(
    `UPDATE organizations
     SET name = $2, slug = $3, default_template_id = $4,
         idle_ttl_seconds = $5, max_concurrency = $6,
         default_egress_policy = $7::jsonb,
         egress_allowed_presets = $8::text[],
         egress_custom_domains_enabled = $9,
         egress_max_rules = $10,
         egress_redact_domains = $11,
         updated_at = now()
     WHERE id = $1
     RETURNING id, name, slug, default_template_id AS "defaultTemplateId",
               idle_ttl_seconds AS "idleTtlSeconds", max_concurrency AS "maxConcurrency",
               default_egress_policy AS "defaultEgressPolicy",
               egress_allowed_presets AS "egressAllowedPresets",
               egress_custom_domains_enabled AS "egressCustomDomainsEnabled",
               egress_max_rules AS "egressMaxRules",
               egress_redact_domains AS "egressRedactDomains"`,
    [
      input.organizationId,
      next.name,
      next.slug,
      next.defaultTemplateId,
      next.idleTtlSeconds,
      next.maxConcurrency,
      JSON.stringify(next.defaultEgressPolicy),
      next.egressAllowedPresets,
      next.egressCustomDomainsEnabled,
      next.egressMaxRules,
      next.egressRedactDomains
    ]
  );
  return normalizeSettings(result.rows[0]);
};
