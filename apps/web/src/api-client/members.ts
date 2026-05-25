import type { AddOrganizationMemberResponse, OrganizationMembersResponse } from "@harakiri/shared";
import { request } from "./request";

export const membersApi = {
  members: () => request<OrganizationMembersResponse>("/v1/org/members"),
  addMember: (email: string) =>
    request<AddOrganizationMemberResponse>("/v1/org/members", {
      method: "POST",
      body: JSON.stringify({ email })
    })
};
