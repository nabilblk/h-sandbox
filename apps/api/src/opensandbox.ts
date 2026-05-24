import type { RunResult } from "@harakiri/shared";
import { config } from "./config.js";
import { registryImageAuthForImage, type RegistryImageAuth } from "./registry-credentials.js";
import type { RuntimeTemplate } from "./templates.js";

type ProviderSandbox = {
  id: string;
  status?: { state?: string };
  expiresAt?: string;
};

type ProviderList = {
  items?: ProviderSandbox[];
  sandboxes?: ProviderSandbox[];
  data?: ProviderSandbox[];
};

type ExecdEvent = {
  type?: string;
  text?: string;
  results?: Record<string, unknown>;
  timestamp?: number;
  execution_time?: number;
  error?: { evalue?: string; traceback?: string[] };
};

type ProviderEndpoint = {
  endpoint?: string;
  url?: string;
  headers?: Record<string, string> | null;
};

type ExecdFileInfo = {
  path: string;
  size?: number;
  modified_at?: string;
  created_at?: string;
  owner?: string;
  group?: string;
  mode?: number | string;
};

type DiagnosticContent = {
  content?: string;
  contentUrl?: string;
  delivery?: "inline" | "url" | string;
};

export type SandboxFileEntry = {
  path: string;
  name: string;
  type: "file" | "directory" | "symlink" | "other";
  size: number;
  mode?: string;
  owner?: string;
  group?: string;
  modifiedAt?: string | null;
};

export type SandboxLogEntry = {
  ts: string;
  lvl: string;
  msg: string;
  source: "control-plane" | "sandbox";
};

export type SandboxMetricsSnapshot = {
  current: { cpu: number; mem: number; diskIo: number; networkOut: number; cpuCount?: number; memTotal?: number };
  series: Array<{ ts: string; cpu: number; mem: number }>;
};

export type SandboxRouteTarget = {
  routeKey: string;
  host: string;
  url: string;
  targetUrl: string;
  provider: string;
  providerRouteId: string | null;
  state: "provisioning" | "ready" | "unhealthy";
};

class OpenSandboxHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string
  ) {
    super(`OpenSandbox ${status}: ${body}`);
  }
}

const EXECD_PORT = 44_772;
const EXECD_AUTH_HEADER = "X-EXECD-ACCESS-TOKEN";

const headers = () => ({
  "content-type": "application/json",
  "OPEN-SANDBOX-API-KEY": config.openSandboxApiKey
});

const callOpenSandbox = async <T>(path: string, init: RequestInit = {}) => {
  const response = await fetch(`${config.openSandboxBaseUrl}${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers ?? {}) }
  });
  const body = await response.text();
  if (!response.ok) {
    throw new OpenSandboxHttpError(response.status, body);
  }
  if (!body) return undefined as T;
  return JSON.parse(body) as T;
};

const joinUrl = (baseUrl: string, path: string) => {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
};

const openSandboxProtocol = () => {
  try {
    return new URL(config.openSandboxBaseUrl).protocol || "http:";
  } catch {
    return "http:";
  }
};

const openSandboxUrl = (value: string) => {
  const trimmed = value.trim();
  if (/^https?:\/\//.test(trimmed)) return trimmed.replace(/\/+$/, "");
  if (trimmed.startsWith("/")) return joinUrl(config.openSandboxBaseUrl, trimmed);
  return `${openSandboxProtocol()}//${trimmed.replace(/^\/+/, "")}`.replace(/\/+$/, "");
};

const hasHeader = (headersToCheck: Record<string, string>, name: string) =>
  Object.keys(headersToCheck).some((key) => key.toLowerCase() === name.toLowerCase());

const getHeader = (headersToCheck: Record<string, string>, name: string) => {
  const key = Object.keys(headersToCheck).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? headersToCheck[key] : undefined;
};

const execdHeaders = (endpointHeaders?: Record<string, string> | null) => {
  const merged = { ...(endpointHeaders ?? {}) };
  if (!hasHeader(merged, EXECD_AUTH_HEADER)) {
    merged[EXECD_AUTH_HEADER] = config.openSandboxApiKey;
  }
  return merged;
};

const resolveExecdEndpoint = async (opensandboxId: string) => {
  const result = await callOpenSandbox<ProviderEndpoint>(
    `/v1/sandboxes/${opensandboxId}/endpoints/${EXECD_PORT}?use_server_proxy=true`
  );
  const endpoint = result.endpoint ?? result.url;
  if (!endpoint) throw new Error(`OpenSandbox did not return an execd endpoint for ${opensandboxId}`);
  const headers = execdHeaders(result.headers);
  const gatewayRoute = getHeader(headers, "OpenSandbox-Ingress-To");
  return {
    baseUrl: gatewayRoute ? config.openSandboxGatewayUrl.replace(/\/+$/, "") : openSandboxUrl(endpoint),
    headers
  };
};

const publicRouteTarget = (target: string | null) => {
  if (!target) return null;
  const withScheme = /^https?:\/\//.test(target) ? target : `http://${target}`;
  return withScheme.replace("http://opensandbox-server.opensandbox-system.svc.cluster.local", config.publicOpenSandboxUrl);
};

const dnsSafe = (value: string) => {
  const safe = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 58);
  return safe || "sandbox";
};

