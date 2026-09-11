import assert from "node:assert/strict";
import test from "node:test";
import {
  HarakiriApiError,
  HarakiriAuthenticationError,
  HarakiriClient,
  HarakiriCommandEndedError,
  HarakiriConflictError,
  HarakiriGitCommandError,
  HarakiriGitNetworkAccessError,
  HarakiriGitUnsupportedRuntimeError,
  HarakiriNotFoundError,
  HarakiriProviderUnavailableError,
  HarakiriRateLimitError,
  HarakiriSandbox,
  HarakiriTimeoutApiError,
  HarakiriUnsupportedCapabilityError,
  HarakiriWaitTimeoutError,
  credentialProviderPresetCatalog,
  credentialFromPreset,
  createRouteFetch,
  redactGitSecrets,
  routeAccessHeaders,
  waitForRouteHttp
} from "./index.js";
import type { SandboxSummary } from "./index.js";

const sandboxSummary = (overrides: Partial<Pick<SandboxSummary, "id" | "name" | "template" | "status">> = {}): SandboxSummary => ({
  id: overrides.id ?? "sbx_test",
  opensandboxId: "osbx_test",
  name: overrides.name ?? "sdk-test",
  template: overrides.template ?? "python-3.12-data",
  status: overrides.status ?? "running",
  cpu: 3,
  mem: 128,
  started: "00h 00m",
  owner: "sdk@test.local",
  cost: 0,
  ttlSeconds: 300,
  expiresAt: "2026-06-03T12:00:00.000Z",
  publicUrl: null,
  templateVersionId: null,
  templateImageDigest: null,
  egressPolicy: null,
  createdAt: "2026-06-03T11:55:00.000Z",
  runtimeMetadata: {
    workdir: "/workspace",
    user: "root",
    shell: "/bin/sh",
    template: {
      id: overrides.template ?? "python-3.12-data",
      versionId: null,
      imageDigest: null,
      runtimeFamily: "python"
    },
    ports: {
      default: [3000],
      exposed: []
    },
    routes: {
      mode: "local-proxy",
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
      fileArtifactMaxBytes: 16 * 1024 * 1024,
      commandTimeoutMs: 30_000,
      terminalAttachTicketTtlSeconds: 60
    },
    lifecycle: {
      ttlSeconds: 300,
      expiresAt: "2026-06-03T12:00:00.000Z",
      createdAt: "2026-06-03T11:55:00.000Z"
    },
    provider: {
      kind: "opensandbox",
      sandboxId: "osbx_test",
      capabilities: []
    }
  }
});

const snapshotSummary = (overrides: Partial<{ id: string; status: string; sourceSandboxId: string | null }> = {}) => ({
  id: overrides.id ?? "snp_test",
  sourceSandboxId: overrides.sourceSandboxId ?? "sbx_test",
  name: "checkpoint",
  status: overrides.status ?? "ready",
  statusReason: null,
  statusMessage: null,
  template: "python-3.12-data",
  templateVersionId: null,
  templateImageDigest: null,
  createdByUserId: "user_sdk",
  createdByLabel: "sdk@test.local",
  metadata: {},
  providerState: {},
  expiresAt: null,
  createdAt: "2026-06-03T11:56:00.000Z",
  updatedAt: "2026-06-03T11:56:00.000Z",
  deletedAt: null
});

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
    { status: 409, body: { error: "credential_vault_egress_conflict" }, expected: HarakiriConflictError, retryable: false },
    { status: 429, body: { error: "sandbox_route_limit_exceeded" }, expected: HarakiriRateLimitError, retryable: true },
    { status: 501, body: { error: "runtime_command_unsupported" }, expected: HarakiriUnsupportedCapabilityError, retryable: false },
    { status: 501, body: { error: "runtime_file_operation_unsupported" }, expected: HarakiriUnsupportedCapabilityError, retryable: false },
    { status: 408, body: { error: "sandbox_command_timeout" }, expected: HarakiriTimeoutApiError, retryable: true },
    { status: 502, body: { error: "egress_provider_unavailable" }, expected: HarakiriProviderUnavailableError, retryable: true },
    { status: 502, body: { error: "dynamic_credential_issuer_unavailable" }, expected: HarakiriProviderUnavailableError, retryable: true }
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

test("HarakiriClient sends create-time sandbox credentials", async () => {
  const calls: Array<{ url: string; body: string | null }> = [];
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return Response.json({
        sandbox: sandboxSummary({ id: "sbx_vault", status: "running" }),
        credentialAttachments: [{
          id: "sca_1",
          sandboxId: "sbx_vault",
          displayName: "OpenAI",
          sourceType: "inline_ephemeral",
          sourceRef: null,
          credentialName: "cred_openai",
          bindingName: "openai-api",
          match: { hosts: ["api.openai.com"] },
          auth: { type: "bearer" },
          fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
          status: "injected",
          provider: "opensandbox",
          providerRevision: 1,
          providerMetadata: {},
          lastError: null,
          injectedAt: "2026-09-03T12:00:00.000Z",
          detachedAt: null,
          createdByUserId: "user_test",
          createdByLabel: "test@example.com",
          createdAt: "2026-09-03T12:00:00.000Z",
          updatedAt: "2026-09-03T12:00:00.000Z"
        }]
      });
    }
  });

  const result = await client.createSandbox({
    template: "python-3.12-data",
    credentials: [{
      displayName: "OpenAI",
      credentialName: "cred_openai",
      value: "real-secret",
      fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
      binding: {
        name: "openai-api",
        match: { hosts: ["api.openai.com"], methods: ["GET", "POST"], paths: ["/v1/*"] },
        auth: { type: "bearer" }
      }
    }]
  });

  assert.equal(result.credentialAttachments?.[0]?.status, "injected");
  assert.equal(JSON.stringify(result).includes("real-secret"), false);
  assert.deepEqual(JSON.parse(calls[0].body ?? "{}"), {
    idempotencyKey: JSON.parse(calls[0].body ?? "{}").idempotencyKey,
    template: "python-3.12-data",
    ttlSeconds: 300,
    credentials: [{
      displayName: "OpenAI",
      credentialName: "cred_openai",
      value: "real-secret",
      fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
      binding: {
        name: "openai-api",
        match: { hosts: ["api.openai.com"], methods: ["GET", "POST"], paths: ["/v1/*"] },
        auth: { type: "bearer" }
      }
    }]
  });
});

test("HarakiriClient sends create-time stored credential references", async () => {
  const calls: Array<{ url: string; body: string | null }> = [];
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return Response.json({
        sandbox: sandboxSummary({ id: "sbx_stored_vault", status: "running" }),
        credentialAttachments: [{
          id: "sca_1",
          sandboxId: "sbx_stored_vault",
          displayName: "OpenAI production",
          sourceType: "harakiri_encrypted",
          sourceRef: "vlt_openai",
          credentialName: "openai-vlt_openai",
          bindingName: "openai-api-vlt_openai",
          match: { hosts: ["api.openai.com"] },
          auth: { type: "bearer" },
          fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
          status: "injected",
          provider: "opensandbox",
          providerRevision: 1,
          providerMetadata: {},
          lastError: null,
          injectedAt: "2026-09-03T12:00:00.000Z",
          detachedAt: null,
          createdByUserId: "user_test",
          createdByLabel: "test@example.com",
          createdAt: "2026-09-03T12:00:00.000Z",
          updatedAt: "2026-09-03T12:00:00.000Z"
        }]
      });
    }
  });

  const result = await client.createSandbox({
    template: "open-agents-dev",
    credentials: [{
      sourceType: "harakiri_encrypted",
      secretId: "vlt_openai",
      displayName: "OpenAI production"
    }]
  });

  assert.equal(result.credentialAttachments?.[0]?.sourceType, "harakiri_encrypted");
  assert.deepEqual(JSON.parse(calls[0].body ?? "{}"), {
    idempotencyKey: JSON.parse(calls[0].body ?? "{}").idempotencyKey,
    template: "open-agents-dev",
    ttlSeconds: 300,
    credentials: [{
      sourceType: "harakiri_encrypted",
      secretId: "vlt_openai",
      displayName: "OpenAI production"
    }]
  });
});

