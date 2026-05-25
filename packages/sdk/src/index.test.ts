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

test("HarakiriClient exposes structured API error details", async () => {
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async () => Response.json({ error: "template_not_ready", message: "template is still building" }, { status: 409 })
  });

  await assert.rejects(() => client.createSandbox({ template: "custom" }), (error) => {
    assert.ok(error instanceof HarakiriApiError);
    assert.equal(error.status, 409);
    assert.equal(error.code, "template_not_ready");
    assert.equal(error.details?.message, "template is still building");
    assert.equal(error.message, "Harakiri API 409: template_not_ready: template is still building");
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

test("HarakiriClient forwards sandbox async create options", async () => {
  const calls: Array<{ url: string; body: string | null }> = [];
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return Response.json({
        sandbox: { id: "sbx_pending", name: "pending", template: "python-3.12", status: "pending" },
        operation: { id: "op_pending", sandboxId: "sbx_pending", kind: "provision", state: "queued", error: null, attempts: 0, createdAt: "now", updatedAt: "now" },
        status: "pending"
      }, { status: 202 });
    }
  });

  const result = await client.createSandbox({ template: "python-3.12", wait: false, idempotencyKey: "idem_1" });

  assert.equal(result.status, "pending");
  assert.equal(result.operation?.id, "op_pending");
  assert.equal(calls[0].url, "http://harakiri.local/v1/sandboxes");
  assert.deepEqual(JSON.parse(calls[0].body ?? "{}"), {
    template: "python-3.12",
    ttlSeconds: 300,
    wait: false,
    idempotencyKey: "idem_1"
  });
});

test("HarakiriClient exposes sandbox logs and files helpers", async () => {
  const calls: string[] = [];
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url) => {
      calls.push(String(url));
      if (String(url).endsWith("/logs")) return Response.json({ logs: [] });
      return Response.json({ cwd: "/workspace", files: [] });
    }
  });

  await client.getSandboxLogs("sbx_test");
  await client.listSandboxFiles("sbx_test", "/workspace/app");

  assert.deepEqual(calls, [
    "http://harakiri.local/v1/sandboxes/sbx_test/logs",
    "http://harakiri.local/v1/sandboxes/sbx_test/files?path=%2Fworkspace%2Fapp"
  ]);
});

test("HarakiriClient exposes registry credential helpers", async () => {
  const calls: Array<{ url: string; method: string | undefined; body: string | null }> = [];
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push({ url: String(url), method: init?.method, body: String(init?.body ?? "") });
      if (init?.method === "POST" || init?.method === "DELETE") {
        return Response.json({
          credential: {
            id: "trc_1",
            name: "ghcr",
            registryHost: "ghcr.io",
            username: "robot",
            secretRef: null,
            purpose: "push_pull",
            repositoryPrefix: "harakiri",
            pullSecretRef: null,
            pushSecretRef: null,
            hasEncryptedSecret: true,
            metadata: {},
            lastUsedAt: null,
            revokedAt: null,
            createdAt: "now",
            updatedAt: "now"
          }
        });
      }
      return Response.json({ credentials: [] });
    }
  });

  await client.listRegistryCredentials({ includeRevoked: true });
  await client.upsertRegistryCredential({
    name: "ghcr",
    registryHost: "ghcr.io",
    username: "robot",
    secret: "token",
    purpose: "push_pull",
    repositoryPrefix: "harakiri"
  });
  await client.revokeRegistryCredential("trc_1");

  assert.deepEqual(calls.map((call) => [call.method ?? "GET", call.url]), [
    ["GET", "http://harakiri.local/v1/registry-credentials?includeRevoked=1"],
    ["POST", "http://harakiri.local/v1/registry-credentials"],
    ["DELETE", "http://harakiri.local/v1/registry-credentials/trc_1"]
  ]);
  assert.equal(JSON.parse(calls[1].body ?? "{}").registryHost, "ghcr.io");
});
