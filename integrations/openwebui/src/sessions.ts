import {
  HarakiriClient,
  HarakiriApiError,
  createRouteFetch,
  routeWebSocketRequest,
  waitForRouteHttp,
  type RouteGrant
} from "@h-sandbox/sdk";
import { AdapterError, type AdapterConfig } from "./config.js";
import { newBinding, type Binding, type BindingStore } from "./bindings.js";
import type { Identity } from "./identity.js";

export const applicationHeaders = (identity: Identity, serviceKey: string) => ({
  authorization: `Bearer ${serviceKey}`,
  "x-user-id": identity.userId,
  ...(identity.sessionId ? { "x-session-id": identity.sessionId } : {})
});

const routeResponse = (binding: Binding): RouteGrant => {
  if (!binding.grant || !binding.sandboxId) throw new AdapterError(409, "service_grant_unavailable");
  const { accessToken, accessHeaderName, url, routeKey } = binding.grant;
  return {
    accessToken,
    accessHeaderName,
    route: { accessMode: "token", accessHeaderName, routeKey, url }
  };
};

export type Session = {
  sandboxId: string;
  expiresAt: number;
  fetch: ReturnType<typeof createRouteFetch>;
  webSocketRequest: (path: string) => ReturnType<typeof routeWebSocketRequest>;
  serviceKey: string;
};
export type SessionManager = Pick<Sessions, "resolve" | "touch">;
export type SessionUse = "observe" | "open" | "mutate" | "interact";

export class Sessions {
  #pending = 0;
  constructor(
    readonly client: HarakiriClient,
    readonly store: BindingStore,
    readonly config: AdapterConfig
  ) {}

