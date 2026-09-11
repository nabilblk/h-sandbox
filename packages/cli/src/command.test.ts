import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { WebSocketServer } from "ws";
import { credentialProviderPresetCatalog } from "@h-sandbox/sdk";

type RecordedRequest = {
  method: string;
  path: string;
  headers: IncomingMessage["headers"];
  body: unknown;
};

type MockApi = {
  url: string;
  requests: RecordedRequest[];
  close: () => Promise<void>;
};

const cliPath = fileURLToPath(new URL("./index.ts", import.meta.url));
const packageRoot = dirname(dirname(cliPath));
const tsxImport = import.meta.resolve("tsx");

const readBody = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : undefined;
};

const startMockApi = async (handler: (request: RecordedRequest) => { status?: number; body?: unknown; stream?: string; keepOpen?: boolean }) => {
  const requests: RecordedRequest[] = [];
  const server = createServer(async (request, response) => {
    const recorded = {
      method: request.method ?? "GET",
      path: request.url ?? "/",
      headers: request.headers,
      body: await readBody(request)
    };
    requests.push(recorded);
    const result = handler(recorded);
    response.statusCode = result.status ?? 200;
    if (result.stream !== undefined) {
      response.setHeader("content-type", "text/event-stream");
      if (result.keepOpen) response.write(result.stream); else response.end(result.stream);
      return;
    }
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(result.body ?? {}));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  } satisfies MockApi;
};

const startMockWebSocketApi = async (
  handler: (request: IncomingMessage) => { messages?: unknown[]; closeCode?: number; closeReason?: string }
) => {
  const requests: Array<{ path: string; apiKey: string | undefined }> = [];
  const server = createServer();
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    requests.push({ path: request.url ?? "/", apiKey: request.headers["x-api-key"] as string | undefined });
    wss.handleUpgrade(request, socket, head, (ws) => {
      const result = handler(request);
      for (const message of result.messages ?? []) ws.send(JSON.stringify(message));
      ws.close(result.closeCode ?? 1000, result.closeReason ?? "done");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((resolve, reject) => {
      wss.close();
      server.close((error) => error ? reject(error) : resolve());
    })
  };
};

const runCli = async (args: string[], options: { api: { url: string }; cwd?: string; env?: Record<string, string | undefined>; savedConfig?: { apiUrl: string; apiKey?: string }; input?: string; signalOnOutput?: string }) => {
  const home = await mkdtemp(join(tmpdir(), "harakiri-cli-home-"));
  if (options.savedConfig) {
    await mkdir(join(home, ".config", "harakiri"), { recursive: true });
    await writeFile(join(home, ".config", "harakiri", "config.json"), JSON.stringify(options.savedConfig));
  }
  const child = spawn(process.execPath, ["--import", tsxImport, cliPath, ...args], {
    cwd: options.cwd ?? packageRoot,
    env: {
      ...process.env,
      HOME: home,
      HARAKIRI_API_URL: options.api.url,
      HARAKIRI_API_KEY: "hk_test_cli",
      NO_COLOR: "1",
      ...(options.env ?? {})
    },
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"]
  });
  if (options.input !== undefined) child.stdin.end(options.input);
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let signaled = false;
  child.stdout.on("data", (chunk) => {
    stdoutChunks.push(Buffer.from(chunk));
    if (!signaled && options.signalOnOutput && Buffer.concat(stdoutChunks).toString().includes(options.signalOnOutput)) {
      signaled = true; child.kill("SIGINT");
    }
  });
  child.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
  const exitCode = await new Promise<number | null>((resolve) => child.on("close", resolve));
  return {
    home,
    exitCode,
    stdout: Buffer.concat(stdoutChunks).toString("utf8"),
    stderr: Buffer.concat(stderrChunks).toString("utf8")
  };
};

const buildRow = (overrides: Record<string, unknown>) => ({
  id: "bld_payload",
  organizationId: "org_cli",
  templateId: "open-agents-dev",
  status: "queued",
  sourceType: "dockerfile",
  contextHash: null,
  dockerfilePath: "Containerfile",
  imageDestination: null,
  imageDigest: null,
  logRef: null,
  error: null,
  metadata: {},
  createdAt: "2026-05-24T00:00:00.000Z",
  updatedAt: "2026-05-24T00:00:00.000Z",
  ...overrides
});

const assertCreateBody = (actual: unknown, expected: Record<string, unknown>) => {
  assert.ok(actual && typeof actual === "object");
  const { idempotencyKey, ...body } = actual as Record<string, unknown>;
  assert.equal(typeof idempotencyKey, "string");
  assert.match(String(idempotencyKey), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual(body, expected);
};

test("CLI capacity prints known counts, unknown state and machine-readable data", async () => {
  const capacity = { state: "enforced", limit: 2, revision: 1, inUse: 2, available: 0, overLimit: 0,
    breakdown: { active: 1, reserved: 0, releasing: 0, uncertain: 1 }, observedAt: new Date().toISOString() };
  let body: unknown = { capacity };
  const api = await startMockApi((request) => { assert.equal(request.path, "/v1/org/capacity"); return { body }; });
  try {
    const text = await runCli(["capacity"], { api });
    assert.equal(text.exitCode, 0);
    assert.match(text.stdout, /In use: 2/);
    assert.match(text.stdout, /Uncertain: 1/);
    assert.match(text.stdout, /administrator/);
    const json = await runCli(["capacity", "--json"], { api });
    assert.deepEqual(JSON.parse(json.stdout), body);
    body = { capacity: { ...capacity, state: "reconciling", inUse: null, available: null, breakdown: null } };
    const unknown = await runCli(["capacity"], { api });
    assert.match(unknown.stdout, /In use: unknown/);
    assert.match(unknown.stdout, /operator verifies/);
  } finally { await api.close(); }
});

test("CLI create and resume propagate stable request keys and never hot-retry a conflict", async () => {
  const api = await startMockApi(() => ({ status: 409, body: { error: "organization_capacity_exceeded", message: "No execution slots available" } }));
  try {
    const create = await runCli(["create", "--template", "python-3.12", "--idempotency-key", "create-key"], { api });
    assert.equal(create.exitCode, 1);
    assert.match(create.stderr, /organization_capacity_exceeded: No execution slots available/);
    assert.match(create.stderr, /request key=create-key/);
    assert.equal((api.requests[0].body as { idempotencyKey: string }).idempotencyKey, "create-key");
    const resume = await runCli(["resume", "sbx_example", "--idempotency-key", "resume-key", "--json"], { api });
    assert.equal(resume.exitCode, 1);
    assert.equal(api.requests[1].headers["idempotency-key"], "resume-key");
    const errorLine = resume.stderr.split("\n").find((line) => line.startsWith("{"));
    assert.ok(errorLine);
    assert.deepEqual(JSON.parse(errorLine), { error: "organization_capacity_exceeded", message: "No execution slots available", status: 409 });
    assert.equal(api.requests.length, 2);
    assert.doesNotMatch(create.stdout, /request key=|organization_capacity_exceeded/);
    assert.equal(resume.stdout, "");
  } finally { await api.close(); }
});

test("CLI version matches its package metadata without calling the API", async () => {
  const api = await startMockApi(() => ({ status: 500 }));
  try {
    const result = await runCli(["--version"], { api });
    const metadata = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout.trim(), metadata.version);
    assert.equal(api.requests.length, 0);
  } finally {
    await api.close();
  }
});

test("workspace CLI preserves public IDs and requires retained-storage acknowledgement", async () => {
  const api = await startMockApi(() => ({ body: { workspace: { id: "wsp_cli", status: "archived" } } }));
  try {
    const created = await runCli(["workspace", "create", "--name", "Agent files"], { api });
    assert.equal(created.exitCode, 0);
    assert.deepEqual(api.requests[0].body, { name: "Agent files" });
    const refused = await runCli(["workspace", "archive", "wsp_cli"], { api });
    assert.notEqual(refused.exitCode, 0);
    assert.equal(api.requests.length, 1);
    const archived = await runCli(["workspace", "archive", "wsp_cli", "--retain-storage"], { api });
    assert.equal(archived.exitCode, 0);
    assert.match(archived.stdout, /storage retained/);
    assert.equal(api.requests[1].path, "/v1/workspaces/wsp_cli/archive");
  } finally { await api.close(); }
});

test("command follow returns the command exit status and sends only authenticated GET", async () => {
  const cursor = "v1:cmd_cli:p:2";
  const event = { type: "complete", commandId: "cmd_cli", cursor, status: "failed", exitCode: 7 };
  const api = await startMockApi(() => ({ stream: `id: ${cursor}\nevent: complete\ndata: ${JSON.stringify(event)}\n\n` }));
  try {
    const result = await runCli(["command", "follow", "sbx_cli", "cmd_cli", "--cursor", cursor, "--json"], { api });
    assert.equal(result.exitCode, 7);
    assert.equal(JSON.parse(result.stdout).exitCode, 7);
    assert.equal(api.requests.length, 1);
    assert.equal(api.requests[0].method, "GET");
    assert.equal(api.requests[0].headers["x-api-key"], "hk_test_cli");
    assert.equal(new URL(api.requests[0].path, api.url).searchParams.get("cursor"), cursor);
  } finally { await api.close(); }
});

test("command run --follow --json keeps progress on stderr and emits only JSON events", async () => {
  const cursor = "v1:cmd_cli:p:2";
  const event = { type: "complete", commandId: "cmd_cli", cursor, status: "succeeded", exitCode: 0 };
  const api = await startMockApi((request) => request.method === "POST"
    ? { status: 201, body: { command: { id: "cmd_cli", status: "running" } } }
    : { stream: `id: ${cursor}\nevent: complete\ndata: ${JSON.stringify(event)}\n\n` });
  try {
    const result = await runCli(["command", "run", "sbx_cli", "--cmd", "echo ok", "--follow", "--json"], { api });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.deepEqual(result.stdout.trim().split("\n").map((line) => JSON.parse(line)), [event]);
    assert.match(result.stderr, /command=cmd_cli/);
    assert.deepEqual(api.requests.map((request) => request.method), ["POST", "GET"]);
    assert.deepEqual(api.requests[0].body, { command: "echo ok", detached: true });
  } finally { await api.close(); }
});

test("CLI environment overrides saved credentials and origin without rewriting config", async () => {
  const api = await startMockApi(() => ({ body: { workspaces: [] } }));
  const savedConfig = { apiUrl: "http://127.0.0.1:1", apiKey: "hk_stale" };
  try {
    const result = await runCli(["workspace", "list", "--json"], { api, savedConfig });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(api.requests[0].headers["x-api-key"], "hk_test_cli");
    assert.deepEqual(JSON.parse(await readFile(join(result.home, ".config", "harakiri", "config.json"), "utf8")), savedConfig);
  } finally { await api.close(); }
});

test("CLI still uses saved credentials when environment overrides are absent", async () => {
  const api = await startMockApi(() => ({ body: { workspaces: [] } }));
  try {
    const result = await runCli(["workspace", "list", "--json"], {
      api, savedConfig: { apiUrl: api.url, apiKey: "hk_saved" },
      env: { HARAKIRI_API_URL: undefined, HARAKIRI_API_KEY: undefined }
    });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(api.requests[0].headers["x-api-key"], "hk_saved");
  } finally { await api.close(); }
});

test("Ctrl-C closes a command viewer with a resume cursor and never kills the command", { timeout: 10000 }, async () => {
  const cursor = "v1:cmd_cli:p:1";
  const event = { type: "output", commandId: "cmd_cli", cursor, stdout: "tick\n", stderr: "" };
  const api = await startMockApi(() => ({ stream: `id: ${cursor}\nevent: output\ndata: ${JSON.stringify(event)}\n\n`, keepOpen: true }));
  try {
    const result = await runCli(["command", "follow", "sbx_cli", "cmd_cli"], { api, signalOnOutput: "tick" });
    assert.equal(result.exitCode, 130);
    assert.match(result.stderr, /was not cancelled/);
    assert.ok(result.stderr.includes(`--cursor ${cursor}`));
    assert.deepEqual(api.requests.map((request) => request.method), ["GET"]);
  } finally { await api.close(); }
});

test("template init writes a Harakiri config with runtime metadata", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "harakiri-cli-init-"));
  const api = await startMockApi(() => ({ status: 500, body: { error: "init should not call api" } }));
  try {
    const result = await runCli([
      "template",
      "init",
      "--name",
      "Browser Agent",
      "--description",
      "Browser automation runtime.",
      "--id",
      "browser-agent",
      "--dockerfile",
      "Containerfile",
      "--visibility",
      "internal",
      "--cpu-count",
      "4",
      "--memory-mb",
      "4096",
      "--workdir",
      "/workspace",
      "--port",
      "3000",
      "--port",
      "5173",
      "--tag",
      "custom",
      "--tag",
      "hot",
      "--alias",
      "agents/browser",
      "--runtime-family",
      "browser",
      "--start-command",
      "sleep 3600",
      "--ready-command",
      "test -d /workspace",
      "--credential-slot",
      "openai",
      "--optional-credential-slot",
      "github"
    ], { api, cwd });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /wrote .*harakiri\.toml/);
    assert.match(result.stdout, /next: harakiri template build --name browser-agent \./);
    assert.match(result.stdout, /smoke: harakiri template smoke browser-agent/);
    assert.equal(api.requests.length, 0);
    const contents = await readFile(join(cwd, "harakiri.toml"), "utf8");
    assert.match(contents, /harakiri template build --name browser-agent \./);
    assert.match(contents, /name = "Browser Agent"/);
    assert.match(contents, /id = "browser-agent"/);
    assert.match(contents, /description = "Browser automation runtime\."/);
    assert.match(contents, /dockerfile = "Containerfile"/);
    assert.match(contents, /visibility = "internal"/);
    assert.match(contents, /runtime_family = "browser"/);
    assert.match(contents, /cpu_count = 4/);
    assert.match(contents, /memory_mb = 4096/);
    assert.match(contents, /ports = \[3000, 5173\]/);
    assert.match(contents, /tags = \["custom", "hot"\]/);
    assert.match(contents, /aliases = \["agents\/browser"\]/);
    assert.match(contents, /ready_command = "test -d \/workspace"/);
    assert.match(contents, /credential_slots = \["openai"\]/);
    assert.match(contents, /optional_credential_slots = \["github"\]/);
  } finally {
    await api.close();
  }
});

