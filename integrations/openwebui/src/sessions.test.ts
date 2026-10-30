import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { HarakiriClient } from "@h-sandbox/sdk";
import { newBinding, type Binding, type BindingStore, type SaveBinding } from "./bindings.js";
import { readConfig } from "./config.js";
import { identityFor } from "./identity.js";
import { Sessions } from "./sessions.js";

const testConfig = () =>
  readConfig({
    HARAKIRI_API_URL: "https://control.test",
    HARAKIRI_API_KEY: "key",
    HARAKIRI_TEMPLATE: "template",
    ADAPTER_DATABASE_URL: "postgres://fixture",
    ADAPTER_INSTANCE_ID: "test",
    ADAPTER_ENCRYPTION_KEY: "a".repeat(64),
    OPENWEBUI_ADAPTER_KEY: "x".repeat(32)
  });

class TestBindings implements BindingStore {
  values = new Map<string, Binding>();
  private pending: Promise<unknown> = Promise.resolve();
  withBinding<T>(key: string, action: (value: Binding, save: SaveBinding) => Promise<T>): Promise<T> {
    const work = this.pending.then(async () => {
      const value = structuredClone(this.values.get(key) ?? newBinding());
      return action(value, async (next) => {
        this.values.set(key, structuredClone(next));
      });
    });
    this.pending = work.catch(() => {});
    return work;
  }
}

test("concurrent first access and adapter restart reuse one durable workspace, sandbox and grant", async (t) => {
  let healthStatus = 200;
  let healthRequests = 0;
  const server = createServer((req, res) => {
    assert.equal(req.headers["x-harakiri-route-token"], "grant");
    healthRequests++;
    res.statusCode = healthStatus;
    res.end("healthy");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const createdAt = new Date().toISOString();
  const creates = { workspaces: 0, sandboxes: 0, routes: 0, renewals: 0 };
  const client = new HarakiriClient({
    apiUrl: "https://control.test",
    apiKey: "platform-key",
    fetch: async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/v1/workspaces") {
        creates.workspaces++;
        assert.ok(JSON.parse(String(init?.body)).name.length <= 80);
        return Response.json({ workspace: { id: "ws_one" } });
      }
      if (path === "/v1/sandboxes" && init?.method === "POST") {
        creates.sandboxes++;
        assert.equal(JSON.parse(String(init.body)).workspaceId, "ws_one");
        return Response.json({ sandbox: { id: "sbx_one", status: "pending", createdAt } }, { status: 202 });
      }
      if (path === "/v1/sandboxes/sbx_one/routes") {
        creates.routes++;
        return Response.json({
          route: { url: origin, routeKey: "route-one" },
          accessToken: "grant",
          accessHeaderName: "x-harakiri-route-token"
        });
      }
      if (path === "/v1/sandboxes/sbx_one/renew") {
        creates.renewals++;
        return Response.json({ sandbox: { id: "sbx_one" } });
      }
      if (path === "/v1/sandboxes/sbx_one" || path.endsWith("/readiness"))
        return Response.json({ sandbox: { id: "sbx_one", status: "running" }, readiness: { status: "ready" } });
      throw new Error(`Unexpected API path ${path}`);
    }
  });
  const config = readConfig({
    HARAKIRI_API_URL: "https://control.test",
    HARAKIRI_API_KEY: "key",
    HARAKIRI_TEMPLATE: "template",
    ADAPTER_DATABASE_URL: "postgres://fixture",
    ADAPTER_INSTANCE_ID: "instance".repeat(8),
    ADAPTER_ENCRYPTION_KEY: "a".repeat(64),
    OPENWEBUI_ADAPTER_KEY: "x".repeat(32)
  });
  const store = new TestBindings();
  const identity = identityFor(config.ADAPTER_INSTANCE_ID, { "x-user-id": "one" });
  store.values.set(identity.bindingKey, { ...newBinding(), createdAt: 0 });
  const sessions = new Sessions(client, store, config);
  const results = await Promise.all(Array.from({ length: 6 }, () => sessions.resolve(identity, "open")));
  assert.equal(new Set(results.map((session) => session.sandboxId)).size, 1);
  assert.deepEqual(creates, { workspaces: 1, sandboxes: 1, routes: 1, renewals: 0 });
  assert.equal(store.values.get(identity.bindingKey)?.createdAt, Date.parse(createdAt));
  const restarted = new Sessions(client, store, config);
  assert.equal((await restarted.resolve(identity, "open")).sandboxId, "sbx_one");
  assert.equal(creates.sandboxes, 1);
  // Polling is not activity. Only an explicit action can renew the lease.
  store.values.get(identity.bindingKey)!.renewedAt = 0;
  await restarted.resolve(identity, "observe");
  assert.equal(creates.renewals, 0);
  await restarted.resolve(identity, "interact");
  assert.equal(creates.renewals, 1);
  const binding = structuredClone(store.values.get(identity.bindingKey));
  for (const status of [401, 403, 404, 410, 503]) {
    healthStatus = status;
    const requestsBefore = healthRequests;
    await assert.rejects(restarted.resolve(identity, "open", AbortSignal.timeout(2000)),
      status === 503 ? /sandbox_service_unavailable/ : /service_grant_unavailable/);
    assert.equal(healthRequests, requestsBefore + 1, "Existing grants must fail without a readiness retry loop");
    assert.deepEqual(store.values.get(identity.bindingKey), binding);
  }
  assert.deepEqual(creates, { workspaces: 1, sandboxes: 1, routes: 1, renewals: 1 });
});

