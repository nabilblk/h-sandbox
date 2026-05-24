import type {
  ApiKeySummary,
  RunResult,
  SandboxRouteSummary,
  SandboxSummary,
  Template,
  TemplateBuildLogEntry,
  TemplateBuildSummary,
  TemplateVersionSummary,
  UsageSummary
} from "@harakiri/shared";

export type HarakiriClientOptions = {
  apiUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
};

export type CreateSandboxInput = {
  template?: string;
  name?: string;
  ttlSeconds?: number;
  env?: Record<string, string>;
};

export type RunSandboxInput = {
  command?: string;
  stdin?: string;
};

export type ExposePortInput = {
  port: number;
  protocol?: "http" | "https";
};

export type CreateTemplateInput = {
  id?: string;
  name: string;
  description?: string;
  image?: string;
  icon?: Template["icon"];
  tags?: string[];
  aliases?: string[];
  visibility?: Template["visibility"];
  defaultEntrypoint?: string[];
  cpuCount?: number;
  memoryMb?: number;
  workdir?: string;
  defaultPorts?: number[];
  runtimeFamily?: string;
};

export type CreateTemplateBuildInput = {
  sourceType?: "dockerfile" | "git" | "image";
  contextHash?: string;
  dockerfilePath?: string;
  buildArgs?: Record<string, unknown>;
  imageDestination?: string;
  metadata?: Record<string, unknown>;
};

export type UploadTemplateBuildContextInput = {
  archiveBase64: string;
  sha256: string;
  sizeBytes: number;
  format?: "tar+gzip";
  fileCount?: number;
  metadata?: Record<string, unknown>;
};

export type TemplateBuildContextSummary = {
  buildId: string;
  sha256: string;
  sizeBytes: number;
  format: string;
  fileCount: number | null;
  uploadedAt: string;
};

export class HarakiriApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string
  ) {
    super(`Harakiri API ${status}: ${body}`);
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
    return this.request<{ templates: Template[] }>("/v1/templates");
  }

  createTemplate(input: CreateTemplateInput) {
    return this.request<{ template: Template }>("/v1/templates", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  getTemplate(id: string) {
    return this.request<{ template: Template }>(`/v1/templates/${encodeURIComponent(id)}`);
  }

  listTemplateVersions(id: string) {
    return this.request<{ versions: TemplateVersionSummary[] }>(`/v1/templates/${encodeURIComponent(id)}/versions`);
  }

  createTemplateBuild(id: string, input: CreateTemplateBuildInput = {}) {
    return this.request<{ build: TemplateBuildSummary }>(`/v1/templates/${encodeURIComponent(id)}/builds`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  listTemplateBuilds(params = "") {
    return this.request<{ builds: TemplateBuildSummary[] }>(`/v1/template-builds${params}`);
  }

  getTemplateBuild(id: string) {
    return this.request<{ build: TemplateBuildSummary }>(`/v1/template-builds/${encodeURIComponent(id)}`);
  }

  getTemplateBuildLogs(id: string) {
    return this.request<{ logs: TemplateBuildLogEntry[] }>(`/v1/template-builds/${encodeURIComponent(id)}/logs`);
  }

  uploadTemplateBuildContext(id: string, input: UploadTemplateBuildContextInput) {
    return this.request<{ context: TemplateBuildContextSummary }>(`/v1/template-builds/${encodeURIComponent(id)}/context`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  cancelTemplateBuild(id: string) {
    return this.request<{ build: TemplateBuildSummary }>(`/v1/template-builds/${encodeURIComponent(id)}/cancel`, { method: "POST" });
  }

  retryTemplateBuild(id: string) {
    return this.request<{ build: TemplateBuildSummary }>(`/v1/template-builds/${encodeURIComponent(id)}/retry`, { method: "POST" });
  }

  promoteTemplateVersion(id: string, versionId: string, alias = "stable") {
    return this.request<{ template: Template }>(`/v1/templates/${encodeURIComponent(id)}/promote`, {
      method: "POST",
      body: JSON.stringify({ versionId, alias })
    });
  }

  archiveTemplate(id: string) {
    return this.request<{ template: Template }>(`/v1/templates/${encodeURIComponent(id)}/archive`, { method: "POST" });
  }

  listSandboxes(params = "") {
    return this.request<{ sandboxes: SandboxSummary[] }>(`/v1/sandboxes${params}`);
  }

  createSandbox(input: CreateSandboxInput = {}) {
    return this.request<{ sandbox: SandboxSummary }>("/v1/sandboxes", {
      method: "POST",
      body: JSON.stringify({
        template: input.template ?? "python-3.12-data",
        name: input.name,
        ttlSeconds: input.ttlSeconds ?? 300,
        env: input.env
      })
    });
  }

  getSandbox(id: string) {
    return this.request<{ sandbox: SandboxSummary }>(`/v1/sandboxes/${id}`);
  }

  runSandbox(id: string, input: RunSandboxInput) {
    return this.request<{ result: RunResult }>(`/v1/sandboxes/${id}/run`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  killSandbox(id: string) {
    return this.request<{ ok: boolean }>(`/v1/sandboxes/${id}`, { method: "DELETE" });
  }

  listRoutes(id: string) {
    return this.request<{ routes: SandboxRouteSummary[] }>(`/v1/sandboxes/${id}/routes`);
  }

  exposePort(id: string, input: ExposePortInput) {
    return this.request<{ route: SandboxRouteSummary }>(`/v1/sandboxes/${id}/routes`, {
      method: "POST",
      body: JSON.stringify({ port: input.port, protocol: input.protocol ?? "http" })
    });
  }

  async getHost(id: string, port: number) {
    const result = await this.exposePort(id, { port });
    return result.route.url;
  }

  listApiKeys() {
    return this.request<{ keys: ApiKeySummary[] }>("/v1/api-keys");
  }

  usage() {
    return this.request<UsageSummary>("/v1/usage");
  }
}
