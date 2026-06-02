import assert from "node:assert/strict";
import test from "node:test";
import {
  HarakiriApiError,
  HarakiriAuthenticationError,
  HarakiriClient,
  HarakiriConflictError,
  HarakiriProviderUnavailableError,
  HarakiriRateLimitError,
  HarakiriTimeoutApiError,
  HarakiriUnsupportedCapabilityError,
  HarakiriWaitTimeoutError
} from "./index.js";

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

test("HarakiriClient classifies API errors for integrators", async () => {
  const responses = [
    { status: 401, body: { error: "api_key_invalid" }, expected: HarakiriAuthenticationError, retryable: false },
    { status: 409, body: { error: "sandbox_not_running" }, expected: HarakiriConflictError, retryable: false },
    { status: 429, body: { error: "sandbox_route_limit_exceeded" }, expected: HarakiriRateLimitError, retryable: true },
    { status: 501, body: { error: "runtime_command_unsupported" }, expected: HarakiriUnsupportedCapabilityError, retryable: false },
    { status: 501, body: { error: "runtime_file_operation_unsupported" }, expected: HarakiriUnsupportedCapabilityError, retryable: false },
    { status: 408, body: { error: "sandbox_command_timeout" }, expected: HarakiriTimeoutApiError, retryable: true },
    { status: 502, body: { error: "egress_provider_unavailable" }, expected: HarakiriProviderUnavailableError, retryable: true }
  ];
  for (const response of responses) {
    const client = new HarakiriClient({
      apiUrl: "http://harakiri.local",
      apiKey: "hk_live_test",
      fetch: async () => Response.json(response.body, { status: response.status })
    });
    await assert.rejects(() => client.listTemplates(), (error) => {
      assert.ok(error instanceof response.expected);
      assert.ok(error instanceof HarakiriApiError);
      assert.equal(error.status, response.status);
      assert.equal(error.retryable, response.retryable);
      return true;
    });
  }
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

test("HarakiriClient exposes sandbox runtime helpers", async () => {
  const calls: Array<{ method: string; url: string }> = [];
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push({ method: init?.method ?? "GET", url: String(url) });
      if (String(url).endsWith("/renew")) return Response.json({ ok: true });
      if (String(url).endsWith("/logs")) return Response.json({ logs: [] });
      if (String(url).endsWith("/runtime/capabilities")) {
        return Response.json({
          provider: "opensandbox",
          generatedAt: "2026-05-29T00:00:00.000Z",
          capabilities: [{
            name: "commands",
            state: "available",
            contract: "opensandbox_spec",
            source: "OpenSandbox execd tracked command API",
            required: true,
            reason: null
          }]
        });
      }
      if (String(url).endsWith("/metrics")) {
        return Response.json({
          current: { cpu: 4, mem: 128, diskIo: 0, networkOut: 0, cpuCount: 1, memTotal: 1024 },
          series: []
        });
      }
      if (String(url).endsWith("/routes/3000")) {
        return Response.json({
          route: {
            port: 3000,
            protocol: "http",
            accessMode: "public",
            accessHeaderName: null,
            tokenHint: null,
            labels: [],
            createdByUserId: null,
            createdByLabel: null,
            routeKey: "sbx-test-3000",
            host: "sbx-test-3000.example.com",
            url: "https://sbx-test-3000.example.com",
            targetUrl: "http://sandbox:3000",
            state: "terminated",
            provider: "dev",
            providerRouteId: null,
            createdAt: "now",
            lastCheckedAt: null,
            lastUsedAt: null,
            terminatedAt: "now"
          }
        });
      }
      return Response.json({ cwd: "/workspace", files: [] });
    }
  });

  await client.renewSandbox("sbx_test");
  await client.getSandboxLogs("sbx_test");
  await client.listSandboxFiles("sbx_test", "/workspace/app");
  await client.getSandboxMetrics("sbx_test");
  await client.getRuntimeCapabilities();
  await client.deleteRoute("sbx_test", 3000);

  assert.deepEqual(calls, [
    { method: "POST", url: "http://harakiri.local/v1/sandboxes/sbx_test/renew" },
    { method: "GET", url: "http://harakiri.local/v1/sandboxes/sbx_test/logs" },
    { method: "GET", url: "http://harakiri.local/v1/sandboxes/sbx_test/files?path=%2Fworkspace%2Fapp" },
    { method: "GET", url: "http://harakiri.local/v1/sandboxes/sbx_test/metrics" },
    { method: "GET", url: "http://harakiri.local/v1/runtime/capabilities" },
    { method: "DELETE", url: "http://harakiri.local/v1/sandboxes/sbx_test/routes/3000" }
  ]);
});

