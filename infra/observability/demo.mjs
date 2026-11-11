import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HarakiriClient } from "../../packages/sdk/dist/index.js";
import { docker, isolatedStack, until } from "./docker.mjs";
import { privatePostgres } from "./postgres-cluster.mjs";
import { recordDemoWorkload } from "./demo-workload.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const webRequire = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const identityImage = "harakiri-observability-local-identity:26.8.0";
const lifetimeMs = 4 * 3600_000;
const action = process.argv[2] ?? "start";

async function readState(file) {
  assert.ok(file, "Pass the state.json path printed at startup");
  const state = JSON.parse(await readFile(file, "utf8"));
  assert.equal(state.kind, "harakiri-local-telemetry-demo");
  assert.match(state.owner, /^hs-otel-[a-f0-9]{12}$/);
  assert.equal(new URL(state.apiUrl).hostname, "127.0.0.1");
  assert.ok(Date.parse(state.expiresAt) > Date.now(), "Demo expired; start a new one");
  const health = await (await fetch(`${state.apiUrl}/health`, { signal: AbortSignal.timeout(2000) })).json();
  assert.equal(health.owner, state.owner, "Demo ownership does not match");
  return state;
}

async function populate(state, producer) {
  const client = new HarakiriClient({ apiUrl: state.apiUrl, apiKey: producer.apiKey });
  const results = [];
  for (const scenario of [
    { name: "Local validation: failure, repair and verified report", capture: "content", repair: true },
    { name: "Local validation: failed, no retry", capture: "content", repair: false },
    { name: "Local validation: metadata-only privacy", capture: "metadata", repair: true }
  ]) {
    const { run } = await client.agentRuns.create({ name: scenario.name, sandboxId: producer.sandboxId, capture: scenario.capture });
    const grant = await client.agentRuns.grant(run.id, producer.sandboxId);
    let outcome = "unknown";
    try {
      const result = await recordDemoWorkload(grant, scenario);
      outcome = result.outcome;
      const window = { from: run.createdAt, to: new Date().toISOString(), includeContent: scenario.capture === "content", limit: 100 };
      await until("real demo spans are queryable", async () => (await client.agentRuns.spans(run.id, window)).records.length === result.steps.length + 1);
      await until("real demo logs are queryable", async () => (await client.agentRuns.logs(run.id, window)).records.length >= result.steps.length);
      results.push({ id: run.id, name: scenario.name, capture: scenario.capture, outcome, traceId: result.traceId,
        steps: result.steps, url: `${state.webUrl}/#dashboard/runs?run=${run.id}` });
    } finally {
      try { await client.agentRuns.close(run.id, outcome); }
      finally { await client.agentRuns.revokeGrant(run.id, grant.id); }
    }
  }
  return results;
}

