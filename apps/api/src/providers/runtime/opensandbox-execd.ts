import { config } from "../../config.js";
import { callOpenSandbox, joinUrl, OpenSandboxHttpError, openSandboxUrl } from "./opensandbox-client.js";
import type { ProviderEndpoint } from "./opensandbox-types.js";
import WebSocket from "ws";

type ExecdEvent = {
  type?: string;
  text?: string;
  results?: Record<string, unknown>;
  timestamp?: number;
  execution_time?: number;
  error?: { evalue?: string; traceback?: string[] };
};

const EXECD_PORT = 44_772;
const EXECD_AUTH_HEADER = "X-EXECD-ACCESS-TOKEN";

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

export const resolveExecdEndpoint = async (opensandboxId: string) => {
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

const appendLine = (current: string, line: string) => `${current}${line}${line.endsWith("\n") ? "" : "\n"}`;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isExecdGatewayReadinessError = (status: number, body: string) =>
  status === 503 && /opensandbox ingress/i.test(body) && /sandbox not ready/i.test(body);

export const callExecd = async (opensandboxId: string, path: string, init: RequestInit = {}) => {
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

const composeRunCommand = (input: { command: string; stdin?: string }) => {
  return input.stdin
    ? `base64 -d > /tmp/harakiri-stdin <<'HARAKIRI_STDIN'\n${Buffer.from(input.stdin).toString("base64")}\nHARAKIRI_STDIN\npython /tmp/harakiri-stdin`
    : input.command;
};

export const runExecdCommand = async (input: {
  opensandboxId: string;
  command: string;
  stdin?: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}) => {
  const command = composeRunCommand(input);
  const body = await callExecd(input.opensandboxId, "/command", {
    method: "POST",
    headers: { accept: "text/event-stream" },
    body: JSON.stringify({ command, cwd: input.cwd, background: false, timeout: input.timeoutMs ?? 120_000, envs: input.env })
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

const parseCommandEvents = (body: string) => {
  let providerCommandId: string | null = null;
  let stdout = "";
  let stderr = "";
  let exitCode: number | null = null;
  let durationMs: number | undefined;
  let error: string | null = null;
  let complete = false;
  for (const event of parseExecdEvents(body)) {
    const text = eventText(event);
    if (event.type === "init" && text) providerCommandId = text;
    if ((event.type === "stdout" || event.type === "result") && text !== undefined) stdout = appendLine(stdout, text);
    if (event.type === "stderr" && text !== undefined) stderr = appendLine(stderr, text);
    if (event.type === "execution_complete") {
      complete = true;
      exitCode = exitCode ?? 0;
      if (typeof event.execution_time === "number") durationMs = event.execution_time;
    }
    if (event.type === "error") {
      exitCode = Number(event.error?.evalue ?? 1) || 1;
      error = event.error?.traceback?.join("\n") || event.error?.evalue || "command failed";
      if (error) stderr = appendLine(stderr, error);
    }
  }
  return { providerCommandId, stdout, stderr, exitCode, durationMs, error, complete };
};

export const startExecdCommand = async (input: {
  opensandboxId: string;
  command: string;
  stdin?: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  detached?: boolean;
}) => {
  const command = composeRunCommand(input);
  const body = await callExecd(input.opensandboxId, "/command", {
    method: "POST",
    headers: { accept: "text/event-stream" },
    body: JSON.stringify({
      command,
      cwd: input.cwd,
      background: Boolean(input.detached),
      timeout: input.timeoutMs,
      envs: input.env
    })
  });
  const parsed = parseCommandEvents(body);
  if (input.detached && !parsed.providerCommandId) {
    throw new OpenSandboxHttpError(502, "OpenSandbox execd did not return a background command id");
  }
  const status = parsed.error ? "failed" as const : input.detached ? "running" as const : "succeeded" as const;
  return {
    providerCommandId: parsed.providerCommandId,
    status,
    stdout: parsed.stdout,
    stderr: parsed.stderr,
    exitCode: status === "running" ? null : parsed.exitCode,
    error: parsed.error,
    durationMs: status === "running" ? undefined : parsed.durationMs
  };
};

const parseJsonBody = <T>(body: string): T => {
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new OpenSandboxHttpError(502, `OpenSandbox execd returned invalid JSON: ${body.slice(0, 200)}`);
  }
};

const toIsoOrNull = (value: unknown) => typeof value === "string" && value ? value : null;

const statusFromExecd = (input: { running?: boolean; exit_code?: number | null; error?: string | null }) => {
  if (input.running) return "running" as const;
  if (input.exit_code === 0 && !input.error) return "succeeded" as const;
  return "failed" as const;
};

export const getExecdCommandStatus = async (opensandboxId: string, providerCommandId: string) => {
  const body = await callExecd(opensandboxId, `/command/status/${encodeURIComponent(providerCommandId)}`);
  const status = parseJsonBody<{
    id?: string;
    content?: string;
    running?: boolean;
    exit_code?: number | null;
    error?: string | null;
    started_at?: string | null;
    finished_at?: string | null;
  }>(body);
  return {
    providerCommandId: status.id ?? providerCommandId,
    command: status.content,
    status: statusFromExecd(status),
    exitCode: typeof status.exit_code === "number" ? status.exit_code : null,
    error: status.error ?? null,
    startedAt: toIsoOrNull(status.started_at),
    finishedAt: toIsoOrNull(status.finished_at)
  };
};

export const getExecdCommandLogs = async (opensandboxId: string, providerCommandId: string, cursor?: number) => {
  const endpoint = await resolveExecdEndpoint(opensandboxId);
  const path = `/command/${encodeURIComponent(providerCommandId)}/logs${cursor === undefined ? "" : `?cursor=${cursor}`}`;
  const response = await fetch(joinUrl(endpoint.baseUrl, path), { headers: endpoint.headers });
  const body = await response.text();
  if (!response.ok) throw new OpenSandboxHttpError(response.status, body);
  const cursorHeader = response.headers.get("EXECD-COMMANDS-TAIL-CURSOR");
  const parsedCursor = cursorHeader ? Number(cursorHeader) : undefined;
  return {
    stdout: body,
    stderr: "",
    cursor: Number.isFinite(parsedCursor ?? Number.NaN) ? parsedCursor : undefined
  };
};

export const interruptExecdCommand = async (opensandboxId: string, providerCommandId: string) => {
  await callExecd(opensandboxId, `/command?id=${encodeURIComponent(providerCommandId)}`, { method: "DELETE" });
};

export const createExecdCommandSession = async (input: { opensandboxId: string; cwd?: string }) => {
  const body = await callExecd(input.opensandboxId, "/session", {
    method: "POST",
    body: JSON.stringify({ cwd: input.cwd })
  });
  const parsed = parseJsonBody<{ session_id?: string; sessionId?: string }>(body);
  const sessionId = parsed.session_id ?? parsed.sessionId;
  if (!sessionId) throw new OpenSandboxHttpError(502, `OpenSandbox execd did not return a command session id: ${body.slice(0, 200)}`);
  return { providerSessionId: sessionId, cwd: input.cwd ?? null };
};

export const runExecdCommandSession = async (input: {
  opensandboxId: string;
  providerSessionId: string;
  command: string;
  cwd?: string;
  timeoutMs?: number;
}) => {
  const command = input.command.trim();
  const body = await callExecd(input.opensandboxId, `/session/${encodeURIComponent(input.providerSessionId)}/run`, {
    method: "POST",
    headers: { accept: "text/event-stream" },
    body: JSON.stringify({ command, cwd: input.cwd, timeout: input.timeoutMs })
  });
  const parsed = parseCommandEvents(body);
  return {
    command,
    stdout: parsed.stdout,
    stderr: parsed.stderr,
    exitCode: parsed.exitCode ?? (parsed.error ? 1 : 0),
    durationMs: parsed.durationMs
  };
};

export const deleteExecdCommandSession = async (opensandboxId: string, providerSessionId: string) => {
  await callExecd(opensandboxId, `/session/${encodeURIComponent(providerSessionId)}`, { method: "DELETE" });
};

const webSocketUrl = (baseUrl: string, path: string) => {
  const url = new URL(joinUrl(baseUrl, path));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
};

const closeWebSocket = (socket: WebSocket, code = 1000, reason = "closed") => {
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    socket.close(code, reason);
  }
};

const safeCloseCode = (code: number) =>
  code >= 1000 && code <= 4999 && ![1004, 1005, 1006, 1015].includes(code) ? code : 1000;

const terminateWebSocket = (socket: WebSocket) => {
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    socket.terminate();
  }
};

export const createExecdPtySession = async (input: { opensandboxId: string; cwd?: string }) => {
  const body = await callExecd(input.opensandboxId, "/pty", {
    method: "POST",
    body: JSON.stringify({ cwd: input.cwd })
  });
  const parsed = parseJsonBody<{ session_id?: string; sessionId?: string }>(body);
  const sessionId = parsed.session_id ?? parsed.sessionId;
  if (!sessionId) throw new OpenSandboxHttpError(502, `OpenSandbox execd did not return a PTY session id: ${body.slice(0, 200)}`);
  return { providerSessionId: sessionId };
};

export const getExecdPtySession = async (opensandboxId: string, providerSessionId: string) => {
  const body = await callExecd(opensandboxId, `/pty/${encodeURIComponent(providerSessionId)}`);
  const parsed = parseJsonBody<{ session_id?: string; running?: boolean; output_offset?: number }>(body);
  return {
    providerSessionId: parsed.session_id ?? providerSessionId,
    running: Boolean(parsed.running),
    outputOffset: typeof parsed.output_offset === "number" ? parsed.output_offset : undefined
  };
};

export const deleteExecdPtySession = async (opensandboxId: string, providerSessionId: string) => {
  await callExecd(opensandboxId, `/pty/${encodeURIComponent(providerSessionId)}`, { method: "DELETE" });
};

export const attachExecdPtySession = async (input: {
  opensandboxId: string;
  providerSessionId: string;
  client: WebSocket;
  since?: number;
  pty?: boolean;
}) => {
  const endpoint = await resolveExecdEndpoint(input.opensandboxId);
  const params = new URLSearchParams();
  if (input.since !== undefined) params.set("since", String(input.since));
  if (input.pty === false) params.set("pty", "0");
  const query = params.toString();
  const upstream = new WebSocket(
    webSocketUrl(endpoint.baseUrl, `/pty/${encodeURIComponent(input.providerSessionId)}/ws${query ? `?${query}` : ""}`),
    { headers: endpoint.headers }
  );

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let clientAlive = true;
    let upstreamAlive = true;
    let finish: (error?: Error) => void;
    const maxBufferedBytes = 4 * 1024 * 1024;
    const heartbeat = setInterval(() => {
      const clientTimedOut = input.client.readyState === WebSocket.OPEN && !clientAlive;
      const upstreamTimedOut = upstream.readyState === WebSocket.OPEN && !upstreamAlive;
      if (clientTimedOut || upstreamTimedOut) {
        terminateWebSocket(input.client);
        terminateWebSocket(upstream);
        finish(new OpenSandboxHttpError(504, "OpenSandbox PTY WebSocket heartbeat timed out"));
        return;
      }
      if (input.client.readyState === WebSocket.OPEN) {
        clientAlive = false;
        input.client.ping();
      }
      if (upstream.readyState === WebSocket.OPEN) {
        upstreamAlive = false;
        upstream.ping();
      }
    }, 15_000);
    heartbeat.unref?.();

    const forward = (source: WebSocket, target: WebSocket, data: WebSocket.RawData, isBinary: boolean) => {
      if (target.readyState !== WebSocket.OPEN) return;
      if (target.bufferedAmount > maxBufferedBytes) {
        closeWebSocket(source, 1011, "terminal backpressure limit exceeded");
        closeWebSocket(target, 1011, "terminal backpressure limit exceeded");
        finish(new OpenSandboxHttpError(503, "OpenSandbox PTY WebSocket backpressure limit exceeded"));
        return;
      }
      target.send(data, { binary: isBinary }, (error) => {
        if (!error) return;
        closeWebSocket(source, 1011, "terminal forwarding failed");
        closeWebSocket(target, 1011, "terminal forwarding failed");
        finish(error);
      });
    };

    finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearInterval(heartbeat);
      input.client.off("message", onClientMessage);
      input.client.off("close", onClientClose);
      input.client.off("error", onClientError);
      input.client.off("pong", onClientPong);
      upstream.off("message", onUpstreamMessage);
      upstream.off("open", onUpstreamOpen);
      upstream.off("close", onUpstreamClose);
      upstream.off("error", onUpstreamError);
      upstream.off("pong", onUpstreamPong);
      if (error) reject(error);
      else resolve();
    };
    const onClientMessage = (data: WebSocket.RawData, isBinary: boolean) => {
      forward(input.client, upstream, data, isBinary);
    };
    const onUpstreamMessage = (data: WebSocket.RawData, isBinary: boolean) => {
      forward(upstream, input.client, data, isBinary);
    };
    const onUpstreamOpen = () => {
      if (input.client.readyState !== WebSocket.OPEN) return;
      input.client.send(JSON.stringify({
        type: "connected",
        session_id: input.providerSessionId,
        mode: "pty"
      }));
    };
    const onClientClose = () => {
      closeWebSocket(upstream, 1000, "client closed");
      finish();
    };
    const onUpstreamClose = (code: number, reason: Buffer) => {
      closeWebSocket(input.client, safeCloseCode(code), reason.length ? reason.toString("utf8") : "provider closed");
      finish();
    };
    const onClientError = (error: Error) => {
      closeWebSocket(upstream, 1011, "client error");
      finish(error);
    };
    const onUpstreamError = (error: Error) => {
      closeWebSocket(input.client, 1011, "provider error");
      finish(error);
    };
    const onClientPong = () => {
      clientAlive = true;
    };
    const onUpstreamPong = () => {
      upstreamAlive = true;
    };

    input.client.on("message", onClientMessage);
    input.client.on("close", onClientClose);
    input.client.on("error", onClientError);
    input.client.on("pong", onClientPong);
    upstream.on("open", onUpstreamOpen);
    upstream.on("message", onUpstreamMessage);
    upstream.on("close", onUpstreamClose);
    upstream.on("error", onUpstreamError);
    upstream.on("pong", onUpstreamPong);
  });
};
