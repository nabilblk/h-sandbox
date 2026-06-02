import type {
  ApiErrorResponse,
  ApiKeysResponse,
  CreateTemplateBody,
  CreateTemplateBuildBody,
  CreateSandboxCommandSessionBody,
  CreateSandboxCommandBody,
  CreateSandboxBody,
  CreateSandboxResponse,
  ExposeSandboxRouteBody,
  OkResponse,
  PromoteTemplateBody,
  RegistryCredentialResponse,
  RegistryCredentialsResponse,
  RunSandboxBody,
  RunSandboxResponse,
  RunSandboxCommandSessionBody,
  RunSandboxCommandSessionResponse,
  RuntimeCapabilitiesResponse,
  SandboxCommandLogsResponse,
  SandboxCommandResponse,
  SandboxCommandSessionResponse,
  SandboxCommandStatus,
  SandboxCommandsResponse,
  SandboxFilesResponse,
  SandboxFileMkdirBody,
  SandboxFileMkdirResponse,
  SandboxFileDownloadResponse,
  SandboxFileReadResponse,
  SandboxFileRemoveResponse,
  SandboxFileRenameBody,
  SandboxFileRenameResponse,
  SandboxFileStatResponse,
  SandboxFileUploadBody,
  SandboxFileUploadResponse,
  SandboxFileWriteBody,
  SandboxFileWriteResponse,
  SandboxEgressResponse,
  SandboxLogsResponse,
  SandboxMetricsResponse,
  SandboxResponse,
  SandboxRouteResponse,
  SandboxRouteSummary,
  SandboxRoutesResponse,
  SandboxStatus,
  SandboxTerminalAttachOptions,
  SandboxTerminalAttachTicketResponse,
  PatchSandboxEgressBody,
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
  TestSandboxEgressBody,
  TestSandboxEgressResponse,
  UsageSummary
} from "./protocol.js";
import {
  formatApiErrorResponse,
  parseApiErrorResponse,
  providerUnavailableApiErrorCodes,
  timeoutApiErrorCodes,
  unsupportedCapabilityApiErrorCodes
} from "./protocol.js";

export {
  egressPresetCatalog,
  egressPresetIds,
  providerUnavailableApiErrorCodes,
  runtimeCapabilityNames,
  sandboxCommandStatuses,
  sandboxRuntimeApiErrorCodes,
  sandboxStatuses,
  timeoutApiErrorCodes,
  unsupportedCapabilityApiErrorCodes
} from "./protocol.js";

export type {
  ApiErrorResponse,
  ApiKeysResponse,
  CreateTemplateBody,
  CreateTemplateBuildBody,
  CreateSandboxCommandSessionBody,
  CreateSandboxCommandBody,
  CreateSandboxBody,
  CreateSandboxResponse,
  ExposeSandboxRouteBody,
  OkResponse,
  PromoteTemplateBody,
  RegistryCredentialPurpose,
  RegistryCredentialResponse,
  RegistryCredentialsResponse,
  RunSandboxBody,
  RunSandboxResponse,
  RunSandboxCommandSessionBody,
  RunSandboxCommandSessionResponse,
  RuntimeCapabilitiesResponse,
  SandboxCommandLogsResponse,
  SandboxCommandResponse,
  SandboxCommandSessionResponse,
  SandboxCommandStatus,
  SandboxCommandsResponse,
  SandboxEgressResponse,
  SandboxFilesResponse,
  SandboxFileMkdirBody,
  SandboxFileMkdirResponse,
  SandboxFileDownloadResponse,
  SandboxFileReadResponse,
  SandboxFileRemoveResponse,
  SandboxFileRenameBody,
  SandboxFileRenameResponse,
  SandboxFileStatResponse,
  SandboxFileUploadBody,
  SandboxFileUploadResponse,
  SandboxFileWriteBody,
  SandboxFileWriteResponse,
  SandboxLogsResponse,
  SandboxMetricsResponse,
  SandboxResponse,
  SandboxRouteResponse,
  SandboxRouteSummary,
  SandboxRoutesResponse,
  SandboxStatus,
  SandboxTerminalAttachOptions,
  SandboxTerminalAttachTicketResponse,
  PatchSandboxEgressBody,
  SandboxesResponse,
  TemplateBuildContextResponse,
  TemplateBuildLogsResponse,
  TemplateBuildResponse,
  TemplateBuildsResponse,
  TemplateBuildSummary,
  TemplateResponse,
  TemplatesResponse,
  TemplateVersionsResponse,
  UpsertRegistryCredentialBody,
  UploadTemplateBuildContextBody,
  TestSandboxEgressBody,
  TestSandboxEgressResponse,
  UsageSummary
} from "./protocol.js";

