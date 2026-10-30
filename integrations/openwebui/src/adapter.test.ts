import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import WebSocket, { WebSocketServer } from "ws";
import { buildAdapter } from "./app.js";
import { BindingCipher, newBinding } from "./bindings.js";
import { AdapterError, readConfig } from "./config.js";
import { authenticated, identityFor, servicePath } from "./identity.js";
import type { SessionManager } from "./sessions.js";

const config = readConfig({
  HARAKIRI_API_URL: "https://control.test",
  HARAKIRI_API_KEY: "control-key",
  HARAKIRI_TEMPLATE: "open-terminal",
  ADAPTER_INSTANCE_ID: "unit",
  ADAPTER_DATABASE_URL: "postgres://fixture",
  ADAPTER_ENCRYPTION_KEY: "a".repeat(64),
  OPENWEBUI_ADAPTER_KEY: "application-server-secret-32-characters"
});
const authorization = `Bearer ${config.OPENWEBUI_ADAPTER_KEY}`;

test("bindings are authenticated encrypted records bound to one identity", () => {
  const cipher = new BindingCipher(Buffer.alloc(32, 7));
  const record = newBinding();
  const encrypted = cipher.encrypt("one", record);
  assert.equal(encrypted.includes(Buffer.from(record.serviceKey)), false);
  assert.deepEqual(cipher.decrypt("one", encrypted), record);
  assert.throws(() => cipher.decrypt("two", encrypted), /decryption_failed/);
  encrypted[30] ^= 1;
  assert.throws(() => cipher.decrypt("one", encrypted), /decryption_failed/);
  assert.equal(JSON.stringify(cipher), "{}");
});

test("trusted users have distinct personal bindings; chat IDs do not create duplicate environments", () => {
  const one = identityFor("instance", { "x-user-id": "one", "x-session-id": "chat-1" });
  assert.equal(one.bindingKey, identityFor("instance", { "x-user-id": "one", "x-session-id": "chat-2" }).bindingKey);
  assert.notEqual(one.bindingKey, identityFor("instance", { "x-user-id": "two" }).bindingKey);
  assert.notEqual(one.bindingKey, identityFor("other-instance", { "x-user-id": "one" }).bindingKey);
  // Native OpenWebUI sends an empty session header outside a saved chat.
  assert.equal(identityFor("instance", { "x-user-id": "one", "x-session-id": "" }).sessionId, "");
  assert.throws(() => identityFor("instance", { "x-user-id": "" }), /invalid_context/);
  assert.throws(
    () => identityFor("instance", { "x-user-id": "one", "x-terminal-context-id": "forged" }),
    /personal_context_only/
  );
  assert.throws(() => identityFor("instance", { "x-user-id": "../other" }), /invalid_context/);
  assert.equal(authenticated({}, "secret"), false);
});

test("the generated discovery operations all pass the explicit protocol allowlist", () => {
  const schema = JSON.parse(readFileSync(new URL("../open-terminal.openapi.json", import.meta.url), "utf8"));
  for (const path of Object.keys(schema.paths)) assert.equal(servicePath(path), path);
  for (const path of ["/api/v1/policies", "/files/%2e%2e/admin", "//evil.test", "/files/x%2fy", "/files/%252e"]) {
    assert.throws(() => servicePath(path));
  }
});

test("discovery, invalid credentials and invalid identity never provision resources", async () => {
  let calls = 0;
  const sessions: SessionManager = {
    resolve: async () => {
      calls++;
      throw new Error("Must not allocate");
    },
    touch: async () => {}
  };
  const app = await buildAdapter(config, sessions, { openapi: "3.1.0" });
  try {
    for (const url of ["/api/config", "/openapi.json", "/api/v1/policies"]) {
      const result = await app.inject({ url, headers: { authorization } });
      assert.equal(result.statusCode, url.endsWith("policies") ? 404 : 200);
    }
    assert.equal((await app.inject({ url: "/files/list", headers: { "x-user-id": "forged" } })).statusCode, 401);
    assert.equal((await app.inject({ url: "/files/list", headers: { authorization } })).statusCode, 400);
    assert.equal(calls, 0);
  } finally {
    await app.close();
  }
});

test("HTTP forwarding never replays a failed execution and does not send the adapter credential", async () => {
  let executions = 0;
  const sessions: SessionManager = {
    resolve: async (identity, use) => {
      assert.equal(identity.userId, "user-one");
      assert.equal(use, "mutate");
      return {
        sandboxId: "sandbox",
        expiresAt: Date.now() + 60000,
        serviceKey: "per-instance",
        fetch: async (_path, init) => {
          executions++;
          assert.equal(new Headers(init?.headers).get("authorization"), null);
          throw new Error("Response lost after execution");
        },
        webSocketRequest: () => {
          throw new Error("Not used");
        }
      };
    },
    touch: async () => {}
  };
  const app = await buildAdapter(config, sessions, {});
  try {
    const result = await app.inject({
      method: "POST",
      url: "/execute",
      headers: { authorization, "x-user-id": "user-one", "content-type": "application/json" },
      payload: { command: "printf hello" }
    });
    assert.equal(result.statusCode, 503);
    assert.deepEqual(result.json(), { error: "sandbox_service_unavailable" });
    assert.equal(executions, 1);
  } finally {
    await app.close();
  }
});

