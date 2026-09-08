import assert from "node:assert/strict";
import test from "node:test";
import { defaultApiKeyScopes } from "@harakiri/shared";
import { createApiKeyRecord, listApiKeys, revokeApiKey } from "./services/api-keys.js";
import type { Query } from "./services/query.js";

const actor = { organizationId: "org_keys", actorUserId: "member" };
const key = { id: "key_1", name: "ci", prefix: "hk_live_abc", lastFour: "wxyz",
  createdAt: new Date(), lastUsedAt: null, revokedAt: null, scopes: ["sandboxes:read"],
  expiresAt: new Date(Date.now() + 86400_000), createdByUserId: "member", legacy: false };
const fixture = (role = "member", rowCount = 1) => {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const query: Query = async (sql, params) => {
    if (sql.includes("SELECT role FROM memberships")) return { rows: [{ role }] as never[], rowCount: 1 };
    calls.push({ sql, params }); return { rows: [key] as never[], rowCount };
  };
  return { query, calls };
};

test("members list only owned keys; admins list organization keys with safe metadata", async () => {
  for (const role of ["member", "admin"]) {
    const f = fixture(role);
    const keys = await listApiKeys(actor, f.query);
    assert.deepEqual(f.calls[0].params, [actor.organizationId, role === "admin", actor.actorUserId]);
    assert.match(f.calls[0].sql, /created_by_user_id = \$3/);
    assert.deepEqual(keys[0].scopes, ["sandboxes:read"]);
    assert.equal(keys[0].legacy, false);
    assert.equal(keys[0].createdByUserId, "member");
    assert.equal(keys[0].expiresAt, key.expiresAt.toISOString());
    assert.ok(!f.calls[0].sql.includes("key_hash"));
  }
});

test("creation stores only hash, current creator, bounded scopes and default expiry", async () => {
  const f = fixture();
  const result = await createApiKeyRecord({ ...actor, name: " ci " }, { ...f,
    keyFactory: () => ({ token: "hk_once", hash: "hash", prefix: "hk_on", lastFour: "once" }) });
  const p = f.calls[0].params!;
  assert.deepEqual(p.slice(0, 7), [actor.organizationId, "ci", "hash", "hk_on", "once", actor.actorUserId, defaultApiKeyScopes]);
  assert.ok(Math.abs(Date.parse(String(p[7])) - Date.now() - 90 * 86400_000) < 1000);
  assert.equal(result.token, "hk_once");
  assert.ok(!JSON.stringify(f.calls).includes("hk_once"));
  assert.match(f.calls[0].sql, /false/);
});

test("only admins can grant sensitive scopes; neither role can grant unknown scopes", async () => {
  for (const scopes of [["credentials:manage"], ["audit:read"], ["registry:manage"], ["org:write"], []]) {
    const f = fixture();
    await assert.rejects(createApiKeyRecord({ ...actor, name: "ci", scopes }, f), /exceed your permissions/);
    assert.equal(f.calls.length, 0);
  }
  await createApiKeyRecord({ ...actor, name: "vault", scopes: ["credentials:manage"] }, fixture("admin"));
  await assert.rejects(createApiKeyRecord({ ...actor, name: "ci", scopes: ["unknown"] }, fixture("admin")), /permissions/);
});

test("invalid names and expired or excessive lifetimes never insert a key", async () => {
  for (const expiresAt of ["invalid", new Date(0).toISOString(), new Date(Date.now() + 366 * 86400_000).toISOString()]) {
    const f = fixture();
    await assert.rejects(createApiKeyRecord({ ...actor, name: "ci", expiresAt }, f), /expiry/);
    assert.equal(f.calls.length, 0);
  }
  await assert.rejects(createApiKeyRecord({ ...actor, name: " " }, fixture()), /name/);
});

test("revocation is owner-and-org scoped; foreign keys report not found", async () => {
  for (const role of ["admin", "member"]) {
    const f = fixture(role, 0);
    assert.equal(await revokeApiKey({ ...actor, apiKeyId: "other-key" }, f.query), false);
    assert.deepEqual(f.calls[0].params, ["other-key", actor.organizationId, role === "admin", actor.actorUserId]);
    assert.match(f.calls[0].sql, /created_by_user_id = \$4/);
  }
  await assert.rejects(listApiKeys({ ...actor, actorUserId: null }, fixture().query), /current organization member/);
  await assert.rejects(createApiKeyRecord({ ...actor, name: "ci" }, fixture("removed")), /current organization member/);
});
