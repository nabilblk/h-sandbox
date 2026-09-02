import assert from "node:assert/strict";
import test from "node:test";
import { config } from "./config.js";
import { InMemoryRuntimeProvider } from "./providers/runtime/dev-provider.js";
import { openSandboxRuntimeProvider } from "./providers/runtime/opensandbox-provider.js";
import { routeKeyFor } from "./providers/runtime/route-targets.js";
import type { RuntimeTemplate } from "./templates.js";

const originalFetch = globalThis.fetch;
const originalRouteBaseDomain = config.sandboxRouteBaseDomain;
const originalRoutePublicScheme = config.sandboxRoutePublicScheme;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  config.sandboxRouteBaseDomain = originalRouteBaseDomain;
  config.sandboxRoutePublicScheme = originalRoutePublicScheme;
});

const template: RuntimeTemplate = {
  id: "python-test",
  name: "Python Test",
  description: "Runtime provider test template",
  image: "python:3.12-slim@sha256:abc123",
  imageDigest: "sha256:abc123",
  icon: "py",
  tags: [],
  aliases: [],
  bootMs: 100,
  visibility: "private",
  status: "ready",
  defaultEntrypoint: ["sleep", "3600"],
  cpuCount: 1,
  memoryMb: 512,
  workdir: "/workspace",
  defaultPorts: [],
  runtimeFamily: "python",
  latestVersionId: "tplv_python_test",
  templateVersionId: "tplv_python_test"
};

test("openSandboxRuntimeProvider maps lifecycle create to the provider contract", async () => {
  globalThis.fetch = async () =>
    Response.json({
      id: "osbx-provider-test",
      status: { state: "Running" },
      expiresAt: "2026-05-24T12:00:00.000Z",
      metadata: { "harakiri.sandbox": "sbx_provider_test" }
    });

  const result = await openSandboxRuntimeProvider.create({
    template,
    ttlSeconds: 300,
    name: "provider-test"
  });

  assert.equal(result.provider, "opensandbox");
  assert.equal(result.providerSandboxId, "osbx-provider-test");
  assert.equal(result.state, "Running");
  assert.equal(result.expiresAt, "2026-05-24T12:00:00.000Z");
  assert.equal(result.metadata?.["harakiri.sandbox"], "sbx_provider_test");
});

test("openSandboxRuntimeProvider does not synthesize fallback sandbox IDs on create failure", async () => {
  globalThis.fetch = async () => new Response("opensandbox unavailable", { status: 503 });

  await assert.rejects(
    openSandboxRuntimeProvider.create({
      template,
      ttlSeconds: 300,
      name: "provider-test"
    }),
    /OpenSandbox 503/
  );
});

test("openSandboxRuntimeProvider returns unavailable filesystem results instead of false empty listings", async () => {
  globalThis.fetch = async () => new Response("provider unavailable", { status: 503 });

  const result = await openSandboxRuntimeProvider.files({
    provider: "opensandbox",
    providerSandboxId: "osbx-provider-test",
    defaultCwd: "/workspace"
  });

  assert.equal(result.ok, false);
  assert.equal(result.cwd, "/workspace");
  assert.equal(result.defaultCwd, "/workspace");
  assert.deepEqual(result.files, []);
  if (!result.ok) {
    assert.equal(result.error.code, "runtime_files_unavailable");
    assert.equal(result.error.recoverable, true);
  }
});

test("InMemoryRuntimeProvider supports lifecycle, files, logs, metrics, run, and routes", async () => {
  const provider = new InMemoryRuntimeProvider();
  const created = await provider.create({
    template,
    ttlSeconds: 300,
    name: "dev-provider-test",
    metadata: { "harakiri.sandbox": "sbx_dev" }
  });

  assert.equal(created.provider, "dev");
  assert.equal(created.state, "running");
  assert.equal(created.metadata?.["harakiri.sandbox"], "sbx_dev");

  const ref = { provider: created.provider, providerSandboxId: created.providerSandboxId };
  assert.equal((await provider.get(ref))?.providerSandboxId, created.providerSandboxId);
  assert.equal((await provider.list()).length, 1);

  const run = await provider.run({
    ...ref,
    controlPlaneSandboxId: "sbx_dev",
    command: "echo hello"
  });
  assert.equal(run.exitCode, 0);
  assert.equal(run.stdout, "hello\n");

  const pythonRun = await provider.run({
    ...ref,
    controlPlaneSandboxId: "sbx_dev",
    command: "python - <<'PY'\nprint('cli-conformance-ok')\nPY"
  });
  assert.equal(pythonRun.stdout, "cli-conformance-ok\n");

  const envRun = await provider.run({
    ...ref,
    controlPlaneSandboxId: "sbx_dev",
    command: "python - <<'PY'\nimport os\nprint('conformance:' + os.environ.get('HARAKIRI_CONFORMANCE', 'missing'))\nPY",
    env: { HARAKIRI_CONFORMANCE: "ok" }
  });
  assert.equal(envRun.stdout, "conformance:ok\n");

  const fallbackRun = await provider.run({
    ...ref,
    controlPlaneSandboxId: "sbx_dev",
    command: "unknown-command"
  });
  assert.match(fallbackRun.stdout, /harakiri dev runtime/);

  const files = await provider.files({ ...ref, defaultCwd: "/workspace" });
  assert.equal(files.ok, true);
  if (files.ok) {
    assert.equal(files.cwd, "/workspace");
    assert.ok(files.files.some((file) => file.name === "agent.py"));
  }

  const metrics = await provider.metrics(ref);
  assert.equal(metrics?.current.mem, 128);

  config.sandboxRouteBaseDomain = "dev-routes.example.test";
  config.sandboxRoutePublicScheme = "http";

  const route = await provider.exposeRoute({ ...ref, port: 3000, protocol: "http" });
  assert.equal(route.state, "ready");
  assert.equal(route.provider, "dev");
  const expectedRouteKey = routeKeyFor(created.providerSandboxId, 3000);
  assert.equal(route.host, `${expectedRouteKey}.dev-routes.example.test`);
  assert.equal(route.url, `http://${expectedRouteKey}.dev-routes.example.test`);

  await provider.delete(ref);
  assert.equal((await provider.get(ref))?.state, "terminated");
  assert.ok((await provider.logs(ref)).some((log) => log.lvl === "terminated"));
});
