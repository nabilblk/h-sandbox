import type { FastifyRequest } from "fastify";
import WebSocket, { type RawData } from "ws";
import type { ServiceTarget } from "./access.js";
import type { ServiceLimits } from "./limits.js";
import { serviceRequestHeaders, serviceUrl } from "./target.js";

/** Application frames are opaque. Harakiri authenticates the upgrade, not a service's first frame. */
export const proxyServiceWebSocket = (
  client: WebSocket,
  request: FastifyRequest,
  target: ServiceTarget,
  signal: AbortSignal,
  limits: ServiceLimits
) => {
  const { url } = serviceUrl(target, request.raw.url ?? request.url);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const upstream = new WebSocket(url, {
    headers: serviceRequestHeaders(request.headers, target),
    followRedirects: false,
    handshakeTimeout: limits.connectTimeoutMs,
    maxPayload: limits.websocketMessageBytes,
    perMessageDeflate: false
  });
  let stopped = false;
  let idle: ReturnType<typeof setTimeout>;
  const stop = (code: number, reason: string) => {
    if (stopped) return;
    stopped = true;
    clearTimeout(idle);
    signal.removeEventListener("abort", revoked);
    // Bound the close handshake too: an unresponsive peer must not retain a lease.
    for (const socket of [client, upstream]) {
      if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
      else if (socket.readyState === WebSocket.OPEN) socket.close(code, reason);
    }
    const deadline = setTimeout(() => {
      client.terminate();
      upstream.terminate();
    }, 1000);
    deadline.unref();
  };
  const activity = () => {
    clearTimeout(idle);
    idle = setTimeout(() => stop(1008, "Service connection idle timeout"), limits.idleTimeoutMs);
    idle.unref();
  };
  const revoked = () => stop(1008, "Service access ended");
  const forward = (source: WebSocket, destination: WebSocket) => (data: RawData, binary: boolean) => {
    if (stopped) return;
    if (destination.readyState !== WebSocket.OPEN || destination.bufferedAmount > limits.websocketMessageBytes) {
      stop(1013, "Service consumer unavailable");
      return;
    }
    source.pause();
    activity();
    destination.send(data, { binary }, (error) => {
      if (error) stop(1011, "Service connection failed");
      else if (!stopped) source.resume();
    });
  };
  // Install listeners synchronously and pause reads until the upstream handshake completes.
  client.pause();
  client.on("message", forward(client, upstream));
  upstream.on("message", forward(upstream, client));
  upstream.once("open", () => {
    if (!stopped) client.resume();
  });
  for (const socket of [client, upstream]) {
    socket.once("close", (code) => stop(code === 1000 ? 1000 : 1011, "Service connection closed"));
    socket.on("error", () => stop(1011, "Service connection failed"));
  }
  signal.addEventListener("abort", revoked, { once: true });
  activity();
  if (signal.aborted) revoked();
};
