import assert from "node:assert/strict";
import test from "node:test";
import type { RuntimeProvider } from "./providers/runtime/provider.js";
import { RuntimeUnsupportedError } from "./providers/runtime/provider.js";
import {
  attachSandboxTerminal,
  createSandboxCommand,
  createSandboxCommandSession,
  createSandboxRoute,
  deleteSandboxCommandSession,
  deleteSandboxRoute,
  downloadSandboxFileArtifact,
  getSandboxCommandLogs,
  getSandboxRouteProxyTarget,
  getSandboxMetrics,
  listSandboxFiles,
  listSandboxLogs,
  listSandboxRoutes,
  mkdirSandboxFile,
  readSandboxFile,
  removeSandboxFile,
  renameSandboxFile,
  runSandboxCommand,
  runSandboxCommandSession,
  statSandboxFile,
  testSandboxEgress,
  uploadSandboxFileArtifact,
  writeSandboxFile
} from "./services/sandbox-runtime.js";
import { hashApiKey } from "./crypto.js";

const fakeRuntimeProvider = (overrides: Partial<RuntimeProvider> = {}): RuntimeProvider => ({
  kind: "fake",
  capabilities: {
    terminal: true,
    filesystem: true,
    logs: true,
    metrics: true,
    routes: true
  },
  create: async () => {
    throw new Error("not used");
  },
  list: async () => [],
  get: async () => null,
  delete: async () => undefined,
  renew: async () => undefined,
  run: async () => {
    throw new Error("not used");
  },
  files: async () => {
    throw new Error("not used");
  },
  logs: async () => [],
  metrics: async () => null,
  exposeRoute: async () => {
    throw new Error("not used");
  },
  ...overrides
});

