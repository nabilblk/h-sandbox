import type { AddOrganizationMemberResponse, OrganizationMemberMutationResponse, OrganizationMembersResponse } from "@harakiri/shared";
import { request } from "./request";

export const membersApi = {
  members: () => request<OrganizationMembersResponse>("/v1/org/members"),
  inviteMember: (email: string) =>
    request<AddOrganizationMemberResponse>("/v1/org/invitations", {
      method: "POST",
      body: JSON.stringify({ email })
    }),
  addMember: (email: string) =>
    request<AddOrganizationMemberResponse>("/v1/org/members", {
      method: "POST",
      body: JSON.stringify({ email })
    }),
  resendInvitation: (id: string) =>
    request<OrganizationMemberMutationResponse>(`/v1/org/invitations/${id}/resend`, {
      method: "POST"
    }),
  cancelInvitation: (id: string) =>
    request<OrganizationMemberMutationResponse>(`/v1/org/invitations/${id}/cancel`, {
      method: "POST"
    }),
  removeMember: (id: string) =>
    request<OrganizationMemberMutationResponse>(`/v1/org/members/${id}`, {
      method: "DELETE"
    })
};
