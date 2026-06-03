import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import { openApiDocument } from "@harakiri/shared";
import WebSocket, { type RawData } from "ws";
import { registerRoutes } from "./routes.js";
import { hashApiKey } from "./crypto.js";
import type { RuntimeListFilesInput, RuntimeProvider, RuntimeRunInput } from "./providers/runtime/provider.js";

const fakeAuth = async (request: FastifyRequest): Promise<undefined> => {
  request.auth = {
    userId: "user_route",
    organizationId: "org_route",
    actorLabel: "route@test.local",
    authType: "dev"
  };
  return undefined;
};

const routeRuntimeProvider = (state: { runInput?: RuntimeRunInput; filesInput?: RuntimeListFilesInput; filesUnavailable?: boolean }): RuntimeProvider => ({
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
  run: async (input) => {
    state.runInput = input;
    return {
      sandboxId: input.controlPlaneSandboxId,
      command: input.command,
      stdout: "route runtime ok\n",
      stderr: "",
      exitCode: 0,
      durationMs: 7
    };
  },
  files: async (input) => {
    state.filesInput = input;
    if (state.filesUnavailable) {
      return {
        ok: false,
        cwd: input.path ?? input.defaultCwd,
        defaultCwd: input.defaultCwd,
        files: [],
        error: {
          code: "runtime_files_unavailable",
          message: "provider down",
          recoverable: true
        }
      };
    }
    return {
      ok: true,
      cwd: input.path ?? input.defaultCwd,
      defaultCwd: input.defaultCwd,
      source: "fake",
      files: [{ path: `${input.defaultCwd}/agent.py`, name: "agent.py", type: "file", size: 12 }]
    };
  },
  statFile: async (input) => ({
    ok: true,
    file: { path: input.path, name: "agent.py", type: "file", size: 12 }
  }),
  readFile: async (input) => ({
    ok: true,
    path: input.path,
    encoding: input.encoding,
    content: input.encoding === "base64" ? Buffer.from("print('route')\n").toString("base64") : "print('route')\n"
  }),
  writeFile: async (input) => ({
    ok: true,
    file: { path: input.path, name: input.path.split("/").pop() ?? input.path, type: "file", size: input.content.length }
  }),
  mkdir: async (input) => ({
    ok: true,
    file: { path: input.path, name: input.path.split("/").pop() ?? input.path, type: "directory", size: 0 }
  }),
  removeFile: async (input) => ({
    ok: true,
    path: input.path
  }),
  renameFile: async (input) => ({
    ok: true,
    file: { path: input.toPath, name: input.toPath.split("/").pop() ?? input.toPath, type: "file", size: 12 }
  }),
  logs: async () => [],
  metrics: async () => null,
  exposeRoute: async () => {
    throw new Error("not used");
  }
});

const rawDataToBuffer = (data: RawData): Buffer => {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
};

test("OpenAPI contract is served without authentication", async () => {
  const app = Fastify();
  await registerRoutes(app, {
    requireAuth: async () => {
      throw new Error("openapi should not require auth");
    },
    runtimeProvider: routeRuntimeProvider({}),
    recordSandboxEvent: async () => undefined,
    recordAudit: async () => undefined,
    query: async () => {
      throw new Error("openapi should not query");
    }
  });

  try {
    const response = await app.inject({ method: "GET", url: "/openapi.json" });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), openApiDocument);
  } finally {
    await app.close();
  }
});

