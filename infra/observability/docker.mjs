import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { collectorConfig } from "./collector.mjs";

const execute = promisify(execFile);
const images = JSON.parse(await readFile(new URL("./images.json", import.meta.url), "utf8"));
const label = "io.harakiri.observability-qualification";

export async function docker(args, options = {}) {
  const result = await execute("docker", args, { timeout: 120_000, maxBuffer: 1024 * 1024, ...options });
  return result.stdout.trim();
}

export async function until(description, check, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out: ${description}`);
}

export async function isolatedStack({ externalExport = false } = {}) {
  const id = `hs-otel-${randomBytes(6).toString("hex")}`;
  // Colima shares the home directory, not macOS's per-user /var/folders tmpdir.
  const temporaryRoot = path.join(homedir(), ".cache", "harakiri-observability-qualification");
  await mkdir(temporaryRoot, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(path.join(temporaryRoot, `${id}-`));
  const token = randomBytes(32).toString("hex");
  const forwardToken = randomBytes(32).toString("hex");
  const containers = new Map();
  let networkCreated = false;
  const stack = {
    id, directory, token, images, containers,
    async start() {
      await docker(["network", "create", "--label", `${label}=${id}`, id]);
      networkCreated = true;
      for (const signal of ["logs", "traces"]) {
        const port = signal === "logs" ? 9428 : 10428;
        await this.container(signal, images[signal], port, [
          "-storageDataPath=/state", "-retentionPeriod=1d", "-memory.allowedBytes=134217728",
          "-delete.enable", "-loggerLevel=ERROR", "-inmemoryDataFlushInterval=1s",
          ...(signal === "traces" ? ["-insert.indexFlushInterval=1s", "-search.latencyOffset=3s"] : [])
        ]);
      }
      if (externalExport) {
        const forward = {
          extensions: { "bearertokenauth/forward": { token: "${env:HARAKIRI_EXTERNAL_OTLP_TOKEN}" } },
          receivers: { otlp: { protocols: { http: { endpoint: "0.0.0.0:4318", auth: { authenticator: "bearertokenauth/forward" } } } } },
          exporters: { file: { path: "/state/received.jsonl", format: "json", flush_interval: "100ms" } },
          service: { extensions: ["bearertokenauth/forward"], telemetry: { logs: { level: "error" } },
            pipelines: { traces: { receivers: ["otlp"], exporters: ["file"] }, logs: { receivers: ["otlp"], exporters: ["file"] } } }
        };
        const file = path.join(directory, "forward.json");
        await writeFile(file, JSON.stringify(forward), { mode: 0o600 });
        await this.container("forward", images.collector, 4318, ["--config=/etc/otelcol/config.json"], [
          "--mount", `type=bind,source=${file},target=/etc/otelcol/config.json,readonly`, "--env", "HARAKIRI_EXTERNAL_OTLP_TOKEN"
        ]);
      }
      const config = collectorConfig({
        logsEndpoint: `http://${id}-logs:9428/insert/opentelemetry`,
        tracesEndpoint: `http://${id}-traces:10428/insert/opentelemetry`,
        ...(externalExport ? { externalEndpoint: `http://${id}-forward:4318` } : {})
      });
      await writeFile(path.join(directory, "collector.json"), JSON.stringify(config, null, 2), { mode: 0o600 });
      await this.container("collector", images.collector, 4318, ["--config=/etc/otelcol/config.json"], [
        "--publish", "127.0.0.1::8888",
        "--mount", `type=bind,source=${path.join(directory, "collector.json")},target=/etc/otelcol/config.json,readonly`,
        "--env", "HARAKIRI_COLLECTOR_TOKEN", "--env", "HARAKIRI_EXTERNAL_OTLP_AUTHORIZATION"
      ]);
      await until("Collector receiver", async () => {
        try {
          const response = await fetch(`${this.url("collector")}/v1/traces`, { method: "POST", signal: AbortSignal.timeout(1000) });
          return response.status === 401;
        } catch { return false; }
      });
    },
    async container(name, image, port, command, extra = []) {
      const state = path.join(directory, name);
      await mkdir(state, { mode: 0o700 });
      const containerName = `${id}-${name}`;
      const uid = process.getuid?.() ?? 1000;
      const gid = process.getgid?.() ?? 1000;
      await docker([
        "create", "--name", containerName, "--label", `${label}=${id}`,
        "--network", id, "--cpus", "0.5", "--memory", "256m", "--pids-limit", "128",
        "--user", `${uid}:${gid}`, "--read-only", "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges", "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m",
        "--publish", `127.0.0.1::${port}`,
        "--mount", `type=bind,source=${state},target=${name === "collector" ? "/var/lib/otelcol" : "/state"}`,
        ...extra, image, ...command
      ], { env: { ...process.env, HARAKIRI_COLLECTOR_TOKEN: token,
        HARAKIRI_EXTERNAL_OTLP_TOKEN: forwardToken, HARAKIRI_EXTERNAL_OTLP_AUTHORIZATION: `Bearer ${forwardToken}` } });
      containers.set(name, { name: containerName, port });
      await docker(["start", containerName]);
      await this.refreshPorts(name);
    },
    async refreshPorts(name) {
      const { name: containerName, port } = containers.get(name);
      const mapping = await until(`${name} published port`, async () => {
        const state = JSON.parse(await docker(["inspect", "--format", "{{json .State}}", containerName]));
        if (!state.Running) throw new Error(`${name} exited: ${await this.logs(name)}`);
        const mapping = JSON.parse(await docker(["inspect", "--format", "{{json .NetworkSettings.Ports}}", containerName]));
        return mapping[`${port}/tcp`]?.length ? mapping : false;
      });
      containers.get(name).url = `http://127.0.0.1:${mapping[`${port}/tcp`][0].HostPort}`;
      if (name === "collector") containers.get(name).metrics = `http://127.0.0.1:${mapping["8888/tcp"][0].HostPort}`;
    },
    url(name) { return containers.get(name).url; },
    async stop(name) { await docker(["stop", "--time", "2", containers.get(name).name]); },
    async restart(name, { crash = false } = {}) {
      const container = containers.get(name).name;
      if (crash) await docker(["kill", container]);
      await docker(["start", container]);
      await this.refreshPorts(name);
    },
    async logs(name) {
      const result = await execute("docker", ["logs", containers.get(name).name], { timeout: 5000, maxBuffer: 1024 * 1024 });
      return `${result.stdout}${result.stderr}`.replaceAll(token, "[redacted]").replaceAll(forwardToken, "[redacted]");
    },
    async cleanup() {
      const errors = [];
      const owned = (await docker(["ps", "--all", "--filter", `label=${label}=${id}`, "--format", "{{.Names}}"])).split("\n").filter(Boolean);
      for (const name of owned) {
        try {
          const owner = await docker(["inspect", "--format", `{{index .Config.Labels "${label}"}}`, name]);
          if (owner !== id) throw new Error(`Refusing to delete unowned container ${name}`);
          await docker(["rm", "--force", name]);
        } catch (error) { errors.push(error); }
      }
      if (networkCreated && errors.length === 0) {
        try { await docker(["network", "rm", id]); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, `Cleanup failed for ${id}; private state retained at ${directory}`);
      await rm(directory, { recursive: true, force: true });
    }
  };
  return stack;
}
