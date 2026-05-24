import { TEMPLATES, type Template } from "@harakiri/shared";
import { query } from "./db.js";

export type RuntimeTemplate = Template & {
  templateVersionId: string | null;
  imageDigest: string | null;
};

export type TemplateListFilters = {
  q?: string;
  visibility?: string;
  owner?: string;
  runtimeFamily?: string;
  status?: string;
  limit?: number;
  offset?: number;
};

type TemplateVisibility = Template["visibility"];

export const sharedPlatformTemplateVisibilities: TemplateVisibility[] = ["public", "internal"];

export const isSharedPlatformTemplateVisibility = (visibility: TemplateVisibility) =>
  sharedPlatformTemplateVisibilities.includes(visibility);

export const canReadTemplateRow = (
  row: { organizationId?: string | null; visibility: TemplateVisibility },
  organizationId: string
) => row.organizationId === organizationId || (!row.organizationId && isSharedPlatformTemplateVisibility(row.visibility));

export const canMutateTemplate = (template: Pick<Template, "ownerScope">) => template.ownerScope === "team";

export const templateReadScopeSql = (alias = "t", organizationPlaceholder = "$1") =>
  `(${alias}.organization_id = ${organizationPlaceholder} OR (${alias}.organization_id IS NULL AND ${alias}.visibility = ANY(ARRAY['public','internal']::text[])))`;

type TemplateRow = {
  id: string;
  name: string;
  description: string;
  image: string;
  imageDigest: string | null;
  icon: Template["icon"];
  tags: string[];
  aliases: string[];
  bootMs: number;
  visibility: Template["visibility"];
  status: string;
  ownerScope: NonNullable<Template["ownerScope"]>;
  defaultEntrypoint: string[];
  cpuCount: number;
  memoryMb: number;
  workdir: string;
  defaultPorts: number[];
  runtimeFamily: string;
  latestVersionId: string | null;
  latestBuildId?: string | null;
  latestBuildStatus?: string | null;
  latestBuildCreatedAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

const templateFields = `
  t.id,
  t.name,
  t.description,
  COALESCE(v.image_uri, t.image) AS image,
  COALESCE(v.image_digest, t.image_digest) AS "imageDigest",
  t.icon,
  t.tags,
  t.aliases,
  t.boot_ms AS "bootMs",
  t.visibility,
  t.status,
  CASE WHEN t.organization_id IS NULL THEN 'platform' ELSE 'team' END AS "ownerScope",
  COALESCE(v.default_entrypoint, t.default_entrypoint) AS "defaultEntrypoint",
  COALESCE(v.cpu_count, t.cpu_count) AS "cpuCount",
  COALESCE(v.memory_mb, t.memory_mb) AS "memoryMb",
  COALESCE(v.workdir, t.workdir) AS workdir,
  COALESCE(v.default_ports, t.default_ports) AS "defaultPorts",
  t.runtime_family AS "runtimeFamily",
  v.id AS "latestVersionId",
  t.created_at AS "createdAt",
  t.updated_at AS "updatedAt"
`;

const mapTemplate = (row: TemplateRow): RuntimeTemplate => ({
  id: row.id,
  name: row.name,
  description: row.description,
  image: row.image,
  imageDigest: row.imageDigest,
  icon: row.icon,
  tags: row.tags ?? [],
  aliases: row.aliases ?? [],
  bootMs: Number(row.bootMs) || 0,
  visibility: row.visibility,
  status: row.status,
  ownerScope: row.ownerScope,
  defaultEntrypoint: row.defaultEntrypoint ?? ["sleep", "3600"],
  cpuCount: Number(row.cpuCount) || 1,
  memoryMb: Number(row.memoryMb) || 1024,
  workdir: row.workdir || "/",
  defaultPorts: (row.defaultPorts ?? []).map(Number).filter(Number.isInteger),
  runtimeFamily: row.runtimeFamily || "linux",
  latestVersionId: row.latestVersionId,
  templateVersionId: row.latestVersionId,
  latestBuildId: row.latestBuildId ?? null,
  latestBuildStatus: row.latestBuildStatus ?? null,
  latestBuildCreatedAt: row.latestBuildCreatedAt ? new Date(row.latestBuildCreatedAt).toISOString() : null,
  createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : undefined,
  updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : undefined
});

const fallbackTemplate = (templateRef: string): RuntimeTemplate | null => {
  const template =
    TEMPLATES.find((item) => item.id === templateRef || item.name === templateRef || item.aliases.includes(templateRef)) ?? null;
  if (!template) return null;
  if (!isSharedPlatformTemplateVisibility(template.visibility)) return null;
  return {
    ...template,
    imageDigest: template.imageDigest ?? null,
    latestVersionId: template.latestVersionId ?? null,
    templateVersionId: template.latestVersionId ?? null,
    ownerScope: template.ownerScope ?? "platform"
  };
};

const templateWhere = (organizationId: string, filters: TemplateListFilters) => {
  const params: unknown[] = [organizationId];
  const where = [templateReadScopeSql("t", "$1")];
  if (filters.visibility && filters.visibility !== "all") {
    params.push(filters.visibility);
    where.push(`t.visibility = $${params.length}`);
  }
  if (filters.owner && filters.owner !== "all") {
    if (filters.owner === "team") where.push("t.organization_id = $1");
    if (filters.owner === "platform") where.push("t.organization_id IS NULL");
  }
  if (filters.runtimeFamily && filters.runtimeFamily !== "all") {
    params.push(filters.runtimeFamily);
    where.push(`t.runtime_family = $${params.length}`);
  }
  if (filters.status && filters.status !== "all" && filters.status !== "active") {
    params.push(filters.status);
    where.push(`t.status = $${params.length}`);
  } else if (!filters.status || filters.status === "active") {
    where.push("t.status <> 'archived'");
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    where.push(`(t.id ILIKE $${params.length} OR t.name ILIKE $${params.length} OR EXISTS (
      SELECT 1 FROM unnest(t.aliases) alias WHERE alias ILIKE $${params.length}
    ))`);
  }
  return { params, where: where.join(" AND ") };
};

export const listTemplates = async (organizationId: string, filters: TemplateListFilters = {}) => {
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);
  const { params, where } = templateWhere(organizationId, filters);
  const result = await query<TemplateRow>(
    `SELECT ${templateFields},
            lb.id AS "latestBuildId",
            lb.status AS "latestBuildStatus",
            lb.created_at AS "latestBuildCreatedAt"
     FROM templates t
     LEFT JOIN template_versions v ON v.id = t.latest_version_id
     LEFT JOIN LATERAL (
       SELECT b.id, b.status, b.created_at
       FROM template_builds b
       WHERE b.template_id = t.id
         AND b.organization_id = $1
       ORDER BY b.created_at DESC
       LIMIT 1
     ) lb ON true
     WHERE ${where}
     ORDER BY t.boot_ms ASC, t.name ASC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  const total = await query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM templates t
     WHERE ${where}`,
    params
  );
  const fallback = !result.rows.length && !filters.q && !filters.visibility && !filters.owner && !filters.runtimeFamily && !filters.status && offset === 0;
  const templates = fallback
    ? TEMPLATES.map((template) => fallbackTemplate(template.id)).filter((template): template is RuntimeTemplate => Boolean(template))
    : result.rows.map(mapTemplate);
  return { templates, page: { total: fallback ? templates.length : Number(total.rows[0]?.count ?? 0), limit, offset } };
};

