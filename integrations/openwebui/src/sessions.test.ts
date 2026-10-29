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
  const server = createServer((req, res) => {
    assert.equal(req.headers["x-harakiri-route-token"], "grant");
    res.end("healthy");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
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
        return Response.json({ sandbox: { id: "sbx_one", status: "pending" } }, { status: 202 });
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
  const sessions = new Sessions(client, store, config);
  const results = await Promise.all(Array.from({ length: 6 }, () => sessions.resolve(identity, false)));
  assert.equal(new Set(results.map((session) => session.sandboxId)).size, 1);
  assert.deepEqual(creates, { workspaces: 1, sandboxes: 1, routes: 1, renewals: 0 });
  const restarted = new Sessions(client, store, config);
  assert.equal((await restarted.resolve(identity, false)).sandboxId, "sbx_one");
  assert.equal(creates.sandboxes, 1);
  // Polling is not activity. Only an explicit action can renew the lease.
  store.values.get(identity.bindingKey)!.renewedAt = 0;
  await restarted.resolve(identity, false);
  assert.equal(creates.renewals, 0);
  await restarted.resolve(identity, true);
  assert.equal(creates.renewals, 1);
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
  await assert.rejects(new Sessions(client, store, config).resolve(identity, true), /route_creation_unconfirmed/);
  assert.equal(mutations, 0);
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
        return Response.json({ sandbox: { id: "sbx_owned", status: "pending" } }, { status: 202 });
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
  const call = sessions.resolve(identity, false, cancellation.signal);
  const rejected = assert.rejects(call, /caller disconnected/);
  await waiting;
  await assert.rejects(sessions.resolve(identity, false), /context_busy/);
  cancellation.abort(new Error("caller disconnected"));
  await rejected;
  assert.equal(store.values.get(identity.bindingKey)?.sandboxId, "sbx_owned");
  assert.equal(created, 1);
  await assert.rejects(
    sessions.resolve(identity, false, AbortSignal.abort(new Error("already cancelled"))),
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
    new Sessions(client, store, testConfig()).resolve(identity, true),
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
    new Sessions(client, store, testConfig()).resolve(identity, true),
    /workspace_release_unconfirmed/
  );
  assert.equal(mutations, 0);
  assert.equal(store.values.get(identity.bindingKey)?.sandboxId, "sbx_old");
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
