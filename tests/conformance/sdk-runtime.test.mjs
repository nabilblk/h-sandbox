import assert from "node:assert/strict";
import test from "node:test";
import { HarakiriClient, HarakiriProviderUnavailableError } from "@h-sandbox/sdk";

const apiUrl = process.env.HARAKIRI_API_URL;
const apiKey = process.env.HARAKIRI_API_KEY;
const template = process.env.HARAKIRI_CONFORMANCE_TEMPLATE ?? "python-3.12-data";
const routePort = Number(process.env.HARAKIRI_CONFORMANCE_ROUTE_PORT ?? "5173");
const requireRouteFetch = process.env.HARAKIRI_CONFORMANCE_ROUTE_FETCH === "1";
const routeFetchBaseUrl = process.env.HARAKIRI_CONFORMANCE_ROUTE_BASE_URL;
const allowProviderUnavailable = process.env.HARAKIRI_CONFORMANCE_ALLOW_PROVIDER_UNAVAILABLE === "1";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const requireEnv = Boolean(apiUrl && apiKey);

const fetchWithRetry = async (url, init = {}, attempts = 12) => {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}: ${await response.text()}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(1_000);
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

const routeFetchUrl = (url) => {
  if (!routeFetchBaseUrl) return url;
  const original = new URL(url);
  const base = new URL(routeFetchBaseUrl);
  original.protocol = base.protocol;
  original.host = base.host;
  return original.toString();
};

const isHarakiriRouteProxyUrl = (url) => new URL(routeFetchUrl(url)).pathname.startsWith("/v1/route-proxy/");

