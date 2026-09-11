import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

export async function waitForNpmVersion(name, version, {
  request = fetch, now = Date.now, sleep = delay, timeoutMs = 120_000, intervalMs = 2_000
} = {}) {
  assert.match(name, /^@h-sandbox\/(sdk|cli)$/);
  assert.match(version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/);
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    let response;
    try {
      // Read the public packument used by npm install; never replay publication.
      response = await request(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
        headers: { accept: "application/json", "cache-control": "no-cache" },
        signal: AbortSignal.timeout(Math.max(1, Math.min(10_000, deadline - now())))
      });
    } catch (error) {
      if (!(error instanceof TypeError) && !["TimeoutError", "AbortError"].includes(error?.name)) throw error;
    }
    if (response?.ok) {
      const metadata = await response.json();
      if (metadata.versions?.[version]?.version === version) return metadata.versions[version];
    } else if (response && ![404, 408, 429].includes(response.status) && response.status < 500) {
      throw new Error(`Public npm metadata for ${name} returned HTTP ${response.status}; not retrying authorization or permanent errors.`);
    }
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await sleep(Math.min(intervalMs, remaining));
  }
  throw new Error(`Timed out waiting for public npm metadata: ${name}@${version}. Do not republish this version; rerun read-only verification.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await waitForNpmVersion(process.argv[2], process.argv[3]);
    console.log(`Public npm metadata ready: ${process.argv[2]}@${process.argv[3]}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
