import type {
  ApiErrorResponse,
  ApiKeysResponse,
  CreateTemplateBody,
  CreateTemplateBuildBody,
  CreateSandboxBody,
  CreateSandboxResponse,
  ExposeSandboxRouteBody,
  OkResponse,
  PromoteTemplateBody,
  RegistryCredentialResponse,
  RegistryCredentialsResponse,
  RunSandboxBody,
  RunSandboxResponse,
  SandboxFilesResponse,
  SandboxLogsResponse,
  SandboxResponse,
  SandboxRouteResponse,
  SandboxRoutesResponse,
  SandboxesResponse,
  TemplateBuildContextResponse,
  TemplateBuildLogsResponse,
  TemplateBuildResponse,
  TemplateBuildsResponse,
  TemplateResponse,
  TemplatesResponse,
  TemplateVersionsResponse,
  UpsertRegistryCredentialBody,
  UploadTemplateBuildContextBody,
  UsageSummary
} from "@harakiri/shared";
import { formatApiErrorResponse, parseApiErrorResponse } from "@harakiri/shared";

export type HarakiriClientOptions = {
  apiUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
};

export type CreateSandboxInput = CreateSandboxBody;

export type RunSandboxInput = RunSandboxBody;

export type ExposePortInput = ExposeSandboxRouteBody;

export type CreateTemplateInput = CreateTemplateBody;

export type CreateTemplateBuildInput = CreateTemplateBuildBody;

export type UploadTemplateBuildContextInput = UploadTemplateBuildContextBody;

export type UpsertRegistryCredentialInput = UpsertRegistryCredentialBody;

export class HarakiriApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly details: ApiErrorResponse | null = parseApiErrorResponse(body)
  ) {
    super(formatApiErrorResponse(status, body));
  }

  get code() {
    return this.details?.error;
  }
}

export class HarakiriClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HarakiriClientOptions) {
    if (!options.apiUrl) throw new Error("apiUrl is required");
    if (!options.apiKey) throw new Error("apiKey is required");
    this.apiUrl = options.apiUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? fetch;
  }

  private async request<T>(path: string, init: RequestInit = {}) {
    const hasBody = init.body !== undefined;
    const response = await this.fetchImpl(`${this.apiUrl}${path}`, {
      ...init,
      headers: {
        ...(hasBody ? { "content-type": "application/json" } : {}),
        "x-api-key": this.apiKey,
        ...(init.headers ?? {})
      }
    });
    if (!response.ok) throw new HarakiriApiError(response.status, await response.text());
    return (await response.json()) as T;
  }

  listTemplates() {
    return this.request<TemplatesResponse>("/v1/templates");
  }

  createTemplate(input: CreateTemplateInput) {
    return this.request<TemplateResponse>("/v1/templates", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  getTemplate(id: string) {
    return this.request<TemplateResponse>(`/v1/templates/${encodeURIComponent(id)}`);
  }

  listTemplateVersions(id: string) {
    return this.request<TemplateVersionsResponse>(`/v1/templates/${encodeURIComponent(id)}/versions`);
  }

  createTemplateBuild(id: string, input: CreateTemplateBuildInput = {}) {
    return this.request<TemplateBuildResponse>(`/v1/templates/${encodeURIComponent(id)}/builds`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  listTemplateBuilds(params = "") {
    return this.request<TemplateBuildsResponse>(`/v1/template-builds${params}`);
  }

  getTemplateBuild(id: string) {
    return this.request<TemplateBuildResponse>(`/v1/template-builds/${encodeURIComponent(id)}`);
  }

  getTemplateBuildLogs(id: string) {
    return this.request<TemplateBuildLogsResponse>(`/v1/template-builds/${encodeURIComponent(id)}/logs`);
  }

  uploadTemplateBuildContext(id: string, input: UploadTemplateBuildContextInput) {
    return this.request<TemplateBuildContextResponse>(`/v1/template-builds/${encodeURIComponent(id)}/context`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  cancelTemplateBuild(id: string) {
    return this.request<TemplateBuildResponse>(`/v1/template-builds/${encodeURIComponent(id)}/cancel`, { method: "POST" });
  }

  retryTemplateBuild(id: string) {
    return this.request<TemplateBuildResponse>(`/v1/template-builds/${encodeURIComponent(id)}/retry`, { method: "POST" });
  }

  promoteTemplateVersion(id: string, versionId: string, alias = "stable") {
    const body: PromoteTemplateBody = { versionId, alias };
    return this.request<TemplateResponse>(`/v1/templates/${encodeURIComponent(id)}/promote`, {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  archiveTemplate(id: string) {
    return this.request<TemplateResponse>(`/v1/templates/${encodeURIComponent(id)}/archive`, { method: "POST" });
  }

  listSandboxes(params = "") {
    return this.request<SandboxesResponse>(`/v1/sandboxes${params}`);
  }

  createSandbox(input: CreateSandboxInput = {}) {
    return this.request<CreateSandboxResponse>("/v1/sandboxes", {
      method: "POST",
      body: JSON.stringify({
        template: input.template ?? "python-3.12-data",
        name: input.name,
        ttlSeconds: input.ttlSeconds ?? 300,
        env: input.env,
        idempotencyKey: input.idempotencyKey,
        wait: input.wait,
        waitTimeoutMs: input.waitTimeoutMs
      })
    });
  }

  getSandbox(id: string) {
    return this.request<SandboxResponse>(`/v1/sandboxes/${id}`);
  }

  runSandbox(id: string, input: RunSandboxInput) {
    return this.request<RunSandboxResponse>(`/v1/sandboxes/${id}/run`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  getSandboxLogs(id: string) {
    return this.request<SandboxLogsResponse>(`/v1/sandboxes/${id}/logs`);
  }

  listSandboxFiles(id: string, path?: string) {
    return this.request<SandboxFilesResponse>(`/v1/sandboxes/${id}/files${path ? `?path=${encodeURIComponent(path)}` : ""}`);
  }

  killSandbox(id: string) {
    return this.request<OkResponse>(`/v1/sandboxes/${id}`, { method: "DELETE" });
  }

  listRoutes(id: string) {
    return this.request<SandboxRoutesResponse>(`/v1/sandboxes/${id}/routes`);
  }

  exposePort(id: string, input: ExposePortInput) {
    return this.request<SandboxRouteResponse>(`/v1/sandboxes/${id}/routes`, {
      method: "POST",
      body: JSON.stringify({ port: input.port, protocol: input.protocol ?? "http" })
    });
  }

  async getHost(id: string, port: number) {
    const result = await this.exposePort(id, { port });
    return result.route.url;
  }

  listApiKeys() {
    return this.request<ApiKeysResponse>("/v1/api-keys");
  }

  listRegistryCredentials(options: { includeRevoked?: boolean } = {}) {
    return this.request<RegistryCredentialsResponse>(`/v1/registry-credentials${options.includeRevoked ? "?includeRevoked=1" : ""}`);
  }

  upsertRegistryCredential(input: UpsertRegistryCredentialInput) {
    return this.request<RegistryCredentialResponse>("/v1/registry-credentials", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  revokeRegistryCredential(id: string) {
    return this.request<RegistryCredentialResponse>(`/v1/registry-credentials/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  usage() {
    return this.request<UsageSummary>("/v1/usage");
  }
}
