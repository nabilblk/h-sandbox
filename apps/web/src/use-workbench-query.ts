import { useEffect, useState } from "react";
import { errorMessage } from "./workbench";

/** Refresh snapshots serially; abort obsolete requests and never infer a successful observation. */
export function useWorkbenchQuery<T>(load: (signal: AbortSignal) => Promise<T>, intervalMs = 0) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [observedAt, setObservedAt] = useState<string>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const refresh = async () => {
      controller = new AbortController();
      const request = controller;
      const deadline = setTimeout(() => request.abort(new Error("Request timed out. Refresh to try again.")), 20_000);
      setLoading(true);
      try {
        const result = await load(request.signal);
        request.signal.throwIfAborted();
        if (!disposed) { setData(result); setError(""); setObservedAt(new Date().toISOString()); }
      } catch (cause) {
        if (!disposed) setError(errorMessage(request.signal.aborted ? request.signal.reason : cause, "Runtime data unavailable."));
      } finally {
        clearTimeout(deadline);
        if (!disposed) {
          setLoading(false);
          if (intervalMs) timer = setTimeout(tick, intervalMs);
        }
      }
    };
    const tick = () => {
      if (document.hidden) { timer = setTimeout(tick, intervalMs); return; }
      void refresh();
    };
    void refresh();
    return () => { disposed = true; clearTimeout(timer); controller?.abort(); };
  }, [load, intervalMs, revision]);
  return { data, error, loading, observedAt, refresh: () => setRevision((value) => value + 1) };
}
