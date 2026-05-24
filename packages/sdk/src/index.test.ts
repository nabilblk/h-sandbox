import assert from "node:assert/strict";
import test from "node:test";
import { HarakiriApiError, HarakiriClient } from "./index.js";

test("HarakiriClient normalizes the API URL and sends API key auth", async () => {
  const calls: Array<{ url: string; headers: HeadersInit | undefined }> = [];
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local///",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push({ url: String(url), headers: init?.headers });
      return Response.json({ templates: [] });
    }
  });

  await client.listTemplates();

  assert.equal(calls[0].url, "http://harakiri.local/v1/templates");
  assert.equal((calls[0].headers as Record<string, string>)["x-api-key"], "hk_live_test");
});

test("HarakiriClient raises API errors with status and body", async () => {
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async () => new Response("nope", { status: 401 })
  });

  await assert.rejects(() => client.listTemplates(), (error) => {
    assert.ok(error instanceof HarakiriApiError);
    assert.equal(error.status, 401);
    assert.equal(error.body, "nope");
    return true;
  });
});

test("HarakiriClient uploads template build contexts", async () => {
  const calls: Array<{ url: string; body: string | null }> = [];
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return Response.json({ context: { buildId: "bld_1", sha256: "sha256:abc", sizeBytes: 12, format: "tar+gzip", fileCount: 1, uploadedAt: "now" } });
    }
  });

  await client.uploadTemplateBuildContext("bld_1", {
    archiveBase64: "AAAA",
    sha256: "sha256:abc",
    sizeBytes: 12,
    fileCount: 1
  });

  assert.equal(calls[0].url, "http://harakiri.local/v1/template-builds/bld_1/context");
  assert.equal(JSON.parse(calls[0].body ?? "{}").archiveBase64, "AAAA");
});
