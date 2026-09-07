import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { config } from "./config.js";
import { openSandboxRuntimeProvider } from "./providers/runtime/opensandbox-provider.js";
import { openSandboxCreateBody } from "./providers/runtime/opensandbox-transport.js";
import { createSandboxSchema } from "./routes/sandboxes.schema.js";
import { archiveWorkspace, createWorkspace, getWorkspaceRow, prepareRuntimeWorkspace, reconcileWorkspaces, workspacePolicy, WorkspaceError } from "./services/persistent-workspaces.js";
import type { Query } from "./services/query.js";
import type { RuntimeTemplate } from "./templates.js";

test("workspace contract is opt-in and never permits provider fallback or snapshot attachment", () => {
  const previous = { enabled: config.persistentWorkspacesEnabled, fallback: config.openSandboxAllowFallback };
  try {
    config.persistentWorkspacesEnabled = false;
    assert.equal(workspacePolicy(openSandboxRuntimeProvider).available, false);
    config.persistentWorkspacesEnabled = true; config.openSandboxAllowFallback = true;
    assert.equal(workspacePolicy(openSandboxRuntimeProvider).available, false);
    config.openSandboxAllowFallback = false;
    assert.equal(workspacePolicy(openSandboxRuntimeProvider).available, true);
    assert.equal(createSandboxSchema.safeParse({ snapshotId: "snp_test", workspaceId: "wsp_test" }).success, false);
  } finally { config.persistentWorkspacesEnabled = previous.enabled; config.openSandboxAllowFallback = previous.fallback; }
});

test("workspace translates only into retained native volumes, not host paths or provider deletes", () => {
  const body = openSandboxCreateBody({ template: { id: "python", image: "python:3.12", cpuCount: 1, memoryMb: 512, defaultEntrypoint: ["sleep", "600"], workdir: "/workspace" } as RuntimeTemplate,
    ttlSeconds: 600, name: "test", workspace: { volumeName: "harakiri-wsp-private", storageClass: "fast", sizeGiB: 10, createIfMissing: false, mountPath: "/workspace" } });
  assert.deepEqual(body.volumes, [{ name: "workspace", mountPath: "/workspace", readOnly: false, pvc: { claimName: "harakiri-wsp-private", createIfNotExists: false, deleteOnSandboxTermination: false, storage: "10Gi", storageClass: "fast", accessModes: ["ReadWriteOnce"] } }]);
  assert.ok(!JSON.stringify(body).includes('"host":'));
});

test("invalid storage configuration disables allocation and keeps a serializable policy", () => {
  const previous = { size: config.workspaceSizeGiB, quota: config.workspaceMaxPerOrganization, storageClass: config.workspaceStorageClass };
  try {
    config.workspaceSizeGiB = NaN; config.workspaceMaxPerOrganization = Infinity;
    const policy = workspacePolicy(openSandboxRuntimeProvider);
    assert.equal(policy.available, false);
    assert.equal(policy.sizeGiB, 0); assert.equal(policy.maxPerOrganization, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(policy)), policy);
  } finally { config.workspaceSizeGiB = previous.size; config.workspaceMaxPerOrganization = previous.quota; config.workspaceStorageClass = previous.storageClass; }
});

