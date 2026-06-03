import assert from "node:assert/strict";
import test from "node:test";
import { recordSandboxEvent } from "./services/sandbox-events.js";

test("recordSandboxEvent stores event metadata through the injected query", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const recorder = recordSandboxEvent(async (text, params) => {
    calls.push({ text, params });
    return { rowCount: 1, rows: [] as never[] };
  });

  await recorder("org_evt", "sbx_evt", "created", "created through provider token=secret-value", {
    provider: "fake",
    nested: { apiKey: "hk_live_secret" }
  });

  assert.match(calls[0].text, /INSERT INTO sandbox_events/);
  assert.deepEqual(calls[0].params, [
    "sbx_evt",
    "org_evt",
    "created",
    "created through provider token=[redacted]",
    { provider: "fake", nested: { apiKey: "[redacted]" } }
  ]);
});