test("HarakiriClient forwards run command options", async () => {
  const calls: Array<{ url: string; body: string | null }> = [];
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return Response.json({
        result: {
          sandboxId: "sbx_test",
          command: "npm test",
          stdout: "",
          stderr: "",
          exitCode: 0,
          durationMs: 9
        }
      });
    }
  });

  await client.runSandbox("sbx_test", {
    command: "npm test",
    cwd: "/workspace/app",
    env: { NODE_ENV: "test" },
    timeoutMs: 30_000
  });

  assert.equal(calls[0].url, "http://harakiri.local/v1/sandboxes/sbx_test/run");
  assert.deepEqual(JSON.parse(calls[0].body ?? "{}"), {
    command: "npm test",
    cwd: "/workspace/app",
    env: { NODE_ENV: "test" },
    timeoutMs: 30_000
  });
});

test("HarakiriClient exposes tracked command helpers", async () => {
  const calls: Array<{ method: string; url: string; body: string | null }> = [];
  const command = {
    id: "cmd_test",
    sandboxId: "sbx_test",
    provider: "opensandbox",
    providerCommandId: "provider_cmd",
    command: "npm run dev",
    status: "running",
    cwd: "/workspace/app",
    envKeys: ["NODE_ENV"],
    timeoutMs: 30000,
    detached: true,
    stdout: "",
    stderr: "",
    exitCode: null,
    error: null,
    startedAt: "2026-05-29T00:00:00.000Z",
    finishedAt: null,
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z"
  };
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push({ method: init?.method ?? "GET", url: String(url), body: String(init?.body ?? "") });
      if (String(url).endsWith("/logs?cursor=3&tail=25")) return Response.json({ commandId: "cmd_test", stdout: "ready\n", stderr: "", cursor: 4, tail: 25 });
      if (String(url).endsWith("/commands")) return Response.json(init?.method === "POST" ? { command } : { commands: [command] });
      return Response.json({ command });
    }
  });

  await client.startCommand("sbx_test", { command: "npm run dev", cwd: "/workspace/app", env: { NODE_ENV: "dev" }, timeoutMs: 30_000, detached: true });
  await client.listCommands("sbx_test");
  await client.getCommand("sbx_test", "cmd_test");
  await client.getCommandLogs("sbx_test", "cmd_test", { cursor: 3, tail: 25 });
  await client.killCommand("sbx_test", "cmd_test");

  assert.deepEqual(calls.map((call) => [call.method, call.url]), [
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/commands"],
    ["GET", "http://harakiri.local/v1/sandboxes/sbx_test/commands"],
    ["GET", "http://harakiri.local/v1/sandboxes/sbx_test/commands/cmd_test"],
    ["GET", "http://harakiri.local/v1/sandboxes/sbx_test/commands/cmd_test/logs?cursor=3&tail=25"],
    ["DELETE", "http://harakiri.local/v1/sandboxes/sbx_test/commands/cmd_test"]
  ]);
  assert.deepEqual(JSON.parse(calls[0].body ?? "{}"), {
    command: "npm run dev",
    cwd: "/workspace/app",
    env: { NODE_ENV: "dev" },
    timeoutMs: 30_000,
    detached: true
  });
});

test("HarakiriClient exposes persistent command session helpers", async () => {
  const calls: Array<{ method: string; url: string; body: string | null }> = [];
  const session = {
    id: "ses_test",
    sandboxId: "sbx_test",
    provider: "opensandbox",
    cwd: "/workspace",
    status: "running"
  };
  const result = {
    sandboxId: "sbx_test",
    command: "pwd",
    stdout: "/workspace\n",
    stderr: "",
    exitCode: 0,
    durationMs: 5
  };
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push({ method: init?.method ?? "GET", url: String(url), body: String(init?.body ?? "") });
      if (String(url).endsWith("/run")) return Response.json({ result });
      return Response.json({ session });
    }
  });

  await client.commands.sessions.create("sbx_test", { cwd: "/workspace" });
  await client.commands.sessions.run("sbx_test", "ses_test", { command: "pwd", timeoutMs: 30_000 });
  await client.commands.sessions.delete("sbx_test", "ses_test");

  assert.deepEqual(calls.map((call) => [call.method, call.url]), [
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/command-sessions"],
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/command-sessions/ses_test/run"],
    ["DELETE", "http://harakiri.local/v1/sandboxes/sbx_test/command-sessions/ses_test"]
  ]);
  assert.deepEqual(JSON.parse(calls[0].body ?? "{}"), { cwd: "/workspace" });
  assert.deepEqual(JSON.parse(calls[1].body ?? "{}"), { command: "pwd", timeoutMs: 30_000 });
});

