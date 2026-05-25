import type { FastifyInstance } from "fastify";
import { apiErrorResponse, type AddOrganizationMemberResponse, type CompleteOnboardingResponse, type CurrentAccountResponse, type OrganizationMembersResponse } from "@harakiri/shared";
import { query as defaultQuery } from "../db.js";
import { addOrganizationMember, completeOnboarding, getCurrentAccount, listOrganizationMembers, type Audit } from "../services/account.js";
import type { Query } from "../services/query.js";
import { addOrganizationMemberSchema } from "./account.schema.js";

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

  app.get("/v1/org/members", async (request) => ({
    members: await listOrganizationMembers({ organizationId: request.auth.organizationId }, query)
  }) satisfies OrganizationMembersResponse);

  app.post("/v1/org/members", async (request, reply) => {
    const body = addOrganizationMemberSchema.parse(request.body ?? {});
    const result = await addOrganizationMember(
      { organizationId: request.auth.organizationId, actorUserId: request.auth.userId, email: body.email },
      query
    );
    if ("kind" in result) {
      return reply.code(403).send(apiErrorResponse("forbidden", { message: "Only organization admins can add members." }));
    }
    if (result.created) {
      await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "org.member.add", "user", result.member.userId, {
        email: result.member.email,
        role: result.member.role
      });
    }
    return reply.code(result.created ? 201 : 200).send(result satisfies AddOrganizationMemberResponse);
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
