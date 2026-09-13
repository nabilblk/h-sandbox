import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { HarakiriClient } from "@h-sandbox/sdk";

// Unreleased SDK recipe; see docs/sdk-developer-experience.md for package setup.
const holdMs = Number(process.env.HARAKIRI_DEMO_HOLD_MS ?? 30_000);
if (!Number.isSafeInteger(holdMs) || holdMs < 0 || holdMs > 60_000) throw new Error("HARAKIRI_DEMO_HOLD_MS must be 0..60000.");
const client = HarakiriClient.fromEnv();
const sandbox = await client.sandboxes.create({
  template: process.env.HARAKIRI_TEMPLATE ?? "node-20", name: "sdk-protected-server", ttlSeconds: 300
});
try {
  await sandbox.files.write("server.mjs", "import http from 'node:http';\nhttp.createServer((_, res) => res.end('ready')).listen(3000, '0.0.0.0');\n");
  const server = await sandbox.processes.start({ command: "node server.mjs", timeoutMs: 120_000 });
  await server.wait({ statuses: ["running"], timeoutMs: 30_000 });
  const route = await sandbox.routes.expose({ port: 3000, accessMode: "token" });
  const health = await route.waitForHttp({ timeoutMs: 30_000 });
  assert.equal(await health.text(), "ready");
  assert.equal(await (await route.fetch("/")).text(), "ready");
  console.log(`Protected service verified in ${sandbox.id}. Keeping it up for ${holdMs}ms.`);
  // A bare browser URL is insufficient; route.fetch supplies the scoped token.
  await delay(holdMs);
} finally {
  await sandbox.kill({ wait: true, timeoutMs: 90_000 });
}