test("HarakiriClient creates terminal attach URL and Node WebSocket request headers", () => {
  const client = new HarakiriClient({
    apiUrl: "https://harakiri.local/",
    apiKey: "hk_live_test"
  });

  const request = client.terminal.attachRequest("sbx_test", {
    cwd: "/workspace",
    shell: "/bin/bash",
    env: { FOO: "bar", BAZ: "qux" },
    sessionName: "sdk-terminal",
    cols: 120,
    rows: 40,
    since: 8,
    pty: false
  });

  assert.deepEqual(request.headers, { "x-api-key": "hk_live_test" });
  const url = new URL(request.url);
  assert.equal(url.protocol, "wss:");
  assert.equal(url.pathname, "/v1/sandboxes/sbx_test/terminal/attach");
  assert.equal(url.searchParams.get("cwd"), "/workspace");
  assert.equal(url.searchParams.get("shell"), "/bin/bash");
  assert.deepEqual(url.searchParams.getAll("env"), ["FOO=bar", "BAZ=qux"]);
  assert.equal(url.searchParams.get("sessionName"), "sdk-terminal");
  assert.equal(url.searchParams.get("cols"), "120");
  assert.equal(url.searchParams.get("rows"), "40");
  assert.equal(url.searchParams.get("since"), "8");
  assert.equal(url.searchParams.get("pty"), "false");
});

test("HarakiriClient creates browser terminal attach tickets", async () => {
  const calls: Array<{ method: string; url: string }> = [];
  const client = new HarakiriClient({
    apiUrl: "https://harakiri.local/",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push({ method: init?.method ?? "GET", url: String(url) });
      return Response.json({
        ticket: "hat_test",
        expiresAt: "2026-06-02T12:00:00.000Z",
        attachUrl: "wss://harakiri.local/v1/sandboxes/sbx_test/terminal/attach?ticket=hat_test"
      });
    }
  });

  const ticket = await client.terminal.attachTicket("sbx_test");

  assert.deepEqual(calls, [{ method: "POST", url: "https://harakiri.local/v1/sandboxes/sbx_test/terminal/attach-ticket" }]);
  assert.equal(ticket.ticket, "hat_test");
  assert.equal(ticket.attachUrl, "wss://harakiri.local/v1/sandboxes/sbx_test/terminal/attach?ticket=hat_test");
});

test("HarakiriClient exposes OpenAPI-shaped sandbox runtime aliases", async () => {
  const calls: Array<{ method: string; url: string; body: string | null }> = [];
  const command = {
    id: "cmd_test",
    sandboxId: "sbx_test",
    provider: "opensandbox",
    providerCommandId: "provider_cmd",
    command: "npm run dev",
    status: "running",
    cwd: "/workspace/app",
    envKeys: [],
    timeoutMs: null,
    detached: true,
    stdout: "",
    stderr: "",
    exitCode: null,
    error: null,
    startedAt: "2026-05-29T00:00:00.000Z",
    finishedAt: null,
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z"
  };
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push({ method: init?.method ?? "GET", url: String(url), body: String(init?.body ?? "") });
      const path = String(url);
      if (path.endsWith("/run")) return Response.json({ result: { sandboxId: "sbx_test", command: "true", stdout: "", stderr: "", exitCode: 0, durationMs: 4 } });
      if (path.endsWith("/commands")) return Response.json({ command });
      if (path.endsWith("/egress")) return Response.json({ egress: { mode: "restricted", presets: [], rules: [], providerStatus: { available: true } } });
      return Response.json({ ok: true });
    }
  });

  await client.runSandboxCommand("sbx_test", { command: "true" });
  await client.createSandboxCommand("sbx_test", { command: "npm run dev", detached: true });
  await client.getSandboxEgress("sbx_test");
  await client.updateSandboxEgress("sbx_test", { mode: "restricted", allow: ["api.github.com"] });

  assert.deepEqual(calls.map((call) => [call.method, call.url]), [
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/run"],
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/commands"],
    ["GET", "http://harakiri.local/v1/sandboxes/sbx_test/egress"],
    ["PATCH", "http://harakiri.local/v1/sandboxes/sbx_test/egress"]
  ]);
});