test("an unconfirmed route creation does not retry or replace a grant", async () => {
  const binding = { ...newBinding("ws_one"), sandboxId: "sbx_one", routeIntent: true };
  let mutations = 0;
  const client = new HarakiriClient({
    apiUrl: "https://control.test",
    apiKey: "key",
    fetch: async (_url, init) => {
      if (init?.method && init.method !== "GET") mutations++;
      return Response.json({ sandbox: { id: "sbx_one", status: "running" }, readiness: { status: "ready" } });
    }
  });
  const store = new TestBindings();
  const identity = identityFor("test", { "x-user-id": "one" });
  store.values.set(identity.bindingKey, binding);
  const config = readConfig({
    HARAKIRI_API_URL: "https://control.test",
    HARAKIRI_API_KEY: "key",
    HARAKIRI_TEMPLATE: "template",
    ADAPTER_DATABASE_URL: "postgres://fixture",
    ADAPTER_INSTANCE_ID: "test",
    ADAPTER_ENCRYPTION_KEY: "a".repeat(64),
    OPENWEBUI_ADAPTER_KEY: "x".repeat(32)
  });
  await assert.rejects(new Sessions(client, store, config).resolve(identity, "mutate"), /route_creation_unconfirmed/);
  assert.equal(mutations, 0);
});

test("observation and stale process input never create a workspace or replace a terminated runtime", async () => {
  const store = new TestBindings();
  const identity = identityFor("test", { "x-user-id": "one" });
  const requests: string[] = [];
  const client = new HarakiriClient({
    apiUrl: "https://control.test", apiKey: "key",
    fetch: async (url, init) => {
      const path = new URL(String(url)).pathname;
      requests.push(`${init?.method ?? "GET"} ${path}`);
      if (path === "/v1/sandboxes/sbx_old")
        return Response.json({ sandbox: { id: "sbx_old", status: "terminated" } });
      if (path === "/v1/workspaces/ws_one")
        return Response.json({ workspace: { status: "available", attachedSandboxId: null } });
      if (path === "/v1/sandboxes" && init?.method === "POST") {
        assert.equal(JSON.parse(String(init.body)).workspaceId, "ws_one");
        return Response.json({ error: "organization_capacity_exceeded" }, { status: 409 });
      }
      throw new Error(`Unexpected request ${path}`);
    }
  });
  const sessions = new Sessions(client, store, testConfig());
  for (const use of ["observe", "interact"] as const)
    await assert.rejects(sessions.resolve(identity, use), /sandbox_session_inactive/);
  assert.deepEqual(requests, []);
  assert.equal(store.values.size, 0);

  const binding = { ...newBinding("ws_one"), sandboxId: "sbx_old" };
  store.values.set(identity.bindingKey, binding);
  for (const use of ["observe", "interact"] as const)
    await assert.rejects(sessions.resolve(identity, use), /sandbox_session_inactive/);
  assert.deepEqual(requests, ["GET /v1/sandboxes/sbx_old", "GET /v1/sandboxes/sbx_old"]);
  assert.deepEqual(store.values.get(identity.bindingKey), binding);

  // An explicit file-browser open may create a replacement only after release.
  await assert.rejects(sessions.resolve(identity, "open"), /organization_capacity_exceeded/);
  assert.deepEqual(requests.slice(2), [
    "GET /v1/sandboxes/sbx_old", "GET /v1/workspaces/ws_one", "POST /v1/sandboxes"
  ]);
  assert.notEqual(store.values.get(identity.bindingKey)?.generation, binding.generation);
});

test("readiness cancellation preserves the accepted sandbox and releases local admission", async () => {
  const identity = identityFor("test", { "x-user-id": "one" });
  const store = new TestBindings();
  store.values.set(identity.bindingKey, newBinding("ws_one"));
  let created = 0;
  let observed = () => {};
  const waiting = new Promise<void>((resolve) => {
    observed = resolve;
  });
  const client = new HarakiriClient({
    apiUrl: "https://control.test",
    apiKey: "key",
    fetch: async (url, init) => {
      if (String(url).endsWith("/v1/sandboxes") && init?.method === "POST") {
        created++;
        return Response.json({ sandbox: { id: "sbx_owned", status: "pending", createdAt: new Date().toISOString() } }, { status: 202 });
      }
      if (String(url).endsWith("/readiness")) {
        observed();
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
        });
      }
      return Response.json({ sandbox: { id: "sbx_owned", status: "pending" } });
    }
  });
  const sessions = new Sessions(client, store, { ...testConfig(), ADAPTER_MAX_CONNECTIONS: 1 });
  const cancellation = new AbortController();
  const call = sessions.resolve(identity, "open", cancellation.signal);
  const rejected = assert.rejects(call, /caller disconnected/);
  await waiting;
  await assert.rejects(sessions.resolve(identity, "open"), /context_busy/);
  cancellation.abort(new Error("caller disconnected"));
  await rejected;
  assert.equal(store.values.get(identity.bindingKey)?.sandboxId, "sbx_owned");
  assert.equal(created, 1);
  await assert.rejects(
    sessions.resolve(identity, "open", AbortSignal.abort(new Error("already cancelled"))),
    /already cancelled/
  );
});