test("HarakiriClient sends template slot credential mappings", async () => {
  const calls: Array<{ url: string; body: string | null }> = [];
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return Response.json({
        sandbox: sandboxSummary({ id: "sbx_slot_vault", status: "running" }),
        credentialAttachments: []
      });
    }
  });

  await client.createSandbox({
    template: "open-agents-dev",
    credentialMappings: [{
      slotId: "llm",
      source: {
        sourceType: "harakiri_encrypted",
        secretId: "vlt_openai",
        displayName: "OpenAI production"
      }
    }]
  });

  assert.deepEqual(JSON.parse(calls[0].body ?? "{}"), {
    idempotencyKey: JSON.parse(calls[0].body ?? "{}").idempotencyKey,
    template: "open-agents-dev",
    ttlSeconds: 300,
    credentialMappings: [{
      slotId: "llm",
      source: {
        sourceType: "harakiri_encrypted",
        secretId: "vlt_openai",
        displayName: "OpenAI production"
      }
    }]
  });
});

test("HarakiriClient rejects async create-time credentials before request", async () => {
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async () => {
      throw new Error("fetch should not be called");
    }
  });

  await assert.rejects(
    () => client.createSandbox({
      template: "python-3.12-data",
      wait: false,
      credentials: [{
        value: "real-secret",
        binding: {
          match: { hosts: ["api.openai.com"] },
          auth: { type: "bearer" }
        }
      }]
    }),
    /Create-time credentials require sandbox readiness/
  );
});

test("HarakiriClient rejects async create-time credential mappings before request", async () => {
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async () => {
      throw new Error("fetch should not be called");
    }
  });

  await assert.rejects(
    () => client.createSandbox({
      template: "open-agents-dev",
      wait: false,
      credentialMappings: [{
        providerPresetId: "openai",
        source: {
          sourceType: "harakiri_encrypted",
          secretId: "vlt_openai"
        }
      }]
    }),
    /Create-time credentials require sandbox readiness/
  );
});

test("HarakiriClient rejects timed create-time credentials before request", async () => {
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async () => {
      throw new Error("fetch should not be called");
    }
  });

  await assert.rejects(
    () => client.createSandbox({
      template: "python-3.12-data",
      waitTimeoutMs: 1_000,
      credentials: [{
        value: "real-secret",
        binding: {
          match: { hosts: ["api.openai.com"] },
          auth: { type: "bearer" }
        }
      }]
    }),
    /cannot use waitTimeoutMs/
  );
});

test("HarakiriClient can create a sandbox from a snapshot without a template default", async () => {
  const calls: Array<{ url: string; body: string | null }> = [];
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return Response.json({ sandbox: sandboxSummary({ id: "sbx_restore", status: "running" }) });
    }
  });

  const result = await client.createSandbox({ snapshotId: "snp_ready", name: "restored" });

  assert.equal(result.sandbox.id, "sbx_restore");
  assert.deepEqual(JSON.parse(calls[0].body ?? "{}"), {
    idempotencyKey: JSON.parse(calls[0].body ?? "{}").idempotencyKey,
    snapshotId: "snp_ready",
    name: "restored",
    ttlSeconds: 300
  });
});

test("HarakiriClient bootstraps Git sources through command APIs", async () => {
  const calls: Array<{ method: string; url: string; body: string | null }> = [];
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push({ method: init?.method ?? "GET", url: String(url), body: String(init?.body ?? "") });
      const path = String(url);
      if (path.endsWith("/v1/sandboxes") && init?.method === "POST") {
        return Response.json({
          sandbox: sandboxSummary({ id: "sbx_git", status: "pending" }),
          status: "pending"
        }, { status: 202 });
      }
      if (path.endsWith("/v1/sandboxes/sbx_git") && !path.endsWith("/run")) {
        return Response.json({ sandbox: sandboxSummary({ id: "sbx_git", status: "running" }) });
      }
      if (path.endsWith("/v1/sandboxes/sbx_git/run")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        return Response.json({
          result: {
            sandboxId: "sbx_git",
            command: body.command,
            stdout: "",
            stderr: "",
            exitCode: 0,
            durationMs: 12
          }
        });
      }
      if (path.endsWith("/v1/sandboxes/sbx_git/source") && init?.method === "PATCH") {
        const body = JSON.parse(String(init?.body ?? "{}"));
        return Response.json({
          sandbox: {
            ...sandboxSummary({ id: "sbx_git", status: "running" }),
            source: body.source
          }
        });
      }
      return Response.json({ ok: true });
    }
  });

  const result = await client.createSandbox({
    template: "python-3.12-data",
    wait: true,
    egress: { mode: "restricted", presets: ["python-package-install"] },
    source: {
      type: "git",
      url: "https://github.com/acme/project.git",
      branch: "main",
      targetPath: "/workspace/project",
      credentials: { type: "token", token: "ghp_secret", username: "oauth2" }
    }
  });

  assert.equal(result.sandbox.status, "running");
  assert.equal(result.sandbox.source?.status, "ready");
  const createBody = JSON.parse(calls[0].body ?? "{}");
  assert.deepEqual(createBody.source, {
    type: "git",
    url: "https://github.com/acme/project.git",
    branch: "main",
    targetPath: "/workspace/project",
    credentialPersistence: "one-shot"
  });
  assert.deepEqual(createBody.egress.presets, ["python-package-install", "git-hosting"]);
  assert.equal(JSON.stringify(createBody).includes("ghp_secret"), false);

  const runBody = JSON.parse(calls.find((call) => call.url.endsWith("/run"))?.body ?? "{}");
  assert.equal(runBody.command.includes("$HARAKIRI_GIT_TOKEN"), true);
  assert.equal(runBody.command.includes("ghp_secret"), false);
  assert.equal(runBody.command.includes("git 'clone'"), true);
  assert.equal(runBody.command.includes("'https://github.com/acme/project.git'"), true);
  assert.equal(runBody.command.includes("'/workspace/project'"), true);
  assert.equal(runBody.command.includes("oauth2:"), false);
  assert.equal(runBody.command.includes("remote set-url origin"), false);
  assert.deepEqual(runBody.env, {
    HARAKIRI_GIT_USERNAME: "oauth2",
    HARAKIRI_GIT_TOKEN: "ghp_secret"
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
  const sourceUpdates = calls.filter((call) => call.url.endsWith("/source")).map((call) => JSON.parse(call.body ?? "{}").source);
  assert.equal(sourceUpdates.length, 2);
  assert.equal(sourceUpdates[0].status, "cloning");
  assert.equal(sourceUpdates[1].status, "ready");
  assert.equal(JSON.stringify(sourceUpdates).includes("ghp_secret"), false);
});

