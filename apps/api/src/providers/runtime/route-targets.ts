import { config } from "../../config.js";
import type { RuntimeRouteTarget } from "./provider.js";

export const dnsSafeRouteSegment = (value: string) => {
  const safe = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 58);
  return safe || "sandbox";
};

export const routeKeyFor = (sandboxId: string, port: number) => `${dnsSafeRouteSegment(sandboxId)}-${port}`;

const routeBaseDomain = (baseDomain = config.sandboxRouteBaseDomain) => {
  const normalized = baseDomain.trim().replace(/^\.+|\.+$/g, "");
  return normalized || "sandbox.localhost";
};

const routeScheme = (scheme = config.sandboxRoutePublicScheme) => {
  const normalized = scheme.trim().replace(/:\/+$/, "");
  return normalized === "http" ? "http" : "https";
};

export const routeUrl = (hostOrUrl: string, scheme = config.sandboxRoutePublicScheme) =>
  /^https?:\/\//.test(hostOrUrl) ? hostOrUrl : `${routeScheme(scheme)}://${hostOrUrl}`;

export const routeHost = (hostOrUrl: string) => {
  try {
    return new URL(routeUrl(hostOrUrl)).host;
  } catch {
    return hostOrUrl.replace(/^https?:\/\//, "").split("/")[0] ?? hostOrUrl;
  }
};

export const configuredRouteHost = (sandboxId: string, port: number, baseDomain = config.sandboxRouteBaseDomain) =>
  `${routeKeyFor(sandboxId, port)}.${routeBaseDomain(baseDomain)}`;

export const configuredRouteTarget = (input: {
  sandboxId: string;
  port: number;
  provider: string;
  providerRouteId?: string | null;
  state?: RuntimeRouteTarget["state"];
  baseDomain?: string;
  scheme?: string;
}): RuntimeRouteTarget => {
  const routeKey = routeKeyFor(input.sandboxId, input.port);
  const host = `${routeKey}.${routeBaseDomain(input.baseDomain)}`;
  const url = routeUrl(host, input.scheme);
  return {
    routeKey,
    host,
    url,
    targetUrl: url,
    provider: input.provider,
    providerRouteId: input.providerRouteId ?? null,
    state: input.state ?? "ready"
  };
};