test("passive polling and stale process actions cannot provision a replacement", async () => {
  let use: string | undefined;
  const sessions: SessionManager = {
    resolve: async (_identity, next) => {
      use = next;
      throw new AdapterError(409, "sandbox_session_inactive");
    },
    touch: async () => {}
  };
  const app = await buildAdapter(config, sessions, {});
  try {
    const requests = [
      ["GET", "/execute", "observe"],
      ["GET", "/execute/old/status?wait=0", "observe"],
      ["GET", "/ports", "observe"],
      ["GET", "/system", "observe"],
      ["GET", "/api/terminals/user/output", "observe"],
      ["POST", "/execute/old/input", "interact"],
      ["DELETE", "/execute/old", "interact"],
      ["DELETE", "/api/terminals/old", "interact"],
      ["GET", "/files/list?directory=/workspace", "open"],
      ["POST", "/files/cwd", "open"],
      ["OPTIONS", "/files/list", "observe"],
      ["POST", "/execute", "mutate"],
      ["POST", "/api/terminals", "mutate"]
    ] as const;
    for (const [method, url, expected] of requests) {
      const response = await app.inject({ method, url, headers: { authorization, "x-user-id": "one" } });
      assert.equal(response.statusCode, 409);
      assert.equal(use, expected, `${method} ${url}`);
    }
  } finally { await app.close(); }
});

test("OpenWebUI first-message authentication translates to a per-instance key before PTY frames", async (t) => {
  const server = createServer();
  const wss = new WebSocketServer({ server });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    for (const peer of wss.clients) peer.terminate();
    wss.close();
    server.close();
  });
  let sessionsResolved = 0;
  let renewals = 0;
  let auth: unknown;
  const frames: { text: string; binary: boolean }[] = [];
  let authenticatedUpstream: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    authenticatedUpstream = resolve;
  });
  let controlsReceived: () => void = () => {};
  const controls = new Promise<void>((resolve) => { controlsReceived = resolve; });
  wss.on("connection", (socket, req) => {
    assert.equal(req.url, "/api/terminals/id?user_id=one");
    socket.once("message", (data) => {
      auth = JSON.parse(data.toString());
      authenticatedUpstream();
    });
    socket.on("message", (data, binary) => {
      frames.push({ text: data.toString(), binary });
      if (data.toString() === '{"type":"ping"}') controlsReceived();
      if (binary) socket.send(data, { binary });
    });
  });
  const sessions: SessionManager = {
    resolve: async (_identity, use) => {
      assert.equal(use, "observe", "attaching an existing PTY must not create a runtime");
      sessionsResolved++;
      await new Promise((resolve) => setTimeout(resolve, 40));
      return {
        sandboxId: "sbx",
        expiresAt: Date.now() + 60000,
        serviceKey: "instance-key",
        fetch: (path = "/", init) => fetch(path, init),
        webSocketRequest: (path) => ({
          url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}${path}`,
          headers: { "x-harakiri-route-token": "route-grant" }
        })
      };
    },
    touch: async () => { renewals++; }
  };
  const app = await buildAdapter(config, sessions, {});
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  t.after(async () => {
    await app.close();
  });
  const url = address.replace("http:", "ws:") + "/api/terminals/id?user_id=forged";
  const bad = new WebSocket(url, { headers: { "x-user-id": "one" } });
  await once(bad, "open");
  const denied = once(bad, "close");
  bad.send(JSON.stringify({ type: "auth", token: "wrong" }));
  assert.equal((await denied)[0], 1008);
  assert.equal(sessionsResolved, 0);
  const good = new WebSocket(url, { headers: { "x-user-id": "one" } });
  t.after(() => good.terminate());
  await once(good, "open");
  good.send(JSON.stringify({ type: "auth", token: config.OPENWEBUI_ADAPTER_KEY }));
  good.send(JSON.stringify({ type: "resize", cols: 80, rows: 24 }));
  good.send(JSON.stringify({ type: "ping" }));
  await ready;
  await controls;
  assert.equal(renewals, 0, "keepalive and resize must not extend sandbox TTL");
  assert.deepEqual(auth, { type: "auth", token: "instance-key" });
  assert.deepEqual(frames.slice(0, 3), [
    { text: JSON.stringify({ type: "auth", token: "instance-key" }), binary: false },
    { text: JSON.stringify({ type: "resize", cols: 80, rows: 24 }), binary: false },
    { text: JSON.stringify({ type: "ping" }), binary: false }
  ]);
  const echoed = once(good, "message");
  good.send(Buffer.from("printf hello\r"));
  const [data, binary] = await echoed;
  assert.equal(binary, true);
  assert.equal(data.toString(), "printf hello\r");
  assert.equal(renewals, 1, "only binary shell input requests renewal");
  good.close();
  await once(good, "close");
});