test("HarakiriSandbox Git helpers parse status and branch data", async () => {
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (String(url).endsWith("/run") && body.command.includes("status --short")) {
        return Response.json({
          result: {
            sandboxId: "sbx_git",
            command: body.command,
            stdout: "## main...origin/main [ahead 1, behind 2]\n M src/app.ts\n?? README.md\n",
            stderr: "",
            exitCode: 0,
            durationMs: 5
          }
        });
      }
      if (String(url).endsWith("/run") && body.command.includes("branch --format")) {
        return Response.json({
          result: {
            sandboxId: "sbx_git",
            command: body.command,
            stdout: "main\nfeature/work\n",
            stderr: "",
            exitCode: 0,
            durationMs: 4
          }
        });
      }
      if (String(url).endsWith("/run") && body.command.includes("branch -D")) {
        return Response.json({
          result: {
            sandboxId: "sbx_git",
            command: body.command,
            stdout: "Deleted branch feature/work\n",
            stderr: "",
            exitCode: 0,
            durationMs: 3
          }
        });
      }
      return Response.json({ ok: true });
    }
  });
  const sandbox = client.sandboxes.wrap(sandboxSummary({ id: "sbx_git" }));

  const status = await sandbox.git.status({ cwd: "/workspace/project" });
  assert.equal(status.branch, "main");
  assert.equal(status.upstream, "origin/main");
  assert.equal(status.ahead, 1);
  assert.equal(status.behind, 2);
  assert.equal(status.clean, false);
  assert.deepEqual(status.files.map((file) => [file.index, file.workingTree, file.path]), [
    [" ", "M", "src/app.ts"],
    ["?", "?", "README.md"]
  ]);

  const branches = await sandbox.git.branches({ cwd: "/workspace/project" });
  assert.deepEqual(branches.branches, ["main", "feature/work"]);
  const deleted = await sandbox.git.deleteBranch("feature/work", { cwd: "/workspace/project" });
  assert.equal(deleted.stdout.includes("Deleted branch"), true);
});

test("Git helper errors redact credentials", async () => {
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      assert.equal(body.command.includes("ghp_secret"), false);
      return Response.json({
        result: {
          sandboxId: "sbx_git",
          command: body.command,
          stdout: "",
          stderr: "fatal: could not read from https://oauth2:ghp_secret@github.com/acme/private.git\n",
          exitCode: 128,
          durationMs: 9
        }
      });
    }
  });

  await assert.rejects(() => client.git.clone("sbx_git", "https://github.com/acme/private.git", {
    credentials: { type: "token", token: "ghp_secret", username: "oauth2" }
  }), (error) => {
    assert.ok(error instanceof HarakiriGitCommandError);
    assert.equal(error.message.includes("ghp_secret"), false);
    assert.equal(error.result.stderr.includes("ghp_secret"), false);
    return true;
  });
  assert.equal(redactGitSecrets("https://user:secret@example.test/repo.git", ["secret"]), "https://[redacted]@example.test/repo.git");
});

test("Git helpers report missing git binary as a typed unsupported runtime error", async () => {
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      assert.equal(String(url).endsWith("/run"), true);
      const body = JSON.parse(String(init?.body ?? "{}"));
      assert.equal(body.command.includes("command -v git"), true);
      return Response.json({
        result: {
          sandboxId: "sbx_no_git",
          command: body.command,
          stdout: "",
          stderr: "git binary not found in sandbox image\n",
          exitCode: 127,
          durationMs: 4
        }
      });
    }
  });

  await assert.rejects(() => client.git.status("sbx_no_git", { cwd: "/workspace/project" }), (error) => {
    assert.ok(error instanceof HarakiriGitUnsupportedRuntimeError);
    assert.ok(error instanceof HarakiriGitCommandError);
    assert.equal(error.code, "git_runtime_unsupported");
    assert.equal(error.reason, "missing_git_binary");
    assert.match(error.templateGuidance, /template that includes git/);
    assert.match(error.message, /open-agents-dev/);
    assert.equal(error.result.exitCode, 127);
    return true;
  });
});

test("Git helpers report network and egress failures with actionable guidance", async () => {
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async () => Response.json({
      result: {
        sandboxId: "sbx_git_net",
        command: "git -C /workspace/project pull origin main",
        stdout: "",
        stderr: "fatal: unable to access 'https://github.com/acme/project.git/': Could not resolve host: github.com\n",
        exitCode: 128,
        durationMs: 8
      }
    })
  });

  await assert.rejects(() => client.git.pull("sbx_git_net", { cwd: "/workspace/project", branch: "main" }), (error) => {
    assert.ok(error instanceof HarakiriGitNetworkAccessError);
    assert.ok(error instanceof HarakiriGitCommandError);
    assert.equal(error.code, "git_network_access_failed");
    assert.equal(error.reason, "network_or_egress");
    assert.match(error.egressGuidance, /git-hosting/);
    assert.match(error.message, /git-hosting/);
    assert.match(error.message, /github\.com/);
    return true;
  });
});

