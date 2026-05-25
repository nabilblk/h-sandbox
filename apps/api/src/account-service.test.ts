import assert from "node:assert/strict";
import test from "node:test";
import { completeOnboarding, getCurrentAccount } from "./services/account.js";

test("getCurrentAccount reads organization and user for the authenticated identity", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const result = await getCurrentAccount(
    {
      auth: {
        organizationId: "org_account",
        userId: "user_account",
        actorLabel: "user@test.local",
        scope: "test"
      }
    },
    async (text, params) => {
      calls.push({ text, params });
      if (text.includes("FROM organizations")) {
        return {
          rowCount: 1,
          rows: [{ id: "org_account", name: "Team", slug: "team", defaultTemplateId: "python", idleTtlSeconds: 300, maxConcurrency: 5 }] as never[]
        };
      }
      if (text.includes("FROM users")) {
        return {
          rowCount: 1,
          rows: [{ id: "user_account", email: "user@test.local", fullName: "User", onboardingCompletedAt: null }] as never[]
        };
      }
      throw new Error(`unexpected query: ${text}`);
    }
  );

  assert.deepEqual(calls.map((call) => call.params), [["org_account"], ["user_account"]]);
  assert.equal(result.auth.scope, "test");
  assert.equal(result.organization.name, "Team");
  assert.equal(result.user.email, "user@test.local");
});

test("completeOnboarding marks the user once and records an audit event", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const audits: Array<{ action: string; targetId?: string }> = [];
  const result = await completeOnboarding(
    {
      organizationId: "org_account",
      userId: "user_account",
      actorLabel: "user@test.local"
    },
    {
      recordAudit: async (_organizationId, _userId, _actorLabel, action, _targetType, targetId) => {
        audits.push({ action, targetId });
      },
      query: async (text, params) => {
        calls.push({ text, params });
        return {
          rowCount: 1,
          rows: [{ id: "user_account", email: "user@test.local", fullName: "User", onboardingCompletedAt: "2026-05-24T00:00:00.000Z" }] as never[]
        };
      }
    }
  );

  assert.match(calls[0].text, /COALESCE\(onboarding_completed_at, now\(\)\)/);
  assert.deepEqual(calls[0].params, ["user_account"]);
  assert.equal(result.onboardingCompletedAt, "2026-05-24T00:00:00.000Z");
  assert.deepEqual(audits[0], { action: "onboarding.complete", targetId: "user_account" });
});
