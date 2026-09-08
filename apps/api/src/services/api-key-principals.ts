import { defaultApiKeyScopes, effectiveApiKeyScopes } from "@harakiri/shared";
import type { AuthContext } from "../auth-context.js";
import type { Query } from "./query.js";

export const readApiKeyPrincipal = async (
  lookup: { id: string; organizationId?: string } | { hash: string },
  query: Query
): Promise<Extract<AuthContext, { authType: "api_key" }> | null> => {
  const result = await query<{
    id: string; organizationId: string; scopes: string[]; legacy: boolean;
    expiresAt: Date | string | null; creatorRole: string | null;
  }>(
    `SELECT ak.id, ak.organization_id AS "organizationId", ak.scopes, ak.legacy,
            ak.expires_at AS "expiresAt", m.role AS "creatorRole"
     FROM api_keys ak
     LEFT JOIN memberships m ON m.organization_id = ak.organization_id AND m.user_id = ak.created_by_user_id
     WHERE ${"id" in lookup ? "ak.id" : "ak.key_hash"} = $1 AND ak.revoked_at IS NULL
       AND (ak.expires_at IS NULL OR ak.expires_at > now())
       AND (ak.legacy OR m.role IN ('admin', 'member'))`,
    ["id" in lookup ? lookup.id : lookup.hash]
  );
  const key = result.rows[0];
  if (!key || ("id" in lookup && lookup.organizationId && key.organizationId !== lookup.organizationId)) return null;
  const expiry = key.expiresAt === null ? null : new Date(key.expiresAt);
  if ((expiry && !(expiry.getTime() > Date.now())) || (!key.legacy && !expiry)) return null;
  const scopes = effectiveApiKeyScopes(key.legacy ? defaultApiKeyScopes : key.scopes, key.legacy ? "member" : key.creatorRole ?? "");
  if (!scopes.length) return null;
  return {
    authType: "api_key", userId: null, apiKeyId: key.id,
    organizationId: key.organizationId, actorLabel: `api-key:${key.id}`,
    scopes, expiresAt: expiry?.toISOString() ?? null
  };
};