test("HarakiriSandbox creates, connects, refreshes, and delegates runtime namespaces", async () => {
  const calls: Array<{ method: string; url: string; body: string | null }> = [];
  const command = {
    id: "cmd_test",
    sandboxId: "sbx_obj",
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
    startedAt: "2026-06-03T12:00:00.000Z",
    finishedAt: null,
    createdAt: "2026-06-03T12:00:00.000Z",
    updatedAt: "2026-06-03T12:00:00.000Z"
  };
  const route = {
    port: 3000,
    protocol: "http",
    accessMode: "token",
    accessHeaderName: "x-harakiri-route-token",
    tokenHint: "hrt_...",
    labels: ["preview"],
    createdByUserId: "user_sdk",
    createdByLabel: "sdk@test.local",
    routeKey: "route_sdk",
    host: "route.example.test",
    url: "https://route.example.test",
    targetUrl: "http://sandbox:3000",
    state: "ready",
    provider: "opensandbox-gateway",
    providerRouteId: null,
    createdAt: "2026-06-03T12:00:00.000Z",
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
      if (path.endsWith("/v1/sandboxes") && init?.method === "POST") {
        return Response.json({ sandbox: sandboxSummary({ id: "sbx_obj", status: "pending" }) });
      }
      if (path.endsWith("/v1/sandboxes/sbx_obj") && init?.method === "DELETE") return Response.json({ ok: true });
      if (path.endsWith("/v1/sandboxes/sbx_obj/pause")) return Response.json({ sandbox: sandboxSummary({ id: "sbx_obj", status: "paused" }) });
      if (path.endsWith("/v1/sandboxes/sbx_obj/resume")) return Response.json({ sandbox: sandboxSummary({ id: "sbx_obj", status: "running" }) });
      if (path.endsWith("/v1/sandboxes/sbx_obj/snapshots")) return Response.json({ snapshot: snapshotSummary({ id: "snp_obj", sourceSandboxId: "sbx_obj" }) }, { status: 201 });
      if (path.endsWith("/v1/sandboxes/sbx_obj")) return Response.json({ sandbox: sandboxSummary({ id: "sbx_obj", status: "running" }) });
      if (path.endsWith("/renew")) return Response.json({ ok: true });
      if (path.endsWith("/run")) return Response.json({ result: { sandboxId: "sbx_obj", command: "pwd", stdout: "/workspace\n", stderr: "", exitCode: 0, durationMs: 5 } });
      if (path.endsWith("/commands")) return Response.json(init?.method === "POST" ? { command } : { commands: [command] });
      if (path.endsWith("/commands/cmd_test")) return Response.json({ command });
      if (path.endsWith("/commands/cmd_test/logs")) return Response.json({ commandId: "cmd_test", stdout: "ready\n", stderr: "" });
      if (path.endsWith("/files") && init?.method === "PUT") return Response.json({ file: { path: "/workspace/app.py", name: "app.py", type: "file", size: 12 } });
      if (path.includes("/files/read")) return Response.json({ path: "/workspace/app.py", encoding: "utf8", content: "print('ok')\n" });
      if (path.endsWith("/routes")) return Response.json(init?.method === "POST" ? { route, accessToken: "hrt_secret" } : { routes: [route] });
      if (path.endsWith("/egress")) return Response.json({ egress: { mode: "restricted", presets: ["python-package-install"], rules: [], providerStatus: { available: true } } });
      if (path.endsWith("/egress/test")) return Response.json({ target: "https://pypi.org", allowed: true, reason: "allowed" });
      if (path.endsWith("/logs")) return Response.json({ logs: [{ ts: "2026-06-03T12:00:00.000Z", lvl: "info", msg: "created" }] });
      if (path.endsWith("/metrics")) return Response.json({ current: { cpu: 4, mem: 128, diskIo: 0, networkOut: 0, cpuCount: 1, memTotal: 1024 }, series: [] });
      return Response.json({ ok: true });
    }
  });

  const sandbox = await client.sandboxes.create({ template: "python-3.12-data", wait: false });
  assert.ok(sandbox instanceof HarakiriSandbox);
  assert.equal(sandbox.id, "sbx_obj");
  assert.equal(sandbox.status, "pending");
  assert.equal(sandbox.runtimeMetadata.workdir, "/workspace");
  assert.equal(sandbox.runtimeMetadata.provider.kind, "opensandbox");

  await sandbox.wait({ intervalMs: 0 });
  assert.equal(sandbox.status, "running");
  assert.equal(sandbox.runtimeMetadata.template.id, "python-3.12-data");

  const connected = await HarakiriSandbox.connect(client, "sbx_obj");
  assert.equal(connected.summary.id, "sbx_obj");
  assert.equal(connected.runtimeMetadata.ports.default[0], 3000);
  assert.equal((await client.sandboxes.connect("sbx_obj")).id, "sbx_obj");

  await sandbox.run({ command: "pwd", cwd: "/workspace" });
  const started = await sandbox.commands.start({ command: command.command, cwd: "/workspace", detached: true });
  await sandbox.commands.wait(started.command.id, { statuses: ["running"], intervalMs: 0 });
  await sandbox.commands.logs(started.command.id);
  const process = await sandbox.processes.start({ command: command.command, cwd: "/workspace" });
  await sandbox.processes.tail(process.command.id, 10);
  await sandbox.files.write({ path: "/workspace/app.py", content: "print('ok')\n", createParents: true });
  await sandbox.files.read("/workspace/app.py");
  const exposed = await sandbox.routes.expose({ port: 3000, accessMode: "token", labels: ["preview"] });
  assert.deepEqual(sandbox.routes.headers(exposed), { "x-harakiri-route-token": "hrt_secret" });
  await sandbox.egress.update({ mode: "restricted", presets: ["python-package-install"] });
  await sandbox.egress.test("https://pypi.org");
  await sandbox.logs();
  await sandbox.metrics();
  await sandbox.renew();
  await sandbox.pause();
  assert.equal(sandbox.status, "paused");
  await sandbox.resume();
  assert.equal(sandbox.status, "running");
  const snapshot = await sandbox.snapshot({ name: "checkpoint" });
  assert.equal(snapshot.snapshot.id, "snp_obj");
  await sandbox.reconnect();
  assert.equal(sandbox.lifecycle.ttlSeconds, 300);
  assert.equal(sandbox.expiresAt, "2026-06-03T12:00:00.000Z");
  await sandbox.kill();
  assert.notEqual(sandbox.status, "terminated");

  assert(calls.some((call) => call.url === "http://harakiri.local/v1/sandboxes" && call.method === "POST"));
  assert(calls.some((call) => call.url === "http://harakiri.local/v1/sandboxes/sbx_obj/run" && call.method === "POST"));
  assert(calls.some((call) => call.url === "http://harakiri.local/v1/sandboxes/sbx_obj/files" && call.method === "PUT"));
  assert(calls.some((call) => call.url === "http://harakiri.local/v1/sandboxes/sbx_obj/routes" && call.method === "POST"));
  assert(calls.some((call) => call.url === "http://harakiri.local/v1/sandboxes/sbx_obj/egress" && call.method === "PATCH"));
  assert(calls.some((call) => call.url === "http://harakiri.local/v1/sandboxes/sbx_obj/pause" && call.method === "POST"));
  assert(calls.some((call) => call.url === "http://harakiri.local/v1/sandboxes/sbx_obj/resume" && call.method === "POST"));
  assert(calls.some((call) => call.url === "http://harakiri.local/v1/sandboxes/sbx_obj/snapshots" && call.method === "POST"));
});

test("HarakiriClient exposes snapshot collection helpers", async () => {
  const calls: Array<{ method: string; url: string; body: string | null }> = [];
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push({ method: init?.method ?? "GET", url: String(url), body: String(init?.body ?? "") });
      const path = String(url);
      if (path.endsWith("/v1/snapshots")) return Response.json({ snapshots: [snapshotSummary()], page: { total: 1, limit: 100, offset: 0 } });
      if (path.endsWith("/v1/snapshots/snp_test") && init?.method === "DELETE") return Response.json({ ok: true });
      if (path.endsWith("/v1/snapshots/snp_test")) return Response.json({ snapshot: snapshotSummary() });
      return Response.json({ ok: true });
    }
  });

  const listed = await client.snapshots.list();
  const fetched = await client.snapshots.get("snp_test");
  await client.snapshots.delete("snp_test");
  const ready = await client.snapshots.wait("snp_test", { intervalMs: 0, timeoutMs: 10 });

  assert.equal(listed.snapshots[0].id, "snp_test");
  assert.equal(fetched.snapshot.status, "ready");
  assert.equal(ready.snapshot.status, "ready");
  assert.deepEqual(calls.map((call) => [call.method, call.url]), [
    ["GET", "http://harakiri.local/v1/snapshots"],
    ["GET", "http://harakiri.local/v1/snapshots/snp_test"],
    ["DELETE", "http://harakiri.local/v1/snapshots/snp_test"],
    ["GET", "http://harakiri.local/v1/snapshots/snp_test"]
  ]);
});