const routeKeyFor = (opensandboxId: string, port: number) => `${dnsSafe(opensandboxId)}-${port}`;

const routeUrl = (hostOrUrl: string, scheme = config.sandboxRoutePublicScheme) => (/^https?:\/\//.test(hostOrUrl) ? hostOrUrl : `${scheme}://${hostOrUrl}`);

const routeHost = (hostOrUrl: string) => {
  try {
    return new URL(routeUrl(hostOrUrl)).host;
  } catch {
    return hostOrUrl.replace(/^https?:\/\//, "").split("/")[0] ?? hostOrUrl;
  }
};

const serverProxyUrl = (opensandboxId: string, port: number) =>
  `${config.sandboxRouteLocalFallbackUrl.replace(/\/+$/, "")}/v1/sandboxes/${opensandboxId}/proxy/${port}/`;

const labelSafeValue = (value: string) => {
  const cleaned = value
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .slice(0, 63)
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/[^A-Za-z0-9]+$/, "");
  return cleaned || "value";
};

const labelSafeMetadata = (metadata: Record<string, string>) =>
  Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, labelSafeValue(value)]));

const routePolicyMetadata = () => ({
  "harakiri.route_mode": config.sandboxRouteMode,
  "harakiri.route_base_domain": config.sandboxRouteBaseDomain,
  "harakiri.route_public_scheme": config.sandboxRoutePublicScheme,
  "harakiri.route_max_per_sandbox": String(config.sandboxMaxRoutesPerSandbox),
  "harakiri.route_max_per_org": String(config.sandboxMaxRoutesPerOrg)
});

export const openSandboxCreateBody = (input: {
  template: RuntimeTemplate;
  ttlSeconds: number;
  name: string;
  metadata?: Record<string, string>;
  env?: Record<string, string>;
  imageAuth?: RegistryImageAuth | null;
}) => {
  const template = input.template;
  const env = input.env && Object.keys(input.env).length ? input.env : undefined;
  return {
    image: {
      uri: template.image,
      ...(input.imageAuth ? { auth: input.imageAuth } : {})
    },
    entrypoint: template.defaultEntrypoint,
    timeout: Math.max(input.ttlSeconds, 60),
    resourceLimits: { cpu: `${Math.max(template.cpuCount, 1) * 1000}m`, memory: `${Math.max(template.memoryMb, 128)}Mi` },
    metadata: labelSafeMetadata({
      "harakiri.template": template.id,
      ...(template.templateVersionId ? { "harakiri.template_version": template.templateVersionId } : {}),
      ...(template.imageDigest ? { "harakiri.image_digest": template.imageDigest } : {}),
      "harakiri.name": input.name,
      "harakiri.workdir": template.workdir,
      ...routePolicyMetadata(),
      ...(input.metadata ?? {})
    }),
    ...(env ? { env } : {})
  };
};

const appendLine = (current: string, line: string) => `${current}${line}${line.endsWith("\n") ? "" : "\n"}`;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isExecdGatewayReadinessError = (status: number, body: string) =>
  status === 503 && /opensandbox ingress/i.test(body) && /sandbox not ready/i.test(body);

const callExecd = async (opensandboxId: string, path: string, init: RequestInit = {}) => {
  const endpoint = await resolveExecdEndpoint(opensandboxId);
  const maxAttempts = 12;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(joinUrl(endpoint.baseUrl, path), {
      ...init,
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...endpoint.headers,
        ...(init.headers ?? {})
      }
    });
    const body = await response.text();
    if (response.ok) return body;
    if (attempt < maxAttempts && isExecdGatewayReadinessError(response.status, body)) {
      await delay(process.env.NODE_ENV === "production" ? 500 : 1);
      continue;
    }
    throw new OpenSandboxHttpError(response.status, body);
  }
  throw new OpenSandboxHttpError(503, "OpenSandbox execd request did not complete");
};

