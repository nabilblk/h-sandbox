import type { FastifyInstance } from "fastify";
import type { UsageSummary } from "@harakiri/shared";
import { query as defaultQuery } from "../db.js";
import { getUsageSummary } from "../services/usage.js";
import type { Query } from "../services/query.js";
import type { Transaction } from "../db.js";
import { getUsageHistory, usageHistoryQuery } from "../services/usage-history.js";

export type UsageRouteDependencies = {
  query?: Query;
  transaction?: Transaction;
};

export const registerUsageRoutes = async (app: FastifyInstance, dependencies: UsageRouteDependencies = {}) => {
  const query = dependencies.query ?? defaultQuery;

  app.get("/v1/usage", async (request) => {
    const response = await getUsageSummary({ organizationId: request.auth.organizationId }, { query });
    return response satisfies UsageSummary;
  });
  app.get("/v1/usage/history", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    return getUsageHistory(request.auth.organizationId, usageHistoryQuery.parse(request.query), { transaction: dependencies.transaction });
  });
};