test("HarakiriSandbox preserves typed API errors from delegated calls", async () => {
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async () => Response.json({ error: "sandbox_not_found", message: "gone" }, { status: 404 })
  });
  const sandbox = client.sandboxes.wrap(sandboxSummary({ id: "sbx_missing" }));

  await assert.rejects(() => sandbox.refresh(), (error) => {
    assert.ok(error instanceof HarakiriNotFoundError);
    assert.ok(error instanceof HarakiriApiError);
    assert.equal(error.status, 404);
    assert.equal(error.code, "sandbox_not_found");
    return true;
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
    finishReason: null,
    signal: null,
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
  await client.processes.start("sbx_test", { command: "npm run dev", cwd: "/workspace/app" });
  await client.listCommands("sbx_test");
  await client.getCommand("sbx_test", "cmd_test");
  await client.getCommandLogs("sbx_test", "cmd_test", { cursor: 3, tail: 25 });
  await client.killCommand("sbx_test", "cmd_test");

  assert.deepEqual(calls.map((call) => [call.method, call.url]), [
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/commands"],
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
        finishReason: "error",
        signal: null,
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
    (error) => {
      assert.ok(error instanceof HarakiriCommandEndedError);
      assert.equal(error.status, "failed");
      assert.equal(error.exitCode, 1);
      assert.equal(error.finishReason, "error");
      return true;
    }
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
        finishReason: null,
        signal: null,
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
    finishReason: null,
    signal: null,
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
      if (path.includes("/files/download")) return Response.json({ path: "/workspace/app.py", contentBase64: "b2s=", sizeBytes: 2, sha256: "sha256:2689367b205c16ce32ed4200942b8b8b1e262dfc70d9bc9fbc77c49699a4f1df", transfer: { mode: "json-base64", encoding: "base64", maxBytes: 16777216 } });
      if (path.includes("/files/upload")) return Response.json({ file: { path: "/workspace/app.py", name: "app.py", type: "file", size: 2 }, sizeBytes: 2, sha256: "sha256:2689367b205c16ce32ed4200942b8b8b1e262dfc70d9bc9fbc77c49699a4f1df", transfer: { mode: "json-base64", encoding: "base64", maxBytes: 16777216 } });
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
  await client.processes.start("sbx_test", { command: "npm run dev" });
  await client.commands.list("sbx_test");
  await client.commands.get("sbx_test", "cmd_test");
  await client.commands.logs("sbx_test", "cmd_test");
  await client.commandLogs("sbx_test", "cmd_test");
  await client.processes.tail("sbx_test", "cmd_test", 10);
  await client.commands.kill("sbx_test", "cmd_test");
  await client.files.stat("sbx_test", "/workspace/app.py");
  await client.files.read("sbx_test", "/workspace/app.py");
  await client.files.write("sbx_test", { path: "/workspace/app.py", content: "print('ok')\n" });
  await client.files.upload("sbx_test", { path: "/workspace/app.py", contentBase64: "b2s=", sizeBytes: 2 });
  await client.files.download("sbx_test", "/workspace/app.py");
  await client.artifacts.upload("sbx_test", { path: "/workspace/app.py", contentBase64: "b2s=", sizeBytes: 2 });
  await client.artifacts.download("sbx_test", "/workspace/app.py");
  await client.files.mkdir("sbx_test", { path: "/workspace" });
  await client.files.rename("sbx_test", { fromPath: "/workspace/app.py", toPath: "/workspace/main.py" });
  await client.files.remove("sbx_test", "/workspace/main.py");
  await client.routes.expose("sbx_test", { port: 3000, labels: ["preview"] });
  await client.routes.list("sbx_test");
  await client.routes.getHost("sbx_test", 3000);
  await client.routes.getUrl("sbx_test", 3000);
  await client.routes.delete("sbx_test", 3000);

  assert(calls.some((call) => call.url === "http://harakiri.local/v1/sandboxes/sbx_test/commands/cmd_test/logs"));
  assert(calls.some((call) => call.url === "http://harakiri.local/v1/sandboxes/sbx_test/files/stat?path=%2Fworkspace%2Fapp.py"));
  assert(calls.some((call) => call.method === "POST" && call.url === "http://harakiri.local/v1/sandboxes/sbx_test/files/upload"));
  assert(calls.some((call) => call.url === "http://harakiri.local/v1/sandboxes/sbx_test/files/download?path=%2Fworkspace%2Fapp.py"));
  assert(calls.some((call) => call.method === "POST" && call.url === "http://harakiri.local/v1/sandboxes/sbx_test/routes"));
  const routeExposeCall = calls.find((call) => call.method === "POST" && call.url === "http://harakiri.local/v1/sandboxes/sbx_test/routes");
  assert.deepEqual(JSON.parse(routeExposeCall?.body ?? "{}"), { port: 3000, protocol: "http", accessMode: "public", labels: ["preview"] });
});

test("route helpers compose token and basic auth headers", () => {
  const route = {
    route: {
      port: 4096,
      protocol: "http",
      accessMode: "token",
      accessHeaderName: "x-harakiri-route-token",
      tokenHint: "hrt_...",
      labels: ["opencode"],
      createdByUserId: "user_sdk",
      createdByLabel: "sdk@test.local",
      routeKey: "route_opencode",
      host: "opencode.example.test",
      url: "https://opencode.example.test",
      targetUrl: "http://sandbox:4096",
      state: "ready",
      provider: "opensandbox-gateway",
      providerRouteId: null,
      createdAt: "2026-06-02T00:00:00.000Z",
      lastCheckedAt: null,
      lastUsedAt: null,
      terminatedAt: null
    },
    accessToken: "hrt_secret",
    accessHeaderName: "x-harakiri-route-token"
  } as const;

  assert.deepEqual(routeAccessHeaders(route), { "x-harakiri-route-token": "hrt_secret" });
  assert.deepEqual(routeAccessHeaders(route, { basicAuth: { username: "opencode", password: "secret" } }), {
    "x-harakiri-route-token": "hrt_secret",
    authorization: "Basic b3BlbmNvZGU6c2VjcmV0"
  });
});

test("createRouteFetch injects route auth headers and resolves relative paths", async () => {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const route = {
    route: {
      port: 4096,
      protocol: "http",
      accessMode: "token",
      accessHeaderName: "x-harakiri-route-token",
      tokenHint: "hrt_...",
      labels: ["opencode"],
      createdByUserId: "user_sdk",
      createdByLabel: "sdk@test.local",
      routeKey: "route_opencode",
      host: "opencode.example.test",
      url: "https://opencode.example.test/base/",
      targetUrl: "http://sandbox:4096",
      state: "ready",
      provider: "opensandbox-gateway",
      providerRouteId: null,
      createdAt: "2026-06-02T00:00:00.000Z",
      lastCheckedAt: null,
      lastUsedAt: null,
      terminatedAt: null
    },
    accessToken: "hrt_secret"
  } as const;

  const routeFetch = createRouteFetch(route, {
    basicAuth: { username: "opencode", password: "secret" },
    headers: { "x-client": "example" },
    fetch: async (url, init) => {
      const headers = Object.fromEntries(new Headers(init?.headers).entries());
      calls.push({ url: String(url), headers });
      return Response.json({ healthy: true });
    }
  });

  await routeFetch("/global/health", { headers: { "x-request": "health" } });

  assert.equal(calls[0].url, "https://opencode.example.test/base/global/health");
  assert.equal(calls[0].headers["x-harakiri-route-token"], "hrt_secret");
  assert.equal(calls[0].headers.authorization, "Basic b3BlbmNvZGU6c2VjcmV0");
  assert.equal(calls[0].headers["x-client"], "example");
  assert.equal(calls[0].headers["x-request"], "health");
});

test("waitForRouteHttp polls until a route endpoint is healthy", async () => {
  let calls = 0;
  const route = {
    port: 4096,
    protocol: "http",
    accessMode: "public",
    accessHeaderName: null,
    tokenHint: null,
    labels: ["opencode"],
    createdByUserId: "user_sdk",
    createdByLabel: "sdk@test.local",
    routeKey: "route_opencode",
    host: "opencode.example.test",
    url: "https://opencode.example.test",
    targetUrl: "http://sandbox:4096",
    state: "ready",
    provider: "opensandbox-gateway",
    providerRouteId: null,
    createdAt: "2026-06-02T00:00:00.000Z",
    lastCheckedAt: null,
    lastUsedAt: null,
    terminatedAt: null
  } as const;

  const response = await waitForRouteHttp(route, {
    path: "/global/health",
    intervalMs: 1,
    timeoutMs: 100,
    fetch: async () => {
      calls += 1;
      return Response.json({ healthy: calls > 1 }, { status: calls > 1 ? 200 : 503 });
    },
    expect: async (candidate) => candidate.ok && (await candidate.clone().json()).healthy === true
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test("HarakiriClient can expose a route and wait for HTTP readiness", async () => {
  const calls: string[] = [];
  const route = {
    port: 4096,
    protocol: "http",
    accessMode: "token",
    accessHeaderName: "x-harakiri-route-token",
    tokenHint: "hrt_...",
    labels: ["opencode"],
    createdByUserId: "user_sdk",
    createdByLabel: "sdk@test.local",
    routeKey: "route_opencode",
    host: "opencode.example.test",
    url: "https://opencode.example.test",
    targetUrl: "http://sandbox:4096",
    state: "ready",
    provider: "opensandbox-gateway",
    providerRouteId: null,
    createdAt: "2026-06-02T00:00:00.000Z",
    lastCheckedAt: null,
    lastUsedAt: null,
    terminatedAt: null
  } as const;
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push(`${init?.method ?? "GET"} ${String(url)}`);
      return Response.json({ route, accessToken: "hrt_secret", accessHeaderName: "x-harakiri-route-token" });
    }
  });

  const result = await client.routes.exposeAndWait("sbx_test", { port: 4096, accessMode: "token", labels: ["opencode"] }, {
    path: "/global/health",
    fetch: async (url, init) => {
      assert.equal(String(url), "https://opencode.example.test/global/health");
      assert.equal(new Headers(init?.headers).get("x-harakiri-route-token"), "hrt_secret");
      return Response.json({ healthy: true });
    }
  });

  assert.equal(result.route.port, 4096);
  assert.deepEqual(calls, ["POST http://harakiri.local/v1/sandboxes/sbx_test/routes"]);
});

test("waitForRouteHttp reports route timeout details", async () => {
  await assert.rejects(() => waitForRouteHttp({
    port: 4096,
    protocol: "http",
    accessMode: "public",
    accessHeaderName: null,
    tokenHint: null,
    labels: [],
    createdByUserId: null,
    createdByLabel: null,
    routeKey: "route_timeout",
    host: "timeout.example.test",
    url: "https://timeout.example.test",
    targetUrl: "http://sandbox:4096",
    state: "ready",
    provider: "dev",
    providerRouteId: null,
    createdAt: "2026-06-02T00:00:00.000Z",
    lastCheckedAt: null,
    lastUsedAt: null,
    terminatedAt: null
  }, {
    timeoutMs: 0,
    intervalMs: 0,
    fetch: async () => new Response("not yet", { status: 503 })
  }), (error) => {
    assert.ok(error instanceof HarakiriWaitTimeoutError);
    assert.equal(error.target, "route");
    assert.equal(error.id, "route_timeout");
    assert.equal(error.lastStatus, "503");
    return true;
  });
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
      if (String(url).includes("/files/download")) return Response.json({ path: "/workspace/file.txt", contentBase64: "b2s=", sizeBytes: 2, sha256: "sha256:2689367b205c16ce32ed4200942b8b8b1e262dfc70d9bc9fbc77c49699a4f1df", transfer: { mode: "json-base64", encoding: "base64", maxBytes: 16777216 } });
      if (String(url).includes("/files/upload")) return Response.json({ file, sizeBytes: 2, sha256: "sha256:2689367b205c16ce32ed4200942b8b8b1e262dfc70d9bc9fbc77c49699a4f1df", transfer: { mode: "json-base64", encoding: "base64", maxBytes: 16777216 } });
      if (String(url).includes("/files?path=") && init?.method === "DELETE") return Response.json({ ok: true, path: "/workspace/file.txt" });
      return Response.json({ file });
    }
  });

  await client.statSandboxFile("sbx_test", "/workspace/file.txt");
  await client.readSandboxFile("sbx_test", "/workspace/file.txt");
  await client.writeSandboxFile("sbx_test", { path: "/workspace/file.txt", content: "ok", createParents: true });
  await client.uploadSandboxFile("sbx_test", { path: "/workspace/file.txt", contentBase64: "b2s=", sizeBytes: 2 });
  await client.downloadSandboxFile("sbx_test", "/workspace/file.txt");
  const sandbox = HarakiriSandbox.wrap(client, sandboxSummary());
  await sandbox.artifacts.upload({ path: "/workspace/file.txt", contentBase64: "b2s=", sizeBytes: 2 });
  await sandbox.artifacts.download("/workspace/file.txt");
  await client.mkdirSandboxFile("sbx_test", { path: "/workspace/src", recursive: true });
  await client.removeSandboxFile("sbx_test", "/workspace/file.txt", { recursive: false });
  await client.renameSandboxFile("sbx_test", { fromPath: "/workspace/file.txt", toPath: "/workspace/done.txt" });

  assert.deepEqual(calls.map((call) => [call.method, call.url]), [
    ["GET", "http://harakiri.local/v1/sandboxes/sbx_test/files/stat?path=%2Fworkspace%2Ffile.txt"],
    ["GET", "http://harakiri.local/v1/sandboxes/sbx_test/files/read?path=%2Fworkspace%2Ffile.txt"],
    ["PUT", "http://harakiri.local/v1/sandboxes/sbx_test/files"],
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/files/upload"],
    ["GET", "http://harakiri.local/v1/sandboxes/sbx_test/files/download?path=%2Fworkspace%2Ffile.txt"],
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

test("HarakiriClient exposes Credential Vault helpers", async () => {
  const calls: Array<{ method: string; url: string; body: string | null }> = [];
  const attachment = {
    id: "sca_1",
    sandboxId: "sbx_test",
    displayName: "openai",
    sourceType: "inline_ephemeral",
    sourceRef: null,
    credentialName: "cred_openai",
    bindingName: "bind_openai",
    match: { schemes: ["https"], hosts: ["api.openai.com"], methods: ["GET", "POST"] },
    auth: { type: "apiKey", name: "authorization" },
    fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
    status: "injected",
    provider: "opensandbox",
    providerRevision: 1,
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
    createdByUserId: "user_sdk",
    createdByLabel: "sdk@test.local",
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z"
  };
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push({ method: init?.method ?? "GET", url: String(url), body: String(init?.body ?? "") });
      const path = String(url);
      if (path.endsWith("/credentials/sca_1/test")) {
        return Response.json({
          attachmentId: "sca_1",
          target: "https://api.openai.com/v1/models",
          normalizedTarget: "api.openai.com",
          url: "https://api.openai.com/v1/models",
          method: "GET",
          ok: true,
          status: "reachable",
          httpStatus: 200,
          stdout: "http_status=200\n",
          stderr: "",
          durationMs: 24,
          checkedAt: "2026-09-03T00:00:00.000Z"
        });
      }
      if (path.endsWith("/credentials/rehydrate")) {
        return Response.json({ attachments: [attachment], vault: null, rehydrated: 0, skipped: 1, failed: 0 });
      }
      if (path.endsWith("/credentials/inspect")) {
        return Response.json({ attachments: [attachment], vault: { revision: 1, credentials: [], bindings: [] } });
      }
      if (init?.method === "POST") return Response.json({ attachment, vault: { revision: 1, credentials: [], bindings: [] } });
      if (init?.method === "DELETE") return Response.json({ attachment: { ...attachment, status: "detached" }, vault: null });
      return Response.json({ attachments: [attachment] });
    }
  });

  await client.listCredentials("sbx_test");
  await client.credentials.inspect("sbx_test");
  await client.credentials.attach("sbx_test", {
    displayName: "openai",
    value: "sk_real",
    fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
    binding: {
      name: "bind_openai",
      match: { schemes: ["https"], hosts: ["api.openai.com"], methods: ["GET", "POST"] },
      auth: { type: "apiKey", name: "authorization" }
    }
  });
  await client.credentials.attachSecret("sbx_test", "vlt_openai", { bindingName: "openai-prod" });
  await client.credentials.attachReference("sbx_test", "xsr_openai", { bindingName: "openai-cluster" });
  await client.credentials.rehydrate("sbx_test");
  await client.detachSandboxCredential("sbx_test", "sca_1");
  const sandbox = client.sandboxes.wrap(sandboxSummary({ id: "sbx_test" }));
  await sandbox.credentials.list();
  await sandbox.credentials.inspect();
  await sandbox.credentials.attachSecret("vlt_openai");
  await sandbox.credentials.attachReference("xsr_openai");
  await sandbox.credentials.rehydrate();
  const testResult = await sandbox.credentials.test("sca_1", { target: "https://api.openai.com/v1/models" });
  await sandbox.credentials.testAccess("sca_1");

  assert.deepEqual(calls.map((call) => [call.method, call.url]), [
    ["GET", "http://harakiri.local/v1/sandboxes/sbx_test/credentials"],
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/credentials/inspect"],
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/credentials"],
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/credentials"],
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/credentials"],
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/credentials/rehydrate"],
    ["DELETE", "http://harakiri.local/v1/sandboxes/sbx_test/credentials/sca_1"],
    ["GET", "http://harakiri.local/v1/sandboxes/sbx_test/credentials"],
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/credentials/inspect"],
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/credentials"],
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/credentials"],
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/credentials/rehydrate"],
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/credentials/sca_1/test"],
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/credentials/sca_1/test"]
  ]);
  assert.equal(JSON.parse(calls[2].body ?? "{}").value, "sk_real");
  assert.deepEqual(JSON.parse(calls[2].body ?? "{}").binding.auth, { type: "apiKey", name: "authorization" });
  assert.deepEqual(JSON.parse(calls[3].body ?? "{}"), {
    sourceType: "harakiri_encrypted",
    secretId: "vlt_openai",
    bindingName: "openai-prod"
  });
  assert.deepEqual(JSON.parse(calls[4].body ?? "{}"), {
    sourceType: "external_ref",
    referenceId: "xsr_openai",
    bindingName: "openai-cluster"
  });
  assert.deepEqual(JSON.parse(calls[9].body ?? "{}"), {
    sourceType: "harakiri_encrypted",
    secretId: "vlt_openai"
  });
  assert.deepEqual(JSON.parse(calls[10].body ?? "{}"), {
    sourceType: "external_ref",
    referenceId: "xsr_openai"
  });
  assert.deepEqual(JSON.parse(calls[12].body ?? "{}"), { target: "https://api.openai.com/v1/models" });
  assert.deepEqual(JSON.parse(calls[13].body ?? "{}"), {});
  assert.equal(testResult.status, "reachable");
});

test("HarakiriClient exposes credential provider preset helpers", async () => {
  const calls: Array<{ method: string; url: string }> = [];
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push({ method: init?.method ?? "GET", url: String(url) });
      const path = String(url);
      if (path.endsWith("/v1/credential-presets/openai")) return Response.json({ preset: credentialProviderPresetCatalog.openai });
      return Response.json({ presets: [credentialProviderPresetCatalog.openai] });
    }
  });

  const presets = await client.credentialPresets.list();
  const openai = await client.getCredentialPreset("openai");

  assert.equal(presets.presets[0].id, "openai");
  assert.equal(openai.preset.binding.auth.type, "bearer");
  assert.deepEqual(calls.map((call) => [call.method, call.url]), [
    ["GET", "http://harakiri.local/v1/credential-presets"],
    ["GET", "http://harakiri.local/v1/credential-presets/openai"]
  ]);
});

