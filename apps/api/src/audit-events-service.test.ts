import assert from "node:assert/strict";
import test from "node:test";
import type { Query } from "./services/query.js";
import { listAuditEvents } from "./services/audit-events.js";

test("listAuditEvents scopes, filters, paginates, and redacts organization audit data", async () => {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const query: Query = async (text, params = []) => {
    calls.push({ text, params });
    if (text.includes("SELECT role FROM memberships")) {
      return { rows: [{ role: "admin" }] as never[] };
    }
    if (text.includes("COUNT(*)::text AS total")) {
      return { rows: [{ total: "7" }] as never[] };
    }
    if (text.includes("FROM audit_events")) {
      return {
        rows: [{
          id: "audit_1",
          actorUserId: "user_1",
          actorLabel: "admin@example.com",
          action: "credential_secret.rotated",
          targetType: "credential_secret",
          targetId: "vlt_1",
          metadata: {
            version: 2,
            apiKey: "must-not-leak",
            detail: "authorization=Bearer also-secret"
          },
          createdAt: new Date("2026-09-04T10:00:00.000Z")
        }] as never[]
      };
    }
    throw new Error(`unexpected query: ${text}`);
  };

  const result = await listAuditEvents({
    organizationId: "org_1",
    actorUserId: "user_1",
    filters: {
      targetType: "credential_secret",
      targetId: "vlt_1",
      actionPrefix: "credential_secret.",
      limit: 25,
      offset: 50
    }
  }, query);

  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  assert.deepEqual(result.page, { total: 7, limit: 25, offset: 50 });
  assert.equal(result.events[0]?.metadata.apiKey, "[redacted]");
  assert.match(String(result.events[0]?.metadata.detail), /\[redacted\]/);
  assert.doesNotMatch(String(result.events[0]?.metadata.detail), /also-secret/);
  assert.equal(result.events[0]?.createdAt, "2026-09-04T10:00:00.000Z");
  assert.deepEqual(calls[1]?.params, ["org_1", "credential_secret", "vlt_1", "credential_secret."]);
  assert.deepEqual(calls[2]?.params, ["org_1", "credential_secret", "vlt_1", "credential_secret.", 25, 50]);
  assert.match(calls[2]?.text ?? "", /organization_id = \$1/);
});

test("listAuditEvents preserves totals for an empty page", async () => {
  const query: Query = async (text) => {
    if (text.includes("SELECT role FROM memberships")) return { rows: [{ role: "admin" }] as never[] };
    if (text.includes("COUNT(*)::text AS total")) return { rows: [{ total: "3" }] as never[] };
    if (text.includes("FROM audit_events")) return { rows: [] };
    throw new Error(`unexpected query: ${text}`);
  };

  const result = await listAuditEvents({
    organizationId: "org_1",
    actorUserId: "user_1",
    filters: { limit: 25, offset: 100 }
  }, query);

  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.page, { total: 3, limit: 25, offset: 100 });
});

test("listAuditEvents rejects non-admin users before reading audit records", async () => {
  let queryCount = 0;
  const query: Query = async (text) => {
    queryCount += 1;
    assert.match(text, /SELECT role FROM memberships/);
    return { rows: [{ role: "member" }] as never[] };
  };

  const result = await listAuditEvents({
    organizationId: "org_1",
    actorUserId: "user_2",
    filters: { limit: 50, offset: 0 }
  }, query);

  assert.deepEqual(result, { kind: "forbidden" });
  assert.equal(queryCount, 1);
});
