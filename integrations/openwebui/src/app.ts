import { Readable } from "node:stream";
import Fastify, { type FastifyRequest } from "fastify";
import websocket from "@fastify/websocket";
import { HarakiriApiError } from "@h-sandbox/sdk";
import { AdapterError, type AdapterConfig } from "./config.js";
import { authenticated, identityFor, servicePath } from "./identity.js";
import { publicError, type SessionManager, type SessionUse } from "./sessions.js";
import { attachTerminal } from "./terminal.js";

const sessionUse = (method: string, path: string): SessionUse => {
  if (method === "OPTIONS") return "observe";
  const pathname = decodeURIComponent(path.split("?", 1)[0]);
  const readOnly = ["GET", "HEAD", "OPTIONS"].includes(method);
  const opensWorkspace = /^\/(?:files|skills|proxy)(?:\/|$)/.test(pathname);
  const startsProcess = method === "POST" && /^\/(?:execute|api\/terminals)\/?$/.test(pathname);
  if (opensWorkspace || startsProcess) return readOnly ? "open" : "mutate";
  return readOnly ? "observe" : "interact";
};

export const buildAdapter = async (config: AdapterConfig, sessions: SessionManager, openapi: unknown) => {
  const app = Fastify({
    bodyLimit: config.ADAPTER_MAX_REQUEST_BYTES,
    logger: {
      serializers: {
        req: (req: FastifyRequest) => ({ method: req.method, route: "openwebui-adapter" }),
        err: (error: unknown) => ({ type: "AdapterError", message: publicError(error).code, stack: "" })
      }
    }
  });
  await app.register(websocket, { options: { maxPayload: 1024 * 1024, perMessageDeflate: false } });
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_request, body, done) => done(null, body));
  let active = 0;
  const ongoing = new Set<AbortController>();
  app.addHook("preClose", async () => {
    for (const controller of ongoing) controller.abort();
  });
  app.addHook("onRequest", async (request, reply) => {
    if (request.url === "/health") return;
    if (active >= config.ADAPTER_MAX_CONNECTIONS) return reply.code(429).send({ error: "adapter_connection_limit" });
    active++;
    let released = false;
    const socket = request.raw.socket;
    const release = () => {
      if (!released) {
        released = true;
        active--;
        socket.off("close", release);
      }
    };
    // The Fastify synthetic upgrade response closes with its socket.
    reply.raw.once("close", release);
    socket.once("close", release);
    if (!request.ws && !authenticated(request.headers.authorization, `Bearer ${config.OPENWEBUI_ADAPTER_KEY}`)) {
      return reply.code(401).send({ error: "adapter_authentication_required" });
    }
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof Error && "statusCode" in error && error.statusCode === 413)
      return reply.code(413).send({ error: "adapter_request_too_large" });
    const failure = publicError(error);
    request.log.warn({ failure: failure.code,
      ...(error instanceof HarakiriApiError ? { upstreamStatus: error.status } : {})
    }, "Sandbox service request failed");
    if (failure.status === 503 || failure.status === 429) reply.header("retry-after", "3");
    return reply.code(failure.status).send({ error: failure.code });
  });
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/api/config", async () => ({ features: { terminal: true, notebooks: false, system: false } }));
  app.get("/openapi.json", async () => openapi);
  app.get("/api/v1/policies", async (_request, reply) => reply.code(404).send({ error: "not_an_orchestrator" }));

  const forward = async (request: FastifyRequest, reply: import("fastify").FastifyReply) => {
    const path = servicePath(request.raw.url ?? request.url);
    const identity = identityFor(config.ADAPTER_INSTANCE_ID, request.headers);
    const controller = new AbortController();
    ongoing.add(controller);
    reply.raw.once("close", () => {
      ongoing.delete(controller);
      controller.abort();
    });
    const session = await sessions.resolve(
      identity,
      sessionUse(request.method, path),
      controller.signal
    );
    controller.signal.throwIfAborted();
    const headers = new Headers();
    for (const name of ["content-type", "range", "if-range", "if-none-match", "if-modified-since"]) {
      const value = request.headers[name];
      if (typeof value === "string") headers.set(name, value);
    }
    const body = Buffer.isBuffer(request.body) ? new Uint8Array(request.body).buffer : undefined;
    const response = await session.fetch(path, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(240000)])
    });
    if (response.status >= 300 && response.status < 400 && response.status !== 304) {
      await response.body?.cancel();
      throw new AdapterError(502, "application_redirect_not_supported");
    }
    for (const name of [
      "content-type",
      "content-disposition",
      "content-range",
      "accept-ranges",
      "etag",
      "last-modified"
    ]) {
      const value = response.headers.get(name);
      if (value) reply.header(name, value);
    }
    reply.header("content-security-policy", "sandbox allow-scripts allow-forms allow-downloads");
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    reply.header("cache-control", "private, no-store");
    reply.code(response.status);
    return reply.send(response.body ? Readable.from(response.body) : null);
  };
  app.route({
    method: "GET",
    url: "/*",
    handler: forward,
    wsHandler: (socket, request) => {
      if (!/^\/api\/terminals\/[a-zA-Z0-9_-]{1,100}(?:\?|$)/.test(request.url)) {
        socket.close(1008, "Invalid terminal path");
        return;
      }
      attachTerminal(socket, request, sessions, config);
    }
  });
  app.route({ method: ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"], url: "/*", handler: forward });
  return app;
};
