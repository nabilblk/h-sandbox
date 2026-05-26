import { makeId } from "../crypto.js";
import { query as defaultQuery } from "../db.js";
import { defaultEgressPolicyInput, type EgressPolicyInput, type TemplateVersionSummary } from "@harakiri/shared";
import { activeTemplateBuildStatuses } from "../template-policy.js";
import {
  archiveTemplate,
  canMutateTemplate,
  listTemplates,
  resolveTemplate,
  type RuntimeTemplate,
  type TemplateListFilters
} from "../templates.js";
import { templateImagePolicyPayload, templateResourceLimitPayload } from "./template-policies.js";
import type { Query } from "./query.js";
import { policyInputFromSummary, validateEgressPolicyForOrganization } from "./egress-policy.js";

export type { Query } from "./query.js";

export type Audit = (
  organizationId: string,
  actorUserId: string,
  actorLabel: string,
  action: string,
  targetType: string,
  targetId?: string,
  metadata?: Record<string, unknown>
) => Promise<unknown>;

export type TemplateCreateInput = {
  id?: string;
  name: string;
  description: string;
  image: string;
  icon: "py" | "node" | "globe" | "box" | "file";
  tags: string[];
  aliases: string[];
  visibility: "public" | "private" | "internal";
  defaultEntrypoint: string[];
  cpuCount: number;
  memoryMb: number;
  workdir: string;
  defaultPorts: number[];
  runtimeFamily: string;
  egressPolicy?: EgressPolicyInput | null;
};

export type TemplateVersionRow = {
  id: string;
  templateId: string;
  buildId: string | null;
  versionNumber: number;
  aliases: string[];
  imageUri: string;
  imageDigest: string | null;
  status: string;
  defaultEntrypoint: string[];
  cpuCount: number;
  memoryMb: number;
  workdir: string;
  defaultPorts: number[];
  egressPolicy: EgressPolicyInput | null;
  envSchema: Record<string, unknown>;
  metadata: Record<string, unknown>;
  sbomRef: string | null;
  provenance: Record<string, unknown>;
  scanStatus: string | null;
  scanSummary: Record<string, unknown> | null;
  createdAt: Date | string;
  promotedAt: Date | string | null;
};

