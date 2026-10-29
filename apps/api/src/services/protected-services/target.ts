import type { IncomingHttpHeaders, OutgoingHttpHeaders } from "node:http";
import { config } from "../../config.js";
import { sandboxRouteAccessTokenHeader, sandboxRouteAccessTokenQueryParam, type ServiceTarget } from "./access.js";
import { ServiceProxyError } from "./limits.js";

const hopHeaders = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
];

export const serviceUrl = (target: ServiceTarget, requestUrl: string) => {
  let base: URL;
  try {
    base = new URL(target.provider === "opensandbox-gateway" ? config.openSandboxGatewayUrl : target.targetUrl);
  } catch {
    throw new ServiceProxyError(502, "route_proxy_invalid_target");
  }
  if (!/^https?:$/.test(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new ServiceProxyError(502, "route_proxy_invalid_target");
  }
  const separator = requestUrl.indexOf("?");
  const pathname = separator < 0 ? requestUrl : requestUrl.slice(0, separator);
  const search = separator < 0 ? "" : requestUrl.slice(separator + 1);
  const path = pathname.replace(/^\/v1\/route-proxy\/[^/]+\/?/, "");
  // Work from the raw URL: the router has already decoded its wildcard parameter.
  if (path.startsWith("/") || /[\\\u0000-\u0020#]|%(?:2f|5c|25|00)/i.test(path) || /^[a-z][a-z\d+.-]*:/i.test(path)) {
    throw new ServiceProxyError(400, "route_proxy_invalid_path");
  }
  let segments: string[];
  try {
    segments = decodeURIComponent(path).split("/");
  } catch {
    throw new ServiceProxyError(400, "route_proxy_invalid_path");
  }
  if (segments.some((part) => part === "." || part === ".." || /[\u0000-\u001f\u007f]/.test(part)))
    throw new ServiceProxyError(400, "route_proxy_invalid_path");
  const prefix = `${base.pathname.replace(/\/+$/, "")}/`;
  const url = new URL(base);
  url.pathname = prefix + path;
  url.search = search;
  url.searchParams.delete(sandboxRouteAccessTokenQueryParam);
  return { url, base, prefix };
};

export const serviceRequestHeaders = (headers: IncomingHttpHeaders, target: ServiceTarget): OutgoingHttpHeaders => {
  const denied = new Set([
    ...hopHeaders,
    ...(headers.connection ?? "")
      .toLowerCase()
      .split(",")
      .map((name) => name.trim()),
    "host",
    "content-length",
    "expect",
    "cookie",
    "referer",
    "x-api-key",
    "opensandbox-ingress-to",
    sandboxRouteAccessTokenHeader,
    target.headerName.toLowerCase()
  ]);
  const result: OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(headers)) {
    const key = name.toLowerCase();
    if (
      denied.has(key) ||
      key.startsWith("sec-websocket-") ||
      key.startsWith("x-forwarded-") ||
      key.startsWith("x-harakiri-") ||
      key === "forwarded" ||
      value === undefined
    )
      continue;
    result[key] = value;
  }
  if (target.provider === "opensandbox-gateway") result["opensandbox-ingress-to"] = target.routeKey;
  return result;
};

const responseHeaders = [
  "content-type",
  "content-length",
  "content-encoding",
  "content-disposition",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
  "vary",
  "retry-after",
  "www-authenticate"
];

export const serviceResponseHeaders = (
  headers: IncomingHttpHeaders,
  target: ReturnType<typeof serviceUrl>,
  routeKey: string
): OutgoingHttpHeaders => {
  const result: OutgoingHttpHeaders = {};
  const denied = new Set([
    ...hopHeaders,
    ...(headers.connection ?? "")
      .toLowerCase()
      .split(",")
      .map((name) => name.trim())
  ]);
  for (const name of responseHeaders)
    if (!denied.has(name) && headers[name] !== undefined) result[name] = headers[name];
  if (headers.location) {
    let location: URL;
    try {
      location = new URL(headers.location, target.url);
    } catch {
      throw new ServiceProxyError(502, "route_proxy_redirect_rejected");
    }
    if (
      location.origin !== target.base.origin ||
      location.username ||
      location.password ||
      !location.pathname.startsWith(target.prefix)
    ) {
      throw new ServiceProxyError(502, "route_proxy_redirect_rejected");
    }
    location.searchParams.delete(sandboxRouteAccessTokenQueryParam);
    result.location = `/v1/route-proxy/${encodeURIComponent(routeKey)}/${location.pathname.slice(target.prefix.length)}${location.search}${location.hash}`;
  }
  result["cache-control"] = "private, no-store";
  result["content-security-policy"] = "sandbox allow-scripts allow-forms allow-downloads";
  result["x-content-type-options"] = "nosniff";
  result["referrer-policy"] = "no-referrer";
  return result;
};
