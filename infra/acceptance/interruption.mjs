import { check, until } from "./context.mjs";
import { literalId, query, replicas, writers } from "./operator.mjs";
import { assertRetained, denyAtCapacity, released, run } from "./workload.mjs";
import { probeCredential } from "./credential-fixture.mjs";

function heldRuntime(ctx, state) {
  const row = JSON.parse(query(ctx, `SELECT json_build_object('nativeId', s.opensandbox_id, 'held', (SELECT count(*) FROM sandbox_capacity_reservations r WHERE r.sandbox_id=s.id AND r.released_at IS NULL), 'attached', (SELECT attached_sandbox_id FROM persistent_workspaces WHERE id=${literalId(state.workspaceId)})) FROM sandboxes s WHERE s.id=${literalId(state.sandboxId)};`, state.databaseDeployment));
  check(row.nativeId && row.held === 1 && row.attached === state.sandboxId, "Provider uncertainty released execution or storage ownership");
  return row.nativeId;
}

export function ownedVaultEndpoint(endpoint, providerId) {
  literalId(providerId);
  const origin = "http://127.0.0.1:28486";
  const value = endpoint.endpoint ?? endpoint.url;
  check(typeof value === "string" && value.length > 0, "Owned provider proxy endpoint unavailable");
  const url = new URL(value.includes("://") || value.startsWith("/") ? value : `http://${value}`, origin);
  check(url.origin === origin && !url.username && !url.password && !url.search && !url.hash
    && url.pathname === `/v1/sandboxes/${providerId}/proxy/18080`, "Provider proxy escaped the owned endpoint");
  const headers = new Headers(endpoint.headers);
  check(headers.has("OPENSANDBOX-EGRESS-AUTH"), "Owned provider egress authentication unavailable");
  return { url: `${url.href}/credential-vault`, headers };
}

async function removeProviderEntry(ctx, providerId, attachment) {
  await ctx.forward("opensandbox-server", 28486, 80);
  const key = ctx.read("secrets.json").items.find(item => item.metadata.name === "preview-api").stringData.OPEN_SANDBOX_API_KEY;
  const endpointResponse = await fetch(`http://127.0.0.1:28486/v1/sandboxes/${encodeURIComponent(providerId)}/endpoints/18080?use_server_proxy=true`, {
    headers: { "OPEN-SANDBOX-API-KEY": key }, signal: AbortSignal.timeout(15000)
  });
  check(endpointResponse.ok, "Owned provider sidecar resolution failed");
  // Server-proxy endpoints deliberately omit the ingress gateway routing header.
  const { url, headers } = ownedVaultEndpoint(await endpointResponse.json(), providerId);
  const current = await fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(15000) });
  check(current.ok, "Owned provider Vault inspection failed");
  const vault = await current.json();
  check(vault.credentials.some(item => item.name === attachment.credentialName) && vault.bindings.some(item => item.name === attachment.bindingName), "Owned attachment is absent before state-loss injection");
  headers.set("content-type", "application/json");
  const changed = await fetch(url, {
    method: "PATCH", headers, redirect: "error", signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ expectedRevision: vault.revision, credentials: { delete: [attachment.credentialName] }, bindings: { delete: [attachment.bindingName] } })
  });
  check(changed.ok, "Owned provider state-loss injection failed");
}

export async function interruption(ctx, operator) {
  const { client } = operator;
  console.log("Interruption step: start once-only surviving command");
  const state = ctx.read("recovered-workload.json");
  const nativeId = heldRuntime(ctx, state);
  const code = "import time\nwith open('/workspace/execution-starts.txt', 'a') as f:\n f.write('started\\n')\n f.flush()\ntime.sleep(1200)\n";
  await client.files.write(state.sandboxId, { path: "/workspace/survivor.py", content: code });
  const { command } = await client.commands.start(state.sandboxId, { command: "python3 /workspace/survivor.py", cwd: "/workspace", detached: true, timeoutMs: 600000 });
  await until("Detached workload started", async () => {
    try { return (await client.files.read(state.sandboxId, "/workspace/execution-starts.txt")).content === "started\n"; }
    catch (error) { if ([404, 500].includes(error.status)) return false; throw error; }
  });
  console.log("Interruption step: remove provider API and restart Harakiri writers");
  await replicas(ctx, ["opensandbox-server"], 0);
  await replicas(ctx, writers, 0);
  await replicas(ctx, writers, 1);
  await ctx.forward("harakiri-api", 28482, 8080);
  check(heldRuntime(ctx, state) === nativeId, "Control-plane restart changed runtime identity");
  await denyAtCapacity(client, state.templateId, true);
  check(heldRuntime(ctx, state) === nativeId, "Denied creation changed the surviving runtime");
  await replicas(ctx, ["opensandbox-server"], 1);
  console.log("Interruption step: verify surviving runtime and retained admission");
  await client.waitForSandbox(state.sandboxId, { timeoutMs: 180000 });
  await assertRetained(client, state.sandboxId, state);
  check((await client.files.read(state.sandboxId, "/workspace/execution-starts.txt")).content === "started\n", "A restart duplicated the long-running command");
  check((await client.commands.get(state.sandboxId, command.id)).command.status === "running", "Detached command did not survive the control-plane restart");
  await client.commands.kill(state.sandboxId, command.id);
  await probeCredential(client, state.sandboxId, true);
  await replicas(ctx, ["harakiri-scheduler"], 0);
  console.log("Interruption step: remove owned provider binding and rehydrate through Harakiri");
  await removeProviderEntry(ctx, nativeId, state.attachment);
  const inspection = await client.credentials.inspect(state.sandboxId);
  check(inspection.attachments.some(item => item.id === state.attachment.id && item.providerState === "missing"), "Provider loss was not reflected in desired-state inspection");
  await probeCredential(client, state.sandboxId, false);
  const restored = await client.credentials.rehydrate(state.sandboxId);
  check(restored.rehydrated === 1 && restored.failed === 0, "Harakiri did not rehydrate the lost provider credential");
  await probeCredential(client, state.sandboxId, true);
  await replicas(ctx, ["harakiri-scheduler"], 1);
  check(heldRuntime(ctx, state) === nativeId, "Vault recovery replaced the runtime or freed its slot");
  check((await run(client, state.sandboxId, "cat /workspace/execution-starts.txt")) === "started\n", "Provider recovery duplicated command execution");
  await released(client, state.sandboxId, state.workspaceId);
  return { providerInterruption: true, controlPlaneRestart: true, retainedOwnership: true, noDuplicateExecution: true, explicitVaultRehydration: true, confirmedRelease: true };
}
