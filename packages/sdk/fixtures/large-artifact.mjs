import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { HarakiriClient } from "@h-sandbox/sdk";

// Run without a TypeScript loader, under --max-old-space-size=128.
const original = Buffer.alloc(16 * 1024 * 1024);
for (let index = 0; index < original.length; index++) original[index] = index % 256;
const sha256 = `sha256:${createHash("sha256").update(original).digest("hex")}`;
const payload = { sizeBytes: original.length, contentBase64: original.toString("base64"), sha256 };
const client = new HarakiriClient({
  apiUrl: "https://control.example.invalid", apiKey: "dummy-api-secret",
  fetch: async (url) => {
    assert.equal(new URL(url).pathname, "/v1/sandboxes/sbx_memory/files/download");
    assert.equal(new URL(url).searchParams.get("path"), "/workspace/result.bin");
    return Response.json(payload);
  }
});
const sandbox = client.sandboxes.wrap({
  id: "sbx_memory", status: "running", capacityPhase: "active",
  runtimeMetadata: { workdir: "/workspace", limits: { fileArtifactMaxBytes: original.length } }
});
const bytes = await sandbox.files.readBytes("result.bin");
assert.ok(bytes instanceof Uint8Array);
assert.equal(bytes.byteLength, original.length);
assert.equal(Buffer.compare(original, bytes), 0);
assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`, sha256);
console.log("Installed SDK: 16 MiB artifact verified under a 128 MiB Node heap.");
