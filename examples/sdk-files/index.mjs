import assert from "node:assert/strict";
import { HarakiriClient } from "@h-sandbox/sdk";

// Unreleased SDK recipe; see docs/sdk-developer-experience.md for package setup.
const client = HarakiriClient.fromEnv();
const sandbox = await client.sandboxes.create({
  template: process.env.HARAKIRI_TEMPLATE ?? "python-3.12", name: "sdk-files", wait: false
});
try {
  await sandbox.wait({ timeoutMs: 180_000 });
  await sandbox.files.write("input.txt", "harakiri file API\n");
  assert.equal(await sandbox.files.readText("input.txt"), "harakiri file API\n");
  await sandbox.files.write("input.bin", new Uint8Array([0, 1, 128, 255]));
  await sandbox.run("python -c \"from pathlib import Path; Path('result.bin').write_bytes(Path('input.bin').read_bytes()[::-1])\"", { check: true });
  const result = await sandbox.files.readBytes("result.bin");
  assert.deepEqual(result, new Uint8Array([255, 128, 1, 0]));
  console.log(`Verified ${result.byteLength} result bytes, including SHA-256 in the SDK.`);
} finally {
  await sandbox.kill({ wait: true, timeoutMs: 90_000 });
}
