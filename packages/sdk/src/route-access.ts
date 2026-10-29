import type { SandboxRouteSummary } from "./protocol.js";
import { observe, type ObservationOptions } from "./observation.js";
import { HarakiriWaitTimeoutError } from "./operation-errors.js";

/** Persist the service address and grant, without retaining provider implementation metadata. */
export type RouteAddress = Pick<SandboxRouteSummary, "url" | "routeKey" | "accessMode" | "accessHeaderName">;
export type RouteGrant = { route: RouteAddress; accessToken?: string; accessHeaderName?: string };
export type RouteLike = RouteAddress | RouteGrant;
export type RouteBasicAuth = { username: string; password: string };
export type RouteAccessHeadersOptions = { basicAuth?: RouteBasicAuth };
export type CreateRouteFetchOptions = RouteAccessHeadersOptions & {
  fetch?: typeof fetch;
  headers?: HeadersInit;
};
export type RouteWebSocketRequestOptions = RouteAccessHeadersOptions & { headers?: HeadersInit };
export type RouteWebSocketRequest = { url: string; headers: Record<string, string> };
export type WaitForRouteHttpOptions = CreateRouteFetchOptions & ObservationOptions & {
  path?: string;
  init?: RequestInit;
  expect?: (response: Response) => boolean | Promise<boolean>;
};
export type ExposeAndWaitOptions = WaitForRouteHttpOptions;

const isResponse = (route: RouteLike): route is RouteGrant => "route" in route;
const summary = (route: RouteLike) => isResponse(route) ? route.route : route;

const base64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
};

export const routeAccessHeaders = (route: RouteLike, options: RouteAccessHeadersOptions = {}) => {
  const headers: Record<string, string> = {};
  const name = (isResponse(route) ? route.accessHeaderName : undefined) ?? summary(route).accessHeaderName;
  if (isResponse(route) && route.accessToken && name) headers[name] = route.accessToken;
  if (options.basicAuth) headers.authorization = `Basic ${base64(`${options.basicAuth.username}:${options.basicAuth.password}`)}`;
  return headers;
};

const requestUrl = (route: RouteLike, input: string | URL | Request) => {
  const base = new URL(summary(route).url);
  const value = input instanceof Request ? input.url : String(input);
  if (/[\\\u0000-\u001f\u007f]/.test(value)) throw new TypeError("Route paths cannot contain control characters or backslashes.");
  const prefix = base.pathname.replace(/\/+$/, "");
  const root = new URL(base);
  root.pathname = `${prefix}/`;
  const url = new URL(value.replace(/^\/(?!\/)/, ""), root);
  if (!/^https?:$/.test(base.protocol) || base.username || base.password || url.username || url.password ||
    url.origin !== base.origin || (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`))) {
    throw new TypeError("Route fetch is restricted to its route origin and path.");
  }
  // Proxies may decode before routing; reject nested escapes and traversal before adding credentials.
  if (/%(?:2f|5c|25|0[0-9a-f]|1[0-9a-f]|7f)/i.test(url.pathname) || decodeURIComponent(url.pathname).split("/").some((part) => part === ".." || part === ".")) {
    throw new TypeError("Route fetch does not accept encoded path traversal or separators.");
  }
  return url.toString();
};

/** Server-side WebSocket options. No credentials are placed in the URL or subprotocol. */
export const routeWebSocketRequest = (
  route: RouteLike, path = "/", options: RouteWebSocketRequestOptions = {}
): RouteWebSocketRequest => {
  const url = new URL(requestUrl(route, path));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const headers = new Headers(options.headers);
  for (const [key, value] of Object.entries(routeAccessHeaders(route, options))) headers.set(key, value);
  return { url: url.toString(), headers: Object.fromEntries(headers) };
};

/** Scoped Fetch adapter. Redirects are manual so credentials never follow an unchecked Location. */
export const createRouteFetch = (route: RouteLike, options: CreateRouteFetchOptions = {}) => {
  const fetchImpl = options.fetch ?? fetch;
  return async (input: string | URL | Request = "/", init: RequestInit = {}) => {
    const url = requestUrl(route, input);
    const headers = new Headers(options.headers);
    new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined))
      .forEach((value, key) => headers.set(key, value));
    for (const [key, value] of Object.entries(routeAccessHeaders(route, options))) headers.set(key, value);
    const redirect = init.redirect === "error" || (input instanceof Request && init.redirect === undefined && input.redirect === "error")
      ? "error" : "manual";
    if (input instanceof Request) return fetchImpl(new Request(input, { ...init, headers, redirect }));
    return fetchImpl(url, { ...init, headers, redirect });
  };
};

export const waitForRouteHttp = async (route: RouteLike, options: WaitForRouteHttpOptions = {}) => {
  const routeFetch = createRouteFetch(route, options);
  let lastStatus: number | undefined;
  const signals = [options.signal, options.init?.signal].filter((signal): signal is AbortSignal => Boolean(signal));
  return observe({ ...options, signal: signals.length ? AbortSignal.any(signals) : undefined },
    { timeoutMs: 30_000, intervalMs: 500 },
    () => new HarakiriWaitTimeoutError(`Timed out waiting for route ${summary(route).routeKey}${lastStatus ? `; last status ${lastStatus}` : ""}`,
      "route", summary(route).routeKey, lastStatus?.toString()),
    async ({ signal, run, pause }) => {
      while (true) {
        let response: Response | undefined;
        let accepted = false;
        try {
          response = await run(() => routeFetch(options.path ?? "/", { ...options.init, signal }));
          lastStatus = response.status;
          accepted = await run(async () => (options.expect ?? ((candidate: Response) => candidate.ok))(response!));
          if (accepted) return response;
        } catch (error) {
          signal.throwIfAborted();
          // Configuration errors are not transient health failures.
          if (error instanceof TypeError && /Route fetch/.test(error.message)) throw error;
        } finally {
          if (!accepted && response?.body && !response.body.locked) void response.body.cancel().catch(() => undefined);
        }
        await pause();
      }
    });
};
