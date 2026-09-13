export type ObservationOptions = {
  /** Total local observation budget, including requests and polling delays. */
  timeoutMs?: number;
  intervalMs?: number;
  /** Cancels observation only, never the remote task. */
  signal?: AbortSignal;
};

type Observer = {
  signal: AbortSignal;
  run<T>(action: () => Promise<T>): Promise<T>;
  pause(): Promise<void>;
};

/** Race even non-cooperative transports against cancellation; always remove listeners. */
const interruptible = <T>(action: () => Promise<T>, signal: AbortSignal): Promise<T> => {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => {
      signal.throwIfAborted();
      return action();
    }).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
};

export async function observe<T>(
  options: ObservationOptions,
  defaults: { timeoutMs: number; intervalMs: number },
  timeoutError: () => Error,
  action: (observer: Observer) => Promise<T>
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? defaults.timeoutMs;
  const intervalMs = options.intervalMs ?? defaults.intervalMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 2_147_483_647 ||
    !Number.isSafeInteger(intervalMs) || intervalMs < 0 || intervalMs > 2_147_483_647) {
    throw new RangeError("Wait requires non-negative integer timeoutMs and intervalMs up to 2147483647.");
  }
  options.signal?.throwIfAborted();
  if (timeoutMs === 0) throw timeoutError();
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const deadline = Date.now() + timeoutMs;
  const timer = setTimeout(() => controller.abort(timeoutError()), timeoutMs);
  const run = async <R>(work: () => Promise<R>) => {
    const result = await interruptible(work, signal);
    options.signal?.throwIfAborted();
    if (Date.now() >= deadline && !signal.aborted) controller.abort(timeoutError());
    signal.throwIfAborted();
    return result;
  };
  try {
    return await run(() => action({
      signal,
      run,
      pause: () => new Promise<void>((resolve, reject) => {
        signal.throwIfAborted();
        const abort = () => { clearTimeout(delay); reject(signal.reason); };
        const delay = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, intervalMs);
        signal.addEventListener("abort", abort, { once: true });
      })
    }));
  } finally {
    clearTimeout(timer);
  }
}
