import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

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

const runCli = async (args: string[], options: { api: MockApi; cwd?: string }) => {
  const home = await mkdtemp(join(tmpdir(), "harakiri-cli-home-"));
  const child = spawn(process.execPath, ["--import", "tsx", cliPath, ...args], {
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
      runtimeFamily: "custom"
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
    assert.match(buildHelp.stdout, /harakiri template build examples\/templates\/open-agents-dev/);
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
