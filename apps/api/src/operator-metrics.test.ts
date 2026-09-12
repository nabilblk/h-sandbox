import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { createOperatorMetrics, startOperatorMetrics } from "./operator-metrics.js";

test("private metrics is opt-in, authenticated and exposes only allowlisted labels", async () => {
  assert.equal(await startOperatorMetrics("api", { enabled: false, host: "127.0.0.1", port: 0, token: "", metrics: createOperatorMetrics(), observerEnabled: true }), null);
  await assert.rejects(startOperatorMetrics("api", { enabled: true, host: "127.0.0.1", port: 0, token: "short", metrics: createOperatorMetrics(), observerEnabled: true }), /dedicated token/);
  const metrics = createOperatorMetrics(), token = randomBytes(32).toString("hex");
  metrics.denial("organization_capacity_exceeded"); metrics.denial("private-org-id");
  metrics.probe("ready", .2); metrics.probe("private-host", .3);
  metrics.observerReport({ discovered: 1, checked: 1, ready: 1, failed: 0, censored: 0, unsupported: 0, pending: 0, oldestPendingAtSeconds: 0 });
  const listener = await startOperatorMetrics("scheduler", { enabled: true, host: "127.0.0.1", port: 0, token, metrics, observerEnabled: true });
  assert.ok(listener?.address && typeof listener.address === "object");
  const base = `http://127.0.0.1:${listener.address.port}`;
  try {
    assert.equal((await fetch(`${base}/metrics`)).status, 401);
    assert.equal((await fetch(`${base}/metrics`, { headers: { authorization: "Bearer invalid" } })).status, 401);
    assert.equal((await fetch(`${base}/v1/usage`, { headers: { authorization: `Bearer ${token}` } })).status, 404);
    assert.equal((await fetch(`${base}/metrics`, { method: "POST", headers: { authorization: `Bearer ${token}` } })).status, 404);
    const response = await fetch(`${base}/metrics`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.text();
    assert.match(body, /harakiri_admission_denial_attempts_total\{[^\n]*reason="organization_capacity_exceeded"[^\n]*\} 1/);
    assert.match(body, /harakiri_observer_last_success_timestamp_seconds/);
    assert.match(body, /harakiri_readiness_probe_duration_seconds_bucket/);
    for (const forbidden of [token, "private-org-id", "private-host", "sandbox_id", "organization_id", "email"]) assert.equal(body.includes(forbidden), false);
    assert.doesNotMatch(await createOperatorMetrics().registry.metrics(), /organization_capacity_exceeded/);
  } finally { await listener.close(); }
});
