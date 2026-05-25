import type { CompleteOnboardingResponse, CurrentAccountResponse } from "@harakiri/shared";
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
