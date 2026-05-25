import { config } from "../../config.js";

export class OpenSandboxHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string
  ) {
    super(`OpenSandbox ${status}: ${body}`);
  }
}

export const openSandboxHeaders = () => ({
  "content-type": "application/json",
  "OPEN-SANDBOX-API-KEY": config.openSandboxApiKey
});

export const callOpenSandbox = async <T>(path: string, init: RequestInit = {}) => {
  const response = await fetch(`${config.openSandboxBaseUrl}${path}`, {
    ...init,
    headers: { ...openSandboxHeaders(), ...(init.headers ?? {}) }
  });
  const body = await response.text();
  if (!response.ok) {
    throw new OpenSandboxHttpError(response.status, body);
  }
  if (!body) return undefined as T;
  return JSON.parse(body) as T;
};

export const callOpenSandboxText = async (path: string) => {
  const response = await fetch(`${config.openSandboxBaseUrl}${path}`, { headers: openSandboxHeaders() });
  const body = await response.text();
  if (!response.ok) throw new OpenSandboxHttpError(response.status, body);
  return body;
};

export const joinUrl = (baseUrl: string, path: string) => {
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

export const openSandboxUrl = (value: string) => {
  const trimmed = value.trim();
  if (/^https?:\/\//.test(trimmed)) return trimmed.replace(/\/+$/, "");
  if (trimmed.startsWith("/")) return joinUrl(config.openSandboxBaseUrl, trimmed);
  return `${openSandboxProtocol()}//${trimmed.replace(/^\/+/, "")}`.replace(/\/+$/, "");
};
