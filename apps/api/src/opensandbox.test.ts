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
  assert.equal(body.metadata["harakiri.route_base_domain"], "sandbox.localhost");
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

  assert.ok("image" in body);
  assert.deepEqual(body.image, {
    uri: "registry.example.com/team/private@sha256:def456",
    auth: { username: "robot", password: "token" }
  });
  assert.equal(body.timeout, 60);
  assert.deepEqual(body.env, { HARAKIRI_ENV_SMOKE: "env-ok" });
  assert.equal(body.metadata["harakiri.runtime_registry_credential"], "cred_private");
});

test("openSandboxCreateBody restores from snapshot without image auth", () => {
  const template: RuntimeTemplate = {
    id: "python-3.12-data",
    name: "Python",
    description: "Template restored from a snapshot",
    image: "python:3.12-slim",
    imageDigest: "sha256:abc",
    icon: "py",
    tags: [],
    aliases: [],
    bootMs: 100,
    visibility: "public",
    status: "ready",
    defaultEntrypoint: ["sleep", "3600"],
    cpuCount: 2,
    memoryMb: 2048,
    workdir: "/workspace",
    defaultPorts: [3000],
    runtimeFamily: "python",
    latestVersionId: "tplv_python",
    templateVersionId: "tplv_python"
  };

  const body = openSandboxCreateBody({
    template,
    ttlSeconds: 300,
    name: "restored",
    providerSnapshotId: "snap_provider_1",
    imageAuth: { username: "robot", password: "token" }
  });

  assert.ok(!("image" in body));
  assert.ok(!("entrypoint" in body));
  assert.equal(body.snapshotId, "snap_provider_1");
  assert.equal(body.metadata["harakiri.snapshot_provider_id"], "snap_provider_1");
});

test("openSandboxCreateBody includes OpenSandbox networkPolicy when egress is restricted", () => {
  const template: RuntimeTemplate = {
    id: "egress-template",
    name: "Egress Template",
    description: "Template with restricted outbound access",
    image: "python:3.12-slim",
    imageDigest: null,
    icon: "py",
    tags: [],
    aliases: [],
    bootMs: 100,
    visibility: "public",
    status: "ready",
    defaultEntrypoint: ["sleep", "3600"],
    cpuCount: 1,
    memoryMb: 512,
    workdir: "/",
    defaultPorts: [],
    runtimeFamily: "python",
    latestVersionId: "tplv_egress",
    templateVersionId: "tplv_egress"
  };

  const body = openSandboxCreateBody({
    template,
    ttlSeconds: 120,
    name: "egress-runner",
    egressPolicy: {
      defaultAction: "deny",
      egress: [{ action: "allow", target: "pypi.org" }]
    }
  });

  assert.deepEqual(body.networkPolicy, {
    defaultAction: "deny",
    egress: [{ action: "allow", target: "pypi.org" }]
  });
});

test("openSandboxCreateBody includes no-op open egress policy to enable later runtime egress updates", () => {
  const template: RuntimeTemplate = {
    id: "open-template",
    name: "Open Template",
    description: "Template with open outbound access",
    image: "python:3.12-slim",
    imageDigest: null,
    icon: "py",
    tags: [],
    aliases: [],
    bootMs: 100,
    visibility: "public",
    status: "ready",
    defaultEntrypoint: ["sleep", "3600"],
    cpuCount: 1,
    memoryMb: 512,
    workdir: "/",
    defaultPorts: [],
    runtimeFamily: "python",
    latestVersionId: "tplv_open",
    templateVersionId: "tplv_open"
  };

  const body = openSandboxCreateBody({
    template,
    ttlSeconds: 120,
    name: "open-runner",
    egressPolicy: {
      defaultAction: "allow",
      egress: []
    }
  });

  assert.deepEqual(body.networkPolicy, {
    defaultAction: "allow",
    egress: []
  });
});

