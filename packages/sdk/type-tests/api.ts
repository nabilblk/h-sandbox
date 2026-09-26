import {
  HarakiriClient, type HarakiriSandbox, type SandboxCommandResponse,
  type SandboxRouteResponse, type WorkspaceResponse, type RunSandboxResponse,
  HarakiriRequestTimeoutError, type RequestOptions, type SandboxFileWriteResponse
} from "@h-sandbox/sdk";

// Compiled through the package's public .d.ts entry point; this function is never executed.
export async function checkPublicTypes(sandbox: HarakiriSandbox) {
  const request: RequestOptions = { requestTimeoutMs: 15_000, signal: new AbortController().signal };
  await sandbox.run({ command: "pwd" }, request);
  await sandbox.run("pwd", { ...request, timeoutMs: 10_000 });
  await sandbox.files.write({ path: "/input.txt", content: "text" }, request);
  await sandbox.files.write("input.txt", "text", request);
  await sandbox.files.readBytes("result.bin", request);
  await sandbox.processes.start({ command: "worker" }, request);
  await sandbox.waitForTermination({ ...request, timeoutMs: 1000 });
  const timeout: false = new HarakiriRequestTimeoutError(15_000, "POST").retryable;
  const result: RunSandboxResponse["result"] = await sandbox.run("pwd", { check: true });
  const envelope: RunSandboxResponse = await sandbox.run({ command: "pwd" });
  const text: string = await sandbox.files.readText("input.txt");
  const bytes: Uint8Array = await sandbox.files.readBytes("result.bin");
  const legacyWrite: SandboxFileWriteResponse = await sandbox.files.write({ path: "/input.txt", content: text });
  const filePath: string = (await sandbox.files.write("result.bin", bytes)).path;
  const task = await sandbox.processes.start({ command: "node worker.mjs" });
  const legacyCommand: SandboxCommandResponse = task;
  const legacyRoute: SandboxRouteResponse = await sandbox.routes.expose({ port: 3000, accessMode: "token" });
  const client = HarakiriClient.fromEnv({ env: { HARAKIRI_API_URL: "https://api.example.invalid", HARAKIRI_API_KEY: "dummy" }, requestTimeoutMs: 15_000 });
  await client.sandboxes.create({ template: "selected", wait: false }, request);
  await client.sandboxes.connect("authorized-id", request);
  const workspace = await client.workspaces.create({ name: "retained" });
  const legacyWorkspace: WorkspaceResponse = workspace;
  await workspace.wait({ timeoutMs: 1000, signal: AbortSignal.abort() });
  await sandbox.processes.connect(task.reference.commandId);
  await task.wait({ statuses: ["running"], signal: AbortSignal.abort() });
  await sandbox.kill({ wait: true, timeoutMs: 1000 });
  await sandbox.waitForTermination({ signal: AbortSignal.abort() });
  await client.sandboxes.list({ status: "running", q: "example", limit: 5 });
  // @ts-expect-error String overload returns a direct result, not a response envelope.
  result.result;
  // @ts-expect-error Existing object calls still return an envelope.
  envelope.stdout;
  // @ts-expect-error Not an advertised sandbox lifecycle status.
  await client.sandboxes.list({ status: "available" });
  // @ts-expect-error Structured arguments are not native argv support.
  await sandbox.run(["node", "worker.mjs"]);
  // @ts-expect-error Ordinary file content is text or bytes, not arbitrary objects.
  await sandbox.files.write("input", { arbitrary: true });
  // @ts-expect-error A file write needs content.
  await sandbox.files.write("input");
  return { result, envelope, legacyWrite, filePath, legacyCommand, legacyRoute, legacyWorkspace, timeout };
}
