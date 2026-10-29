import type { FastifyRequest } from "fastify";
import WebSocket, { type RawData } from "ws";
import type { AdapterConfig } from "./config.js";
import { authenticated, identityFor } from "./identity.js";
import type { SessionManager } from "./sessions.js";

export const attachTerminal = (
  client: WebSocket,
  request: FastifyRequest,
  sessions: SessionManager,
  config: AdapterConfig
) => {
  let upstream: WebSocket | undefined;
  const controller = new AbortController();
  let stopped = false;
  let touchPending = false;
  let touchedAt = 0;
  let lifetime: ReturnType<typeof setTimeout> | undefined;
  let idle: ReturnType<typeof setTimeout> | undefined;
  const stop = (code = 1011, reason = "Terminal connection ended") => {
    if (stopped) return;
    stopped = true;
    controller.abort();
    clearTimeout(authDeadline);
    clearTimeout(lifetime);
    clearTimeout(idle);
    for (const socket of [client, upstream]) {
      if (!socket) continue;
      if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
      else if (socket.readyState === WebSocket.OPEN) socket.close(code, reason);
    }
    const deadline = setTimeout(() => {
      client.terminate();
      upstream?.terminate();
    }, 1000);
    deadline.unref();
  };
  const activity = () => {
    clearTimeout(idle);
    idle = setTimeout(() => stop(1008, "Terminal idle timeout"), 60000);
    idle.unref();
  };
  const authDeadline = setTimeout(() => stop(1008, "Authentication required"), 10000);
  const forward = (source: WebSocket, destination: WebSocket) => (bytes: RawData, binary: boolean) => {
    if (stopped) return;
    if (destination.readyState !== WebSocket.OPEN || destination.bufferedAmount > 1024 * 1024) {
      stop(1013);
      return;
    }
    source.pause();
    activity();
    destination.send(bytes, { binary }, (error) => {
      if (error) stop();
      else if (!stopped) source.resume();
    });
  };
  client.on("error", () => stop());
  client.once("close", () => stop(1000));
  client.once("message", async (data, binary) => {
    client.pause();
    const earlyFrame = () => stop(1013, "Wait for terminal connection");
    client.on("message", earlyFrame);
    try {
      const size = Array.isArray(data) ? data.reduce((sum, part) => sum + part.length, 0) : data.byteLength;
      if (binary || size > 4096) {
        stop(1008, "Authentication required");
        return;
      }
      const value: unknown = JSON.parse(data.toString());
      if (
        !value ||
        typeof value !== "object" ||
        !("type" in value) ||
        value.type !== "auth" ||
        !("token" in value) ||
        !authenticated(value.token, config.OPENWEBUI_ADAPTER_KEY)
      ) {
        stop(1008, "Authentication required");
        return;
      }
      clearTimeout(authDeadline);
      const identity = identityFor(config.ADAPTER_INSTANCE_ID, request.headers);
      const session = await sessions.resolve(identity, false, controller.signal);
      if (stopped) return;
      lifetime = setTimeout(() => stop(1008, "Session expired"), Math.max(0, session.expiresAt - Date.now()));
      lifetime.unref();
      const path = new URL(request.url, "http://adapter.invalid");
      path.search = "";
      path.searchParams.set("user_id", identity.userId);
      const connection = session.webSocketRequest(path.pathname + path.search);
      upstream = new WebSocket(connection.url, {
        headers: connection.headers,
        maxPayload: 1024 * 1024,
        perMessageDeflate: false,
        followRedirects: false,
        handshakeTimeout: 10000
      });
      const remote = upstream;
      client.on("message", (bytes, isBinary) => {
        // Renewal follows actual input, never output polling or a health probe.
        if (!touchPending && Date.now() - touchedAt >= 30000) {
          touchPending = true;
          touchedAt = Date.now();
          void sessions
            .touch(identity, session.sandboxId, controller.signal)
            .catch(() => stop(1008, "Session access ended"))
            .finally(() => {
              touchPending = false;
            });
        }
        forward(client, remote)(bytes, isBinary);
      });
      remote.on("message", forward(remote, client));
      remote.once("open", () => {
        if (stopped) {
          remote.terminate();
          return;
        }
        remote.send(JSON.stringify({ type: "auth", token: session.serviceKey }), (error) => {
          if (error) stop();
          else if (!stopped) {
            client.off("message", earlyFrame);
            client.resume();
          }
        });
      });
      remote.once("close", (code) => stop(code === 1000 ? 1000 : 1011, "Upstream terminal closed"));
      remote.on("error", () => stop());
      activity();
    } catch {
      stop(1008, "Terminal unavailable");
    }
  });
};