test("HarakiriClient waits for tracked commands", async () => {
  const statuses = ["running", "succeeded"];
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async () => {
      const status = statuses.shift() ?? "succeeded";
      return Response.json({
        command: {
          id: "cmd_test",
          sandboxId: "sbx_test",
          provider: "opensandbox",
          providerCommandId: "provider_cmd",
          command: "npm test",
          status,
          cwd: "/workspace/app",
          envKeys: [],
          timeoutMs: 30000,
          detached: false,
          stdout: "",
          stderr: "",
          exitCode: status === "succeeded" ? 0 : null,
          error: null,
          startedAt: "2026-05-29T00:00:00.000Z",
          finishedAt: status === "succeeded" ? "2026-05-29T00:00:01.000Z" : null,
          createdAt: "2026-05-29T00:00:00.000Z",
          updatedAt: "2026-05-29T00:00:01.000Z"
        }
      });
    }
  });

  const result = await client.waitForCommand("sbx_test", "cmd_test", { intervalMs: 0 });
  assert.equal(result.command.status, "succeeded");
});

test("HarakiriClient fails fast when a tracked command reaches a terminal error", async () => {
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async () => Response.json({
      command: {
        id: "cmd_test",
        sandboxId: "sbx_test",
        provider: "opensandbox",
        providerCommandId: "provider_cmd",
        command: "npm test",
        status: "failed",
        cwd: "/workspace/app",
        envKeys: [],
        timeoutMs: 30000,
        detached: false,
        stdout: "",
        stderr: "boom",
        exitCode: 1,
        error: "boom",
        startedAt: "2026-05-29T00:00:00.000Z",
        finishedAt: "2026-05-29T00:00:01.000Z",
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:01.000Z"
      }
    })
  });

  await assert.rejects(
    () => client.waitForCommand("sbx_test", "cmd_test", { intervalMs: 0 }),
    /Command cmd_test reached failed before succeeding/
  );
});

test("HarakiriClient exposes typed wait timeouts", async () => {
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async () => Response.json({
      command: {
        id: "cmd_test",
        sandboxId: "sbx_test",
        provider: "opensandbox",
        providerCommandId: "provider_cmd",
        command: "npm test",
        status: "running",
        cwd: "/workspace/app",
        envKeys: [],
        timeoutMs: 30000,
        detached: false,
        stdout: "",
        stderr: "",
        exitCode: null,
        error: null,
        startedAt: "2026-05-29T00:00:00.000Z",
        finishedAt: null,
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:01.000Z"
      }
    })
  });

  await assert.rejects(() => client.waitForCommand("sbx_test", "cmd_test", { intervalMs: 0, timeoutMs: 0 }), (error) => {
    assert.ok(error instanceof HarakiriWaitTimeoutError);
    assert.equal(error.target, "command");
    assert.equal(error.id, "cmd_test");
    assert.equal(error.lastStatus, "running");
    return true;
  });
});

