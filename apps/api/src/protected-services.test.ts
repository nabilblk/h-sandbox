import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer, request as httpRequest, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import test, { type TestContext } from "node:test";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import WebSocket, { WebSocketServer } from "ws";
import { hashApiKey } from "./crypto.js";
import { config } from "./config.js";
import { registerProtectedServiceRoutes } from "./routes/protected-services.js";
import { protectedServiceLimits, type ServiceLimits } from "./services/protected-services/limits.js";
import { serviceUrl, serviceRequestHeaders } from "./services/protected-services/target.js";
import type { ServiceTarget } from "./services/protected-services/access.js";
import { boundedServiceQuery, withDeadline } from "./services/protected-services/session.js";

const target: ServiceTarget = {
  kind: "ok",
  targetUrl: "http://provider.test/runtime/proxy/8000/",
  headerName: "x-harakiri-route-token",
  provider: "test-provider",
  host: "provider.test",
  routeKey: "service"
};

test("authorization deadlines do not release admission for unfinished database work", async () => {
  let calls = 0;
  let complete = () => {};
  const work = new Promise<{ rows: never[] }>((resolve) => {
    complete = () => resolve({ rows: [] });
  });
  const query = boundedServiceQuery(async () => {
    calls++;
    return work;
  }, 1);
  const pending = query("SELECT");
  await assert.rejects(withDeadline(pending, 5), /route_proxy_authorization_unavailable/);
  await assert.rejects(query("SELECT"), /route_proxy_authorization_unavailable/);
  assert.equal(calls, 1);
  complete();
  await pending;
  await query("SELECT");
  assert.equal(calls, 2);
});

const fixture = async (t: TestContext, listener: RequestListener, options: Partial<ServiceLimits> = {}) => {
  const upstream = createServer(listener);
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  t.after(() => {
    upstream.closeAllConnections();
    upstream.close();
  });
  const upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  const state = { active: true, queries: 0, touches: 0, provider: "test-provider", targetUrl: upstreamUrl };
  const app = Fastify();
  const limits = { ...protectedServiceLimits(), authorizationIntervalMs: 20, authorizationTimeoutMs: 100, ...options };
  await app.register(websocket, { options: { maxPayload: limits.websocketMessageBytes, perMessageDeflate: false } });
  await registerProtectedServiceRoutes(app, {
    limits,
    query: async (sql) => {
      if (sql.startsWith("UPDATE")) {
        state.touches++;
        return { rows: [] };
      }
      state.queries++;
      assert.match(sql, /JOIN sandboxes/);
      assert.match(sql, /s\.status = 'running'/);
      assert.match(sql, /provider_expires_at > now\(\)/);
      return {
        rows: (state.active
          ? [
              {
                ...target,
                id: "route",
                targetUrl: state.targetUrl,
                provider: state.provider,
                state: "ready",
                accessMode: "token",
                accessTokenHash: hashApiKey("route-secret"),
                accessHeaderName: target.headerName
              }
            ]
          : []) as never[]
      };
    }
  });
  const origin = await app.listen({ host: "127.0.0.1", port: 0 });
  t.after(async () => {
    app.server.closeAllConnections();
    await app.close();
  });
  const url = `${origin}/v1/route-proxy/service`;
  const headers = { "x-harakiri-route-token": "route-secret" };
  return { app, state, url, headers, upstream, upstreamUrl };
};

test("service URLs stay in the provider prefix before and after decoding", () => {
  const resolved = serviceUrl(target, "/v1/route-proxy/service/files/view?path=a%2Fb&harakiri_route_token=secret");
  assert.equal(resolved.url.href, "http://provider.test/runtime/proxy/8000/files/view?path=a%2Fb");
  for (const path of [
    "../admin",
    "%2e%2e/admin",
    "//evil.test/x",
    "https://evil.test",
    "%2fadmin",
    "%252e%252e",
    "a\\b",
    "a/%",
    "a/%00b"
  ]) {
    assert.throws(() => serviceUrl(target, `/v1/route-proxy/service/${path}`), /route_proxy_invalid_path/, path);
  }
  assert.throws(
    () => serviceUrl({ ...target, targetUrl: "file:///tmp/a" }, "/v1/route-proxy/service"),
    /invalid_target/
  );
});

