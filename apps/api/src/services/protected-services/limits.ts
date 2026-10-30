import type { SandboxRuntimeApiErrorCode } from "@harakiri/shared";

const positiveInteger = (name: string, fallback: number) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2 ** 31 - 1) {
    throw new Error(`${name} must be a positive integer no greater than 2147483647`);
  }
  return value;
};

export const protectedServiceLimits = () => ({
  requestBytes: positiveInteger("SERVICE_PROXY_MAX_REQUEST_BYTES", 32 * 1024 * 1024),
  responseBytes: positiveInteger("SERVICE_PROXY_MAX_RESPONSE_BYTES", 64 * 1024 * 1024),
  websocketMessageBytes: positiveInteger("SERVICE_PROXY_MAX_WS_MESSAGE_BYTES", 1024 * 1024),
  headerBytes: positiveInteger("SERVICE_PROXY_MAX_HEADER_BYTES", 16 * 1024),
  connections: positiveInteger("SERVICE_PROXY_MAX_CONNECTIONS", 128),
  connectionsPerRoute: positiveInteger("SERVICE_PROXY_MAX_CONNECTIONS_PER_ROUTE", 16),
  connectTimeoutMs: positiveInteger("SERVICE_PROXY_CONNECT_TIMEOUT_MS", 10_000),
  idleTimeoutMs: positiveInteger("SERVICE_PROXY_IDLE_TIMEOUT_MS", 60_000),
  lifetimeMs: positiveInteger("SERVICE_PROXY_MAX_LIFETIME_MS", 60 * 60 * 1000),
  authorizationIntervalMs: positiveInteger("SERVICE_PROXY_AUTH_INTERVAL_MS", 5_000),
  authorizationTimeoutMs: positiveInteger("SERVICE_PROXY_AUTH_TIMEOUT_MS", 5_000)
});

export type ServiceLimits = ReturnType<typeof protectedServiceLimits>;

export class ServiceProxyError extends Error {
  constructor(
    readonly status: number,
    readonly code: SandboxRuntimeApiErrorCode
  ) {
    super(code);
    this.name = "ServiceProxyError";
  }
}
