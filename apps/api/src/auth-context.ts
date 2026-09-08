import type { ApiKeyScope } from "@harakiri/shared";

type Principal = {
  organizationId: string;
  actorLabel: string;
  expiresAt?: string | null;
  subject?: string;
};

export type AuthContext = Principal & (
  | { authType: "keycloak" | "dev"; userId: string; role?: "admin" | "member"; apiKeyId?: never; scopes?: never }
  | { authType: "api_key"; userId: null; apiKeyId: string; scopes: ApiKeyScope[]; role?: never }
);

export const credentialActor = (auth: AuthContext) => ({
  actorUserId: auth.userId,
  ...(auth.authType === "api_key" ? { actorApiKeyId: auth.apiKeyId } : {})
});
