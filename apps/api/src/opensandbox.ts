import { TEMPLATES, type RunResult } from "@harakiri/shared";
import { Writable, Readable } from "node:stream";
import { CoreV1Api, Exec, KubeConfig, type V1Pod, type V1Status } from "@kubernetes/client-node";
import { config } from "./config.js";

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
  execution_time?: number;
  error?: { evalue?: string; traceback?: string[] };
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

const sandboxPodName = (opensandboxId: string) => `${opensandboxId}-0`;

const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

const appendLine = (current: string, line: string) => `${current}${line}${line.endsWith("\n") ? "" : "\n"}`;

const kubernetes = (() => {
  let kc: KubeConfig | null = null;
  let core: CoreV1Api | null = null;
  let exec: Exec | null = null;
  return {
    config() {
      if (!kc) {
        kc = new KubeConfig();
        if (process.env.KUBERNETES_SERVICE_HOST) kc.loadFromCluster();
        else kc.loadFromDefault();
      }
      return kc;
    },
    core() {
      core ??= this.config().makeApiClient(CoreV1Api);
      return core;
    },
    exec() {
      exec ??= new Exec(this.config());
      return exec;
    }
  };
})();

const collectWritable = () => {
  const chunks: Buffer[] = [];
  const writable = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    }
  });
  return {
    writable,
    text: () => Buffer.concat(chunks).toString("utf8")
  };
};

const waitForSandboxPod = async (podName: string, timeoutMs = 60_000): Promise<V1Pod> => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await kubernetes.core().readNamespacedPod({ namespace: "opensandbox", name: podName }).catch(() => null);
    const pod = response;
    if (pod?.status?.phase === "Running" && pod.status.containerStatuses?.some((status) => status.ready)) return pod;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`sandbox pod ${podName} was not ready before timeout`);
};

