import assert from "node:assert/strict";
import test from "node:test";
import { openSandbox, openSandboxCreateBody } from "./opensandbox.js";
import type { RuntimeTemplate } from "./templates.js";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("openSandbox.create sends the resolved DB template image, entrypoint, and resources", async () => {
  const requests: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ input, init });
    return Response.json({
      id: "provider-template-test",
      status: { state: "Running" },
      expiresAt: "2026-05-24T12:00:00.000Z"
    });
  };

  const template: RuntimeTemplate = {
    id: "db-template",
    name: "DB Template",
    description: "Template loaded from PostgreSQL",
    image: "registry.local/harakiri/db-template@sha256:abc123",
    imageDigest: "sha256:abc123",
    icon: "file",
    tags: ["custom"],
    aliases: ["db-template:stable"],
    bootMs: 111,
    visibility: "internal",
    status: "ready",
    defaultEntrypoint: ["/bin/sleep", "99"],
    cpuCount: 2,
    memoryMb: 2048,
    workdir: "/workspace",
    defaultPorts: [3000],
    runtimeFamily: "custom",
    latestVersionId: "tplv_db_template_1",
    templateVersionId: "tplv_db_template_1"
  };

  const result = await openSandbox.create({
    template,
    ttlSeconds: 90,
    name: "db-template-runner",
    metadata: {
      "harakiri.id": "sbx_template",
      "harakiri.sandbox": "sbx_template",
      "harakiri.org": "org_template",
      "harakiri.organization": "org_template"
    },
    env: {
      HARAKIRI_ENV_SMOKE: "env-ok"
    }
  });

  assert.equal(result.id, "provider-template-test");
  const request = requests[0];
  assert.ok(request);
  assert.equal(String(request.input), "http://127.0.0.1:8088/v1/sandboxes");
  const body = JSON.parse(String(request.init?.body));
  assert.deepEqual(body.image, { uri: "registry.local/harakiri/db-template@sha256:abc123" });
  assert.deepEqual(body.entrypoint, ["/bin/sleep", "99"]);
  assert.equal(body.timeout, 90);
  assert.deepEqual(body.resourceLimits, { cpu: "2000m", memory: "2048Mi" });
  assert.equal(body.metadata["harakiri.template"], "db-template");
  assert.equal(body.metadata["harakiri.template_version"], "tplv_db_template_1");
  assert.equal(body.metadata["harakiri.image_digest"], "sha256-abc123");
  assert.equal(body.metadata["harakiri.workdir"], "workspace");
  assert.equal(body.metadata["harakiri.id"], "sbx_template");
  assert.equal(body.metadata["harakiri.sandbox"], "sbx_template");
  assert.equal(body.metadata["harakiri.org"], "org_template");
  assert.equal(body.metadata["harakiri.organization"], "org_template");
  assert.equal(body.metadata["harakiri.route_mode"], "local-proxy");
  assert.equal(body.metadata["harakiri.route_base_domain"], "harakiri.io");
  assert.equal(body.metadata["harakiri.route_public_scheme"], "https");
  assert.equal(body.metadata["harakiri.route_max_per_sandbox"], "8");
  assert.equal(body.metadata["harakiri.route_max_per_org"], "200");
  assert.deepEqual(body.env, { HARAKIRI_ENV_SMOKE: "env-ok" });
});

test("openSandboxCreateBody includes sandbox env and image auth when provided", () => {
  const template: RuntimeTemplate = {
    id: "private-template",
    name: "Private Template",
    description: "Template loaded from a private registry",
    image: "registry.example.com/team/private@sha256:def456",
    imageDigest: "sha256:def456",
    icon: "file",
    tags: [],
    aliases: [],
    bootMs: 111,
    visibility: "private",
    status: "ready",
    defaultEntrypoint: ["sleep", "3600"],
    cpuCount: 1,
    memoryMb: 512,
    workdir: "/workspace",
    defaultPorts: [],
    runtimeFamily: "custom",
    latestVersionId: "tplv_private",
    templateVersionId: "tplv_private"
  };

  const body = openSandboxCreateBody({
    template,
    ttlSeconds: 30,
    name: "private-runner",
    env: { HARAKIRI_ENV_SMOKE: "env-ok" },
    imageAuth: { username: "robot", password: "token" },
    metadata: { "harakiri.runtime_registry_credential": "cred_private" }
  });

  assert.deepEqual(body.image, {
    uri: "registry.example.com/team/private@sha256:def456",
    auth: { username: "robot", password: "token" }
  });
  assert.equal(body.timeout, 60);
  assert.deepEqual(body.env, { HARAKIRI_ENV_SMOKE: "env-ok" });
  assert.equal(body.metadata["harakiri.runtime_registry_credential"], "cred_private");
});
