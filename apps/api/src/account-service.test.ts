import assert from "node:assert/strict";
import test from "node:test";
import { addOrganizationMember, completeOnboarding, getCurrentAccount, listOrganizationMembers } from "./services/account.js";

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

test("listOrganizationMembers returns active and pending members for one organization", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const members = await listOrganizationMembers({ organizationId: "org_account" }, async (text, params) => {
    calls.push({ text, params });
    return {
      rowCount: 2,
      rows: [
        { id: "mem_admin", userId: "user_admin", email: "admin@test.local", fullName: "Admin", role: "admin", keycloakSubject: "kc-admin", joinedAt: "2026-05-24T00:00:00.000Z" },
        { id: "mem_invited", userId: "user_invited", email: "invited@test.local", fullName: "Invited", role: "member", keycloakSubject: null, joinedAt: "2026-05-25T00:00:00.000Z" }
      ] as never[]
    };
  });

  assert.match(calls[0].text, /FROM memberships/);
  assert.deepEqual(calls[0].params, ["org_account"]);
  assert.equal(members[0].status, "active");
  assert.equal(members[1].status, "pending");
});

test("addOrganizationMember creates a placeholder user and member membership by email", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const result = await addOrganizationMember(
    { organizationId: "org_account", actorUserId: "user_admin", email: " New.Member@Test.Local " },
    async (text, params) => {
      calls.push({ text, params });
      if (text.includes("SELECT role FROM memberships")) {
        return { rowCount: 1, rows: [{ role: "admin" }] as never[] };
      }
      if (text.includes("INSERT INTO users")) {
        return { rowCount: 1, rows: [{ id: "user_new" }] as never[] };
      }
      if (text.includes("INSERT INTO memberships")) {
        return { rowCount: 1, rows: [{ id: "mem_new" }] as never[] };
      }
      if (text.includes("JOIN users")) {
        return {
          rowCount: 1,
          rows: [{ id: "mem_new", userId: "user_new", email: "new.member@test.local", fullName: "New Member", role: "member", keycloakSubject: null, joinedAt: "2026-05-25T00:00:00.000Z" }] as never[]
        };
      }
      throw new Error(`unexpected query: ${text}`);
    }
  );

  assert.deepEqual(calls[0].params, ["org_account", "user_admin"]);
  assert.equal(calls[1].params?.[0], "new.member@test.local");
  assert.equal(calls[1].params?.[1], "New Member");
  assert.equal("created" in result && result.created, true);
  assert.equal("member" in result && result.member.status, "pending");
});

test("addOrganizationMember rejects non-admin actors", async () => {
  const result = await addOrganizationMember(
    { organizationId: "org_account", actorUserId: "user_member", email: "peer@test.local" },
    async () => ({ rowCount: 1, rows: [{ role: "member" }] as never[] })
  );

  assert.deepEqual(result, { kind: "forbidden" });
});
