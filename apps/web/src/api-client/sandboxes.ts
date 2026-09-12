import type {
  CreateSandboxBody,
  CreateSandboxSnapshotBody,
  CreateSandboxResponse,
  ExposeSandboxRouteBody,
  OkResponse,
  PatchSandboxEgressBody,
  RunSandboxBody,
  RunSandboxResponse,
  SandboxCommandResponse,
  SandboxCommandsResponse,
  SandboxEgressResponse,
  SandboxFilesResponse,
  SandboxLogsResponse,
  SandboxMetricsResponse,
  SandboxResponse,
  SandboxReadinessResponse,
  SandboxRouteResponse,
  SandboxRoutesResponse,
  SandboxSnapshotResponse,
  SandboxSnapshotsResponse,
  SandboxTerminalAttachTicketResponse,
  SandboxesResponse,
  TestSandboxEgressBody,
  TestSandboxEgressResponse
} from "@harakiri/shared";
import { observeCommandStream, type CommandStreamOptions } from "@h-sandbox/sdk";
import { request, requestResponse } from "./request";

export const sandboxesApi = {
  sandboxes: (params = "") => request<SandboxesResponse>(`/v1/sandboxes${params}`),
  sandbox: (id: string) => request<SandboxResponse>(`/v1/sandboxes/${id}`),
  sandboxReadiness: (id: string, signal?: AbortSignal) => request<SandboxReadinessResponse>(`/v1/sandboxes/${encodeURIComponent(id)}/readiness`, { signal }),
  createSandbox: (body: CreateSandboxBody) => {
    const idempotencyKey = body.idempotencyKey ?? crypto.randomUUID();
    return request<CreateSandboxResponse>("/v1/sandboxes", { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ ...body, idempotencyKey }) });
  },
  pauseSandbox: (id: string) => request<SandboxResponse>(`/v1/sandboxes/${id}/pause`, { method: "POST" }),
  resumeSandbox: (id: string, idempotencyKey: string = crypto.randomUUID()) => request<SandboxResponse>(`/v1/sandboxes/${id}/resume`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey } }),
  renewSandbox: (id: string) => request<OkResponse>(`/v1/sandboxes/${id}/renew`, { method: "POST" }),
  killSandbox: (id: string) => request<OkResponse>(`/v1/sandboxes/${id}`, { method: "DELETE" }),
  createSnapshot: (id: string, body: CreateSandboxSnapshotBody) =>
    request<SandboxSnapshotResponse>(`/v1/sandboxes/${id}/snapshots`, { method: "POST", body: JSON.stringify(body) }),
  snapshots: (params = "") => request<SandboxSnapshotsResponse>(`/v1/snapshots${params}`),
  snapshot: (id: string) => request<SandboxSnapshotResponse>(`/v1/snapshots/${encodeURIComponent(id)}`),
  deleteSnapshot: (id: string) => request<OkResponse>(`/v1/snapshots/${encodeURIComponent(id)}`, { method: "DELETE" }),
  run: (id: string, body: RunSandboxBody) =>
    request<RunSandboxResponse>(`/v1/sandboxes/${id}/run`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  commands: (id: string) => request<SandboxCommandsResponse>(`/v1/sandboxes/${id}/commands`),
  command: (id: string, commandId: string, signal?: AbortSignal) => request<SandboxCommandResponse>(`/v1/sandboxes/${encodeURIComponent(id)}/commands/${encodeURIComponent(commandId)}`, { signal }),
  startCommand: (id: string, command: string, cwd: string, options: { timeoutMs?: number } = {}) => request<SandboxCommandResponse>(`/v1/sandboxes/${encodeURIComponent(id)}/commands`, {
    method: "POST", body: JSON.stringify({ command, cwd, detached: true, timeoutMs: options.timeoutMs ?? 300_000 })
  }),
  streamCommand: (id: string, commandId: string, options: CommandStreamOptions = {}) => observeCommandStream(
    (cursor, signal) => requestResponse(`/v1/sandboxes/${encodeURIComponent(id)}/commands/${encodeURIComponent(commandId)}/events${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { signal, headers: { accept: "text/event-stream" } }),
    commandId, options
  ),
  killCommand: (id: string, commandId: string) =>
    request<SandboxCommandResponse>(`/v1/sandboxes/${id}/commands/${encodeURIComponent(commandId)}`, { method: "DELETE" }),
  terminalAttachTicket: (id: string) =>
    request<SandboxTerminalAttachTicketResponse>(`/v1/sandboxes/${id}/terminal/attach-ticket`, { method: "POST" }),
  logs: (id: string) => request<SandboxLogsResponse>(`/v1/sandboxes/${id}/logs`),
  files: (id: string, path?: string) =>
    request<SandboxFilesResponse>(`/v1/sandboxes/${id}/files${path ? `?path=${encodeURIComponent(path)}` : ""}`),
  metrics: (id: string) =>
    request<SandboxMetricsResponse>(`/v1/sandboxes/${id}/metrics`),
  routes: (id: string) => request<SandboxRoutesResponse>(`/v1/sandboxes/${id}/routes`),
  exposeRoute: (id: string, body: ExposeSandboxRouteBody) =>
    request<SandboxRouteResponse>(`/v1/sandboxes/${id}/routes`, { method: "POST", body: JSON.stringify(body) }),
  deleteRoute: (id: string, port: number) =>
    request<SandboxRouteResponse>(`/v1/sandboxes/${id}/routes/${encodeURIComponent(String(port))}`, { method: "DELETE" }),
  egress: (id: string) => request<SandboxEgressResponse>(`/v1/sandboxes/${id}/egress`),
  updateEgress: (id: string, body: PatchSandboxEgressBody) =>
    request<SandboxEgressResponse>(`/v1/sandboxes/${id}/egress`, { method: "PATCH", body: JSON.stringify(body) }),
  testEgress: (id: string, body: TestSandboxEgressBody) =>
    request<TestSandboxEgressResponse>(`/v1/sandboxes/${id}/egress/test`, { method: "POST", body: JSON.stringify(body) })
};