test("openSandboxCreateBody can omit no-op open egress policy for restricted OpenShift installs", () => {
  const template: RuntimeTemplate = {
    id: "open-template",
    name: "Open Template",
    description: "Template with open outbound access",
    image: "python:3.12-slim",
    imageDigest: null,
    icon: "py",
    tags: [],
    aliases: [],
    bootMs: 100,
    visibility: "public",
    status: "ready",
    defaultEntrypoint: ["sleep", "3600"],
    cpuCount: 1,
    memoryMb: 512,
    workdir: "/",
    defaultPorts: [],
    runtimeFamily: "python",
    latestVersionId: "tplv_open",
    templateVersionId: "tplv_open"
  };

  const body = openSandboxCreateBody({
    template,
    ttlSeconds: 120,
    name: "open-runner",
    sendOpenNetworkPolicy: false,
    egressPolicy: {
      defaultAction: "allow",
      egress: []
    }
  });

  assert.equal("networkPolicy" in body, false);
});

test("openSandbox egress policy calls the OpenSandbox-resolved sidecar endpoint", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    requests.push({ url, init });
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/endpoints/18080?use_server_proxy=true") {
      return jsonResponse({
        endpoint: "127.0.0.1:8088/v1/sandboxes/osbx-real/proxy/18080",
        headers: {
          "OpenSandbox-Ingress-To": "osbx-real-18080",
          "OPENSANDBOX-EGRESS-AUTH": "egress-token"
        }
      });
    }
    if (url === "http://127.0.0.1:18085/policy") {
      return jsonResponse({
        status: "ok",
        enforcementMode: "dns+nft",
        policy: {
          defaultAction: "deny",
          egress: [{ action: "allow", target: "pypi.org" }]
        }
      });
    }
    return jsonResponse({ message: `unexpected ${url}` }, { status: 500 });
  };

  const result = await openSandbox.setEgressPolicy("osbx-real", {
    defaultAction: "deny",
    egress: [{ action: "allow", target: "pypi.org" }]
  });

  assert.equal(result.enforcementMode, "dns+nft");
  assert.equal(result.policy?.egress[0]?.target, "pypi.org");
  const policyRequest = requests.find((request) => request.url.endsWith("/policy"));
  assert.ok(policyRequest);
  const headers = new Headers(policyRequest.init?.headers);
  assert.equal(headers.get("OPENSANDBOX-EGRESS-AUTH"), "egress-token");
  assert.equal(policyRequest.init?.method, "POST");
});

test("openSandbox egress policy retries while the sidecar route becomes ready", async () => {
  const policyStatuses: number[] = [503, 200];
  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-race/endpoints/18080?use_server_proxy=true") {
      return jsonResponse({
        endpoint: "127.0.0.1:8088/v1/sandboxes/osbx-race/proxy/18080",
        headers: {
          "OpenSandbox-Ingress-To": "osbx-race-18080",
          "OPENSANDBOX-EGRESS-AUTH": "egress-token"
        }
      });
    }
    if (url === "http://127.0.0.1:18085/policy") {
      const status = policyStatuses.shift() ?? 200;
      if (status !== 200) return jsonResponse({ message: "route not ready" }, { status });
      return jsonResponse({
        status: "ok",
        enforcementMode: "dns+nft",
        policy: { defaultAction: "allow", egress: [] }
      });
    }
    return jsonResponse({ message: `unexpected ${url}` }, { status: 500 });
  };

  const result = await openSandbox.getEgressPolicy("osbx-race");

  assert.equal(result.status, "ok");
  assert.deepEqual(result.policy, { defaultAction: "allow", egress: [] });
  assert.equal(policyStatuses.length, 0);
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
    command: "echo \"$HARAKIRI_TEST\"",
    cwd: "/workspace/app",
    env: { HARAKIRI_TEST: "hello" },
    timeoutMs: 45_000
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
  const commandBody = JSON.parse(String(commandRequest.init?.body ?? "{}"));
  assert.equal(commandBody.background, false);
  assert.equal(commandBody.timeout, 45_000);
  assert.equal(commandBody.cwd, "/workspace/app");
  assert.deepEqual(commandBody.envs, { HARAKIRI_TEST: "hello" });
  assert.equal(commandBody.command, "echo \"$HARAKIRI_TEST\"");
});

