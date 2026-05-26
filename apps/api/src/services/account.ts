import type {
  AddOrganizationMemberResponse,
  CompleteOnboardingResponse,
  CurrentAccountResponse,
  EgressPolicyInput,
  EgressPresetId,
  OrganizationMemberMutationResponse,
  OrganizationMemberSummary,
  OrganizationMembersResponse
} from "@harakiri/shared";
import { config } from "../config.js";
import { query as defaultQuery } from "../db.js";
import type { KeycloakAdminClient, KeycloakUserSummary } from "../providers/auth/keycloak-admin.js";
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
  defaultEgressPolicy: EgressPolicyInput;
  egressAllowedPresets: EgressPresetId[];
  egressCustomDomainsEnabled: boolean;
  egressMaxRules: number;
  egressRedactDomains: boolean;
};

export type RoleSnapshot = {
  role: string;
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

export type InvitationSnapshot = {
  id: string;
  emailNormalized: string;
  displayEmail: string;
  role: string;
  status: string;
  keycloakUserId: string | null;
  lastError: string | null;
  invitedAt: Date | string;
  expiresAt: Date | string | null;
  sentAt: Date | string | null;
  acceptedAt: Date | string | null;
  canceledAt: Date | string | null;
};

const toIso = (value: Date | string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const toIsoOrNull = (value: Date | string | null) => value ? toIso(value) : null;
const isExpired = (value: Date | string | null) => value ? new Date(value).getTime() <= Date.now() : false;

const mapUser = (user: UserSnapshot) => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  onboardingCompletedAt: toIsoOrNull(user.onboardingCompletedAt)
});

const capabilitiesForRole = (role: string) => ({
  canManageMembers: role === "admin"
});