const parseExecdEvents = (body: string) => {
  const events: ExecdEvent[] = [];
  const frames = /\r?\n\r?\n/.test(body) ? body.split(/\r?\n\r?\n/) : body.split(/\r?\n/);
  for (const frame of frames) {
    let eventType: string | undefined;
    const dataLines: string[] = [];
    const lines = frame.includes("\n") ? frame.split(/\r?\n/) : [frame];
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("event:")) {
        eventType = line.slice("event:".length).trim();
        continue;
      }
      if (line.startsWith("id:") || line.startsWith("retry:")) continue;
      dataLines.push(line.startsWith("data:") ? line.slice("data:".length).trim() : line);
    }
    const payload = dataLines.join("\n").trim();
    if (!payload) continue;
    try {
      const event = JSON.parse(payload) as ExecdEvent;
      if (eventType && !event.type) event.type = eventType;
      events.push(event);
    } catch {
      events.push({ type: eventType ?? "stdout", text: payload });
    }
  }
  return events;
};

const eventText = (event: ExecdEvent) => {
  if (typeof event.text === "string") return event.text;
  const resultText = event.results?.["text/plain"] ?? event.results?.text ?? event.results?.textPlain;
  return resultText == null ? undefined : String(resultText);
};

const runExecdCommand = async (input: { opensandboxId: string; command: string; stdin?: string }) => {
  const command = input.stdin
    ? `base64 -d > /tmp/harakiri-stdin <<'HARAKIRI_STDIN'\n${Buffer.from(input.stdin).toString("base64")}\nHARAKIRI_STDIN\npython /tmp/harakiri-stdin`
    : input.command;
  const body = await callExecd(input.opensandboxId, "/command", {
    method: "POST",
    headers: { accept: "text/event-stream" },
    body: JSON.stringify({ command, background: false, timeout: 120_000 })
  });
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  let durationMs: number | undefined;
  for (const event of parseExecdEvents(body)) {
    const text = eventText(event);
    if ((event.type === "stdout" || event.type === "result") && text !== undefined) stdout = appendLine(stdout, text);
    if (event.type === "stderr" && text !== undefined) stderr = appendLine(stderr, text);
    if (event.type === "execution_complete" && typeof event.execution_time === "number") durationMs = event.execution_time;
    if (event.type === "error") {
      exitCode = Number(event.error?.evalue ?? 1) || 1;
      const detail = event.error?.traceback?.join("\n") || event.error?.evalue || "command failed";
      if (detail) stderr = appendLine(stderr, detail);
    }
  }
  return { stdout, stderr, exitCode, durationMs };
};

const normalizedDirectory = (path: string) => {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return safePath.length > 1 ? safePath.replace(/\/+$/, "") : safePath;
};

const shellQuote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;

const directRelativePath = (cwd: string, fullPath: string) => {
  if (cwd === "/") return fullPath.replace(/^\/+/, "");
  const prefix = `${cwd}/`;
  return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : "";
};

const modeString = (mode: ExecdFileInfo["mode"]) => (mode == null ? undefined : String(mode).padStart(4, "0"));

const listFilesWithSearch = async (opensandboxId: string, cwd: string) => {
  const query = new URLSearchParams({ path: cwd, pattern: "*" });
  const body = await callExecd(opensandboxId, `/files/search?${query.toString()}`);
  const entries = JSON.parse(body) as ExecdFileInfo[];
  if (!Array.isArray(entries)) throw new Error("OpenSandbox execd files/search returned an unexpected response");

  const seenDirs = new Set<string>();
  const files: SandboxFileEntry[] = [];
  for (const entry of entries) {
    const relative = directRelativePath(cwd, entry.path);
    if (!relative) continue;
    const [firstSegment, ...rest] = relative.split("/").filter(Boolean);
    if (!firstSegment) continue;
    if (rest.length > 0) {
      const dirPath = cwd === "/" ? `/${firstSegment}` : `${cwd}/${firstSegment}`;
      if (!seenDirs.has(dirPath)) {
        seenDirs.add(dirPath);
        files.push({ path: dirPath, name: firstSegment, type: "directory", size: 0 });
      }
      continue;
    }
    files.push({
      path: entry.path,
      name: firstSegment,
      type: "file",
      size: Number(entry.size) || 0,
      mode: modeString(entry.mode),
      modifiedAt: entry.modified_at ?? entry.created_at ?? null,
      owner: entry.owner,
      group: entry.group
    });
  }

  return {
    cwd,
    files: files.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      if (a.type === "directory") return -1;
      if (b.type === "directory") return 1;
      return a.type.localeCompare(b.type);
    })
  };
};

