import assert from "node:assert/strict";
import { HarakiriClient, HarakiriTelemetryGrant } from "@h-sandbox/sdk";

const calls = [];
const client = new HarakiriClient({ apiUrl: "https://fixture.invalid", apiKey: "private-platform-key", fetch: async (url, init) => {
  calls.push({ url: String(url), init });
  if (String(url).endsWith("/grants")) return Response.json({
    id: "grant_test", token: "htg_fixture", capture: "metadata", expiresAt: new Date(Date.now() + 60_000).toISOString()
  });
  return Response.json({ run: { id: "run_test" }, records: [], partial: true, issues: ["record_limit"] });
} });
const { run } = await client.agentRuns.create({ name: "Installed consumer", sandboxId: "sbx_test" });
const grant = await client.agentRuns.grant(run.id, "sbx_test");
assert.ok(grant instanceof HarakiriTelemetryGrant);
assert.equal(JSON.stringify(grant).includes("htg_fixture"), false);
assert.deepEqual(grant.exporterOptions("traces"), {
  url: "https://fixture.invalid/v1/telemetry/traces", headers: { Authorization: "Bearer htg_fixture" }
});
const snapshot = await client.agentRuns.spans(run.id, { from: "2026-11-09T12:00:00Z", to: "2026-11-09T13:00:00Z" });
assert.equal(snapshot.partial, true);
await client.agentRuns.close(run.id, "unknown");
assert.equal(calls.length, 4);
assert.ok(calls.every(({ init }) => new Headers(init.headers).get("x-api-key") === "private-platform-key"));
console.log("Installed SDK: run control, bounded reads and private exporter grants passed.");