test("sandbox runtime routes run against an injected runtime provider", async () => {
  const app = Fastify();
  const runtimeState: { runInput?: RuntimeRunInput; filesInput?: RuntimeListFilesInput } = {};
  const queries: Array<{ text: string; params?: unknown[] }> = [];
  await registerRoutes(app, {
    requireAuth: fakeAuth,
    runtimeProvider: routeRuntimeProvider(runtimeState),
    recordSandboxEvent: async () => undefined,
    recordAudit: async () => undefined,
    query: async (text, params) => {
      queries.push({ text, params });
      if (text.includes("SELECT id, opensandbox_id FROM sandboxes WHERE id = $1")) {
        return { rowCount: 1, rows: [{ id: "sbx_route", opensandbox_id: "fake_provider" }] as never[] };
      }
      if (text.includes("COALESCE(v.workdir, t.workdir")) {
        return { rowCount: 1, rows: [{ opensandbox_id: "fake_provider", workdir: "/workspace" }] as never[] };
      }
      if (text.includes("UPDATE sandboxes SET last_active_at")) return { rowCount: 1, rows: [] };
      throw new Error(`unexpected query: ${text}`);
    }
  });

  try {
    const capabilities = await app.inject({
      method: "GET",
      url: "/v1/runtime/capabilities"
    });
    assert.equal(capabilities.statusCode, 200);
    const capabilityBody = JSON.parse(capabilities.body);
    assert.equal(capabilityBody.provider, "fake");
    assert.equal(capabilityBody.capabilities.find((capability: { name: string }) => capability.name === "filesystemList")?.state, "available");
    const commandsCapability = capabilityBody.capabilities.find((capability: { name: string }) => capability.name === "commands");
    const routesCapability = capabilityBody.capabilities.find((capability: { name: string }) => capability.name === "routes");
    const terminalAttachCapability = capabilityBody.capabilities.find((capability: { name: string }) => capability.name === "terminalAttach");
    const tokenRoutesCapability = capabilityBody.capabilities.find((capability: { name: string }) => capability.name === "tokenRoutes");
    const gitCapability = capabilityBody.capabilities.find((capability: { name: string }) => capability.name === "git");
    assert.equal(commandsCapability?.state, "unavailable");
    assert.equal(commandsCapability?.contract, "unavailable");
    assert.equal(routesCapability?.contract, "opensandbox_provider");
    assert.equal(terminalAttachCapability?.contract, "unavailable");
    assert.equal(tokenRoutesCapability?.contract, "harakiri_control_plane");
    assert.equal(gitCapability?.state, "degraded");
    assert.equal(gitCapability?.contract, "harakiri_control_plane");

    const run = await app.inject({
      method: "POST",
      url: "/v1/sandboxes/sbx_route/run",
      payload: {
        command: "echo route",
        cwd: "/workspace",
        env: { HARAKIRI_TEST: "ok" },
        timeoutMs: 12_000
      }
    });
    assert.equal(run.statusCode, 200);
    assert.equal(JSON.parse(run.body).result.stdout, "route runtime ok\n");
    assert.equal(runtimeState.runInput?.providerSandboxId, "fake_provider");
    assert.equal(runtimeState.runInput?.controlPlaneSandboxId, "sbx_route");
    assert.equal(runtimeState.runInput?.cwd, "/workspace");
    assert.deepEqual(runtimeState.runInput?.env, { HARAKIRI_TEST: "ok" });
    assert.equal(runtimeState.runInput?.timeoutMs, 12_000);

    const files = await app.inject({
      method: "GET",
      url: "/v1/sandboxes/sbx_route/files"
    });
    assert.equal(files.statusCode, 200);
    assert.equal(JSON.parse(files.body).cwd, "/workspace");
    assert.equal(runtimeState.filesInput?.providerSandboxId, "fake_provider");
    assert.equal(runtimeState.filesInput?.defaultCwd, "/workspace");
    assert.ok(queries.some((query) => query.text.includes("UPDATE sandboxes SET last_active_at")));

    const read = await app.inject({
      method: "GET",
      url: "/v1/sandboxes/sbx_route/files/read?path=%2Fworkspace%2Fagent.py"
    });
    assert.equal(read.statusCode, 200);
    assert.equal(JSON.parse(read.body).content, "print('route')\n");

    const write = await app.inject({
      method: "PUT",
      url: "/v1/sandboxes/sbx_route/files",
      payload: { path: "/workspace/out.txt", content: "ok", createParents: true }
    });
    assert.equal(write.statusCode, 200);
    assert.equal(JSON.parse(write.body).file.path, "/workspace/out.txt");

    const upload = await app.inject({
      method: "POST",
      url: "/v1/sandboxes/sbx_route/files/upload",
      payload: { path: "/workspace/out.bin", contentBase64: Buffer.from("ok").toString("base64"), sizeBytes: 2, createParents: true }
    });
    assert.equal(upload.statusCode, 200);
    assert.equal(JSON.parse(upload.body).sizeBytes, 2);
    assert.match(JSON.parse(upload.body).sha256, /^sha256:[a-f0-9]{64}$/);

    const download = await app.inject({
      method: "GET",
      url: "/v1/sandboxes/sbx_route/files/download?path=%2Fworkspace%2Fagent.py"
    });
    assert.equal(download.statusCode, 200);
    assert.equal(JSON.parse(download.body).contentBase64, Buffer.from("print('route')\n").toString("base64"));

    const rename = await app.inject({
      method: "POST",
      url: "/v1/sandboxes/sbx_route/files/rename",
      payload: { fromPath: "/workspace/out.txt", toPath: "/workspace/done.txt" }
    });
    assert.equal(rename.statusCode, 200);
    assert.equal(JSON.parse(rename.body).file.path, "/workspace/done.txt");
  } finally {
    await app.close();
  }
});