test("hop-by-hop, browser cookies and platform credentials do not cross the boundary", () => {
  const headers = serviceRequestHeaders(
    {
      host: "api.test",
      authorization: "Bearer application-secret",
      "x-api-key": "platform-secret",
      "x-harakiri-route-token": "route-secret",
      cookie: "session=secret",
      referer: "https://api.test/?token=secret",
      connection: "keep-alive, x-private",
      "x-private": "secret",
      "opensandbox-ingress-to": "forged",
      "x-forwarded-host": "evil.test",
      "x-user-id": "application-context"
    },
    target
  );
  assert.deepEqual(headers, { authorization: "Bearer application-secret", "x-user-id": "application-context" });
});

test("HTTP grant validation precedes forwarding; query token is not forwarded", async (t) => {
  let calls = 0;
  const f = await fixture(t, (req, res) => {
    calls++;
    assert.equal(req.url, "/hello?next=1");
    assert.equal(req.headers["x-harakiri-route-token"], undefined);
    res.writeHead(202, { "content-type": "text/plain" }).end("proxied");
  });
  assert.equal((await fetch(f.url)).status, 401);
  assert.equal(calls, 0);
  const response = await fetch(`${f.url}/hello?harakiri_route_token=route-secret&next=1`);
  assert.equal(response.status, 202);
  assert.equal(await response.text(), "proxied");
  assert.equal(f.state.touches, 1);
});

test("OpenSandbox gateway routing uses the configured gateway and overwrites spoofed headers", async (t) => {
  const f = await fixture(t, (req, res) => {
    assert.equal(req.url, "/health");
    assert.equal(req.headers["opensandbox-ingress-to"], "service");
    res.end("ok");
  });
  const previous = config.openSandboxGatewayUrl;
  config.openSandboxGatewayUrl = f.upstreamUrl;
  t.after(() => {
    config.openSandboxGatewayUrl = previous;
  });
  f.state.provider = "opensandbox-gateway";
  f.state.targetUrl = "https://must-not-be-contacted.invalid";
  const response = await fetch(`${f.url}/health`, { headers: { ...f.headers, "opensandbox-ingress-to": "forged" } });
  assert.equal(await response.text(), "ok");
});

test("streaming delivers the first chunk before the producer completes and cancellation closes upstream", async (t) => {
  let ended = false;
  let closed: () => void = () => {};
  const disconnected = new Promise<void>((resolve) => {
    closed = resolve;
  });
  const f = await fixture(t, (_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write("data: first\n\n");
    const timer = setTimeout(() => {
      ended = true;
      res.end("data: last\n\n");
    }, 500);
    res.on("close", () => {
      clearTimeout(timer);
      closed();
    });
  });
  const response = await fetch(f.url, { headers: f.headers });
  const reader = response.body!.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "data: first\n\n");
  assert.equal(ended, false);
  await reader.cancel();
  await Promise.race([
    disconnected,
    delay(1000).then(() => {
      throw new Error("upstream not cancelled");
    })
  ]);
});

test("48 MiB transfer keeps producer lead bounded with a slow reader and preserves every byte", { timeout: 15000 }, async (t) => {
  const chunk = Buffer.alloc(64 * 1024, 0x51);
  const count = 768;
  let produced = 0, consumed = 0, maximumLead = 0;
  const expected = createHash("sha256");
  for (let i = 0; i < count; i++) expected.update(chunk);
  const f = await fixture(t, (_req, res) => {
    res.writeHead(200, { "content-type": "application/octet-stream", "content-length": count * chunk.length });
    function* chunks() {
      for (let i = 0; i < count; i++) {
        produced += chunk.length;
        maximumLead = Math.max(maximumLead, produced - consumed);
        yield chunk;
      }
    }
    Readable.from(chunks()).pipe(res);
  });
  const response = await fetch(f.url, { headers: f.headers, signal: AbortSignal.timeout(12000) });
  const actual = createHash("sha256");
  for await (const bytes of response.body!) {
    actual.update(bytes);
    consumed += bytes.length;
    await delay(1);
  }
  assert.equal(consumed, count * chunk.length);
  assert.equal(actual.digest("hex"), expected.digest("hex"));
  assert.ok(maximumLead < 16 * 1024 * 1024, `Proxy read ${maximumLead} bytes ahead of its slow consumer`);
});

