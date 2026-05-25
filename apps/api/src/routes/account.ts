import type { FastifyInstance } from "fastify";
import type { CompleteOnboardingResponse, CurrentAccountResponse } from "@harakiri/shared";
import { query as defaultQuery } from "../db.js";
import { completeOnboarding, getCurrentAccount, type Audit } from "../services/account.js";
import type { Query } from "../services/query.js";

export type AccountRouteDependencies = {
  query?: Query;
  recordAudit: Audit;
};

export const registerAccountRoutes = async (app: FastifyInstance, dependencies: AccountRouteDependencies) => {
  const query = dependencies.query ?? defaultQuery;
  const audit = dependencies.recordAudit;

  app.get("/v1/me", async (request) => {
    const response = await getCurrentAccount({ auth: request.auth }, query);
    return response satisfies CurrentAccountResponse;
  });

  app.post("/v1/me/onboarding/complete", async (request) => {
    const response = {
      user: await completeOnboarding(
      {
        organizationId: request.auth.organizationId,
        userId: request.auth.userId,
        actorLabel: request.auth.actorLabel
      },
      { query, recordAudit: audit }
    )
    } satisfies CompleteOnboardingResponse;
    return response;
  });
};
