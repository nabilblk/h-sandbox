import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

export function assertLocalDeploy(origins) {
  for (const origin of origins.filter(Boolean)) {
    const url = new URL(origin);
    assert.ok(["http:", "https:"].includes(url.protocol) && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname),
      "The legacy development deploy applies fixed credentials. Use the versioned Helm upgrade guide for public installations; existing secrets and identity configuration must be preserved.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { assertLocalDeploy(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
