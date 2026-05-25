import { formatApiErrorResponse } from "@harakiri/shared";
import { auth } from "../auth";

const env = import.meta.env ?? ({} as ImportMetaEnv);

const defaultApiUrl = () => {
  return "http://127.0.0.1:8080";
};

const API_URL = env.PUBLIC_API_URL ?? env.VITE_PUBLIC_API_URL ?? defaultApiUrl();
const API_KEY = env.PUBLIC_API_KEY ?? env.VITE_PUBLIC_API_KEY;

export const request = async <T>(path: string, init: RequestInit = {}) => {
  const hasBody = init.body !== undefined;
  const token = auth.token();
  if (!token && !API_KEY) throw new Error("Missing authentication. Sign in with Keycloak or configure PUBLIC_API_KEY.");
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(hasBody ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : { "x-api-key": API_KEY }),
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) throw new Error(formatApiErrorResponse(response.status, await response.text()));
  return (await response.json()) as T;
};
