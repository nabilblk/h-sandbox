import type { ApiKeysResponse, CreateApiKeyResponse, OkResponse } from "@harakiri/shared";
import { request } from "./request";

export const apiKeysApi = {
  keys: () => request<ApiKeysResponse>("/v1/api-keys"),
  createKey: (name: string) => request<CreateApiKeyResponse>("/v1/api-keys", { method: "POST", body: JSON.stringify({ name }) }),
  revokeKey: (id: string) => request<OkResponse>(`/v1/api-keys/${id}`, { method: "DELETE" })
};
