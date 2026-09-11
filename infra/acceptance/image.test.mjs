import assert from "node:assert/strict";
import test from "node:test";
import { sha256 } from "./context.mjs";
import { verifyNativeTemplate } from "./image.mjs";

function fixture(architecture = "amd64", corrupt = false) {
  const config = JSON.stringify({ os: "linux", architecture, config: { Env: ["sensitive"] } });
  const configDigest = `sha256:${sha256(config)}`;
  const manifest = JSON.stringify({ schemaVersion: 2, config: { digest: configDigest } });
  const digest = `sha256:${sha256(manifest)}`;
  const calls = [];
  const request = async (url, options) => {
    calls.push(url);
    if (url.includes("/service/token?")) {
      assert.equal(options.headers, undefined);
      return Response.json({ token: "sensitive" });
    }
    assert.equal(options.headers.Authorization, "Bearer sensitive");
    if (url.endsWith(`/manifests/${digest}`)) return new Response(manifest);
    assert.ok(url.endsWith(`/blobs/${configDigest}`));
    return new Response(corrupt ? "{}" : config);
  };
  return { image: `core.campus.clusterdiali.me/harakiri/templates/opencode@${digest}`, request, calls, digest };
}

test("native template verification checks registry bytes and concrete architecture", async () => {
  const input = fixture();
  const evidence = await verifyNativeTemplate(input.image, input.request);
  assert.deepEqual(evidence, { nativeTemplateImage: true, templateManifestSha256: input.digest.slice(7) });
  assert.equal(input.calls.length, 3);
  assert.ok(!JSON.stringify(evidence).includes("sensitive"));
});

test("a pullable ARM image or corrupt document cannot pass native acceptance", async () => {
  for (const [architecture, corrupt, message] of [["arm64", false, /not native/], ["amd64", true, /checksum mismatch/]]) {
    const input = fixture(architecture, corrupt);
    await assert.rejects(verifyNativeTemplate(input.image, input.request), message);
  }
  await assert.rejects(verifyNativeTemplate("other.invalid/private:latest", () => assert.fail("Must not fetch")), /public catalog/);
});