test("openSandbox.run retries transient OpenSandbox ingress readiness errors", async () => {
  const commandResponses = [
    new Response("OpenSandbox Ingress: sandbox not ready: opensandbox/osbx-real (ready: 0/1)\n", { status: 503 }),
    new Response('data: {"type":"stdout","text":"ready"}\n\n', { headers: { "content-type": "text/event-stream" } })
  ];
  let commandAttempts = 0;
  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/endpoints/44772?use_server_proxy=true") {
      return execdEndpointResponse({ "OpenSandbox-Ingress-To": "osbx-real-44772" });
    }
    if (url === "http://127.0.0.1:18085/command") {
      commandAttempts += 1;
      return commandResponses.shift() ?? jsonResponse({ message: "unexpected retry" }, { status: 500 });
    }
    return jsonResponse({ message: `unexpected ${url}` }, { status: 500 });
  };

  const result = await openSandbox.run({
    sandboxId: "sbx_real",
    opensandboxId: "osbx-real",
    command: "echo ready"
  });

  assert.equal(commandAttempts, 2);
  assert.equal(result.stdout, "ready\n");
  assert.equal(result.exitCode, 0);
});

test("openSandbox tracked commands use native execd background status and logs", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    requests.push({ url, init });
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/endpoints/44772?use_server_proxy=true") {
      return execdEndpointResponse({ "X-EXECD-ACCESS-TOKEN": "endpoint-token" });
    }
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/proxy/44772/command") {
      return new Response(
        [
          '{"type":"init","text":"cmd-provider"}',
          "",
          '{"type":"execution_complete","execution_time":1}',
          ""
        ].join("\n"),
        { headers: { "content-type": "text/event-stream" } }
      );
    }
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/proxy/44772/command/status/cmd-provider") {
      return Response.json({
        id: "cmd-provider",
        content: "npm run dev",
        running: true,
        exit_code: null,
        started_at: "2026-05-29T00:00:00Z",
        finished_at: null
      });
    }
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/proxy/44772/command/cmd-provider/logs?cursor=0") {
      return new Response("ready\n", { headers: { "EXECD-COMMANDS-TAIL-CURSOR": "1" } });
    }
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/proxy/44772/command?id=cmd-provider") {
      return new Response("", { status: 200 });
    }
    return jsonResponse({ message: `unexpected ${url}` }, { status: 500 });
  };

  const started = await openSandbox.startCommand({
    sandboxId: "sbx_real",
    opensandboxId: "osbx-real",
    command: "npm run dev",
    cwd: "/workspace/app",
    env: { NODE_ENV: "dev" },
    detached: true
  });
  assert.equal(started.providerCommandId, "cmd-provider");
  assert.equal(started.status, "running");
  assert.equal(started.exitCode, null);
  assert.equal(started.durationMs, undefined);

  const commandRequest = requests.find((request) => request.url.endsWith("/command"));
  assert.ok(commandRequest);
  assert.deepEqual(JSON.parse(String(commandRequest.init?.body ?? "{}")), {
    command: "npm run dev",
    cwd: "/workspace/app",
    background: true,
    envs: { NODE_ENV: "dev" }
  });

  const status = await openSandbox.getCommand("osbx-real", "cmd-provider");
  assert.equal(status.status, "running");
  assert.equal(status.command, "npm run dev");

  const logs = await openSandbox.commandLogs("osbx-real", "cmd-provider", 0);
  assert.equal(logs.stdout, "ready\n");
  assert.equal(logs.cursor, 1);

  await openSandbox.interruptCommand("osbx-real", "cmd-provider");
  assert.ok(requests.some((request) => request.url.endsWith("/command?id=cmd-provider") && request.init?.method === "DELETE"));
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
  assert.equal(result.source, "opensandbox-files-search");
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