test("PostgreSQL enforces tenant isolation, exclusive mounts, retained quota and fail-closed release", { skip: !process.env.WORKSPACE_TEST_DATABASE_URL }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.WORKSPACE_TEST_DATABASE_URL });
  const query: Query = (text, params) => pool.query(text, params);
  const org = randomUUID(); const otherOrg = randomUUID(); const template = `workspace-test-${randomUUID()}`;
  const previous = { enabled: config.persistentWorkspacesEnabled, fallback: config.openSandboxAllowFallback, max: config.workspaceMaxPerOrganization };
  config.persistentWorkspacesEnabled = true; config.openSandboxAllowFallback = false; config.workspaceMaxPerOrganization = 2;
  try {
    await query("INSERT INTO organizations(id, name, slug) VALUES ($1::uuid, 'Workspace test', $1::uuid::text), ($2::uuid, 'Other test', $2::uuid::text)", [org, otherOrg]);
    await query("INSERT INTO templates(id, name, description, image, icon) VALUES ($1, $1, 'test', 'python:3.12', 'box')", [template]);
    const workspace = await createWorkspace(org, "Project files", query, openSandboxRuntimeProvider);
    assert.ok(!JSON.stringify(workspace).includes("harakiri-wsp-"));
    await assert.rejects(getWorkspaceRow(otherOrg, workspace.id, query), (error) => error instanceof WorkspaceError && error.statusCode === 404);
    const attach = (id: string, organizationId = org) => query("INSERT INTO sandboxes(id, organization_id, template_id, name, owner_label, workspace_id) VALUES ($1, $2, $3, $1, 'test', $4)", [id, organizationId, template, workspace.id]);
    await assert.rejects(attach(`sbx_${randomUUID()}`, otherOrg));
    const ids = [`sbx_${randomUUID()}`, `sbx_${randomUUID()}`];
    const race = await Promise.allSettled(ids.map((id) => attach(id)));
    assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = race.find((result) => result.status === "rejected") as PromiseRejectedResult;
    assert.equal(rejected.reason.code, "P0001", "competing attachments must conflict, not deadlock");
    const sandboxId = ids[race.findIndex((result) => result.status === "fulfilled")];
    await assert.rejects(archiveWorkspace(org, workspace.id, query));
    const first = await prepareRuntimeWorkspace(org, sandboxId, query, openSandboxRuntimeProvider);
    assert.equal(first.createIfMissing, true);
    await assert.rejects(prepareRuntimeWorkspace(org, sandboxId, query, openSandboxRuntimeProvider), (error) => error instanceof WorkspaceError && error.code === "workspace_attachment_ambiguous");
    await query("UPDATE sandboxes SET status = 'error' WHERE id = $1", [sandboxId]);
    await reconcileWorkspaces(query, { ...openSandboxRuntimeProvider, get: async () => null });
    assert.equal((await getWorkspaceRow(org, workspace.id, query)).attachedSandboxId, sandboxId, "ambiguous create must stay reserved");
    await query("UPDATE sandboxes SET opensandbox_id = 'native-test', status = 'terminated' WHERE id = $1", [sandboxId]);
    await assert.rejects(reconcileWorkspaces(query, { ...openSandboxRuntimeProvider, get: async () => { throw new Error("provider down"); } }));
    assert.equal((await getWorkspaceRow(org, workspace.id, query)).attachedSandboxId, sandboxId);
    await reconcileWorkspaces(query, { ...openSandboxRuntimeProvider, get: async () => null });
    assert.equal((await getWorkspaceRow(org, workspace.id, query)).attachedSandboxId, null);
    const replacement = `sbx_${randomUUID()}`;
    await attach(replacement);
    assert.equal((await prepareRuntimeWorkspace(org, replacement, query, openSandboxRuntimeProvider)).createIfMissing, false, "replacement must never recreate missing storage");
    await query("UPDATE sandboxes SET opensandbox_id = 'native-replacement', status = 'terminated' WHERE id = $1", [replacement]);
    await reconcileWorkspaces(query, { ...openSandboxRuntimeProvider, get: async () => null });
    const archived = await archiveWorkspace(org, workspace.id, query);
    assert.equal(archived.status, "archived"); assert.equal(archived.storageRequested, true);
    await createWorkspace(org, "Second", query, openSandboxRuntimeProvider);
    await assert.rejects(createWorkspace(org, "Third", query, openSandboxRuntimeProvider), (error) => error instanceof WorkspaceError && error.code === "workspace_quota_exceeded");
  } finally {
    await query("UPDATE persistent_workspaces SET attached_sandbox_id = NULL WHERE organization_id = $1", [org]);
    await query("DELETE FROM sandboxes WHERE organization_id IN ($1,$2)", [org, otherOrg]);
    await query("DELETE FROM persistent_workspaces WHERE organization_id IN ($1,$2)", [org, otherOrg]);
    await query("DELETE FROM organizations WHERE id IN ($1,$2)", [org, otherOrg]);
    await query("DELETE FROM templates WHERE id = $1", [template]);
    await pool.end();
    config.persistentWorkspacesEnabled = previous.enabled; config.openSandboxAllowFallback = previous.fallback; config.workspaceMaxPerOrganization = previous.max;
  }
});