const findType = (type: string): SandboxFileEntry["type"] => {
  if (type === "d") return "directory";
  if (type === "f") return "file";
  if (type === "l") return "symlink";
  return "other";
};

const listFilesWithCommand = async (opensandboxId: string, cwd: string) => {
  const command = `find ${shellQuote(cwd)} -mindepth 1 -maxdepth 1 -printf '%y\\t%p\\t%s\\t%m\\t%u\\t%g\\t%T@\\n' 2>/dev/null || true`;
  const result = await runExecdCommand({ opensandboxId, command });
  const files = result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line): SandboxFileEntry | null => {
      const [type, path, size, mode, owner, group, modified] = line.split("\t");
      if (!type || !path) return null;
      const modifiedSeconds = Number(modified);
      return {
        path,
        name: path.split("/").filter(Boolean).pop() ?? path,
        type: findType(type),
        size: Number(size) || 0,
        mode: modeString(mode),
        owner,
        group,
        modifiedAt: Number.isFinite(modifiedSeconds) ? new Date(modifiedSeconds * 1000).toISOString() : null
      };
    })
    .filter((file): file is SandboxFileEntry => Boolean(file))
    .sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      if (a.type === "directory") return -1;
      if (b.type === "directory") return 1;
      return a.type.localeCompare(b.type);
    });
  return { cwd, files };
};

const listFilesInSandbox = async (opensandboxId: string, path = "/") => {
  const cwd = normalizedDirectory(path);
  try {
    return await listFilesWithSearch(opensandboxId, cwd);
  } catch {
    return listFilesWithCommand(opensandboxId, cwd);
  }
};

const diagnosticContentUrl = (contentUrl: string) => {
  if (/^https?:\/\//.test(contentUrl)) return contentUrl;
  return joinUrl(config.openSandboxBaseUrl, contentUrl);
};

const loadDiagnosticText = async (descriptor: DiagnosticContent) => {
  if (typeof descriptor.content === "string") return descriptor.content;
  if (!descriptor.contentUrl) return "";
  const url = diagnosticContentUrl(descriptor.contentUrl);
  const sameOpenSandboxOrigin = (() => {
    try {
      return new URL(url).origin === new URL(config.openSandboxBaseUrl).origin;
    } catch {
      return false;
    }
  })();
  const response = await fetch(url, { headers: sameOpenSandboxOrigin ? headers() : undefined });
  if (!response.ok) return "";
  return response.text();
};

const callOpenSandboxText = async (path: string) => {
  const response = await fetch(`${config.openSandboxBaseUrl}${path}`, { headers: headers() });
  const body = await response.text();
  if (!response.ok) throw new OpenSandboxHttpError(response.status, body);
  return body;
};

const sandboxLogs = async (opensandboxId: string): Promise<SandboxLogEntry[]> => {
  const descriptor = await callOpenSandbox<DiagnosticContent>(
    `/v1/sandboxes/${opensandboxId}/diagnostics/logs?scope=container`
  ).catch(() => null);
  const stableText = descriptor ? await loadDiagnosticText(descriptor).catch(() => "") : "";
  const legacyText = stableText
    ? ""
    : await callOpenSandboxText(`/v1/sandboxes/${opensandboxId}/diagnostics/logs?tail=200`).catch(() => "");
  const text = stableText || legacyText;
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = /^(\S+)\s+(.*)$/.exec(line);
      let ts = match?.[1] && !Number.isNaN(Date.parse(match[1])) ? match[1] : new Date().toISOString();
      let lvl = "runtime";
      let msg = match?.[2] ?? line;
      try {
        const payload = JSON.parse(msg) as { ts?: string; level?: string; msg?: string };
        if (payload.ts && !Number.isNaN(Date.parse(payload.ts))) ts = payload.ts;
        if (payload.level) lvl = payload.level;
        if (payload.msg) msg = payload.msg;
      } catch {
        // Non-JSON container log lines are still useful runtime logs.
      }
      return {
        ts,
        lvl,
        msg,
        source: "sandbox" as const
      };
    });
};

