import { check, until } from "../acceptance/context.mjs";
import assert from "node:assert/strict";
import { adapterOrigin, webOrigin, ownedDocker } from "./stack.mjs";
import { signup, selectTerminal } from "./browser.mjs";

export async function runtime(client, template) {
  const all = (await client.listSandboxes()).sandboxes.filter(item => item.template === template && item.status !== "terminated");
  check(all.length === 1, "Expected one live owned OpenWebUI runtime");
  return all[0];
}

export async function restart(ctx, client, template, page) {
  const before = await runtime(client, template);
  ownedDocker(ctx, "adapter", ["restart"]);
  await until("Adapter restart health", async () => {
    try { return (await fetch(`${adapterOrigin}/health`)).ok; } catch { return false; }
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await until("Native file browser after adapter restart", () => page.getByRole("button", { name: "Refresh", exact: true }).isEnabled());
  check((await runtime(client, template)).id === before.id, "Adapter restart replaced accepted runtime");
  return { sameRuntime: true, durableMapping: true };
}

async function webuiRequest(account, endpoint, method = "GET", body) {
  const response = await fetch(`${webOrigin}/api/v1/${endpoint}`, {
    method, headers: { authorization: `Bearer ${account.token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(300000)
  });
  return response;
}

export async function twoUsersAndQuota(ctx, operator, template, browser, admin, credentials) {
  const userContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await userContext.newPage();
    page.setDefaultTimeout(45000);
    const user = await signup(page, credentials, true);
    // Grant this named account access through OpenWebUI's supported admin API.
    // The initial connection itself was created and verified in the native UI.
    const config = await (await webuiRequest(admin, "configs/terminal_servers")).json();
    const connection = config.TERMINAL_SERVER_CONNECTIONS.find(item => item.id === "harakiri");
    check(connection, "Native connection was not persisted");
    connection.config = { ...connection.config, access_grants: [{ principal_type: "user", principal_id: user.id, permission: "read" }] };
    check((await webuiRequest(admin, "configs/terminal_servers", "POST", config)).ok, "Named connection grant failed");
    const first = await runtime(operator.client, template);
    // The organization is still limited to one slot by the real onboarding fixture.
    await page.reload();
    const denial = page.waitForResponse(response => response.url().includes("/api/v1/terminals/harakiri/") && response.status() === 429, { timeout: 300000 });
    await selectTerminal(page);
    await denial;
    check((await runtime(operator.client, template)).id === first.id, "Quota denial allocated an extra runtime");
    const { capacity } = await operator.client.capacity();
    await operator.request("/v1/org/settings", "PATCH", { maxConcurrency: 2, expectedCapacityRevision: capacity.revision });
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await until("Second user native file browser", async () => {
      const all = (await operator.client.listSandboxes()).sandboxes.filter(item => item.template === template && item.status === "running");
      return all.length === 2;
    }, 300000);
    const files = page.getByRole("region", { name: "File browser", exact: true });
    check(await files.getByText("demo", { exact: true }).count() === 0, "Second user sees first workspace");
    const forged = await fetch(`${webOrigin}/api/v1/terminals/harakiri/files/list?path=/workspace/demo`, {
      headers: { authorization: `Bearer ${user.token}`, "x-user-id": admin.id }, signal: AbortSignal.timeout(60000)
    });
    check(!forged.ok, "Forged identity exposed another workspace");
    const unauthenticated = await fetch(`${adapterOrigin}/files/list?path=/workspace`, {
      headers: { "x-user-id": admin.id }, signal: AbortSignal.timeout(10000)
    });
    check(unauthenticated.status === 401, "Adapter trusted unsigned identity");
    ctx.save("openwebui-second-user.json", { id: user.id });
    return { nativeQuotaDenial: true, twoUsers: true, identityTamperingDenied: true, noDuplicateRuntime: true };
  } finally { await userContext.close(); }
}

export async function replaceRuntime(ctx, operator, template, page) {
  const workspaces = (await operator.client.workspaces.list()).workspaces;
  const live = (await operator.client.listSandboxes()).sandboxes.filter(item => item.template === template && item.status === "running");
  const original = live.find(item => workspaces.some(workspace => workspace.attachedSandboxId === item.id));
  check(original, "Owned retained runtime missing");
  // Only this test's accepted runtime; no provider exec or database state changes.
  const workspace = workspaces.find(item => item.attachedSandboxId === original.id);
  ctx.save("openwebui-replacement.json", { sandboxId: original.id, workspaceId: workspace.id });
  await operator.client.killSandbox(original.id);
  await until("Confirmed retained workspace release", async () => {
    const current = (await operator.client.workspaces.get(workspace.id)).workspace;
    return current.status === "available" && !current.attachedSandboxId;
  }, 180000);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  let replacement;
  await until("Replacement ready through native browser", async () => {
    const current = (await operator.client.workspaces.get(workspace.id)).workspace;
    if (!current.attachedSandboxId || current.attachedSandboxId === original.id) return false;
    replacement = await runtime(operator.client, template);
    return replacement.id === current.attachedSandboxId && replacement.status === "running";
  }, 300000);
  const result = await operator.client.files.read(replacement.id, "/workspace/demo/report.json");
  assert.deepEqual(JSON.parse(result.content), { North: 17, South: 7, total: 24 }, "Retained report differs after runtime replacement");
  return { confirmedRelease: true, retainedWorkspace: true, replacement: true };
}

export async function revokeAndRecover(ctx, client, template, page, admin) {
  const before = await runtime(client, template);
  const terminal = page.getByRole("button", { name: "Open terminal", exact: true });
  const socketOpened = page.waitForEvent("websocket", socket => new URL(socket.url()).pathname.includes("/api/v1/terminals/harakiri/api/terminals/"));
  if (!(await terminal.isVisible())) await page.getByRole("button", { name: "Close terminal", exact: true }).click();
  await terminal.click();
  const socket = await socketOpened;
  await until("Native terminal ready before revocation", () => page.locator(".xterm-helper-textarea").isVisible());
  let closed = false;
  socket.on("close", () => { closed = true; });
  await client.routes.delete(before.id, 8000);
  await until("Revoked native terminal disconnected", () => closed, 15000);
  const denied = await webuiRequest(admin, "terminals/harakiri/files/list?path=/workspace");
  check(!denied.ok, "Revoked grant accepted a fresh native request");
  const inspect = JSON.parse(ownedDocker(ctx, "adapter", ["exec"], ["node", "integrations/openwebui/dist/operator.js", "inspect", "--user-id", admin.id]));
  check(typeof inspect.generation === "string", "Operator generation missing");
  ownedDocker(ctx, "adapter", ["exec"], ["node", "integrations/openwebui/dist/operator.js", "reset-grant", "--user-id", admin.id, "--expect-generation", inspect.generation]);
  const recovered = await webuiRequest(admin, "terminals/harakiri/files/list?path=/workspace/demo");
  check(recovered.ok, "Operator reset did not recover native file access");
  check((await runtime(client, template)).id === before.id, "Grant recovery replaced runtime");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  return { revokedSocketClosed: true, revokedHttpDenied: true, operatorGrantRecovered: true, sameRuntime: true };
}
