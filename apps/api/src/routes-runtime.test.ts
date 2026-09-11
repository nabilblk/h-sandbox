import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import {
  credentialProviderPresetCatalog,
  credentialProviderPresetIds,
  openApiDocument,
  type CredentialVaultProviderState
} from "@harakiri/shared";
import WebSocket, { type RawData } from "ws";
import { registerRoutes as registerDefaultRoutes } from "./routes.js";
import type { Transaction } from "./db.js";
import { capacityFixture } from "./test-support/capacity-fixture.js";
import { hashApiKey } from "./crypto.js";
import type {
  RuntimeCredentialVaultApplyInput,
  RuntimeListFilesInput,
  RuntimeProvider,
  RuntimeRunInput
} from "./providers/runtime/provider.js";

const leaseTransaction: Transaction = capacityFixture(async (text) => {
  if (text.includes("FOR UPDATE")) return { rows: [{ opensandbox_id: "fake_provider", ttl_seconds: 300, status: "running", expires_at: null, provider_expires_at: null }] as never[] };
  if (text.includes("SELECT clock_timestamp")) return { rows: [{ now: new Date() }] as never[] };
  return { rows: [], rowCount: 1 };
}, { sandboxId: "sbx_route", organizationId: "org_route", providerId: "fake_provider", status: "running" }).transaction;
const registerRoutes = (app: Parameters<typeof registerDefaultRoutes>[0], dependencies: Parameters<typeof registerDefaultRoutes>[1] = {}) =>
  registerDefaultRoutes(app, { transaction: leaseTransaction, ...dependencies,
    ...(dependencies.query ? { query: async (text, params) => {
      if (text.includes("SELECT m.role FROM memberships")) return { rows: [{ role: "admin" }] as never[], rowCount: 1 };
      return dependencies.query!(text, params);
    } } : {})
  });

const fakeAuth = async (request: FastifyRequest): Promise<undefined> => {
  request.auth = {
    userId: "user_route",
    organizationId: "org_route",
    actorLabel: "route@test.local",
    authType: "keycloak",
    subject: "route-subject",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    role: "admin"
  };
  return undefined;
};

