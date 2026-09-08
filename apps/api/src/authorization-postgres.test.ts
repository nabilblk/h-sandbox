import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";
import Fastify from "fastify";
import type { JWTPayload } from "jose";
import { apiKeyScopes, defaultApiKeyScopes } from "@harakiri/shared";
import { createAuthHandler } from "./auth.js";
import { createApiKeyRecord, listApiKeys, revokeApiKey } from "./services/api-keys.js";
import { readApiKeyPrincipal } from "./services/api-key-principals.js";
import { createTerminalAttachTicket, consumeTerminalAttachTicket } from "./services/terminal-attach-tickets.js";
import { registerRoutes } from "./routes.js";
import { recordAuditEvent } from "./audit.js";
import type { Query } from "./services/query.js";

test("PostgreSQL authorization migration, tenant isolation, ownership and ticket revocation", {
  skip: !process.env.SANDBOX_TEST_DATABASE_URL, timeout: 30_000
}, async () => {
  const client = new pg.Client({ connectionString: process.env.SANDBOX_TEST_DATABASE_URL });
  await client.connect();
  const schema = `authorization_${randomUUID().replaceAll("-", "")}`;
  const query: Query = (sql, params) => client.query(sql, params);
  const org = randomUUID(), otherOrg = randomUUID(), admin = randomUUID(), member = randomUUID();
  const adminActor = { organizationId: org, actorUserId: admin };
  const memberActor = { organizationId: org, actorUserId: member };
  const migrations = new URL("../../../db/migrations/", import.meta.url);
  const app = Fastify();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}, public`);
    const files = (await readdir(migrations)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files.filter((f) => f < "037_")) await client.query(await readFile(new URL(file, migrations), "utf8"));
    await query("INSERT INTO organizations(id,name,slug) VALUES ($1,'test','test'), ($2,'other','other')", [org, otherOrg]);
    await query("INSERT INTO users(id,email,full_name,keycloak_subject) VALUES ($1,'admin@test.local','Admin','admin-sub'), ($2,'member@test.local','Member','member-sub')", [admin, member]);
    await query("INSERT INTO memberships(user_id,organization_id,role) VALUES ($1,$3,'admin'), ($2,$3,'member')", [admin, member, org]);
    await query("INSERT INTO api_keys(organization_id,name,key_hash,prefix,last_four) VALUES ($1,'legacy','old-hash','hk_old','last')", [org]);
    for (const file of files.filter((f) => f >= "037_")) await client.query(await readFile(new URL(file, migrations), "utf8"));

    const legacy = await readApiKeyPrincipal({ hash: "old-hash" }, query);
    assert.equal(legacy?.userId, null);
    assert.deepEqual(legacy?.scopes, defaultApiKeyScopes);
    assert.equal(legacy?.expiresAt, null);
    assert.equal((await listApiKeys(memberActor, query)).length, 0);

    const owned = await createApiKeyRecord({ ...memberActor, name: "owned", scopes: ["sandboxes:read"] }, { query });
    const automation = await createApiKeyRecord({ ...adminActor, name: "automation", scopes: [...apiKeyScopes] }, { query });
    assert.equal((await listApiKeys(memberActor, query)).length, 1);
    assert.equal((await listApiKeys(adminActor, query)).length, 3);
    assert.equal(await revokeApiKey({ ...memberActor, apiKeyId: automation.key.id }, query), false);
    assert.equal(await readApiKeyPrincipal({ id: owned.key.id, organizationId: otherOrg }, query), null);
    await assert.rejects(createApiKeyRecord({ ...memberActor, name: "escalation", scopes: ["credentials:manage"] }, { query }), /permissions/);
    await assert.rejects(query("UPDATE api_keys SET scopes = ARRAY['invalid'] WHERE id = $1", [owned.key.id]), /api_keys_scopes_valid/);

    // Signature validation is covered with real signed JWTs in authorization.test.
    // These claims exercise identity binding against actual PostgreSQL constraints.
    const claims: Record<string, JWTPayload> = {
      admin: { sub: "admin-sub", email: "admin@test.local", email_verified: true },
      member: { sub: "member-sub", email: "member@test.local", email_verified: true },
      impersonator: { sub: "different-subject", email: "admin@test.local", email_verified: true },
      unverified: { sub: "different-subject", email: "admin@test.local", email_verified: false },
      pending: { sub: "pending-sub", email: "pending@test.local", email_verified: false }
    };
    const verify = async (token: string) => {
      if (!claims[token]) throw new Error("unknown token");
      return { ...claims[token], exp: Math.floor(Date.now() / 1000) + 600 };
    };
    await registerRoutes(app, { query, requireAuth: createAuthHandler({ query, verify, devAllowed: () => false }), recordAudit: async () => undefined });
    const identityHeaders = (token: string) => ({ authorization: `Bearer ${token}` });
    for (const token of ["impersonator", "unverified"]) {
      assert.equal((await app.inject({ url: "/v1/me", headers: identityHeaders(token) })).statusCode, 401);
    }
    assert.equal((await query("SELECT keycloak_subject FROM users WHERE id=$1", [admin])).rows[0].keycloak_subject, "admin-sub");
    assert.equal((await app.inject({ url: "/v1/me", headers: identityHeaders("admin") })).statusCode, 200);
    assert.equal((await app.inject({ method: "PATCH", url: "/v1/org/settings", headers: identityHeaders("member"), payload: { name: "forbidden" } })).statusCode, 403);
    assert.equal((await app.inject({ method: "PATCH", url: "/v1/org/settings", headers: identityHeaders("admin"), payload: { name: "Allowed" } })).statusCode, 200);
    const pendingUser = randomUUID();
    await query("INSERT INTO users(id,email,full_name) VALUES ($1,'pending@test.local','Pending')", [pendingUser]);
    await query("INSERT INTO memberships(user_id,organization_id,role) VALUES ($1,$2,'member')", [pendingUser, org]);
    assert.equal((await app.inject({ url: "/v1/me", headers: identityHeaders("pending") })).statusCode, 401);
    assert.equal((await query("SELECT keycloak_subject FROM users WHERE id=$1", [pendingUser])).rows[0].keycloak_subject, null);
    claims.pending.email_verified = true;
    assert.equal((await app.inject({ url: "/v1/me", headers: identityHeaders("pending") })).statusCode, 200);
    assert.equal((await query("SELECT keycloak_subject FROM users WHERE id=$1", [pendingUser])).rows[0].keycloak_subject, "pending-sub");
    for (const token of [owned.token, automation.token]) {
      const headers = { "x-api-key": token };
      assert.equal((await app.inject({ method: "POST", url: "/v1/api-keys", headers, payload: { name: "escalation" } })).statusCode, 403);
      assert.equal((await app.inject({ method: "PATCH", url: "/v1/org/settings", headers, payload: { name: "unsafe" } })).statusCode, 403);
      assert.equal((await app.inject({ url: "/v1/org/members", headers })).statusCode, 403);
      assert.equal((await app.inject({ url: "/v1/me", headers })).statusCode, 403);
    }
    assert.equal((await app.inject({ url: "/v1/sandboxes", headers: { "x-api-key": owned.token } })).statusCode, 200);
    assert.equal((await app.inject({ method: "POST", url: "/v1/sandboxes", headers: { "x-api-key": owned.token }, payload: {} })).statusCode, 403);

    const principal = (await readApiKeyPrincipal({ id: automation.key.id }, query))!;
    await recordAuditEvent({
      organizationId: org, actorUserId: principal.userId, actorLabel: principal.actorLabel,
      action: "authorization.test", targetType: "api_key", targetId: automation.key.id
    }, { query });
    const audit = (await query("SELECT actor_user_id, actor_label FROM audit_events WHERE action='authorization.test'")).rows[0];
    assert.equal(audit.actor_user_id, null);
    assert.equal(audit.actor_label, `api-key:${automation.key.id}`);
    await query("INSERT INTO templates(id,name,description,image,icon) VALUES ('auth-template','Test','','test:1','box')");
    await query("INSERT INTO sandboxes(id,organization_id,template_id,name,status,owner_label) VALUES ('sbx_auth',$1,'auth-template','test','running',$2)", [org, principal.actorLabel]);
    const ticket = await createTerminalAttachTicket({ sandboxId: "sbx_auth", auth: principal }, { query });
    assert.equal(ticket.kind, "ok");
    if (ticket.kind !== "ok") throw new Error("ticket missing");
    assert.equal((await consumeTerminalAttachTicket({ sandboxId: "other", ticket: ticket.ticket }, { query })).kind, "invalid");
    assert.equal((await consumeTerminalAttachTicket({ sandboxId: "sbx_auth", ticket: ticket.ticket }, { query })).kind, "ok");
    assert.equal((await consumeTerminalAttachTicket({ sandboxId: "sbx_auth", ticket: ticket.ticket }, { query })).kind, "invalid");
    const pending = await createTerminalAttachTicket({ sandboxId: "sbx_auth", auth: principal }, { query });
    assert.equal(pending.kind, "ok");
    await revokeApiKey({ ...adminActor, apiKeyId: automation.key.id }, query);
    if (pending.kind === "ok") assert.equal((await consumeTerminalAttachTicket({ sandboxId: "sbx_auth", ticket: pending.ticket }, { query })).kind, "invalid");
    assert.equal((await app.inject({ url: "/v1/sandboxes", headers: { "x-api-key": automation.token } })).statusCode, 401);

    const ceiling = await createApiKeyRecord({ ...adminActor, name: "ceiling", scopes: [...apiKeyScopes] }, { query });
    await query("UPDATE memberships SET role='member' WHERE user_id=$1 AND organization_id=$2", [admin, org]);
    assert.deepEqual((await readApiKeyPrincipal({ id: ceiling.key.id }, query))?.scopes, defaultApiKeyScopes);
    await query("DELETE FROM memberships WHERE user_id=$1 AND organization_id=$2", [admin, org]);
    assert.equal(await readApiKeyPrincipal({ id: ceiling.key.id }, query), null);
    await query("UPDATE api_keys SET expires_at=now()-interval '1 second' WHERE id=$1", [owned.key.id]);
    assert.equal(await readApiKeyPrincipal({ id: owned.key.id }, query), null);
  } finally {
    await app.close();
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
