import type { CreateWorkspaceBody, WorkspaceResponse, WorkspacesResponse } from "@harakiri/shared";
import { request } from "./request";

export const workspacesApi = {
  workspaces: () => request<WorkspacesResponse>("/v1/workspaces"),
  createWorkspace: (body: CreateWorkspaceBody) => request<WorkspaceResponse>("/v1/workspaces", { method: "POST", body: JSON.stringify(body) }),
  archiveWorkspace: (id: string) => request<WorkspaceResponse>(`/v1/workspaces/${encodeURIComponent(id)}/archive`, { method: "POST" })
};
