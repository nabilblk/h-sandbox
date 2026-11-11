import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";
import type { Transaction } from "./db.js";
import type { AuthContext } from "./auth-context.js";
import { createApiKeyRecord } from "./services/api-keys.js";
import { readApiKeyPrincipal } from "./services/api-key-principals.js";
import { createObservabilityControlStore } from "./services/observability/control-store.js";
import type { ObservabilityLimits } from "./services/observability/control-model.js";
import { defaultApiKeyScopes } from "@harakiri/shared";

test("PostgreSQL telemetry ownership, grants, revocation, privacy and atomic limits", {
  skip: !process.env.SANDBOX_TEST_DATABASE_URL, timeout: 60_000
}, async () => {
  const schema = `telemetry_${randomUUID().replaceAll("-", "")}`;
  const connectionString = process.env.SANDBOX_TEST_DATABASE_URL;
  const adminDb = new pg.Client({ connectionString });
  await adminDb.connect();
  const pool = new pg.Pool({ connectionString, max: 12, options: `-c search_path=${schema},public` });
  const transaction: Transaction = async (action) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await action((sql, params) => client.query(sql, params));
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  };
  const limits: ObservabilityLimits = { enabled: true, allowContent: true, retentionDays: 7,
    requestsPerMinute: 3, bytesPerMinute: 8, activeRunsPerOrganization: 2, grantsPerRun: 2 };
  const store = createObservabilityControlStore({ transaction, limits });
  const organizationId = randomUUID(), otherOrganizationId = randomUUID(), userId = randomUUID(), memberId = randomUUID();
  const actor: AuthContext = { authType: "keycloak", userId, role: "admin", organizationId, actorLabel: "qualification" };
  const member: AuthContext = { ...actor, userId: memberId, role: "member" };
  const other: AuthContext = { ...actor, organizationId: otherOrganizationId };
  try {
    await adminDb.query(`CREATE SCHEMA ${schema}`);
    await adminDb.query(`SET search_path TO ${schema}, public`);
    const migrations = new URL("../../../db/migrations/", import.meta.url);
    for (const file of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
      await adminDb.query("BEGIN");
      await adminDb.query(await readFile(new URL(file, migrations), "utf8"));
      await adminDb.query("COMMIT");
    }
    await pool.query("INSERT INTO organizations(id,name,slug) VALUES ($1,'Telemetry','telemetry'),($2,'Other','other')", [organizationId, otherOrganizationId]);
    await pool.query("INSERT INTO users(id,email,full_name) VALUES ($1,'admin@test.invalid','Admin'),($2,'member@test.invalid','Member')", [userId, memberId]);
    await pool.query("INSERT INTO memberships(user_id,organization_id,role) VALUES ($1,$3,'admin'),($2,$3,'member'),($1,$4,'admin')", [userId, memberId, organizationId, otherOrganizationId]);
    await pool.query("INSERT INTO templates(id,name,description,image,icon) VALUES ('otel','test','','test:1','box')");
    await pool.query(`INSERT INTO sandboxes(id,organization_id,template_id,name,status,owner_label)
      VALUES ('sbx_a',$1,'otel','First','running','test'),('sbx_b',$2,'otel','Other','running','test')`, [organizationId, otherOrganizationId]);

    assert.equal((await store.policy(actor)).enabled, false);
    await assert.rejects(store.create(actor, { name: "Disabled", sandboxId: "sbx_a" }), { code: "organization_observability_disabled" });
    await assert.rejects(store.configure(member, { enabled: true, allowContent: false }), { code: "forbidden" });
    await store.configure(actor, { enabled: true, allowContent: true });
    await store.configure(other, { enabled: true, allowContent: false });
    const run = await store.create(member, { name: "Metadata", sandboxId: "sbx_a" });
    assert.equal(run.capture, "metadata");
    assert.equal(run.reportedOutcome, "unknown");
    assert.equal(run.recording, true);
    assert.equal(run.lastAcceptedAt, null);
    const readScope = await store.queryScope(member, run.id);
    assert.equal(readScope.organizationId, organizationId);
    assert.equal(readScope.includeContent, false);
    await assert.rejects(store.queryScope(member, run.id, true), { code: "forbidden" });
    await assert.rejects(store.queryScope(other, run.id, true), { code: "agent_run_not_found" });
    await assert.rejects(store.create(member, { name: "Sensitive", sandboxId: "sbx_a", capture: "content" }), { code: "forbidden" });
    await assert.rejects(store.get(other, run.id), { code: "agent_run_not_found" });
    await assert.rejects(store.issueGrant(actor, run.id, "sbx_b"), { code: "sandbox_not_found" });
    await assert.rejects(pool.query("INSERT INTO agent_run_sandboxes(organization_id,run_id,sandbox_id) VALUES ($1,$2,'sbx_b')", [organizationId, run.id]), /foreign key/);

    const parallel = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => store.create(actor, { name: `Concurrent ${index}`, sandboxId: "sbx_a" })));
    assert.equal(parallel.filter((result) => result.status === "fulfilled").length, 1, "Concurrent run creation cannot oversubscribe the org limit");
    assert.equal(parallel.filter((result) => result.status === "rejected" && result.reason.code === "active_agent_run_limit").length, 7);
    for (const result of parallel) if (result.status === "fulfilled") await store.close(actor, result.value.id, "succeeded");

    const firstPage = await store.list(member, { limit: 1, sandboxId: "sbx_a" });
    assert.equal(firstPage.runs.length, 1); assert.ok(firstPage.nextCursor);
    const secondPage = await store.list(member, { limit: 1, sandboxId: "sbx_a", cursor: firstPage.nextCursor });
    assert.equal(secondPage.runs.length, 1); assert.equal(secondPage.runs[0].id, run.id);
    assert.equal(secondPage.nextCursor, null);
    await assert.rejects(store.list(member, { cursor: firstPage.nextCursor }), { code: "agent_run_cursor_invalid" });
    const invalidCursor = { ...JSON.parse(Buffer.from(firstPage.nextCursor, "base64url").toString("utf8")), time: "2026-99-99T10:00:00.123456Z" };
    await assert.rejects(store.list(member, { sandboxId: "sbx_a", cursor: Buffer.from(JSON.stringify(invalidCursor)).toString("base64url") }), { code: "agent_run_cursor_invalid" });
    assert.equal((await store.list(other)).runs.length, 0);
    assert.equal((await store.list(member, { search: "%" })).runs.length, 0, "Search is a literal substring, not LIKE syntax");

    const grant = await store.issueGrant(member, run.id, "sbx_a");
    assert.match(grant.token, /^htg_[A-Za-z0-9_-]{43}$/);
    let binding = await store.authorizeGrant(grant.token);
    assert.ok(binding);
    assert.equal(binding.runId, run.id);
    assert.equal(binding.grantId, grant.id);
    await store.recordIngestion(binding);
    await store.recordIngestion(binding, "rate_limited");
    const observed = await store.get(member, run.id);
    assert.ok(observed.lastAcceptedAt); assert.ok(observed.lastRejectedAt); assert.equal(observed.lastRejection, "rate_limited");
    const stored = JSON.stringify((await pool.query("SELECT * FROM telemetry_grants")).rows);
    const audit = JSON.stringify((await pool.query("SELECT * FROM audit_events")).rows);
    assert.equal(stored.includes(grant.token), false);
    assert.equal(audit.includes(grant.token), false);
    assert.ok(audit.includes("observability.grant.issued"));

    // Avoid the fixed-window rollover while measuring concurrent admission.
    if (Date.now() % 60_000 > 58_000) await new Promise((resolve) => setTimeout(resolve, 60_100 - Date.now() % 60_000));
    const admitted = await Promise.allSettled(Array.from({ length: 8 }, () => store.admit(binding!, 4)));
    assert.equal(admitted.filter((result) => result.status === "fulfilled").length, 2);
    assert.equal(admitted.filter((result) => result.status === "rejected" && result.reason.code === "telemetry_rate_limited").length, 6);
    const budget = (await pool.query("SELECT requests,bytes FROM telemetry_ingestion_budgets WHERE organization_id=$1", [organizationId])).rows[0];
    assert.equal(budget.requests, 2); assert.equal(budget.bytes, "8");

    const extra = await store.issueGrant(actor, run.id, "sbx_a");
    await assert.rejects(store.issueGrant(actor, run.id, "sbx_a"), { code: "telemetry_grant_limit" });
    await store.revokeGrant(actor, run.id, extra.id);
    assert.equal(await store.authorizeGrant(extra.token), null);
    const closed = await store.close(actor, run.id, "failed");
    assert.equal(closed.reportedOutcome, "failed");
    assert.equal(closed.recording, false);
    assert.ok(await store.authorizeGrant(grant.token), "A bounded final flush remains valid after closing");
    await assert.rejects(store.issueGrant(actor, run.id, "sbx_a"), { code: "agent_run_not_recording" });
    await assert.rejects(store.close(actor, run.id, "succeeded"), { code: "agent_run_already_closed" });
    await pool.query("UPDATE agent_runs SET created_at=clock_timestamp()-interval '1 hour',closed_at=clock_timestamp()-interval '3 minutes' WHERE id=$1", [run.id]);
    assert.equal(await store.authorizeGrant(grant.token), null);
    assert.equal((await store.get(member, run.id)).reportedOutcome, "failed", "History is independent of grant validity");

    const sensitive = await store.create(actor, { name: "Content", sandboxId: "sbx_a", capture: "content" });
    const sensitiveGrant = await store.issueGrant(actor, sensitive.id, "sbx_a");
    assert.equal((await store.authorizeGrant(sensitiveGrant.token))?.capture, "content");
    await store.configure(actor, { enabled: true, allowContent: false });
    assert.equal((await store.authorizeGrant(sensitiveGrant.token))?.capture, "metadata", "Organization policy restricts outstanding grants immediately");
    await pool.query("UPDATE memberships SET role='member' WHERE organization_id=$1 AND user_id=$2", [organizationId, userId]);
    assert.equal(await store.authorizeGrant(sensitiveGrant.token), null, "A demoted issuer cannot retain sensitive ingestion privilege");
    await pool.query("UPDATE memberships SET role='admin' WHERE organization_id=$1 AND user_id=$2", [organizationId, userId]);
    await store.close(actor, sensitive.id, "unknown");

    const keyInput = { organizationId, actorUserId: userId, name: "Default" };
    const key = await createApiKeyRecord(keyInput, { query: (sql, params) => pool.query(sql, params) });
    const principal = (await readApiKeyPrincipal({ id: key.key.id }, (sql, params) => pool.query(sql, params)))!;
    assert.deepEqual(principal.scopes, defaultApiKeyScopes);
    await assert.rejects(store.create(principal, { name: "No implicit upgrade", sandboxId: "sbx_a" }), { code: "forbidden" });
    const explicit = await createApiKeyRecord({ ...keyInput, name: "Scoped", scopes: ["runs:write", "runs:read", "sandboxes:write"] }, { query: (sql, params) => pool.query(sql, params) });
    const keyActor = (await readApiKeyPrincipal({ id: explicit.key.id }, (sql, params) => pool.query(sql, params)))!;
    const keyRun = await store.create(keyActor, { name: "Key-owned", sandboxId: "sbx_a" });
    const keyGrant = await store.issueGrant(keyActor, keyRun.id, "sbx_a");
    assert.equal((await store.queryScope(keyActor, keyRun.id)).includeContent, false);
    await assert.rejects(store.queryScope(keyActor, keyRun.id, true), { code: "forbidden" });
    binding = await store.authorizeGrant(keyGrant.token); assert.ok(binding);
    await pool.query("UPDATE api_keys SET revoked_at=clock_timestamp() WHERE id=$1", [explicit.key.id]);
    assert.equal(await store.authorizeGrant(keyGrant.token), null);
    await assert.rejects(store.admit(binding, 0), { code: "telemetry_grant_invalid" });

    const finalGrant = await store.issueGrant(actor, keyRun.id, "sbx_a");
    await pool.query("UPDATE sandboxes SET status='terminated',updated_at=clock_timestamp()-interval '3 minutes' WHERE id='sbx_a'");
    assert.equal(await store.authorizeGrant(finalGrant.token), null);
    assert.equal((await store.get(actor, keyRun.id)).sandboxIds[0], "sbx_a");
    await pool.query("UPDATE agent_runs SET created_at=clock_timestamp()-interval '10 days',retained_until=clock_timestamp()-interval '1 day' WHERE id=$1", [keyRun.id]);
    assert.equal((await store.get(actor, keyRun.id)).expired, true);
    await assert.rejects(store.queryScope(actor, keyRun.id), { code: "agent_run_expired" });
    await store.configure(actor, { enabled: false, allowContent: false });
    assert.equal(await store.authorizeGrant(finalGrant.token), null);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM telemetry_grants WHERE organization_id=$1 AND revoked_at IS NULL", [organizationId])).rows[0].n, 0);
    const repeated = await store.create(other, { name: "Grant clock", sandboxId: "sbx_b" });
    for (let attempt = 0; attempt < 24; attempt++) {
      const issued = await store.issueGrant(other, repeated.id, "sbx_b");
      const stored = await pool.query("SELECT expires_at-created_at=interval '15 minutes' AS exact FROM telemetry_grants WHERE id=$1", [issued.id]);
      assert.equal(stored.rows[0].exact, true);
      await store.revokeGrant(other, repeated.id, issued.id);
    }
  } finally {
    await pool.end();
    await adminDb.query("ROLLBACK");
    await adminDb.query("SET search_path TO public");
    await adminDb.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await adminDb.end();
  }
});
