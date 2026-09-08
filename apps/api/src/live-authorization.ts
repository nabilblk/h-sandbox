import type { AuthContext } from "./auth-context.js";
import { revalidatePrincipal } from "./auth.js";
import { hasScope } from "./authorization.js";
import type { Query } from "./services/query.js";

// Disconnect the observer without cancelling detached background commands.
export const watchTerminalAuthorization = (
  auth: AuthContext,
  disconnect: () => void,
  dependencies: { query: Query; intervalMs?: number; timeoutMs?: number }
) => {
  let stopped = false;
  let checking = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    stopped = true;
    clearInterval(timer);
    clearTimeout(expiry);
    clearTimeout(deadline);
  };
  const reject = () => { if (!stopped) { stop(); disconnect(); } };
  const timer = setInterval(async () => {
    if (checking || stopped) return;
    checking = true;
    deadline = setTimeout(reject, dependencies.timeoutMs ?? 5000);
    try {
      const current = await revalidatePrincipal(auth, dependencies.query);
      if (!current || !hasScope(current, "sandboxes:write")) reject();
    } catch { reject(); }
    finally { clearTimeout(deadline); checking = false; }
  }, dependencies.intervalMs ?? 5000);
  const remaining = auth.expiresAt ? Date.parse(auth.expiresAt) - Date.now() : Infinity;
  const expiry = remaining <= 2 ** 31 - 1 ? setTimeout(reject, Math.max(0, remaining)) : undefined;
  timer.unref();
  expiry?.unref();
  return stop;
};