const sandboxMetrics = async (opensandboxId: string): Promise<SandboxMetricsSnapshot> => {
  const body = await callExecd(opensandboxId, "/metrics");
  const metric = JSON.parse(body) as {
    cpu_count?: number;
    cpu_used_pct?: number;
    mem_total_mib?: number;
    mem_used_mib?: number;
    timestamp?: number;
  };
  const ts = new Date(metric.timestamp ?? Date.now()).toISOString();
  const cpu = Math.round(metric.cpu_used_pct ?? 0);
  const mem = Math.round(metric.mem_used_mib ?? 0);
  return {
    current: {
      cpu,
      mem,
      diskIo: 0,
      networkOut: 0,
      cpuCount: metric.cpu_count,
      memTotal: metric.mem_total_mib ? Math.round(metric.mem_total_mib) : undefined
    },
    series: [{ ts, cpu, mem }]
  };
};

export const openSandbox = {
  async create(input: {
    template: RuntimeTemplate;
    ttlSeconds: number;
    name: string;
    organizationId?: string;
    metadata?: Record<string, string>;
    env?: Record<string, string>;
  }) {
    const template = input.template;
    try {
      const registryAuth = input.organizationId ? await registryImageAuthForImage(input.organizationId, template.image, "pull") : null;
      const result = await callOpenSandbox<ProviderSandbox>("/v1/sandboxes", {
        method: "POST",
        body: JSON.stringify(openSandboxCreateBody({
          template,
          ttlSeconds: input.ttlSeconds,
          name: input.name,
          env: input.env,
          imageAuth: registryAuth?.auth ?? null,
          metadata: {
            ...(registryAuth?.credentialId ? { "harakiri.runtime_registry_credential": registryAuth.credentialId } : {}),
            ...(input.metadata ?? {})
          }
        }))
      });
      return {
        provider: "opensandbox",
        id: result.id,
        state: result.status?.state ?? "Pending",
        expiresAt: result.expiresAt ?? null,
        runtimeRegistryCredentialId: registryAuth?.credentialId ?? null,
        runtimeImageAuthProvided: Boolean(registryAuth?.auth)
      };
    } catch (error) {
      if (!config.openSandboxAllowFallback) throw error;
      return {
        provider: "fallback",
        id: `osbx_${Date.now().toString(36)}`,
        state: "Running",
        expiresAt: new Date(Date.now() + input.ttlSeconds * 1000).toISOString(),
        runtimeRegistryCredentialId: null,
        runtimeImageAuthProvided: false
      };
    }
  },

  async list() {
    try {
      const result = await callOpenSandbox<ProviderList | ProviderSandbox[]>("/v1/sandboxes");
      if (Array.isArray(result)) return result;
      return result.items ?? result.sandboxes ?? result.data ?? [];
    } catch (error) {
      if (!config.openSandboxAllowFallback) throw error;
      return [];
    }
  },

  async get(opensandboxId: string) {
    if (opensandboxId.startsWith("osbx_")) return null;
    try {
      return await callOpenSandbox<ProviderSandbox>(`/v1/sandboxes/${opensandboxId}`);
    } catch (error) {
      if (error instanceof OpenSandboxHttpError && error.status === 404) return null;
      if (!config.openSandboxAllowFallback) throw error;
      return null;
    }
  },

  async delete(opensandboxId: string) {
    if (opensandboxId.startsWith("osbx_")) return;
    try {
      await callOpenSandbox(`/v1/sandboxes/${opensandboxId}`, { method: "DELETE" });
    } catch (error) {
      if (error instanceof OpenSandboxHttpError && error.status === 404) return;
      if (!config.openSandboxAllowFallback) throw error;
    }
  },

  async renew(opensandboxId: string) {
    if (opensandboxId.startsWith("osbx_")) return;
    try {
      await callOpenSandbox(`/v1/sandboxes/${opensandboxId}/renew-expiration`, { method: "POST" });
    } catch (error) {
      if (!config.openSandboxAllowFallback) throw error;
    }
  },

  async getRoute(opensandboxId: string, port: number) {
    return (await this.ensureRoute(opensandboxId, port)).targetUrl;
  },

  async ensureRoute(opensandboxId: string, port: number): Promise<SandboxRouteTarget> {
    const routeKey = routeKeyFor(opensandboxId, port);
    const gatewayHost = `${routeKey}.${config.sandboxRouteBaseDomain}`;
    const gatewayUrl = routeUrl(gatewayHost);

    if (opensandboxId.startsWith("osbx_")) {
      const targetUrl = `http://${routeKey}.sandbox.localhost:${port}`;
      return {
        routeKey,
        host: routeHost(targetUrl),
        url: targetUrl,
        targetUrl,
        provider: "fallback-local",
        providerRouteId: null,
        state: "ready"
      };
    }

    if (["opensandbox-ingress", "opensandbox-gateway", "gateway"].includes(config.sandboxRouteMode)) {
      try {
        await callOpenSandbox<{ url?: string; endpoint?: string; headers?: Record<string, string> | null }>(`/v1/sandboxes/${opensandboxId}/endpoints/${port}`);
        return {
          routeKey,
          host: gatewayHost,
          url: gatewayUrl,
          targetUrl: gatewayUrl,
          provider: "opensandbox-gateway",
          providerRouteId: routeKey,
          state: "ready"
        };
      } catch (error) {
        if (!config.openSandboxAllowFallback) {
          return {
            routeKey,
            host: gatewayHost,
            url: gatewayUrl,
            targetUrl: gatewayUrl,
            provider: "opensandbox-gateway",
            providerRouteId: routeKey,
            state: "provisioning"
          };
        }
      }
      return {
        routeKey,
        host: gatewayHost,
        url: gatewayUrl,
        targetUrl: gatewayUrl,
        provider: "opensandbox-gateway",
        providerRouteId: routeKey,
        state: "provisioning"
      };
    }

    try {
      const result = await callOpenSandbox<{ url?: string; endpoint?: string }>(`/v1/sandboxes/${opensandboxId}/endpoints/${port}?use_server_proxy=true`);
      const targetUrl = publicRouteTarget(result.url ?? result.endpoint ?? null) ?? serverProxyUrl(opensandboxId, port);
      return {
        routeKey,
        host: routeHost(targetUrl),
        url: targetUrl,
        targetUrl,
        provider: "opensandbox-server-proxy",
        providerRouteId: routeKey,
        state: "ready"
      };
    } catch (error) {
      if (!config.openSandboxAllowFallback) {
        const targetUrl = serverProxyUrl(opensandboxId, port);
        return {
          routeKey,
          host: routeHost(targetUrl),
          url: targetUrl,
          targetUrl,
          provider: "opensandbox-server-proxy",
          providerRouteId: routeKey,
          state: "provisioning"
        };
      }
      const targetUrl = serverProxyUrl(opensandboxId, port);
      return {
        routeKey,
        host: routeHost(targetUrl),
        url: targetUrl,
        targetUrl,
        provider: "opensandbox-server-proxy",
        providerRouteId: routeKey,
        state: "provisioning"
      };
    }
  },

  async run(input: { sandboxId: string; opensandboxId?: string | null; command: string; stdin?: string }): Promise<RunResult> {
    const started = Date.now();
    const command = input.command.trim() || "python -";
    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    if (input.opensandboxId && !input.opensandboxId.startsWith("osbx_")) {
      const result = await runExecdCommand({ opensandboxId: input.opensandboxId, command, stdin: input.stdin });
      stdout = result.stdout;
      stderr = result.stderr;
      exitCode = result.exitCode;
      if ("durationMs" in result && typeof result.durationMs === "number") {
        return { sandboxId: input.sandboxId, command, stdout, stderr, exitCode, durationMs: result.durationMs };
      }
    } else {
      stdout = `harakiri fallback: ${command}\n`;
    }

    return {
      sandboxId: input.sandboxId,
      command,
      stdout,
      stderr,
      exitCode,
      durationMs: Date.now() - started + 141
    };
  },

  async files(opensandboxId?: string | null, path = "/") {
    if (!opensandboxId || opensandboxId.startsWith("osbx_")) return { cwd: path, files: [] as SandboxFileEntry[] };
    return listFilesInSandbox(opensandboxId, path);
  },

  async logs(opensandboxId?: string | null) {
    if (!opensandboxId || opensandboxId.startsWith("osbx_")) return [] as SandboxLogEntry[];
    return sandboxLogs(opensandboxId);
  },

  async metrics(opensandboxId?: string | null) {
    if (!opensandboxId || opensandboxId.startsWith("osbx_")) return null;
    return sandboxMetrics(opensandboxId);
  }
};
