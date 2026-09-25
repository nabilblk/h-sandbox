import { observe } from "./observation.js";

export type RequestOptions = {
  /** Cancels local HTTP waiting, not remote execution. Preserve acknowledged IDs. */
  signal?: AbortSignal;
  /** Per HTTP request, including the response body. Default: 120000 ms. No retries. */
  requestTimeoutMs?: number;
};

export const defaultRequestTimeoutMs = 120_000;

export function validateRequestTimeout(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
    throw new RangeError("requestTimeoutMs must be a positive integer up to 2147483647.");
  }
  return value;
}

/** A local deadline says nothing about whether a remote mutation took effect. */
export class HarakiriRequestTimeoutError extends Error {
  readonly code = "request_timeout";
  readonly retryable = false;

  constructor(readonly requestTimeoutMs: number, readonly method: string) {
    super(`Harakiri ${method} request exceeded ${requestTimeoutMs} ms. The remote outcome may be unknown; do not automatically replay mutations.`);
    this.name = "HarakiriRequestTimeoutError";
  }
}

/** One attempt, bounded through body consumption even with an uncooperative custom fetch. */
export function requestJson<T>(
  fetchImpl: typeof fetch, url: string, init: RequestInit, options: RequestOptions,
  apiError: (status: number, body: string) => Error
): Promise<T> {
  const timeoutMs = validateRequestTimeout(options.requestTimeoutMs ?? defaultRequestTimeoutMs);
  const signal = options.signal && init.signal
    ? AbortSignal.any([options.signal, init.signal]) : options.signal ?? init.signal ?? undefined;
  return observe({ timeoutMs, signal }, { timeoutMs, intervalMs: 0 },
    () => new HarakiriRequestTimeoutError(timeoutMs, init.method ?? "GET"),
    async ({ signal }) => {
      const response = await fetchImpl(url, { ...init, signal });
      // A custom fetch may return after cancellation. Do not consume its body.
      if (signal.aborted) {
        void response.body?.cancel().catch(() => undefined);
        signal.throwIfAborted();
      }
      if (!response.ok) throw apiError(response.status, await response.text());
      return await response.json() as T;
    });
}