test("sandbox terminal attach route bridges an authenticated WebSocket through the runtime provider", async () => {
  const app = Fastify();
  const runtimeState: {
    attachedFrame?: Buffer;
    cwd?: string;
    shell?: string;
    env?: Record<string, string>;
    sessionName?: string;
    deletedSession?: string;
  } = {};
  const runtimeProvider: RuntimeProvider = {
    ...routeRuntimeProvider({}),
    capabilities: {
      terminal: true,
      terminalAttach: true,
      terminalResize: true,
      shellSessions: true,
      filesystem: true,
      logs: true,
      metrics: true,
      routes: true
    },
    createPtySession: async (input) => {
      runtimeState.cwd = input.cwd;
      runtimeState.shell = input.shell;
      runtimeState.env = input.env;
      runtimeState.sessionName = input.sessionName;
      return { providerSessionId: "pty_route" };
    },
    attachPtySession: async (input) => new Promise<void>((resolve) => {
      input.client.send(JSON.stringify({ type: "connected", session_id: input.providerSessionId, mode: "pty" }));
      input.client.once("message", (data) => {
        runtimeState.attachedFrame = rawDataToBuffer(data);
        input.client.close(1000, "test complete");
        resolve();
      });
    }),
    deletePtySession: async (input) => {
      runtimeState.deletedSession = input.providerSessionId;
    }
  };
  const events: string[] = [];
  await registerRoutes(app, {
    requireAuth: fakeAuth,
    runtimeProvider,
    recordSandboxEvent: async (_organizationId, _sandboxId, type) => {
      events.push(type);
    },
    recordAudit: async () => undefined,
    query: async (text, params) => {
      if (text.includes("SELECT s.id, s.opensandbox_id")) {
        assert.deepEqual(params, ["sbx_route", "org_route"]);
        return { rowCount: 1, rows: [{ id: "sbx_route", opensandboxId: "fake_provider", status: "running", workdir: "/workspace" }] as never[] };
      }
      if (text.includes("UPDATE sandboxes SET last_active_at")) {
        assert.deepEqual(params, ["sbx_route", "org_route"]);
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`unexpected query: ${text}`);
    }
  });

  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  try {
    const wsUrl = address.replace(/^http:/, "ws:");
    await new Promise<void>((resolve, reject) => {
      const client = new WebSocket(
        `${wsUrl}/v1/sandboxes/sbx_route/terminal/attach?cwd=%2Fworkspace&shell=%2Fbin%2Fbash&env=FOO%3Dbar&env=BAZ%3Dqux&sessionName=route-test`
      );
      client.on("message", (data) => {
        const frame = JSON.parse(rawDataToBuffer(data).toString("utf8")) as { type?: string };
        if (frame.type === "connected") client.send(Buffer.from([0, ...Buffer.from("pwd\n")]));
      });
      client.on("error", reject);
      client.on("close", () => resolve());
    });
  } finally {
    await app.close();
  }

  assert.equal(runtimeState.cwd, "/workspace");
  assert.equal(runtimeState.shell, "/bin/bash");
  assert.deepEqual(runtimeState.env, { FOO: "bar", BAZ: "qux" });
  assert.equal(runtimeState.sessionName, "route-test");
  assert.deepEqual(runtimeState.attachedFrame, Buffer.from([0, ...Buffer.from("pwd\n")]));
  assert.equal(runtimeState.deletedSession, "pty_route");
  assert.deepEqual(events, ["terminal.attach.started", "terminal.attach.ended"]);
});