test("credentialFromPreset builds a write-only attachment without mutating catalog data", () => {
  const originalName = credentialProviderPresetCatalog.anthropic.binding.name;
  const credential = credentialFromPreset("anthropic", "sk-ant-test", {
    displayName: "Anthropic staging",
    bindingName: "anthropic-staging"
  });

  assert.deepEqual(credential, {
    sourceType: "inline_ephemeral",
    displayName: "Anthropic staging",
    credentialName: "anthropic",
    value: "sk-ant-test",
    fakeEnv: { ANTHROPIC_API_KEY: "fake-anthropic-key" },
    binding: {
      ...credentialProviderPresetCatalog.anthropic.binding,
      name: "anthropic-staging"
    }
  });
  credential.binding.name = "changed";
  assert.equal(credentialProviderPresetCatalog.anthropic.binding.name, originalName);
  assert.throws(() => credentialFromPreset("github", ""), /credential value is required/);
});

test("HarakiriClient exposes workspace credential secret helpers", async () => {
  const calls: Array<{ method: string; url: string; body: string | null }> = [];
  const secret = {
    id: "vlt_openai",
    name: "openai-prod",
    providerPresetId: "openai",
    sourceType: "harakiri_encrypted",
    status: "active",
    version: 1,
    usePolicy: "admins_only",
    usage: {
      activeSandboxCount: 0,
      attachmentCount: 0,
      lastAttachedAt: null
    },
    fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
    binding: credentialProviderPresetCatalog.openai.binding,
    egressDomains: ["api.openai.com"],
    hasEncryptedSecret: true,
    metadata: {},
    createdByUserId: "user_sdk",
    createdByLabel: "sdk@test.local",
    rotatedAt: null,
    disabledAt: null,
    deletedAt: null,
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z"
  };
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push({ method: init?.method ?? "GET", url: String(url), body: String(init?.body ?? "") });
      if (String(url).endsWith("/credential-secrets?includeDeleted=1")) return Response.json({ secrets: [secret] });
      if (init?.method === "PATCH") {
        return Response.json({ secret: { ...secret, usePolicy: "organization_members" } });
      }
      if (String(url).endsWith("/rotate")) return Response.json({ secret: { ...secret, version: 2 } });
      if (String(url).endsWith("/disable")) return Response.json({ secret: { ...secret, status: "disabled" } });
      if (String(url).endsWith("/enable")) return Response.json({ secret });
      if (init?.method === "DELETE") return Response.json({ secret: { ...secret, status: "deleted", hasEncryptedSecret: false } });
      return Response.json({ secret });
    }
  });

  const listed = await client.credentialSecrets.list({ includeDeleted: true });
  const created = await client.credentialSecrets.create({ name: "openai-prod", providerPresetId: "openai", value: "real-secret" });
  await client.getCredentialSecret("vlt_openai");
  const shared = await client.credentialSecrets.update("vlt_openai", { usePolicy: "organization_members" });
  const rotated = await client.rotateCredentialSecret("vlt_openai", { value: "new-secret" });
  await client.credentialSecrets.disable("vlt_openai");
  await client.credentialSecrets.enable("vlt_openai");
  await client.credentialSecrets.delete("vlt_openai");

  assert.equal(listed.secrets[0]?.id, "vlt_openai");
  assert.equal(created.secret.hasEncryptedSecret, true);
  assert.equal(shared.secret.usePolicy, "organization_members");
  assert.equal(rotated.secret.version, 2);
  assert.equal(JSON.stringify(created).includes("real-secret"), false);
  assert.deepEqual(calls.map((call) => [call.method, call.url]), [
    ["GET", "http://harakiri.local/v1/credential-secrets?includeDeleted=1"],
    ["POST", "http://harakiri.local/v1/credential-secrets"],
    ["GET", "http://harakiri.local/v1/credential-secrets/vlt_openai"],
    ["PATCH", "http://harakiri.local/v1/credential-secrets/vlt_openai"],
    ["POST", "http://harakiri.local/v1/credential-secrets/vlt_openai/rotate"],
    ["POST", "http://harakiri.local/v1/credential-secrets/vlt_openai/disable"],
    ["POST", "http://harakiri.local/v1/credential-secrets/vlt_openai/enable"],
    ["DELETE", "http://harakiri.local/v1/credential-secrets/vlt_openai"]
  ]);
  assert.equal(JSON.parse(calls[1].body ?? "{}").value, "real-secret");
  assert.deepEqual(JSON.parse(calls[3].body ?? "{}"), { usePolicy: "organization_members" });
  assert.equal(JSON.parse(calls[4].body ?? "{}").value, "new-secret");
});

