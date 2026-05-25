import type { FastifyInstance } from "fastify";
import type { UsageSummary } from "@harakiri/shared";
import { query as defaultQuery } from "../db.js";
import { getUsageSummary } from "../services/usage.js";
import type { Query } from "../services/query.js";

export type UsageRouteDependencies = {
  query?: Query;
};

export const registerUsageRoutes = async (app: FastifyInstance, dependencies: UsageRouteDependencies = {}) => {
  const query = dependencies.query ?? defaultQuery;

  app.get("/v1/usage", async (request) => {
    const response = await getUsageSummary({ organizationId: request.auth.organizationId }, { query });
    return response satisfies UsageSummary;
  });
};
