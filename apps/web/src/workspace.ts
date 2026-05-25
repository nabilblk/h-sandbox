import type { OrganizationSettings } from "@harakiri/shared";
import type { UserProfile } from "./auth";

export const defaultWorkspace = (profile?: UserProfile | null): OrganizationSettings => {
  const emailLocal = profile?.email?.split("@")[0] || "workspace";
  const firstName = profile?.name?.split(/\s+/)[0] || emailLocal;
  const slugBase = emailLocal.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
  return { name: `${firstName} Labs`, slug: `${slugBase}-labs`, idleTtlSeconds: 300, maxConcurrency: 200, defaultTemplateId: null };
};