test("openSandbox.files falls back to an execd directory listing when search fails", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    requests.push({ url, init });
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/endpoints/44772?use_server_proxy=true") {
      return execdEndpointResponse({ "X-EXECD-ACCESS-TOKEN": "endpoint-token" });
    }
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/proxy/44772/files/search?path=%2F&pattern=*") {
      return jsonResponse({ code: "RUNTIME_ERROR", message: "error lookup owner" }, { status: 500 });
    }
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/proxy/44772/command") {
      return new Response(
        [
          'data: {"type":"stdout","text":"d\\t/usr\\t4096\\t755\\troot\\troot\\t1779630000.0\\nf\\t/README.md\\t12\\t644\\troot\\troot\\t1779630001.0\\nl\\t/current\\t7\\t777\\troot\\troot\\t1779630002.0"}',
          ""
        ].join("\n"),
        { headers: { "content-type": "text/event-stream" } }
      );
    }
    return jsonResponse({ message: `unexpected ${url}` }, { status: 500 });
  };

  const result = await openSandbox.files("osbx-real", "/");

  assert.equal(result.cwd, "/");
  assert.equal(result.source, "opensandbox-command-fallback");
  assert.deepEqual(result.warnings, ["OpenSandbox files/search was unavailable; listed direct children through a provider command fallback."]);
  assert.deepEqual(result.files, [
    {
      path: "/usr",
      name: "usr",
      type: "directory",
      size: 4096,
      mode: "0755",
      owner: "root",
      group: "root",
      modifiedAt: "2026-05-24T13:40:00.000Z"
    },
    {
      path: "/README.md",
      name: "README.md",
      type: "file",
      size: 12,
      mode: "0644",
      owner: "root",
      group: "root",
      modifiedAt: "2026-05-24T13:40:01.000Z"
    },
    {
      path: "/current",
      name: "current",
      type: "symlink",
      size: 7,
      mode: "0777",
      owner: "root",
      group: "root",
      modifiedAt: "2026-05-24T13:40:02.000Z"
    }
  ]);
  assert.equal(requests.filter((request) => request.url.endsWith("/command")).length, 1);
});

test("openSandbox.files normalizes paths and preserves empty directory listings", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    requests.push({ url, init });
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/endpoints/44772?use_server_proxy=true") {
      return execdEndpointResponse({ "X-EXECD-ACCESS-TOKEN": "endpoint-token" });
    }
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/proxy/44772/files/search?path=%2Ftmp&pattern=*") {
      return jsonResponse({ code: "RUNTIME_ERROR", message: "search unavailable" }, { status: 500 });
    }
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/proxy/44772/command") {
      return new Response('data: {"type":"execution_complete","execution_time":1}\n\n', {
        headers: { "content-type": "text/event-stream" }
      });
    }
    return jsonResponse({ message: `unexpected ${url}` }, { status: 500 });
  };

  const result = await openSandbox.files("osbx-real", "/workspace/../tmp//");

  assert.equal(result.cwd, "/tmp");
  assert.deepEqual(result.files, []);
  const commandBody = JSON.parse(String(requests.find((request) => request.url.endsWith("/command"))?.init?.body ?? "{}"));
  assert.match(commandBody.command, /target='\/tmp'/);
  assert.doesNotMatch(commandBody.command, /\|\| true/);
});

