import type { FastifyInstance } from "fastify";
import type { OrganizationSettingsResponse, OrganizationCapacityResponse } from "@harakiri/shared";
import { readOrganizationCapacity } from "../services/organization-capacity.js";
import { query as defaultQuery } from "../db.js";
import { getOrganizationSettings, updateOrganizationSettings } from "../services/org-settings.js";
import type { Query } from "../services/query.js";
import { settingsSchema } from "./org-settings.schema.js";

type Audit = (
  organizationId: string,
  actorUserId: string | null,
  actorLabel: string,
  action: string,
  targetType: string,
  targetId?: string,
  metadata?: Record<string, unknown>
) => Promise<unknown>;

export type OrgSettingsRouteDependencies = {
  query?: Query;
  recordAudit: Audit;
};

export const registerOrgSettingsRoutes = async (app: FastifyInstance, dependencies: OrgSettingsRouteDependencies) => {
  const query = dependencies.query ?? defaultQuery;
  const audit = dependencies.recordAudit;

  app.get("/v1/org/capacity", async (request) => ({
    capacity: await readOrganizationCapacity(request.auth.organizationId, query)
  }) satisfies OrganizationCapacityResponse);

  app.get("/v1/org/settings", async (request) => ({
    organization: await getOrganizationSettings({ organizationId: request.auth.organizationId }, query)
  }) satisfies OrganizationSettingsResponse);

  app.patch("/v1/org/settings", async (request) => {
    const body = settingsSchema.parse(request.body ?? {});
    const organization = await updateOrganizationSettings({ organizationId: request.auth.organizationId, patch: body }, query);
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "org.update", "organization", request.auth.organizationId, body);
    return { organization } satisfies OrganizationSettingsResponse;
  });
};
