export type WorkspaceSummary = {
  id: string;
  name: string;
  sizeGiB: number;
  mountPath: "/workspace";
  status: "available" | "attached" | "releasing" | "recovery_required" | "archived";
  attachedSandboxId: string | null;
  storageRequested: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkspacePolicy = {
  available: boolean;
  reason: string | null;
  sizeGiB: number;
  maxPerOrganization: number;
  mountPath: "/workspace";
  retention: "until_operator_reclaims";
  physicalDeletion: false;
};

export type CreateWorkspaceBody = { name: string };
export type WorkspacesResponse = { workspaces: WorkspaceSummary[]; policy: WorkspacePolicy };
export type WorkspaceResponse = { workspace: WorkspaceSummary };