test("HarakiriClient exposes external secret reference helpers", async () => {
  const calls: Array<{ method: string; url: string; body: string | null }> = [];
  const reference = {
    id: "xsr_openai",
    name: "OpenAI from cluster",
    providerPresetId: "openai",
    sourceType: "external_ref",
    resolverType: "kubernetes_secret",
    reference: { namespace: "harakiri", name: "agent-credentials", key: "OPENAI_API_KEY" },
    status: "active",
    usePolicy: "admins_only",
    version: 1,
    fakeEnv: { OPENAI_API_KEY: "fake-openai-key" },
    binding: credentialProviderPresetCatalog.openai.binding,
    egressDomains: ["api.openai.com"],
    metadata: {},
    createdByUserId: "user_sdk",
    createdByLabel: "sdk@test.local",
    disabledAt: null,
    deletedAt: null,
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
    validation: { state: "unvalidated", message: null, versionRef: null, checkedAt: null },
    usage: { activeSandboxCount: 0, attachmentCount: 0, lastAttachedAt: null },
    capabilities: {
      reusable: true,
      rehydratable: true,
      rotatable: false,
      externallyOwned: true,
      shortLived: false,
      launchOnly: false
    }
  };
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push({ method: init?.method ?? "GET", url: String(url), body: String(init?.body ?? "") });
      if (String(url).endsWith("?includeDeleted=1")) return Response.json({ references: [reference] });
      return Response.json({ reference });
    }
  });

  await client.externalSecretReferences.list({ includeDeleted: true });
  await client.externalSecretReferences.get(reference.id);
  await client.externalSecretReferences.create({
    name: reference.name,
    providerPresetId: "openai",
    resolverType: "kubernetes_secret",
    reference: reference.reference
  });
  await client.externalSecretReferences.update(reference.id, { usePolicy: "organization_members" });
  await client.externalSecretReferences.validate(reference.id);
  await client.externalSecretReferences.disable(reference.id);
  await client.externalSecretReferences.enable(reference.id);
  const deleted = await client.externalSecretReferences.delete(reference.id);

  assert.equal(deleted.reference.id, reference.id);
  assert.equal(JSON.stringify(deleted).includes("real-secret"), false);
  assert.deepEqual(calls.map((call) => [call.method, call.url]), [
    ["GET", "http://harakiri.local/v1/external-secret-references?includeDeleted=1"],
    ["GET", "http://harakiri.local/v1/external-secret-references/xsr_openai"],
    ["POST", "http://harakiri.local/v1/external-secret-references"],
    ["PATCH", "http://harakiri.local/v1/external-secret-references/xsr_openai"],
    ["POST", "http://harakiri.local/v1/external-secret-references/xsr_openai/validate"],
    ["POST", "http://harakiri.local/v1/external-secret-references/xsr_openai/disable"],
    ["POST", "http://harakiri.local/v1/external-secret-references/xsr_openai/enable"],
    ["DELETE", "http://harakiri.local/v1/external-secret-references/xsr_openai"]
  ]);
  assert.equal(JSON.parse(calls[2].body ?? "{}").reference.name, "agent-credentials");
  assert.deepEqual(JSON.parse(calls[3].body ?? "{}"), { usePolicy: "organization_members" });
});