  async resolve(identity: Identity, use: SessionUse, cancellation?: AbortSignal): Promise<Session> {
    if (this.#pending >= this.config.ADAPTER_MAX_CONNECTIONS) throw new AdapterError(503, "context_busy");
    this.#pending++;
    const deadline = AbortSignal.timeout(this.config.ADAPTER_READY_TIMEOUT_MS + 45000);
    const signal = cancellation ? AbortSignal.any([cancellation, deadline]) : deadline;
    try {
      return await this.resolveBinding(identity, use, signal);
    } finally {
      this.#pending--;
    }
  }

  private async resolveBinding(identity: Identity, use: SessionUse, signal: AbortSignal): Promise<Session> {
    return this.store.withBinding(
      identity.bindingKey,
      async (original, save) => {
        signal.throwIfAborted();
        let binding = original;
        const config = this.config;
        const canCreate = use === "open" || use === "mutate";
        // Polling and requests for an existing process must not allocate a runtime.
        if (!binding.sandboxId && !canCreate) throw new AdapterError(409, "sandbox_session_inactive");
        if (!binding.workspaceId) {
          // The API allows 80 characters. The digest includes the full instance
          // and user IDs, so truncating the display prefix cannot merge identities.
          const name = `openwebui-${config.ADAPTER_INSTANCE_ID.slice(0, 32)}-${identity.bindingKey.slice(0, 32)}`;
          if (binding.workspaceIntent) {
            const matches = (await this.client.workspaces.list({ signal })).workspaces.filter(
              (workspace) => workspace.name === name
            );
            if (matches.length !== 1) throw new AdapterError(409, "workspace_creation_unconfirmed");
            binding.workspaceId = matches[0].id;
          } else {
            binding.workspaceIntent = true;
            await save(binding);
            binding.workspaceId = (await this.client.workspaces.create({ name }, { signal })).workspace.id;
          }
          await save(binding);
        }
        const workspaceId = binding.workspaceId;
        if (!workspaceId) throw new AdapterError(409, "workspace_creation_unconfirmed");
        if (binding.sandboxId) {
          const { sandbox } = await this.client.getSandbox(binding.sandboxId, { signal });
          if (sandbox.status === "terminated") {
            if (!canCreate) throw new AdapterError(409, "sandbox_session_inactive");
            const { workspace } = await this.client.workspaces.get(workspaceId, { signal });
            if (workspace.status !== "available" || workspace.attachedSandboxId)
              throw new AdapterError(409, "workspace_release_unconfirmed");
            binding = newBinding(workspaceId);
            await save(binding);
          } else if (sandbox.status === "paused" || sandbox.status === "pausing" || sandbox.status === "error") {
            throw new AdapterError(409, "sandbox_recovery_required");
          } else if (Date.now() >= binding.createdAt + config.ADAPTER_MAX_SESSION_SECONDS * 1000) {
            await this.client.killSandbox(binding.sandboxId, { signal });
            throw new AdapterError(409, "session_expired");
          }
        }
        if (!binding.sandboxId) {
          signal.throwIfAborted();
          binding.creation ??= { template: config.HARAKIRI_TEMPLATE, ttlSeconds: config.ADAPTER_TTL_SECONDS };
          binding.sandboxIntent = true;
          await save(binding);
          // Only creation may repeat, with the same durable key and byte-identical intent.
          // A forwarded execute/upload request is never automatically retried.
          const response = await this.client.createSandbox(
            {
              ...binding.creation,
              name: `openwebui-${binding.generation}`,
              workspaceId,
              env: { OPEN_TERMINAL_API_KEY: binding.serviceKey },
              idempotencyKey: binding.generation,
              wait: false
            },
            { signal }
          );
          const createdAt = Date.parse(response.sandbox.createdAt);
          if (!Number.isFinite(createdAt)) throw new AdapterError(503, "sandbox_creation_time_unavailable");
          binding.sandboxId = response.sandbox.id;
          // Empty bindings and quota waits are not runtime age. An idempotent
          // replay retains the accepted runtime's original server timestamp.
          binding.createdAt = createdAt;
          binding.renewedAt = Date.now();
          await save(binding);
        }
        await this.client.waitForSandbox(binding.sandboxId, { timeoutMs: config.ADAPTER_READY_TIMEOUT_MS, signal });
        const newGrant = !binding.grant;
        if (!binding.grant) {
          if (binding.routeIntent) throw new AdapterError(409, "route_creation_unconfirmed");
          binding.routeIntent = true;
          await save(binding);
          const response = await this.client.routes.expose(
            binding.sandboxId,
            { port: 8000, accessMode: "token" },
            { signal }
          );
          if (!response.accessToken || response.accessHeaderName !== "x-harakiri-route-token")
            throw new AdapterError(409, "service_grant_unavailable");
          binding.grant = {
            url: response.route.url,
            routeKey: response.route.routeKey,
            accessToken: response.accessToken,
            accessHeaderName: response.accessHeaderName
          };
          await save(binding);
        }
        const route = routeResponse(binding);
        const headers = applicationHeaders(identity, binding.serviceKey);
        const routeFetch = createRouteFetch(route, { headers });
        // Only a newly exposed service needs a readiness loop. Retrying a revoked
        // grant under the binding lock would block the operator's recovery.
        const health = newGrant
          ? await waitForRouteHttp(route, { path: "/health", headers, timeoutMs: 30000, signal })
          : await routeFetch("/health", { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
        try {
          if ([401, 403, 404, 410].includes(health.status)) throw new AdapterError(409, "service_grant_unavailable");
          if (!health.ok) throw new AdapterError(503, "sandbox_service_unavailable");
        } finally {
          await health.body?.cancel();
        }
        if (use === "mutate" || use === "interact") await this.renew(binding, save, signal);
        return {
          sandboxId: binding.sandboxId,
          expiresAt: binding.createdAt + config.ADAPTER_MAX_SESSION_SECONDS * 1000,
          serviceKey: binding.serviceKey,
          fetch: routeFetch,
          webSocketRequest: (path) => routeWebSocketRequest(route, path, { headers })
        };
      },
      signal
    );
  }

  async touch(identity: Identity, sandboxId: string, cancellation?: AbortSignal) {
    const deadline = AbortSignal.timeout(30000);
    const signal = cancellation ? AbortSignal.any([cancellation, deadline]) : deadline;
    await this.store.withBinding(identity.bindingKey, async (binding, save) => {
      if (binding.sandboxId !== sandboxId) throw new AdapterError(409, "session_replaced");
      await this.renew(binding, save, signal);
    }, signal);
  }

  private async renew(binding: Binding, save: (binding: Binding) => Promise<void>, signal: AbortSignal) {
    signal.throwIfAborted();
    const now = Date.now();
    const end = binding.createdAt + this.config.ADAPTER_MAX_SESSION_SECONDS * 1000;
    if (now >= end) throw new AdapterError(409, "session_expired");
    const ttl = binding.creation?.ttlSeconds ?? this.config.ADAPTER_TTL_SECONDS;
    if (binding.sandboxId && now - binding.renewedAt >= 30000 && now + ttl * 1000 <= end) {
      await this.client.renewSandbox(binding.sandboxId, { signal, requestTimeoutMs: 10000 });
      binding.renewedAt = now;
      await save(binding);
    }
  }
}

export const publicError = (error: unknown) => {
  if (error instanceof AdapterError) return error;
  if (error instanceof HarakiriApiError && error.code === "organization_capacity_exceeded")
    return new AdapterError(429, "organization_capacity_exceeded");
  return new AdapterError(503, "sandbox_service_unavailable");
};