test("openSandbox.files maps fallback permission and path failures to typed errors", async () => {
  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/endpoints/44772?use_server_proxy=true") {
      return execdEndpointResponse({ "X-EXECD-ACCESS-TOKEN": "endpoint-token" });
    }
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/proxy/44772/files/search?path=%2Froot&pattern=*") {
      return jsonResponse({ code: "RUNTIME_ERROR", message: "search unavailable" }, { status: 500 });
    }
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/proxy/44772/files/search?path=%2Fmissing&pattern=*") {
      return jsonResponse({ code: "RUNTIME_ERROR", message: "search unavailable" }, { status: 500 });
    }
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/proxy/44772/command") {
      return new Response('data: {"type":"stderr","text":"find: /root: Permission denied"}\n\n', {
        headers: { "content-type": "text/event-stream" }
      });
    }
    return jsonResponse({ message: `unexpected ${url}` }, { status: 500 });
  };

  await assert.rejects(
    () => openSandbox.files("osbx-real", "/root"),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "file_permission_denied");
      assert.equal((error as { statusCode?: number }).statusCode, 403);
      return true;
    }
  );

  await assert.rejects(
    () => openSandbox.files("osbx-real", "/tmp/\0bad"),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "invalid_file_path");
      assert.equal((error as { statusCode?: number }).statusCode, 400);
      return true;
    }
  );
});

test("openSandbox filesystem mutations use endpoint-resolved execd commands", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    requests.push({ url, init });
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/endpoints/44772?use_server_proxy=true") {
      return execdEndpointResponse({ "X-EXECD-ACCESS-TOKEN": "endpoint-token" });
    }
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/proxy/44772/command") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (String(body.command).includes("base64 -w0")) {
        return new Response(`data: {"type":"stdout","text":"${Buffer.from("hello").toString("base64")}"}\n\n`, {
          headers: { "content-type": "text/event-stream" }
        });
      }
      const statPath = String(body.command).includes("renamed.txt") ? "/workspace/renamed.txt" : "/workspace/hello.txt";
      return new Response(
        [
          `data: {"type":"stdout","text":"file\\t${statPath}\\t5\\t644\\troot\\troot\\t1779630000.0"}`,
          ""
        ].join("\n"),
        { headers: { "content-type": "text/event-stream" } }
      );
    }
    return jsonResponse({ message: `unexpected ${url}` }, { status: 500 });
  };

  const written = await openSandbox.writeFile("osbx-real", { path: "/workspace/hello.txt", content: "hello", encoding: "utf8", createParents: true });
  const read = await openSandbox.readFile("osbx-real", "/workspace/hello.txt", "utf8");
  const renamed = await openSandbox.renameFile("osbx-real", { fromPath: "/workspace/hello.txt", toPath: "/workspace/renamed.txt" });

  assert.equal(written.path, "/workspace/hello.txt");
  assert.equal(read.content, "hello");
  assert.equal(renamed.path, "/workspace/renamed.txt");
  assert.ok(requests.some((request) => String(request.init?.body ?? "").includes("mkdir -p")));
  assert.ok(requests.some((request) => String(request.init?.body ?? "").includes("mv --")));
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

test("openSandbox.logs falls back to OpenSandbox legacy plain-text diagnostics", async () => {
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/diagnostics/logs?scope=container") {
      return jsonResponse(
        {
          code: "DIAGNOSTICS_NOT_IMPLEMENTED",
          message: "The stable Diagnostics API is not implemented by this OpenSandbox server."
        },
        { status: 501 }
      );
    }
    if (url === "http://127.0.0.1:8088/v1/sandboxes/osbx-real/diagnostics/logs?tail=200") {
      return new Response("2026-05-24T12:00:01Z legacy log line\n", {
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }
    return jsonResponse({ message: `unexpected ${url}` }, { status: 500 });
  };

  const result = await openSandbox.logs("osbx-real");

  assert.deepEqual(requests, [
    "http://127.0.0.1:8088/v1/sandboxes/osbx-real/diagnostics/logs?scope=container",
    "http://127.0.0.1:8088/v1/sandboxes/osbx-real/diagnostics/logs?tail=200"
  ]);
  assert.deepEqual(result, [{ ts: "2026-05-24T12:00:01Z", lvl: "runtime", msg: "legacy log line", source: "sandbox" }]);
});