test("HarakiriClient exposes namespaced command, file, and route helpers", async () => {
  const calls: Array<{ method: string; url: string; body: string | null }> = [];
  const command = {
    id: "cmd_test",
    sandboxId: "sbx_test",
    provider: "opensandbox",
    providerCommandId: "provider_cmd",
    command: "npm run dev",
    status: "running",
    cwd: "/workspace/app",
    envKeys: [],
    timeoutMs: null,
    detached: true,
    stdout: "",
    stderr: "",
    exitCode: null,
    error: null,
    startedAt: "2026-05-29T00:00:00.000Z",
    finishedAt: null,
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z"
  };
  const route = {
    port: 3000,
    protocol: "http",
    accessMode: "public",
    accessHeaderName: null,
    tokenHint: null,
    labels: ["preview"],
    createdByUserId: "user_sdk",
    createdByLabel: "sdk@test.local",
    routeKey: "route_test",
    host: "route.example.test",
    url: "https://route.example.test",
    targetUrl: "http://sandbox:3000",
    state: "ready",
    provider: "dev",
    providerRouteId: null,
    createdAt: "2026-05-29T00:00:00.000Z",
    lastCheckedAt: null,
    lastUsedAt: null,
    terminatedAt: null
  };
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push({ method: init?.method ?? "GET", url: String(url), body: String(init?.body ?? "") });
      const path = String(url);
      if (path.endsWith("/commands")) return Response.json(init?.method === "POST" ? { command } : { commands: [command] });
      if (path.endsWith("/commands/cmd_test/logs")) return Response.json({ commandId: "cmd_test", stdout: "ready\n", stderr: "" });
      if (path.includes("/files/read")) return Response.json({ path: "/workspace/app.py", encoding: "utf8", content: "print('ok')\n" });
      if (path.includes("/files/download")) return Response.json({ path: "/workspace/app.py", contentBase64: "b2s=", sizeBytes: 2, sha256: "sha256:2689367b205c16ce32c97f1cee2bf971dbcb6b934306b9cdd75829e61e8c04ec" });
      if (path.includes("/files/upload")) return Response.json({ file: { path: "/workspace/app.py", name: "app.py", type: "file", size: 2 }, sizeBytes: 2, sha256: "sha256:2689367b205c16ce32c97f1cee2bf971dbcb6b934306b9cdd75829e61e8c04ec" });
      if (path.includes("/files/stat") || path.endsWith("/files") || path.includes("/files/rename") || path.includes("/files/mkdir")) {
        return Response.json({ file: { path: "/workspace/app.py", name: "app.py", type: "file", size: 12 } });
      }
      if (path.includes("/files?path=") && init?.method === "DELETE") return Response.json({ ok: true, path: "/workspace/app.py" });
      if (path.endsWith("/routes")) return Response.json(init?.method === "POST" ? { route } : { routes: [route] });
      if (path.endsWith("/routes/3000")) return Response.json({ route: { ...route, state: "terminated" } });
      return Response.json({ command });
    }
  });

  await client.commands.start("sbx_test", { command: "npm run dev", detached: true });
  await client.commands.list("sbx_test");
  await client.commands.get("sbx_test", "cmd_test");
  await client.commands.logs("sbx_test", "cmd_test");
  await client.commandLogs("sbx_test", "cmd_test");
  await client.commands.kill("sbx_test", "cmd_test");
  await client.files.stat("sbx_test", "/workspace/app.py");
  await client.files.read("sbx_test", "/workspace/app.py");
  await client.files.write("sbx_test", { path: "/workspace/app.py", content: "print('ok')\n" });
  await client.files.upload("sbx_test", { path: "/workspace/app.py", contentBase64: "b2s=", sizeBytes: 2 });
  await client.files.download("sbx_test", "/workspace/app.py");
  await client.files.mkdir("sbx_test", { path: "/workspace" });
  await client.files.rename("sbx_test", { fromPath: "/workspace/app.py", toPath: "/workspace/main.py" });
  await client.files.remove("sbx_test", "/workspace/main.py");
  await client.routes.expose("sbx_test", { port: 3000, labels: ["preview"] });
  await client.routes.list("sbx_test");
  await client.routes.getHost("sbx_test", 3000);
  await client.routes.delete("sbx_test", 3000);

  assert(calls.some((call) => call.url === "http://harakiri.local/v1/sandboxes/sbx_test/commands/cmd_test/logs"));
  assert(calls.some((call) => call.url === "http://harakiri.local/v1/sandboxes/sbx_test/files/stat?path=%2Fworkspace%2Fapp.py"));
  assert(calls.some((call) => call.method === "POST" && call.url === "http://harakiri.local/v1/sandboxes/sbx_test/files/upload"));
  assert(calls.some((call) => call.url === "http://harakiri.local/v1/sandboxes/sbx_test/files/download?path=%2Fworkspace%2Fapp.py"));
  assert(calls.some((call) => call.method === "POST" && call.url === "http://harakiri.local/v1/sandboxes/sbx_test/routes"));
  const routeExposeCall = calls.find((call) => call.method === "POST" && call.url === "http://harakiri.local/v1/sandboxes/sbx_test/routes");
  assert.deepEqual(JSON.parse(routeExposeCall?.body ?? "{}"), { port: 3000, protocol: "http", accessMode: "public", labels: ["preview"] });
});

