import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptPendingOrganizationInvitations,
  addOrganizationMember,
  completeOnboarding,
  getCurrentAccount,
  listOrganizationMembers
} from "./services/account.js";
import type { Query } from "./services/query.js";

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
      if (text.includes("SELECT role FROM memberships")) {
        return { rowCount: 1, rows: [{ role: "member" }] as never[] };
      }
      throw new Error(`unexpected query: ${text}`);
    }
  );

  assert.deepEqual(calls.map((call) => call.params), [["org_account"], ["user_account"], ["org_account", "user_account"]]);
  assert.equal(result.auth.scope, "test");
  assert.equal(result.organization.name, "Team");
  assert.equal(result.user.email, "user@test.local");
  assert.equal(result.role, "member");
  assert.equal(result.capabilities.canManageMembers, false);
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

test("listOrganizationMembers returns active members and invitations for org admins", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const members = await listOrganizationMembers({ organizationId: "org_account", actorUserId: "user_admin" }, async (text, params) => {
    calls.push({ text, params });
    if (text.includes("SELECT role FROM memberships")) {
      return { rowCount: 1, rows: [{ role: "admin" }] as never[] };
    }
    if (text.includes("count(*)")) {
      return { rowCount: 1, rows: [{ count: "1" }] as never[] };
    }
    if (text.includes("FROM organization_invitations")) {
      return {
        rowCount: 1,
        rows: [{
          id: "inv_1",
          emailNormalized: "invited@test.local",
          displayEmail: "invited@test.local",
          role: "member",
          status: "sent",
          keycloakUserId: "kc-invited",
          lastError: null,
          invitedAt: "2026-05-25T00:00:00.000Z",
          expiresAt: "2026-12-01T00:00:00.000Z",
          sentAt: "2026-05-25T00:01:00.000Z",
          acceptedAt: null,
          canceledAt: null
        }] as never[]
      };
    }
    return {
      rowCount: 1,
      rows: [
        { id: "mem_admin", userId: "user_admin", email: "admin@test.local", fullName: "Admin", role: "admin", keycloakSubject: "kc-admin", joinedAt: "2026-05-24T00:00:00.000Z" }
      ] as never[]
    };
  });

  assert.ok(Array.isArray(members));
  assert.deepEqual(calls[0].params, ["org_account", "user_admin"]);
  assert.equal(members[0].status, "active");
  assert.equal(members[1].kind, "invitation");
  assert.equal(members[1].status, "sent");
});

test("addOrganizationMember creates an invitation and marks delivery failure when Keycloak admin is unavailable", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const audits: string[] = [];
  const query: Query = async (text, params) => {
    calls.push({ text, params });
    if (text.includes("SELECT role FROM memberships")) {
      return { rowCount: 1, rows: [{ role: "admin" }] as never[] };
    }
    if (text.includes("lower(u.email)")) {
      return { rowCount: 0, rows: [] };
    }
    if (text.includes("FROM organization_invitations")) {
      return { rowCount: 0, rows: [] };
    }
    if (text.includes("INSERT INTO organization_invitations")) {
      return {
        rowCount: 1,
        rows: [{
          id: "inv_new",
          emailNormalized: "new.member@test.local",
          displayEmail: "new.member@test.local",
          role: "member",
          status: "pending",
          keycloakUserId: null,
          lastError: null,
          invitedAt: "2026-05-25T00:00:00.000Z",
          expiresAt: "2026-12-01T00:00:00.000Z",
          sentAt: null,
          acceptedAt: null,
          canceledAt: null
        }] as never[]
      };
    }
    if (text.includes("UPDATE organization_invitations")) {
      return {
        rowCount: 1,
        rows: [{
          id: "inv_new",
          emailNormalized: "new.member@test.local",
          displayEmail: "new.member@test.local",
          role: "member",
          status: "send_failed",
          keycloakUserId: null,
          lastError: "Keycloak admin integration is not configured",
          invitedAt: "2026-05-25T00:00:00.000Z",
          expiresAt: "2026-12-01T00:00:00.000Z",
          sentAt: null,
          acceptedAt: null,
          canceledAt: null
        }] as never[]
      };
    }
    throw new Error(`unexpected query: ${text}`);
  };
  const result = await addOrganizationMember(
    { organizationId: "org_account", actorUserId: "user_admin", actorLabel: "admin@test.local", email: " New.Member@Test.Local " },
    {
      query,
      recordAudit: async (_organizationId, _actorUserId, _actorLabel, action) => {
        audits.push(action);
      }
    }
  );

  assert.deepEqual(calls[0].params, ["org_account", "user_admin"]);
  assert.equal(calls.find((call) => call.text.includes("INSERT INTO organization_invitations"))?.params?.[1], "new.member@test.local");
  assert.equal("created" in result && result.created, true);
  assert.equal("member" in result && result.member.kind, "invitation");
  assert.equal("member" in result && result.member.status, "send_failed");
  assert.deepEqual(audits, ["org.invitation.create", "org.invitation.send_failed"]);
});

test("addOrganizationMember rejects non-admin actors", async () => {
  const result = await addOrganizationMember(
    { organizationId: "org_account", actorUserId: "user_member", actorLabel: "member@test.local", email: "peer@test.local" },
    {
      query: async () => ({ rowCount: 1, rows: [{ role: "member" }] as never[] }),
      recordAudit: async () => undefined
    }
  );

  assert.deepEqual(result, { kind: "forbidden" });
});

test("acceptPendingOrganizationInvitations converts matching pending invitations into memberships", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const accepted = await acceptPendingOrganizationInvitations(
    { userId: "user_invited", email: "INVITED@Test.Local", keycloakSubject: "kc-invited" },
    async (text, params) => {
      calls.push({ text, params });
      if (text.includes("FROM organization_invitations")) {
        return {
          rowCount: 1,
          rows: [{
            id: "inv_1",
            organizationId: "org_account",
            emailNormalized: "invited@test.local",
            displayEmail: "invited@test.local",
            role: "member",
            status: "sent",
            keycloakUserId: "kc-invited",
            lastError: null,
            invitedAt: "2026-05-25T00:00:00.000Z",
            expiresAt: "2026-06-01T00:00:00.000Z",
            sentAt: "2026-05-25T00:01:00.000Z",
            acceptedAt: null,
            canceledAt: null
          }] as never[]
        };
      }
      return { rowCount: 1, rows: [] };
    }
  );

  assert.equal(accepted, 1);
  assert.deepEqual(calls[0].params, ["invited@test.local"]);
  assert.match(calls[1].text, /INSERT INTO memberships/);
  assert.deepEqual(calls[1].params, ["user_invited", "org_account", "member"]);
  assert.match(calls[2].text, /status = 'accepted'/);
});