test("sandbox terminal attach route accepts one-time browser tickets without WebSocket headers", async () => {
  const app = Fastify();
  let authCalls = 0;
  let insertedTicketHash = "";
  let consumedTicket = false;
  const runtimeState: { actorLabel?: string; attachedFrame?: Buffer } = {};
  const runtimeProvider: RuntimeProvider = {
    ...routeRuntimeProvider({}),
    capabilities: {
      terminal: true,
      terminalAttach: true,
      terminalResize: true,
      shellSessions: true,
      filesystem: true,
      logs: true,
      metrics: true,
      routes: true
    },
    createPtySession: async () => ({ providerSessionId: "pty_ticket" }),
    attachPtySession: async (input) => new Promise<void>((resolve) => {
      input.client.send(JSON.stringify({ type: "connected", session_id: input.providerSessionId, mode: "pty" }));
      input.client.once("message", (data) => {
        runtimeState.attachedFrame = rawDataToBuffer(data);
        input.client.close(1000, "ticket test complete");
        resolve();
      });
    }),
    deletePtySession: async () => undefined
  };
  await registerRoutes(app, {
    requireAuth: async (request) => {
      if (request.url.includes("/terminal/attach?")) throw new Error("ticket websocket should skip header auth");
      authCalls += 1;
      return fakeAuth(request);
    },
    runtimeProvider,
    recordSandboxEvent: async (_organizationId, _sandboxId, type, _message, metadata) => {
      if (type === "terminal.attach.started") runtimeState.actorLabel = String(metadata?.actorLabel);
    },
    recordAudit: async () => undefined,
    query: async (text, params) => {
      if (text.includes("SELECT id, status FROM sandboxes")) {
        assert.deepEqual(params, ["sbx_route", "org_route"]);
        return { rowCount: 1, rows: [{ id: "sbx_route", status: "running" }] as never[] };
      }
      if (text.includes("INSERT INTO terminal_attach_tickets")) {
        insertedTicketHash = String(params?.[0]);
        assert.equal(params?.[1], "sbx_route");
        assert.equal(params?.[2], "org_route");
        assert.equal(params?.[3], "user_route");
        assert.equal(params?.[4], "route@test.local");
        assert.equal(params?.[5], "dev");
        assert.match(String(params?.[6]), /^\d{4}-\d{2}-\d{2}T/);
        return { rowCount: 1, rows: [] };
      }
      if (text.includes("UPDATE terminal_attach_tickets")) {
        assert.equal(params?.[0], insertedTicketHash);
        assert.equal(params?.[1], "sbx_route");
        if (consumedTicket) return { rowCount: 0, rows: [] };
        consumedTicket = true;
        return {
          rowCount: 1,
          rows: [{ organizationId: "org_route", userId: "user_route", actorLabel: "route@test.local", authType: "dev" }] as never[]
        };
      }
      if (text.includes("SELECT s.id, s.opensandbox_id")) {
        assert.deepEqual(params, ["sbx_route", "org_route"]);
        return { rowCount: 1, rows: [{ id: "sbx_route", opensandboxId: "fake_provider", status: "running", workdir: "/workspace" }] as never[] };
      }
      if (text.includes("UPDATE sandboxes SET last_active_at")) {
        assert.deepEqual(params, ["sbx_route", "org_route"]);
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`unexpected query: ${text}`);
    }
  });

  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  try {
    const ticketResponse = await app.inject({ method: "POST", url: "/v1/sandboxes/sbx_route/terminal/attach-ticket" });
    assert.equal(ticketResponse.statusCode, 201);
    const ticketBody = JSON.parse(ticketResponse.body) as { ticket: string; attachUrl: string; expiresAt: string };
    assert.match(ticketBody.ticket, /^hat_/);
    assert.match(ticketBody.attachUrl, /\/v1\/sandboxes\/sbx_route\/terminal\/attach\?ticket=/);
    assert.match(ticketBody.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(insertedTicketHash, hashApiKey(ticketBody.ticket));

    const wsUrl = address.replace(/^http:/, "ws:");
    await new Promise<void>((resolve, reject) => {
      const client = new WebSocket(`${wsUrl}/v1/sandboxes/sbx_route/terminal/attach?ticket=${encodeURIComponent(ticketBody.ticket)}`);
      client.on("message", (data) => {
        const frame = JSON.parse(rawDataToBuffer(data).toString("utf8")) as { type?: string };
        if (frame.type === "connected") client.send(Buffer.from([0, ...Buffer.from("whoami\n")]));
      });
      client.on("error", reject);
      client.on("close", () => resolve());
    });
  } finally {
    await app.close();
  }

  assert.equal(authCalls, 1);
  assert.equal(consumedTicket, true);
  assert.equal(runtimeState.actorLabel, "route@test.local");
  assert.deepEqual(runtimeState.attachedFrame, Buffer.from([0, ...Buffer.from("whoami\n")]));
});

test("sandbox command session routes use provider-owned persistent sessions", async () => {
  const app = Fastify();
  const runtimeState: { cwd?: string; command?: string; deletedSession?: string } = {};
  const runtimeProvider: RuntimeProvider = {
    ...routeRuntimeProvider({}),
    capabilities: {
      terminal: true,
      sessionCommands: true,
      filesystem: true,
      logs: true,
      metrics: true,
      routes: true
    },
    createCommandSession: async (input) => {
      runtimeState.cwd = input.cwd;
      return { providerSessionId: "ses_route", cwd: input.cwd ?? null };
    },
    runCommandSession: async (input) => {
      runtimeState.command = input.command;
      assert.equal(input.providerSessionId, "ses_route");
      assert.equal(input.providerSandboxId, "fake_provider");
      return { command: input.command, stdout: "/tmp\n", stderr: "", exitCode: 0, durationMs: 4 };
    },
    deleteCommandSession: async (input) => {
      runtimeState.deletedSession = input.providerSessionId;
    }
  };
  const events: string[] = [];
  await registerRoutes(app, {
    requireAuth: fakeAuth,
    runtimeProvider,
    recordSandboxEvent: async (_organizationId, _sandboxId, type) => {
      events.push(type);
    },
    recordAudit: async () => undefined,
    query: async (text, params) => {
      if (text.includes("SELECT s.id, s.opensandbox_id")) {
        assert.deepEqual(params, ["sbx_route", "org_route"]);
        return { rowCount: 1, rows: [{ id: "sbx_route", opensandboxId: "fake_provider", status: "running", workdir: "/workspace" }] as never[] };
      }
      if (text.includes("UPDATE sandboxes SET last_active_at")) {
        assert.deepEqual(params, ["sbx_route", "org_route"]);
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`unexpected query: ${text}`);
    }
  });

  try {
    const created = await app.inject({
      method: "POST",
      url: "/v1/sandboxes/sbx_route/command-sessions",
      payload: { cwd: "/workspace" }
    });
    assert.equal(created.statusCode, 201);
    assert.equal(JSON.parse(created.body).session.id, "ses_route");

    const run = await app.inject({
      method: "POST",
      url: "/v1/sandboxes/sbx_route/command-sessions/ses_route/run",
      payload: { command: "pwd", timeoutMs: 30_000 }
    });
    assert.equal(run.statusCode, 200);
    assert.equal(JSON.parse(run.body).result.stdout, "/tmp\n");

    const deleted = await app.inject({
      method: "DELETE",
      url: "/v1/sandboxes/sbx_route/command-sessions/ses_route"
    });
    assert.equal(deleted.statusCode, 200);
    assert.equal(JSON.parse(deleted.body).session.status, "closed");
  } finally {
    await app.close();
  }

  assert.equal(runtimeState.cwd, "/workspace");
  assert.equal(runtimeState.command, "pwd");
  assert.equal(runtimeState.deletedSession, "ses_route");
  assert.deepEqual(events, ["command.session.created", "command.session.run", "command.session.deleted"]);
});

test("template build routes are composed through the domain router", async () => {
  const app = Fastify();
  await registerRoutes(app, {
    requireAuth: fakeAuth,
    runtimeProvider: routeRuntimeProvider({}),
    recordSandboxEvent: async () => undefined,
    recordAudit: async () => undefined,
    query: async (text, params) => {
      if (text.includes("FROM template_builds") && text.includes("ORDER BY created_at DESC")) {
        assert.deepEqual(params, ["org_route", 1]);
        return {
          rowCount: 1,
          rows: [{
            id: "bld_route",
            organizationId: "org_route",
            templateId: "tpl_route",
            status: "failed",
            sourceType: "dockerfile",
            buildArgs: { password: "secret-value" },
            metadata: { registry_token: "secret-value" },
            error: "failed with token=secret-value",
            context: { metadata: { apiKey: "secret-value" } }
          }] as never[]
        };
      }
      throw new Error(`unexpected query: ${text}`);
    }
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1/template-builds?limit=1"
    });
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.builds[0].id, "bld_route");
    assert.equal(body.builds[0].buildArgs.password, "[redacted]");
    assert.equal(body.builds[0].metadata.registry_token, "[redacted]");
    assert.equal(body.builds[0].error, "failed with token=[redacted]");
    assert.equal(body.builds[0].context.metadata.apiKey, "[redacted]");
  } finally {
    await app.close();
  }
});