test("HarakiriClient exposes sandbox file operation helpers", async () => {
  const calls: Array<{ method: string; url: string; body: string | null }> = [];
  const file = { path: "/workspace/file.txt", name: "file.txt", type: "file", size: 2 };
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push({ method: init?.method ?? "GET", url: String(url), body: String(init?.body ?? "") });
      if (String(url).includes("/files/read")) return Response.json({ path: "/workspace/file.txt", encoding: "utf8", content: "ok" });
      if (String(url).includes("/files/download")) return Response.json({ path: "/workspace/file.txt", contentBase64: "b2s=", sizeBytes: 2, sha256: "sha256:2689367b205c16ce32c97f1cee2bf971dbcb6b934306b9cdd75829e61e8c04ec" });
      if (String(url).includes("/files/upload")) return Response.json({ file, sizeBytes: 2, sha256: "sha256:2689367b205c16ce32c97f1cee2bf971dbcb6b934306b9cdd75829e61e8c04ec" });
      if (String(url).includes("/files?path=") && init?.method === "DELETE") return Response.json({ ok: true, path: "/workspace/file.txt" });
      return Response.json({ file });
    }
  });

  await client.statSandboxFile("sbx_test", "/workspace/file.txt");
  await client.readSandboxFile("sbx_test", "/workspace/file.txt");
  await client.writeSandboxFile("sbx_test", { path: "/workspace/file.txt", content: "ok", createParents: true });
  await client.uploadSandboxFile("sbx_test", { path: "/workspace/file.txt", contentBase64: "b2s=", sizeBytes: 2 });
  await client.downloadSandboxFile("sbx_test", "/workspace/file.txt");
  await client.mkdirSandboxFile("sbx_test", { path: "/workspace/src", recursive: true });
  await client.removeSandboxFile("sbx_test", "/workspace/file.txt", { recursive: false });
  await client.renameSandboxFile("sbx_test", { fromPath: "/workspace/file.txt", toPath: "/workspace/done.txt" });

  assert.deepEqual(calls.map((call) => [call.method, call.url]), [
    ["GET", "http://harakiri.local/v1/sandboxes/sbx_test/files/stat?path=%2Fworkspace%2Ffile.txt"],
    ["GET", "http://harakiri.local/v1/sandboxes/sbx_test/files/read?path=%2Fworkspace%2Ffile.txt"],
    ["PUT", "http://harakiri.local/v1/sandboxes/sbx_test/files"],
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/files/upload"],
    ["GET", "http://harakiri.local/v1/sandboxes/sbx_test/files/download?path=%2Fworkspace%2Ffile.txt"],
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/files/mkdir"],
    ["DELETE", "http://harakiri.local/v1/sandboxes/sbx_test/files?path=%2Fworkspace%2Ffile.txt&recursive=false"],
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/files/rename"]
  ]);
  assert.deepEqual(JSON.parse(calls[2].body ?? "{}"), { path: "/workspace/file.txt", content: "ok", createParents: true });
  assert.deepEqual(JSON.parse(calls[3].body ?? "{}"), { path: "/workspace/file.txt", contentBase64: "b2s=", sizeBytes: 2 });
});

test("HarakiriClient waits for sandbox readiness", async () => {
  const statuses = ["pending", "running"];
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async () => Response.json({
      sandbox: {
        id: "sbx_wait",
        name: "wait",
        template: "python-3.12",
        status: statuses.shift() ?? "running"
      }
    })
  });

  const result = await client.waitForSandbox("sbx_wait", { intervalMs: 1, timeoutMs: 100 });

  assert.equal(result.sandbox.status, "running");
});

test("HarakiriClient exposes developer-facing outbound access aliases", async () => {
  const calls: Array<{ method: string; url: string; body: string | null }> = [];
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push({ method: init?.method ?? "GET", url: String(url), body: String(init?.body ?? "") });
      return Response.json({ egress: { mode: "restricted", rules: [], presets: [], providerStatus: null, updatedAt: "now" } });
    }
  });

  await client.getOutboundAccess("sbx_test");
  await client.setOutboundAccess("sbx_test", { mode: "restricted" });
  await client.allowDomains("sbx_test", ["api.github.com"]);
  await client.denyDomains("sbx_test", ["example.com"]);
  await client.blockOutboundAccess("sbx_test");
  await client.testOutboundAccess("sbx_test", "https://api.github.com");

  assert.deepEqual(calls.map((call) => [call.method, call.url]), [
    ["GET", "http://harakiri.local/v1/sandboxes/sbx_test/egress"],
    ["PATCH", "http://harakiri.local/v1/sandboxes/sbx_test/egress"],
    ["PATCH", "http://harakiri.local/v1/sandboxes/sbx_test/egress"],
    ["PATCH", "http://harakiri.local/v1/sandboxes/sbx_test/egress"],
    ["PATCH", "http://harakiri.local/v1/sandboxes/sbx_test/egress"],
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/egress/test"]
  ]);
  assert.deepEqual(JSON.parse(calls[2].body ?? "{}"), { allow: ["api.github.com"] });
  assert.deepEqual(JSON.parse(calls[5].body ?? "{}"), { target: "https://api.github.com" });
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
