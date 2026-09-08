import type { Query } from "./query.js";
import { readApiKeyPrincipal } from "./api-key-principals.js";

export type CredentialActor = { actorUserId: string | null; actorApiKeyId?: string };

export const organizationMembershipRole = async (
  organizationId: string,
  actorUserId: string | null,
  query: Query
) => {
  if (!actorUserId) return null;
  const result = await query<{ role: string }>(
    "SELECT role FROM memberships WHERE organization_id = $1 AND user_id = $2 LIMIT 1",
    [organizationId, actorUserId]
  );
  const role = result.rows[0]?.role;
  return role === "admin" || role === "member" ? role : null;
};

export const isOrganizationAdmin = async (
  organizationId: string,
  actorUserId: string | null,
  query: Query
) => await organizationMembershipRole(organizationId, actorUserId, query) === "admin";

export const credentialAccessRole = async (organizationId: string, actor: CredentialActor, query: Query) => {
  if (actor.actorUserId && actor.actorApiKeyId) return null;
  if (actor.actorApiKeyId) {
    const key = await readApiKeyPrincipal({ id: actor.actorApiKeyId, organizationId }, query);
    if (key?.scopes.includes("credentials:manage")) return "admin";
    return key?.scopes.includes("credentials:use") ? "member" : null;
  }
  return organizationMembershipRole(organizationId, actor.actorUserId, query);
};

export const canManageCredentials = async (organizationId: string, actor: CredentialActor, query: Query) =>
  await credentialAccessRole(organizationId, actor, query) === "admin";
