import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";
import type { Query } from "./services/query.js";
import type { Transaction } from "./db.js";
import { CapacityError, lockOrganizationCapacity, readOrganizationCapacity, releaseSandboxCapacity, reserveSandboxCapacity } from "./services/organization-capacity.js";
import { enqueueSandboxOperation } from "./services/sandbox-operations.js";
import { updateOrganizationSettings } from "./services/org-settings.js";
import { createSandbox } from "./services/sandboxes.js";
import { executeSandboxOperation } from "./services/sandbox-operation-worker.js";
import { claimSandboxOperationById } from "./services/sandbox-operations.js";
import { InMemoryRuntimeProvider } from "./providers/runtime/dev-provider.js";
import type { RuntimeTemplate } from "./templates.js";
import { pauseSandbox, resumeSandbox } from "./services/sandbox-lifecycle.js";
import { requestSandboxTermination } from "./services/sandbox-termination.js";
import { reconcileSandboxLease, renewSandboxLease } from "./services/sandbox-lease.js";
import { reconcileSandboxCapacity } from "./services/sandbox-capacity-reconciler.js";
import { reconcileCapacityInventory } from "./services/capacity-inventory.js";
import { config } from "./config.js";

const databaseUrl = process.env.SANDBOX_TEST_DATABASE_URL;
if (process.env.CAPACITY_TEST_REQUIRED === "1" && !databaseUrl) throw new Error("Capacity acceptance requires SANDBOX_TEST_DATABASE_URL pointing to a disposable PostgreSQL database");

