import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import type { Transaction } from "./db.js";
import type { Query } from "./services/query.js";
import type { RuntimeTemplate } from "./templates.js";
import { InMemoryRuntimeProvider } from "./providers/runtime/dev-provider.js";
import { createSandbox } from "./services/sandboxes.js";
import { processSandboxOperationQueue } from "./services/sandbox-operation-worker.js";
import { readOrganizationCapacity } from "./services/organization-capacity.js";

const databaseUrl = process.env.SANDBOX_TEST_DATABASE_URL;
if (process.env.CAPACITY_TEST_REQUIRED === "1" && !databaseUrl) throw new Error("Queue acceptance requires a disposable SANDBOX_TEST_DATABASE_URL");

test("PostgreSQL worker claims a fresh asynchronous create once without manual dispatch", { skip: !databaseUrl, timeout: 30_000 }, async () => {
  const admin = new pg.Client({ connectionString: databaseUrl });
  await admin.connect();
  const schema = `queue_${randomUUID().replaceAll("-", "")}`;
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 5, options: `-c search_path=${schema},public` });
  const query: Query = (sql, params) => pool.query(sql, params);
  const transaction: Transaction = async work => {
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN");
      const result = await work((sql, params) => connection.query(sql, params));
      await connection.query("COMMIT");
      return result;
    } catch (error) { await connection.query("ROLLBACK"); throw error; }
    finally { connection.release(); }
  };
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`SET search_path TO ${schema},public`);
    const migrations = new URL("../../../db/migrations/", import.meta.url);
    for (const name of (await readdir(migrations)).filter(name => name.endsWith(".sql")).sort()) {
      await admin.query(await readFile(new URL(name, migrations), "utf8"));
    }
    const organizationId = randomUUID();
    await query("INSERT INTO organizations(id,name,slug,max_concurrency) VALUES ($1::uuid,'Queue acceptance',$1::text,1)", [organizationId]);
    await query("INSERT INTO templates(id,name,description,image,icon) VALUES ('queue-template','Queue test','','test:1','box')");
    const template: RuntimeTemplate = { id: "queue-template", templateVersionId: null, name: "Queue test", description: "", image: "test:1", imageDigest: "sha256:abc", icon: "box", tags: [], aliases: [], bootMs: 0, status: "ready", visibility: "public", cpuCount: 1, memoryMb: 128, workdir: "/workspace", defaultEntrypoint: ["sleep", "3600"], defaultPorts: [], runtimeFamily: "linux" };
    const runtimeProvider = new InMemoryRuntimeProvider();
    const dependencies = { query, transaction, runtimeProvider, recordEvent: async () => undefined };
    const accepted = await createSandbox({ organizationId, userId: null, actorLabel: "queue-acceptance", templateRef: template.id, ttlSeconds: 300, env: {}, wait: false, idempotencyKey: randomUUID() }, {
      ...dependencies, recordAudit: async () => undefined, resolveTemplateFn: async () => template,
      ensureTemplateImageDigestFn: async () => template, templateCanCreateSandboxFn: () => true
    });
    assert.equal(accepted.kind, "pending");
    if (accepted.kind !== "pending") throw new Error("Expected accepted asynchronous work");
    assert.equal((await runtimeProvider.list()).length, 0);
    assert.equal((await readOrganizationCapacity(organizationId, query)).inUse, 1);

    const report = await processSandboxOperationQueue({ ...dependencies, limit: 1 });
    assert.equal(report.claimed, 1);
    assert.equal(report.succeeded, 1);
    const operation = (await query("SELECT state,attempts FROM sandbox_operations WHERE id=$1", [accepted.operation.id])).rows[0];
    assert.deepEqual(operation, { state: "succeeded", attempts: 1 });
    assert.equal((await readOrganizationCapacity(organizationId, query)).breakdown?.active, 1);
    assert.equal((await processSandboxOperationQueue({ ...dependencies, limit: 1 })).claimed, 0);
    assert.equal((await runtimeProvider.list()).length, 1);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
