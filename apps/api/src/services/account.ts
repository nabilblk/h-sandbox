import type {
  AddOrganizationMemberResponse,
  CompleteOnboardingResponse,
  CurrentAccountResponse,
  OrganizationMemberSummary,
  OrganizationMembersResponse
} from "@harakiri/shared";
import { query as defaultQuery } from "../db.js";
import type { Query } from "./query.js";

export type { Query } from "./query.js";

export type Audit = (
  organizationId: string,
  actorUserId: string,
  actorLabel: string,
  action: string,
  targetType: string,
  targetId?: string,
  metadata?: Record<string, unknown>
) => Promise<unknown>;

export type AuthSnapshot = {
  organizationId: string;
  userId: string;
  actorLabel: string;
  [key: string]: unknown;
};

export type OrganizationSnapshot = {
  id: string;
  name: string;
  slug: string;
  defaultTemplateId: string | null;
  idleTtlSeconds: number;
  maxConcurrency: number;
};

export type UserSnapshot = {
  id: string;
  email: string;
  fullName: string | null;
  onboardingCompletedAt: Date | string | null;
};

export type MemberSnapshot = {
  id: string;
  userId: string;
  email: string;
  fullName: string | null;
  role: string;
  keycloakSubject: string | null;
  joinedAt: Date | string;
};

const toIso = (value: Date | string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const toIsoOrNull = (value: Date | string | null) => value ? toIso(value) : null;

const mapUser = (user: UserSnapshot) => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  onboardingCompletedAt: toIsoOrNull(user.onboardingCompletedAt)
});

const mapMember = (member: MemberSnapshot): OrganizationMemberSummary => ({
  id: member.id,
  userId: member.userId,
  email: member.email,
  fullName: member.fullName,
  role: member.role,
  status: member.keycloakSubject ? "active" : "pending",
  keycloakLinked: Boolean(member.keycloakSubject),
  joinedAt: toIso(member.joinedAt)
});

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const displayNameFromEmail = (email: string) => {
  const localPart = email.split("@")[0] || email;
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ") || email;
};

const membersSelect = `
  SELECT m.id, u.id AS "userId", u.email, u.full_name AS "fullName", m.role,
         u.keycloak_subject AS "keycloakSubject", m.created_at AS "joinedAt"
  FROM memberships m
  JOIN users u ON u.id = m.user_id
`;

export const getCurrentAccount = async (
  input: { auth: AuthSnapshot },
  query: Query = defaultQuery
): Promise<CurrentAccountResponse> => {
  const org = await query<OrganizationSnapshot>(
    `SELECT o.id, o.name, o.slug, o.default_template_id AS "defaultTemplateId",
            o.idle_ttl_seconds AS "idleTtlSeconds", o.max_concurrency AS "maxConcurrency"
     FROM organizations o WHERE o.id = $1`,
    [input.auth.organizationId]
  );
  const user = await query<UserSnapshot>(
    `SELECT id, email, full_name AS "fullName", onboarding_completed_at AS "onboardingCompletedAt"
     FROM users WHERE id = $1`,
    [input.auth.userId]
  );
  if (!org.rows[0]) throw new Error("organization not found for authenticated request");
  if (!user.rows[0]) throw new Error("user not found for authenticated request");
  return { auth: input.auth, user: mapUser(user.rows[0]), organization: org.rows[0] };
};

export const listOrganizationMembers = async (
  input: { organizationId: string },
  query: Query = defaultQuery
): Promise<OrganizationMembersResponse["members"]> => {
  const result = await query<MemberSnapshot>(
    `${membersSelect}
     WHERE m.organization_id = $1
     ORDER BY CASE m.role WHEN 'admin' THEN 0 ELSE 1 END, m.created_at ASC`,
    [input.organizationId]
  );
  return result.rows.map(mapMember);
};

export const addOrganizationMember = async (
  input: {
    organizationId: string;
    actorUserId: string;
    email: string;
  },
  query: Query = defaultQuery
): Promise<AddOrganizationMemberResponse | { kind: "forbidden" }> => {
  const actor = await query<{ role: string }>(
    "SELECT role FROM memberships WHERE organization_id = $1 AND user_id = $2 LIMIT 1",
    [input.organizationId, input.actorUserId]
  );
  if (actor.rows[0]?.role !== "admin") return { kind: "forbidden" };

  const email = normalizeEmail(input.email);
  const user = await query<{ id: string }>(
    `INSERT INTO users (email, full_name)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [email, displayNameFromEmail(email)]
  );
  const membership = await query<{ id: string }>(
    `INSERT INTO memberships (user_id, organization_id, role)
     VALUES ($1, $2, 'member')
     ON CONFLICT (user_id, organization_id) DO NOTHING
     RETURNING id`,
    [user.rows[0].id, input.organizationId]
  );
  const member = await query<MemberSnapshot>(
    `${membersSelect}
     WHERE m.organization_id = $1 AND u.id = $2
     LIMIT 1`,
    [input.organizationId, user.rows[0].id]
  );
  return { member: mapMember(member.rows[0]), created: Boolean(membership.rowCount) };
};

export const completeOnboarding = async (
  input: {
    organizationId: string;
    userId: string;
    actorLabel: string;
  },
  dependencies: { query?: Query; recordAudit: Audit }
): Promise<CompleteOnboardingResponse["user"]> => {
  const query = dependencies.query ?? defaultQuery;
  const result = await query<UserSnapshot>(
    `UPDATE users
     SET onboarding_completed_at = COALESCE(onboarding_completed_at, now()), updated_at = now()
     WHERE id = $1
     RETURNING id, email, full_name AS "fullName", onboarding_completed_at AS "onboardingCompletedAt"`,
    [input.userId]
  );
  await dependencies.recordAudit(input.organizationId, input.userId, input.actorLabel, "onboarding.complete", "user", input.userId);
  return {
    ...mapUser(result.rows[0]),
    onboardingCompletedAt: toIsoOrNull(result.rows[0].onboardingCompletedAt) ?? new Date().toISOString()
  };
};