test("binary multipart bytes and application auth survive without parsing; Range headers survive", async (t) => {
  const payload = Buffer.concat([
    Buffer.from("--boundary\r\n"),
    Buffer.from([0, 128, 255]),
    Buffer.from("\r\n--boundary--\r\n")
  ]);
  const f = await fixture(t, async (req, res) => {
    assert.equal(req.headers.authorization, "Bearer app-key");
    assert.equal(req.headers["content-type"], "multipart/form-data; boundary=boundary");
    assert.equal(req.headers.range, "bytes=0-2");
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks), payload);
    res.writeHead(206, {
      "content-type": "application/octet-stream",
      "content-disposition": 'attachment; filename="file.bin"',
      "content-range": "bytes 0-2/3",
      "accept-ranges": "bytes",
      "set-cookie": "unsafe=true"
    });
    res.end(Buffer.from([0, 128, 255]));
  });
  const response = await fetch(f.url, {
    method: "POST",
    headers: {
      ...f.headers,
      authorization: "Bearer app-key",
      "content-type": "multipart/form-data; boundary=boundary",
      range: "bytes=0-2"
    },
    body: payload
  });
  assert.equal(response.status, 206);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from([0, 128, 255]));
  assert.equal(response.headers.get("content-range"), "bytes 0-2/3");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("content-security-policy"), "sandbox allow-scripts allow-forms allow-downloads");
});

test("redirects never follow or expose another destination", async (t) => {
  let calls = 0;
  const f = await fixture(t, (req, res) => {
    calls++;
    res.writeHead(302, { location: req.url === "/safe" ? "/next" : "https://untrusted.invalid/?secret=x" }).end();
  });
  const safe = await fetch(`${f.url}/safe`, { headers: f.headers, redirect: "manual" });
  assert.equal(safe.status, 302);
  assert.equal(safe.headers.get("location"), "/v1/route-proxy/service/next");
  const unsafe = await fetch(`${f.url}/unsafe`, { headers: f.headers });
  assert.equal(unsafe.status, 502);
  assert.deepEqual(await unsafe.json(), { error: "route_proxy_redirect_rejected" });
  assert.equal(calls, 2);
});

test("request and response size bounds fail before streaming when sizes are known", async (t) => {
  const f = await fixture(
    t,
    (_req, res) => {
      res.writeHead(200, { "content-length": "100" }).end("x".repeat(100));
    },
    { requestBytes: 8, responseBytes: 8 }
  );
  const upload = await fetch(f.url, { method: "POST", headers: f.headers, body: "x".repeat(9) });
  assert.equal(upload.status, 413);
  assert.deepEqual(await upload.json(), { error: "route_proxy_request_too_large" });
  const download = await fetch(f.url, { headers: f.headers });
  assert.equal(download.status, 502);
  assert.deepEqual(await download.json(), { error: "route_proxy_response_too_large" });
});

test("chunked uploads cannot bypass the byte limit", async (t) => {
  const f = await fixture(
    t,
    (req, res) => {
      req.on("data", () => {});
      req.on("end", () => res.end("ok"));
    },
    { requestBytes: 8 }
  );
  const request = httpRequest(f.url, {
    method: "POST",
    headers: { ...f.headers, "content-type": "application/octet-stream" }
  });
  const response = once(request, "response");
  request.write("12345");
  request.end("67890");
  const [incoming] = await response;
  assert.equal(incoming.statusCode, 413);
  incoming.resume();
});

test("unknown-length response overflow is a broken transfer, not a successful truncated body", async (t) => {
  const f = await fixture(
    t,
    (_req, res) => {
      res.write("12345");
      setTimeout(() => res.end("67890"), 30);
    },
    { responseBytes: 8 }
  );
  const response = await fetch(f.url, { headers: f.headers });
  await assert.rejects(response.text());
});

test("upstream first-byte and idle deadlines are finite", async (t) => {
  const f = await fixture(
    t,
    (req, res) => {
      if (req.url === "/stream") res.write("first");
    },
    { connectTimeoutMs: 30, idleTimeoutMs: 50 }
  );
  const neverReady = await fetch(f.url, { headers: f.headers });
  assert.equal(neverReady.status, 504);
  assert.deepEqual(await neverReady.json(), { error: "route_proxy_connect_timeout" });
  const stream = await fetch(`${f.url}/stream`, { headers: f.headers });
  await assert.rejects(stream.text());
});