test("sandbox filesystem route returns provider unavailable as 502 instead of an empty list", async () => {
  const app = Fastify();
  await registerRoutes(app, {
    requireAuth: fakeAuth,
    runtimeProvider: routeRuntimeProvider({ filesUnavailable: true }),
    recordSandboxEvent: async () => undefined,
    recordAudit: async () => undefined,
    query: async (text) => {
      if (text.includes("COALESCE(v.workdir, t.workdir")) {
        return { rowCount: 1, rows: [{ opensandbox_id: "fake_provider", workdir: "/workspace" }] as never[] };
      }
      throw new Error(`unexpected query: ${text}`);
    }
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1/sandboxes/sbx_route/files"
    });
    assert.equal(response.statusCode, 502);
    assert.equal(JSON.parse(response.body).error.code, "runtime_files_unavailable");
  } finally {
    await app.close();
  }
});

test("sandbox runtime routes report unsupported provider capabilities as explicit errors", async () => {
  const app = Fastify();
  const {
    statFile: _statFile,
    readFile: _readFile,
    writeFile: _writeFile,
    mkdir: _mkdir,
    removeFile: _removeFile,
    renameFile: _renameFile,
    ...runtimeProvider
  } = routeRuntimeProvider({});
  await registerRoutes(app, {
    requireAuth: fakeAuth,
    runtimeProvider,
    recordSandboxEvent: async () => undefined,
    recordAudit: async () => undefined,
    query: async () => {
      throw new Error("unsupported capability checks should not query");
    }
  });

  try {
    const unsupportedCommand = await app.inject({
      method: "POST",
      url: "/v1/sandboxes/sbx_route/commands",
      payload: { command: "echo unsupported" }
    });
    assert.equal(unsupportedCommand.statusCode, 501);
    assert.equal(JSON.parse(unsupportedCommand.body).error, "runtime_command_unsupported");

    const fileChecks = [
      app.inject({ method: "GET", url: "/v1/sandboxes/sbx_route/files/stat?path=%2Fworkspace%2Fagent.py" }),
      app.inject({ method: "GET", url: "/v1/sandboxes/sbx_route/files/read?path=%2Fworkspace%2Fagent.py" }),
      app.inject({ method: "GET", url: "/v1/sandboxes/sbx_route/files/download?path=%2Fworkspace%2Fagent.py" }),
      app.inject({ method: "PUT", url: "/v1/sandboxes/sbx_route/files", payload: { path: "/workspace/out.txt", content: "ok" } }),
      app.inject({ method: "POST", url: "/v1/sandboxes/sbx_route/files/upload", payload: { path: "/workspace/out.bin", contentBase64: Buffer.from("ok").toString("base64") } }),
      app.inject({ method: "POST", url: "/v1/sandboxes/sbx_route/files/mkdir", payload: { path: "/workspace/new" } }),
      app.inject({ method: "DELETE", url: "/v1/sandboxes/sbx_route/files?path=%2Fworkspace%2Fold.txt" }),
      app.inject({ method: "POST", url: "/v1/sandboxes/sbx_route/files/rename", payload: { fromPath: "/workspace/old.txt", toPath: "/workspace/new.txt" } })
    ];
    for (const response of await Promise.all(fileChecks)) {
      assert.equal(response.statusCode, 501);
      assert.equal(JSON.parse(response.body).error, "runtime_file_operation_unsupported");
    }
  } finally {
    await app.close();
  }
});