async function start() {
  const { createServer } = await import(webRequire.resolve("vite"));
  const { default: react } = await import(webRequire.resolve("@vitejs/plugin-react"));
  const webPort = Number(process.env.HARAKIRI_DEMO_WEB_PORT ?? 15229);
  assert.ok(Number.isInteger(webPort) && webPort > 1024 && webPort < 65536);
  const webUrl = `http://127.0.0.1:${webPort}`;
  const stack = await isolatedStack();
  let database, api, web, webHttp, timer;
  let stopped = false;
  let stop;
  const interrupted = new Promise((resolve) => { stop = resolve; });
  const signal = () => { stopped = true; stop(); };
  process.on("SIGINT", signal);
  process.on("SIGTERM", signal);
  const ensureRunning = () => { if (stopped) throw new Error("Demo startup interrupted"); };
  try {
    // No repo .env, API-key exposure or auth stubs: use the normal web auth flow.
    let runtimeConfig = {};
    web = await createServer({ configFile: false, envFile: false, root: path.join(root, "apps/web"),
      plugins: [react(), { name: "owned-demo-runtime-config", configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (!runtimeConfig.PUBLIC_API_URL) {
            response.writeHead(503, { "Content-Type": "text/plain", "Cache-Control": "no-store", "Retry-After": "2" });
            response.end("Local telemetry demo is starting.");
            return;
          }
          if (request.url !== "/config.js") return next();
          response.setHeader("Content-Type", "application/javascript");
          response.setHeader("Cache-Control", "no-store");
          response.end(`window.__HARAKIRI_CONFIG__=${JSON.stringify(runtimeConfig)};`);
        });
      } }], server: { middlewareMode: true, hmr: false } });
    // The supervisor owns termination; Vite's standalone SIGTERM handler exits
    // the process before database and container cleanup can finish.
    webHttp = createHttpServer(web.middlewares);
    await new Promise((resolve, reject) => {
      webHttp.once("error", reject);
      webHttp.listen(webPort, "127.0.0.1", resolve);
    });
    await stack.start();
    ensureRunning();
    const subject = randomUUID(), username = "observer", password = randomBytes(24).toString("base64url");
    const realm = { realm: "telemetry-demo", enabled: true, sslRequired: "none", registrationAllowed: false,
      displayName: "Harakiri local telemetry lab", accessTokenLifespan: 900,
      clients: [{ clientId: "harakiri-web", publicClient: true, standardFlowEnabled: true, directAccessGrantsEnabled: false,
        redirectUris: [`${webUrl}/*`], webOrigins: [webUrl], attributes: { "pkce.code.challenge.method": "S256" },
        protocolMappers: [{ name: "harakiri-api-audience", protocol: "openid-connect", protocolMapper: "oidc-audience-mapper",
          config: { "included.custom.audience": "harakiri-api", "access.token.claim": "true", "id.token.claim": "false" } }] }],
      users: [{ id: subject, username, enabled: true, emailVerified: true, email: "observer@localhost.test", firstName: "Local", lastName: "Observer",
        credentials: [{ type: "password", value: password, temporary: false }], requiredActions: [] }] };
    const realmPath = path.join(stack.directory, "realm.json");
    await writeFile(realmPath, JSON.stringify(realm), { mode: 0o600 });
    const identity = `${stack.id}-identity`;
    const uid = process.getuid?.() ?? 1000, gid = process.getgid?.() ?? 1000;
    console.log("Preparing isolated identity image (no realms or credentials in image layers).");
    await docker(["build", "--network=none", "--tag", identityImage, fileURLToPath(new URL("./identity/", import.meta.url))]);
    await docker(["create", "--name", identity, "--label", `io.harakiri.observability-qualification=${stack.id}`, "--network", stack.id,
      "--cpus", "1", "--memory", "768m", "--pids-limit", "256", "--user", `${uid}:${gid}`, "--read-only", "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges", "--publish", "127.0.0.1::8080",
      "--tmpfs", `/tmp:rw,nosuid,size=64m,uid=${uid},gid=${gid}`,
      "--tmpfs", `/opt/keycloak/data:rw,nosuid,size=128m,uid=${uid},gid=${gid}`,
      "--mount", `type=bind,source=${realmPath},target=/opt/keycloak/data/import/realm.json,readonly`,
      identityImage, "start", "--optimized", "--http-enabled=true", "--hostname-strict=false", "--import-realm", "--log-level=warn"]);
    stack.containers.set("identity", { name: identity, port: 8080 });
    await docker(["start", identity]);
    const mapping = JSON.parse(await docker(["inspect", "--format", "{{json .NetworkSettings.Ports}}", identity]));
    const identityUrl = `http://127.0.0.1:${mapping["8080/tcp"][0].HostPort}`;
    await until("private Keycloak realm", async () => {
      const state = JSON.parse(await docker(["inspect", "--format", "{{json .State}}", identity]));
      if (!state.Running) {
        const logs = await stack.logs("identity");
        throw new Error(`Owned Keycloak exited: ${logs.replaceAll(password, "[redacted]")}`);
      }
      try { return (await fetch(`${identityUrl}/realms/telemetry-demo/.well-known/openid-configuration`, { signal: AbortSignal.timeout(1000) })).ok; }
      catch { return false; }
    }, 90_000);
    ensureRunning();
    database = privatePostgres();
    api = spawn(process.execPath, ["--import", import.meta.resolve("tsx"), fileURLToPath(new URL("./demo-api.mjs", import.meta.url))], {
      cwd: database.directory, env: {
        PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: database.url, RUNTIME_PROVIDER: "dev", AUTH_DEV_ALLOW: "0",
        DEMO_KEYCLOAK_SUBJECT: subject, DEMO_WEB_URL: webUrl, DEMO_OWNER: stack.id,
        KEYCLOAK_ISSUER: `${identityUrl}/realms/telemetry-demo`, KEYCLOAK_JWKS_URL: `${identityUrl}/realms/telemetry-demo/protocol/openid-connect/certs`,
        KEYCLOAK_AUDIENCE: "harakiri-api", OBSERVABILITY_ENABLED: "1", OBSERVABILITY_ALLOW_CONTENT: "1", OBSERVABILITY_RETENTION_DAYS: "1",
        OBSERVABILITY_COLLECTOR_URL: stack.url("collector"), OBSERVABILITY_COLLECTOR_TOKEN: stack.token,
        OBSERVABILITY_LOGS_URL: stack.url("logs"), OBSERVABILITY_TRACES_URL: stack.url("traces")
      }, stdio: ["ignore", "inherit", "inherit", "ipc"]
    });
    const producer = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Demo API startup timed out")), 30_000);
      api.once("message", (message) => { clearTimeout(timeout); resolve(message); });
      api.once("error", (error) => { clearTimeout(timeout); reject(error); });
      api.once("exit", () => { clearTimeout(timeout); reject(new Error("Demo API exited during startup")); signal(); });
    });
    ensureRunning();
    runtimeConfig = { PUBLIC_API_URL: producer.apiUrl, PUBLIC_KEYCLOAK_URL: identityUrl,
      PUBLIC_KEYCLOAK_REALM: "telemetry-demo", PUBLIC_KEYCLOAK_CLIENT_ID: "harakiri-web" };
    const statePath = path.join(stack.directory, "state.json"), credentialsPath = path.join(stack.directory, "login.json");
    const producerPath = path.join(stack.directory, "producer.json");
    const state = { kind: "harakiri-local-telemetry-demo", owner: stack.id, supervisorPid: process.pid, webUrl,
      apiUrl: producer.apiUrl, identityUrl, credentialsPath, producerPath,
      expiresAt: new Date(Date.now() + lifetimeMs).toISOString(),
      boundary: "Real telemetry from local validation processes. No LLM and no sandbox runtime; sandbox binding is test metadata." };
    await writeFile(credentialsPath, JSON.stringify({ username, password }, null, 2), { mode: 0o600 });
    await writeFile(producerPath, JSON.stringify(producer), { mode: 0o600 });
    state.runs = await populate(state, producer);
    await writeFile(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
    timer = setTimeout(signal, lifetimeMs);
    console.log(JSON.stringify({ ...state, statePath }, null, 2));
    await interrupted;
  } finally {
    clearTimeout(timer);
    const errors = [];
    try {
      if (webHttp?.listening) {
        const closed = new Promise((resolve, reject) => webHttp.close((error) => error ? reject(error) : resolve()));
        webHttp.closeAllConnections();
        await closed;
      }
    } catch (error) { errors.push(error); }
    try { await web?.close(); } catch (error) { errors.push(error); }
    try {
      if (api && api.exitCode === null) {
        const exited = new Promise((resolve) => api.once("exit", resolve));
        api.kill("SIGTERM");
        const force = setTimeout(() => api.kill("SIGKILL"), 5000);
        await exited; clearTimeout(force);
      }
    } catch (error) { errors.push(error); }
    try { database?.close(); } catch (error) { errors.push(error); }
    try { await stack.cleanup(); } catch (error) { errors.push(error); }
    process.off("SIGINT", signal);
    process.off("SIGTERM", signal);
    if (errors.length) throw new AggregateError(errors, "Owned demo cleanup needs inspection");
    console.log("Owned local telemetry demo stopped and removed.");
  }
}

if (action === "start") await start();
else {
  const statePath = process.argv[3];
  const state = await readState(statePath);
  if (action === "status") console.log(JSON.stringify(state, null, 2));
  else if (action === "stop") process.kill(state.supervisorPid, "SIGTERM");
  else if (action === "run") {
    const producer = JSON.parse(await readFile(state.producerPath, "utf8"));
    state.runs = await populate(state, producer);
    await writeFile(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(state.runs, null, 2));
  } else throw new Error("Usage: demo.mjs [start | status STATE | run STATE | stop STATE]");
}
