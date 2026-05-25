import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { apiErrorResponse, type AddOrganizationMemberResponse, type CompleteOnboardingResponse, type CurrentAccountResponse, type OrganizationMemberMutationResponse, type OrganizationMembersResponse } from "@harakiri/shared";
import { query as defaultQuery } from "../db.js";
import type { KeycloakAdminClient } from "../providers/auth/keycloak-admin.js";
import {
  cancelOrganizationInvitation,
  completeOnboarding,
  createOrganizationInvitation,
  getCurrentAccount,
  listOrganizationMembers,
  removeOrganizationMember,
  resendOrganizationInvitation,
  type Audit
} from "../services/account.js";
import type { Query } from "../services/query.js";
import { addOrganizationMemberSchema } from "./account.schema.js";

export type AccountRouteDependencies = {
  query?: Query;
  recordAudit: Audit;
  keycloakAdmin?: KeycloakAdminClient;
};

export const registerAccountRoutes = async (app: FastifyInstance, dependencies: AccountRouteDependencies) => {
  const query = dependencies.query ?? defaultQuery;
  const audit = dependencies.recordAudit;

  app.get("/v1/me", async (request) => {
    const response = await getCurrentAccount({ auth: request.auth }, query);
    return response satisfies CurrentAccountResponse;
  });

  const sendServiceError = (reply: FastifyReply, result: { kind: string }) => {
    if (result.kind === "forbidden") return reply.code(403).send(apiErrorResponse("forbidden", { message: "Only organization admins can manage members." }));
    if (result.kind === "not_found") return reply.code(404).send(apiErrorResponse("not_found"));
    if (result.kind === "last_admin") return reply.code(409).send(apiErrorResponse("last_admin", { message: "The last organization admin cannot be removed." }));
    if (result.kind === "self_remove") return reply.code(409).send(apiErrorResponse("self_remove", { message: "You cannot remove your own membership." }));
    return reply.code(400).send(apiErrorResponse(result.kind));
  };

  app.get("/v1/org/members", async (request, reply) => {
    const result = await listOrganizationMembers({ organizationId: request.auth.organizationId, actorUserId: request.auth.userId }, query);
    if ("kind" in result) return sendServiceError(reply, result);
    return { members: result } satisfies OrganizationMembersResponse;
  });

  const createInvitation = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = addOrganizationMemberSchema.parse(request.body ?? {});
    const result = await createOrganizationInvitation(
      { organizationId: request.auth.organizationId, actorUserId: request.auth.userId, actorLabel: request.auth.actorLabel, email: body.email },
      { query, recordAudit: audit, keycloakAdmin: dependencies.keycloakAdmin }
    );
    if ("kind" in result) return sendServiceError(reply, result);
    return reply.code(result.created ? 201 : 200).send(result satisfies AddOrganizationMemberResponse);
  };

  app.post("/v1/org/invitations", createInvitation);

  app.post("/v1/org/members", async (request, reply) => {
    return createInvitation(request, reply);
  });

  app.post("/v1/org/invitations/:id/resend", async (request, reply) => {
    const result = await resendOrganizationInvitation(
      { organizationId: request.auth.organizationId, actorUserId: request.auth.userId, actorLabel: request.auth.actorLabel, invitationId: (request.params as { id: string }).id },
      { query, recordAudit: audit, keycloakAdmin: dependencies.keycloakAdmin }
    );
    if ("kind" in result) return sendServiceError(reply, result);
    return result satisfies OrganizationMemberMutationResponse;
  });

  app.post("/v1/org/invitations/:id/cancel", async (request, reply) => {
    const result = await cancelOrganizationInvitation(
      { organizationId: request.auth.organizationId, actorUserId: request.auth.userId, actorLabel: request.auth.actorLabel, invitationId: (request.params as { id: string }).id },
      { query, recordAudit: audit }
    );
    if ("kind" in result) return sendServiceError(reply, result);
    return result satisfies OrganizationMemberMutationResponse;
  });

  app.delete("/v1/org/members/:id", async (request, reply) => {
    const result = await removeOrganizationMember(
      { organizationId: request.auth.organizationId, actorUserId: request.auth.userId, actorLabel: request.auth.actorLabel, membershipId: (request.params as { id: string }).id },
      { query, recordAudit: audit }
    );
    if ("kind" in result) return sendServiceError(reply, result);
    return result satisfies OrganizationMemberMutationResponse;
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
