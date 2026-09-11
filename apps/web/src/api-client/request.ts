import { formatApiErrorResponse, parseApiErrorResponse, type ApiErrorResponse } from "@harakiri/shared";
import { auth, AuthSessionExpiredError, type AuthSession } from "../auth";
import { env } from "../runtime-config";

const defaultApiUrl = () => "http://127.0.0.1:8080";

const API_URL = env.PUBLIC_API_URL ?? env.VITE_PUBLIC_API_URL ?? defaultApiUrl();
const API_KEY = env.PUBLIC_API_KEY ?? env.VITE_PUBLIC_API_KEY;

const sessionExpiredMessage = "Session expired. Sign in again to continue.";
const apiUnavailableMessage = `Unable to reach Harakiri API at ${API_URL}. Check the tunnel or port-forward, then refresh.`;
const authUnavailableMessage = "Unable to reach Keycloak. Check the auth tunnel or port-forward, then sign in again.";

export class ApiResponseError extends Error {
  constructor(readonly status: number, message: string, readonly details: ApiErrorResponse | null = null) {
    super(message);
    this.name = "ApiResponseError";
  }
  get code() { return this.details?.error; }
}

const isNetworkError = (error: unknown) =>
  error instanceof TypeError && /failed to fetch|load failed|network|fetch/i.test(error.message);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const authHeaders = (token: string | null) => {
  if (token) return { authorization: `Bearer ${token}` };
  if (API_KEY) return { "x-api-key": API_KEY };
  return null;
};

const fetchWithRetry = async (url: string, init: RequestInit) => {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    const method = (init.method ?? "GET").toUpperCase();
    if (!["GET", "HEAD"].includes(method) && !new Headers(init.headers).has("Idempotency-Key")) throw new Error(apiUnavailableMessage);
    await sleep(250);
    try {
      return await fetch(url, init);
    } catch (retryError) {
      if (isNetworkError(retryError)) throw new Error(apiUnavailableMessage);
      throw retryError;
    }
  }
};

export const createResponseRequester = (session: AuthSession = auth) => {
  const send = async (path: string, init: RequestInit, token: string | null) => {
    const hasBody = init.body !== undefined;
    const credentials = authHeaders(token);
    if (!credentials) throw new Error("Missing authentication. Sign in with Keycloak or configure PUBLIC_API_KEY.");
    const headers = new Headers(init.headers);
    if (hasBody && !headers.has("content-type")) headers.set("content-type", "application/json");
    for (const [key, value] of Object.entries(credentials)) headers.set(key, value);
    const response = await fetchWithRetry(`${API_URL}${path}`, {
      ...init,
      headers
    });
    if (!response.ok) {
      const body = await response.text();
      const details = parseApiErrorResponse(body);
      throw new ApiResponseError(response.status, details?.message ?? formatApiErrorResponse(response.status, body), details);
    }
    if (typeof window !== "undefined" && init.method && init.method !== "GET" && /^\/v1\/(sandboxes|org\/settings)/.test(path)) window.dispatchEvent(new Event("harakiri:capacity-changed"));
    return response;
  };

  return async (path: string, init: RequestInit = {}) => {
    let token: string | null;
    try {
      token = await session.getAccessToken(30);
    } catch (error) {
      if (error instanceof AuthSessionExpiredError) throw new Error(sessionExpiredMessage);
      if (isNetworkError(error)) throw new Error(authUnavailableMessage);
      throw error;
    }

    try {
      return await send(path, init, token);
    } catch (error) {
      if (!token || !(error instanceof ApiResponseError) || error.status !== 401) throw error;
      try {
        const refreshed = await session.getAccessToken(-1);
        return await send(path, init, refreshed);
      } catch (refreshError) {
        if (refreshError instanceof AuthSessionExpiredError) throw new Error(sessionExpiredMessage);
        throw refreshError;
      }
    }
  };
};

export const createRequester = (session: AuthSession = auth) => {
  const send = createResponseRequester(session);
  return async <T>(path: string, init: RequestInit = {}): Promise<T> => (await send(path, init)).json();
};

export const requestResponse = createResponseRequester();
export const request = createRequester();