const routeRuntimeProvider = (state: {
  renewed?: boolean;
  runInput?: RuntimeRunInput;
  runStdout?: string;
  runExitCode?: number;
  filesInput?: RuntimeListFilesInput;
  filesUnavailable?: boolean;
  credentialVaultInput?: RuntimeCredentialVaultApplyInput;
  credentialVaultState?: CredentialVaultProviderState | null;
}): RuntimeProvider => ({
  kind: "fake",
  capabilities: {
    terminal: true,
    filesystem: true,
    logs: true,
    metrics: true,
    routes: true,
    credentialVault: true,
    credentialVaultPatch: true,
    credentialVaultSanitizedRead: true
  },
  create: async () => {
    throw new Error("not used");
  },
  list: async () => [],
  get: async () => ({ provider: "fake", providerSandboxId: "fake_provider", state: "running", expiresAt: null }),
  delete: async () => undefined,
  renew: async () => { state.renewed = true; },
  run: async (input) => {
    state.runInput = input;
    return {
      sandboxId: input.controlPlaneSandboxId,
      command: input.command,
      stdout: state.runStdout ?? "route runtime ok\n",
      stderr: "",
      exitCode: state.runExitCode ?? 0,
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
  },
  applyCredentialVault: async (input) => {
    state.credentialVaultInput = input;
    return {
      revision: 9,
      credentials: input.credentials.map((credential) => ({ name: credential.name, sourceType: "runtime", revision: 9 })),
      bindings: input.bindings.map((binding) => ({ name: binding.name, revision: 9, auth: { type: binding.auth.type } }))
    };
  },
  getCredentialVault: async () => state.credentialVaultState ?? null
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

test("credential preset routes expose sanitized built-in catalog entries", async () => {
  const app = Fastify();
  await registerRoutes(app, {
    requireAuth: fakeAuth,
    runtimeProvider: routeRuntimeProvider({}),
    recordSandboxEvent: async () => undefined,
    recordAudit: async () => undefined,
    query: async () => {
      throw new Error("credential preset routes should not query");
    }
  });

  try {
    const list = await app.inject({ method: "GET", url: "/v1/credential-presets" });
    assert.equal(list.statusCode, 200);
    const listBody = JSON.parse(list.body);
    assert.deepEqual(listBody.presets.map((preset: { id: string }) => preset.id), [...credentialProviderPresetIds]);
    assert.equal(JSON.stringify(listBody).includes("sk_"), false);

    const openai = await app.inject({ method: "GET", url: "/v1/credential-presets/openai" });
    assert.equal(openai.statusCode, 200);
    assert.deepEqual(JSON.parse(openai.body).preset, credentialProviderPresetCatalog.openai);

    const missing = await app.inject({ method: "GET", url: "/v1/credential-presets/not-real" });
    assert.equal(missing.statusCode, 404);
    assert.equal(JSON.parse(missing.body).error, "credential_preset_not_found");
  } finally {
    await app.close();
  }
});

test("credential secret routes separate member use from admin management", async () => {
  const row = {
    id: "vlt_openai",
    name: "openai-prod",
    providerPresetId: "openai",
    sourceType: "harakiri_encrypted",
    memberUseAllowed: false,
    version: 1,
    fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
    binding: credentialProviderPresetCatalog.openai.binding,
    egressDomains: ["api.openai.com"],
    hasEncryptedSecret: true,
    metadata: { token: "[redacted]" },
    createdByUserId: "user_route",
    createdByLabel: "route@test.local",
    rotatedAt: null,
    disabledAt: null,
    deletedAt: null,
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z"
  };
  const app = Fastify();
  let role = "member";
  await registerRoutes(app, {
    requireAuth: fakeAuth,
    runtimeProvider: routeRuntimeProvider({}),
    recordSandboxEvent: async () => undefined,
    recordAudit: async () => undefined,
    query: async (text, params) => {
      if (text.includes("SELECT role FROM memberships")) return { rowCount: 1, rows: [{ role }] as never[] };
      if (text.includes("SET member_use_allowed = $3")) {
        row.memberUseAllowed = Boolean(params?.[2]);
        return { rowCount: 1, rows: [{ id: row.id }] as never[] };
      }
      if (text.includes("FROM workspace_credential_secrets")) {
        const visible = !text.includes("member_use_allowed = true") || row.memberUseAllowed;
        return { rowCount: visible ? 1 : 0, rows: visible ? [row] as never[] : [] };
      }
      throw new Error(`unexpected query: ${text}`);
    }
  });

  try {
    const memberList = await app.inject({ method: "GET", url: "/v1/credential-secrets" });
    assert.equal(memberList.statusCode, 200);
    assert.deepEqual(JSON.parse(memberList.body).secrets, []);

    const forbiddenUpdate = await app.inject({
      method: "PATCH",
      url: "/v1/credential-secrets/vlt_openai",
      payload: { usePolicy: "organization_members" }
    });
    assert.equal(forbiddenUpdate.statusCode, 403);
    assert.equal(JSON.parse(forbiddenUpdate.body).error, "credential_secret_forbidden");

    role = "admin";
    const allowed = await app.inject({ method: "GET", url: "/v1/credential-secrets" });
    assert.equal(allowed.statusCode, 200);
    const body = JSON.parse(allowed.body);
    assert.equal(body.secrets[0].id, "vlt_openai");
    assert.equal(body.secrets[0].status, "active");
    assert.equal(body.secrets[0].usePolicy, "admins_only");
    assert.equal(JSON.stringify(body).includes("real-secret"), false);

    const shared = await app.inject({
      method: "PATCH",
      url: "/v1/credential-secrets/vlt_openai",
      payload: { usePolicy: "organization_members" }
    });
    assert.equal(shared.statusCode, 200);
    assert.equal(JSON.parse(shared.body).secret.usePolicy, "organization_members");

    role = "member";
    const sharedMemberList = await app.inject({ method: "GET", url: "/v1/credential-secrets" });
    assert.equal(sharedMemberList.statusCode, 200);
    assert.equal(JSON.parse(sharedMemberList.body).secrets[0].id, "vlt_openai");

    role = "admin";

    const invalid = await app.inject({
      method: "POST",
      url: "/v1/credential-secrets",
      payload: {
        name: "bad-secret",
        providerPresetId: "openai",
        value: "real-secret",
        fakeEnv: { OPENAI_API_KEY: "real-secret" }
      }
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(JSON.parse(invalid.body).error, "credential_secret_invalid");
  } finally {
    await app.close();
  }
});

test("sandbox runtime routes run against an injected runtime provider", async () => {
  const app = Fastify();
  const runtimeState: { runInput?: RuntimeRunInput; filesInput?: RuntimeListFilesInput; renewed?: boolean } = {};
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
    const detachedCommandsCapability = capabilityBody.capabilities.find((capability: { name: string }) => capability.name === "detachedCommands");
    const commandLogTailCapability = capabilityBody.capabilities.find((capability: { name: string }) => capability.name === "commandLogTail");
    const commandKillCapability = capabilityBody.capabilities.find((capability: { name: string }) => capability.name === "commandKill");
    const routesCapability = capabilityBody.capabilities.find((capability: { name: string }) => capability.name === "routes");
    const terminalAttachCapability = capabilityBody.capabilities.find((capability: { name: string }) => capability.name === "terminalAttach");
    const tokenRoutesCapability = capabilityBody.capabilities.find((capability: { name: string }) => capability.name === "tokenRoutes");
    const gitCapability = capabilityBody.capabilities.find((capability: { name: string }) => capability.name === "git");
    const lifecycleRenewCapability = capabilityBody.capabilities.find((capability: { name: string }) => capability.name === "lifecycleRenew");
    const lifecycleReconnectCapability = capabilityBody.capabilities.find((capability: { name: string }) => capability.name === "lifecycleReconnect");
    const lifecycleSnapshotCapability = capabilityBody.capabilities.find((capability: { name: string }) => capability.name === "lifecycleSnapshot");
    assert.equal(lifecycleRenewCapability?.state, "available");
    assert.equal(lifecycleRenewCapability?.contract, "opensandbox_spec");
    assert.equal(lifecycleReconnectCapability?.contract, "harakiri_control_plane");
    assert.equal(lifecycleSnapshotCapability?.state, "unavailable");
    assert.equal(lifecycleSnapshotCapability?.contract, "unavailable");
    assert.equal(commandsCapability?.state, "unavailable");
    assert.equal(commandsCapability?.contract, "unavailable");
    assert.equal(detachedCommandsCapability?.state, "unavailable");
    assert.equal(commandLogTailCapability?.contract, "unavailable");
    assert.equal(commandKillCapability?.contract, "unavailable");
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
    assert.equal(runtimeState.renewed, true, "command activity must renew the provider, not only a local timestamp");

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
    assert.deepEqual(JSON.parse(upload.body).transfer, { mode: "json-base64", encoding: "base64", maxBytes: 16 * 1024 * 1024 });

    const download = await app.inject({
      method: "GET",
      url: "/v1/sandboxes/sbx_route/files/download?path=%2Fworkspace%2Fagent.py"
    });
    assert.equal(download.statusCode, 200);
    assert.equal(JSON.parse(download.body).contentBase64, Buffer.from("print('route')\n").toString("base64"));
    assert.deepEqual(JSON.parse(download.body).transfer, { mode: "json-base64", encoding: "base64", maxBytes: 16 * 1024 * 1024 });

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

test("sandbox credential test route returns sanitized binding diagnostics", async () => {
  const app = Fastify();
  const runtimeState: { runInput?: RuntimeRunInput; runStdout?: string } = { runStdout: "http_status=200\n" };
  await registerRoutes(app, {
    requireAuth: fakeAuth,
    runtimeProvider: routeRuntimeProvider(runtimeState),
    recordSandboxEvent: async () => undefined,
    recordAudit: async () => undefined,
    query: async (text, params) => {
      if (text.includes("FROM sandboxes WHERE id = $1 AND organization_id = $2")) {
        return { rowCount: 1, rows: [{ id: "sbx_route", opensandboxId: "fake_provider", status: "running" }] as never[] };
      }
      if (text.includes("FROM sandbox_credential_attachments")) {
        return {
          rowCount: 1,
          rows: [{
            id: "sca_route",
            sandboxId: "sbx_route",
            displayName: "Private API",
            sourceType: "inline_ephemeral",
            sourceRef: null,
            credentialName: "cred_api",
            bindingName: "api-header",
            match: { schemes: ["https"], hosts: ["api.example.com"], methods: ["GET"], paths: ["/v1/*"] },
            auth: { type: "bearer" },
            fakeEnv: { PRIVATE_API_KEY: "fake-key" },
            status: "injected",
            provider: "fake",
            providerRevision: 1,
            providerMetadata: {},
            lastError: null,
            injectedAt: "2026-09-03T00:00:00.000Z",
            detachedAt: null,
            createdByUserId: "user_route",
            createdByLabel: "route@test.local",
            createdAt: "2026-09-03T00:00:00.000Z",
            updatedAt: "2026-09-03T00:00:00.000Z"
          }] as never[]
        };
      }
      throw new Error(`unexpected query: ${text} ${JSON.stringify(params)}`);
    }
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/sandboxes/sbx_route/credentials/sca_route/test",
      payload: { target: "https://api.example.com/v1/health" }
    });
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.ok, true);
    assert.equal(body.status, "reachable");
    assert.equal(body.httpStatus, 200);
    assert.equal(runtimeState.runInput?.providerSandboxId, "fake_provider");
    assert.equal(runtimeState.runInput?.command.includes("PRIVATE_API_KEY"), false);
  } finally {
    await app.close();
  }
});

test("sandbox credential inspect route reports sanitized provider presence", async () => {
  const app = Fastify();
  const attachment = {
    id: "sca_route",
    sandboxId: "sbx_route",
    displayName: "Private API",
    sourceType: "inline_ephemeral",
    sourceRef: null,
    credentialName: "cred_api",
    bindingName: "api-header",
    match: { schemes: ["https"], hosts: ["api.example.com"] },
    auth: { type: "bearer" },
    fakeEnv: { PRIVATE_API_KEY: "fake-key" },
    status: "injected",
    provider: "fake",
    providerRevision: 1,
    providerState: "unknown",
    providerCheckedAt: null as string | null,
    providerMetadata: {},
    sourceMetadata: {},
    expiresAt: null,
    refreshAttemptedAt: null,
    refreshedAt: null,
    lastError: null as string | null,
    injectedAt: "2026-09-03T00:00:00.000Z",
    detachedAt: null,
    createdByUserId: "user_route",
    createdByLabel: "route@test.local",
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z"
  };
  const runtimeState = {
    credentialVaultState: {
      revision: 7,
      credentials: [{ name: "cred_api", sourceType: "runtime", revision: 7 }],
      bindings: [{ name: "api-header", revision: 7, auth: { type: "bearer" } }]
    }
  };
  await registerRoutes(app, {
    requireAuth: fakeAuth,
    runtimeProvider: routeRuntimeProvider(runtimeState),
    recordSandboxEvent: async () => undefined,
    recordAudit: async () => undefined,
    query: async (text, params) => {
      if (text.includes("FROM sandboxes WHERE id = $1 AND organization_id = $2")) {
        return { rowCount: 1, rows: [{ id: "sbx_route", opensandboxId: "fake_provider", status: "running" }] as never[] };
      }
      if (text.includes("SET provider_state = $4")) {
        attachment.providerState = params?.[3] as string;
        attachment.providerCheckedAt = "2026-09-03T00:00:01.000Z";
        attachment.providerRevision = params?.[4] as number;
        return { rowCount: 1, rows: [] };
      }
      if (text.includes("FROM sandbox_credential_attachments")) {
        return { rowCount: 1, rows: [attachment] as never[] };
      }
      throw new Error(`unexpected query: ${text} ${JSON.stringify(params)}`);
    }
  });

  try {
    const response = await app.inject({ method: "POST", url: "/v1/sandboxes/sbx_route/credentials/inspect" });
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.attachments[0].providerState, "present");
    assert.equal(body.attachments[0].providerRevision, 7);
    assert.equal(body.vault.revision, 7);
    assert.equal(JSON.stringify(body).includes("fake-key"), true);
    assert.equal(JSON.stringify(body).includes("real-secret"), false);
  } finally {
    await app.close();
  }
});

test("sandbox credential rehydrate route returns sanitized attachment summary", async () => {
  const app = Fastify();
  const runtimeState: { credentialVaultInput?: RuntimeCredentialVaultApplyInput } = {};
  await registerRoutes(app, {
    requireAuth: fakeAuth,
    runtimeProvider: routeRuntimeProvider(runtimeState),
    recordSandboxEvent: async () => undefined,
    recordAudit: async () => undefined,
    query: async (text, params) => {
      if (text.includes("FROM sandboxes WHERE id = $1 AND organization_id = $2")) {
        return { rowCount: 1, rows: [{ id: "sbx_route", opensandboxId: "fake_provider", status: "running" }] as never[] };
      }
      if (text.includes("FROM sandbox_credential_attachments") && text.includes("status = 'requires_reinjection'")) {
        return {
          rowCount: 1,
          rows: [{
            id: "sca_route",
            sandboxId: "sbx_route",
            displayName: "Ephemeral API",
            sourceType: "inline_ephemeral",
            sourceRef: null,
            credentialName: "cred_api",
            bindingName: "api-header",
            match: { schemes: ["https"], hosts: ["api.example.com"] },
            auth: { type: "bearer" },
            fakeEnv: { PRIVATE_API_KEY: "fake-key" },
            status: "requires_reinjection",
            provider: "fake",
            providerRevision: 1,
            providerMetadata: {},
            lastError: "runtime vault state was reset",
            injectedAt: "2026-09-03T00:00:00.000Z",
            detachedAt: null,
            createdByUserId: "user_route",
            createdByLabel: "route@test.local",
            createdAt: "2026-09-03T00:00:00.000Z",
            updatedAt: "2026-09-03T00:00:00.000Z"
          }] as never[]
        };
      }
      if (text.includes("UPDATE sandbox_credential_attachments") && text.includes("status = 'requires_reinjection'")) {
        return {
          rowCount: 1,
          rows: [{
            id: params?.[0],
            sandboxId: "sbx_route",
            displayName: "Ephemeral API",
            sourceType: "inline_ephemeral",
            sourceRef: null,
            credentialName: "cred_api",
            bindingName: "api-header",
            match: { schemes: ["https"], hosts: ["api.example.com"] },
            auth: { type: "bearer" },
            fakeEnv: { PRIVATE_API_KEY: "fake-key" },
            status: "requires_reinjection",
            provider: "fake",
            providerRevision: 1,
            providerMetadata: {},
            lastError: params?.[3],
            injectedAt: "2026-09-03T00:00:00.000Z",
            detachedAt: null,
            createdByUserId: "user_route",
            createdByLabel: "route@test.local",
            createdAt: "2026-09-03T00:00:00.000Z",
            updatedAt: "2026-09-03T00:00:00.000Z"
          }] as never[]
        };
      }
      throw new Error(`unexpected query: ${text} ${JSON.stringify(params)}`);
    }
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/sandboxes/sbx_route/credentials/rehydrate"
    });
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.rehydrated, 0);
    assert.equal(body.skipped, 1);
    assert.equal(body.attachments[0].status, "requires_reinjection");
    assert.equal(JSON.stringify(body).includes("real-secret"), false);
    assert.equal(runtimeState.credentialVaultInput, undefined);
  } finally {
    await app.close();
  }
});

test("sandbox credential refresh route renews dynamic material without returning it", async () => {
  const app = Fastify();
  const runtimeState: { credentialVaultInput?: RuntimeCredentialVaultApplyInput } = {};
  const attachment = {
    id: "sca_dynamic",
    sandboxId: "sbx_route",
    displayName: "Agent repositories",
    sourceType: "dynamic",
    sourceRef: "dci_github",
    credentialName: "github",
    bindingName: "github-api",
    match: credentialProviderPresetCatalog.github.binding.match,
    auth: credentialProviderPresetCatalog.github.binding.auth,
    fakeEnv: credentialProviderPresetCatalog.github.fakeEnv,
    status: "injected",
    provider: "fake",
    providerRevision: 2,
    providerMetadata: {},
    sourceMetadata: { installationId: "321", repositories: ["agent-runtime"] },
    expiresAt: "2099-01-01T00:00:00.000Z",
    refreshAttemptedAt: null,
    refreshedAt: null,
    lastError: null,
    injectedAt: "2026-09-03T00:00:00.000Z",
    detachedAt: null,
    createdByUserId: "user_route",
    createdByLabel: "route@test.local",
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z"
  };
  const issuer = {
    id: "dci_github",
    name: "Agent repositories",
    issuerType: "github_app_installation",
    scope: { installationId: "321", repositories: ["agent-runtime"], permissions: { contents: "write", metadata: "read" } },
    memberUseAllowed: true,
    version: 1,
    fakeEnv: credentialProviderPresetCatalog.github.fakeEnv,
    binding: credentialProviderPresetCatalog.github.binding,
    egressDomains: credentialProviderPresetCatalog.github.egressDomains,
    metadata: {},
    validationState: "valid",
    validationMessage: null,
    validatedAt: "2026-09-03T00:00:00.000Z",
    lastIssuedAt: "2026-09-03T00:00:00.000Z",
    createdByUserId: "user_route",
    createdByLabel: "route@test.local",
    disabledAt: null,
    deletedAt: null,
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
    activeSandboxCount: 1,
    attachmentCount: 1,
    lastAttachedAt: "2026-09-03T00:00:00.000Z"
  };
  await registerRoutes(app, {
    requireAuth: fakeAuth,
    runtimeProvider: routeRuntimeProvider(runtimeState),
    dynamicCredentialIssuers: {
      github_app_installation: {
        type: "github_app_installation",
        validate: async () => ({ kind: "ok" }),
        issue: async () => ({
          kind: "ok",
          value: "ghs_route_transient",
          expiresAt: "2099-01-01T01:00:00.000Z",
          metadata: { installationId: "321", repositories: ["agent-runtime"] }
        })
      }
    },
    recordSandboxEvent: async () => undefined,
    recordAudit: async () => undefined,
    query: async (text, params) => {
      if (text.includes("SELECT role FROM memberships")) return { rows: [{ role: "admin" }] as never[], rowCount: 1 };
      if (text.includes("FROM sandboxes WHERE id = $1 AND organization_id = $2")) {
        return { rowCount: 1, rows: [{ id: "sbx_route", opensandboxId: "fake_provider", status: "running" }] as never[] };
      }
      if (text.includes("FROM dynamic_credential_issuers dynamic_issuer")) {
        return { rowCount: 1, rows: [issuer] as never[] };
      }
      if (text.includes("UPDATE dynamic_credential_issuers")) return { rowCount: 1, rows: [] };
      if (text.includes("UPDATE sandbox_credential_attachments") && text.includes("refreshed_at = now()")) {
        return {
          rowCount: 1,
          rows: [{
            ...attachment,
            providerRevision: params?.[3],
            providerMetadata: JSON.parse(String(params?.[4])),
            sourceMetadata: JSON.parse(String(params?.[5])),
            expiresAt: params?.[6],
            refreshAttemptedAt: "2026-09-03T00:01:00.000Z",
            refreshedAt: "2026-09-03T00:01:00.000Z"
          }] as never[]
        };
      }
      if (text.includes("FROM sandbox_credential_attachments") && text.includes("id = $3")) {
        return { rowCount: 1, rows: [attachment] as never[] };
      }
      throw new Error(`unexpected query: ${text} ${JSON.stringify(params)}`);
    }
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/sandboxes/sbx_route/credentials/sca_dynamic/refresh"
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(runtimeState.credentialVaultInput?.credentials, [{ name: "github", value: "ghs_route_transient" }]);
    assert.equal(JSON.stringify(JSON.parse(response.body)).includes("ghs_route_transient"), false);
    assert.equal(JSON.parse(response.body).attachment.expiresAt, "2099-01-01T01:00:00.000Z");
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
        assert.equal(params?.[5], "keycloak");
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
          rows: [{ organizationId: "org_route", userId: "user_route", actorLabel: "route@test.local", authType: "keycloak", apiKeyId: null, subject: "route-subject", authExpiresAt: new Date(Date.now() + 3600_000) }] as never[]
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
            host: "provider-route.example.test",
            targetUrl: "https://provider-route.example.test",
            provider: "opensandbox-server-proxy",
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

test("token route proxy reaches OpenSandbox gateway through internal gateway host routing", async () => {
  const app = Fastify();
  const originalFetch = globalThis.fetch;
  let upstreamUrl = "";
  let upstreamGatewayRouteHeader = "";
  let upstreamRouteTokenHeader = "";
  globalThis.fetch = (async (url, init) => {
    const headers = init?.headers instanceof Headers ? init.headers : new Headers(init?.headers);
    upstreamUrl = String(url);
    upstreamGatewayRouteHeader = headers.get("OpenSandbox-Ingress-To") ?? "";
    upstreamRouteTokenHeader = headers.get("x-harakiri-route-token") ?? "";
    return new Response("gateway proxied", { status: 200, headers: { "content-type": "text/plain" } });
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
            id: "sbr_gateway_proxy",
            routeKey: "provider-route",
            host: "provider-route.sandbox.localhost",
            targetUrl: "https://provider-route.sandbox.localhost",
            provider: "opensandbox-gateway",
            state: "ready",
            accessMode: "token",
            accessTokenHash: hashApiKey("route-secret"),
            accessHeaderName: "x-harakiri-route-token"
          }] as never[]
        };
      }
      if (text.includes("UPDATE sandbox_routes SET last_used_at")) {
        assert.deepEqual(params, ["sbr_gateway_proxy"]);
        return { rowCount: 1, rows: [] as never[] };
      }
      throw new Error(`unexpected query: ${text}`);
    }
  });

  try {
    const proxied = await app.inject({
      method: "GET",
      url: "/v1/route-proxy/provider-route/app?harakiri_route_token=route-secret&next=1"
    });
    assert.equal(proxied.statusCode, 200);
    assert.equal(proxied.body, "gateway proxied");
    assert.equal(upstreamUrl, "http://127.0.0.1:18085/app?next=1");
    assert.equal(upstreamGatewayRouteHeader, "provider-route");
    assert.equal(upstreamRouteTokenHeader, "");
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});