export type HarakiriClientOptions = {
  apiUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
};

export type CreateSandboxInput = CreateSandboxBody;

export type RunSandboxInput = RunSandboxBody;
export type CreateSandboxCommandInput = CreateSandboxCommandBody;
export type CreateSandboxCommandSessionInput = CreateSandboxCommandSessionBody;
export type RunSandboxCommandSessionInput = RunSandboxCommandSessionBody;
export type TerminalAttachOptions = SandboxTerminalAttachOptions;
export type TerminalAttachRequest = {
  url: string;
  headers: Record<string, string>;
};

export type ExposePortInput = ExposeSandboxRouteBody;

export type RouteLike = SandboxRouteSummary | SandboxRouteResponse;

export type RouteBasicAuth = {
  username: string;
  password: string;
};

export type RouteAccessHeadersOptions = {
  basicAuth?: RouteBasicAuth;
};

export type CreateRouteFetchOptions = RouteAccessHeadersOptions & {
  fetch?: typeof fetch;
  headers?: HeadersInit;
};

export type WaitForRouteHttpOptions = CreateRouteFetchOptions & {
  path?: string;
  init?: RequestInit;
  timeoutMs?: number;
  intervalMs?: number;
  expect?: (response: Response) => boolean | Promise<boolean>;
};

export type ExposeAndWaitOptions = WaitForRouteHttpOptions;

export type WaitForSandboxOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  statuses?: SandboxStatus[];
};

export type WaitForCommandOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  statuses?: SandboxCommandStatus[];
};

export type GetCommandLogsOptions = {
  cursor?: number;
  tail?: number;
};

const isRouteResponse = (route: RouteLike): route is SandboxRouteResponse =>
  "route" in route && typeof route.route === "object" && route.route !== null;

const routeSummaryFor = (route: RouteLike) => isRouteResponse(route) ? route.route : route;

const routeTokenFor = (route: RouteLike) => isRouteResponse(route) ? route.accessToken : undefined;

const routeAccessHeaderNameFor = (route: RouteLike) => {
  if (isRouteResponse(route) && route.accessHeaderName) return route.accessHeaderName;
  return routeSummaryFor(route).accessHeaderName ?? undefined;
};

const encodeBase64 = (value: string) => {
  if (typeof Buffer !== "undefined") return Buffer.from(value, "utf8").toString("base64");
  return btoa(unescape(encodeURIComponent(value)));
};

const routeUrlFor = (route: RouteLike) => routeSummaryFor(route).url.replace(/\/+$/, "");