test("token route proxy validates access and forwards without application auth", async () => {
  const app = Fastify();
  const originalFetch = globalThis.fetch;
  let upstreamUrl = "";
  let upstreamHeader = "";
  let lastUsedUpdated = false;
  globalThis.fetch = (async (url, init) => {
    upstreamUrl = String(url);
    upstreamHeader = init?.headers instanceof Headers ? init.headers.get("x-harakiri-route-token") ?? "" : "";
    return new Response("proxied", { status: 202, headers: { "content-type": "text/plain" } });
  }) as typeof fetch;
  await registerRoutes(app, {
    requireAuth: async () => {
      throw new Error("route proxy should not require application auth");
    },
    runtimeProvider: routeRuntimeProvider({}),
    recordSandboxEvent: async () => undefined,
    recordAudit: async () => undefined,
    query: async (text, params) => {
      if (text.includes("FROM sandbox_routes") && text.includes("route_key = $1")) {
        assert.deepEqual(params, ["provider-route"]);
        return {
          rowCount: 1,
          rows: [{
            id: "sbr_proxy",
            routeKey: "provider-route",
            targetUrl: "https://provider-route.example.test",
            state: "ready",
            accessMode: "token",
            accessTokenHash: hashApiKey("route-secret"),
            accessHeaderName: "x-harakiri-route-token"
          }] as never[]
        };
      }
      if (text.includes("UPDATE sandbox_routes SET last_used_at")) {
        assert.deepEqual(params, ["sbr_proxy"]);
        lastUsedUpdated = true;
        return { rowCount: 1, rows: [] as never[] };
      }
      throw new Error(`unexpected query: ${text}`);
    }
  });

  try {
    const unauthorized = await app.inject({ method: "GET", url: "/v1/route-proxy/provider-route/app" });
    assert.equal(unauthorized.statusCode, 401);

    const proxied = await app.inject({
      method: "GET",
      url: "/v1/route-proxy/provider-route/app?harakiri_route_token=route-secret&next=1"
    });
    assert.equal(proxied.statusCode, 202);
    assert.equal(proxied.body, "proxied");
    assert.equal(upstreamUrl, "https://provider-route.example.test/app?next=1");
    assert.equal(upstreamHeader, "");
    assert.equal(lastUsedUpdated, true);
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});
