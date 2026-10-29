import assert from "node:assert/strict";
import test from "node:test";
import { HarakiriClient } from "@h-sandbox/sdk";
import { newBinding, type Binding, type BindingStore } from "./bindings.js";
import { bindingSummary, resetServiceGrant } from "./recovery.js";

const fixture = (deleteFails = false) => {
  const original = {
    ...newBinding("ws_one"),
    sandboxId: "sbx_one",
    routeIntent: true,
    grant: {
      routeKey: "route_one",
      accessToken: "private-grant",
      url: "https://private.test",
      accessHeaderName: "x-harakiri-route-token" as const
    }
  };
  let persisted: Binding = structuredClone(original);
  const mutations: string[] = [];
  const store: BindingStore = {
    withBinding: async (_key, action) =>
      action(structuredClone(persisted), async (binding) => {
        persisted = structuredClone(binding);
      })
  };
  const client = new HarakiriClient({
    apiUrl: "https://control.test",
    apiKey: "key",
    fetch: async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === "DELETE") {
        mutations.push(path);
        assert.equal(persisted.grant, undefined);
        assert.equal(persisted.routeIntent, true);
        return deleteFails
          ? Response.json({ error: "route_provider_failure" }, { status: 502 })
          : Response.json({ route: {} });
      }
      return path.endsWith("/routes")
        ? Response.json({ routes: [] })
        : Response.json({ sandbox: { status: "running" } });
    }
  });
  return { client, store, original, mutations, persisted: () => persisted };
};

test("operator grant reset requires the inspected generation and never replaces storage or runtime", async () => {
  const f = fixture();
  await assert.rejects(
    resetServiceGrant(f.client, f.store, "key", "stale", AbortSignal.timeout(1000)),
    /binding_generation_changed/
  );
  assert.deepEqual(f.mutations, []);
  const result = await resetServiceGrant(f.client, f.store, "key", f.original.generation, AbortSignal.timeout(1000));
  assert.deepEqual(f.mutations, ["/v1/sandboxes/sbx_one/routes/8000"]);
  assert.equal(result.hasGrant, false);
  assert.equal(result.routeCreationPending, false);
  assert.equal(f.persisted().workspaceId, "ws_one");
  assert.equal(f.persisted().generation, f.original.generation);
  const summary = JSON.stringify(bindingSummary(f.original));
  for (const secret of [f.original.serviceKey, "private-grant", "private.test"]) assert.ok(!summary.includes(secret));
});

test("uncertain grant revocation leaves a durable fail-closed recovery state", async () => {
  const f = fixture(true);
  await assert.rejects(resetServiceGrant(f.client, f.store, "key", f.original.generation, AbortSignal.timeout(1000)));
  assert.equal(f.persisted().grant, undefined);
  assert.equal(f.persisted().routeIntent, true);
  assert.equal(f.persisted().sandboxId, "sbx_one");
});
