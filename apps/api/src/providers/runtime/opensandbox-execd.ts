import { config } from "../../config.js";
import { callOpenSandbox, joinUrl, OpenSandboxHttpError, openSandboxUrl } from "./opensandbox-client.js";
import type { ProviderEndpoint } from "./opensandbox-types.js";

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

export const runExecdCommand = async (input: { opensandboxId: string; command: string; stdin?: string }) => {
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
