import type { SandboxRouteSummary, SandboxRouteResponse } from "./protocol.js";
import { observe, type ObservationOptions } from "./observation.js";
import { HarakiriWaitTimeoutError } from "./operation-errors.js";

export type RouteLike = SandboxRouteSummary | SandboxRouteResponse;
export type RouteBasicAuth = { username: string; password: string };
export type RouteAccessHeadersOptions = { basicAuth?: RouteBasicAuth };
export type CreateRouteFetchOptions = RouteAccessHeadersOptions & {
  fetch?: typeof fetch;
  headers?: HeadersInit;
};
export type WaitForRouteHttpOptions = CreateRouteFetchOptions & ObservationOptions & {
  path?: string;
  init?: RequestInit;
  expect?: (response: Response) => boolean | Promise<boolean>;
};
export type ExposeAndWaitOptions = WaitForRouteHttpOptions;

const isResponse = (route: RouteLike): route is SandboxRouteResponse => "route" in route;
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
  const prefix = base.pathname.replace(/\/+$/, "");
  const root = new URL(base);
  root.pathname = `${prefix}/`;
  const url = new URL(value.replace(/^\/(?!\/)/, ""), root);
  if (!/^https?:$/.test(base.protocol) || base.username || base.password || url.username || url.password ||
    url.origin !== base.origin || (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`))) {
    throw new TypeError("Route fetch is restricted to its route origin and path.");
  }
  // Proxies may decode before routing; reject nested escapes and traversal before adding credentials.
  if (/%(?:2f|5c|25)/i.test(url.pathname) || decodeURIComponent(url.pathname).split("/").some((part) => part === ".." || part === ".")) {
    throw new TypeError("Route fetch does not accept encoded path traversal or separators.");
  }
  return url.toString();
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
