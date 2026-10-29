import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { AdapterError } from "./config.js";

const digest = (value: string) => createHash("sha256").update(value).digest();
export const authenticated = (actual: unknown, expected: string) =>
  typeof actual === "string" && actual.length <= 4096 && timingSafeEqual(digest(actual), digest(expected));

const opaque = (value: string | string[] | undefined, required: boolean) => {
  if ((value === undefined || value === "") && !required) return "";
  if (typeof value !== "string" || !/^[a-zA-Z0-9_.:@-]{1,200}$/.test(value))
    throw new AdapterError(400, "invalid_context");
  return value;
};

export type Identity = { bindingKey: string; userId: string; sessionId: string };

/** Call only after authenticating the trusted OpenWebUI server. */
export const identityFor = (instance: string, headers: IncomingHttpHeaders): Identity => {
  const userId = opaque(headers["x-user-id"], true);
  const sessionId = opaque(headers["x-session-id"], false);
  if (headers["x-terminal-context-id"]) throw new AdapterError(400, "personal_context_only");
  return { bindingKey: digest(`${instance}\0${userId}`).toString("hex"), userId, sessionId };
};

export const servicePath = (raw: string) => {
  const path = raw.split("?", 1)[0];
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u0020#]|%(?:2f|5c|25|00)/i.test(path))
    throw new AdapterError(400, "invalid_path");
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    throw new AdapterError(400, "invalid_path");
  }
  if (/[\u0000-\u001f\u007f]/.test(decoded) || decoded.split("/").some((part) => part === "." || part === ".."))
    throw new AdapterError(400, "invalid_path");
  // Only the documented Open Terminal families, not orchestrator administration.
  if (
    !/^\/(?:files(?:\/|$)|execute(?:\/|$)|api\/terminals(?:\/|$)|ports$|proxy\/\d+\/|skills(?:\/|$)|system$)/.test(
      decoded
    )
  ) {
    throw new AdapterError(404, "unsupported_service_path");
  }
  return raw;
};
