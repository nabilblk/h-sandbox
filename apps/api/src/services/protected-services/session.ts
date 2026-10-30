import type { Query } from "../query.js";
import { getSandboxRouteProxyTarget, type ServiceTarget } from "./access.js";
import { ServiceProxyError, type ServiceLimits } from "./limits.js";

/** A timed-out caller cannot enqueue unlimited uncancellable database work. */
export const boundedServiceQuery = (query: Query, maximum: number): Query => {
  let pending = 0;
  return async (sql, params) => {
    if (pending >= maximum) throw new ServiceProxyError(503, "route_proxy_authorization_unavailable");
    pending++;
    try {
      return await query(sql, params);
    } finally {
      pending--;
    }
  };
};

export const withDeadline = async <T>(work: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new ServiceProxyError(503, "route_proxy_authorization_unavailable")),
          timeoutMs
        );
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};

/** Per-process admission, not organization sandbox capacity. Leases are idempotently released. */
export class ServiceConnections {
  readonly #routes = new Map<string, number>();
  readonly #sessions = new Set<AbortController>();
  constructor(readonly limits: ServiceLimits) {}

  acquire(routeKey: string) {
    const count = this.#routes.get(routeKey) ?? 0;
    if (this.#sessions.size >= this.limits.connections || count >= this.limits.connectionsPerRoute) {
      throw new ServiceProxyError(429, "route_proxy_connection_limit");
    }
    const controller = new AbortController();
    this.#sessions.add(controller);
    this.#routes.set(routeKey, count + 1);
    const release = () => {
      if (!this.#sessions.delete(controller)) return;
      const remaining = (this.#routes.get(routeKey) ?? 1) - 1;
      if (remaining) this.#routes.set(routeKey, remaining);
      else this.#routes.delete(routeKey);
    };
    return { controller, release };
  }

  close() {
    for (const controller of this.#sessions) controller.abort(new ServiceProxyError(503, "route_proxy_shutdown"));
  }
}

export const watchServiceAccess = (
  target: ServiceTarget,
  token: string,
  controller: AbortController,
  query: Query,
  limits: ServiceLimits
) => {
  let checking = false;
  const expire = (code: ServiceProxyError["code"]) => controller.abort(new ServiceProxyError(401, code));
  const timer = setInterval(async () => {
    if (checking || controller.signal.aborted) return;
    checking = true;
    try {
      const current = await withDeadline(
        getSandboxRouteProxyTarget({ routeKey: target.routeKey, token, touch: false }, query),
        limits.authorizationTimeoutMs
      );
      if (
        current.kind !== "ok" ||
        current.targetUrl !== target.targetUrl ||
        current.provider !== target.provider ||
        current.host !== target.host
      ) {
        expire("route_proxy_access_revoked");
      }
    } catch {
      expire("route_proxy_access_revoked");
    } finally {
      checking = false;
    }
  }, limits.authorizationIntervalMs);
  const lifetime = setTimeout(
    () => controller.abort(new ServiceProxyError(504, "route_proxy_lifetime_exceeded")),
    limits.lifetimeMs
  );
  timer.unref();
  lifetime.unref();
  return () => {
    clearInterval(timer);
    clearTimeout(lifetime);
  };
};
