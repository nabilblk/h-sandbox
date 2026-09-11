import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { check, origins, pinned, sha256, until } from "./context.mjs";

export const retainedPath = "/workspace/acceptance.txt";

export async function run(client, id, command, env) {
  const { result } = await client.runSandbox(id, { command, cwd: "/workspace", env, timeoutMs: 60000 });
  check(result.exitCode === 0, "Sandbox first-task command failed");
  return result.stdout;
}

export async function createRuntime(client, state, name) {
  const intent = { template: state.templateId, workspaceId: state.workspaceId, name, ttlSeconds: 3600, idempotencyKey: randomUUID(), wait: false };
  const created = await client.createSandbox(intent);
  const replay = await client.createSandbox(intent);
  check(created.sandbox.id === replay.sandbox.id, "An idempotent create duplicated a runtime");
  await client.waitForSandbox(created.sandbox.id, { timeoutMs: 600000 });
  return created.sandbox.id;
}

export async function released(client, sandboxId, workspaceId) {
  await client.killSandbox(sandboxId);
  await until("Confirmed capacity and workspace release", async () => {
    const { capacity } = await client.capacity();
    const { workspace } = await client.workspaces.get(workspaceId);
    return capacity.state === "enforced" && capacity.inUse === 0 && workspace.attachedSandboxId === null && workspace.status === "available";
  }, 180000);
}

export async function denyAtCapacity(client, template, allowUnavailable = false) {
  try {
    await client.createSandbox({ template, name: "must-not-admit", ttlSeconds: 3600, wait: false });
  } catch (error) {
    check((error.status === 409 && error.code === "organization_capacity_exceeded") || (allowUnavailable && error.status === 503 && error.code === "organization_capacity_unavailable"), "Create did not return the capacity contract");
    return;
  }
  throw new Error("Organization admitted work above its execution limit");
}

export async function assertRetained(client, id, state) {
  const file = await client.files.read(id, retainedPath);
  check(sha256(file.content) === state.fileSha256, "Workspace file changed across recovery or reattachment");
  const cwd = await run(client, id, "pwd");
  check(cwd.trim() === "/workspace", "Runtime working directory is incorrect");
}

export async function workload(ctx, operator) {
  const { client } = operator;
  console.log("Workload step: import published OpenCode template");
  const templateId = `acceptance-opencode-${ctx.identity.id}`;
  await client.createTemplate({ id: templateId, name: "Acceptance OpenCode", image: pinned.opencodeImage, visibility: "private", cpuCount: 1, memoryMb: 2048, workdir: "/workspace", defaultEntrypoint: ["sleep", "7200"], runtimeFamily: "custom" });
  const { build } = await client.createTemplateBuild(templateId, { sourceType: "image", imageDestination: pinned.opencodeImage });
  await until("Published OpenCode image import", async () => {
    const result = await client.getTemplateBuild(build.id);
    check(!["failed", "canceled"].includes(result.build.status), "Template image import failed");
    return result.build.status === "success";
  }, 600000);
  console.log("Workload step: allocate persistent workspace and create native runtime");
  const { workspace } = await client.workspaces.create({ name: `acceptance-${ctx.identity.id}` });
  const bytes = `Retained state from ${ctx.identity.id}\n${randomUUID()}\n`;
  const state = { templateId, workspaceId: workspace.id, fileSha256: sha256(bytes), runtimeIds: [] };
  ctx.save("workload.json", state);
  const id = await createRuntime(client, state, "native-amd64-first-task");
  state.runtimeIds.push(id);
  ctx.save("workload.json", state);
  await client.files.write(id, { path: retainedPath, content: bytes });
  console.log("Workload step: native OpenCode, capacity denial and published CLI");
  const stdout = await run(client, id, "uname -m && opencode --version && python3 -c 'print(6 * 7)'");
  check(stdout.includes("x86_64") && stdout.trim().endsWith("42"), "Native OpenCode model-free first task failed");
  await denyAtCapacity(client, templateId);
  const cliHome = path.join(ctx.identity.directory, "cli-home");
  fs.mkdirSync(cliHome, { mode: 0o700 });
  const env = { ...process.env, HOME: cliHome, HARAKIRI_API_URL: origins.api, HARAKIRI_API_KEY: ctx.read("client-key.json").token };
  const cli = path.join(ctx.consumer, "node_modules/@h-sandbox/cli/dist/index.js");
  const result = ctx.execute("node", [cli, "run", id, "--cmd", "python3 -c 'print(7 * 6)'", "--cwd", "/workspace"], "Published CLI first task", { env, timeout: 90000 });
  check(result.includes("42"), "Published CLI first task returned no expected output");
  console.log("Workload step: protected HTTP route");
  await client.commands.start(id, { command: "python3 -m http.server 8088 --bind 0.0.0.0", cwd: "/workspace", detached: true, timeoutMs: 600000 });
  const exposed = await client.routes.expose(id, { port: 8088, accessMode: "token" });
  check(new URL(exposed.route.url).origin === origins.api, "Protected route escaped the installed API origin");
  const headers = client.routes.headers(exposed);
  await until("Authenticated route first response", async () => {
    const response = await fetch(`${exposed.route.url.replace(/\/$/, "")}/acceptance.txt`, { headers, signal: AbortSignal.timeout(5000) });
    return response.ok && sha256(await response.text()) === state.fileSha256;
  }, 90000);
  const denied = await fetch(exposed.route.url, { signal: AbortSignal.timeout(10000), redirect: "manual" });
  check([401, 403].includes(denied.status), "Protected route allowed an anonymous request");
  await released(client, id, state.workspaceId);
  console.log("Workload step: reattach retained files to a replacement runtime");
  const second = await createRuntime(client, state, "retained-workspace-second-runtime");
  state.runtimeIds.push(second);
  ctx.save("workload.json", state);
  check(id !== second, "Persistence test did not replace the original runtime");
  await assertRetained(client, second, state);
  await released(client, second, state.workspaceId);
  return { ...state, modelFreeOpenCode: true, publishedCli: true, publishedSdk: true, protectedRoute: true, capacityDenial: true, idempotency: true, reattachment: true };
}
