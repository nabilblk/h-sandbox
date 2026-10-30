import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  getSandboxRouteProxyTarget,
  sandboxRouteAccessTokenHeader,
  sandboxRouteAccessTokenQueryParam,
  type ServiceTarget
} from "../services/protected-services/access.js";
import { proxyServiceHttp } from "../services/protected-services/http.js";
import {
  protectedServiceLimits,
  ServiceProxyError,
  type ServiceLimits
} from "../services/protected-services/limits.js";
import {
  boundedServiceQuery,
  ServiceConnections,
  watchServiceAccess,
  withDeadline
} from "../services/protected-services/session.js";
import { serviceUrl } from "../services/protected-services/target.js";
import { proxyServiceWebSocket } from "../services/protected-services/websocket.js";
import type { Query } from "../services/query.js";

type Access = { target: ServiceTarget; controller: AbortController; cleanup: () => void };

const sendError = (reply: FastifyReply, error: unknown) => {
  const failure =
    error instanceof ServiceProxyError ? error : new ServiceProxyError(503, "route_proxy_authorization_unavailable");
  return reply.code(failure.status).send({ error: failure.code });
};

export const registerProtectedServiceRoutes = async (
  app: FastifyInstance,
  dependencies: { query: Query; limits?: ServiceLimits }
) => {
  await app.register(
    async (scoped) => {
      const limits = dependencies.limits ?? protectedServiceLimits();
      const connections = new ServiceConnections(limits);
      const query = boundedServiceQuery(dependencies.query, limits.connections);
      const access = new WeakMap<FastifyRequest, Access>();
      scoped.removeAllContentTypeParsers();
      scoped.addContentTypeParser("*", (_request, payload, done) => done(null, payload));
      scoped.addHook("preClose", async () => connections.close());
      scoped.addHook("onRequest", async (request, reply) => {
        const { routeKey } = request.params as { routeKey: string };
        let lease: ReturnType<ServiceConnections["acquire"]> | undefined;
        try {
          lease = connections.acquire(routeKey);
          const owned = lease;
          const socket = request.raw.socket;
          let stopWatching = () => {};
          const cleanup = () => {
            socket.off("close", cleanup);
            stopWatching();
            owned.release();
            owned.controller.abort();
          };
          // ws can reject the handshake before wsHandler creates a WebSocket.
          if (request.ws) socket.once("close", cleanup);
          reply.raw.once("close", () => {
            if (!request.ws) cleanup();
          });
          request.raw.once("aborted", cleanup);
          if (request.raw.rawHeaders.reduce((sum, part) => sum + Buffer.byteLength(part), 0) > limits.headerBytes) {
            throw new ServiceProxyError(431, "route_proxy_headers_too_large");
          }
          const rawHeader = request.headers[sandboxRouteAccessTokenHeader];
          const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
          const token =
            header ??
            new URL(request.url, "http://route.invalid").searchParams.get(sandboxRouteAccessTokenQueryParam) ??
            undefined;
          if (!token) throw new ServiceProxyError(401, "route_token_required");
          const target = await withDeadline(
            getSandboxRouteProxyTarget({ routeKey, token }, query),
            limits.authorizationTimeoutMs
          );
          if (target.kind === "not_found") throw new ServiceProxyError(404, "route_not_found");
          if (target.kind === "route_not_ready") throw new ServiceProxyError(409, "route_not_ready");
          if (target.kind === "public_route") throw new ServiceProxyError(409, "route_proxy_requires_token_route");
          if (target.kind === "unauthorized" || !token) throw new ServiceProxyError(401, "route_token_required");
          serviceUrl(target, request.raw.url ?? request.url);
          if (request.ws && request.headers["sec-websocket-protocol"]) {
            throw new ServiceProxyError(501, "route_proxy_ws_subprotocol_unsupported");
          }
          if (owned.controller.signal.aborted) {
            cleanup();
            return reply;
          }
          stopWatching = watchServiceAccess(target, token, owned.controller, query, limits);
          access.set(request, { target, controller: owned.controller, cleanup });
        } catch (error) {
          lease?.release();
          return sendError(reply, error);
        }
      });
      const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const authorized = access.get(request);
        if (!authorized) return sendError(reply, new ServiceProxyError(401, "route_token_required"));
        try {
          return await proxyServiceHttp(request, reply, authorized.target, authorized.controller, limits);
        } catch (error) {
          authorized.cleanup();
          return sendError(reply, error);
        }
      };
      for (const url of ["/v1/route-proxy/:routeKey", "/v1/route-proxy/:routeKey/*"]) {
        scoped.route({
          method: "GET",
          url,
          handler,
          wsHandler: (socket, request) => {
            const authorized = access.get(request);
            if (!authorized) {
              socket.close(1008, "Route token required");
              return;
            }
            socket.once("close", authorized.cleanup);
            try {
              proxyServiceWebSocket(socket, request, authorized.target, authorized.controller.signal, limits);
            } catch {
              authorized.cleanup();
              socket.close(1011, "Service connection failed");
            }
          }
        });
        scoped.route({ method: ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"], url, handler });
      }
    },
    {
      logSerializers: {
        req: (request: FastifyRequest) => `${request.method} /v1/route-proxy/:routeKey/*`,
        err: (error: Error) => (error instanceof ServiceProxyError ? error.code : "Service transport failed")
      }
    }
  );
};