test("login command stores API config without calling the API", async () => {
  const api = await startMockApi(() => ({ status: 500, body: { error: "login should not call api" } }));
  try {
    const result = await runCli(["login", "--api-url", "http://harakiri.test", "--api-key", "hk_login"], { api });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /saved config at/);
    assert.equal(api.requests.length, 0);
    const config = JSON.parse(await readFile(join(result.home, ".config", "harakiri", "config.json"), "utf8"));
    assert.deepEqual(config, { apiUrl: "http://harakiri.test", apiKey: "hk_login" });
  } finally {
    await api.close();
  }
});


test("CLI formats structured API errors from shared envelopes", async () => {
  const api = await startMockApi(() => ({
    status: 409,
    body: { error: "template_not_ready", message: "template is still building" }
  }));
  try {
    const result = await runCli(["list"], { api });
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, /Harakiri API 409: template_not_ready: template is still building/);
  } finally {
    await api.close();
  }
});

test("capabilities command prints runtime provider capability states", async () => {
  const api = await startMockApi((request) => {
    assert.equal(request.method, "GET");
    assert.equal(request.path, "/v1/runtime/capabilities");
    return {
      body: {
        provider: "opensandbox",
        generatedAt: "2026-05-29T00:00:00.000Z",
        capabilities: [
          { name: "commands", state: "available", contract: "opensandbox_spec", source: "OpenSandbox execd tracked command API", required: true, reason: null },
          { name: "egressPolicy", state: "unavailable", contract: "unavailable", source: "mutable egress policy is not exposed by this provider", required: true, reason: "mutable egress policy is not exposed by this provider" }
        ]
      }
    };
  });
  try {
    const result = await runCli(["capabilities"], { api });
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /provider\topensandbox/);
    assert.match(result.stdout, /commands\tavailable\topensandbox_spec\tyes\tOpenSandbox execd tracked command API\t-/);
    assert.match(result.stdout, /egressPolicy\tunavailable\tunavailable\tyes\tmutable egress policy is not exposed by this provider\tmutable egress policy is not exposed by this provider/);
  } finally {
    await api.close();
  }
});

test("status command prints lifecycle metadata and supports JSON", async () => {
  const sandbox = {
    id: "sbx_life",
    opensandboxId: "osbx_life",
    name: "lifecycle-test",
    template: "python-3.12-data",
    status: "running",
    cpu: 4,
    mem: 128,
    started: "00h 01m",
    owner: "cli@test.local",
    cost: 0,
    ttlSeconds: 600,
    expiresAt: "2026-06-04T12:10:00.000Z",
    publicUrl: null,
    templateVersionId: "tplv_python",
    templateImageDigest: "sha256:test",
    egressPolicy: null,
    source: null,
    createdAt: "2026-06-04T12:00:00.000Z",
    runtimeMetadata: {
      workdir: "/workspace",
      user: "root",
      shell: "/bin/sh",
      template: {
        id: "python-3.12-data",
        versionId: "tplv_python",
        imageDigest: "sha256:test",
        runtimeFamily: "python-data"
      },
      ports: {
        default: [3000],
        exposed: []
      },
      routes: {
        mode: "opensandbox-gateway",
        baseDomain: "sandbox.localhost",
        publicScheme: "https",
        defaultAccessMode: "public",
        maxRoutesPerSandbox: 8,
        maxRoutesPerOrg: 200
      },
      egress: {
        mode: "open",
        presets: [],
        allow: [],
        deny: [],
        ruleCount: 0
      },
      limits: {
        fileArtifactMaxBytes: 16777216,
        commandTimeoutMs: 30000,
        terminalAttachTicketTtlSeconds: 60
      },
      lifecycle: {
        ttlSeconds: 600,
        expiresAt: "2026-06-04T12:10:00.000Z",
        createdAt: "2026-06-04T12:00:00.000Z"
      },
      provider: {
        kind: "opensandbox",
        sandboxId: "osbx_life",
        capabilities: [
          { name: "lifecycleRenew", state: "available", contract: "opensandbox_spec", source: "OpenSandbox renew API", required: true, reason: null },
          { name: "lifecycleSnapshot", state: "available", contract: "opensandbox_spec", source: "OpenSandbox snapshot API persisted by Harakiri snapshot IDs", required: false, reason: null }
        ]
      }
    }
  };
  const api = await startMockApi((request) => {
    assert.equal(request.method, "GET");
    assert.equal(request.path, "/v1/sandboxes/sbx_life");
    return { body: { sandbox } };
  });
  try {
    const text = await runCli(["status", "sbx_life"], { api });
    assert.equal(text.exitCode, 0, text.stderr);
    assert.match(text.stdout, /created-at\t2026-06-04T12:00:00.000Z/);
    assert.match(text.stdout, /expires-at\t2026-06-04T12:10:00.000Z/);
    assert.match(text.stdout, /provider-sandbox\tosbx_life/);
    assert.match(text.stdout, /capability.lifecycleRenew\tavailable\topensandbox_spec\t-/);
    assert.match(text.stdout, /capability.lifecycleSnapshot\tavailable\topensandbox_spec\t-/);

    const json = await runCli(["status", "sbx_life", "--json"], { api });
    assert.equal(json.exitCode, 0, json.stderr);
    assert.equal(JSON.parse(json.stdout).sandbox.runtimeMetadata.lifecycle.ttlSeconds, 600);
  } finally {
    await api.close();
  }
});