test("PostgreSQL capacity admission serializes multiple connections and fails closed", { skip: !databaseUrl, timeout: 60_000 }, async (t) => {
  const admin = new pg.Client({ connectionString: databaseUrl });
  await admin.connect();
  const schema = `capacity_${randomUUID().replaceAll("-", "")}`;
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 20, options: `-c search_path=${schema},public` });
  const query: Query = (sql, params) => pool.query(sql, params);
  const transaction: Transaction = async (work) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work((sql, params) => client.query(sql, params));
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  };
  const org = async (limit = 1) => {
    const id = randomUUID();
    await query("INSERT INTO organizations(id,name,slug,max_concurrency) VALUES ($1::uuid,'Capacity test',$1::text,$2)", [id, limit]);
    return id;
  };
  const admit = (organizationId: string, key = randomUUID(), fail = false, workspaceId?: string) => transaction(async (q) => {
    await lockOrganizationCapacity(organizationId, q);
    const existing = await q<{ sandbox_id: string }>("SELECT sandbox_id FROM sandbox_operations WHERE organization_id=$1 AND kind='provision' AND idempotency_key=$2", [organizationId, key]);
    if (existing.rows[0]) return { sandboxId: existing.rows[0].sandbox_id, reused: true };
    const sandboxId = `sbx_${randomUUID()}`;
    await q("INSERT INTO sandboxes(id,organization_id,template_id,name,status,owner_label,workspace_id) VALUES ($1,$2,'capacity-template','test','pending','test',$3)", [sandboxId, organizationId, workspaceId ?? null]);
    const { operation } = await enqueueSandboxOperation({ organizationId, sandboxId, kind: "provision", idempotencyKey: key }, { query: q });
    const hold = await reserveSandboxCapacity({ organizationId, sandboxId, operationId: operation.id }, q);
    if (fail) throw new Error("injected rollback after reservation");
    return { sandboxId, hold, operation, reused: false };
  });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`SET search_path TO ${schema}, public`);
    const migrations = new URL("../../../db/migrations/", import.meta.url);
    const files = (await readdir(migrations)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files.filter((f) => f < "038_")) await admin.query(await readFile(new URL(file, migrations), "utf8"));
    const legacy = randomUUID();
    await admin.query("INSERT INTO organizations(id,name,slug) VALUES ($1,'legacy','legacy')", [legacy]);
    await admin.query("INSERT INTO templates(id,name,description,image,icon) VALUES ('capacity-template','Test','','test:1','box')");
    await admin.query("INSERT INTO sandboxes(id,organization_id,template_id,name,status,owner_label) VALUES ('sbx_legacy',$1,'capacity-template','legacy','terminated','test')", [legacy]);
    for (const file of files.filter((f) => f >= "038_")) await admin.query(await readFile(new URL(file, migrations), "utf8"));

    await t.test("legacy terminal records require inventory; fresh organizations do not", async () => {
      const capacity = await readOrganizationCapacity(legacy, query);
      assert.equal(capacity.state, "reconciling");
      assert.equal(capacity.inUse, null);
      await assert.rejects(admit(legacy), (e: unknown) => e instanceof CapacityError && e.code === "organization_capacity_unavailable");
      assert.equal((await readOrganizationCapacity(await org(), query)).available, 1);
    });

    for (const limit of [1, 7]) await t.test(`100 simultaneous requests against limit ${limit}`, async () => {
      const organizationId = await org(limit);
      let dispatches = 0;
      const outcomes = await Promise.allSettled(Array.from({ length: 100 }, async () => {
        const accepted = await admit(organizationId);
        dispatches += 1; // A provider would only be called after this commit.
        return accepted;
      }));
      assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, limit);
      assert.equal(dispatches, limit);
      for (const result of outcomes) if (result.status === "rejected") {
        assert.ok(result.reason instanceof CapacityError);
        assert.equal(result.reason.code, "organization_capacity_exceeded");
      }
      const capacity = await readOrganizationCapacity(organizationId, query);
      assert.equal(capacity.inUse, limit);
      assert.equal(capacity.available, 0);
      assert.equal((await query("SELECT id FROM sandboxes WHERE organization_id=$1", [organizationId])).rows.length, limit);
      assert.equal((await query("SELECT id FROM sandbox_operations WHERE organization_id=$1", [organizationId])).rows.length, limit);
    });

    await t.test("duplicate intents reuse an occupied slot; another tenant remains independent", async () => {
      const organizationId = await org();
      const key = randomUUID();
      const results = await Promise.all(Array.from({ length: 100 }, () => admit(organizationId, key)));
      assert.equal(new Set(results.map((r) => r.sandboxId)).size, 1);
      assert.equal(results.filter((r) => !r.reused).length, 1);
      assert.equal((await admit(await org())).reused, false);
    });

    await t.test("rollback leaves no sandbox, operation or hold", async () => {
      const organizationId = await org();
      await assert.rejects(admit(organizationId, randomUUID(), true), /injected rollback/);
      assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 0);
      for (const table of ["sandboxes", "sandbox_operations", "sandbox_capacity_reservations"]) {
        assert.equal((await query(`SELECT * FROM ${table} WHERE organization_id=$1`, [organizationId])).rows.length, 0);
      }
      await admit(organizationId);
    });

    await t.test("unsettled effects prevent release and an old generation cannot free a new one", async () => {
      const organizationId = await org();
      const admitted = await admit(organizationId);
      const { sandboxId, hold, operation } = admitted;
      assert.ok(hold && operation);
      const effectId = randomUUID();
      await query("INSERT INTO sandbox_runtime_effects(id,organization_id,sandbox_id,generation,operation_id,kind,dispatched_at) VALUES ($1,$2,$3,1,$4,'provision',now())", [effectId, organizationId, sandboxId, operation.id]);
      const release = () => transaction((q) => releaseSandboxCapacity({ organizationId, sandboxId, generation: 1, reason: "provider_absent" }, q));
      assert.equal(await release(), false);
      assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 1);
      await query("UPDATE sandbox_runtime_effects SET settled_at=now() WHERE id=$1", [effectId]);
      assert.equal(await release(), true);
      assert.equal(await release(), false);
      const next = await transaction(async (q) => {
        await lockOrganizationCapacity(organizationId, q);
        const resumed = await enqueueSandboxOperation({ organizationId, sandboxId, kind: "resume" }, { query: q });
        return reserveSandboxCapacity({ organizationId, sandboxId, operationId: resumed.operation.id }, q);
      });
      assert.equal(next.generation, 2);
      assert.equal(await release(), false);
      assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 1);
      await assert.rejects(query("DELETE FROM sandboxes WHERE id=$1", [sandboxId]), /foreign key/);
    });

    await t.test("lowered limits grandfather current work without permitting more", async () => {
      const organizationId = await org(2);
      await admit(organizationId); await admit(organizationId);
      await query("UPDATE organizations SET max_concurrency=1 WHERE id=$1", [organizationId]);
      assert.equal((await readOrganizationCapacity(organizationId, query)).overLimit, 1);
      await assert.rejects(admit(organizationId), (e: unknown) => e instanceof CapacityError && e.code === "organization_capacity_exceeded");
      await query("UPDATE organizations SET max_concurrency=3 WHERE id=$1", [organizationId]);
      await admit(organizationId);
    });

    await t.test("capacity revision prevents stale editors and unrelated writes preserve the limit", async () => {
      const organizationId = await org(5);
      const changes = await Promise.allSettled([2, 3].map((maxConcurrency) => updateOrganizationSettings({ organizationId, patch: { maxConcurrency, expectedCapacityRevision: 1 } }, query)));
      assert.equal(changes.filter((r) => r.status === "fulfilled").length, 1);
      const rejected = changes.find((r) => r.status === "rejected");
      assert.ok(rejected?.status === "rejected" && rejected.reason instanceof CapacityError);
      assert.equal(rejected.reason.code, "organization_capacity_settings_conflict");
      const before = await readOrganizationCapacity(organizationId, query);
      await updateOrganizationSettings({ organizationId, patch: { name: "Unrelated edit" } }, query);
      const after = await readOrganizationCapacity(organizationId, query);
      assert.equal(after.limit, before.limit);
      assert.equal(after.revision, 2);
      await assert.rejects(updateOrganizationSettings({ organizationId, patch: { maxConcurrency: 4 } }, query), /Reload settings/);
    });

    await t.test("workspace trigger reservation rolls back together with capacity", async () => {
      const organizationId = await org(2);
      const workspaceId = `ws_${randomUUID()}`;
      await query("INSERT INTO persistent_workspaces(id,organization_id,name,provider,provider_volume_name,size_gib,quota_slot) VALUES ($1,$2,'test','fake',$1,1,1)", [workspaceId, organizationId]);
      await assert.rejects(admit(organizationId, randomUUID(), true, workspaceId), /injected rollback/);
      assert.equal((await query("SELECT attached_sandbox_id FROM persistent_workspaces WHERE id=$1", [workspaceId])).rows[0].attached_sandbox_id, null);
      const results = await Promise.allSettled([admit(organizationId, randomUUID(), false, workspaceId), admit(organizationId, randomUUID(), false, workspaceId)]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 1);
    });

    const template: RuntimeTemplate = { id: "capacity-template", templateVersionId: null, name: "Test", description: "", image: "test@sha256:abc", imageDigest: "sha256:abc", icon: "box", tags: [], aliases: [], bootMs: 0, status: "ready", visibility: "public", cpuCount: 1, memoryMb: 128, workdir: "/workspace", defaultEntrypoint: ["sleep", "3600"], defaultPorts: [], runtimeFamily: "linux" };
    const createDependencies = (runtimeProvider: InMemoryRuntimeProvider) => ({
      query, transaction, runtimeProvider, recordEvent: async () => undefined, recordAudit: async () => undefined,
      resolveTemplateFn: async () => template, ensureTemplateImageDigestFn: async () => template, templateCanCreateSandboxFn: () => true
    });

    await t.test("real create service enforces capacity and replays a completed intent", async () => {
      const organizationId = await org();
      const provider = new InMemoryRuntimeProvider();
      let dispatches = 0;
      const original = provider.create.bind(provider);
      provider.create = async (input) => { dispatches++; return original(input); };
      const input = { organizationId, userId: null, actorLabel: "test", templateRef: template.id, ttlSeconds: 300, env: {}, idempotencyKey: randomUUID() };
      const result = await createSandbox(input, createDependencies(provider));
      assert.equal(result.kind, "created");
      assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 1);
      assert.equal((await createSandbox(input, createDependencies(provider))).kind, "created");
      assert.equal(dispatches, 1);
      await assert.rejects(createSandbox({ ...input, idempotencyKey: randomUUID() }, createDependencies(provider)), (e: unknown) => e instanceof CapacityError && e.code === "organization_capacity_exceeded");
      await assert.rejects(createSandbox({ ...input, ttlSeconds: 400 }, createDependencies(provider)), (e: unknown) => e instanceof CapacityError && e.code === "idempotency_conflict");
      assert.equal(dispatches, 1);
    });

    await t.test("async admission holds its slot before the worker starts", async () => {
      const organizationId = await org();
      const provider = new InMemoryRuntimeProvider();
      const result = await createSandbox({ organizationId, userId: null, actorLabel: "test", templateRef: template.id, ttlSeconds: 300, env: {}, wait: false }, createDependencies(provider));
      assert.equal(result.kind, "pending");
      if (result.kind !== "pending") throw new Error("Expected an accepted operation");
      assert.equal((await readOrganizationCapacity(organizationId, query)).breakdown?.reserved, 1);
      const operation = await claimSandboxOperationById({ operationId: result.operation.id }, query);
      assert.ok(operation);
      await executeSandboxOperation(operation, { query, transaction, runtimeProvider: provider, recordEvent: async () => undefined });
      assert.equal((await readOrganizationCapacity(organizationId, query)).breakdown?.active, 1);
    });

    await t.test("lost provider response holds capacity and is never blindly replayed", async () => {
      const organizationId = await org();
      const provider = new InMemoryRuntimeProvider();
      let calls = 0;
      provider.create = async () => { calls++; throw new Error("simulated lost response"); };
      const result = await createSandbox({ organizationId, userId: null, actorLabel: "test", templateRef: template.id, ttlSeconds: 300, env: {} }, createDependencies(provider));
      assert.equal(result.kind, "sandbox_provision_failed");
      const capacity = await readOrganizationCapacity(organizationId, query);
      assert.equal(capacity.breakdown?.uncertain, 1);
      if (result.kind !== "sandbox_provision_failed") throw new Error("Expected unknown outcome");
      assert.equal(await claimSandboxOperationById({ operationId: result.operation.id }, query), null);
      assert.equal(calls, 1);
    });
    const makeSandbox = async (organizationId: string, provider: InMemoryRuntimeProvider) => {
      const result = await createSandbox({ organizationId, userId: null, actorLabel: "test", templateRef: template.id, ttlSeconds: 300, env: {} }, createDependencies(provider));
      assert.equal(result.kind, "created");
      if (result.kind !== "created") throw new Error("create failed");
      return result.sandbox;
    };
    const lifecycleInput = (organizationId: string, sandboxId: string) => ({ organizationId, sandboxId, userId: null, actorLabel: "test" });
    const recover = async (organizationId: string, provider: InMemoryRuntimeProvider) => {
      await query("UPDATE sandbox_capacity_reservations SET next_check_at=now() WHERE organization_id=$1", [organizationId]);
      return reconcileSandboxCapacity({ query, transaction, runtimeProvider: provider, organizationId, staleAfterMs: 0 });
    };
    await t.test("confirmed pause releases; parallel resumes cannot exceed the limit", async () => {
      const organizationId = await org();
      const provider = new InMemoryRuntimeProvider();
      const first = await makeSandbox(organizationId, provider);
      await pauseSandbox(lifecycleInput(organizationId, first.id), createDependencies(provider));
      assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 0);
      const second = await makeSandbox(organizationId, provider);
      await pauseSandbox(lifecycleInput(organizationId, second.id), createDependencies(provider));
      let resumes = 0;
      const original = provider.resume.bind(provider);
      provider.resume = async (input) => { resumes++; return original(input); };
      const results = await Promise.allSettled([first, second].map((sandbox) => resumeSandbox(lifecycleInput(organizationId, sandbox.id), createDependencies(provider))));
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(resumes, 1);
      assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 1);
      assert.equal((await query("SELECT * FROM sandbox_capacity_reservations WHERE organization_id=$1 AND generation=2", [organizationId])).rows.length, 1);
    });

    await t.test("pause acknowledgement is not confirmation and delete must wait for absence", async () => {
      const organizationId = await org();
      const provider = new InMemoryRuntimeProvider();
      const sandbox = await makeSandbox(organizationId, provider);
      const ref = { provider: provider.kind, providerSandboxId: (await provider.list())[0].providerSandboxId };
      const paused = provider.pause.bind(provider);
      provider.pause = async () => { const runtime = await provider.get(ref); assert.ok(runtime); runtime.state = "pausing"; return runtime; };
      await pauseSandbox(lifecycleInput(organizationId, sandbox.id), { ...createDependencies(provider), waitTimeoutMs: 0 });
      assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 1);
      await paused(ref);
      await recover(organizationId, provider);
      assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 0);
      await resumeSandbox(lifecycleInput(organizationId, sandbox.id), createDependencies(provider));
      const removed = provider.delete.bind(provider);
      provider.delete = async () => { const runtime = await provider.get(ref); assert.ok(runtime); runtime.state = "deleting"; };
      await requestSandboxTermination(lifecycleInput(organizationId, sandbox.id), createDependencies(provider));
      assert.equal((await readOrganizationCapacity(organizationId, query)).breakdown?.releasing, 1);
      await assert.rejects(makeSandbox(organizationId, provider), (e: unknown) => e instanceof CapacityError && e.code === "organization_capacity_exceeded");
      await removed(ref);
      await recover(organizationId, provider);
      assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 0);
    });

    await t.test("a paused runtime can be deleted without reserving a second slot", async () => {
      const organizationId = await org();
      const provider = new InMemoryRuntimeProvider();
      const paused = await makeSandbox(organizationId, provider);
      await pauseSandbox(lifecycleInput(organizationId, paused.id), createDependencies(provider));
      await makeSandbox(organizationId, provider);
      await requestSandboxTermination(lifecycleInput(organizationId, paused.id), createDependencies(provider));
      assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 1);
    });

    await t.test("lost resume and delete responses recover from positive lifecycle evidence", async () => {
      const organizationId = await org();
      const provider = new InMemoryRuntimeProvider();
      const sandbox = await makeSandbox(organizationId, provider);
      await pauseSandbox(lifecycleInput(organizationId, sandbox.id), createDependencies(provider));
      const resume = provider.resume.bind(provider);
      provider.resume = async (ref) => { await resume(ref); throw new Error("lost response"); };
      assert.equal((await resumeSandbox(lifecycleInput(organizationId, sandbox.id), createDependencies(provider))).kind, "runtime_provider_failed");
      assert.equal((await readOrganizationCapacity(organizationId, query)).breakdown?.uncertain, 1);
      await recover(organizationId, provider);
      assert.equal((await readOrganizationCapacity(organizationId, query)).breakdown?.active, 1);
      const remove = provider.delete.bind(provider);
      provider.delete = async (ref) => { await remove(ref); throw new Error("lost response"); };
      await assert.rejects(requestSandboxTermination(lifecycleInput(organizationId, sandbox.id), createDependencies(provider)), /could not be confirmed/);
      assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 1);
      await recover(organizationId, provider);
      assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 0);
    });

    await t.test("completed resume keys never execute a new lifecycle generation", async () => {
      const organizationId = await org();
      const provider = new InMemoryRuntimeProvider();
      const sandbox = await makeSandbox(organizationId, provider);
      const input = { ...lifecycleInput(organizationId, sandbox.id), idempotencyKey: randomUUID() };
      await pauseSandbox(lifecycleInput(organizationId, sandbox.id), createDependencies(provider));
      await resumeSandbox(input, createDependencies(provider));
      await pauseSandbox(lifecycleInput(organizationId, sandbox.id), createDependencies(provider));
      const replay = await resumeSandbox(input, createDependencies(provider));
      assert.ok(replay.kind === "ok" && replay.sandbox.status === "paused");
      assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 0);
    });

    await t.test("an old absent observation cannot release a newly resumed generation", async () => {
      const organizationId = await org();
      const provider = new InMemoryRuntimeProvider();
      const sandbox = await makeSandbox(organizationId, provider);
      let started!: () => void;
      let unblock!: () => void;
      const waiting = new Promise<void>((r) => { started = r; });
      const blocked = new Promise<void>((r) => { unblock = r; });
      const get = provider.get.bind(provider);
      let delayed = false;
      provider.get = async (ref) => {
        if (!delayed) { delayed = true; started(); await blocked; return null; }
        return get(ref);
      };
      const reconciliation = reconcileSandboxLease(lifecycleInput(organizationId, sandbox.id), createDependencies(provider));
      await waiting;
      await pauseSandbox(lifecycleInput(organizationId, sandbox.id), createDependencies(provider));
      await resumeSandbox(lifecycleInput(organizationId, sandbox.id), createDependencies(provider));
      unblock(); await reconciliation;
      assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 1);
      assert.equal((await query("SELECT status FROM sandboxes WHERE id=$1", [sandbox.id])).rows[0].status, "running");
    });

    await t.test("a renewal excludes deletion without holding an organization lock during I/O", async () => {
      const organizationId = await org(2);
      const provider = new InMemoryRuntimeProvider();
      const sandbox = await makeSandbox(organizationId, provider);
      let started!: () => void; let unblock!: () => void;
      const waiting = new Promise<void>((r) => { started = r; });
      const blocked = new Promise<void>((r) => { unblock = r; });
      const renew = provider.renew.bind(provider);
      provider.renew = async (ref, input) => { started(); await blocked; await renew(ref, input); };
      const renewing = renewSandboxLease(lifecycleInput(organizationId, sandbox.id), createDependencies(provider));
      await waiting;
      await assert.rejects(requestSandboxTermination(lifecycleInput(organizationId, sandbox.id), createDependencies(provider)), /Another runtime operation/);
      await makeSandbox(organizationId, provider);
      unblock(); await renewing;
      assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 2);
      await reconcileSandboxLease({ ...lifecycleInput(organizationId, sandbox.id), expire: true }, createDependencies(provider));
      assert.equal((await query("SELECT status FROM sandboxes WHERE id=$1", [sandbox.id])).rows[0].status, "running");
    });

    await t.test("orphan recovery adopts the exact dispatch but never trusts an empty list", async () => {
      const organizationId = await org();
      const provider = new InMemoryRuntimeProvider();
      const create = provider.create.bind(provider);
      provider.create = async (input) => { await create(input); throw new Error("lost provider response"); };
      const failed = await createSandbox({ organizationId, userId: null, actorLabel: "test", templateRef: template.id, ttlSeconds: 300, env: {} }, createDependencies(provider));
      assert.equal(failed.kind, "sandbox_provision_failed");
      const list = provider.list.bind(provider);
      provider.list = async () => [];
      await recover(organizationId, provider);
      assert.equal((await readOrganizationCapacity(organizationId, query)).breakdown?.uncertain, 1);
      provider.list = list;
      assert.equal((await recover(organizationId, provider)).recovered, 1);
      assert.equal((await readOrganizationCapacity(organizationId, query)).breakdown?.active, 1);
      assert.equal((await query("SELECT state FROM sandbox_operations WHERE organization_id=$1", [organizationId])).rows[0].state, "succeeded");
    });
    await t.test("100 real create calls commit exactly seven provider dispatches", async () => {
      const organizationId = await org(7);
      const provider = new InMemoryRuntimeProvider();
      let dispatches = 0;
      const create = provider.create.bind(provider);
      provider.create = async (input) => { dispatches++; return create(input); };
      const results = await Promise.allSettled(Array.from({ length: 100 }, () => createSandbox({ organizationId, userId: null, actorLabel: "test", templateRef: template.id, ttlSeconds: 300, env: {} }, createDependencies(provider))));
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 7);
      for (const result of results) if (result.status === "fulfilled") assert.equal(result.value.kind, "created");
      else assert.ok(result.reason instanceof CapacityError && result.reason.code === "organization_capacity_exceeded");
      assert.equal(dispatches, 7);
      assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 7);
    });

    await t.test("parallel activity renewals coalesce without spending another slot", async () => {
      const organizationId = await org();
      const provider = new InMemoryRuntimeProvider();
      const sandbox = await makeSandbox(organizationId, provider);
      let started!: () => void; let unblock!: () => void;
      const waiting = new Promise<void>((r) => { started = r; });
      const blocked = new Promise<void>((r) => { unblock = r; });
      const renew = provider.renew.bind(provider);
      let dispatches = 0;
      provider.renew = async (ref, input) => { dispatches++; started(); await blocked; await renew(ref, input); };
      const first = renewSandboxLease(lifecycleInput(organizationId, sandbox.id), createDependencies(provider));
      await waiting;
      const second = renewSandboxLease(lifecycleInput(organizationId, sandbox.id), createDependencies(provider));
      await new Promise((r) => setTimeout(r, 40));
      unblock();
      await Promise.all([first, second]);
      assert.equal(dispatches, 1);
      assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 1);
    });

    await t.test("canceling queued work fences every future provision claim", async () => {
      const organizationId = await org();
      const provider = new InMemoryRuntimeProvider();
      const result = await createSandbox({ organizationId, userId: null, actorLabel: "test", templateRef: template.id, ttlSeconds: 300, env: {}, wait: false }, createDependencies(provider));
      assert.ok(result.kind === "pending");
      await requestSandboxTermination({ organizationId, sandboxId: result.sandbox.id }, createDependencies(provider));
      assert.equal(await claimSandboxOperationById({ operationId: result.operation.id }, query), null);
      assert.equal((await provider.list()).length, 0);
      assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 0);
    });

    await t.test("opaque intent fingerprints detect secret changes without storing plaintext", async () => {
      const previousKey = config.controlPlaneSecretKey;
      config.controlPlaneSecretKey = "capacity-tests-only-hmac-key";
      try {
        const organizationId = await org();
        const provider = new InMemoryRuntimeProvider();
        const input = { organizationId, userId: null, actorLabel: "test", templateRef: template.id, ttlSeconds: 300, env: { SECOND: "two", FIRST: "never-persist-me-in-an-intent" }, idempotencyKey: randomUUID(), wait: false };
        const result = await createSandbox(input, createDependencies(provider));
        assert.ok(result.kind === "pending");
        const same = await createSandbox({ ...input, env: { FIRST: input.env.FIRST, SECOND: "two" } }, createDependencies(provider));
        assert.ok(same.kind === "pending" && same.sandbox.id === result.sandbox.id);
        await assert.rejects(createSandbox({ ...input, env: { ...input.env, FIRST: "changed" } }, createDependencies(provider)), (e: unknown) => e instanceof CapacityError && e.code === "idempotency_conflict");
        const requests = await query("SELECT request,result,error FROM sandbox_operations WHERE organization_id=$1", [organizationId]);
        assert.ok(!JSON.stringify(requests.rows).includes(input.env.FIRST));
        config.controlPlaneSecretKey = "rotated-capacity-tests-only-hmac-key";
        await assert.rejects(createSandbox(input, createDependencies(provider)), (e: unknown) => e instanceof CapacityError && e.code === "idempotency_conflict");
        assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 1);
      } finally { config.controlPlaneSecretKey = previousKey; }
    });

    await t.test("100 duplicate service calls dispatch a single accepted intent", async () => {
      const organizationId = await org();
      const provider = new InMemoryRuntimeProvider();
      let dispatches = 0;
      const create = provider.create.bind(provider);
      provider.create = async (input) => { dispatches++; return create(input); };
      const input = { organizationId, userId: null, actorLabel: "test", templateRef: template.id, ttlSeconds: 300, env: {}, idempotencyKey: randomUUID() };
      const results = await Promise.all(Array.from({ length: 100 }, () => createSandbox(input, createDependencies(provider))));
      assert.ok(results.every((result) => result.kind === "created" || result.kind === "pending"));
      assert.equal(dispatches, 1);
      assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 1);
      assert.equal((await query("SELECT id FROM sandbox_operations WHERE organization_id=$1", [organizationId])).rowCount, 1);
    });

    await t.test("failed runtime identity persistence retains a hold and recovers without another create", async () => {
      const organizationId = await org();
      const provider = new InMemoryRuntimeProvider();
      let dispatches = 0;
      const create = provider.create.bind(provider);
      provider.create = async (input) => { dispatches++; return create(input); };
      const input = { organizationId, userId: null, actorLabel: "test", templateRef: template.id, ttlSeconds: 300, env: {}, idempotencyKey: randomUUID() };
      const result = await createSandbox(input, { ...createDependencies(provider), transaction: (work) => transaction((q) => work((sql, params) => sql.includes("UPDATE sandboxes SET opensandbox_id=$2") ? Promise.resolve({ rows: [], rowCount: 0 }) : q(sql, params))) });
      assert.equal(result.kind, "sandbox_provision_failed");
      assert.equal((await readOrganizationCapacity(organizationId, query)).breakdown?.uncertain, 1);
      await recover(organizationId, provider);
      assert.equal((await createSandbox(input, createDependencies(provider))).kind, "created");
      assert.equal(dispatches, 1);
    });

    await t.test("bounded recovery does not starve holds after the first hundred", async () => {
      const organizationId = await org(200);
      const admitted = await Promise.all(Array.from({ length: 150 }, () => admit(organizationId)));
      await query("UPDATE sandboxes SET opensandbox_id=id, status='error' WHERE organization_id=$1", [organizationId]);
      const observed = new Set<string>();
      const provider = new InMemoryRuntimeProvider();
      provider.get = async (ref) => { observed.add(ref.providerSandboxId); throw new Error("provider unavailable"); };
      for (let batch = 0; batch < 6; batch++) {
        const report = await reconcileSandboxCapacity({ query, transaction, runtimeProvider: provider, organizationId, limit: 25 });
        assert.equal(report.checked, 25);
        assert.equal(report.failed, 25);
      }
      assert.equal(observed.size, admitted.length);
      assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 150);
      assert.equal((await reconcileSandboxCapacity({ query, transaction, runtimeProvider: provider, organizationId, limit: 25 })).checked, 0);
    });

    await t.test("recovery query plans separate held work from ten thousand released generations", async () => {
      const organizationId = await org();
      const admitted = await admit(organizationId);
      await query(`INSERT INTO sandbox_capacity_reservations(organization_id,sandbox_id,generation,phase,released_at)
        SELECT $1,$2,generation,'released',now() FROM generate_series(2,10001) generation`, [organizationId, admitted.sandboxId]);
      await query("ANALYZE sandbox_capacity_reservations");
      await query("ANALYZE sandbox_runtime_effects");
      let recoverySql = "";
      let recoveryParams: unknown[] | undefined;
      const capture: Query = (sql, params) => {
        if (sql.startsWith("WITH due_candidates AS")) { recoverySql = sql; recoveryParams = params; }
        return query(sql, params);
      };
      await reconcileSandboxCapacity({ query: capture, transaction, runtimeProvider: new InMemoryRuntimeProvider(), organizationId });
      assert.ok(recoverySql);
      const explained = await query(`EXPLAIN (FORMAT JSON) ${recoverySql}`, recoveryParams);
      const plan = JSON.stringify(explained.rows);
      assert.match(plan, /sandbox_capacity_(org_held|due|one_hold)/);
      assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 1);
      t.diagnostic(`Capacity recovery query plan: ${plan}`);
    });

    await t.test("a delete request succeeds when recovery confirms absence before its acknowledgement", async () => {
      const organizationId = await org();
      const provider = new InMemoryRuntimeProvider();
      const sandbox = await makeSandbox(organizationId, provider);
      const remove = provider.delete.bind(provider);
      provider.delete = async (ref) => {
        await remove(ref);
        await recover(organizationId, provider);
      };
      await requestSandboxTermination({ organizationId, sandboxId: sandbox.id }, createDependencies(provider));
      assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 0);
      assert.equal((await query("SELECT id FROM sandbox_events WHERE sandbox_id=$1 AND type='terminated'", [sandbox.id])).rowCount, 1);
    });

    await t.test("duplicate exact native identities quarantine admission instead of adopting one", async () => {
      const organizationId = await org();
      const provider = new InMemoryRuntimeProvider();
      const create = provider.create.bind(provider);
      provider.create = async (input) => { await create(input); await create(input); throw new Error("lost reply"); };
      await createSandbox({ organizationId, userId: null, actorLabel: "test", templateRef: template.id, ttlSeconds: 300, env: {} }, createDependencies(provider));
      await recover(organizationId, provider);
      assert.equal((await readOrganizationCapacity(organizationId, query)).state, "quarantined");
      assert.equal((await query("SELECT * FROM sandbox_capacity_reservations WHERE organization_id=$1 AND released_at IS NULL", [organizationId])).rowCount, 1);
    });

    await t.test("inventory is dry-run by default and incomplete lists cannot activate legacy work", async () => {
      const provider = new InMemoryRuntimeProvider();
      const before = await query("SELECT * FROM sandbox_capacity_reservations WHERE organization_id=$1", [legacy]);
      const dry = await reconcileCapacityInventory({ organizationId: legacy }, createDependencies(provider));
      assert.equal(dry.dryRun, true);
      assert.equal(dry.unresolved, 1);
      assert.deepEqual((await query("SELECT * FROM sandbox_capacity_reservations WHERE organization_id=$1", [legacy])).rows, before.rows);
      await assert.rejects(reconcileCapacityInventory({ organizationId: legacy, apply: true }, createDependencies(provider)), /Stop every older API/);
      const unknown = await reconcileCapacityInventory({ organizationId: legacy, apply: true, writersStopped: true }, createDependencies(provider));
      assert.equal(unknown.capacity.state, "reconciling");
      const verified = await reconcileCapacityInventory({ organizationId: legacy, apply: true, writersStopped: true, absenceEvidence: { sbx_legacy: "Test inventory: no runtime was dispatched for this fixture." } }, createDependencies(provider));
      assert.equal(verified.capacity.state, "enforced");
      assert.equal(verified.capacity.inUse, 0);
      assert.equal((await query("SELECT id FROM audit_events WHERE organization_id=$1 AND action='capacity.inventory.verified'", [legacy])).rows.length, 1);
    });

    await t.test("recovery restores holds for surviving runtimes and quarantines untracked ones", async () => {
      const organizationId = await org();
      const provider = new InMemoryRuntimeProvider();
      const sandbox = await makeSandbox(organizationId, provider);
      // Simulate an older backup which considers a still-running execution released.
      await transaction((q) => releaseSandboxCapacity({ organizationId, sandboxId: sandbox.id, generation: 1, reason: "provider_absent" }, q));
      const denied = await reconcileCapacityInventory({ organizationId, apply: true, writersStopped: true }, createDependencies(provider));
      assert.equal(denied.capacity.state, "reconciling");
      const restored = await reconcileCapacityInventory({ organizationId, apply: true, writersStopped: true, recovery: true }, createDependencies(provider));
      assert.equal(restored.capacity.state, "enforced");
      assert.equal(restored.capacity.inUse, 1);
      await provider.create({ organizationId, template, ttlSeconds: 300, name: "untracked", env: {}, metadata: { "harakiri.org": organizationId, "harakiri.sandbox": "sbx_missing_from_backup" } });
      const quarantined = await reconcileCapacityInventory({ organizationId, apply: true, writersStopped: true, recovery: true }, createDependencies(provider));
      assert.equal(quarantined.capacity.state, "quarantined");
      assert.equal(quarantined.untrackedRuntimeIds.length, 1);
      assert.equal(quarantined.capacity.inUse, null);
    });
  } finally {
    await pool.end();
    await admin.query("SET search_path TO public");
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
