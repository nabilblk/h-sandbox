import { query as defaultQuery } from "../db.js";
import type { Query } from "./query.js";

export type OrganizationSettingsUpdate = {
  name?: string;
  slug?: string;
  idleTtlSeconds?: number;
  maxConcurrency?: number;
  defaultTemplateId?: string;
};

export type OrganizationSettings = {
  id: string;
  name: string;
  slug: string;
  defaultTemplateId: string;
  idleTtlSeconds: number;
  maxConcurrency: number;
};

export const getOrganizationSettings = async (
  input: { organizationId: string },
  query: Query = defaultQuery
) => {
  const result = await query<OrganizationSettings>(
    `SELECT id, name, slug, default_template_id AS "defaultTemplateId",
            idle_ttl_seconds AS "idleTtlSeconds", max_concurrency AS "maxConcurrency"
     FROM organizations WHERE id = $1`,
    [input.organizationId]
  );
  return result.rows[0];
};

export const updateOrganizationSettings = async (
  input: { organizationId: string; patch: OrganizationSettingsUpdate },
  query: Query = defaultQuery
) => {
  const current = await query<{
    name: string;
    slug: string;
    default_template_id: string;
    idle_ttl_seconds: number;
    max_concurrency: number;
  }>("SELECT * FROM organizations WHERE id = $1", [input.organizationId]);
  const next = {
    name: input.patch.name ?? current.rows[0].name,
    slug: input.patch.slug ?? current.rows[0].slug,
    defaultTemplateId: input.patch.defaultTemplateId ?? current.rows[0].default_template_id,
    idleTtlSeconds: input.patch.idleTtlSeconds ?? current.rows[0].idle_ttl_seconds,
    maxConcurrency: input.patch.maxConcurrency ?? current.rows[0].max_concurrency
  };
  const result = await query<OrganizationSettings>(
    `UPDATE organizations
     SET name = $2, slug = $3, default_template_id = $4,
         idle_ttl_seconds = $5, max_concurrency = $6, updated_at = now()
     WHERE id = $1
     RETURNING id, name, slug, default_template_id AS "defaultTemplateId",
               idle_ttl_seconds AS "idleTtlSeconds", max_concurrency AS "maxConcurrency"`,
    [
      input.organizationId,
      next.name,
      next.slug,
      next.defaultTemplateId,
      next.idleTtlSeconds,
      next.maxConcurrency
    ]
  );
  return result.rows[0];
};