test("HarakiriClient exposes dynamic credential issuer and attachment helpers", async () => {
  const calls: Array<{ method: string; url: string; body: string | null }> = [];
  const issuer = {
    id: "dci_github",
    name: "Agent repositories",
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
    createdByUserId: "user_sdk",
    createdByLabel: "sdk@test.local",
    disabledAt: null,
    deletedAt: null,
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
    lastIssuedAt: null,
    validation: { state: "unvalidated", message: null, checkedAt: null },
    usage: { activeSandboxCount: 0, attachmentCount: 0, lastAttachedAt: null },
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
    sandboxId: "sbx_test",
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
    providerRevision: 2,
    providerMetadata: {},
    sourceMetadata: { installationId: "321", repositories: ["agent-runtime"] },
    expiresAt: "2026-09-03T13:00:00.000Z",
    refreshState: "current",
    refreshAttemptedAt: "2026-09-03T12:00:00.000Z",
    refreshedAt: "2026-09-03T12:00:00.000Z",
    lastError: null,
    injectedAt: "2026-09-03T12:00:00.000Z",
    detachedAt: null,
    createdByUserId: "user_sdk",
    createdByLabel: "sdk@test.local",
    createdAt: "2026-09-03T12:00:00.000Z",
    updatedAt: "2026-09-03T12:00:00.000Z"
  };
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url, init) => {
      calls.push({ method: init?.method ?? "GET", url: String(url), body: String(init?.body ?? "") });
      if (String(url).includes("/sandboxes/")) {
        return Response.json({ attachment, vault: { revision: 2, credentials: [], bindings: [] } });
      }
      if (String(url).endsWith("?includeDeleted=1")) return Response.json({ issuers: [issuer] });
      return Response.json({ issuer });
    }
  });

  await client.dynamicCredentialIssuers.list({ includeDeleted: true });
  await client.dynamicCredentialIssuers.get(issuer.id);
  await client.dynamicCredentialIssuers.create({
    name: issuer.name,
    issuerType: "github_app_installation",
    scope: issuer.scope
  });
  await client.dynamicCredentialIssuers.update(issuer.id, { usePolicy: "admins_only" });
  await client.dynamicCredentialIssuers.validate(issuer.id);
  await client.dynamicCredentialIssuers.disable(issuer.id);
  await client.dynamicCredentialIssuers.enable(issuer.id);
  await client.dynamicCredentialIssuers.delete(issuer.id);
  await client.credentials.attachIssuer("sbx_test", issuer.id, { displayName: "GitHub JIT" });
  await client.credentials.refresh("sbx_test", attachment.id);
  const sandbox = client.sandboxes.wrap(sandboxSummary({ id: "sbx_test" }));
  const attached = await sandbox.credentials.attachIssuer(issuer.id);
  await sandbox.credentials.refresh(attachment.id);

  assert.equal(attached.attachment.expiresAt, "2026-09-03T13:00:00.000Z");
  assert.equal(JSON.stringify(attached).includes("ghs_"), false);
  assert.deepEqual(calls.map((call) => [call.method, call.url]), [
    ["GET", "http://harakiri.local/v1/dynamic-credential-issuers?includeDeleted=1"],
    ["GET", "http://harakiri.local/v1/dynamic-credential-issuers/dci_github"],
    ["POST", "http://harakiri.local/v1/dynamic-credential-issuers"],
    ["PATCH", "http://harakiri.local/v1/dynamic-credential-issuers/dci_github"],
    ["POST", "http://harakiri.local/v1/dynamic-credential-issuers/dci_github/validate"],
    ["POST", "http://harakiri.local/v1/dynamic-credential-issuers/dci_github/disable"],
    ["POST", "http://harakiri.local/v1/dynamic-credential-issuers/dci_github/enable"],
    ["DELETE", "http://harakiri.local/v1/dynamic-credential-issuers/dci_github"],
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/credentials"],
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/credentials/sca_dynamic/refresh"],
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/credentials"],
    ["POST", "http://harakiri.local/v1/sandboxes/sbx_test/credentials/sca_dynamic/refresh"]
  ]);
  assert.deepEqual(JSON.parse(calls[8].body ?? "{}"), {
    displayName: "GitHub JIT",
    sourceType: "dynamic",
    issuerId: "dci_github"
  });
  assert.equal(calls[9].body, "");
  assert.deepEqual(JSON.parse(calls[10].body ?? "{}"), {
    sourceType: "dynamic",
    issuerId: "dci_github"
  });
  assert.equal(calls[11].body, "");
});

test("HarakiriClient exposes filtered audit event helpers", async () => {
  const calls: string[] = [];
  const client = new HarakiriClient({
    apiUrl: "http://harakiri.local",
    apiKey: "hk_live_test",
    fetch: async (url) => {
      calls.push(String(url));
      return Response.json({
        events: [{
          id: "audit_1",
          actorUserId: "user_sdk",
          actorLabel: "sdk@test.local",
          action: "sandbox_credential.attached",
          targetType: "sandbox",
          targetId: "sbx_test",
          metadata: { sourceType: "dynamic" },
          createdAt: "2026-09-04T10:00:00.000Z"
        }],
        page: { total: 1, limit: 20, offset: 0 }
      });
    }
  });

  const result = await client.auditEvents.list({
    targetType: "sandbox",
    targetId: "sbx_test",
    actionPrefix: "sandbox_credential.",
    limit: 20,
    offset: 0
  });

  assert.equal(result.events[0]?.id, "audit_1");
  assert.deepEqual(calls, [
    "http://harakiri.local/v1/audit-events?targetType=sandbox&targetId=sbx_test&actionPrefix=sandbox_credential.&limit=20&offset=0"
  ]);
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
