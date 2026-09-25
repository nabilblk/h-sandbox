import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { HarakiriClient, type SandboxSummary, type SandboxCommandSummary } from "@h-sandbox/sdk";

export type RequestRecord = { url: URL; method: string; body: Record<string, unknown>; signal?: AbortSignal | null };
export const digest = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
export const apiError = (code: string, status = 400) => Response.json({ error: code, message: "Synthetic failure" }, { status });

/** Protocol fixture only: no shell commands, model inference or external service access. */
export function fixture(id = "sbx_framework") {
  const requests: RequestRecord[] = [];
  const files = new Map<string, Uint8Array>();
  const commands = new Map<string, SandboxCommandSummary>();
  const summary = {
    id, status: "running", capacityPhase: "active",
    runtimeMetadata: { workdir: "/app", limits: { fileArtifactMaxBytes: 16_777_216, commandTimeoutMs: 30_000 } }
  } as SandboxSummary;
  const state = {
    requests, files, commands, summary,
    override: undefined as undefined | ((request: RequestRecord) => Response | undefined | Promise<Response | undefined>),
    output: { stdout: "ok\n", stderr: "", exitCode: 0, stdoutTruncated: false, stderrTruncated: false },
    onCommand: undefined as undefined | ((command: string) => void)
  };
  const fetch: typeof globalThis.fetch = async (url, init) => {
    assert.equal(new Headers(init?.headers).get("x-api-key"), "synthetic-framework-key");
    const request = {
      url: new URL(String(url)), method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}, signal: init?.signal
    };
    assert.equal(request.url.origin, "https://harakiri.example.invalid");
    requests.push(request);
    const overridden = await state.override?.(request);
    if (overridden) return overridden;
    const path = request.url.pathname;
    const prefix = `/v1/sandboxes/${id}`;
    if (path === "/v1/sandboxes" && request.method === "POST") return Response.json({ sandbox: summary }, { status: 202 });
    if (path === prefix && request.method === "DELETE") {
      summary.status = "terminated"; summary.capacityPhase = "released";
      return Response.json({ ok: true });
    }
    if (path === prefix) return Response.json({ sandbox: summary });
    if (path === `${prefix}/readiness`) return Response.json({ sandbox: summary, readiness: { status: "ready" } });
    if (path === `${prefix}/files/mkdir`) return Response.json({ file: { path: request.body.path, type: "directory" } });
    if (path === `${prefix}/run` && request.method === "POST") {
      state.onCommand?.(String(request.body.command));
      return Response.json({ result: { ...state.output } });
    }
    if (path === `${prefix}/commands` && request.method === "POST") {
      const commandId = `cmd_${commands.size + 1}`;
      state.onCommand?.(String(request.body.command));
      const command = {
        ...request.body, id: commandId, sandboxId: id,
        status: state.output.exitCode === 0 ? "succeeded" : "failed",
        exitCode: state.output.exitCode, finishReason: "exit", stdout: "summary is not the log archive", stderr: ""
      } as SandboxCommandSummary;
      commands.set(commandId, command);
      return Response.json({ command });
    }
    const commandId = path.slice(`${prefix}/commands/`.length).split("/")[0];
    if (path.startsWith(`${prefix}/commands/`) && commands.has(commandId)) {
      if (path.endsWith("/logs")) return Response.json({ commandId, ...state.output });
      return Response.json({ command: commands.get(commandId) });
    }
    if (path === `${prefix}/files/upload`) {
      const bytes = Buffer.from(String(request.body.contentBase64), "base64");
      assert.equal(request.body.sha256, digest(bytes));
      assert.equal(request.body.sizeBytes, bytes.length);
      files.set(String(request.body.path), bytes);
      return Response.json({ file: { path: request.body.path }, sizeBytes: bytes.length, sha256: digest(bytes) });
    }
    const filePath = request.url.searchParams.get("path")!;
    if (path === `${prefix}/files/stat` || path === `${prefix}/files/download`) {
      const bytes = files.get(filePath);
      if (!bytes) return apiError("file_not_found", 404);
      if (path.endsWith("/stat")) return Response.json({ file: { path: filePath, size: bytes.length, type: "file" } });
      return Response.json({ path: filePath, sizeBytes: bytes.length, contentBase64: Buffer.from(bytes).toString("base64"), sha256: digest(bytes) });
    }
    throw new Error(`Unexpected fixture request: ${request.method} ${path}`);
  };
  const client = new HarakiriClient({ apiUrl: "https://harakiri.example.invalid", apiKey: "synthetic-framework-key", fetch });
  return { ...state, client, state, fetch, sandbox: client.sandboxes.wrap(summary) };
}
