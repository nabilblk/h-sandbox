import assert from "node:assert/strict";
import test from "node:test";
import { openSandbox, openSandboxCreateBody } from "./opensandbox.js";
import type { RuntimeTemplate } from "./templates.js";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

const requestUrl = (input: string | URL | Request) => (input instanceof Request ? input.url : String(input));

const jsonResponse = (value: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(value), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });

const execdEndpointResponse = (headers?: Record<string, string>) =>
  jsonResponse({
    endpoint: "127.0.0.1:8088/v1/sandboxes/osbx-real/proxy/44772",
    ...(headers ? { headers } : {})
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

test("openSandbox.run uses the OpenSandbox-resolved execd endpoint and forwards endpoint headers", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    requests.push({ url, init });
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/endpoints/44772?use_server_proxy=true") {
      return execdEndpointResponse({
        "OpenSandbox-Ingress-To": "osbx-real-44772",
        "OpenSandbox-Secure-Access": "secure-token"
      });
    }
    if (url === "http://127.0.0.1:18085/command") {
      return new Response(
        [
          'data: {"type":"stdout","text":"hello"}',
          "",
          'data: {"type":"execution_complete","execution_time":13}',
          ""
        ].join("\n"),
        { headers: { "content-type": "text/event-stream" } }
      );
    }
    return jsonResponse({ message: `unexpected ${url}` }, { status: 500 });
  };

  const result = await openSandbox.run({
    sandboxId: "sbx_real",
    opensandboxId: "osbx-real",
    command: "echo hello"
  });

  assert.equal(result.stdout, "hello\n");
  assert.equal(result.exitCode, 0);
  assert.equal(result.durationMs, 13);

  const commandRequest = requests.find((request) => request.url.endsWith("/command"));
  assert.ok(commandRequest);
  const commandHeaders = new Headers(commandRequest.init?.headers);
  assert.equal(commandHeaders.get("accept"), "text/event-stream");
  assert.equal(commandHeaders.get("content-type"), "application/json");
  assert.equal(commandHeaders.get("OpenSandbox-Ingress-To"), "osbx-real-44772");
  assert.equal(commandHeaders.get("OpenSandbox-Secure-Access"), "secure-token");
  assert.equal(commandHeaders.get("X-EXECD-ACCESS-TOKEN"), "dev-opensandbox-key");
});

test("openSandbox.files lists through execd files/search and synthesizes direct directories", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    requests.push({ url, init });
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/endpoints/44772?use_server_proxy=true") {
      return execdEndpointResponse({ "X-EXECD-ACCESS-TOKEN": "endpoint-token" });
    }
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/proxy/44772/files/search?path=%2Fworkspace&pattern=*") {
      return jsonResponse([
        {
          path: "/workspace/app.py",
          size: 42,
          mode: 644,
          modified_at: "2026-05-24T12:00:00Z",
          created_at: "2026-05-24T11:59:00Z",
          owner: "root",
          group: "root"
        },
        {
          path: "/workspace/src/index.ts",
          size: 84,
          mode: 644,
          modified_at: "2026-05-24T12:01:00Z",
          created_at: "2026-05-24T11:59:00Z",
          owner: "root",
          group: "root"
        }
      ]);
    }
    return jsonResponse({ message: `unexpected ${url}` }, { status: 500 });
  };

  const result = await openSandbox.files("osbx-real", "/workspace/");

  assert.equal(result.cwd, "/workspace");
  assert.deepEqual(result.files, [
    { path: "/workspace/src", name: "src", type: "directory", size: 0 },
    {
      path: "/workspace/app.py",
      name: "app.py",
      type: "file",
      size: 42,
      mode: "0644",
      modifiedAt: "2026-05-24T12:00:00Z",
      owner: "root",
      group: "root"
    }
  ]);

  const searchRequest = requests.find((request) => request.url.includes("/files/search"));
  assert.ok(searchRequest);
  assert.equal(new Headers(searchRequest.init?.headers).get("X-EXECD-ACCESS-TOKEN"), "endpoint-token");
});

test("openSandbox.metrics reads metrics through the resolved execd endpoint", async () => {
  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/endpoints/44772?use_server_proxy=true") {
      return execdEndpointResponse({ "X-EXECD-ACCESS-TOKEN": "endpoint-token" });
    }
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/proxy/44772/metrics") {
      return jsonResponse({
        cpu_count: 2,
        cpu_used_pct: 12.5,
        mem_total_mib: 2048,
        mem_used_mib: 128,
        timestamp: Date.parse("2026-05-24T12:00:00Z")
      });
    }
    return jsonResponse({ message: `unexpected ${url}` }, { status: 500 });
  };

  const result = await openSandbox.metrics("osbx-real");

  assert.deepEqual(result, {
    current: { cpu: 13, mem: 128, diskIo: 0, networkOut: 0, cpuCount: 2, memTotal: 2048 },
    series: [{ ts: "2026-05-24T12:00:00.000Z", cpu: 13, mem: 128 }]
  });
});

test("openSandbox.logs uses OpenSandbox diagnostics instead of direct Kubernetes pod logs", async () => {
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/diagnostics/logs?scope=container") {
      return jsonResponse({
        sandboxId: "osbx-real",
        kind: "logs",
        scope: "container",
        delivery: "inline",
        contentType: "text/plain; charset=utf-8",
        content: "2026-05-24T12:00:00Z execd started\nruntime line without timestamp",
        truncated: false
      });
    }
    return jsonResponse({ message: `unexpected ${url}` }, { status: 500 });
  };

  const result = await openSandbox.logs("osbx-real");

  assert.equal(requests.length, 1);
  assert.deepEqual(result, [
    { ts: "2026-05-24T12:00:00Z", lvl: "runtime", msg: "execd started", source: "sandbox" },
    { ts: result[1]?.ts, lvl: "runtime", msg: "line without timestamp", source: "sandbox" }
  ]);
});
