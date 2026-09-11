import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import Fastify from "fastify";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createAuthHandler } from "./auth.js";
import { createApiKeyRecord } from "./services/api-keys.js";
import { reconcileCapacityInventory } from "./services/capacity-inventory.js";
import { registerRoutes } from "./routes.js";
import { registerApiErrorHandler } from "./api-error-handler.js";
import { closeDb, pool as defaultPool, type Transaction } from "./db.js";
import type { Query } from "./services/query.js";
import type { RuntimeTemplate } from "./templates.js";
import { resolveImageDigest } from "./registry.js";
import { config } from "./config.js";
import { openSandboxRuntimeProvider } from "./providers/runtime/opensandbox-provider.js";
import { createSandbox } from "./services/sandboxes.js";
import { CapacityError, readOrganizationCapacity } from "./services/organization-capacity.js";
import { requestSandboxTermination, runtimeIsAbsent } from "./services/sandbox-termination.js";
import { reconcileSandboxCapacity } from "./services/sandbox-capacity-reconciler.js";
import { claimSandboxOperationById } from "./services/sandbox-operations.js";
import { executeSandboxOperation } from "./services/sandbox-operation-worker.js";
import { reconcileSandboxLease, renewSandboxLease } from "./services/sandbox-lease.js";

// Explicitly opt in: this test creates real executions through the runtime API.
// It never changes the installed API, cluster configuration or existing users.
test("native capacity acceptance (owned organization and disposable database)", {
  skip: process.env.CAPACITY_NATIVE_REQUIRED !== "1", timeout: 300_000
}, async (t) => {
  const databaseUrl = process.env.SANDBOX_TEST_DATABASE_URL;
  assert.ok(databaseUrl, "Set SANDBOX_TEST_DATABASE_URL to a disposable database");
  assert.equal(config.databaseUrl, databaseUrl, "All database access must use the disposable database");
  assert.equal(config.openSandboxAllowFallback, false, "Native evidence forbids fallback");
  assert.ok(process.env.OPEN_SANDBOX_BASE_URL && process.env.OPEN_SANDBOX_API_KEY, "Supply the native provider endpoint and credential");
  const schema = `native_capacity_${randomUUID().replaceAll("-", "")}`;
  // Some catalog helpers use the application pool; keep those reads in this schema too.
  defaultPool.options.options = `-c search_path=${schema},public`;
  const admin = new pg.Client({ connectionString: databaseUrl });
  await admin.connect();
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10, options: `-c search_path=${schema},public` });
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
  const organizationId = randomUUID();
  const owned = new Set<string>();
  let dispatches = 0;
  const provider = { ...openSandboxRuntimeProvider, create: async (input: Parameters<typeof openSandboxRuntimeProvider.create>[0]) => {
    dispatches++;
    const result = await openSandboxRuntimeProvider.create(input);
    owned.add(result.providerSandboxId);
    return result;
  } };
  const template: RuntimeTemplate = {
    id: `capacity-native-${randomUUID()}`, name: "Native capacity test", description: "Owned acceptance workload",
    image: process.env.CAPACITY_NATIVE_IMAGE ?? "ubuntu:24.04", imageDigest: null, templateVersionId: null,
    icon: "box", tags: [], aliases: [], bootMs: 0, status: "ready", visibility: "public",
    cpuCount: 1, memoryMb: 128, workdir: "/", defaultEntrypoint: ["sleep", "600"], defaultPorts: [], runtimeFamily: "linux"
  };
  const dependencies = { query, transaction, runtimeProvider: provider,
    recordEvent: async () => undefined, recordAudit: async () => undefined,
    resolveTemplateFn: async () => template, ensureTemplateImageDigestFn: async () => template, templateCanCreateSandboxFn: () => true };
  const input = () => ({ organizationId, userId: null, actorLabel: "capacity-native-test", templateRef: template.id, ttlSeconds: 180, env: {}, idempotencyKey: randomUUID() });
  const recover = async (staleAfterMs = 0) => {
    await query("UPDATE sandbox_capacity_reservations SET next_check_at=now() WHERE organization_id=$1", [organizationId]);
    await reconcileSandboxCapacity({ ...dependencies, organizationId, staleAfterMs });
  };
  const until = async (predicate: () => Promise<boolean>, label: string) => {
    const deadline = Date.now() + 60_000;
    while (!await predicate()) {
      assert.ok(Date.now() < deadline, `Timed out: ${label}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  };
  const capacity = () => readOrganizationCapacity(organizationId, query);
  const stop = async (sandboxId: string) => {
    await requestSandboxTermination({ organizationId, sandboxId }, dependencies);
    await until(async () => { await recover(); return (await query("SELECT 1 FROM sandbox_capacity_reservations WHERE sandbox_id=$1 AND released_at IS NULL", [sandboxId])).rowCount === 0; }, "confirmed runtime deletion");
  };
  let cleanupConfirmed = false;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`SET search_path TO ${schema},public`);
    const migrations = new URL("../../../db/migrations/", import.meta.url);
    for (const file of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) await admin.query(await readFile(new URL(file, migrations), "utf8"));
    await query("INSERT INTO organizations(id,name,slug,max_concurrency) VALUES ($1::uuid,'Native capacity test',$1::text,2)", [organizationId]);
    await query("INSERT INTO templates(id,name,description,image,icon,cpu_count,memory_mb,workdir,default_entrypoint) VALUES ($1,$2,$3,$4,'box',1,128,'/',$5)", [template.id, template.name, template.description, template.image, template.defaultEntrypoint]);
    let firstId = "";
    await t.test("concurrent native admission, full-capacity replay and rejected dispatch", async () => {
      const firstInput = input();
      const results = await Promise.all([createSandbox(firstInput, dependencies), createSandbox(input(), dependencies)]);
      for (const result of results) assert.equal(result.kind, "created", JSON.stringify(result));
      assert.equal(dispatches, 2);
      assert.equal((await capacity()).inUse, 2);
      const replay = await createSandbox(firstInput, dependencies);
      assert.equal(replay.kind, "created");
      await assert.rejects(createSandbox(input(), dependencies), (error: unknown) => error instanceof CapacityError && error.code === "organization_capacity_exceeded");
      assert.equal(dispatches, 2);
      if (results[0].kind !== "created" || results[1].kind !== "created") throw new Error("Missing accepted sandboxes");
      firstId = results[0].sandbox.id;
      await stop(results[1].sandbox.id);
      assert.equal((await capacity()).inUse, 1);
    });
    await t.test("native execution and renewal do not consume additional slots", async () => {
      const row = (await query<{ opensandbox_id: string }>("SELECT opensandbox_id FROM sandboxes WHERE id=$1", [firstId])).rows[0];
      assert.ok(row);
      await until(async () => { await recover(); return (await provider.get({ provider: "opensandbox", providerSandboxId: row.opensandbox_id }))?.state === "running"; }, "running native sandbox");
      const result = await provider.run({ provider: "opensandbox", providerSandboxId: row.opensandbox_id, controlPlaneSandboxId: firstId, command: "printf capacity-native-ok", cwd: "/", timeoutMs: 10_000 });
      assert.equal(result.exitCode, 0);
      assert.match(result.stdout, /capacity-native-ok/);
      await renewSandboxLease({ organizationId, sandboxId: firstId }, dependencies);
      assert.equal((await capacity()).inUse, 1);
      await stop(firstId);
      assert.equal((await capacity()).inUse, 0);
    });
    await t.test("native async worker owns the already-reserved slot", async () => {
      const result = await createSandbox({ ...input(), wait: false }, dependencies);
      assert.equal(result.kind, "pending");
      if (result.kind !== "pending") throw new Error("Missing queued operation");
      assert.equal((await capacity()).breakdown?.reserved, 1);
      const operation = await claimSandboxOperationById({ operationId: result.operation.id }, query);
      assert.ok(operation);
      await executeSandboxOperation(operation, dependencies);
      assert.equal(dispatches, 3);
      assert.equal((await capacity()).inUse, 1);
      await stop(result.sandbox.id);
    });
    await t.test("a lost native create response is adopted once from exact dispatch metadata", async () => {
      const lostProvider = { ...provider, create: async (request: Parameters<typeof provider.create>[0]) => {
        await provider.create(request);
        throw new Error("injected response loss after native creation");
      } };
      const acceptedInput = input();
      const result = await createSandbox(acceptedInput, { ...dependencies, runtimeProvider: lostProvider });
      assert.equal(result.kind, "sandbox_provision_failed");
      assert.equal((await capacity()).breakdown?.uncertain, 1);
      await until(async () => { await recover(); return (await query("SELECT id FROM sandbox_runtime_effects WHERE organization_id=$1 AND settled_at IS NULL", [organizationId])).rowCount === 0; }, "exact positive orphan adoption");
      const replay = await createSandbox(acceptedInput, dependencies);
      assert.equal(replay.kind, "created");
      assert.equal(dispatches, 4);
      if (replay.kind !== "created") throw new Error("Missing recovered sandbox");
      await stop(replay.sandbox.id);
      assert.equal((await capacity()).inUse, 0);
    });
    await t.test("local TTL only frees capacity after native deletion is confirmed", async () => {
      const result = await createSandbox({ ...input(), ttlSeconds: 1 }, dependencies);
      assert.equal(result.kind, "created");
      if (result.kind !== "created") throw new Error("Missing TTL sandbox");
      assert.equal((await capacity()).inUse, 1);
      await until(async () => {
        await reconcileSandboxLease({ organizationId, sandboxId: result.sandbox.id, expire: true }, dependencies);
        await recover();
        return (await capacity()).inUse === 0;
      }, "native TTL cleanup");
      assert.equal(dispatches, 5);
    });
    await t.test("documented SDK tutorial through the authenticated HTTP API and native runtime", async () => {
      const image = await resolveImageDigest(template.image);
      const versionId = `tplv_${randomUUID()}`;
      await query("INSERT INTO template_versions(id,template_id,image_uri,image_digest,default_entrypoint,cpu_count,memory_mb,workdir) VALUES ($1,$2,$3,$4,$5,1,128,'/')", [versionId, template.id, image.digestPinnedRef, image.digest, template.defaultEntrypoint]);
      await query("UPDATE templates SET latest_version_id=$2 WHERE id=$1", [template.id, versionId]);
      t.diagnostic(`HTTP tutorial image=${image.digestPinnedRef}`);
      await query("UPDATE organizations SET max_concurrency=1 WHERE id=$1", [organizationId]);
      const userId = randomUUID();
      await query("INSERT INTO users(id,email,full_name) VALUES ($1,'capacity@example.test','Capacity Test')", [userId]);
      await query("INSERT INTO memberships(user_id,organization_id,role) VALUES ($1,$2,'admin')", [userId, organizationId]);
      const key = await createApiKeyRecord({ organizationId, actorUserId: userId, name: "capacity-tutorial", scopes: ["org:read", "sandboxes:read", "sandboxes:write", "templates:read"] }, { query });
      const app = Fastify();
      registerApiErrorHandler(app);
      await registerRoutes(app, { ...dependencies, requireAuth: createAuthHandler({ query, devAllowed: () => false }) });
      const apiUrl = await app.listen({ host: "127.0.0.1", port: 0 });
      let recovering: Promise<void> | undefined;
      const recoveryErrors: unknown[] = [];
      const timer = setInterval(() => {
        recovering ??= recover(300_000).catch((error: unknown) => { recoveryErrors.push(error); }).finally(() => { recovering = undefined; });
      }, 500);
      try {
        const root = fileURLToPath(new URL("../../../", import.meta.url));
        const result = await promisify(execFile)("pnpm", ["--filter", "@harakiri/api", "exec", "tsx", "--tsconfig", "../../examples/tsconfig.json", "../../examples/sdk-execution-capacity/index.ts"], {
          cwd: root, timeout: 120_000,
          env: { ...process.env, HARAKIRI_API_URL: apiUrl, HARAKIRI_API_KEY: key.token, HARAKIRI_TEMPLATE: template.id }
        });
        assert.match(result.stdout, /Verified: full-capacity denial/);
        assert.equal((await capacity()).inUse, 0);
        assert.equal(dispatches, 7);
        assert.deepEqual(recoveryErrors, []);
      } finally {
        clearInterval(timer);
        await recovering;
        await app.close();
      }
    });
    await t.test("an older database backup cannot reopen admission around a surviving native runtime", async () => {
      const dump = async () => (await promisify(execFile)("pg_dump", ["--dbname", databaseUrl, "--schema", schema, "--format=custom", "--no-owner", "--no-privileges"], { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 })).stdout;
      const restore = (backup: Buffer) => new Promise<void>((resolve, reject) => {
        const child = execFile("pg_restore", ["--dbname", databaseUrl, "--clean", "--if-exists", "--single-transaction", "--no-owner", "--no-privileges"], (error) => error ? reject(error) : resolve());
        child.stdin!.end(backup);
      });
      const before = await dump();
      const created = await createSandbox(input(), dependencies);
      assert.equal(created.kind, "created");
      if (created.kind !== "created") throw new Error("Missing recovery sandbox");
      const current = await dump();
      await restore(before);
      const restored = await reconcileCapacityInventory({ organizationId, recovery: true, apply: true, writersStopped: true }, dependencies);
      assert.equal(restored.capacity.state, "quarantined");
      await assert.rejects(createSandbox(input(), dependencies), (error: unknown) => error instanceof CapacityError && error.code === "organization_capacity_unavailable");
      assert.equal(dispatches, 8);
      // Restore the matching snapshot, not a fabricated runtime row or counter edit.
      await restore(current);
      const verified = await reconcileCapacityInventory({ organizationId, recovery: true, apply: true, writersStopped: true }, dependencies);
      assert.equal(verified.capacity.state, "enforced");
      assert.equal(verified.capacity.inUse, 1);
      await stop(created.sandbox.id);
      assert.equal((await capacity()).inUse, 0);
    });
    t.diagnostic(`Native dispatches=${dispatches}; organization=${organizationId}; image=${template.image}; fallback=false`);
  } finally {
    // Cleanup is restricted to this random organization and IDs returned to this test.
    try {
      for (const runtime of await provider.list()) if (runtime.metadata?.["harakiri.org"] === organizationId) owned.add(runtime.providerSandboxId);
      for (const providerSandboxId of owned) {
        const ref = { provider: "opensandbox", providerSandboxId };
        if (!runtimeIsAbsent(provider, await provider.get(ref))) await provider.delete(ref);
        await until(async () => runtimeIsAbsent(provider, await provider.get(ref)), "owned cleanup");
      }
      cleanupConfirmed = true;
      t.diagnostic(`Confirmed absence of ${owned.size} owned runtimes; no other runtime was deleted.`);
    } finally {
      await pool.end();
      if (cleanupConfirmed) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      else t.diagnostic(`Cleanup incomplete; retained diagnostic schema ${schema}`);
      await admin.end();
      await closeDb();
    }
  }
});