const callExecd = async (opensandboxId: string, path: string, init: RequestInit = {}) => {
  const pod = await waitForSandboxPod(sandboxPodName(opensandboxId));
  const podIp = pod.status?.podIP;
  if (!podIp) throw new Error(`sandbox pod ${sandboxPodName(opensandboxId)} has no pod IP`);
  const response = await fetch(`http://${podIp}:44772${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {})
    }
  });
  const body = await response.text();
  if (!response.ok) throw new OpenSandboxHttpError(response.status, body);
  return body;
};

const parseExecdEvents = (body: string) => {
  const events: ExecdEvent[] = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const payload = line.startsWith("data:") ? line.slice(5).trim() : line;
    try {
      events.push(JSON.parse(payload) as ExecdEvent);
    } catch {
      events.push({ type: "stdout", text: payload });
    }
  }
  return events;
};

const runExecdCommand = async (input: { opensandboxId: string; command: string; stdin?: string }) => {
  const command = input.stdin
    ? `base64 -d > /tmp/harakiri-stdin <<'HARAKIRI_STDIN'\n${Buffer.from(input.stdin).toString("base64")}\nHARAKIRI_STDIN\npython /tmp/harakiri-stdin`
    : input.command;
  const body = await callExecd(input.opensandboxId, "/command", {
    method: "POST",
    body: JSON.stringify({ command, background: false, timeout: 120_000 })
  });
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  let durationMs: number | undefined;
  for (const event of parseExecdEvents(body)) {
    if (event.type === "stdout" && event.text !== undefined) stdout = appendLine(stdout, event.text);
    if (event.type === "stderr" && event.text !== undefined) stderr = appendLine(stderr, event.text);
    if (event.type === "execution_complete" && typeof event.execution_time === "number") durationMs = event.execution_time;
    if (event.type === "error") {
      exitCode = Number(event.error?.evalue ?? 1) || 1;
      const detail = event.error?.traceback?.join("\n") || event.error?.evalue || "command failed";
      if (detail) stderr = appendLine(stderr, detail);
    }
  }
  return { stdout, stderr, exitCode, durationMs };
};

const runInSandboxPod = async (input: { opensandboxId: string; command: string; stdin?: string }) => {
  const podName = sandboxPodName(input.opensandboxId);
  await waitForSandboxPod(podName);
  const stdout = collectWritable();
  const stderr = collectWritable();
  let exitCode = 0;
  let statusMessage = "";
  const stdin = input.stdin ? Readable.from([input.stdin]) : null;
  const command = input.stdin
    ? ["sh", "-lc", "cat > /tmp/harakiri-stdin && python /tmp/harakiri-stdin"]
    : ["sh", "-lc", input.command];
  const ws = await kubernetes.exec().exec(
    "opensandbox",
    podName,
    "sandbox",
    command,
    stdout.writable,
    stderr.writable,
    stdin,
    false,
    (status: V1Status) => {
      statusMessage = status.message ?? "";
      const codeCause = status.details?.causes?.find((cause) => cause.reason === "ExitCode");
      if (codeCause?.message) exitCode = Number(codeCause.message);
      else if (status.status === "Failure") exitCode = 1;
    }
  );
  await new Promise<void>((resolve, reject) => {
    ws.on("close", () => resolve());
    ws.on("error", reject);
  });
  if (statusMessage && exitCode !== 0 && !stderr.text()) {
    stderr.writable.write(statusMessage);
  }
  return { stdout: stdout.text(), stderr: stderr.text(), exitCode };
};

const listFilesInSandbox = async (opensandboxId: string, path = "/") => {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  const command = `find ${shellQuote(safePath)} -maxdepth 1 -mindepth 1 -printf '%y\\t%s\\t%M\\t%TY-%Tm-%TdT%TH:%TM:%TS%Tz\\t%u\\t%g\\t%p\\n' | sort`;
  const result = await runExecdCommand({ opensandboxId, command });
  if (result.exitCode !== 0) throw new Error(result.stderr || `failed to list ${safePath}`);
  const files = result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map<SandboxFileEntry>((line) => {
      const [kind, size, mode, modifiedAt, owner, group, ...rest] = line.split("\t");
      const fullPath = rest.join("\t");
      const name = fullPath.split("/").filter(Boolean).pop() ?? fullPath;
      const type = kind === "d" ? "directory" : kind === "f" ? "file" : kind === "l" ? "symlink" : "other";
      return { path: fullPath, name: fullPath === "/" ? "/" : name, type, size: Number(size) || 0, mode, modifiedAt, owner, group };
    })
    .sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      if (a.type === "directory") return -1;
      if (b.type === "directory") return 1;
      return a.type.localeCompare(b.type);
    });
  return { cwd: safePath, files };
};

const sandboxLogs = async (opensandboxId: string): Promise<SandboxLogEntry[]> => {
  const podName = sandboxPodName(opensandboxId);
  const text = await kubernetes.core().readNamespacedPodLog({
    namespace: "opensandbox",
    name: podName,
    container: "sandbox",
    tailLines: 200,
    timestamps: true
  }).catch(() => "");
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
  async create(input: { templateId: string; ttlSeconds: number; name: string; metadata?: Record<string, string> }) {
    const template = TEMPLATES.find((item) => item.id === input.templateId) ?? TEMPLATES[0];
    try {
      const result = await callOpenSandbox<ProviderSandbox>("/v1/sandboxes", {
        method: "POST",
        body: JSON.stringify({
          image: { uri: template.image },
          entrypoint: template.defaultEntrypoint,
          timeout: Math.max(input.ttlSeconds, 60),
          resourceLimits: { cpu: "1000m", memory: "1Gi" },
          metadata: labelSafeMetadata({
            "harakiri.template": template.id,
            "harakiri.name": input.name,
            ...(input.metadata ?? {})
          })
        })
      });
      return { provider: "opensandbox", id: result.id, state: result.status?.state ?? "Pending", expiresAt: result.expiresAt ?? null };
    } catch (error) {
      if (!config.openSandboxAllowFallback) throw error;
      return {
        provider: "fallback",
        id: `osbx_${Date.now().toString(36)}`,
        state: "Running",
        expiresAt: new Date(Date.now() + input.ttlSeconds * 1000).toISOString()
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
      const result = await runExecdCommand({ opensandboxId: input.opensandboxId, command, stdin: input.stdin })
        .catch(() => runInSandboxPod({ opensandboxId: input.opensandboxId!, command, stdin: input.stdin }));
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