const routeRequestUrlFor = (route: RouteLike, input: string | URL | Request = "/") => {
  if (input instanceof Request) return input.url;
  const value = String(input);
  if (/^https?:\/\//i.test(value)) return value;
  return new URL(value.replace(/^\/?/, "/"), `${routeUrlFor(route)}/`).toString();
};

export const routeAccessHeaders = (route: RouteLike, options: RouteAccessHeadersOptions = {}) => {
  const headers: Record<string, string> = {};
  const accessToken = routeTokenFor(route);
  const accessHeaderName = routeAccessHeaderNameFor(route);
  if (accessToken && accessHeaderName) headers[accessHeaderName] = accessToken;
  if (options.basicAuth) {
    headers.authorization = `Basic ${encodeBase64(`${options.basicAuth.username}:${options.basicAuth.password}`)}`;
  }
  return headers;
};

export const createRouteFetch = (route: RouteLike, options: CreateRouteFetchOptions = {}) => {
  const fetchImpl = options.fetch ?? fetch;
  return (input: string | URL | Request = "/", init: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    const accessHeaders = routeAccessHeaders(route, options);
    for (const [key, value] of Object.entries(accessHeaders)) headers.set(key, value);
    return fetchImpl(routeRequestUrlFor(route, input), { ...init, headers });
  };
};

export const waitForRouteHttp = async (route: RouteLike, options: WaitForRouteHttpOptions = {}) => {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 500;
  const path = options.path ?? "/";
  const expect = options.expect ?? ((response: Response) => response.ok);
  const routeFetch = createRouteFetch(route, options);
  const started = Date.now();
  let lastError: unknown;
  let lastResponse: Response | null = null;
  while (Date.now() - started <= timeoutMs) {
    try {
      const response = await routeFetch(path, options.init);
      lastResponse = response;
      if (await expect(response)) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  const suffix = lastResponse ? `; last status ${lastResponse.status}` : lastError instanceof Error ? `; ${lastError.message}` : "";
  throw new HarakiriWaitTimeoutError(`Timed out waiting for route ${routeSummaryFor(route).url}${suffix}`, "route", routeSummaryFor(route).routeKey, lastResponse?.status ? String(lastResponse.status) : undefined);
};

export type CreateTemplateInput = CreateTemplateBody;

export type CreateTemplateBuildInput = CreateTemplateBuildBody;

export type UploadTemplateBuildContextInput = UploadTemplateBuildContextBody;

export type UpsertRegistryCredentialInput = UpsertRegistryCredentialBody;

export type HarakiriApiErrorCategory =
  | "authentication"
  | "authorization"
  | "validation"
  | "not_found"
  | "conflict"
  | "rate_limit"
  | "unsupported_capability"
  | "provider_unavailable"
  | "timeout"
  | "server"
  | "unknown";

export type HarakiriApiErrorOptions = {
  category?: HarakiriApiErrorCategory;
  retryable?: boolean;
};

export class HarakiriApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly details: ApiErrorResponse | null = parseApiErrorResponse(body),
    public readonly options: HarakiriApiErrorOptions = {}
  ) {
    super(formatApiErrorResponse(status, body));
  }

  get code() {
    return this.details?.error;
  }

  get category(): HarakiriApiErrorCategory {
    return this.options.category ?? "unknown";
  }

  get retryable() {
    return this.options.retryable ?? false;
  }
}

export class HarakiriAuthenticationError extends HarakiriApiError {
  constructor(status: number, body: string, details: ApiErrorResponse | null = parseApiErrorResponse(body)) {
    super(status, body, details, { category: "authentication", retryable: false });
  }
}

export class HarakiriAuthorizationError extends HarakiriApiError {
  constructor(status: number, body: string, details: ApiErrorResponse | null = parseApiErrorResponse(body)) {
    super(status, body, details, { category: "authorization", retryable: false });
  }
}

export class HarakiriValidationError extends HarakiriApiError {
  constructor(status: number, body: string, details: ApiErrorResponse | null = parseApiErrorResponse(body)) {
    super(status, body, details, { category: "validation", retryable: false });
  }
}

export class HarakiriNotFoundError extends HarakiriApiError {
  constructor(status: number, body: string, details: ApiErrorResponse | null = parseApiErrorResponse(body)) {
    super(status, body, details, { category: "not_found", retryable: false });
  }
}

export class HarakiriConflictError extends HarakiriApiError {
  constructor(status: number, body: string, details: ApiErrorResponse | null = parseApiErrorResponse(body)) {
    super(status, body, details, { category: "conflict", retryable: false });
  }
}

export class HarakiriRateLimitError extends HarakiriApiError {
  constructor(status: number, body: string, details: ApiErrorResponse | null = parseApiErrorResponse(body)) {
    super(status, body, details, { category: "rate_limit", retryable: true });
  }
}

export class HarakiriUnsupportedCapabilityError extends HarakiriApiError {
  constructor(status: number, body: string, details: ApiErrorResponse | null = parseApiErrorResponse(body)) {
    super(status, body, details, { category: "unsupported_capability", retryable: false });
  }
}

export class HarakiriProviderUnavailableError extends HarakiriApiError {
  constructor(status: number, body: string, details: ApiErrorResponse | null = parseApiErrorResponse(body)) {
    super(status, body, details, { category: "provider_unavailable", retryable: true });
  }
}

export class HarakiriTimeoutApiError extends HarakiriApiError {
  constructor(status: number, body: string, details: ApiErrorResponse | null = parseApiErrorResponse(body)) {
    super(status, body, details, { category: "timeout", retryable: true });
  }
}

export class HarakiriServerError extends HarakiriApiError {
  constructor(status: number, body: string, details: ApiErrorResponse | null = parseApiErrorResponse(body)) {
    super(status, body, details, { category: "server", retryable: true });
  }
}

export class HarakiriWaitTimeoutError extends Error {
  constructor(
    message: string,
    public readonly target: "sandbox" | "command" | "route",
    public readonly id: string,
    public readonly lastStatus?: string
  ) {
    super(message);
    this.name = "HarakiriWaitTimeoutError";
  }
}

const includesCode = (codes: readonly string[], code: string | undefined) => Boolean(code && codes.includes(code));
const isTimeoutCode = (code: string | undefined) => includesCode(timeoutApiErrorCodes, code) || Boolean(code && /timeout|timed_out/.test(code));
const isUnsupportedCapabilityCode = (code: string | undefined) =>
  includesCode(unsupportedCapabilityApiErrorCodes, code) || Boolean(code && /unsupported/.test(code));
const isProviderUnavailableCode = (code: string | undefined) =>
  includesCode(providerUnavailableApiErrorCodes, code) || Boolean(code && /(provider_unavailable|runtime_.*unavailable|upstream_unreachable)/.test(code));

export const createHarakiriApiError = (status: number, body: string) => {
  const details = parseApiErrorResponse(body);
  const code = details?.error;
  if (status === 401) return new HarakiriAuthenticationError(status, body, details);
  if (status === 403) return new HarakiriAuthorizationError(status, body, details);
  if (status === 400) return new HarakiriValidationError(status, body, details);
  if (status === 404) return new HarakiriNotFoundError(status, body, details);
  if (status === 408 || isTimeoutCode(code)) return new HarakiriTimeoutApiError(status, body, details);
  if (status === 409) return new HarakiriConflictError(status, body, details);
  if (status === 429) return new HarakiriRateLimitError(status, body, details);
  if (status === 501 || isUnsupportedCapabilityCode(code)) return new HarakiriUnsupportedCapabilityError(status, body, details);
  if (status === 502 || status === 503 || status === 504 || isProviderUnavailableCode(code)) {
    return new HarakiriProviderUnavailableError(status, body, details);
  }
  if (status >= 500) return new HarakiriServerError(status, body, details);
  return new HarakiriApiError(status, body, details, { category: "unknown", retryable: false });
};

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

  readonly commands = {
    start: (id: string, input: CreateSandboxCommandInput) => this.startCommand(id, input),
    run: (id: string, input: CreateSandboxCommandInput) => this.runCommand(id, input),
    list: (id: string) => this.listCommands(id),
    get: (id: string, commandId: string) => this.getCommand(id, commandId),
    logs: (id: string, commandId: string, options: GetCommandLogsOptions = {}) => this.getCommandLogs(id, commandId, options),
    kill: (id: string, commandId: string) => this.killCommand(id, commandId),
    wait: (id: string, commandId: string, options: WaitForCommandOptions = {}) => this.waitForCommand(id, commandId, options),
    sessions: {
      create: (id: string, input: CreateSandboxCommandSessionInput = {}) => this.createCommandSession(id, input),
      run: (id: string, sessionId: string, input: RunSandboxCommandSessionInput) => this.runCommandSession(id, sessionId, input),
      delete: (id: string, sessionId: string) => this.deleteCommandSession(id, sessionId)
    }
  };

  readonly terminal = {
    attachUrl: (id: string, options: TerminalAttachOptions = {}) => this.createTerminalAttachUrl(id, options),
    attachRequest: (id: string, options: TerminalAttachOptions = {}) => this.createTerminalAttachRequest(id, options),
    attachTicket: (id: string) => this.createTerminalAttachTicket(id)
  };

  readonly files = {
    list: (id: string, path?: string) => this.listSandboxFiles(id, path),
    stat: (id: string, path: string) => this.statSandboxFile(id, path),
    read: (id: string, path: string, options: { encoding?: "utf8" | "base64" } = {}) => this.readSandboxFile(id, path, options),
    write: (id: string, input: SandboxFileWriteBody) => this.writeSandboxFile(id, input),
    mkdir: (id: string, input: SandboxFileMkdirBody) => this.mkdirSandboxFile(id, input),
    remove: (id: string, path: string, options: { recursive?: boolean } = {}) => this.removeSandboxFile(id, path, options),
    rename: (id: string, input: SandboxFileRenameBody) => this.renameSandboxFile(id, input),
    upload: (id: string, input: SandboxFileUploadBody) => this.uploadSandboxFile(id, input),
    download: (id: string, path: string) => this.downloadSandboxFile(id, path)
  };

  readonly routes = {
    expose: (id: string, input: ExposePortInput) => this.exposePort(id, input),
    list: (id: string) => this.listRoutes(id),
    delete: (id: string, port: number) => this.deleteRoute(id, port),
    getHost: (id: string, port: number) => this.getHost(id, port),
    getUrl: (id: string, port: number) => this.getRouteUrl(id, port),
    exposeAndWait: (id: string, input: ExposePortInput, options: ExposeAndWaitOptions = {}) => this.exposeAndWaitForHttp(id, input, options),
    headers: (route: RouteLike, options: RouteAccessHeadersOptions = {}) => routeAccessHeaders(route, options),
    fetch: (route: RouteLike, options: CreateRouteFetchOptions = {}) => createRouteFetch(route, options),
    waitForHttp: (route: RouteLike, options: WaitForRouteHttpOptions = {}) => waitForRouteHttp(route, options)
  };

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
    if (!response.ok) throw createHarakiriApiError(response.status, await response.text());
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
        egress: input.egress,
        idempotencyKey: input.idempotencyKey,
        wait: input.wait,
        waitTimeoutMs: input.waitTimeoutMs
      })
    });
  }

  getSandbox(id: string) {
    return this.request<SandboxResponse>(`/v1/sandboxes/${id}`);
  }

  async waitForSandbox(id: string, options: WaitForSandboxOptions = {}) {
    const timeoutMs = options.timeoutMs ?? 60_000;
    const intervalMs = options.intervalMs ?? 1_000;
    const targetStatuses = new Set<SandboxStatus>(options.statuses ?? ["running", "idle"]);
    const started = Date.now();
    let last: SandboxResponse | null = null;
    while (Date.now() - started <= timeoutMs) {
      last = await this.getSandbox(id);
      if (targetStatuses.has(last.sandbox.status)) return last;
      if (!options.statuses && (last.sandbox.status === "error" || last.sandbox.status === "terminated")) {
        throw new Error(`Sandbox ${id} reached ${last.sandbox.status} before becoming ready`);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    const suffix = last ? `; last status ${last.sandbox.status}` : "";
    throw new HarakiriWaitTimeoutError(`Timed out waiting for sandbox ${id}${suffix}`, "sandbox", id, last?.sandbox.status);
  }

  renewSandbox(id: string) {
    return this.request<OkResponse>(`/v1/sandboxes/${id}/renew`, { method: "POST" });
  }

  getRuntimeCapabilities() {
    return this.request<RuntimeCapabilitiesResponse>("/v1/runtime/capabilities");
  }

  runSandbox(id: string, input: RunSandboxInput) {
    return this.request<RunSandboxResponse>(`/v1/sandboxes/${id}/run`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  runSandboxCommand(id: string, input: RunSandboxInput) {
    return this.runSandbox(id, input);
  }

  startCommand(id: string, input: CreateSandboxCommandInput) {
    return this.request<SandboxCommandResponse>(`/v1/sandboxes/${id}/commands`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  createSandboxCommand(id: string, input: CreateSandboxCommandInput) {
    return this.startCommand(id, input);
  }

  runCommand(id: string, input: CreateSandboxCommandInput) {
    return this.startCommand(id, input);
  }

  listCommands(id: string) {
    return this.request<SandboxCommandsResponse>(`/v1/sandboxes/${id}/commands`);
  }

  listSandboxCommands(id: string) {
    return this.listCommands(id);
  }

  getCommand(id: string, commandId: string) {
    return this.request<SandboxCommandResponse>(`/v1/sandboxes/${id}/commands/${encodeURIComponent(commandId)}`);
  }

  getSandboxCommand(id: string, commandId: string) {
    return this.getCommand(id, commandId);
  }

  async waitForCommand(id: string, commandId: string, options: WaitForCommandOptions = {}) {
    const timeoutMs = options.timeoutMs ?? 60_000;
    const intervalMs = options.intervalMs ?? 1_000;
    const targetStatuses = new Set<SandboxCommandStatus>(options.statuses ?? ["succeeded"]);
    const started = Date.now();
    let last: SandboxCommandResponse | null = null;
    while (Date.now() - started <= timeoutMs) {
      last = await this.getCommand(id, commandId);
      if (targetStatuses.has(last.command.status)) return last;
      if (!options.statuses && (last.command.status === "failed" || last.command.status === "killed")) {
        throw new Error(`Command ${commandId} reached ${last.command.status} before succeeding`);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    const suffix = last ? `; last status ${last.command.status}` : "";
    throw new HarakiriWaitTimeoutError(`Timed out waiting for command ${commandId}${suffix}`, "command", commandId, last?.command.status);
  }

  getCommandLogs(id: string, commandId: string, options: GetCommandLogsOptions = {}) {
    const params = new URLSearchParams();
    if (options.cursor !== undefined) params.set("cursor", String(options.cursor));
    if (options.tail !== undefined) params.set("tail", String(options.tail));
    const suffix = params.size ? `?${params.toString()}` : "";
    return this.request<SandboxCommandLogsResponse>(`/v1/sandboxes/${id}/commands/${encodeURIComponent(commandId)}/logs${suffix}`);
  }

  getSandboxCommandLogs(id: string, commandId: string, options: GetCommandLogsOptions = {}) {
    return this.getCommandLogs(id, commandId, options);
  }

  commandLogs(id: string, commandId: string, options: GetCommandLogsOptions = {}) {
    return this.getCommandLogs(id, commandId, options);
  }

  killCommand(id: string, commandId: string) {
    return this.request<SandboxCommandResponse>(`/v1/sandboxes/${id}/commands/${encodeURIComponent(commandId)}`, { method: "DELETE" });
  }

  killSandboxCommand(id: string, commandId: string) {
    return this.killCommand(id, commandId);
  }

  createCommandSession(id: string, input: CreateSandboxCommandSessionInput = {}) {
    return this.request<SandboxCommandSessionResponse>(`/v1/sandboxes/${id}/command-sessions`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  createSandboxCommandSession(id: string, input: CreateSandboxCommandSessionInput = {}) {
    return this.createCommandSession(id, input);
  }

  runCommandSession(id: string, sessionId: string, input: RunSandboxCommandSessionInput) {
    return this.request<RunSandboxCommandSessionResponse>(
      `/v1/sandboxes/${id}/command-sessions/${encodeURIComponent(sessionId)}/run`,
      {
        method: "POST",
        body: JSON.stringify(input)
      }
    );
  }

  runSandboxCommandSession(id: string, sessionId: string, input: RunSandboxCommandSessionInput) {
    return this.runCommandSession(id, sessionId, input);
  }

  deleteCommandSession(id: string, sessionId: string) {
    return this.request<SandboxCommandSessionResponse>(`/v1/sandboxes/${id}/command-sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE"
    });
  }

  deleteSandboxCommandSession(id: string, sessionId: string) {
    return this.deleteCommandSession(id, sessionId);
  }

  createTerminalAttachUrl(id: string, options: TerminalAttachOptions = {}) {
    const url = new URL(`${this.apiUrl}/v1/sandboxes/${encodeURIComponent(id)}/terminal/attach`);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    if (options.cwd) url.searchParams.set("cwd", options.cwd);
    if (options.shell) url.searchParams.set("shell", options.shell);
    if (options.sessionName) url.searchParams.set("sessionName", options.sessionName);
    for (const [key, value] of Object.entries(options.env ?? {})) url.searchParams.append("env", `${key}=${value}`);
    if (options.cols !== undefined) url.searchParams.set("cols", String(options.cols));
    if (options.rows !== undefined) url.searchParams.set("rows", String(options.rows));
    if (options.since !== undefined) url.searchParams.set("since", String(options.since));
    if (options.pty !== undefined) url.searchParams.set("pty", options.pty ? "true" : "false");
    return url.toString();
  }

  createSandboxTerminalAttachUrl(id: string, options: TerminalAttachOptions = {}) {
    return this.createTerminalAttachUrl(id, options);
  }

  createTerminalAttachRequest(id: string, options: TerminalAttachOptions = {}): TerminalAttachRequest {
    return {
      url: this.createTerminalAttachUrl(id, options),
      headers: { "x-api-key": this.apiKey }
    };
  }

  createSandboxTerminalAttachRequest(id: string, options: TerminalAttachOptions = {}) {
    return this.createTerminalAttachRequest(id, options);
  }

  createTerminalAttachTicket(id: string) {
    return this.request<SandboxTerminalAttachTicketResponse>(`/v1/sandboxes/${id}/terminal/attach-ticket`, {
      method: "POST"
    });
  }

  createSandboxTerminalAttachTicket(id: string) {
    return this.createTerminalAttachTicket(id);
  }

  getSandboxLogs(id: string) {
    return this.request<SandboxLogsResponse>(`/v1/sandboxes/${id}/logs`);
  }

  listSandboxFiles(id: string, path?: string) {
    return this.request<SandboxFilesResponse>(`/v1/sandboxes/${id}/files${path ? `?path=${encodeURIComponent(path)}` : ""}`);
  }

  statSandboxFile(id: string, path: string) {
    return this.request<SandboxFileStatResponse>(`/v1/sandboxes/${id}/files/stat?path=${encodeURIComponent(path)}`);
  }

  readSandboxFile(id: string, path: string, options: { encoding?: "utf8" | "base64" } = {}) {
    const params = new URLSearchParams({ path });
    if (options.encoding) params.set("encoding", options.encoding);
    return this.request<SandboxFileReadResponse>(`/v1/sandboxes/${id}/files/read?${params.toString()}`);
  }

  writeSandboxFile(id: string, input: SandboxFileWriteBody) {
    return this.request<SandboxFileWriteResponse>(`/v1/sandboxes/${id}/files`, {
      method: "PUT",
      body: JSON.stringify(input)
    });
  }

  uploadSandboxFile(id: string, input: SandboxFileUploadBody) {
    return this.request<SandboxFileUploadResponse>(`/v1/sandboxes/${id}/files/upload`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  downloadSandboxFile(id: string, path: string) {
    return this.request<SandboxFileDownloadResponse>(`/v1/sandboxes/${id}/files/download?path=${encodeURIComponent(path)}`);
  }

  mkdirSandboxFile(id: string, input: SandboxFileMkdirBody) {
    return this.request<SandboxFileMkdirResponse>(`/v1/sandboxes/${id}/files/mkdir`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  removeSandboxFile(id: string, path: string, options: { recursive?: boolean } = {}) {
    const params = new URLSearchParams({ path });
    if (options.recursive !== undefined) params.set("recursive", String(options.recursive));
    return this.request<SandboxFileRemoveResponse>(`/v1/sandboxes/${id}/files?${params.toString()}`, { method: "DELETE" });
  }

  renameSandboxFile(id: string, input: SandboxFileRenameBody) {
    return this.request<SandboxFileRenameResponse>(`/v1/sandboxes/${id}/files/rename`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  getSandboxMetrics(id: string) {
    return this.request<SandboxMetricsResponse>(`/v1/sandboxes/${id}/metrics`);
  }

  killSandbox(id: string) {
    return this.request<OkResponse>(`/v1/sandboxes/${id}`, { method: "DELETE" });
  }

  listRoutes(id: string) {
    return this.request<SandboxRoutesResponse>(`/v1/sandboxes/${id}/routes`);
  }

  listSandboxRoutes(id: string) {
    return this.listRoutes(id);
  }

  getEgressPolicy(id: string) {
    return this.request<SandboxEgressResponse>(`/v1/sandboxes/${id}/egress`);
  }

  getSandboxEgress(id: string) {
    return this.getEgressPolicy(id);
  }

  getOutboundAccess(id: string) {
    return this.getEgressPolicy(id);
  }

  updateEgressPolicy(id: string, input: PatchSandboxEgressBody) {
    return this.request<SandboxEgressResponse>(`/v1/sandboxes/${id}/egress`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  }

  updateSandboxEgress(id: string, input: PatchSandboxEgressBody) {
    return this.updateEgressPolicy(id, input);
  }

  setOutboundAccess(id: string, input: PatchSandboxEgressBody) {
    return this.updateEgressPolicy(id, input);
  }

  allowEgress(id: string, domains: string[]) {
    return this.updateEgressPolicy(id, { allow: domains });
  }

  allowDomains(id: string, domains: string[]) {
    return this.allowEgress(id, domains);
  }

  denyEgress(id: string, domains: string[]) {
    return this.updateEgressPolicy(id, { deny: domains });
  }

  denyDomains(id: string, domains: string[]) {
    return this.denyEgress(id, domains);
  }

  blockEgress(id: string) {
    return this.updateEgressPolicy(id, { mode: "blocked" });
  }

  blockOutboundAccess(id: string) {
    return this.blockEgress(id);
  }

  testEgress(id: string, target: string | TestSandboxEgressBody) {
    const body: TestSandboxEgressBody = typeof target === "string" ? { target } : target;
    return this.request<TestSandboxEgressResponse>(`/v1/sandboxes/${id}/egress/test`, {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  testOutboundAccess(id: string, target: string | TestSandboxEgressBody) {
    return this.testEgress(id, target);
  }

  exposePort(id: string, input: ExposePortInput) {
    return this.request<SandboxRouteResponse>(`/v1/sandboxes/${id}/routes`, {
      method: "POST",
      body: JSON.stringify({
        port: input.port,
        protocol: input.protocol ?? "http",
        accessMode: input.accessMode ?? "public",
        labels: input.labels
      })
    });
  }

  exposeSandboxRoute(id: string, input: ExposePortInput) {
    return this.exposePort(id, input);
  }

  deleteRoute(id: string, port: number) {
    return this.request<SandboxRouteResponse>(`/v1/sandboxes/${id}/routes/${encodeURIComponent(String(port))}`, { method: "DELETE" });
  }

  deleteSandboxRoute(id: string, port: number) {
    return this.deleteRoute(id, port);
  }

  async getHost(id: string, port: number) {
    const result = await this.exposePort(id, { port });
    return result.route.url;
  }

  getRouteUrl(id: string, port: number) {
    return this.getHost(id, port);
  }

  async exposeAndWaitForHttp(id: string, input: ExposePortInput, options: ExposeAndWaitOptions = {}) {
    const result = await this.exposePort(id, input);
    await waitForRouteHttp(result, options);
    return result;
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
