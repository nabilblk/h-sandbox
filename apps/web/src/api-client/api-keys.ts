import type { ApiKeysResponse, CreateApiKeyBody, CreateApiKeyResponse, OkResponse } from "@harakiri/shared";
import { request } from "./request";

export const apiKeysApi = {
  keys: () => request<ApiKeysResponse>("/v1/api-keys"),
  createKey: (name: string, options: Omit<CreateApiKeyBody, "name"> = {}) => request<CreateApiKeyResponse>("/v1/api-keys", { method: "POST", body: JSON.stringify({ ...options, name }) }),
  revokeKey: (id: string) => request<OkResponse>(`/v1/api-keys/${id}`, { method: "DELETE" })
};