const toIso = (value: Date | string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const toIsoOrNull = (value: Date | string | null) => value ? toIso(value) : null;

const mapTemplateVersion = (row: TemplateVersionRow): TemplateVersionSummary => ({
  id: row.id,
  templateId: row.templateId,
  buildId: row.buildId,
  versionNumber: row.versionNumber,
  aliases: row.aliases,
  imageUri: row.imageUri,
  imageDigest: row.imageDigest,
  status: row.status,
  defaultEntrypoint: row.defaultEntrypoint,
  cpuCount: row.cpuCount,
  memoryMb: row.memoryMb,
  workdir: row.workdir,
  defaultPorts: row.defaultPorts,
  egressPolicy: row.egressPolicy ?? defaultEgressPolicyInput,
  envSchema: row.envSchema,
  metadata: row.metadata,
  sbomRef: row.sbomRef,
  provenance: row.provenance,
  scanStatus: row.scanStatus ?? "unknown",
  scanSummary: row.scanSummary ?? {},
  createdAt: toIso(row.createdAt),
  promotedAt: toIsoOrNull(row.promotedAt)
});

export const templateVersionSelect = `
  SELECT id, template_id AS "templateId", build_id AS "buildId",
         version_number AS "versionNumber", aliases, image_uri AS "imageUri",
         image_digest AS "imageDigest", status, default_entrypoint AS "defaultEntrypoint",
         cpu_count AS "cpuCount", memory_mb AS "memoryMb", workdir,
         default_ports AS "defaultPorts", egress_policy AS "egressPolicy",
         env_schema AS "envSchema", metadata,
         sbom_ref AS "sbomRef", provenance, scan_status AS "scanStatus",
         scan_summary AS "scanSummary",
         created_at AS "createdAt", promoted_at AS "promotedAt"
  FROM template_versions
`;

const slugFor = (value: string, idFactory: typeof makeId = makeId) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || idFactory("tpl", 8);

export const listTemplatesForOrganization = (
  input: { organizationId: string; filters: TemplateListFilters },
  dependencies: { listTemplatesFn?: typeof listTemplates } = {}
) => (dependencies.listTemplatesFn ?? listTemplates)(input.organizationId, input.filters);

export const getTemplate = async (
  input: { organizationId: string; templateId: string },
  dependencies: { resolveTemplateFn?: typeof resolveTemplate } = {}
) => (dependencies.resolveTemplateFn ?? resolveTemplate)(input.templateId, input.organizationId);

export type CreateTemplateResult =
  | { kind: "created"; template: RuntimeTemplate | null }
  | { kind: "resource_limit"; payload: NonNullable<ReturnType<typeof templateResourceLimitPayload>> }
  | { kind: "image_policy"; payload: NonNullable<ReturnType<typeof templateImagePolicyPayload>> }
  | { kind: "egress_policy_invalid"; message: string }
  | { kind: "egress_preset_not_allowed"; preset: string }
  | { kind: "egress_custom_domains_disabled" }
  | { kind: "egress_rule_limit_exceeded"; limit: number }
  | { kind: "template_exists"; template: string };

export const createTemplate = async (
  input: {
    organizationId: string;
    userId: string;
    actorLabel: string;
    template: TemplateCreateInput;
  },
  dependencies: {
    query?: Query;
    recordAudit: Audit;
    resolveTemplateFn?: typeof resolveTemplate;
    idFactory?: typeof makeId;
  }
): Promise<CreateTemplateResult> => {
  const query = dependencies.query ?? defaultQuery;
  const body = input.template;
  const resourceLimit = templateResourceLimitPayload(body);
  if (resourceLimit) return { kind: "resource_limit", payload: resourceLimit };
  const imagePolicy = templateImagePolicyPayload([{ image: body.image }]);
  if (imagePolicy) return { kind: "image_policy", payload: imagePolicy };
  const egressValidation = await validateEgressPolicyForOrganization(
    { organizationId: input.organizationId, policy: body.egressPolicy ?? null },
    query
  );
  if (egressValidation.kind === "invalid_policy") return { kind: "egress_policy_invalid", message: egressValidation.message };
  if (egressValidation.kind === "preset_not_allowed") return { kind: "egress_preset_not_allowed", preset: egressValidation.preset };
  if (egressValidation.kind === "custom_domains_disabled") return { kind: "egress_custom_domains_disabled" };
  if (egressValidation.kind === "rule_limit_exceeded") return { kind: "egress_rule_limit_exceeded", limit: egressValidation.limit };

  const id = body.id ?? slugFor(body.name, dependencies.idFactory);
  const exists = await query("SELECT id FROM templates WHERE id = $1", [id]);
  if (exists.rowCount) return { kind: "template_exists", template: id };

  await query(
    `INSERT INTO templates
     (id, organization_id, name, description, image, icon, tags, aliases, boot_ms,
      visibility, default_entrypoint, cpu_count, memory_mb, workdir, default_ports,
      egress_policy,
      runtime_family, status, source_kind)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 220, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, 'building', 'custom')`,
    [
      id,
      input.organizationId,
      body.name,
      body.description,
      body.image,
      body.icon,
      body.tags,
      body.aliases,
      body.visibility,
      body.defaultEntrypoint,
      body.cpuCount,
      body.memoryMb,
      body.workdir,
      body.defaultPorts,
      JSON.stringify(policyInputFromSummary(egressValidation.summary)),
      body.runtimeFamily
    ]
  );
  await dependencies.recordAudit(input.organizationId, input.userId, input.actorLabel, "template.create", "template", id, {
    imageUri: body.image,
    status: "building"
  });
  const template = await (dependencies.resolveTemplateFn ?? resolveTemplate)(id, input.organizationId);
  return { kind: "created", template };
};

export type ListTemplateVersionsResult =
  | { kind: "found"; versions: TemplateVersionSummary[] }
  | { kind: "template_not_found" };

export const listTemplateVersions = async (
  input: { organizationId: string; templateId: string },
  dependencies: { query?: Query; resolveTemplateFn?: typeof resolveTemplate } = {}
): Promise<ListTemplateVersionsResult> => {
  const query = dependencies.query ?? defaultQuery;
  const template = await (dependencies.resolveTemplateFn ?? resolveTemplate)(input.templateId, input.organizationId);
  if (!template) return { kind: "template_not_found" };
  const result = await query<TemplateVersionRow>(
    `${templateVersionSelect}
     WHERE template_id = $1 AND (organization_id IS NULL OR organization_id = $2)
     ORDER BY created_at DESC`,
    [template.id, input.organizationId]
  );
  return { kind: "found", versions: result.rows.map(mapTemplateVersion) };
};

export type PromoteTemplateResult =
  | { kind: "promoted"; template: RuntimeTemplate | null }
  | { kind: "template_not_found" }
  | { kind: "template_not_mutable" }
  | { kind: "template_version_not_found" };

export const promoteTemplate = async (
  input: {
    organizationId: string;
    userId: string;
    actorLabel: string;
    templateId: string;
    versionId: string;
    alias: string;
  },
  dependencies: {
    query?: Query;
    recordAudit: Audit;
    resolveTemplateFn?: typeof resolveTemplate;
  }
): Promise<PromoteTemplateResult> => {
  const query = dependencies.query ?? defaultQuery;
  const template = await (dependencies.resolveTemplateFn ?? resolveTemplate)(input.templateId, input.organizationId);
  if (!template) return { kind: "template_not_found" };
  if (!canMutateTemplate(template)) return { kind: "template_not_mutable" };
  const version = await query(
    `${templateVersionSelect}
     WHERE id = $1 AND template_id = $2 AND status = 'ready'
       AND (organization_id IS NULL OR organization_id = $3)`,
    [input.versionId, template.id, input.organizationId]
  );
  if (!version.rowCount) return { kind: "template_version_not_found" };
  await query(
    `UPDATE template_versions
     SET aliases = CASE
           WHEN $2 = ANY(aliases) THEN aliases
           ELSE array_append(aliases, $2)
         END,
         promoted_at = now()
     WHERE id = $1`,
    [input.versionId, input.alias]
  );
  await query("UPDATE templates SET latest_version_id = $2, updated_at = now() WHERE id = $1", [template.id, input.versionId]);
  await dependencies.recordAudit(input.organizationId, input.userId, input.actorLabel, "template.promote", "template", template.id, {
    versionId: input.versionId,
    alias: input.alias
  });
  const promoted = await (dependencies.resolveTemplateFn ?? resolveTemplate)(input.versionId, input.organizationId);
  return { kind: "promoted", template: promoted };
};

export type UpdateTemplateEgressResult =
  | { kind: "updated"; template: RuntimeTemplate | null }
  | { kind: "template_not_found" }
  | { kind: "template_not_mutable" }
  | { kind: "egress_policy_invalid"; message: string }
  | { kind: "egress_preset_not_allowed"; preset: string }
  | { kind: "egress_custom_domains_disabled" }
  | { kind: "egress_rule_limit_exceeded"; limit: number };

export const updateTemplateEgress = async (
  input: {
    organizationId: string;
    userId: string;
    actorLabel: string;
    templateId: string;
    egressPolicy: EgressPolicyInput;
  },
  dependencies: {
    query?: Query;
    recordAudit: Audit;
    resolveTemplateFn?: typeof resolveTemplate;
  }
): Promise<UpdateTemplateEgressResult> => {
  const query = dependencies.query ?? defaultQuery;
  const template = await (dependencies.resolveTemplateFn ?? resolveTemplate)(input.templateId, input.organizationId);
  if (!template) return { kind: "template_not_found" };
  if (!canMutateTemplate(template)) return { kind: "template_not_mutable" };

  const validation = await validateEgressPolicyForOrganization(
    { organizationId: input.organizationId, policy: input.egressPolicy },
    query
  );
  if (validation.kind === "invalid_policy") return { kind: "egress_policy_invalid", message: validation.message };
  if (validation.kind === "preset_not_allowed") return { kind: "egress_preset_not_allowed", preset: validation.preset };
  if (validation.kind === "custom_domains_disabled") return { kind: "egress_custom_domains_disabled" };
  if (validation.kind === "rule_limit_exceeded") return { kind: "egress_rule_limit_exceeded", limit: validation.limit };

  const policyInput = policyInputFromSummary(validation.summary);
  await query(
    `UPDATE templates
     SET egress_policy = $3::jsonb, updated_at = now()
     WHERE id = $1 AND organization_id = $2`,
    [template.id, input.organizationId, JSON.stringify(policyInput)]
  );
  if (template.latestVersionId) {
    await query(
      `UPDATE template_versions
       SET egress_policy = $3::jsonb
       WHERE id = $1 AND template_id = $2 AND organization_id = $4`,
      [template.latestVersionId, template.id, JSON.stringify(policyInput), input.organizationId]
    );
  }
  await dependencies.recordAudit(input.organizationId, input.userId, input.actorLabel, "template.egress.updated", "template", template.id, {
    mode: validation.summary.mode,
    ruleCount: validation.summary.rules.length,
    presetCount: validation.summary.presets.length
  });
  const updated = await (dependencies.resolveTemplateFn ?? resolveTemplate)(template.id, input.organizationId);
  return { kind: "updated", template: updated };
};

export type ArchiveTemplateResult =
  | { kind: "archived"; template: RuntimeTemplate; canceledBuildIds: string[] }
  | { kind: "template_not_found" };

export const archiveTemplateForOrganization = async (
  input: {
    organizationId: string;
    userId: string;
    actorLabel: string;
    templateId: string;
  },
  dependencies: {
    query?: Query;
    recordAudit: Audit;
    archiveTemplateFn?: typeof archiveTemplate;
  }
): Promise<ArchiveTemplateResult> => {
  const query = dependencies.query ?? defaultQuery;
  const archived = await (dependencies.archiveTemplateFn ?? archiveTemplate)(input.templateId, input.organizationId);
  if (!archived) return { kind: "template_not_found" };
  const canceled = await query<{ id: string }>(
    `UPDATE template_builds
     SET status = 'canceled',
         completed_at = COALESCE(completed_at, now()),
         error = COALESCE(error, 'canceled by template archive'),
         updated_at = now()
     WHERE organization_id = $1
       AND template_id = $2
       AND status = ANY($3::text[])
     RETURNING id`,
    [input.organizationId, archived.id, activeTemplateBuildStatuses]
  );
  const canceledBuildIds = canceled.rows.map((row) => row.id);
  await dependencies.recordAudit(input.organizationId, input.userId, input.actorLabel, "template.archive", "template", archived.id, {
    latestVersionId: archived.latestVersionId,
    canceledBuildIds
  });
  return { kind: "archived", template: archived, canceledBuildIds };
};