test("create command can restore from a snapshot", async () => {
  const api = await startMockApi((request) => {
    if (request.method === "POST" && request.path === "/v1/sandboxes") {
      return {
        status: 201,
        body: {
          sandbox: {
            id: "sbx_restore",
            name: "restored",
            template: "python-3.12-data",
            status: "running"
          }
        }
      };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const result = await runCli(["create", "--snapshot", "snp_ready", "--name", "restored"], { api });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /sbx_restore/);
    assertCreateBody(api.requests[0]?.body, {
      snapshotId: "snp_ready",
      name: "restored",
      ttlSeconds: 300,
      env: {}
    });
  } finally {
    await api.close();
  }
});

test("snapshot commands create, list, inspect, and delete snapshots", async () => {
  const snapshot = {
    id: "snp_cli",
    sourceSandboxId: "sbx_cli",
    name: "checkpoint",
    status: "ready",
    statusReason: null,
    statusMessage: null,
    template: "python-3.12-data",
    templateVersionId: null,
    templateImageDigest: null,
    createdByUserId: "user_cli",
    createdByLabel: "cli@test.local",
    metadata: {},
    providerState: {},
    expiresAt: null,
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    deletedAt: null
  };
  const api = await startMockApi((request) => {
    if (request.method === "POST" && request.path === "/v1/sandboxes/sbx_cli/snapshots") {
      return { status: 201, body: { snapshot, status: "created" } };
    }
    if (request.method === "GET" && request.path === "/v1/snapshots?status=ready&sandboxId=sbx_cli") {
      return { body: { snapshots: [snapshot], page: { total: 1, limit: 100, offset: 0 } } };
    }
    if (request.method === "GET" && request.path === "/v1/snapshots/snp_cli") return { body: { snapshot } };
    if (request.method === "DELETE" && request.path === "/v1/snapshots/snp_cli") return { body: { ok: true } };
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const created = await runCli(["snapshot", "sbx_cli", "--name", "checkpoint"], { api });
    assert.equal(created.exitCode, 0, created.stderr);
    assert.match(created.stdout, /snp_cli\tready\tpython-3\.12-data\tsbx_cli\tcheckpoint/);

    const listed = await runCli(["snapshots", "list", "--status", "ready", "--sandbox", "sbx_cli"], { api });
    assert.equal(listed.exitCode, 0, listed.stderr);
    assert.match(listed.stdout, /id\tstatus\ttemplate\tsource-sandbox\tname\tcreated-at/);

    const inspected = await runCli(["snapshots", "inspect", "snp_cli", "--json"], { api });
    assert.equal(inspected.exitCode, 0, inspected.stderr);
    assert.equal(JSON.parse(inspected.stdout).snapshot.id, "snp_cli");

    const deleted = await runCli(["snapshots", "delete", "snp_cli"], { api });
    assert.equal(deleted.exitCode, 0, deleted.stderr);
    assert.match(deleted.stdout, /snapshot deleted/);
  } finally {
    await api.close();
  }
});

test("tracked process commands can start, wait, tail, and print JSON", async () => {
  const command = {
    id: "cmd_cli",
    sandboxId: "sbx_cli",
    provider: "opensandbox",
    providerCommandId: "provider_cmd",
    command: "python -m http.server 3000 --bind 0.0.0.0",
    status: "running",
    cwd: "/workspace",
    envKeys: [],
    timeoutMs: null,
    detached: true,
    stdout: "",
    stderr: "",
    exitCode: null,
    finishReason: null,
    signal: null,
    error: null,
    startedAt: "2026-06-04T12:00:00.000Z",
    finishedAt: null,
    createdAt: "2026-06-04T12:00:00.000Z",
    updatedAt: "2026-06-04T12:00:00.000Z"
  };
  const api = await startMockApi((request) => {
    if (request.method === "POST" && request.path === "/v1/sandboxes/sbx_cli/commands") {
      return { status: 201, body: { command } };
    }
    if (request.method === "GET" && request.path === "/v1/sandboxes/sbx_cli/commands/cmd_cli") {
      return { body: { command } };
    }
    if (request.method === "GET" && request.path === "/v1/sandboxes/sbx_cli/commands/cmd_cli/logs?tail=5") {
      return { body: { commandId: "cmd_cli", stdout: "ready\n", stderr: "", cursor: 2, tail: 5, stdoutTruncated: false, stderrTruncated: false } };
    }
    if (request.method === "DELETE" && request.path === "/v1/sandboxes/sbx_cli/commands/cmd_cli") {
      return { body: { command: { ...command, status: "killed", exitCode: 130, finishReason: "killed", signal: "SIGINT" } } };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const started = await runCli(["process", "run", "sbx_cli", "--cmd", command.command, "--detached", "--json"], { api });
    assert.equal(started.exitCode, 0, started.stderr);
    assert.equal(JSON.parse(started.stdout).command.id, "cmd_cli");

    const waited = await runCli(["command", "wait", "sbx_cli", "cmd_cli", "--status", "running"], { api });
    assert.equal(waited.exitCode, 0, waited.stderr);
    assert.match(waited.stdout, /cmd_cli\trunning\tdetached/);

    const tailed = await runCli(["command", "tail", "sbx_cli", "cmd_cli", "--lines", "5"], { api });
    assert.equal(tailed.exitCode, 0, tailed.stderr);
    assert.match(tailed.stdout, /ready/);

    const killed = await runCli(["command", "kill", "sbx_cli", "cmd_cli", "--json"], { api });
    assert.equal(killed.exitCode, 0, killed.stderr);
    assert.equal(JSON.parse(killed.stdout).command.finishReason, "killed");
  } finally {
    await api.close();
  }
});

test("command session subcommands create, run, and delete persistent sessions", async () => {
  const api = await startMockApi((request) => {
    if (request.method === "POST" && request.path === "/v1/sandboxes/sbx_cli/command-sessions") {
      return {
        status: 201,
        body: {
          session: { id: "ses_cli", sandboxId: "sbx_cli", provider: "opensandbox", cwd: "/workspace", status: "running" }
        }
      };
    }
    if (request.method === "POST" && request.path === "/v1/sandboxes/sbx_cli/command-sessions/ses_cli/run") {
      return {
        body: {
          result: { sandboxId: "sbx_cli", command: "pwd", stdout: "/workspace\n", stderr: "", exitCode: 0, durationMs: 6 }
        }
      };
    }
    if (request.method === "DELETE" && request.path === "/v1/sandboxes/sbx_cli/command-sessions/ses_cli") {
      return {
        body: {
          session: { id: "ses_cli", sandboxId: "sbx_cli", provider: "opensandbox", cwd: null, status: "closed" }
        }
      };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const created = await runCli(["command", "session", "create", "sbx_cli", "--cwd", "/workspace"], { api });
    assert.equal(created.exitCode, 0, created.stderr);
    assert.match(created.stdout, /^ses_cli/m);
    assert.match(created.stdout, /cwd=\/workspace/);

    const run = await runCli(["command", "session", "run", "sbx_cli", "ses_cli", "--cmd", "pwd", "--timeout-ms", "30000"], { api });
    assert.equal(run.exitCode, 0, run.stderr);
    assert.match(run.stdout, /\/workspace/);
    assert.match(run.stdout, /runtime=0\.01s/);

    const deleted = await runCli(["command", "session", "delete", "sbx_cli", "ses_cli"], { api });
    assert.equal(deleted.exitCode, 0, deleted.stderr);
    assert.match(deleted.stdout, /ses_cli closed/);

    assert.deepEqual(api.requests.map((request) => [request.method, request.path]), [
      ["POST", "/v1/sandboxes/sbx_cli/command-sessions"],
      ["POST", "/v1/sandboxes/sbx_cli/command-sessions/ses_cli/run"],
      ["DELETE", "/v1/sandboxes/sbx_cli/command-sessions/ses_cli"]
    ]);
    assert.deepEqual(api.requests[0]?.body, { cwd: "/workspace" });
    assert.deepEqual(api.requests[1]?.body, { command: "pwd", timeoutMs: 30_000 });
  } finally {
    await api.close();
  }
});

test("attach command sends terminal options and prints API error frames", async () => {
  const api = await startMockWebSocketApi(() => ({
    messages: [{ error: "runtime_terminal_unsupported", message: "OpenSandbox PTY does not support per-attach environment variables yet." }],
    closeCode: 1011,
    closeReason: "runtime_terminal_unsupported"
  }));
  try {
    const result = await runCli([
      "attach",
      "sbx_cli",
      "--cwd",
      "/workspace",
      "--shell",
      "/bin/zsh",
      "--env",
      "FOO=bar",
      "--env",
      "BAZ=qux",
      "--session-name",
      "cli-attach",
      "--cols",
      "120",
      "--rows",
      "40",
      "--since",
      "8",
      "--no-raw"
    ], { api });

    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /harakiri attach: runtime_terminal_unsupported: OpenSandbox PTY does not support per-attach environment variables yet\./);
    assert.equal(api.requests.length, 1);
    assert.equal(api.requests[0]?.apiKey, "hk_test_cli");
    const url = new URL(api.requests[0]?.path ?? "/", "http://harakiri.test");
    assert.equal(url.pathname, "/v1/sandboxes/sbx_cli/terminal/attach");
    assert.equal(url.searchParams.get("cwd"), "/workspace");
    assert.equal(url.searchParams.get("shell"), "/bin/zsh");
    assert.deepEqual(url.searchParams.getAll("env"), ["FOO=bar", "BAZ=qux"]);
    assert.equal(url.searchParams.get("sessionName"), "cli-attach");
    assert.equal(url.searchParams.get("cols"), "120");
    assert.equal(url.searchParams.get("rows"), "40");
    assert.equal(url.searchParams.get("since"), "8");
  } finally {
    await api.close();
  }
});

test("attach command exits cleanly after a connected terminal closes", async () => {
  const api = await startMockWebSocketApi(() => ({
    messages: [{ type: "connected", session_id: "pty_cli", mode: "pty" }],
    closeCode: 1000,
    closeReason: "provider closed"
  }));
  try {
    const result = await runCli(["attach", "sbx_cli", "--no-raw"], { api });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(api.requests.length, 1);
  } finally {
    await api.close();
  }
});

test("attach command fails if the terminal closes before it is ready", async () => {
  const api = await startMockWebSocketApi(() => ({
    closeCode: 1000,
    closeReason: "not ready"
  }));
  try {
    const result = await runCli(["attach", "sbx_cli", "--no-raw"], { api });

    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /connection closed before the terminal was ready: not ready/);
    assert.equal(api.requests.length, 1);
  } finally {
    await api.close();
  }
});

test("template build sends config-derived create, build, and context payloads", async () => {
  const context = await mkdtemp(join(tmpdir(), "harakiri-cli-context-"));
  await writeFile(join(context, "Containerfile"), "FROM ubuntu:24.04\nCMD [\"sleep\", \"3600\"]\n");
  await writeFile(join(context, "agent.py"), "print('ok')\n");
  await writeFile(join(context, "harakiri.toml"), `
name = "Open Agents Dev"
dockerfile = "Containerfile"
visibility = "internal"
cpu_count = 4
memory_mb = 4096
workdir = "/workspace"
ports = [3000, 8000]
aliases = ["agents/open-agents-dev"]
tags = ["custom", "hot"]
start_command = "python -m http.server \\"8000\\""
credential_slots = ["openai", "github"]
optional_credential_slots = ["npm"]
`);

  const api = await startMockApi((request) => {
    if (request.method === "POST" && request.path === "/v1/templates") {
      return { status: 201, body: { template: { id: "open-agents-dev" } } };
    }
    if (request.method === "POST" && request.path === "/v1/templates/open-agents-dev/builds") {
      return { status: 201, body: { build: buildRow({}) } };
    }
    if (request.method === "POST" && request.path === "/v1/template-builds/bld_payload/context") {
      return {
        body: {
          context: {
            buildId: "bld_payload",
            sha256: "sha256:abc",
            sizeBytes: 123,
            format: "tar+gzip",
            fileCount: 3,
            uploadedAt: "2026-05-24T00:00:00.000Z"
          }
        }
      };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const result = await runCli(["template", "build", context, "--no-wait"], { api });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /bld_payload/);

    const create = api.requests.find((request) => request.path === "/v1/templates");
    assert.deepEqual(create?.body, {
      id: "open-agents-dev",
      name: "Open Agents Dev",
      image: "ubuntu:24.04",
      aliases: ["Open Agents Dev", "agents/open-agents-dev"],
      visibility: "internal",
      defaultEntrypoint: ["python", "-m", "http.server", "8000"],
      cpuCount: 4,
      memoryMb: 4096,
      defaultPorts: [3000, 8000],
      workdir: "/workspace",
      runtimeFamily: "custom",
      tags: ["custom", "hot"],
      credentialSlots: [
        { providerPresetId: "openai", required: true },
        { providerPresetId: "github", required: true },
        { providerPresetId: "npm", required: false }
      ]
    });

    const build = api.requests.find((request) => request.path === "/v1/templates/open-agents-dev/builds");
    assert.deepEqual(build?.body, {
      sourceType: "dockerfile",
      dockerfilePath: "Containerfile",
      metadata: {
        localPath: context,
        templateConfig: {
          name: "Open Agents Dev",
          dockerfile: "Containerfile",
          visibility: "internal",
          cpuCount: 4,
          memoryMb: 4096,
          workdir: "/workspace",
          ports: [3000, 8000],
          aliases: ["agents/open-agents-dev"],
          tags: ["custom", "hot"],
          startCommand: "python -m http.server \"8000\"",
          credentialSlots: [
            { providerPresetId: "openai", required: true },
            { providerPresetId: "github", required: true },
            { providerPresetId: "npm", required: false }
          ]
        }
      }
    });

    const upload = api.requests.find((request) => request.path === "/v1/template-builds/bld_payload/context");
    assert.equal(typeof (upload?.body as { archiveBase64?: unknown }).archiveBase64, "string");
    assert.match((upload?.body as { sha256: string }).sha256, /^sha256:[a-f0-9]{64}$/);
    assert.equal((upload?.body as { format: string }).format, "tar+gzip");
    assert.deepEqual((upload?.body as { metadata: unknown }).metadata, {
      localPath: context,
      dockerfilePath: "Containerfile"
    });
  } finally {
    await api.close();
  }
});

test("template command help includes documented workflow examples", async () => {
  const api = await startMockApi(() => ({ status: 500, body: { error: "help should not call api" } }));
  try {
    const templateHelp = await runCli(["template", "--help"], { api });
    assert.equal(templateHelp.exitCode, 0, templateHelp.stderr);
    assert.match(templateHelp.stdout, /harakiri template init --name open-agents-dev --dockerfile Dockerfile/);
    assert.match(templateHelp.stdout, /harakiri template build --name open-agents-dev \./);
    assert.match(templateHelp.stdout, /harakiri template builds --query open-agents-dev/);
    assert.match(templateHelp.stdout, /harakiri template promote open-agents-dev --version-id tplv_\.\.\. --alias stable/);
    assert.equal(api.requests.length, 0);

    const buildHelp = await runCli(["template", "build", "--help"], { api });
    assert.equal(buildHelp.exitCode, 0, buildHelp.stderr);
    assert.match(buildHelp.stdout, /harakiri template build --name open-agents-dev examples\/templates\/open-agents-dev/);
    assert.match(buildHelp.stdout, /harakiri template build --name ubuntu-import --source image --image ubuntu:24\.04/);
    assert.match(buildHelp.stdout, /harakiri template build --name open-agents-dev \. --no-wait/);
    assert.equal(api.requests.length, 0);
  } finally {
    await api.close();
  }
});

test("create command sends repeated env flags in the sandbox payload", async () => {
  const api = await startMockApi((request) => {
    if (request.method === "POST" && request.path === "/v1/sandboxes") {
      return {
        status: 201,
        body: {
          sandbox: {
            id: "sbx_env",
            name: "env-runner",
            template: "python-3.12-data"
          }
        }
      };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const result = await runCli([
      "create",
      "--template",
      "python-3.12-data",
      "--name",
      "env-runner",
      "--ttl",
      "120",
      "--env",
      "HARAKIRI_ENV_SMOKE=env-ok",
      "--env",
      "EMPTY_VALUE="
    ], { api });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /sbx_env/);
    assertCreateBody(api.requests[0]?.body, {
      template: "python-3.12-data",
      name: "env-runner",
      ttlSeconds: 120,
      env: {
        HARAKIRI_ENV_SMOKE: "env-ok",
        EMPTY_VALUE: ""
      }
    });
  } finally {
    await api.close();
  }
});

test("create command sends create-time credentials without printing secrets", async () => {
  const attachment = {
    id: "sca_create_cli",
    sandboxId: "sbx_create_vault",
    displayName: "openai",
    sourceType: "inline_ephemeral",
    sourceRef: null,
    credentialName: "cred_openai",
    bindingName: "bind_openai",
    match: { hosts: ["api.openai.com"], methods: ["GET"], paths: ["/v1/*"] },
    auth: { type: "bearer" },
    fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
    status: "injected",
    provider: "opensandbox",
    providerRevision: 1,
    providerMetadata: {},
    lastError: null,
    injectedAt: "2026-09-03T00:00:00.000Z",
    detachedAt: null,
    createdByUserId: "user_cli",
    createdByLabel: "cli@test.local",
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z"
  };
  const api = await startMockApi((request) => {
    if (request.method === "POST" && request.path === "/v1/sandboxes") {
      return {
        status: 201,
        body: {
          sandbox: {
            id: "sbx_create_vault",
            name: "vault-runner",
            template: "python-3.12-data",
            status: "running"
          },
          credentialAttachments: [attachment]
        }
      };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const result = await runCli([
      "create",
      "--template",
      "python-3.12-data",
      "--name",
      "vault-runner",
      "--credential",
      "name=openai,host=api.openai.com,auth=bearer,method=get,path=/v1/*,from-env=OPENAI_API_KEY,fake-env=OPENAI_API_KEY=fake-openai-key"
    ], { api, env: { OPENAI_API_KEY: "sk_create_cli_secret" } });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /sbx_create_vault/);
    assert.match(result.stdout, /credentials injected\. count=1/);
    assert.equal(`${result.stdout}${result.stderr}`.includes("sk_create_cli_secret"), false);
    assertCreateBody(api.requests[0]?.body, {
      template: "python-3.12-data",
      name: "vault-runner",
      ttlSeconds: 300,
      env: {},
      credentials: [{
        displayName: "openai",
        value: "sk_create_cli_secret",
        fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
        binding: {
          match: {
            hosts: ["api.openai.com"],
            methods: ["GET"],
            paths: ["/v1/*"]
          },
          auth: { type: "bearer" }
        }
      }]
    });
  } finally {
    await api.close();
  }
});

test("create command sends create-time stored credential references", async () => {
  const attachment = {
    id: "sca_create_stored_cli",
    sandboxId: "sbx_create_stored",
    displayName: "openai-prod",
    sourceType: "harakiri_encrypted",
    sourceRef: "vlt_openai",
    credentialName: "openai-vlt_openai",
    bindingName: "openai-api-vlt_openai",
    match: { hosts: ["api.openai.com"], methods: ["GET"], paths: ["/v1/*"] },
    auth: { type: "bearer" },
    fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
    status: "injected",
    provider: "opensandbox",
    providerRevision: 1,
    providerMetadata: {},
    lastError: null,
    injectedAt: "2026-09-03T00:00:00.000Z",
    detachedAt: null,
    createdByUserId: "user_cli",
    createdByLabel: "cli@test.local",
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z"
  };
  const api = await startMockApi((request) => {
    if (request.method === "POST" && request.path === "/v1/sandboxes") {
      return {
        status: 201,
        body: {
          sandbox: {
            id: "sbx_create_stored",
            name: "stored-vault-runner",
            template: "open-agents-dev",
            status: "running"
          },
          credentialAttachments: [attachment]
        }
      };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const result = await runCli([
      "create",
      "--template",
      "open-agents-dev",
      "--name",
      "stored-vault-runner",
      "--credential",
      "secret-id=vlt_openai,name=openai-prod"
    ], { api });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /sbx_create_stored/);
    assert.match(result.stdout, /credentials injected\. count=1/);
    assertCreateBody(api.requests[0]?.body, {
      template: "open-agents-dev",
      name: "stored-vault-runner",
      ttlSeconds: 300,
      env: {},
      credentials: [{
        sourceType: "harakiri_encrypted",
        secretId: "vlt_openai",
        displayName: "openai-prod"
      }]
    });
  } finally {
    await api.close();
  }
});

test("create command sends template slot credential mappings", async () => {
  const api = await startMockApi((request) => {
    if (request.method === "POST" && request.path === "/v1/sandboxes") {
      return {
        status: 201,
        body: {
          sandbox: {
            id: "sbx_slot_vault",
            name: "slot-vault-runner",
            template: "open-agents-dev",
            status: "running"
          },
          credentialAttachments: []
        }
      };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const result = await runCli([
      "create",
      "--template",
      "open-agents-dev",
      "--name",
      "slot-vault-runner",
      "--credential",
      "slot=llm,secret-id=vlt_openai,name=openai-prod"
    ], { api });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /sbx_slot_vault/);
    assertCreateBody(api.requests[0]?.body, {
      template: "open-agents-dev",
      name: "slot-vault-runner",
      ttlSeconds: 300,
      env: {},
      credentialMappings: [{
        slotId: "llm",
        source: {
          sourceType: "harakiri_encrypted",
          secretId: "vlt_openai",
          displayName: "openai-prod"
        }
      }]
    });
  } finally {
    await api.close();
  }
});

test("create command expands provider preset credentials", async () => {
  const api = await startMockApi((request) => {
    if (request.method === "POST" && request.path === "/v1/sandboxes") {
      return {
        status: 201,
        body: {
          sandbox: {
            id: "sbx_preset_vault",
            name: "preset-vault",
            template: "open-agents-dev",
            status: "running"
          },
          credentialAttachments: []
        }
      };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const result = await runCli([
      "create",
      "--template",
      "open-agents-dev",
      "--name",
      "preset-vault",
      "--credential",
      "preset=openai,from-env=OPENAI_API_KEY"
    ], { api, env: { OPENAI_API_KEY: "sk_create_preset_secret" } });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(`${result.stdout}${result.stderr}`.includes("sk_create_preset_secret"), false);
    assertCreateBody(api.requests[0]?.body, {
      template: "open-agents-dev",
      name: "preset-vault",
      ttlSeconds: 300,
      env: {},
      credentials: [{
        displayName: "OpenAI API",
        credentialName: "openai",
        value: "sk_create_preset_secret",
        fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
        binding: credentialProviderPresetCatalog.openai.binding
      }]
    });
  } finally {
    await api.close();
  }
});

test("create command rejects async create-time credentials before an API request", async () => {
  const api = await startMockApi(() => ({ status: 500, body: { error: "create should not call api" } }));
  try {
    const result = await runCli([
      "create",
      "--template",
      "python-3.12-data",
      "--no-wait",
      "--credential",
      "name=openai,host=api.openai.com,auth=bearer,from-env=OPENAI_API_KEY"
    ], { api });
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, /--credential requires waiting for sandbox readiness/);
    assert.equal(api.requests.length, 0);
  } finally {
    await api.close();
  }
});

test("create command reads one create-time credential from stdin", async () => {
  const api = await startMockApi((request) => {
    if (request.method === "POST" && request.path === "/v1/sandboxes") {
      return {
        status: 201,
        body: {
          sandbox: {
            id: "sbx_stdin_vault",
            name: "stdin-vault",
            template: "python-3.12-data",
            status: "running"
          }
        }
      };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const result = await runCli([
      "create",
      "--template",
      "python-3.12-data",
      "--name",
      "stdin-vault",
      "--credential",
      "name=private,host=api.internal.example,auth=api-key,header=x-api-key,from-stdin=true"
    ], { api, input: "secret-from-stdin\n" });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(`${result.stdout}${result.stderr}`.includes("secret-from-stdin"), false);
    assertCreateBody(api.requests[0]?.body, {
      template: "python-3.12-data",
      name: "stdin-vault",
      ttlSeconds: 300,
      env: {},
      credentials: [{
        displayName: "private",
        value: "secret-from-stdin",
        fakeEnv: {},
        binding: {
          match: { hosts: ["api.internal.example"] },
          auth: { type: "apiKey", name: "x-api-key" }
        }
      }]
    });
  } finally {
    await api.close();
  }
});

test("create command rejects credential prompts in non-interactive scripts", async () => {
  const api = await startMockApi(() => ({ status: 500, body: { error: "create should not call api" } }));
  try {
    const result = await runCli([
      "create",
      "--template",
      "python-3.12-data",
      "--credential",
      "name=private,host=api.internal.example,prompt=true"
    ], { api });
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, /--prompt requires an interactive TTY/);
    assert.equal(api.requests.length, 0);
  } finally {
    await api.close();
  }
});

test("create command bootstraps Git sources without sending secrets in command text", async () => {
  process.env.HARAKIRI_TEST_GIT_TOKEN = "ghp_cli_secret";
  const api = await startMockApi((request) => {
    if (request.method === "POST" && request.path === "/v1/sandboxes") {
      return {
        status: 201,
        body: {
          sandbox: {
            id: "sbx_git_cli",
            name: "git-runner",
            template: "open-agents-dev",
            status: "running"
          }
        }
      };
    }
    if (request.method === "POST" && request.path === "/v1/sandboxes/sbx_git_cli/run") {
      const body = request.body as { command: string };
      return {
        body: {
          result: {
            sandboxId: "sbx_git_cli",
            command: body.command,
            stdout: "",
            stderr: "",
            exitCode: 0,
            durationMs: 15
          }
        }
      };
    }
    if (request.method === "GET" && request.path === "/v1/sandboxes/sbx_git_cli") {
      return {
        body: {
          sandbox: {
            id: "sbx_git_cli",
            name: "git-runner",
            template: "open-agents-dev",
            status: "running"
          }
        }
      };
    }
    if (request.method === "PATCH" && request.path === "/v1/sandboxes/sbx_git_cli/source") {
      return {
        body: {
          sandbox: {
            id: "sbx_git_cli",
            name: "git-runner",
            template: "open-agents-dev",
            status: "running",
            source: (request.body as { source: unknown }).source
          }
        }
      };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const result = await runCli([
      "create",
      "--template",
      "open-agents-dev",
      "--name",
      "git-runner",
      "--git",
      "https://github.com/acme/project.git",
      "--git-branch",
      "main",
      "--git-path",
      "/workspace/project",
      "--git-token-env",
      "HARAKIRI_TEST_GIT_TOKEN"
    ], { api });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /sbx_git_cli/);
    assertCreateBody(api.requests[0]?.body, {
      template: "open-agents-dev",
      name: "git-runner",
      ttlSeconds: 300,
      env: {},
      source: {
        type: "git",
        url: "https://github.com/acme/project.git",
        branch: "main",
        targetPath: "/workspace/project",
        credentialPersistence: "one-shot"
      }
    });
    const runBody = api.requests.find((request) => request.path.endsWith("/run"))?.body as {
      command: string;
      env: Record<string, string>;
      metadata: Record<string, unknown>;
    };
    assert.equal(runBody.command.includes("$HARAKIRI_GIT_TOKEN"), true);
    assert.equal(runBody.command.includes("ghp_cli_secret"), false);
    assert.equal(runBody.command.includes("'https://github.com/acme/project.git'"), true);
    assert.deepEqual(runBody.env, {
      HARAKIRI_GIT_USERNAME: "x-access-token",
      HARAKIRI_GIT_TOKEN: "ghp_cli_secret"
    });
    assert.deepEqual(runBody.metadata, {
      capability: "git",
      operation: "clone",
      repositoryUrl: "https://github.com/acme/project.git",
      targetPath: "/workspace/project",
      branch: "main",
      credentialPersistence: "one-shot",
      hasCredentials: true
    });
    const sourceUpdates = api.requests.filter((request) => request.path.endsWith("/source"));
    assert.equal(sourceUpdates.length, 2);
    assert.equal(JSON.stringify(sourceUpdates).includes("ghp_cli_secret"), false);
  } finally {
    delete process.env.HARAKIRI_TEST_GIT_TOKEN;
    await api.close();
  }
});

test("git commands print template guidance when the sandbox image lacks git", async () => {
  const api = await startMockApi((request) => {
    if (request.method === "POST" && request.path === "/v1/sandboxes/sbx_no_git/run") {
      return {
        body: {
          result: {
            sandboxId: "sbx_no_git",
            command: (request.body as { command: string }).command,
            stdout: "",
            stderr: "git binary not found in sandbox image\n",
            exitCode: 127,
            durationMs: 5
          }
        }
      };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const result = await runCli(["git", "status", "sbx_no_git", "--cwd", "/workspace/project"], { api });
    assert.equal(result.exitCode, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /HarakiriGitUnsupportedRuntimeError|git binary not found/);
    assert.match(result.stderr, /open-agents-dev/);
  } finally {
    await api.close();
  }
});

test("git commands print outbound access guidance when the repository is unreachable", async () => {
  const api = await startMockApi((request) => {
    if (request.method === "POST" && request.path === "/v1/sandboxes/sbx_git_net/run") {
      return {
        body: {
          result: {
            sandboxId: "sbx_git_net",
            command: (request.body as { command: string }).command,
            stdout: "",
            stderr: "fatal: unable to access 'https://github.com/acme/project.git/': Could not resolve host: github.com\n",
            exitCode: 128,
            durationMs: 8
          }
        }
      };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const result = await runCli(["git", "pull", "sbx_git_net", "--cwd", "/workspace/project", "--branch", "main"], { api });
    assert.equal(result.exitCode, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /HarakiriGitNetworkAccessError|could not reach/);
    assert.match(result.stderr, /git-hosting/);
    assert.match(result.stderr, /github\.com/);
  } finally {
    await api.close();
  }
});

test("create command supports no-wait pending sandbox responses", async () => {
  const api = await startMockApi((request) => {
    if (request.method === "POST" && request.path === "/v1/sandboxes") {
      return {
        status: 202,
        body: {
          sandbox: {
            id: "sbx_pending",
            name: "async-runner",
            template: "python-3.12-data",
            status: "pending"
          },
          operation: {
            id: "op_pending",
            state: "queued"
          },
          status: "pending",
          message: "sandbox provision queued"
        }
      };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const result = await runCli([
      "create",
      "--template",
      "python-3.12-data",
      "--name",
      "async-runner",
      "--no-wait"
    ], { api });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /sbx_pending/);
    assert.match(result.stdout, /queued\. id=sbx_pending operation=op_pending/);
    assertCreateBody(api.requests[0]?.body, {
      template: "python-3.12-data",
      name: "async-runner",
      ttlSeconds: 300,
      env: {},
      wait: false
    });
  } finally {
    await api.close();
  }
});

test("template build --source image sends image import payload and skips context upload", async () => {
  const api = await startMockApi((request) => {
    if (request.method === "POST" && request.path === "/v1/templates") {
      return { status: 201, body: { template: { id: "ubuntu-import" } } };
    }
    if (request.method === "POST" && request.path === "/v1/templates/ubuntu-import/builds") {
      return {
        status: 201,
        body: { build: buildRow({ id: "bld_image", templateId: "ubuntu-import", sourceType: "image", dockerfilePath: "Dockerfile", imageDestination: "ubuntu:24.04" }) }
      };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const result = await runCli(["template", "build", "--name", "ubuntu-import", "--source", "image", "--image", "ubuntu:24.04", "--no-wait"], { api });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /bld_image/);
    assert.equal(api.requests.length, 2);
    assert.deepEqual(api.requests[1].body, {
      sourceType: "image",
      dockerfilePath: "Dockerfile",
      imageDestination: "ubuntu:24.04",
      metadata: { localPath: ".", templateConfig: {} }
    });
  } finally {
    await api.close();
  }
});

test("template build failure streams retained logs and exits with useful message", async () => {
  const api = await startMockApi((request) => {
    if (request.method === "POST" && request.path === "/v1/templates") return { status: 201, body: { template: { id: "failing" } } };
    if (request.method === "POST" && request.path === "/v1/templates/failing/builds") {
      return { status: 201, body: { build: buildRow({ id: "bld_fail", templateId: "failing", sourceType: "image", imageDestination: "registry.invalid/missing:latest" }) } };
    }
    if (request.method === "GET" && request.path === "/v1/template-builds/bld_fail/logs") {
      return {
        body: {
          logs: [
            { lineNo: 1, stream: "stdout", message: "resolving registry.invalid/missing:latest", createdAt: "2026-05-24T00:00:00.000Z" },
            { lineNo: 2, stream: "stderr", message: "manifest missing", createdAt: "2026-05-24T00:00:01.000Z" }
          ]
        }
      };
    }
    if (request.method === "GET" && request.path === "/v1/template-builds/bld_fail") {
      return {
        body: {
          build: buildRow({
            id: "bld_fail",
            templateId: "failing",
            status: "failed",
            sourceType: "image",
            imageDestination: "registry.invalid/missing:latest",
            error: "registry missing",
            completedAt: "2026-05-24T00:00:02.000Z"
          })
        }
      };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const result = await runCli([
      "template",
      "build",
      "--name",
      "failing",
      "--source",
      "image",
      "--image",
      "registry.invalid/missing:latest",
      "--poll-interval-ms",
      "1",
      "--timeout",
      "5"
    ], { api });
    assert.equal(result.exitCode, 1);
    assert.match(result.stdout, /   resolving registry\.invalid\/missing:latest/);
    assert.match(result.stdout, /!! manifest missing/);
    assert.match(result.stdout, /-> failed\. build=bld_fail/);
    assert.match(result.stderr, /template build bld_fail failed: registry missing/);
  } finally {
    await api.close();
  }
});

test("template smoke creates a temporary sandbox and runs ready_command", async () => {
  const context = await mkdtemp(join(tmpdir(), "harakiri-cli-smoke-"));
  await writeFile(join(context, "harakiri.toml"), `
name = "Smoke Template"
workdir = "/workspace"
ready_command = "python --version"
`);
  const api = await startMockApi((request) => {
    if (request.method === "POST" && request.path === "/v1/sandboxes") {
      return {
        status: 202,
        body: {
          sandbox: { id: "sbx_smoke", name: "smoke", template: "python-3.12", status: "pending" },
          operation: { id: "op_smoke", sandboxId: "sbx_smoke", kind: "provision", state: "queued", error: null, attempts: 0, createdAt: "now", updatedAt: "now" },
          status: "pending"
        }
      };
    }
    if (request.method === "GET" && request.path === "/v1/sandboxes/sbx_smoke") {
      return { body: { sandbox: { id: "sbx_smoke", name: "smoke", template: "python-3.12", status: "running" } } };
    }
    if (request.method === "POST" && request.path === "/v1/sandboxes/sbx_smoke/run") {
      return { body: { result: { sandboxId: "sbx_smoke", command: "python --version", stdout: "Python 3.12.0\n", stderr: "", exitCode: 0, durationMs: 12 } } };
    }
    if (request.method === "DELETE" && request.path === "/v1/sandboxes/sbx_smoke") return { body: { ok: true } };
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const result = await runCli(["template", "smoke", "python-3.12", "--context", context], { api });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /Python 3\.12\.0/);

    const create = api.requests.find((request) => request.method === "POST" && request.path === "/v1/sandboxes");
    assertCreateBody(create?.body, {
      template: "python-3.12",
      name: "smoke-python-3.12",
      ttlSeconds: 300,
      env: {},
      wait: false
    });
    const run = api.requests.find((request) => request.method === "POST" && request.path === "/v1/sandboxes/sbx_smoke/run");
    assert.deepEqual(run?.body, {
      command: "python --version",
      cwd: "/workspace",
      timeoutMs: 120000
    });
    assert(api.requests.some((request) => request.method === "DELETE" && request.path === "/v1/sandboxes/sbx_smoke"));
  } finally {
    await api.close();
  }
});

test("template logs command prints retained build log rows", async () => {
  const api = await startMockApi((request) => {
    if (request.method === "GET" && request.path === "/v1/template-builds/bld_logs/logs") {
      return {
        body: {
          logs: [
            { lineNo: 1, stream: "stdout", message: "layer pushed", createdAt: "2026-05-24T00:00:00.000Z" },
            { lineNo: 2, stream: "stderr", message: "warning", createdAt: "2026-05-24T00:00:01.000Z" }
          ]
        }
      };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const result = await runCli(["template", "logs", "bld_logs"], { api });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(result.stdout, "1\tstdout\tlayer pushed\n2\tstderr\twarning\n");
  } finally {
    await api.close();
  }
});

test("route commands expose and list sandbox routes", async () => {
  let apiUrl = "";
  const api = await startMockApi((request) => {
    if (request.method === "POST" && request.path === "/v1/sandboxes/sbx_route/routes") {
      return {
        body: {
          route: {
            id: "sbr_1",
            sandboxId: "sbx_route",
            port: 5173,
            protocol: "http",
            accessMode: request.body && typeof request.body === "object" && "accessMode" in request.body && request.body.accessMode === "token" ? "token" : "public",
            accessHeaderName: request.body && typeof request.body === "object" && "accessMode" in request.body && request.body.accessMode === "token" ? "x-harakiri-route-token" : null,
            tokenHint: request.body && typeof request.body === "object" && "accessMode" in request.body && request.body.accessMode === "token" ? "hrt_mock...oken" : null,
            labels: ["preview", "vite"],
            createdByUserId: "user_cli",
            createdByLabel: "cli@test.local",
            routeKey: "sbx-route-5173",
            host: "sbx-route-5173.sandbox.localhost",
            url: request.body && typeof request.body === "object" && "accessMode" in request.body && request.body.accessMode === "token" ? `${apiUrl}/v1/route-proxy/sbx-route-5173/` : "https://sbx-route-5173.sandbox.localhost",
            targetUrl: "http://sandbox:5173",
            state: "ready",
            provider: "opensandbox",
            providerRouteId: null,
            createdAt: "2026-05-24T00:00:00.000Z",
            lastCheckedAt: null,
            lastUsedAt: null,
            terminatedAt: null
          },
          ...(request.body && typeof request.body === "object" && "accessMode" in request.body && request.body.accessMode === "token"
            ? { accessToken: "hrt_mock_token", accessHeaderName: "x-harakiri-route-token" }
            : {})
        }
      };
    }
    if (request.method === "GET" && request.path === "/v1/sandboxes/sbx_route/routes") {
      return {
        body: {
          routes: [
            {
              id: "sbr_1",
              sandboxId: "sbx_route",
              port: 5173,
              protocol: "http",
            accessMode: "public",
            accessHeaderName: null,
              tokenHint: "hrt_abcd...wxyz",
              labels: ["preview", "vite"],
              createdByUserId: "user_cli",
              createdByLabel: "cli@test.local",
              routeKey: "sbx-route-5173",
              host: "sbx-route-5173.sandbox.localhost",
              url: "https://sbx-route-5173.sandbox.localhost",
              targetUrl: "http://sandbox:5173",
              state: "ready",
              provider: "opensandbox",
              providerRouteId: null,
              createdAt: "2026-05-24T00:00:00.000Z",
              lastCheckedAt: null,
              lastUsedAt: null,
              terminatedAt: null
            }
          ]
        }
      };
    }
    if (request.method === "GET" && request.path === "/v1/route-proxy/sbx-route-5173/route-health") {
      return { body: { ok: true } };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  apiUrl = api.url;
  try {
    const exposed = await runCli(["expose", "sbx_route", "--port", "5173", "--label", "preview", "--label", "vite"], { api });
    assert.equal(exposed.exitCode, 0, exposed.stderr);
    assert.match(exposed.stdout, /https:\/\/sbx-route-5173\.sandbox\.localhost/);
    assert.deepEqual(api.requests[0]?.body, { port: 5173, protocol: "http", accessMode: "public", labels: ["preview", "vite"] });

    const listed = await runCli(["routes", "sbx_route"], { api });
    assert.equal(listed.exitCode, 0, listed.stderr);
    assert.equal(listed.stdout, "5173\tready\tpublic\thrt_abcd...wxyz\topensandbox\tpreview,vite\thttps://sbx-route-5173.sandbox.localhost\n");

    const waited = await runCli(["expose", "sbx_route", "--port", "5173", "--access", "token", "--wait", "--wait-path", "/route-health", "--json"], { api });
    assert.equal(waited.exitCode, 0, waited.stderr);
    assert.equal(JSON.parse(waited.stdout).route.accessMode, "token");
    assert.match(waited.stdout, /"accessMode": "token"/);
    assert.match(waited.stdout, /"accessToken": "hrt_mock_token"/);
    assert.match(waited.stderr, /exposing port 5173/);
    const waitProbe = api.requests.find((request) => request.method === "GET" && request.path === "/v1/route-proxy/sbx-route-5173/route-health");
    assert.equal(waitProbe?.headers["x-harakiri-route-token"], "hrt_mock_token");
  } finally {
    await api.close();
  }
});

test("files command supports explicit sandbox paths", async () => {
  const api = await startMockApi((request) => {
    if (request.method === "GET" && request.path === "/v1/sandboxes/sbx_files/files?path=%2Fworkspace") {
      return {
        body: {
          cwd: "/workspace",
          files: [{ path: "/workspace/agent.py", name: "agent.py", type: "FILE", size: 42, modifiedAt: null }]
        }
      };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const result = await runCli(["files", "sbx_files", "--path", "/workspace"], { api });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(result.stdout, "FILE\t42\t/workspace/agent.py\n");
  } finally {
    await api.close();
  }
});

test("file operation commands call sandbox file endpoints", async () => {
  const okSha256 = "sha256:2689367b205c16ce32ed4200942b8b8b1e262dfc70d9bc9fbc77c49699a4f1df";
  const api = await startMockApi((request) => {
    if (request.method === "GET" && request.path === "/v1/sandboxes/sbx_files/files/read?path=%2Fworkspace%2Fagent.py&encoding=utf8") {
      return { body: { path: "/workspace/agent.py", encoding: "utf8", content: "print('ok')\n" } };
    }
    if (request.method === "PUT" && request.path === "/v1/sandboxes/sbx_files/files") {
      return { body: { file: { path: "/workspace/out.py", name: "out.py", type: "file", size: 2 } } };
    }
    if (request.method === "POST" && request.path === "/v1/sandboxes/sbx_files/files/upload") {
      return {
        body: {
          file: { path: "/workspace/upload.bin", name: "upload.bin", type: "file", size: 2 },
          sizeBytes: 2,
          sha256: okSha256,
          transfer: { mode: "json-base64", encoding: "base64", maxBytes: 16777216 }
        }
      };
    }
    if (request.method === "GET" && request.path === "/v1/sandboxes/sbx_files/files/download?path=%2Fworkspace%2Fupload.bin") {
      return {
        body: {
          path: "/workspace/upload.bin",
          contentBase64: "b2s=",
          sizeBytes: 2,
          sha256: okSha256,
          transfer: { mode: "json-base64", encoding: "base64", maxBytes: 16777216 }
        }
      };
    }
    if (request.method === "DELETE" && request.path === "/v1/sandboxes/sbx_files/files?path=%2Fworkspace%2Fout.py") {
      return { body: { ok: true, path: "/workspace/out.py" } };
    }
    return { status: 404, body: { error: "unexpected", path: request.path, method: request.method } };
  });
  try {
    const read = await runCli(["file-read", "sbx_files", "--path", "/workspace/agent.py"], { api });
    assert.equal(read.exitCode, 0, read.stderr);
    assert.equal(read.stdout, "print('ok')\n");

    const write = await runCli(["file-write", "sbx_files", "--path", "/workspace/out.py", "--content", "ok", "--parents"], { api });
    assert.equal(write.exitCode, 0, write.stderr);
    assert.equal(write.stdout, "file\t2\t/workspace/out.py\n");

    const dir = await mkdtemp(join(tmpdir(), "harakiri-cli-files-"));
    const uploadSource = join(dir, "upload.bin");
    const downloadTarget = join(dir, "download.bin");
    await writeFile(uploadSource, "ok");

    const upload = await runCli(["file-upload", "sbx_files", "--path", "/workspace/upload.bin", "--from", uploadSource, "--parents"], { api });
    assert.equal(upload.exitCode, 0, upload.stderr);
    assert.equal(upload.stdout, `file\t2\t${okSha256}\t/workspace/upload.bin\n`);
    const uploadRequest = api.requests.find((request) => request.method === "POST" && request.path === "/v1/sandboxes/sbx_files/files/upload");
    assert.deepEqual(uploadRequest?.body, {
      path: "/workspace/upload.bin",
      contentBase64: "b2s=",
      sizeBytes: 2,
      sha256: okSha256,
      createParents: true
    });

    const download = await runCli(["file-download", "sbx_files", "--path", "/workspace/upload.bin", "--to", downloadTarget], { api });
    assert.equal(download.exitCode, 0, download.stderr);
    assert.equal(download.stdout, `2\t${okSha256}\t${downloadTarget}\n`);
    assert.equal(await readFile(downloadTarget, "utf8"), "ok");

    const removed = await runCli(["file-rm", "sbx_files", "--path", "/workspace/out.py"], { api });
    assert.equal(removed.exitCode, 0, removed.stderr);
    assert.match(`${removed.stdout}${removed.stderr}`, /removed \/workspace\/out.py/);
  } finally {
    await api.close();
  }
});

test("vault commands list, attach, rehydrate, test, and detach sandbox credentials without printing secrets", async () => {
  const attachment = {
    id: "sca_cli",
    sandboxId: "sbx_vault",
    displayName: "openai",
    sourceType: "inline_ephemeral",
    sourceRef: null,
    credentialName: "cred_openai",
    bindingName: "bind_openai",
    match: { schemes: ["https"], hosts: ["api.openai.com"], methods: ["POST"] },
    auth: { type: "bearer" },
    fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
    status: "injected",
    provider: "opensandbox",
    providerRevision: 2,
    providerState: "present",
    providerCheckedAt: "2026-09-03T00:00:00.000Z",
    providerMetadata: {},
    sourceMetadata: {},
    expiresAt: null,
    refreshState: "not_applicable",
    refreshAttemptedAt: null,
    refreshedAt: null,
    lastError: null,
    injectedAt: "2026-09-03T00:00:00.000Z",
    detachedAt: null,
    createdByUserId: "user_cli",
    createdByLabel: "cli@test.local",
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z"
  };
  const api = await startMockApi((request) => {
    if (request.method === "GET" && request.path === "/v1/sandboxes/sbx_vault/credentials") {
      return { body: { attachments: [attachment] } };
    }
    if (request.method === "POST" && request.path === "/v1/sandboxes/sbx_vault/credentials/inspect") {
      return { body: { attachments: [attachment], vault: { revision: 2, credentials: [], bindings: [] } } };
    }
    if (request.method === "POST" && request.path === "/v1/sandboxes/sbx_vault/credentials") {
      const body = request.body as { sourceType?: string } | undefined;
      const attached = body?.sourceType === "harakiri_encrypted"
        ? {
            ...attachment,
            id: "sca_secret",
            displayName: "stored-openai",
            sourceType: "harakiri_encrypted",
            sourceRef: "vlt_openai"
          }
        : attachment;
      return { status: 201, body: { attachment: attached, vault: { revision: 2, credentials: [], bindings: [] } } };
    }
    if (request.method === "POST" && request.path === "/v1/sandboxes/sbx_vault/credentials/rehydrate") {
      return {
        body: {
          attachments: [{ ...attachment, status: "requires_reinjection" }],
          vault: null,
          rehydrated: 0,
          skipped: 1,
          failed: 0
        }
      };
    }
    if (request.method === "POST" && request.path === "/v1/sandboxes/sbx_vault/credentials/sca_cli/test") {
      return {
        body: {
          attachmentId: "sca_cli",
          target: "https://api.openai.com/v1/models",
          normalizedTarget: "api.openai.com",
          url: "https://api.openai.com/v1/models",
          method: "GET",
          ok: true,
          status: "reachable",
          httpStatus: 200,
          stdout: "http_status=200\n",
          stderr: "",
          durationMs: 16,
          checkedAt: "2026-09-03T00:00:00.000Z"
        }
      };
    }
    if (request.method === "DELETE" && request.path === "/v1/sandboxes/sbx_vault/credentials/sca_cli") {
      return { body: { attachment: { ...attachment, status: "detached" }, vault: null } };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const attached = await runCli([
      "vault",
      "attach",
      "sbx_vault",
      "--name",
      "openai",
      "--host",
      "api.openai.com",
      "--auth",
      "bearer",
      "--method",
      "post",
      "--fake-env",
      "OPENAI_API_KEY=fake-openai-key",
      "--from-env",
      "OPENAI_API_KEY"
    ], { api, env: { OPENAI_API_KEY: "sk_real_cli_secret" } });
    assert.equal(attached.exitCode, 0, attached.stderr);
    assert.match(attached.stdout, /sca_cli\tinjected\tpresent\topenai\tcred_openai\tbind_openai\tapi\.openai\.com\tOPENAI_API_KEY/);
    assert.equal(attached.stdout.includes("sk_real_cli_secret"), false);
    assert.deepEqual(api.requests[0]?.body, {
      displayName: "openai",
      value: "sk_real_cli_secret",
      fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
      binding: {
        match: { hosts: ["api.openai.com"], methods: ["POST"] },
        auth: { type: "bearer" }
      }
    });

    const stored = await runCli([
      "vault",
      "attach-secret",
      "sbx_vault",
      "vlt_openai",
      "--name",
      "stored-openai",
      "--binding-name",
      "openai-prod"
    ], { api });
    assert.equal(stored.exitCode, 0, stored.stderr);
    assert.match(stored.stdout, /sca_secret\tinjected\tpresent\tstored-openai/);
    assert.equal(stored.stdout.includes("sk_real_cli_secret"), false);
    const storedRequest = api.requests.find((request) =>
      request.method === "POST"
      && request.path === "/v1/sandboxes/sbx_vault/credentials"
      && (request.body as { sourceType?: string }).sourceType === "harakiri_encrypted"
    );
    assert.deepEqual(storedRequest?.body, {
      sourceType: "harakiri_encrypted",
      secretId: "vlt_openai",
      displayName: "stored-openai",
      bindingName: "openai-prod"
    });

    const listed = await runCli(["vault", "list", "sbx_vault"], { api });
    assert.equal(listed.exitCode, 0, listed.stderr);
    assert.match(listed.stdout, /id\tstatus\tprovider-state\tname\tcredential\tbinding\thosts\tfake-env/);
    assert.match(listed.stdout, /sca_cli\tinjected\tpresent/);

    const inspected = await runCli(["vault", "inspect", "sbx_vault"], { api });
    assert.equal(inspected.exitCode, 0, inspected.stderr);
    assert.match(inspected.stdout, /runtime vault inspected\. revision=2 missing=0/);
    assert.match(inspected.stdout, /sca_cli\tinjected\tpresent/);

    const rehydrated = await runCli(["vault", "rehydrate", "sbx_vault"], { api });
    assert.equal(rehydrated.exitCode, 0, rehydrated.stderr);
    assert.match(rehydrated.stdout, /credentials rehydrated\. restored=0 skipped=1 failed=0/);
    assert.match(rehydrated.stdout, /sca_cli\trequires_reinjection\tpresent/);
    assert.equal(rehydrated.stdout.includes("sk_real_cli_secret"), false);

    const tested = await runCli(["vault", "test", "sbx_vault", "sca_cli", "--target", "https://api.openai.com/v1/models"], { api });
    assert.equal(tested.exitCode, 0, tested.stderr);
    assert.equal(tested.stdout, "ok\treachable\tGET\t200\thttps://api.openai.com/v1/models\n");
    const testRequest = api.requests.find((request) => request.method === "POST" && request.path === "/v1/sandboxes/sbx_vault/credentials/sca_cli/test");
    assert.deepEqual(testRequest?.body, {
      target: "https://api.openai.com/v1/models"
    });

    const detached = await runCli(["vault", "detach", "sbx_vault", "sca_cli"], { api });
    assert.equal(detached.exitCode, 0, detached.stderr);
    assert.match(detached.stdout, /credential detached/);
    assert.match(detached.stdout, /sca_cli\tdetached\tpresent/);
  } finally {
    await api.close();
  }
});

test("vault audit lists filtered sanitized organization events", async () => {
  const api = await startMockApi((request) => {
    if (request.method === "GET" && request.path === "/v1/audit-events?targetType=sandbox&targetId=sbx_vault&actionPrefix=sandbox_credential.&limit=20&offset=0") {
      return {
        body: {
          events: [{
            id: "audit_cli",
            actorUserId: "user_cli",
            actorLabel: "cli@test.local",
            action: "sandbox_credential.attached",
            targetType: "sandbox",
            targetId: "sbx_vault",
            metadata: { sourceType: "harakiri_encrypted", token: "[redacted]" },
            createdAt: "2026-09-04T10:00:00.000Z"
          }],
          page: { total: 1, limit: 20, offset: 0 }
        }
      };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });

  try {
    const result = await runCli([
      "vault",
      "audit",
      "--target-type",
      "sandbox",
      "--target-id",
      "sbx_vault",
      "--action-prefix",
      "sandbox_credential.",
      "--limit",
      "20"
    ], { api });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /created\tactor\taction\ttarget-type\ttarget-id\tmetadata/);
    assert.match(result.stdout, /sandbox_credential\.attached\tsandbox\tsbx_vault/);
    assert.match(`${result.stdout}${result.stderr}`, /audit events 1\/1/);
    assert.equal(`${result.stdout}${result.stderr}`.includes("must-not-leak"), false);
  } finally {
    await api.close();
  }
});

test("vault preset commands list and inspect provider presets", async () => {
  const api = await startMockApi((request) => {
    if (request.method === "GET" && request.path === "/v1/credential-presets") {
      return { body: { presets: [credentialProviderPresetCatalog.openai, credentialProviderPresetCatalog.github] } };
    }
    if (request.method === "GET" && request.path === "/v1/credential-presets/openai") {
      return { body: { preset: credentialProviderPresetCatalog.openai } };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const listed = await runCli(["vault", "presets"], { api });
    assert.equal(listed.exitCode, 0, listed.stderr);
    assert.match(listed.stdout, /id\tcategory\tenv\tauth\thosts\ttest-target/);
    assert.match(listed.stdout, /openai\tmodel-api\tOPENAI_API_KEY\tbearer\tapi\.openai\.com/);

    const inspected = await runCli(["vault", "preset", "openai"], { api });
    assert.equal(inspected.exitCode, 0, inspected.stderr);
    assert.match(inspected.stdout, /OpenAI|openai/);

    assert.deepEqual(api.requests.map((request) => [request.method, request.path]), [
      ["GET", "/v1/credential-presets"],
      ["GET", "/v1/credential-presets/openai"]
    ]);
  } finally {
    await api.close();
  }
});

test("vault attach expands provider preset credentials", async () => {
  const attachment = {
    id: "sca_preset",
    sandboxId: "sbx_vault",
    displayName: "OpenAI API",
    sourceType: "inline_ephemeral",
    sourceRef: null,
    credentialName: "openai",
    bindingName: "openai-api",
    match: credentialProviderPresetCatalog.openai.binding.match,
    auth: credentialProviderPresetCatalog.openai.binding.auth,
    fakeEnv: credentialProviderPresetCatalog.openai.fakeEnv,
    status: "injected",
    provider: "opensandbox",
    providerRevision: 2,
    providerState: "present",
    providerCheckedAt: "2026-09-03T00:00:00.000Z",
    providerMetadata: {},
    lastError: null,
    injectedAt: "2026-09-03T00:00:00.000Z",
    detachedAt: null,
    createdByUserId: "user_cli",
    createdByLabel: "cli@test.local",
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z"
  };
  const api = await startMockApi((request) => {
    if (request.method === "POST" && request.path === "/v1/sandboxes/sbx_vault/credentials") {
      return { status: 201, body: { attachment, vault: { revision: 2, credentials: [], bindings: [] } } };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const result = await runCli([
      "vault",
      "attach",
      "sbx_vault",
      "--preset",
      "openai",
      "--from-env",
      "OPENAI_API_KEY"
    ], { api, env: { OPENAI_API_KEY: "sk_attach_preset_secret" } });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(`${result.stdout}${result.stderr}`.includes("sk_attach_preset_secret"), false);
    assert.deepEqual(api.requests[0]?.body, {
      displayName: "OpenAI API",
      credentialName: "openai",
      value: "sk_attach_preset_secret",
      fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
      binding: credentialProviderPresetCatalog.openai.binding
    });
  } finally {
    await api.close();
  }
});

test("vault secret commands manage workspace secrets without printing values", async () => {
  const secret = {
    id: "vlt_openai",
    name: "openai-prod",
    providerPresetId: "openai",
    sourceType: "harakiri_encrypted",
    status: "active",
    version: 1,
    usePolicy: "admins_only",
    usage: {
      activeSandboxCount: 2,
      attachmentCount: 4,
      lastAttachedAt: "2026-09-03T01:00:00.000Z"
    },
    fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
    binding: credentialProviderPresetCatalog.openai.binding,
    egressDomains: ["api.openai.com"],
    hasEncryptedSecret: true,
    metadata: {},
    createdByUserId: "user_cli",
    createdByLabel: "cli@test.local",
    rotatedAt: null,
    disabledAt: null,
    deletedAt: null,
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z"
  };
  const api = await startMockApi((request) => {
    if (request.method === "GET" && request.path === "/v1/credential-secrets") {
      return { body: { secrets: [secret] } };
    }
    if (request.method === "POST" && request.path === "/v1/credential-secrets") {
      return { status: 201, body: { secret } };
    }
    if (request.method === "PATCH" && request.path === "/v1/credential-secrets/vlt_openai") {
      const usePolicy = (request.body as { usePolicy?: string }).usePolicy;
      return { body: { secret: { ...secret, usePolicy } } };
    }
    if (request.method === "POST" && request.path === "/v1/credential-secrets/vlt_openai/rotate") {
      return { body: { secret: { ...secret, version: 2 } } };
    }
    if (request.method === "POST" && request.path === "/v1/credential-secrets/vlt_openai/disable") {
      return { body: { secret: { ...secret, status: "disabled" } } };
    }
    if (request.method === "POST" && request.path === "/v1/credential-secrets/vlt_openai/enable") {
      return { body: { secret } };
    }
    if (request.method === "DELETE" && request.path === "/v1/credential-secrets/vlt_openai") {
      return { body: { secret: { ...secret, status: "deleted", hasEncryptedSecret: false } } };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const listed = await runCli(["vault", "secrets", "list"], { api });
    assert.equal(listed.exitCode, 0, listed.stderr);
    assert.match(listed.stdout, /id\tstatus\tname\tprofile\tversion\tuse-policy\tactive-sandboxes\thas-secret\tfake-env\tegress-domains/);
    assert.match(listed.stdout, /vlt_openai\tactive\topenai-prod\topenai\t1\tadmins_only\t2\tyes\tOPENAI_API_KEY\tapi\.openai\.com/);

    const created = await runCli([
      "vault",
      "secrets",
      "create",
      "--name",
      "openai-prod",
      "--preset",
      "openai",
      "--from-env",
      "OPENAI_API_KEY",
      "--member-use"
    ], { api, env: { OPENAI_API_KEY: "sk_workspace_secret" } });
    assert.equal(created.exitCode, 0, created.stderr);
    assert.match(created.stdout, /credential secret created/);
    assert.equal(created.stdout.includes("sk_workspace_secret"), false);

    const customCreated = await runCli([
      "vault", "secrets", "create",
      "--name", "internal-api",
      "--host", "api.internal.example",
      "--auth", "api-key",
      "--header", "x-service-key",
      "--method", "GET",
      "--path", "/v1/*",
      "--env-name", "INTERNAL_API_KEY",
      "--test-path", "/health",
      "--from-env", "INTERNAL_API_KEY"
    ], { api, env: { INTERNAL_API_KEY: "private-api-secret" } });
    assert.equal(customCreated.exitCode, 0, customCreated.stderr);
    assert.equal(customCreated.stdout.includes("private-api-secret"), false);

    const shared = await runCli(["vault", "secrets", "share", "vlt_openai"], { api });
    const restricted = await runCli(["vault", "secrets", "restrict", "vlt_openai"], { api });
    assert.equal(shared.exitCode, 0, shared.stderr);
    assert.match(shared.stdout, /policy=organization_members/);
    assert.equal(restricted.exitCode, 0, restricted.stderr);
    assert.match(restricted.stdout, /policy=admins_only/);

    const rotated = await runCli(["vault", "secrets", "rotate", "vlt_openai", "--from-stdin"], {
      api,
      input: "sk_rotated_secret\n"
    });
    assert.equal(rotated.exitCode, 0, rotated.stderr);
    assert.match(rotated.stdout, /credential secret rotated\. version=2/);
    assert.equal(rotated.stdout.includes("sk_rotated_secret"), false);

    const disabled = await runCli(["vault", "secrets", "disable", "vlt_openai"], { api });
    const enabled = await runCli(["vault", "secrets", "enable", "vlt_openai"], { api });
    const deleted = await runCli(["vault", "secrets", "delete", "vlt_openai"], { api });
    assert.equal(disabled.exitCode, 0, disabled.stderr);
    assert.equal(enabled.exitCode, 0, enabled.stderr);
    assert.equal(deleted.exitCode, 0, deleted.stderr);

    assert.deepEqual(api.requests.map((request) => [request.method, request.path]), [
      ["GET", "/v1/credential-secrets"],
      ["POST", "/v1/credential-secrets"],
      ["POST", "/v1/credential-secrets"],
      ["PATCH", "/v1/credential-secrets/vlt_openai"],
      ["PATCH", "/v1/credential-secrets/vlt_openai"],
      ["POST", "/v1/credential-secrets/vlt_openai/rotate"],
      ["POST", "/v1/credential-secrets/vlt_openai/disable"],
      ["POST", "/v1/credential-secrets/vlt_openai/enable"],
      ["DELETE", "/v1/credential-secrets/vlt_openai"]
    ]);
    assert.deepEqual(api.requests[1]?.body, {
      name: "openai-prod",
      providerPresetId: "openai",
      value: "sk_workspace_secret",
      usePolicy: "organization_members",
      fakeEnv: {}
    });
    assert.deepEqual(api.requests[2]?.body, {
      name: "internal-api",
      providerPresetId: "custom",
      customProfile: {
        host: "api.internal.example",
        authType: "apiKey",
        headerName: "x-service-key",
        methods: ["GET"],
        paths: ["/v1/*"],
        envName: "INTERNAL_API_KEY",
        testPath: "/health"
      },
      value: "private-api-secret",
      usePolicy: "admins_only",
      fakeEnv: {}
    });
    assert.deepEqual(api.requests[3]?.body, { usePolicy: "organization_members" });
    assert.deepEqual(api.requests[4]?.body, { usePolicy: "admins_only" });
    assert.equal((api.requests[5]?.body as { value?: string }).value, "sk_rotated_secret");
  } finally {
    await api.close();
  }
});

test("vault external reference commands manage and attach Kubernetes Secret locators", async () => {
  const reference = {
    id: "xsr_openai",
    name: "openai-cluster",
    providerPresetId: "openai",
    sourceType: "external_ref",
    resolverType: "kubernetes_secret",
    reference: { namespace: "harakiri-security", name: "agent-credentials", key: "OPENAI_API_KEY" },
    status: "active",
    usePolicy: "organization_members",
    version: 1,
    fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
    binding: credentialProviderPresetCatalog.openai.binding,
    egressDomains: ["api.openai.com"],
    metadata: {},
    createdByUserId: "user_cli",
    createdByLabel: "cli@test.local",
    disabledAt: null,
    deletedAt: null,
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
    validation: { state: "valid", message: null, versionRef: "rv-42", checkedAt: "2026-09-03T00:00:00.000Z" },
    usage: { activeSandboxCount: 1, attachmentCount: 2, lastAttachedAt: "2026-09-03T00:00:00.000Z" },
    capabilities: {
      reusable: true,
      rehydratable: true,
      rotatable: false,
      externallyOwned: true,
      shortLived: false,
      launchOnly: false
    }
  };
  const attachment = {
    id: "sca_external",
    sandboxId: "sbx_vault",
    displayName: reference.name,
    sourceType: "external_ref",
    sourceRef: reference.id,
    credentialName: "openai-xsr_openai",
    bindingName: "openai-api-xsr_openai",
    match: credentialProviderPresetCatalog.openai.binding.match,
    auth: credentialProviderPresetCatalog.openai.binding.auth,
    fakeEnv: reference.fakeEnv,
    status: "injected",
    provider: "opensandbox",
    providerRevision: 2,
    providerMetadata: {},
    providerState: "present",
    providerCheckedAt: "2026-09-03T00:00:00.000Z",
    lastError: null,
    injectedAt: "2026-09-03T00:00:00.000Z",
    detachedAt: null,
    createdByUserId: "user_cli",
    createdByLabel: "cli@test.local",
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z"
  };
  const api = await startMockApi((request) => {
    if (request.method === "GET" && request.path === "/v1/external-secret-references") {
      return { body: { references: [reference] } };
    }
    if (request.method === "POST" && request.path === "/v1/external-secret-references") {
      return { status: 201, body: { reference } };
    }
    if (request.method === "POST" && request.path === "/v1/external-secret-references/xsr_openai/validate") {
      return { body: { reference } };
    }
    if (request.method === "POST" && request.path === "/v1/sandboxes/sbx_vault/credentials") {
      return { status: 201, body: { attachment, vault: { revision: 2, credentials: [], bindings: [] } } };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const listed = await runCli(["vault", "references", "list"], { api });
    assert.equal(listed.exitCode, 0, listed.stderr);
    assert.match(listed.stdout, /harakiri-security\/agent-credentials:OPENAI_API_KEY/);

    const created = await runCli([
      "vault", "references", "create",
      "--name", "openai-cluster",
      "--preset", "openai",
      "--namespace", "harakiri-security",
      "--secret-name", "agent-credentials",
      "--key", "OPENAI_API_KEY",
      "--member-use"
    ], { api });
    assert.equal(created.exitCode, 0, created.stderr);
    assert.match(created.stdout, /external secret reference created/);

    const customCreated = await runCli([
      "vault", "references", "create",
      "--name", "internal-api-cluster",
      "--host", "api.internal.example",
      "--auth", "bearer",
      "--method", "GET",
      "--path", "/v1/*",
      "--secret-name", "agent-credentials",
      "--key", "INTERNAL_API_KEY"
    ], { api });
    assert.equal(customCreated.exitCode, 0, customCreated.stderr);

    const validated = await runCli(["vault", "references", "validate", "xsr_openai"], { api });
    assert.equal(validated.exitCode, 0, validated.stderr);
    assert.match(validated.stdout, /validation=valid/);

    const attached = await runCli(["vault", "attach-reference", "sbx_vault", "xsr_openai"], { api });
    assert.equal(attached.exitCode, 0, attached.stderr);
    assert.match(attached.stdout, /sca_external\tinjected\tpresent\topenai-cluster/);

    assert.deepEqual(api.requests[1]?.body, {
      name: "openai-cluster",
      providerPresetId: "openai",
      resolverType: "kubernetes_secret",
      reference: {
        namespace: "harakiri-security",
        name: "agent-credentials",
        key: "OPENAI_API_KEY"
      },
      usePolicy: "organization_members",
      fakeEnv: {}
    });
    assert.deepEqual(api.requests[2]?.body, {
      name: "internal-api-cluster",
      providerPresetId: "custom",
      customProfile: {
        host: "api.internal.example",
        authType: "bearer",
        methods: ["GET"],
        paths: ["/v1/*"]
      },
      resolverType: "kubernetes_secret",
      reference: {
        name: "agent-credentials",
        key: "INTERNAL_API_KEY"
      },
      usePolicy: "admins_only",
      fakeEnv: {}
    });
    assert.deepEqual(api.requests[4]?.body, {
      sourceType: "external_ref",
      referenceId: "xsr_openai"
    });
    assert.equal(JSON.stringify(api.requests).includes("external-real-secret"), false);
  } finally {
    await api.close();
  }
});

test("vault dynamic issuer commands manage and attach scoped GitHub App credentials", async () => {
  const issuer = {
    id: "dci_github",
    name: "agent-repositories",
    providerPresetId: "github",
    sourceType: "dynamic",
    issuerType: "github_app_installation",
    scope: {
      installationId: "321",
      repositories: ["agent-runtime"],
      permissions: { contents: "write", metadata: "read" }
    },
    status: "active",
    usePolicy: "organization_members",
    version: 1,
    fakeEnv: { GITHUB_TOKEN: "fake-github-token" },
    binding: credentialProviderPresetCatalog.github.binding,
    egressDomains: credentialProviderPresetCatalog.github.egressDomains,
    metadata: {},
    createdByUserId: "user_cli",
    createdByLabel: "cli@test.local",
    disabledAt: null,
    deletedAt: null,
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
    lastIssuedAt: "2026-09-03T00:01:00.000Z",
    validation: { state: "valid", message: null, checkedAt: "2026-09-03T00:00:00.000Z" },
    usage: { activeSandboxCount: 1, attachmentCount: 1, lastAttachedAt: "2026-09-03T00:01:00.000Z" },
    capabilities: {
      reusable: true,
      rehydratable: true,
      rotatable: false,
      externallyOwned: true,
      shortLived: true,
      launchOnly: false
    }
  };
  const attachment = {
    id: "sca_dynamic",
    sandboxId: "sbx_vault",
    displayName: issuer.name,
    sourceType: "dynamic",
    sourceRef: issuer.id,
    credentialName: "github",
    bindingName: "github-api",
    match: credentialProviderPresetCatalog.github.binding.match,
    auth: credentialProviderPresetCatalog.github.binding.auth,
    fakeEnv: issuer.fakeEnv,
    status: "injected",
    provider: "opensandbox",
    providerRevision: 3,
    providerState: "present",
    providerCheckedAt: "2026-09-03T00:01:00.000Z",
    providerMetadata: {},
    sourceMetadata: { installationId: "321", repositories: ["agent-runtime"] },
    expiresAt: "2026-09-03T01:01:00.000Z",
    refreshState: "current",
    refreshAttemptedAt: "2026-09-03T00:01:00.000Z",
    refreshedAt: "2026-09-03T00:01:00.000Z",
    lastError: null,
    injectedAt: "2026-09-03T00:01:00.000Z",
    detachedAt: null,
    createdByUserId: "user_cli",
    createdByLabel: "cli@test.local",
    createdAt: "2026-09-03T00:01:00.000Z",
    updatedAt: "2026-09-03T00:01:00.000Z"
  };
  const api = await startMockApi((request) => {
    if (request.method === "GET" && request.path === "/v1/dynamic-credential-issuers") {
      return { body: { issuers: [issuer] } };
    }
    if (request.method === "POST" && request.path === "/v1/dynamic-credential-issuers") {
      return { status: 201, body: { issuer } };
    }
    if (request.method === "POST" && request.path === "/v1/dynamic-credential-issuers/dci_github/validate") {
      return { body: { issuer } };
    }
    if (request.method === "POST" && request.path === "/v1/sandboxes/sbx_vault/credentials") {
      return { status: 201, body: { attachment, vault: { revision: 3, credentials: [], bindings: [] } } };
    }
    if (request.method === "POST" && request.path === "/v1/sandboxes/sbx_vault/credentials/sca_dynamic/refresh") {
      return { body: { attachment, vault: { revision: 4, credentials: [], bindings: [] } } };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const listed = await runCli(["vault", "issuers", "list"], { api });
    assert.equal(listed.exitCode, 0, listed.stderr);
    assert.match(listed.stdout, /321:agent-runtime/);

    const created = await runCli([
      "vault", "issuers", "create",
      "--name", "agent-repositories",
      "--installation-id", "321",
      "--repository", "agent-runtime",
      "--permission", "contents=write",
      "--permission", "metadata=read",
      "--member-use"
    ], { api });
    assert.equal(created.exitCode, 0, created.stderr);
    assert.match(created.stdout, /dynamic credential issuer created/);

    const validated = await runCli(["vault", "issuers", "validate", "dci_github"], { api });
    assert.equal(validated.exitCode, 0, validated.stderr);
    assert.match(validated.stdout, /validation=valid/);

    const attached = await runCli(["vault", "attach-issuer", "sbx_vault", "dci_github"], { api });
    assert.equal(attached.exitCode, 0, attached.stderr);
    assert.match(attached.stdout, /dynamic credential attached/);
    assert.match(attached.stdout, /sca_dynamic\tinjected\tpresent\tagent-repositories/);

    const refreshed = await runCli(["vault", "refresh", "sbx_vault", "sca_dynamic"], { api });
    assert.equal(refreshed.exitCode, 0, refreshed.stderr);
    assert.match(refreshed.stdout, /dynamic credential refreshed/);

    assert.deepEqual(api.requests[1]?.body, {
      name: "agent-repositories",
      issuerType: "github_app_installation",
      scope: {
        installationId: "321",
        repositories: ["agent-runtime"],
        permissions: { contents: "write", metadata: "read" }
      },
      usePolicy: "organization_members",
      fakeEnv: {}
    });
    assert.deepEqual(api.requests[3]?.body, {
      sourceType: "dynamic",
      issuerId: "dci_github"
    });
    assert.equal(JSON.stringify(api.requests).includes("ghs_"), false);
  } finally {
    await api.close();
  }
});

test("registry credential commands call the shared SDK endpoints", async () => {
  const credential = {
    id: "trc_ghcr",
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
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z"
  };
  const api = await startMockApi((request) => {
    if (request.method === "GET" && request.path === "/v1/registry-credentials?includeRevoked=1") {
      return { body: { credentials: [credential] } };
    }
    if (request.method === "POST" && request.path === "/v1/registry-credentials") {
      return { status: 201, body: { credential } };
    }
    if (request.method === "DELETE" && request.path === "/v1/registry-credentials/trc_ghcr") {
      return { body: { credential } };
    }
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const upserted = await runCli([
      "registry",
      "upsert",
      "--name",
      "ghcr",
      "--registry-host",
      "ghcr.io",
      "--username",
      "robot",
      "--secret",
      "token",
      "--purpose",
      "push_pull",
      "--repository-prefix",
      "harakiri"
    ], { api });
    assert.equal(upserted.exitCode, 0, upserted.stderr);
    assert.match(upserted.stdout, /trc_ghcr/);
    assert.deepEqual(api.requests[0]?.body, {
      name: "ghcr",
      registryHost: "ghcr.io",
      username: "robot",
      secret: "token",
      purpose: "push_pull",
      repositoryPrefix: "harakiri"
    });

    const listed = await runCli(["registry", "list", "--include-revoked"], { api });
    assert.equal(listed.exitCode, 0, listed.stderr);
    assert.equal(listed.stdout, "trc_ghcr\tpush_pull\tghcr.io\tghcr\tharakiri\tencrypted\n");

    const revoked = await runCli(["registry", "revoke", "trc_ghcr"], { api });
    assert.equal(revoked.exitCode, 0, revoked.stderr);
    assert.match(revoked.stdout, /revoked registry credential ghcr/);
  } finally {
    await api.close();
  }
});
