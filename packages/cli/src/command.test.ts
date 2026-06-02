import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { WebSocketServer } from "ws";

type RecordedRequest = {
  method: string;
  path: string;
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

const startMockApi = async (handler: (request: RecordedRequest) => { status?: number; body?: unknown }) => {
  const requests: RecordedRequest[] = [];
  const server = createServer(async (request, response) => {
    const recorded = {
      method: request.method ?? "GET",
      path: request.url ?? "/",
      body: await readBody(request)
    };
    requests.push(recorded);
    const result = handler(recorded);
    response.statusCode = result.status ?? 200;
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

const runCli = async (args: string[], options: { api: { url: string }; cwd?: string }) => {
  const home = await mkdtemp(join(tmpdir(), "harakiri-cli-home-"));
  const child = spawn(process.execPath, ["--import", tsxImport, cliPath, ...args], {
    cwd: options.cwd ?? packageRoot,
    env: {
      ...process.env,
      HOME: home,
      HARAKIRI_API_URL: options.api.url,
      HARAKIRI_API_KEY: "hk_test_cli",
      NO_COLOR: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  child.stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
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
      "test -d /workspace"
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
      tags: ["custom", "hot"]
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
          startCommand: "python -m http.server \"8000\""
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
    assert.deepEqual(api.requests[0]?.body, {
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
    assert.deepEqual(api.requests[0]?.body, {
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
    assert.deepEqual(create?.body, {
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
  const api = await startMockApi((request) => {
    if (request.method === "POST" && request.path === "/v1/sandboxes/sbx_route/routes") {
      return {
        body: {
          route: {
            id: "sbr_1",
            sandboxId: "sbx_route",
            port: 5173,
            protocol: "http",
            accessMode: "public",
            accessHeaderName: null,
            tokenHint: null,
            labels: ["preview", "vite"],
            createdByUserId: "user_cli",
            createdByLabel: "cli@test.local",
            routeKey: "sbx-route-5173",
            host: "sbx-route-5173.sandbox.localhost",
            url: "https://sbx-route-5173.sandbox.localhost",
            targetUrl: "http://sandbox:5173",
            state: "active",
            provider: "opensandbox",
            providerRouteId: null,
            createdAt: "2026-05-24T00:00:00.000Z",
            lastCheckedAt: null,
            lastUsedAt: null,
            terminatedAt: null
          }
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
              tokenHint: null,
              labels: ["preview", "vite"],
              createdByUserId: "user_cli",
              createdByLabel: "cli@test.local",
              routeKey: "sbx-route-5173",
              host: "sbx-route-5173.sandbox.localhost",
              url: "https://sbx-route-5173.sandbox.localhost",
              targetUrl: "http://sandbox:5173",
              state: "active",
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
    return { status: 404, body: { error: "unexpected", path: request.path } };
  });
  try {
    const exposed = await runCli(["expose", "sbx_route", "--port", "5173", "--label", "preview", "--label", "vite"], { api });
    assert.equal(exposed.exitCode, 0, exposed.stderr);
    assert.match(exposed.stdout, /https:\/\/sbx-route-5173\.sandbox\.localhost/);
    assert.deepEqual(api.requests[0]?.body, { port: 5173, protocol: "http", accessMode: "public", labels: ["preview", "vite"] });

    const listed = await runCli(["routes", "sbx_route"], { api });
    assert.equal(listed.exitCode, 0, listed.stderr);
    assert.equal(listed.stdout, "5173\tactive\tpublic\topensandbox\tpreview,vite\thttps://sbx-route-5173.sandbox.localhost\n");
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
          sha256: "sha256:2689367b205c16ce32c97f1cee2bf971dbcb6b934306b9cdd75829e61e8c04ec"
        }
      };
    }
    if (request.method === "GET" && request.path === "/v1/sandboxes/sbx_files/files/download?path=%2Fworkspace%2Fupload.bin") {
      return {
        body: {
          path: "/workspace/upload.bin",
          contentBase64: "b2s=",
          sizeBytes: 2,
          sha256: "sha256:2689367b205c16ce32c97f1cee2bf971dbcb6b934306b9cdd75829e61e8c04ec"
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
    assert.equal(upload.stdout, "file\t2\tsha256:2689367b205c16ce32c97f1cee2bf971dbcb6b934306b9cdd75829e61e8c04ec\t/workspace/upload.bin\n");

    const download = await runCli(["file-download", "sbx_files", "--path", "/workspace/upload.bin", "--to", downloadTarget], { api });
    assert.equal(download.exitCode, 0, download.stderr);
    assert.equal(download.stdout, "2\tsha256:2689367b205c16ce32c97f1cee2bf971dbcb6b934306b9cdd75829e61e8c04ec\t" + downloadTarget + "\n");
    assert.equal(await readFile(downloadTarget, "utf8"), "ok");

    const removed = await runCli(["file-rm", "sbx_files", "--path", "/workspace/out.py"], { api });
    assert.equal(removed.exitCode, 0, removed.stderr);
    assert.match(`${removed.stdout}${removed.stderr}`, /removed \/workspace\/out.py/);
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
