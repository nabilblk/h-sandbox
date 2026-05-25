import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import { openApiDocument } from "@harakiri/shared";
import { registerRoutes } from "./routes.js";
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
  logs: async () => [],
  metrics: async () => null,
  exposeRoute: async () => {
    throw new Error("not used");
  }
});

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
    const run = await app.inject({
      method: "POST",
      url: "/v1/sandboxes/sbx_route/run",
      payload: { command: "echo route" }
    });
    assert.equal(run.statusCode, 200);
    assert.equal(JSON.parse(run.body).result.stdout, "route runtime ok\n");
    assert.equal(runtimeState.runInput?.providerSandboxId, "fake_provider");
    assert.equal(runtimeState.runInput?.controlPlaneSandboxId, "sbx_route");

    const files = await app.inject({
      method: "GET",
      url: "/v1/sandboxes/sbx_route/files"
    });
    assert.equal(files.statusCode, 200);
    assert.equal(JSON.parse(files.body).cwd, "/workspace");
    assert.equal(runtimeState.filesInput?.providerSandboxId, "fake_provider");
    assert.equal(runtimeState.filesInput?.defaultCwd, "/workspace");
    assert.ok(queries.some((query) => query.text.includes("UPDATE sandboxes SET last_active_at")));
  } finally {
    await app.close();
  }
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
