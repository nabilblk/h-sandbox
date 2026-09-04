import type { Query } from "./query.js";

export const organizationMembershipRole = async (
  organizationId: string,
  actorUserId: string,
  query: Query
) => {
  const result = await query<{ role: string }>(
    "SELECT role FROM memberships WHERE organization_id = $1 AND user_id = $2 LIMIT 1",
    [organizationId, actorUserId]
  );
  return result.rows[0]?.role ?? null;
};

export const isOrganizationAdmin = async (
  organizationId: string,
  actorUserId: string,
  query: Query
) => await organizationMembershipRole(organizationId, actorUserId, query) === "admin";
