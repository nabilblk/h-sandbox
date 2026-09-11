import type { OrganizationSettingsResponse, OrganizationCapacityResponse, UpdateOrganizationSettingsBody } from "@harakiri/shared";
import { request } from "./request";

export const settingsApi = {
  settings: () => request<OrganizationSettingsResponse>("/v1/org/settings"),
  capacity: () => request<OrganizationCapacityResponse>("/v1/org/capacity"),
  updateSettings: (body: UpdateOrganizationSettingsBody) =>
    request<OrganizationSettingsResponse>("/v1/org/settings", {
      method: "PATCH",
      body: JSON.stringify(body)
    })
};
