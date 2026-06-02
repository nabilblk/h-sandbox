import type {
  CreateSandboxBody,
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
  SandboxRouteResponse,
  SandboxRoutesResponse,
  SandboxTerminalAttachTicketResponse,
  SandboxesResponse,
  TestSandboxEgressBody,
  TestSandboxEgressResponse
} from "@harakiri/shared";
import { request } from "./request";

export const sandboxesApi = {
  sandboxes: (params = "") => request<SandboxesResponse>(`/v1/sandboxes${params}`),
  sandbox: (id: string) => request<SandboxResponse>(`/v1/sandboxes/${id}`),
  createSandbox: (body: CreateSandboxBody) =>
    request<CreateSandboxResponse>("/v1/sandboxes", { method: "POST", body: JSON.stringify(body) }),
  killSandbox: (id: string) => request<OkResponse>(`/v1/sandboxes/${id}`, { method: "DELETE" }),
  run: (id: string, body: RunSandboxBody) =>
    request<RunSandboxResponse>(`/v1/sandboxes/${id}/run`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  commands: (id: string) => request<SandboxCommandsResponse>(`/v1/sandboxes/${id}/commands`),
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
  egress: (id: string) => request<SandboxEgressResponse>(`/v1/sandboxes/${id}/egress`),
  updateEgress: (id: string, body: PatchSandboxEgressBody) =>
    request<SandboxEgressResponse>(`/v1/sandboxes/${id}/egress`, { method: "PATCH", body: JSON.stringify(body) }),
  testEgress: (id: string, body: TestSandboxEgressBody) =>
    request<TestSandboxEgressResponse>(`/v1/sandboxes/${id}/egress/test`, { method: "POST", body: JSON.stringify(body) })
};