export const resolveTemplate = async (templateRef: string, organizationId: string): Promise<RuntimeTemplate | null> => {
  const result = await query<TemplateRow & { rank: number; scopeRank: number }>(
    `SELECT ${templateFields},
            CASE
              WHEN t.organization_id = $2 THEN 0
              ELSE 1
            END AS "scopeRank",
            CASE
              WHEN t.id = $1 THEN 0
              WHEN t.name = $1 THEN 1
              WHEN $1 = ANY(t.aliases) THEN 2
              WHEN v_match.id = $1 THEN 3
              WHEN $1 = ANY(v_match.aliases) THEN 4
              ELSE 5
            END AS rank
     FROM templates t
     LEFT JOIN template_versions v_match
       ON v_match.template_id = t.id
      AND (v_match.id = $1 OR $1 = ANY(v_match.aliases))
     LEFT JOIN template_versions v_latest ON v_latest.id = t.latest_version_id
     LEFT JOIN template_versions v ON v.id = COALESCE(v_match.id, v_latest.id)
     WHERE ${templateReadScopeSql("t", "$2")}
       AND t.status <> 'archived'
       AND (t.id = $1 OR t.name = $1 OR $1 = ANY(t.aliases) OR v_match.id IS NOT NULL)
     ORDER BY "scopeRank" ASC, rank ASC, t.updated_at DESC
     LIMIT 1`,
    [templateRef, organizationId]
  );
  if (result.rows[0]) return mapTemplate(result.rows[0]);
  return fallbackTemplate(templateRef);
};

export const archiveTemplate = async (templateRef: string, organizationId: string): Promise<RuntimeTemplate | null> => {
  const archived = await query<{ id: string }>(
    `UPDATE templates
     SET status = 'archived',
         updated_at = now()
     WHERE organization_id = $1
       AND (id = $2 OR name = $2 OR $2 = ANY(aliases))
     RETURNING id`,
    [organizationId, templateRef]
  );
  const id = archived.rows[0]?.id;
  if (!id) return null;

  const result = await query<TemplateRow>(
    `SELECT ${templateFields}
     FROM templates t
     LEFT JOIN template_versions v ON v.id = t.latest_version_id
     WHERE t.id = $1 AND t.organization_id = $2`,
    [id, organizationId]
  );
  return result.rows[0] ? mapTemplate(result.rows[0]) : null;
};

export const averageTemplateBootMs = async (organizationId: string) => {
  const result = await query<{ avg: number | string | null }>(
    `SELECT COALESCE(AVG(boot_ms), 0)::float AS avg
     FROM templates
     WHERE ${templateReadScopeSql("templates", "$1")}`,
    [organizationId]
  );
  const avg = Number(result.rows[0]?.avg ?? 0);
  if (avg > 0) return Math.round(avg);
  return Math.round(TEMPLATES.reduce((sum, template) => sum + template.bootMs, 0) / TEMPLATES.length);
};