test("listSandboxFiles uses the template workdir and preserves provider unavailable state", async () => {
  const seenProviders: string[] = [];
  const ok = await listSandboxFiles(
    { organizationId: "org_runtime", sandboxId: "sbx_runtime" },
    {
      runtimeProvider: fakeRuntimeProvider({
        files: async (input) => {
          seenProviders.push(input.provider);
          return {
            ok: true,
            cwd: input.path ?? input.defaultCwd,
            defaultCwd: input.defaultCwd,
            source: "fake",
            files: [{ path: "/workspace/agent.py", name: "agent.py", type: "file", size: 12 }]
          };
        }
      }),
      query: async (text, params) => {
        assert.match(text, /COALESCE\(v\.workdir, t\.workdir/);
        assert.deepEqual(params, ["sbx_runtime", "org_runtime"]);
        return { rowCount: 1, rows: [{ opensandbox_id: "provider_sbx", workdir: "/workspace" }] as never[] };
      }
    }
  );

  assert.deepEqual(ok, {
    kind: "ok",
    cwd: "/workspace",
    files: [{ path: "/workspace/agent.py", name: "agent.py", type: "file", size: 12 }],
    source: "fake",
    warnings: undefined
  });
  assert.deepEqual(seenProviders, ["fake"]);

  const unavailable = await listSandboxFiles(
    { organizationId: "org_runtime", sandboxId: "sbx_runtime", path: "/" },
    {
      runtimeProvider: fakeRuntimeProvider({
        files: async (input) => ({
          ok: false,
          cwd: input.path ?? input.defaultCwd,
          defaultCwd: input.defaultCwd,
          files: [],
          error: {
            code: "runtime_files_unavailable",
            message: "provider down",
            recoverable: true
          }
        })
      }),
      query: async () => ({ rowCount: 1, rows: [{ opensandbox_id: "provider_sbx", workdir: "/workspace" }] as never[] })
    }
  );

  assert.equal(unavailable.kind, "unavailable");
  if (unavailable.kind === "unavailable") {
    assert.equal(unavailable.files.cwd, "/");
    assert.equal(unavailable.files.ok, false);
    if (!unavailable.files.ok) assert.equal(unavailable.files.error.code, "runtime_files_unavailable");
  }
});

test("sandbox file operations resolve provider refs and preserve typed file errors", async () => {
  const query = async (text: string, params?: unknown[]) => {
    assert.match(text, /COALESCE\(v\.workdir, t\.workdir/);
    assert.deepEqual(params, ["sbx_runtime", "org_runtime"]);
    return { rowCount: 1, rows: [{ opensandbox_id: "provider_sbx", workdir: "/workspace" }] as never[] };
  };
  const provider = fakeRuntimeProvider({
    statFile: async (input) => ({
      ok: true,
      file: { path: input.path, name: "agent.py", type: "file", size: 12 }
    }),
    readFile: async (input) => ({
      ok: true,
      path: input.path,
      encoding: input.encoding,
      content: input.encoding === "base64" ? Buffer.from("print('ok')\n").toString("base64") : "print('ok')\n"
    }),
    writeFile: async (input) => ({
      ok: true,
      file: { path: input.path, name: "agent.py", type: "file", size: input.content.length }
    }),
    mkdir: async (input) => ({
      ok: true,
      file: { path: input.path, name: "src", type: "directory", size: 0 }
    }),
    removeFile: async (input) => ({
      ok: true,
      path: input.path
    }),
    renameFile: async (input) => ({
      ok: true,
      file: { path: input.toPath, name: "renamed.py", type: "file", size: 12 }
    })
  });

  assert.equal((await statSandboxFile({ organizationId: "org_runtime", sandboxId: "sbx_runtime", path: "/workspace/agent.py" }, { runtimeProvider: provider, query })).kind, "ok");
  assert.equal((await readSandboxFile({ organizationId: "org_runtime", sandboxId: "sbx_runtime", path: "/workspace/agent.py", encoding: "utf8" }, { runtimeProvider: provider, query })).kind, "ok");
  assert.equal((await writeSandboxFile({ organizationId: "org_runtime", sandboxId: "sbx_runtime", path: "/workspace/agent.py", content: "x", encoding: "utf8" }, { runtimeProvider: provider, query })).kind, "ok");
  const artifact = Buffer.from("ok").toString("base64");
  const uploaded = await uploadSandboxFileArtifact(
    { organizationId: "org_runtime", sandboxId: "sbx_runtime", path: "/workspace/out.bin", contentBase64: artifact, sizeBytes: 2, createParents: true },
    { runtimeProvider: provider, query }
  );
  assert.equal(uploaded.kind, "ok");
  if (uploaded.kind === "ok") {
    assert.equal(uploaded.sizeBytes, 2);
    assert.match(uploaded.sha256, /^sha256:[a-f0-9]{64}$/);
  }
  const downloaded = await downloadSandboxFileArtifact(
    { organizationId: "org_runtime", sandboxId: "sbx_runtime", path: "/workspace/agent.py" },
    { runtimeProvider: provider, query }
  );
  assert.equal(downloaded.kind, "ok");
  if (downloaded.kind === "ok") {
    assert.equal(downloaded.contentBase64, Buffer.from("print('ok')\n").toString("base64"));
    assert.equal(downloaded.sizeBytes, 12);
  }
  const invalidArtifact = await uploadSandboxFileArtifact(
    { organizationId: "org_runtime", sandboxId: "sbx_runtime", path: "/workspace/out.bin", contentBase64: artifact, sizeBytes: 99 },
    { runtimeProvider: provider, query }
  );
  assert.equal(invalidArtifact.kind, "invalid_artifact");
  assert.equal((await mkdirSandboxFile({ organizationId: "org_runtime", sandboxId: "sbx_runtime", path: "/workspace/src", recursive: true }, { runtimeProvider: provider, query })).kind, "ok");
  assert.equal((await removeSandboxFile({ organizationId: "org_runtime", sandboxId: "sbx_runtime", path: "/workspace/agent.py" }, { runtimeProvider: provider, query })).kind, "ok");
  assert.equal((await renameSandboxFile({ organizationId: "org_runtime", sandboxId: "sbx_runtime", fromPath: "/workspace/agent.py", toPath: "/workspace/renamed.py" }, { runtimeProvider: provider, query })).kind, "ok");

  const missing = await statSandboxFile(
    { organizationId: "org_runtime", sandboxId: "sbx_runtime", path: "/missing.py" },
    {
      runtimeProvider: fakeRuntimeProvider({
        statFile: async () => ({
          ok: false,
          error: { code: "file_not_found", message: "missing", recoverable: false, statusCode: 404 }
        })
      }),
      query
    }
  );

  assert.equal(missing.kind, "file_error");
  if (missing.kind === "file_error") assert.equal(missing.error.code, "file_not_found");
});

test("sandbox artifact helpers preserve binary payloads and reject malformed artifacts before provider writes", async () => {
  const binary = Buffer.from([0, 255, 1, 2, 3, 128, 64]);
  const contentBase64 = binary.toString("base64");
  let writeCalls = 0;
  const provider = fakeRuntimeProvider({
    writeFile: async (input) => {
      writeCalls += 1;
      assert.equal(input.providerSandboxId, "provider_sbx");
      assert.equal(input.path, "/workspace/blob.bin");
      assert.equal(input.encoding, "base64");
      assert.equal(input.content, contentBase64);
      return {
        ok: true,
        file: { path: input.path, name: "blob.bin", type: "file", size: binary.byteLength }
      };
    },
    readFile: async (input) => ({
      ok: true,
      path: input.path,
      encoding: input.encoding,
      content: contentBase64
    })
  });
  const query = async () => ({ rowCount: 1, rows: [{ opensandbox_id: "provider_sbx", workdir: "/workspace" }] as never[] });

  const uploaded = await uploadSandboxFileArtifact(
    { organizationId: "org_runtime", sandboxId: "sbx_runtime", path: "/workspace/blob.bin", contentBase64, sizeBytes: binary.byteLength },
    { runtimeProvider: provider, query }
  );
  assert.equal(uploaded.kind, "ok");
  if (uploaded.kind === "ok") {
    assert.equal(uploaded.sizeBytes, binary.byteLength);
    assert.equal(uploaded.sha256, "sha256:be777f11c6e1535ae0ed3f3addf915f6709b7ab9586dc17e3d46c753cad6c29d");
  }

  const downloaded = await downloadSandboxFileArtifact(
    { organizationId: "org_runtime", sandboxId: "sbx_runtime", path: "/workspace/blob.bin" },
    { runtimeProvider: provider, query }
  );
  assert.equal(downloaded.kind, "ok");
  if (downloaded.kind === "ok") {
    assert.equal(downloaded.contentBase64, contentBase64);
    assert.equal(downloaded.sizeBytes, binary.byteLength);
    assert.equal(downloaded.sha256, "sha256:be777f11c6e1535ae0ed3f3addf915f6709b7ab9586dc17e3d46c753cad6c29d");
  }

  const malformed = await uploadSandboxFileArtifact(
    { organizationId: "org_runtime", sandboxId: "sbx_runtime", path: "/workspace/blob.bin", contentBase64: "not-base64" },
    { runtimeProvider: provider, query }
  );
  assert.equal(malformed.kind, "invalid_artifact");
  if (malformed.kind === "invalid_artifact") assert.equal(malformed.code, "sandbox_file_artifact_invalid_base64");

  const tooLarge = await uploadSandboxFileArtifact(
    {
      organizationId: "org_runtime",
      sandboxId: "sbx_runtime",
      path: "/workspace/blob.bin",
      contentBase64: Buffer.alloc(16 * 1024 * 1024 + 1).toString("base64")
    },
    { runtimeProvider: provider, query }
  );
  assert.equal(tooLarge.kind, "invalid_artifact");
  if (tooLarge.kind === "invalid_artifact") assert.equal(tooLarge.code, "sandbox_file_artifact_too_large");
  assert.equal(writeCalls, 1);
});

test("createSandboxCommand persists a tracked provider command and reads detached logs", async () => {
  const events: Array<{ type: string; metadata?: Record<string, unknown> }> = [];
  const commandRow = (overrides: Record<string, unknown> = {}) => ({
    id: "cmd_runtime",
    sandboxId: "sbx_runtime",
    provider: "fake",
    providerCommandId: "provider_cmd",
    command: "npm run dev",
    status: "running",
    cwd: "/workspace/app",
    envKeys: ["NODE_ENV"],
    timeoutMs: 30_000,
    detached: true,
    stdout: "",
    stderr: "",
    exitCode: null,
    error: null,
    startedAt: new Date("2026-05-29T00:00:00Z"),
    finishedAt: null,
    createdAt: new Date("2026-05-29T00:00:00Z"),
    updatedAt: new Date("2026-05-29T00:00:00Z"),
    ...overrides
  });
  const provider = fakeRuntimeProvider({
    startCommand: async (input) => {
      assert.equal(input.providerSandboxId, "provider_sbx");
      assert.equal(input.detached, true);
      assert.deepEqual(input.env, { NODE_ENV: "dev" });
      return {
        providerCommandId: "provider_cmd",
        status: "running",
        stdout: "",
        stderr: "",
        exitCode: null,
        startedAt: "2026-05-29T00:00:00.000Z",
        finishedAt: null
      };
    },
    commandLogs: async (input) => {
      assert.equal(input.providerCommandId, "provider_cmd");
      if (input.cursor !== undefined) assert.equal(input.cursor, 0);
      return { stdout: "starting\nready\nserving\n", stderr: "warn\nok\n", cursor: 1 };
    }
  });
  const query = async (text: string, params?: unknown[]) => {
    if (text.includes("SELECT id, opensandbox_id, status FROM sandboxes")) {
      assert.deepEqual(params, ["sbx_runtime", "org_runtime"]);
      return { rowCount: 1, rows: [{ id: "sbx_runtime", opensandbox_id: "provider_sbx", status: "running" }] as never[] };
    }
    if (text.includes("INSERT INTO sandbox_commands")) {
      assert.deepEqual(params?.slice(0, 9), ["cmd_runtime", "org_runtime", "sbx_runtime", "fake", "npm run dev", "/workspace/app", ["NODE_ENV"], 30_000, true]);
      return { rowCount: 1, rows: [] as never[] };
    }
    if (text.includes("WITH updated AS") && text.includes("provider_command_id")) {
      return { rowCount: 1, rows: [commandRow()] as never[] };
    }
    if (text.includes("UPDATE sandboxes SET last_active_at")) return { rowCount: 1, rows: [] as never[] };
    if (text.includes("FROM sandbox_commands c")) {
      return { rowCount: 1, rows: [commandRow({ opensandboxId: "provider_sbx" })] as never[] };
    }
    throw new Error(`unexpected query: ${text}`);
  };

  const created = await createSandboxCommand(
    {
      organizationId: "org_runtime",
      sandboxId: "sbx_runtime",
      body: { command: "npm run dev", cwd: "/workspace/app", env: { NODE_ENV: "dev" }, timeoutMs: 30_000, detached: true }
    },
    {
      runtimeProvider: provider,
      query,
      idFactory: () => "cmd_runtime",
      recordEvent: async (_organizationId, _sandboxId, type, _message, metadata) => {
        events.push({ type, metadata });
      }
    }
  );

  assert.equal(created.kind, "ok");
  if (created.kind === "ok") assert.equal(created.command.providerCommandId, "provider_cmd");
  assert.equal(events[0].type, "command.started");
  assert.equal(events[0].metadata?.commandId, "cmd_runtime");

  const logs = await getSandboxCommandLogs(
    { organizationId: "org_runtime", sandboxId: "sbx_runtime", commandId: "cmd_runtime", cursor: 0 },
    { runtimeProvider: provider, query }
  );
  assert.deepEqual(logs, { commandId: "cmd_runtime", stdout: "starting\nready\nserving\n", stderr: "warn\nok\n", cursor: 1 });

  const tailed = await getSandboxCommandLogs(
    { organizationId: "org_runtime", sandboxId: "sbx_runtime", commandId: "cmd_runtime", tail: 2 },
    { runtimeProvider: provider, query }
  );
  assert.deepEqual(tailed, {
    commandId: "cmd_runtime",
    stdout: "ready\nserving\n",
    stderr: "warn\nok\n",
    cursor: 1,
    tail: 2,
    stdoutTruncated: true,
    stderrTruncated: false
  });
});

test("runSandboxCommand uses the tracked command resource when available", async () => {
  const events: Array<{ type: string; metadata?: Record<string, unknown> }> = [];
  const provider = fakeRuntimeProvider({
    startCommand: async (input) => {
      assert.equal(input.providerSandboxId, "provider_sbx");
      assert.equal(input.detached, false);
      assert.equal(input.command, "python -V");
      assert.equal(input.cwd, "/workspace");
      return {
        providerCommandId: "provider_cmd",
        status: "succeeded",
        stdout: "Python 3.12\n",
        stderr: "",
        exitCode: 0,
        startedAt: "2026-05-29T00:00:00.000Z",
        finishedAt: "2026-05-29T00:00:00.012Z"
      };
    }
  });
  const query = async (text: string, params?: unknown[]) => {
    if (text.includes("SELECT id, opensandbox_id, status FROM sandboxes")) {
      assert.deepEqual(params, ["sbx_runtime", "org_runtime"]);
      return { rowCount: 1, rows: [{ id: "sbx_runtime", opensandbox_id: "provider_sbx", status: "running" }] as never[] };
    }
    if (text.includes("INSERT INTO sandbox_commands")) {
      assert.equal(typeof params?.[0], "string");
      assert.match(String(params?.[0]), /^cmd_/);
      assert.deepEqual(params?.slice(1, 9), ["org_runtime", "sbx_runtime", "fake", "python -V", "/workspace", [], 15_000, false]);
      return { rowCount: 1, rows: [] as never[] };
    }
    if (text.includes("WITH updated AS") && text.includes("provider_command_id")) {
      return {
        rowCount: 1,
        rows: [{
          id: params?.[0],
          sandboxId: "sbx_runtime",
          provider: "fake",
          providerCommandId: "provider_cmd",
          command: "python -V",
          status: "succeeded",
          cwd: "/workspace",
          envKeys: [],
          timeoutMs: 15_000,
          detached: false,
          stdout: "Python 3.12\n",
          stderr: "",
          exitCode: 0,
          error: null,
          startedAt: new Date("2026-05-29T00:00:00Z"),
          finishedAt: new Date("2026-05-29T00:00:00.012Z"),
          createdAt: new Date("2026-05-29T00:00:00Z"),
          updatedAt: new Date("2026-05-29T00:00:00.012Z")
        }] as never[]
      };
    }
    if (text.includes("UPDATE sandboxes SET last_active_at")) return { rowCount: 1, rows: [] as never[] };
    throw new Error(`unexpected query: ${text}`);
  };

  const result = await runSandboxCommand(
    { organizationId: "org_runtime", sandboxId: "sbx_runtime", command: "python -V", cwd: "/workspace", timeoutMs: 15_000 },
    {
      runtimeProvider: provider,
      query,
      recordEvent: async (_organizationId, _sandboxId, type, _message, metadata) => {
        events.push({ type, metadata });
      }
    }
  );

  assert.deepEqual(result, {
    kind: "ok",
    result: {
      sandboxId: "sbx_runtime",
      command: "python -V",
      stdout: "Python 3.12\n",
      stderr: "",
      exitCode: 0,
      durationMs: 12
    }
  });
  assert.equal(events[0].type, "command.started");
});

test("runSandboxCommand records explicit Git operation audit metadata", async () => {
  const events: Array<{ type: string; message: string; metadata?: Record<string, unknown> }> = [];
  const audits: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
  const provider = fakeRuntimeProvider({
    startCommand: async (input) => ({
      providerCommandId: "provider_git_cmd",
      status: "succeeded",
      stdout: "",
      stderr: "",
      exitCode: 0,
      startedAt: "2026-05-29T00:00:00.000Z",
      finishedAt: "2026-05-29T00:00:00.018Z"
    })
  });
  const query = async (text: string, params?: unknown[]) => {
    if (text.includes("SELECT id, opensandbox_id, status FROM sandboxes")) {
      return { rowCount: 1, rows: [{ id: "sbx_runtime", opensandbox_id: "provider_sbx", status: "running" }] as never[] };
    }
    if (text.includes("INSERT INTO sandbox_commands")) return { rowCount: 1, rows: [] as never[] };
    if (text.includes("WITH updated AS") && text.includes("provider_command_id")) {
      return {
        rowCount: 1,
        rows: [{
          id: params?.[0],
          sandboxId: "sbx_runtime",
          provider: "fake",
          providerCommandId: "provider_git_cmd",
          command: "git -C /workspace/project push origin main",
          status: "succeeded",
          cwd: "/workspace/project",
          envKeys: ["HARAKIRI_GIT_TOKEN"],
          timeoutMs: 120_000,
          detached: false,
          stdout: "",
          stderr: "",
          exitCode: 0,
          error: null,
          startedAt: new Date("2026-05-29T00:00:00Z"),
          finishedAt: new Date("2026-05-29T00:00:00.018Z"),
          createdAt: new Date("2026-05-29T00:00:00Z"),
          updatedAt: new Date("2026-05-29T00:00:00.018Z")
        }] as never[]
      };
    }
    if (text.includes("UPDATE sandboxes SET last_active_at")) return { rowCount: 1, rows: [] as never[] };
    throw new Error(`unexpected query: ${text}`);
  };

  const result = await runSandboxCommand(
    {
      organizationId: "org_runtime",
      sandboxId: "sbx_runtime",
      command: "git -C /workspace/project push origin main",
      cwd: "/workspace/project",
      timeoutMs: 120_000,
      actorUserId: "user_runtime",
      actorLabel: "dev@test.local",
      metadata: {
        capability: "git",
        operation: "push",
        cwd: "/workspace/project",
        repositoryUrl: "https://oauth2:ghp_secret@github.com/acme/private.git",
        remote: "origin",
        branch: "main",
        credentialPersistence: "one-shot",
        hasCredentials: true
      }
    },
    {
      runtimeProvider: provider,
      query,
      recordEvent: async (_organizationId, _sandboxId, type, message, metadata) => events.push({ type, message, metadata }),
      recordAudit: async (_organizationId, _userId, _actorLabel, action, _targetType, _targetId, metadata) => audits.push({ action, metadata })
    }
  );

  assert.equal(result.kind, "ok");
  assert.equal(events.some((event) => event.type === "git.push"), true);
  assert.equal(audits[0].action, "sandbox.git.push");
  assert.equal(JSON.stringify(events).includes("ghp_secret"), false);
  assert.deepEqual(audits[0].metadata?.git, {
    capability: "git",
    operation: "push",
    cwd: "/workspace/project",
    repositoryUrl: "https://github.com/acme/private.git",
    remote: "origin",
    branch: "main",
    credentialPersistence: "one-shot",
    hasCredentials: true
  });
});

test("createSandboxCommand redacts credentialed Git URLs in stored command records and output", async () => {
  const rawCommand = "git clone https://oauth2:ghp_secret@github.com/acme/private.git /workspace/project";
  const redactedCommand = "git clone https://oauth2:[redacted]@github.com/acme/private.git /workspace/project";
  const events: Array<{ type: string; message: string; metadata?: Record<string, unknown> }> = [];
  const provider = fakeRuntimeProvider({
    startCommand: async (input) => {
      assert.equal(input.command, rawCommand);
      return {
        providerCommandId: "provider_cmd",
        status: "failed",
        stdout: `cloning ${rawCommand}\n`,
        stderr: "fatal: https://oauth2:ghp_secret@github.com/acme/private.git denied\n",
        exitCode: 128,
        error: "token=ghp_secret",
        startedAt: "2026-05-29T00:00:00.000Z",
        finishedAt: "2026-05-29T00:00:00.012Z"
      };
    }
  });
  const query = async (text: string, params?: unknown[]) => {
    if (text.includes("SELECT id, opensandbox_id, status FROM sandboxes")) {
      return { rowCount: 1, rows: [{ id: "sbx_runtime", opensandbox_id: "provider_sbx", status: "running" }] as never[] };
    }
    if (text.includes("INSERT INTO sandbox_commands")) {
      assert.equal(params?.[4], redactedCommand);
      return { rowCount: 1, rows: [] as never[] };
    }
    if (text.includes("WITH updated AS") && text.includes("provider_command_id")) {
      assert.equal(params?.[3], `cloning ${redactedCommand}\n`);
      assert.equal(params?.[4], "fatal: https://oauth2:[redacted]@github.com/acme/private.git denied\n");
      assert.equal(params?.[6], "token=[redacted]");
      return {
        rowCount: 1,
        rows: [{
          id: "cmd_git",
          sandboxId: "sbx_runtime",
          provider: "fake",
          providerCommandId: "provider_cmd",
          command: rawCommand,
          status: "failed",
          cwd: "/workspace",
          envKeys: [],
          timeoutMs: 15_000,
          detached: false,
          stdout: `cloning ${rawCommand}\n`,
          stderr: "fatal: https://oauth2:ghp_secret@github.com/acme/private.git denied\n",
          exitCode: 128,
          error: "token=ghp_secret",
          startedAt: new Date("2026-05-29T00:00:00Z"),
          finishedAt: new Date("2026-05-29T00:00:00.012Z"),
          createdAt: new Date("2026-05-29T00:00:00Z"),
          updatedAt: new Date("2026-05-29T00:00:00.012Z")
        }] as never[]
      };
    }
    if (text.includes("UPDATE sandboxes SET last_active_at")) return { rowCount: 1, rows: [] as never[] };
    throw new Error(`unexpected query: ${text}`);
  };

  const result = await createSandboxCommand(
    {
      organizationId: "org_runtime",
      sandboxId: "sbx_runtime",
      body: { command: rawCommand, cwd: "/workspace", timeoutMs: 15_000 }
    },
    {
      runtimeProvider: provider,
      query,
      idFactory: () => "cmd_git",
      recordEvent: async (_organizationId, _sandboxId, type, message, metadata) => {
        events.push({ type, message, metadata });
      }
    }
  );

  assert.equal(result.kind, "ok");
  if (result.kind === "ok") {
    assert.equal(result.command.command, redactedCommand);
    assert.equal(result.command.stdout, `cloning ${redactedCommand}\n`);
    assert.equal(result.command.stderr, "fatal: https://oauth2:[redacted]@github.com/acme/private.git denied\n");
    assert.equal(result.command.error, "token=[redacted]");
  }
  assert.equal(events[0].message, `command: ${redactedCommand}`);
});

test("persistent command sessions resolve sandbox context and renew activity", async () => {
  const events: Array<{ type: string; metadata?: Record<string, unknown> }> = [];
  const provider = fakeRuntimeProvider({
    createCommandSession: async (input) => {
      assert.equal(input.providerSandboxId, "provider_sbx");
      assert.equal(input.cwd, "/workspace");
      return { providerSessionId: "ses_runtime", cwd: input.cwd ?? null };
    },
    runCommandSession: async (input) => {
      assert.equal(input.providerSandboxId, "provider_sbx");
      assert.equal(input.providerSessionId, "ses_runtime");
      assert.equal(input.command, "pwd");
      return { command: input.command, stdout: "/workspace\n", stderr: "", exitCode: 0, durationMs: 3 };
    },
    deleteCommandSession: async (input) => {
      assert.equal(input.providerSandboxId, "provider_sbx");
      assert.equal(input.providerSessionId, "ses_runtime");
    }
  });
  let renews = 0;
  const query = async (text: string, params?: unknown[]) => {
    if (text.includes("SELECT s.id, s.opensandbox_id")) {
      assert.deepEqual(params, ["sbx_runtime", "org_runtime"]);
      return { rowCount: 1, rows: [{ id: "sbx_runtime", opensandboxId: "provider_sbx", status: "running", workdir: "/workspace" }] as never[] };
    }
    if (text.includes("UPDATE sandboxes SET last_active_at")) {
      renews += 1;
      assert.deepEqual(params, ["sbx_runtime", "org_runtime"]);
      return { rowCount: 1, rows: [] as never[] };
    }
    throw new Error(`unexpected query: ${text}`);
  };
  const dependencies = {
    runtimeProvider: provider,
    query,
    recordEvent: async (_organizationId: string, _sandboxId: string, type: string, _message: string, metadata?: Record<string, unknown>) => {
      events.push({ type, metadata });
    }
  };

  const created = await createSandboxCommandSession(
    { organizationId: "org_runtime", sandboxId: "sbx_runtime", body: {} },
    dependencies
  );
  assert.equal(created.kind, "ok");
  if (created.kind === "ok") assert.equal(created.response.session.id, "ses_runtime");

  const run = await runSandboxCommandSession(
    { organizationId: "org_runtime", sandboxId: "sbx_runtime", sessionId: "ses_runtime", body: { command: "pwd" } },
    dependencies
  );
  assert.equal(run.kind, "ok");
  if (run.kind === "ok") assert.equal(run.response.result.stdout, "/workspace\n");

  const deleted = await deleteSandboxCommandSession(
    { organizationId: "org_runtime", sandboxId: "sbx_runtime", sessionId: "ses_runtime" },
    dependencies
  );
  assert.equal(deleted.kind, "ok");

  assert.equal(renews, 2);
  assert.deepEqual(events.map((event) => event.type), ["command.session.created", "command.session.run", "command.session.deleted"]);
  assert.equal(events[1].metadata?.providerSessionId, "ses_runtime");
});

test("attachSandboxTerminal maps provider unsupported options to terminal unsupported", async () => {
  const events: Array<{ type: string; metadata?: Record<string, unknown> }> = [];
  const provider = fakeRuntimeProvider({
    createPtySession: async (input) => {
      assert.equal(input.providerSandboxId, "provider_sbx");
      assert.equal(input.cwd, "/workspace");
      assert.equal(input.shell, "/bin/zsh");
      assert.deepEqual(input.env, { FOO: "bar" });
      assert.equal(input.sessionName, "service-terminal");
      throw new RuntimeUnsupportedError("OpenSandbox PTY does not support per-attach environment variables yet.");
    },
    attachPtySession: async () => {
      throw new Error("attach should not be called after unsupported create");
    }
  });
  const query = async (text: string, params?: unknown[]) => {
    if (text.includes("SELECT s.id, s.opensandbox_id")) {
      assert.deepEqual(params, ["sbx_runtime", "org_runtime"]);
      return { rowCount: 1, rows: [{ id: "sbx_runtime", opensandboxId: "provider_sbx", status: "running", workdir: "/workspace" }] as never[] };
    }
    throw new Error(`unexpected query: ${text}`);
  };

  const result = await attachSandboxTerminal(
    {
      organizationId: "org_runtime",
      actorUserId: "user_runtime",
      actorLabel: "runtime@test.local",
      sandboxId: "sbx_runtime",
      client: {} as never,
      cwd: "/workspace",
      shell: "/bin/zsh",
      env: { FOO: "bar" },
      sessionName: "service-terminal"
    },
    {
      runtimeProvider: provider,
      query,
      recordEvent: async (_organizationId, _sandboxId, type, _message, metadata) => {
        events.push({ type, metadata });
      }
    }
  );

  assert.deepEqual(result, {
    kind: "unsupported",
    message: "OpenSandbox PTY does not support per-attach environment variables yet."
  });
  assert.equal(events[0].type, "terminal.attach.failed");
  assert.equal(events[0].metadata?.message, "OpenSandbox PTY does not support per-attach environment variables yet.");
});

test("listSandboxLogs merges control-plane and provider logs chronologically", async () => {
  const logs = await listSandboxLogs(
    { organizationId: "org_runtime", sandboxId: "sbx_runtime" },
    {
      runtimeProvider: fakeRuntimeProvider({
        logs: async () => [{ ts: "2026-05-24T12:00:02.000Z", lvl: "runtime", msg: "sandbox log", source: "sandbox" }]
      }),
      query: async (text) => {
        if (text.includes("FROM sandboxes")) return { rowCount: 1, rows: [{ opensandbox_id: "provider_sbx" }] as never[] };
        if (text.includes("FROM sandbox_events")) {
          return {
            rowCount: 1,
            rows: [{ ts: new Date("2026-05-24T12:00:01.000Z"), lvl: "created", msg: "control-plane log" }] as never[]
          };
        }
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.deepEqual(logs, [
    { ts: "2026-05-24T12:00:01.000Z", lvl: "created", msg: "control-plane log", source: "control-plane" },
    { ts: "2026-05-24T12:00:02.000Z", lvl: "runtime", msg: "sandbox log", source: "sandbox" }
  ]);
});

test("getSandboxMetrics returns persisted metrics when provider metrics are unavailable", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const metrics = await getSandboxMetrics(
    { organizationId: "org_runtime", sandboxId: "sbx_runtime" },
    {
      runtimeProvider: fakeRuntimeProvider({ metrics: async () => null }),
      query: async (text, params) => {
        calls.push({ text, params });
        return { rowCount: 1, rows: [{ opensandbox_id: "provider_sbx", cpu_pct: 19, memory_mb: 512 }] as never[] };
      }
    }
  );

  assert.equal(metrics?.current.cpu, 19);
  assert.equal(metrics?.current.mem, 512);
  assert(!calls.some((call) => call.text.includes("UPDATE sandboxes SET cpu_pct")));
});

test("testSandboxEgress sends a newline-safe shell command to the runtime", async () => {
  let runInput: Parameters<RuntimeProvider["run"]>[0] | undefined;
  const result = await testSandboxEgress(
    { organizationId: "org_runtime", sandboxId: "sbx_runtime", target: "https://api.github.com" },
    {
      runtimeProvider: fakeRuntimeProvider({
        run: async (input) => {
          runInput = input;
          return {
            sandboxId: input.controlPlaneSandboxId,
            command: input.command,
            stdout: "",
            stderr: "",
            exitCode: 0,
            durationMs: 9
          };
        }
      }),
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      actorUserId: "user_runtime",
      actorLabel: "runtime@test.local",
      query: async (text, params) => {
        assert.match(text, /SELECT id, opensandbox_id, status FROM sandboxes/);
        assert.deepEqual(params, ["sbx_runtime", "org_runtime"]);
        return { rowCount: 1, rows: [{ id: "sbx_runtime", opensandbox_id: "provider_sbx", status: "running" }] as never[] };
      }
    }
  );

  assert.equal(result.kind, "ok");
  assert.ok(runInput);
  assert.equal(runInput.providerSandboxId, "provider_sbx");
  assert.equal(runInput.controlPlaneSandboxId, "sbx_runtime");
  assert.match(runInput.command, /^HARAKIRI_EGRESS_TEST_TARGET='https:\/\/api\.github\.com\/' sh -lc '/);
  assert.match(runInput.command, /\ntarget="\$HARAKIRI_EGRESS_TEST_TARGET"/);
  assert.doesNotMatch(runInput.command, /sh -lc "\\n/);
  if (result.kind === "ok") assert.equal(result.response.status, "reachable");
});

test("createSandboxRoute exposes through the runtime provider and records audit/event", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const events: Array<{ type: string; message: string; metadata?: Record<string, unknown> }> = [];
  const audits: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
  const result = await createSandboxRoute(
    {
      organizationId: "org_runtime",
      actorUserId: "user_runtime",
      actorLabel: "runtime@test.local",
      sandboxId: "sbx_runtime",
      port: 3000,
      protocol: "http",
      accessMode: "public",
      labels: ["dev-server", "preview"]
    },
    {
      runtimeProvider: fakeRuntimeProvider({
        exposeRoute: async (input) => {
          assert.equal(input.provider, "fake");
          assert.equal(input.providerSandboxId, "provider_sbx");
          return {
            routeKey: "provider-route",
            host: "provider-route.example.test",
            url: "https://provider-route.example.test",
            targetUrl: "http://provider-route:3000",
            provider: "fake",
            providerRouteId: "route_provider",
            state: "ready"
          };
        }
      }),
      recordEvent: async (_organizationId, _sandboxId, type, message, metadata) => {
        events.push({ type, message, metadata });
      },
      recordAudit: async (_organizationId, _actorUserId, _actorLabel, action, _targetType, _targetId, metadata) => {
        audits.push({ action, metadata });
      },
      query: async (text, params) => {
        calls.push({ text, params });
        if (text.includes("SELECT id, opensandbox_id, status FROM sandboxes")) {
          return { rowCount: 1, rows: [{ id: "sbx_runtime", opensandbox_id: "provider_sbx", status: "running" }] as never[] };
        }
        if (text.includes("FROM sandbox_routes") && text.includes("AND port = $3") && !text.includes("SELECT count(*)")) {
          if (calls.filter((call) => call.text.includes("FROM sandbox_routes") && call.text.includes("AND port = $3")).length === 1) {
            return { rowCount: 0, rows: [] as never[] };
          }
          return {
            rowCount: 1,
            rows: [{
              port: 3000,
              protocol: "http",
              accessMode: "public",
              accessHeaderName: null,
              tokenHint: null,
              labels: ["dev-server", "preview"],
              createdByUserId: "user_runtime",
              createdByLabel: "runtime@test.local",
              routeKey: "provider-route",
              host: "provider-route.example.test",
              url: "https://provider-route.example.test",
              targetUrl: "http://provider-route:3000",
              state: "ready",
              provider: "fake",
              providerRouteId: "route_provider"
            }] as never[]
          };
        }
        if (text.includes("SELECT count(*)")) return { rowCount: 1, rows: [{ count: "0" }] as never[] };
        if (text.includes("INSERT INTO sandbox_operations")) {
          return {
            rowCount: 1,
            rows: [{ id: "op_route", sandboxId: "sbx_runtime", kind: "route_expose", state: "queued", request: {}, result: {} }] as never[]
          };
        }
        if (text.includes("FROM sandbox_operations") && text.includes("FOR UPDATE")) {
          return {
            rowCount: 1,
            rows: [{ id: "op_route", sandboxId: "sbx_runtime", kind: "route_expose", state: "queued", request: {}, result: {} }] as never[]
          };
        }
        if (text.includes("UPDATE sandbox_operations")) {
          return {
            rowCount: 1,
            rows: [{ id: "op_route", sandboxId: "sbx_runtime", kind: "route_expose", state: "succeeded", request: {}, result: {} }] as never[]
          };
        }
        if (text.includes("INSERT INTO sandbox_routes")) return { rowCount: 1, rows: [] as never[] };
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "created");
  if (result.kind === "created") assert.equal(result.route.routeKey, "provider-route");
  const insert = calls.find((call) => call.text.includes("INSERT INTO sandbox_routes"));
  assert.ok(insert);
  assert.match(insert.text, /ON CONFLICT \(sandbox_id, port\) WHERE state <> 'terminated'/);
  assert.deepEqual(insert.params?.slice(0, 6), ["sbx_runtime", "org_runtime", 3000, "http", "provider-route", "provider-route.example.test"]);
  assert.deepEqual(insert.params?.slice(11, 15), ["public", null, null, null]);
  assert.deepEqual(insert.params?.slice(15, 18), ["user_runtime", "runtime@test.local", ["dev-server", "preview"]]);
  assert(calls.some((call) => call.text.includes("INSERT INTO sandbox_operations")));
  assert.equal(events[0].type, "route.created");
  assert.equal(events[0].metadata?.operationId, "op_route");
  assert.equal(events[0].metadata?.accessMode, "public");
  assert.deepEqual(events[0].metadata?.labels, ["dev-server", "preview"]);
  assert.equal(audits[0].action, "sandbox.route.create");
});

test("createSandboxRoute can return an enforceable token-protected proxy route", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const token = "hrt_fixed_route_token";
  const result = await createSandboxRoute(
    {
      organizationId: "org_runtime",
      actorUserId: "user_runtime",
      actorLabel: "runtime@test.local",
      sandboxId: "sbx_runtime",
      port: 5173,
      protocol: "http",
      accessMode: "token"
    },
    {
      runtimeProvider: fakeRuntimeProvider({
        exposeRoute: async () => ({
          routeKey: "provider-route",
          host: "provider-route.example.test",
          url: "https://provider-route.example.test",
          targetUrl: "http://provider-route:5173",
          provider: "fake",
          providerRouteId: "route_provider",
          state: "ready"
        })
      }),
      idFactory: () => token,
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      query: async (text, params) => {
        calls.push({ text, params });
        if (text.includes("SELECT id, opensandbox_id, status FROM sandboxes")) {
          return { rowCount: 1, rows: [{ id: "sbx_runtime", opensandbox_id: "provider_sbx", status: "running" }] as never[] };
        }
        if (text.includes("FROM sandbox_routes") && text.includes("AND port = $3") && !text.includes("SELECT count(*)")) {
          if (calls.filter((call) => call.text.includes("FROM sandbox_routes") && call.text.includes("AND port = $3")).length === 1) {
            return { rowCount: 0, rows: [] as never[] };
          }
          return {
            rowCount: 1,
            rows: [{
              port: 5173,
              protocol: "http",
              accessMode: "token",
              accessHeaderName: "x-harakiri-route-token",
              tokenHint: "hrt_fixe...oken",
              labels: [],
              routeKey: "provider-route",
              host: "127.0.0.1:18082",
              url: "http://127.0.0.1:18082/v1/route-proxy/provider-route/",
              targetUrl: "http://provider-route:5173",
              state: "ready",
              provider: "fake",
              providerRouteId: "route_provider"
            }] as never[]
          };
        }
        if (text.includes("SELECT count(*)")) return { rowCount: 1, rows: [{ count: "0" }] as never[] };
        if (text.includes("INSERT INTO sandbox_operations")) {
          return { rowCount: 1, rows: [{ id: "op_route", sandboxId: "sbx_runtime", kind: "route_expose", state: "queued", request: {}, result: {} }] as never[] };
        }
        if (text.includes("FROM sandbox_operations") && text.includes("FOR UPDATE")) {
          return { rowCount: 1, rows: [{ id: "op_route", sandboxId: "sbx_runtime", kind: "route_expose", state: "queued", request: {}, result: {} }] as never[] };
        }
        if (text.includes("UPDATE sandbox_operations")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("INSERT INTO sandbox_routes")) return { rowCount: 1, rows: [] as never[] };
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "created");
  if (result.kind === "created") {
    assert.equal(result.route.accessMode, "token");
    assert.equal(result.accessToken, token);
    assert.equal(result.accessHeaderName, "x-harakiri-route-token");
    assert.match(result.route.url, /\/v1\/route-proxy\/provider-route\/$/);
  }
  const insert = calls.find((call) => call.text.includes("INSERT INTO sandbox_routes"));
  assert.ok(insert);
  assert.match(insert.text, /ON CONFLICT \(sandbox_id, port\) WHERE state <> 'terminated'/);
  assert.equal(insert.params?.[7], "http://provider-route:5173");
  assert.deepEqual(insert.params?.slice(11, 15), ["token", hashApiKey(token), "hrt_fixe...oken", "x-harakiri-route-token"]);
});

test("sandbox routes expose only active entries and can be re-used after deletion", async () => {
  const routeRow = {
    id: "sbr_active",
    port: 3000,
    protocol: "http",
    accessMode: "public",
    accessHeaderName: null,
    tokenHint: null,
    labels: [],
    routeKey: "provider-route",
    host: "provider-route.example.test",
    url: "https://provider-route.example.test",
    targetUrl: "http://provider-route:3000",
    state: "ready",
    provider: "fake",
    providerRouteId: "route_provider",
    createdAt: "2026-05-29T00:00:00.000Z",
    lastCheckedAt: "2026-05-29T00:00:00.000Z",
    lastUsedAt: null,
    terminatedAt: null
  };
  const calls: Array<{ text: string; params?: unknown[] }> = [];

  const listed = await listSandboxRoutes(
    { organizationId: "org_runtime", sandboxId: "sbx_runtime" },
    async (text, params) => {
      calls.push({ text, params });
      if (text.includes("SELECT opensandbox_id FROM sandboxes")) {
        return { rowCount: 1, rows: [{ opensandbox_id: "provider_sbx" }] as never[] };
      }
      if (text.includes("FROM sandbox_routes")) {
        assert.match(text, /state <> 'terminated'/);
        return { rowCount: 1, rows: [routeRow] as never[] };
      }
      throw new Error(`unexpected query: ${text}`);
    }
  );

  assert.equal(listed?.length, 1);
  assert.equal(listed?.[0]?.state, "ready");

  const deleted = await deleteSandboxRoute(
    {
      organizationId: "org_runtime",
      actorUserId: "user_runtime",
      actorLabel: "runtime@test.local",
      sandboxId: "sbx_runtime",
      port: 3000
    },
    {
      recordEvent: async () => undefined,
      recordAudit: async () => undefined,
      query: async (text, params) => {
        calls.push({ text, params });
        if (text.includes("FROM sandbox_routes") && text.includes("AND port = $3") && text.includes("state <> 'terminated'")) {
          return { rowCount: 1, rows: [routeRow] as never[] };
        }
        if (text.includes("UPDATE sandbox_routes")) {
          assert.match(text, /state <> 'terminated'/);
          return { rowCount: 1, rows: [] as never[] };
        }
        if (text.includes("FROM sandbox_routes") && text.includes("AND port = $3")) {
          return { rowCount: 1, rows: [{ ...routeRow, state: "terminated", terminatedAt: "2026-05-29T00:01:00.000Z" }] as never[] };
        }
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(deleted?.state, "terminated");
});

test("getSandboxRouteProxyTarget validates token route access", async () => {
  const token = "hrt_proxy_test";
  const ok = await getSandboxRouteProxyTarget(
    { routeKey: "provider-route", token },
    async () => ({
      rowCount: 1,
      rows: [{
        routeKey: "provider-route",
        targetUrl: "https://provider-route.example.test",
        state: "ready",
        accessMode: "token",
        accessTokenHash: hashApiKey(token),
        accessHeaderName: "x-harakiri-route-token"
      }] as never[]
    })
  );
  assert.deepEqual(ok, { kind: "ok", targetUrl: "https://provider-route.example.test", headerName: "x-harakiri-route-token" });

  const unauthorized = await getSandboxRouteProxyTarget(
    { routeKey: "provider-route", token: "wrong" },
    async () => ({
      rowCount: 1,
      rows: [{
        routeKey: "provider-route",
        targetUrl: "https://provider-route.example.test",
        state: "ready",
        accessMode: "token",
        accessTokenHash: hashApiKey(token),
        accessHeaderName: "x-harakiri-route-token"
      }] as never[]
    })
  );
  assert.deepEqual(unauthorized, { kind: "unauthorized", headerName: "x-harakiri-route-token" });
});
