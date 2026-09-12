import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { HarakiriClient, HarakiriApiError } from "./index.js";

const options = { from: "2026-09-11T00:00:00Z", to: "2026-09-12T00:00:00Z", resolution: "1h" as const };
test("usage history forwards the typed window and abort signal without mutations", async () => {
  const controller = new AbortController();
  const client = new HarakiriClient({ apiUrl: "https://sandbox.test", apiKey: "test", fetch: async (url, init) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, "/v1/usage/history");
    assert.deepEqual(Object.fromEntries(parsed.searchParams), options);
    assert.equal(init?.method ?? "GET", "GET");
    assert.equal(init?.signal, controller.signal);
    return Response.json({ coverage: { status: "unavailable" }, buckets: [] });
  } });
  const result = await client.usageHistory(options, { signal: controller.signal });
  assert.equal(result.coverage.status, "unavailable");
  controller.abort();
  assert.throws(() => client.usageHistory(options, { signal: controller.signal }), { name: "AbortError" });
});

test("unsupported servers and missing scope retain actionable typed API errors", async () => {
  for (const status of [404, 403, 503]) {
    const client = new HarakiriClient({ apiUrl: "https://sandbox.test", apiKey: "test", fetch: async () => Response.json({ error: "usage_unavailable" }, { status }) });
    await assert.rejects(client.usageHistory(options), (error: unknown) => error instanceof HarakiriApiError && error.status === status);
  }
});

test("private SDK usage types match the shared contract without a published shared dependency", async () => {
  assert.equal(await readFile(new URL("./usage-history.ts", import.meta.url), "utf8"), await readFile(new URL("../../shared/src/usage-history.ts", import.meta.url), "utf8"));
});