test("an uncertain create reuses its original intent even after adapter configuration changes", async () => {
  const store = new TestBindings();
  const identity = identityFor("test", { "x-user-id": "one" });
  const binding = newBinding("ws_one");
  binding.sandboxIntent = true;
  binding.creation = { template: "original-template", ttlSeconds: 321 };
  store.values.set(identity.bindingKey, binding);
  let creates = 0;
  const client = new HarakiriClient({
    apiUrl: "https://control.test",
    apiKey: "key",
    fetch: async (_url, init) => {
      creates++;
      const intent = JSON.parse(String(init?.body));
      assert.equal(intent.template, "original-template");
      assert.equal(intent.ttlSeconds, 321);
      assert.equal(intent.idempotencyKey, binding.generation);
      return Response.json({ error: "organization_capacity_exceeded" }, { status: 409 });
    }
  });
  await assert.rejects(
    new Sessions(client, store, testConfig()).resolve(identity, "mutate"),
    /organization_capacity_exceeded/
  );
  assert.equal(creates, 1);
  assert.equal(store.values.get(identity.bindingKey)?.generation, binding.generation);
});

test("terminated runtime replacement waits for confirmed workspace release", async () => {
  const store = new TestBindings();
  const identity = identityFor("test", { "x-user-id": "one" });
  const binding = { ...newBinding("ws_one"), sandboxId: "sbx_old" };
  store.values.set(identity.bindingKey, binding);
  let mutations = 0;
  const client = new HarakiriClient({
    apiUrl: "https://control.test",
    apiKey: "key",
    fetch: async (url, init) => {
      if (init?.method && init.method !== "GET") mutations++;
      return Response.json(
        String(url).includes("workspaces")
          ? { workspace: { status: "available", attachedSandboxId: "sbx_old" } }
          : { sandbox: { id: "sbx_old", status: "terminated" } }
      );
    }
  });
  await assert.rejects(
    new Sessions(client, store, testConfig()).resolve(identity, "mutate"),
    /workspace_release_unconfirmed/
  );
  assert.equal(mutations, 0);
  assert.equal(store.values.get(identity.bindingKey)?.sandboxId, "sbx_old");
});

test("paused and failed runtime states require operator recovery without polling or mutation", async () => {
  for (const status of ["pausing", "paused", "error"] as const) {
    const store = new TestBindings();
    const identity = identityFor("test", { "x-user-id": "one" });
    const binding = { ...newBinding("ws_one"), sandboxId: "sbx_owned" };
    store.values.set(identity.bindingKey, binding);
    const requests: string[] = [];
    const client = new HarakiriClient({
      apiUrl: "https://control.test", apiKey: "key",
      fetch: async (url, init) => {
        const request = `${init?.method ?? "GET"} ${new URL(String(url)).pathname}`;
        requests.push(request);
        assert.equal(request, "GET /v1/sandboxes/sbx_owned");
        return Response.json({ sandbox: { id: "sbx_owned", status } });
      }
    });
    await assert.rejects(new Sessions(client, store, testConfig()).resolve(identity, "open"),
      { status: 409, code: "sandbox_recovery_required" });
    assert.deepEqual(requests, ["GET /v1/sandboxes/sbx_owned"]);
    assert.deepEqual(store.values.get(identity.bindingKey), binding);
  }
});

test("cancelled shell renewal keeps its binding and never repeats the mutation", async () => {
  const store = new TestBindings();
  const identity = identityFor("test", { "x-user-id": "one" });
  const binding = { ...newBinding("ws_one"), sandboxId: "sbx_owned" };
  store.values.set(identity.bindingKey, binding);
  const cancellation = new AbortController();
  let calls = 0;
  const client = new HarakiriClient({
    apiUrl: "https://control.test", apiKey: "key",
    fetch: async (_url, init) => {
      calls++;
      return new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
        cancellation.abort(new Error("shell disconnected"));
      });
    }
  });
  await assert.rejects(new Sessions(client, store, testConfig()).touch(identity, "sbx_owned", cancellation.signal), /shell disconnected/);
  assert.equal(calls, 1);
  assert.equal(store.values.get(identity.bindingKey)?.renewedAt, 0);
  assert.equal(store.values.get(identity.bindingKey)?.sandboxId, "sbx_owned");
});