test("public SDK runtime conformance", {
  skip: requireEnv ? false : "set HARAKIRI_API_URL and HARAKIRI_API_KEY to run SDK conformance",
  timeout: 240_000
}, async () => {
  assert(apiUrl);
  assert(apiKey);
  const harakiri = new HarakiriClient({ apiUrl, apiKey });
  let sandboxId = null;
  let serverCommandId = null;

  try {
    const created = await harakiri.createSandbox({
      template,
      name: `sdk-conformance-${Date.now()}`,
      ttlSeconds: 300,
      wait: false,
      idempotencyKey: `sdk-conformance-${Date.now()}`
    });
    sandboxId = created.sandbox.id;
    const ready = await harakiri.waitForSandbox(sandboxId, { timeoutMs: 120_000, intervalMs: 1_000 });
    assert(["running", "idle"].includes(ready.sandbox.status));

    const run = await harakiri.runSandbox(sandboxId, {
      command: "python - <<'PY'\nimport os\nprint('conformance:' + os.environ.get('HARAKIRI_CONFORMANCE', 'missing'))\nPY",
      cwd: "/tmp",
      env: { HARAKIRI_CONFORMANCE: "ok" },
      timeoutMs: 30_000
    });
    assert.equal(run.result.exitCode, 0);
    assert.match(run.result.stdout, /conformance:ok/);

    await harakiri.files.mkdir(sandboxId, { path: "/tmp/harakiri-conformance", recursive: true });
    await harakiri.files.write(sandboxId, {
      path: "/tmp/harakiri-conformance/input.txt",
      content: "hello conformance\n",
      createParents: true
    });
    const stat = await harakiri.files.stat(sandboxId, "/tmp/harakiri-conformance/input.txt");
    assert.equal(stat.file.type, "file");
    const read = await harakiri.files.read(sandboxId, "/tmp/harakiri-conformance/input.txt");
    assert.equal(read.content, "hello conformance\n");
    await harakiri.files.rename(sandboxId, {
      fromPath: "/tmp/harakiri-conformance/input.txt",
      toPath: "/tmp/harakiri-conformance/renamed.txt"
    });
    const artifactContent = Buffer.from("artifact conformance\n");
    await harakiri.artifacts.upload(sandboxId, {
      path: "/tmp/harakiri-conformance/artifact.bin",
      contentBase64: artifactContent.toString("base64"),
      sizeBytes: artifactContent.byteLength,
      createParents: true
    });
    const artifact = await harakiri.artifacts.download(sandboxId, "/tmp/harakiri-conformance/artifact.bin");
    assert.equal(Buffer.from(artifact.contentBase64, "base64").toString("utf8"), "artifact conformance\n");
    assert.equal(artifact.transfer.mode, "json-base64");
    const files = await harakiri.files.list(sandboxId, "/tmp/harakiri-conformance");
    assert(files.files.some((file) => file.path.endsWith("/renamed.txt")));

    const { command } = await harakiri.commands.start(sandboxId, {
      command: `python -m http.server ${routePort} --bind 0.0.0.0`,
      cwd: "/tmp/harakiri-conformance",
      detached: true
    });
    serverCommandId = command.id;
    const running = await harakiri.commands.wait(sandboxId, serverCommandId, {
      statuses: ["running"],
      timeoutMs: 30_000,
      intervalMs: 500
    });
    assert.equal(running.command.status, "running");
    const commandLogs = await harakiri.commands.logs(sandboxId, serverCommandId);
    assert.equal(commandLogs.commandId, serverCommandId);

    const publicRoute = await harakiri.routes.expose(sandboxId, {
      port: routePort,
      accessMode: "public",
      labels: ["conformance", "public"]
    });
    assert.equal(publicRoute.route.accessMode, "public");
    assert.equal(publicRoute.route.port, routePort);
    assert(!publicRoute.accessToken);
    assert(!publicRoute.accessHeaderName);
    let listedRoutes = await harakiri.routes.list(sandboxId);
    assert(listedRoutes.routes.some((entry) => entry.port === routePort && entry.accessMode === "public"));

    if (requireRouteFetch && !routeFetchBaseUrl && !isHarakiriRouteProxyUrl(publicRoute.route.url)) {
      const response = await fetchWithRetry(routeFetchUrl(publicRoute.route.url));
      assert.match(await response.text(), /renamed\.txt|Directory listing|hello conformance|artifact/);
    }

    await harakiri.routes.delete(sandboxId, routePort);
    listedRoutes = await harakiri.routes.list(sandboxId);
    assert(!listedRoutes.routes.some((entry) => entry.port === routePort));

    const route = await harakiri.routes.expose(sandboxId, {
      port: routePort,
      accessMode: "token",
      labels: ["conformance", "token"]
    });
    assert.equal(route.route.accessMode, "token");
    assert.equal(route.route.port, routePort);
    assert(route.accessToken);
    assert(route.accessHeaderName);
    listedRoutes = await harakiri.routes.list(sandboxId);
    assert(listedRoutes.routes.some((entry) => entry.port === routePort));

    if (requireRouteFetch) {
      const unauthorized = await fetch(routeFetchUrl(route.route.url));
      assert([401, 403].includes(unauthorized.status));
      const response = await fetchWithRetry(routeFetchUrl(route.route.url), {
        headers: { [route.accessHeaderName]: route.accessToken }
      });
      assert.match(await response.text(), /renamed\.txt|Directory listing|hello conformance|artifact/);
    }

    const metrics = await harakiri.getSandboxMetrics(sandboxId);
    assert.equal(typeof metrics.current.cpu, "number");
    const logs = await harakiri.getSandboxLogs(sandboxId);
    assert(Array.isArray(logs.logs));

    try {
      const egress = await harakiri.setOutboundAccess(sandboxId, {
        mode: "restricted",
        presets: ["python-package-install"],
        allow: ["api.github.com"]
      });
      assert.equal(egress.egress.mode, "restricted");
      const probe = await harakiri.testOutboundAccess(sandboxId, "https://api.github.com");
      assert(["reachable", "blocked_or_unreachable", "sandbox_not_running"].includes(probe.status));
    } catch (error) {
      if (!(allowProviderUnavailable && error instanceof HarakiriProviderUnavailableError)) throw error;
    }

    await harakiri.renewSandbox(sandboxId);
    await harakiri.routes.delete(sandboxId, routePort);
    listedRoutes = await harakiri.routes.list(sandboxId);
    assert(!listedRoutes.routes.some((entry) => entry.port === routePort));
    await harakiri.files.remove(sandboxId, "/tmp/harakiri-conformance", { recursive: true });
  } finally {
    if (sandboxId && serverCommandId) {
      await harakiri.commands.kill(sandboxId, serverCommandId).catch(() => undefined);
    }
    if (sandboxId) {
      await harakiri.killSandbox(sandboxId).catch(() => undefined);
    }
  }
});
