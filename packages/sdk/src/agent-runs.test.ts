import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { inspect } from "node:util";
import { HarakiriClient, HarakiriApiError, HarakiriTelemetryGrant } from "./index.js";

const grant = { id: "grant_fixture", token: "htg_private", capture: "metadata" as const, expiresAt: new Date(Date.now() + 600_000).toISOString() };
const window = { from: "2026-11-09T10:00:00Z", to: "2026-11-09T11:00:00Z" };

test("run control uses the standard authenticated transport and explicit scopes", async () => {
  const requests: { path: string; method: string; body: unknown }[] = [];
  const client = new HarakiriClient({ apiUrl: "https://sandbox.test", apiKey: "private-api-key", fetch: async (url, init) => {
    assert.equal(new Headers(init?.headers).get("x-api-key"), "private-api-key");
    assert.ok(init?.signal);
    requests.push({ path: new URL(String(url)).pathname, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
    return Response.json(String(url).endsWith("/grants") ? grant : { run: { id: "run_fixture" } });
  } });
  await client.agentRuns.create({ name: "Repair", sandboxId: "sbx_fixture" });
  await client.agentRuns.get("run_fixture");
  const scoped = await client.agentRuns.grant("run_fixture", "sbx_fixture");
  await client.agentRuns.close("run_fixture", "unknown");
  await client.agentRuns.revokeGrant("run_fixture", scoped.id);
  assert.deepEqual(requests.map(({ method }) => method), ["POST", "GET", "POST", "POST", "DELETE"]);
  assert.deepEqual(requests[0].body, { name: "Repair", sandboxId: "sbx_fixture" });
  assert.deepEqual(requests[3].body, { outcome: "unknown" });
  assert.equal(scoped.exporterOptions("traces").url, "https://sandbox.test/v1/telemetry/traces");
  assert.deepEqual(scoped.exporterOptions("logs").headers, { Authorization: "Bearer htg_private" });
  for (const serialized of [JSON.stringify(scoped), inspect(scoped), JSON.stringify({ ...scoped })]) {
    assert.ok(!serialized.includes(grant.token));
    assert.ok(!serialized.includes("private-api-key"));
  }
});

test("read options are encoded, false remains false, and aborts prevent requests", async () => {
  const urls: URL[] = [];
  const client = new HarakiriClient({ apiUrl: "https://sandbox.test", apiKey: "test", fetch: async (url) => {
    urls.push(new URL(String(url))); return Response.json({ records: [], runs: [] });
  } });
  await client.agentRuns.spans("run_fixture", { ...window, includeContent: false, limit: 50 });
  await client.agentRuns.logs("run_fixture", { ...window, traceId: "a".repeat(32) });
  await client.agentRuns.list({ search: "a&b", cursor: "opaque+cursor=" });
  assert.equal(urls[0].searchParams.get("includeContent"), "false");
  assert.equal(urls[2].searchParams.get("search"), "a&b");
  const controller = new AbortController(); controller.abort();
  await assert.rejects(client.agentRuns.get("run_fixture", { signal: controller.signal }), { name: "AbortError" });
  assert.equal(urls.length, 3);
});

test("unavailable, denied, expired and overloaded reads retain typed API errors", async () => {
  for (const status of [403, 404, 410, 429, 503]) {
    const client = new HarakiriClient({ apiUrl: "https://sandbox.test", apiKey: "test", fetch: async () => Response.json({ error: "telemetry_unavailable" }, { status }) });
    await assert.rejects(client.agentRuns.spans("run_fixture", window), (error: unknown) => error instanceof HarakiriApiError && error.status === status);
  }
});

test("grant configuration rejects credential-bearing URLs and expired credentials", () => {
  for (const url of ["https://user:password@sandbox.test", "https://sandbox.test/?token=secret", "https://sandbox.test/#secret", "file:///tmp/socket"]) {
    assert.throws(() => new HarakiriTelemetryGrant(grant, url), TypeError);
  }
  const expired = new HarakiriTelemetryGrant({ ...grant, expiresAt: "2020-01-01T00:00:00Z" }, "https://sandbox.test");
  assert.throws(() => expired.exporterOptions("traces"), /expired/);
});

test("published observability contracts match shared without a workspace dependency", async () => {
  const local = await readFile(new URL("./observability-types.ts", import.meta.url), "utf8");
  const shared = await readFile(new URL("../../shared/src/observability.ts", import.meta.url), "utf8");
  assert.equal(local.slice(local.indexOf("\n") + 1), shared);
});
