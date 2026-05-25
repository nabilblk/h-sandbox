import type { OrganizationSettingsResponse } from "@harakiri/shared";
import { request } from "./request";

export const settingsApi = {
  settings: () => request<OrganizationSettingsResponse>("/v1/org/settings"),
  updateSettings: (body: Record<string, unknown>) =>
    request<OrganizationSettingsResponse>("/v1/org/settings", {
      method: "PATCH",
      body: JSON.stringify(body)
    })
};