test("revocation closes an established HTTP response and releases admission", async (t) => {
  const f = await fixture(
    t,
    (_req, res) => {
      res.write("first");
    },
    { connectionsPerRoute: 1 }
  );
  const response = await fetch(f.url, { headers: f.headers });
  const reader = response.body!.getReader();
  await reader.read();
  assert.equal((await fetch(f.url, { headers: f.headers })).status, 429);
  f.state.active = false;
  await assert.rejects(reader.read());
  await delay(30);
  assert.equal((await fetch(f.url, { headers: f.headers })).status, 404);
});

test("WebSocket frames preserve text/binary and revoked access disconnects both peers", async (t) => {
  const f = await fixture(t, (_req, res) => {
    res.end("http");
  });
  const wss = new WebSocketServer({ server: f.upstream, verifyClient: (_info, done) => { setTimeout(() => done(true), 30); } });
  t.after(() => {
    for (const ws of wss.clients) ws.terminate();
    wss.close();
  });
  wss.on("connection", (socket, request) => {
    assert.equal(request.headers["x-harakiri-route-token"], undefined);
    socket.on("message", (data, binary) => socket.send(data, { binary }));
  });
  const client = new WebSocket(f.url.replace("http:", "ws:"), { headers: f.headers });
  t.after(() => client.terminate());
  await once(client, "open");
  // Upgrade completion and upstream completion are intentionally separate; first-frame auth must not be lost.
  const values = [JSON.stringify({ type: "auth", token: "app-secret" }), JSON.stringify({ type: "resize", cols: 80, rows: 24 }), Buffer.from([0, 128, 255])];
  const frames: { data: Buffer; binary: boolean }[] = [];
  const replies = new Promise<void>((resolve) => client.on("message", (data, binary) => {
    frames.push({ data: Buffer.from(data as Buffer), binary });
    if (frames.length === values.length) resolve();
  }));
  for (const value of values) client.send(value);
  await replies;
  assert.deepEqual(frames, values.map(value => ({ data: Buffer.isBuffer(value) ? value : Buffer.from(value), binary: Buffer.isBuffer(value) })));
  const closed = once(client, "close");
  f.state.active = false;
  assert.equal((await closed)[0], 1008);
});

test("unauthorized WebSocket upgrades do not reach the application", async (t) => {
  const f = await fixture(t, (_req, res) => res.end());
  let upgraded = false;
  f.upstream.on("upgrade", () => {
    upgraded = true;
  });
  const client = new WebSocket(f.url.replace("http:", "ws:"));
  t.after(() => client.terminate());
  await assert.rejects(once(client, "open"), /401/);
  assert.equal(upgraded, false);
});

test("unsupported WebSocket subprotocols fail before contacting the provider", async (t) => {
  const f = await fixture(t, (_req, res) => res.end());
  let upgraded = false;
  f.upstream.on("upgrade", () => { upgraded = true; });
  const client = new WebSocket(f.url.replace("http:", "ws:"), ["unqualified-protocol"], { headers: f.headers });
  t.after(() => client.terminate());
  await assert.rejects(once(client, "open"), /501/);
  assert.equal(upgraded, false);
});

test("oversized WebSocket messages close the connection and release admission", async (t) => {
  const f = await fixture(t, (_req, res) => res.end("available"), { websocketMessageBytes: 64, connectionsPerRoute: 1 });
  const wss = new WebSocketServer({ server: f.upstream });
  t.after(() => {
    for (const socket of wss.clients) socket.terminate();
    wss.close();
  });
  const upstreamReady = once(wss, "connection");
  const client = new WebSocket(f.url.replace("http:", "ws:"), { headers: f.headers });
  t.after(() => client.terminate());
  await once(client, "open");
  const [upstream] = await upstreamReady;
  let delivered = false;
  upstream.on("message", () => { delivered = true; });
  const closed = once(client, "close");
  client.send(Buffer.alloc(65));
  assert.equal((await closed)[0], 1009);
  assert.equal(delivered, false);
  const response = await fetch(f.url, { headers: f.headers });
  assert.equal(response.status, 200);
  await response.text();
});

test("database grant errors are not exposed to callers", async () => {
  const app = Fastify();
  await app.register(websocket);
  await registerProtectedServiceRoutes(app, {
    query: async () => {
      throw new Error("postgres://private:password@host/db");
    }
  });
  const response = await app.inject({
    url: "/v1/route-proxy/service",
    headers: { "x-harakiri-route-token": "secret" }
  });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { error: "route_proxy_authorization_unavailable" });
  await app.close();
});
