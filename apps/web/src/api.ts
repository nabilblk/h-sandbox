import type { ApiKeySummary, SandboxRouteSummary, SandboxSummary, Template, TemplateBuildLogEntry, TemplateBuildSummary, UsageSummary } from "@harakiri/shared";
import { auth } from "./auth";

const API_URL = import.meta.env.PUBLIC_API_URL ?? import.meta.env.VITE_PUBLIC_API_URL ?? "http://127.0.0.1:18082";
const API_KEY = import.meta.env.PUBLIC_API_KEY ?? import.meta.env.VITE_PUBLIC_API_KEY;

const request = async <T>(path: string, init: RequestInit = {}) => {
  const hasBody = init.body !== undefined;
  const token = auth.token();
  if (!token && !API_KEY) throw new Error("Missing authentication. Sign in with Keycloak or configure PUBLIC_API_KEY.");
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(hasBody ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : { "x-api-key": API_KEY }),
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
};

export const api = {
  me: () => request<{ user?: { id: string; email: string; fullName: string; onboardingCompletedAt: string | null }; organization: { name: string; slug: string; idleTtlSeconds: number; maxConcurrency: number; defaultTemplateId: string } }>("/v1/me"),
  completeOnboarding: () => request<{ user: { id: string; email: string; fullName: string; onboardingCompletedAt: string } }>("/v1/me/onboarding/complete", { method: "POST" }),
  sandboxes: (params = "") => request<{ sandboxes: SandboxSummary[] }>(`/v1/sandboxes${params}`),
  sandbox: (id: string) => request<{ sandbox: SandboxSummary }>(`/v1/sandboxes/${id}`),
  createSandbox: (body: { template: string; name?: string; ttlSeconds: number }) =>
    request<{ sandbox: SandboxSummary }>("/v1/sandboxes", { method: "POST", body: JSON.stringify(body) }),
  killSandbox: (id: string) => request<{ ok: boolean }>(`/v1/sandboxes/${id}`, { method: "DELETE" }),
  run: (id: string, body: { command?: string; stdin?: string }) =>
    request<{ result: { stdout: string; stderr: string; exitCode: number; durationMs: number } }>(`/v1/sandboxes/${id}/run`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  logs: (id: string) => request<{ logs: Array<{ ts: string; lvl: string; msg: string; source?: string }> }>(`/v1/sandboxes/${id}/logs`),
  files: (id: string, path = "/") =>
    request<{
      cwd: string;
      files: Array<{ path: string; name: string; type: string; size: number; mode?: string; owner?: string; group?: string; modifiedAt?: string | null }>;
    }>(`/v1/sandboxes/${id}/files?path=${encodeURIComponent(path)}`),
  metrics: (id: string) =>
    request<{ current: { cpu: number; mem: number; diskIo: number; networkOut: number; cpuCount?: number; memTotal?: number }; series: Array<{ ts: string; cpu: number; mem: number }> }>(
      `/v1/sandboxes/${id}/metrics`
    ),
  routes: (id: string) => request<{ routes: SandboxRouteSummary[] }>(`/v1/sandboxes/${id}/routes`),
  exposeRoute: (id: string, body: { port: number; protocol?: "http" | "https" }) =>
    request<{ route: SandboxRouteSummary }>(`/v1/sandboxes/${id}/routes`, { method: "POST", body: JSON.stringify(body) }),
  templates: (params = "") => request<{ templates: Template[]; page?: { total: number; limit: number; offset: number } }>(`/v1/templates${params}`),
  createTemplateBuild: (id: string, body: { sourceType?: "dockerfile" | "git" | "image"; dockerfilePath?: string; imageDestination?: string; metadata?: Record<string, unknown> } = {}) =>
    request<{ build: TemplateBuildSummary }>(`/v1/templates/${encodeURIComponent(id)}/builds`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  templateBuilds: (params = "") => request<{ builds: TemplateBuildSummary[] }>(`/v1/template-builds${params}`),
  templateBuildLogs: (id: string) => request<{ logs: TemplateBuildLogEntry[] }>(`/v1/template-builds/${encodeURIComponent(id)}/logs`),
  cancelTemplateBuild: (id: string) => request<{ build: TemplateBuildSummary }>(`/v1/template-builds/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
  retryTemplateBuild: (id: string) => request<{ build: TemplateBuildSummary }>(`/v1/template-builds/${encodeURIComponent(id)}/retry`, { method: "POST" }),
  archiveTemplate: (id: string) => request<{ template: Template }>(`/v1/templates/${encodeURIComponent(id)}/archive`, { method: "POST" }),
  keys: () => request<{ keys: ApiKeySummary[] }>("/v1/api-keys"),
  createKey: (name: string) => request<{ key: ApiKeySummary; token: string }>("/v1/api-keys", { method: "POST", body: JSON.stringify({ name }) }),
  revokeKey: (id: string) => request<{ ok: boolean }>(`/v1/api-keys/${id}`, { method: "DELETE" }),
  usage: () => request<UsageSummary>("/v1/usage"),
  settings: () => request<{ organization: { name: string; slug: string; idleTtlSeconds: number; maxConcurrency: number; defaultTemplateId: string } }>("/v1/org/settings"),
  updateSettings: (body: Record<string, unknown>) =>
    request<{ organization: { name: string; slug: string; idleTtlSeconds: number; maxConcurrency: number; defaultTemplateId: string } }>("/v1/org/settings", {
      method: "PATCH",
      body: JSON.stringify(body)
    })
};