const mapMember = (member: MemberSnapshot, options: { actorUserId?: string; adminCount?: number } = {}): OrganizationMemberSummary => ({
  id: member.id,
  kind: "member",
  userId: member.userId,
  membershipId: member.id,
  invitationId: null,
  email: member.email,
  fullName: member.fullName,
  role: member.role,
  status: "active",
  keycloakLinked: Boolean(member.keycloakSubject),
  joinedAt: toIso(member.joinedAt),
  invitedAt: null,
  expiresAt: null,
  lastError: null,
  actions: {
    canResend: false,
    canCancel: false,
    canRemove: member.userId !== options.actorUserId && !(member.role === "admin" && Number(options.adminCount ?? 0) <= 1)
  }
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

const splitEmailName = (email: string) => {
  const label = displayNameFromEmail(email);
  const [firstName, ...rest] = label.split(/\s+/).filter(Boolean);
  return { firstName: firstName || label, lastName: rest.join(" ") };
};

const membersSelect = `
  SELECT m.id, u.id AS "userId", u.email, u.full_name AS "fullName", m.role,
         u.keycloak_subject AS "keycloakSubject", m.created_at AS "joinedAt"
  FROM memberships m
  JOIN users u ON u.id = m.user_id
`;

const invitationsSelect = `
  SELECT id, email_normalized AS "emailNormalized", display_email AS "displayEmail",
         role, status, keycloak_user_id AS "keycloakUserId", last_error AS "lastError",
         created_at AS "invitedAt", expires_at AS "expiresAt", sent_at AS "sentAt",
         accepted_at AS "acceptedAt", canceled_at AS "canceledAt"
  FROM organization_invitations
`;

const mapInvitation = (invitation: InvitationSnapshot): OrganizationMemberSummary => {
  const status = invitation.status === "pending" || invitation.status === "sent" || invitation.status === "send_failed"
    ? isExpired(invitation.expiresAt) ? "expired" : invitation.status
    : invitation.status;
  return {
    id: invitation.id,
    kind: "invitation",
    userId: null,
    membershipId: null,
    invitationId: invitation.id,
    email: invitation.displayEmail,
    fullName: displayNameFromEmail(invitation.displayEmail),
    role: invitation.role,
    status: status as OrganizationMemberSummary["status"],
    keycloakLinked: false,
    joinedAt: null,
    invitedAt: toIso(invitation.invitedAt),
    expiresAt: toIsoOrNull(invitation.expiresAt),
    lastError: invitation.lastError,
    actions: {
      canResend: ["pending", "send_failed", "expired"].includes(status),
      canCancel: ["pending", "sent", "send_failed", "expired"].includes(status),
      canRemove: false
    }
  };
};

const adminCheck = async (organizationId: string, actorUserId: string, query: Query) => {
  const actor = await query<RoleSnapshot>(
    "SELECT role FROM memberships WHERE organization_id = $1 AND user_id = $2 LIMIT 1",
    [organizationId, actorUserId]
  );
  return actor.rows[0]?.role === "admin";
};

const adminCountForOrg = async (organizationId: string, query: Query) => {
  const result = await query<{ count: string }>("SELECT count(*)::text AS count FROM memberships WHERE organization_id = $1 AND role = 'admin'", [organizationId]);
  return Number(result.rows[0]?.count ?? 0);
};

const localUserForKeycloakUser = async (keycloakUser: KeycloakUserSummary, query: Query) => {
  const email = normalizeEmail(keycloakUser.email);
  const fullName = [keycloakUser.firstName, keycloakUser.lastName].filter(Boolean).join(" ").trim() || displayNameFromEmail(email);
  const user = await query<{ id: string }>(
    `INSERT INTO users (email, full_name, keycloak_subject)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           keycloak_subject = EXCLUDED.keycloak_subject,
           updated_at = now()
     RETURNING id`,
    [email, fullName, keycloakUser.id]
  );
  return user.rows[0].id;
};

const fetchMemberByUserId = async (organizationId: string, userId: string, actorUserId: string, query: Query) => {
  const member = await query<MemberSnapshot>(
    `${membersSelect}
     WHERE m.organization_id = $1 AND u.id = $2
     LIMIT 1`,
    [organizationId, userId]
  );
  if (!member.rows[0]) return null;
  return mapMember(member.rows[0], { actorUserId, adminCount: await adminCountForOrg(organizationId, query) });
};

const fetchInvitationRow = async (organizationId: string, invitationId: string, query: Query) => {
  const invitation = await query<InvitationSnapshot>(
    `${invitationsSelect}
     WHERE organization_id = $1 AND id = $2
     LIMIT 1`,
    [organizationId, invitationId]
  );
  return invitation.rows[0] ?? null;
};

const markInvitationSendFailure = async (organizationId: string, invitationId: string, error: unknown, query: Query) => {
  const message = error instanceof Error ? error.message : String(error);
  const updated = await query<InvitationSnapshot>(
    `UPDATE organization_invitations
     SET status = 'send_failed', last_error = $3, updated_at = now()
     WHERE organization_id = $1 AND id = $2
     RETURNING id, email_normalized AS "emailNormalized", display_email AS "displayEmail",
               role, status, keycloak_user_id AS "keycloakUserId", last_error AS "lastError",
               created_at AS "invitedAt", expires_at AS "expiresAt", sent_at AS "sentAt",
               accepted_at AS "acceptedAt", canceled_at AS "canceledAt"`,
    [organizationId, invitationId, message.slice(0, 500)]
  );
  return updated.rows[0];
};

const sendInvitationActions = async (
  input: {
    organizationId: string;
    invitation: InvitationSnapshot;
    keycloakAdmin?: KeycloakAdminClient;
    existingKeycloakUser?: KeycloakUserSummary | null;
  },
  query: Query
) => {
  if (!input.keycloakAdmin) throw new Error("Keycloak admin integration is not configured");
  const email = normalizeEmail(input.invitation.displayEmail);
  const name = splitEmailName(email);
  const keycloakUser = input.existingKeycloakUser
    ?? await input.keycloakAdmin.findUserByEmail(email)
    ?? await input.keycloakAdmin.createUser({ email, ...name });
  await input.keycloakAdmin.executeActionsEmail({
    userId: keycloakUser.id,
    actions: ["UPDATE_PASSWORD", "VERIFY_EMAIL"],
    clientId: config.keycloakInvitationClientId,
    redirectUri: config.keycloakInvitationRedirectUri,
    lifespanSeconds: config.keycloakInvitationLifespanSeconds
  });
  const updated = await query<InvitationSnapshot>(
    `UPDATE organization_invitations
     SET status = 'sent', keycloak_user_id = $3, sent_at = now(), last_error = NULL, updated_at = now()
     WHERE id = $1 AND organization_id = $2
     RETURNING id, email_normalized AS "emailNormalized", display_email AS "displayEmail",
               role, status, keycloak_user_id AS "keycloakUserId", last_error AS "lastError",
               created_at AS "invitedAt", expires_at AS "expiresAt", sent_at AS "sentAt",
               accepted_at AS "acceptedAt", canceled_at AS "canceledAt"`,
    [input.invitation.id, input.organizationId, keycloakUser.id]
  );
  return updated.rows[0];
};

export const getCurrentAccount = async (
  input: { auth: AuthSnapshot },
  query: Query = defaultQuery
): Promise<CurrentAccountResponse> => {
  const org = await query<OrganizationSnapshot>(
    `SELECT o.id, o.name, o.slug, o.default_template_id AS "defaultTemplateId",
            o.idle_ttl_seconds AS "idleTtlSeconds", o.max_concurrency AS "maxConcurrency",
            o.default_egress_policy AS "defaultEgressPolicy",
            o.egress_allowed_presets AS "egressAllowedPresets",
            o.egress_custom_domains_enabled AS "egressCustomDomainsEnabled",
            o.egress_max_rules AS "egressMaxRules",
            o.egress_redact_domains AS "egressRedactDomains"
     FROM organizations o WHERE o.id = $1`,
    [input.auth.organizationId]
  );
  const user = await query<UserSnapshot>(
    `SELECT id, email, full_name AS "fullName", onboarding_completed_at AS "onboardingCompletedAt"
     FROM users WHERE id = $1`,
    [input.auth.userId]
  );
  const membership = await query<RoleSnapshot>(
    "SELECT role FROM memberships WHERE organization_id = $1 AND user_id = $2 LIMIT 1",
    [input.auth.organizationId, input.auth.userId]
  );
  if (!org.rows[0]) throw new Error("organization not found for authenticated request");
  if (!user.rows[0]) throw new Error("user not found for authenticated request");
  const role = membership.rows[0]?.role ?? "member";
  return { auth: input.auth, user: mapUser(user.rows[0]), role, capabilities: capabilitiesForRole(role), organization: org.rows[0] };
};

export const listOrganizationMembers = async (
  input: { organizationId: string; actorUserId: string },
  query: Query = defaultQuery
): Promise<OrganizationMembersResponse["members"] | { kind: "forbidden" }> => {
  if (!(await adminCheck(input.organizationId, input.actorUserId, query))) return { kind: "forbidden" };
  const adminCount = await adminCountForOrg(input.organizationId, query);
  const memberships = await query<MemberSnapshot>(
    `${membersSelect}
     WHERE m.organization_id = $1
     ORDER BY CASE m.role WHEN 'admin' THEN 0 ELSE 1 END, m.created_at ASC`,
    [input.organizationId]
  );
  const invitations = await query<InvitationSnapshot>(
    `${invitationsSelect}
     WHERE organization_id = $1 AND status IN ('pending', 'sent', 'send_failed')
     ORDER BY created_at ASC`,
    [input.organizationId]
  );
  return [
    ...memberships.rows.map((member) => mapMember(member, { actorUserId: input.actorUserId, adminCount })),
    ...invitations.rows.map(mapInvitation)
  ];
};

export const createOrganizationInvitation = async (
  input: {
    organizationId: string;
    actorUserId: string;
    actorLabel: string;
    email: string;
  },
  dependencies: { query?: Query; recordAudit: Audit; keycloakAdmin?: KeycloakAdminClient }
): Promise<AddOrganizationMemberResponse | { kind: "forbidden" }> => {
  const query = dependencies.query ?? defaultQuery;
  if (!(await adminCheck(input.organizationId, input.actorUserId, query))) return { kind: "forbidden" };

  const email = normalizeEmail(input.email);
  const existingMember = await query<MemberSnapshot>(
    `${membersSelect}
     WHERE m.organization_id = $1 AND lower(u.email) = $2
     LIMIT 1`,
    [input.organizationId, email]
  );
  if (existingMember.rows[0]) {
    return { member: mapMember(existingMember.rows[0], { actorUserId: input.actorUserId, adminCount: await adminCountForOrg(input.organizationId, query) }), created: false };
  }

  const existingKeycloakUser = await dependencies.keycloakAdmin?.findUserByEmail(email).catch(() => null);
  if (existingKeycloakUser) {
    const localUserId = await localUserForKeycloakUser(existingKeycloakUser, query);
    const membership = await query<{ id: string }>(
      `INSERT INTO memberships (user_id, organization_id, role)
       VALUES ($1, $2, 'member')
       ON CONFLICT (user_id, organization_id) DO NOTHING
       RETURNING id`,
      [localUserId, input.organizationId]
    );
    const member = await fetchMemberByUserId(input.organizationId, localUserId, input.actorUserId, query);
    if (membership.rowCount) {
      await dependencies.recordAudit(input.organizationId, input.actorUserId, input.actorLabel, "org.member.add", "user", localUserId, { email, role: "member", source: "keycloak-existing-user" });
    }
    return { member: member!, created: Boolean(membership.rowCount) };
  }

  const existingInvitation = await query<InvitationSnapshot>(
    `${invitationsSelect}
     WHERE organization_id = $1 AND email_normalized = $2 AND status IN ('pending', 'sent', 'send_failed')
     LIMIT 1`,
    [input.organizationId, email]
  );
  if (existingInvitation.rows[0]) {
    return { member: mapInvitation(existingInvitation.rows[0]), created: false };
  }

  const invitation = await query<InvitationSnapshot>(
    `INSERT INTO organization_invitations (organization_id, email_normalized, display_email, role, status, invited_by_user_id, expires_at)
     VALUES ($1, $2, $3, 'member', 'pending', $4, now() + ($5::text || ' seconds')::interval)
     RETURNING id, email_normalized AS "emailNormalized", display_email AS "displayEmail",
               role, status, keycloak_user_id AS "keycloakUserId", last_error AS "lastError",
               created_at AS "invitedAt", expires_at AS "expiresAt", sent_at AS "sentAt",
               accepted_at AS "acceptedAt", canceled_at AS "canceledAt"`,
    [input.organizationId, email, email, input.actorUserId, config.keycloakInvitationLifespanSeconds]
  );
  await dependencies.recordAudit(input.organizationId, input.actorUserId, input.actorLabel, "org.invitation.create", "invitation", invitation.rows[0].id, { email, role: "member" });

  try {
    const sent = await sendInvitationActions({ organizationId: input.organizationId, invitation: invitation.rows[0], keycloakAdmin: dependencies.keycloakAdmin }, query);
    await dependencies.recordAudit(input.organizationId, input.actorUserId, input.actorLabel, "org.invitation.send", "invitation", sent.id, { email, role: sent.role });
    return { member: mapInvitation(sent), created: true };
  } catch (error) {
    const failed = await markInvitationSendFailure(input.organizationId, invitation.rows[0].id, error, query);
    await dependencies.recordAudit(input.organizationId, input.actorUserId, input.actorLabel, "org.invitation.send_failed", "invitation", failed.id, { email, error: failed.lastError });
    return { member: mapInvitation(failed), created: true };
  }
};

export const addOrganizationMember = createOrganizationInvitation;

export const resendOrganizationInvitation = async (
  input: { organizationId: string; actorUserId: string; actorLabel: string; invitationId: string },
  dependencies: { query?: Query; recordAudit: Audit; keycloakAdmin?: KeycloakAdminClient }
): Promise<OrganizationMemberMutationResponse | { kind: "forbidden" | "not_found" }> => {
  const query = dependencies.query ?? defaultQuery;
  if (!(await adminCheck(input.organizationId, input.actorUserId, query))) return { kind: "forbidden" };
  const invitation = await fetchInvitationRow(input.organizationId, input.invitationId, query);
  if (!invitation || ["accepted", "canceled"].includes(invitation.status)) return { kind: "not_found" };
  try {
    const sent = await sendInvitationActions({ organizationId: input.organizationId, invitation, keycloakAdmin: dependencies.keycloakAdmin }, query);
    await dependencies.recordAudit(input.organizationId, input.actorUserId, input.actorLabel, "org.invitation.resend", "invitation", sent.id, { email: sent.displayEmail });
    return { member: mapInvitation(sent) };
  } catch (error) {
    const failed = await markInvitationSendFailure(input.organizationId, invitation.id, error, query);
    await dependencies.recordAudit(input.organizationId, input.actorUserId, input.actorLabel, "org.invitation.resend_failed", "invitation", failed.id, { email: failed.displayEmail, error: failed.lastError });
    return { member: mapInvitation(failed) };
  }
};

export const cancelOrganizationInvitation = async (
  input: { organizationId: string; actorUserId: string; actorLabel: string; invitationId: string },
  dependencies: { query?: Query; recordAudit: Audit }
): Promise<OrganizationMemberMutationResponse | { kind: "forbidden" | "not_found" }> => {
  const query = dependencies.query ?? defaultQuery;
  if (!(await adminCheck(input.organizationId, input.actorUserId, query))) return { kind: "forbidden" };
  const invitation = await query<InvitationSnapshot>(
    `UPDATE organization_invitations
     SET status = 'canceled', canceled_at = now(), updated_at = now()
     WHERE organization_id = $1 AND id = $2 AND status IN ('pending', 'sent', 'send_failed')
     RETURNING id, email_normalized AS "emailNormalized", display_email AS "displayEmail",
               role, status, keycloak_user_id AS "keycloakUserId", last_error AS "lastError",
               created_at AS "invitedAt", expires_at AS "expiresAt", sent_at AS "sentAt",
               accepted_at AS "acceptedAt", canceled_at AS "canceledAt"`,
    [input.organizationId, input.invitationId]
  );
  if (!invitation.rows[0]) return { kind: "not_found" };
  await dependencies.recordAudit(input.organizationId, input.actorUserId, input.actorLabel, "org.invitation.cancel", "invitation", invitation.rows[0].id, { email: invitation.rows[0].displayEmail });
  return { member: mapInvitation(invitation.rows[0]) };
};

export const removeOrganizationMember = async (
  input: { organizationId: string; actorUserId: string; actorLabel: string; membershipId: string },
  dependencies: { query?: Query; recordAudit: Audit }
): Promise<OrganizationMemberMutationResponse | { kind: "forbidden" | "not_found" | "last_admin" | "self_remove" }> => {
  const query = dependencies.query ?? defaultQuery;
  if (!(await adminCheck(input.organizationId, input.actorUserId, query))) return { kind: "forbidden" };
  const member = await query<MemberSnapshot>(
    `${membersSelect}
     WHERE m.organization_id = $1 AND m.id = $2
     LIMIT 1`,
    [input.organizationId, input.membershipId]
  );
  if (!member.rows[0]) return { kind: "not_found" };
  if (member.rows[0].userId === input.actorUserId) return { kind: "self_remove" };
  if (member.rows[0].role === "admin" && await adminCountForOrg(input.organizationId, query) <= 1) return { kind: "last_admin" };
  await query("DELETE FROM memberships WHERE organization_id = $1 AND id = $2", [input.organizationId, input.membershipId]);
  await dependencies.recordAudit(input.organizationId, input.actorUserId, input.actorLabel, "org.member.remove", "user", member.rows[0].userId, { email: member.rows[0].email, role: member.rows[0].role });
  return { member: mapMember(member.rows[0], { actorUserId: input.actorUserId, adminCount: await adminCountForOrg(input.organizationId, query) }) };
};

export const acceptPendingOrganizationInvitations = async (
  input: { userId: string; email: string; keycloakSubject: string },
  query: Query = defaultQuery
) => {
  const email = normalizeEmail(input.email);
  const invitations = await query<InvitationSnapshot & { organizationId: string }>(
    `SELECT id, organization_id::text AS "organizationId", email_normalized AS "emailNormalized",
            display_email AS "displayEmail", role, status, keycloak_user_id AS "keycloakUserId",
            last_error AS "lastError", created_at AS "invitedAt", expires_at AS "expiresAt",
            sent_at AS "sentAt", accepted_at AS "acceptedAt", canceled_at AS "canceledAt"
     FROM organization_invitations
     WHERE email_normalized = $1
       AND status IN ('pending', 'sent', 'send_failed')
       AND (expires_at IS NULL OR expires_at > now())
     ORDER BY created_at ASC`,
    [email]
  );
  for (const invitation of invitations.rows) {
    await query(
      `INSERT INTO memberships (user_id, organization_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, organization_id) DO NOTHING`,
      [input.userId, invitation.organizationId, invitation.role]
    );
    await query(
      `UPDATE organization_invitations
       SET status = 'accepted', accepted_user_id = $2, accepted_at = now(),
           keycloak_user_id = COALESCE(keycloak_user_id, $3), updated_at = now()
       WHERE id = $1`,
      [invitation.id, input.userId, input.keycloakSubject]
    );
  }
  return invitations.rows.length;
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
