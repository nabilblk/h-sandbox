#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Command } from "commander";
import { initBanner, progressLine, runtimeLine, shouldUseColor } from "./format.js";

type Config = {
  apiUrl: string;
  apiKey?: string;
  lastSandboxId?: string;
};

type RouteResult = {
  port: number;
  protocol: string;
  host: string;
  url: string;
  targetUrl: string;
  state: string;
  provider: string;
};

type TemplateResult = {
  id: string;
  name: string;
  visibility: string;
  status: string;
  image: string;
  imageDigest?: string | null;
  cpuCount: number;
  memoryMb: number;
  workdir: string;
  defaultPorts: number[];
  latestVersionId?: string | null;
};

type TemplateBuildResult = {
  id: string;
  templateId: string;
  status: string;
  sourceType: string;
  dockerfilePath?: string | null;
  imageDestination?: string | null;
  imageDigest?: string | null;
  error?: string | null;
  createdAt: string;
};

type TemplateBuildLog = {
  lineNo: number;
  stream: string;
  message: string;
  createdAt: string;
};

const configPath = join(homedir(), ".config", "harakiri", "config.json");
const defaultApiUrl = process.env.HARAKIRI_API_URL ?? "http://127.0.0.1:8080";
const defaultKey = process.env.HARAKIRI_API_KEY;

const loadConfig = async (): Promise<Config> => {
  if (!existsSync(configPath)) return { apiUrl: defaultApiUrl, apiKey: defaultKey };
  const parsed = JSON.parse(await readFile(configPath, "utf8")) as Partial<Config>;
  return {
    apiUrl: parsed.apiUrl ?? defaultApiUrl,
    apiKey: parsed.apiKey ?? defaultKey,
    lastSandboxId: parsed.lastSandboxId
  };
};

const saveConfig = async (config: Config) => {
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2));
};

const api = async <T>(path: string, init: RequestInit = {}) => {
  const config = await loadConfig();
  if (!config.apiKey) throw new Error(`missing API key. Run "harakiri login --api-url ${config.apiUrl} --api-key hk_live_..." first.`);
  const hasBody = init.body !== undefined;
  const response = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: {
      ...(hasBody ? { "content-type": "application/json" } : {}),
      "x-api-key": config.apiKey,
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
};

const printProgress = (line: string) => console.log(progressLine(line));

const templateIdFor = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "custom-template";

const templateConfig = (name: string, dockerfile: string) => `# Harakiri sandbox template.
# This is intentionally close to E2B's e2b.toml while using OpenSandbox images.

name = "${name}"
dockerfile = "${dockerfile}"
visibility = "private"
cpu_count = 2
memory_mb = 2048
workdir = "/workspace"
ports = [3000, 5173, 4321, 8000]
start_command = "sleep 3600"
ready_command = "true"
`;

const program = new Command();
program.name("harakiri").description("Harakiri Sandbox CLI").version("0.41.2");

program
  .command("init")
  .description("Print the Harakiri terminal banner")
  .action(() => {
    console.log(initBanner(shouldUseColor()));
  });

program
  .command("login")
  .description("Store API connection settings")
  .option("--api-url <url>", "Harakiri API URL", defaultApiUrl)
  .option("--api-key <key>", "Harakiri API key", defaultKey)
  .action(async (options) => {
    if (!options.apiKey) throw new Error("missing --api-key. Create a key in the dashboard or with the API first.");
    await saveConfig({ apiUrl: options.apiUrl, apiKey: options.apiKey });
    printProgress(`saved config at ${configPath}`);
  });

const template = program.command("template").description("Manage sandbox templates");

template
  .command("init")
  .description("Create a harakiri.toml template config")
  .option("--name <name>", "template name", "open-agents-dev")
  .option("--dockerfile <file>", "Dockerfile path", "Dockerfile")
  .option("--force", "overwrite an existing harakiri.toml")
  .action(async (options) => {
    const path = join(process.cwd(), "harakiri.toml");
    if (existsSync(path) && !options.force) throw new Error(`${path} already exists. Use --force to overwrite.`);
    await writeFile(path, templateConfig(options.name, options.dockerfile));
    printProgress(`wrote ${path}`);
  });

template
  .command("list")
  .description("List templates")
  .action(async () => {
    const result = await api<{ templates: TemplateResult[] }>("/v1/templates");
    for (const item of result.templates) {
      console.log(`${item.id}\t${item.visibility}\t${item.cpuCount} CPU\t${item.memoryMb} MB\t${item.image}`);
    }
  });

template
  .command("inspect")
  .argument("<id>", "template id, name, or alias")
  .description("Inspect a template")
  .action(async (id) => {
    const result = await api<{ template: TemplateResult }>(`/v1/templates/${encodeURIComponent(id)}`);
    console.log(JSON.stringify(result.template, null, 2));
  });

template
  .command("build")
  .argument("[path]", "template build context", ".")
  .description("Create a template build record")
  .requiredOption("--name <name>", "template name")
  .option("--dockerfile <file>", "Dockerfile path", "Dockerfile")
  .option("--image <ref>", "target image reference")
  .action(async (contextPath, options) => {
    const id = templateIdFor(options.name);
    try {
      await api<{ template: TemplateResult }>("/v1/templates", {
        method: "POST",
        body: JSON.stringify({
          id,
          name: options.name,
          image: options.image ?? "ubuntu:24.04",
          aliases: [options.name],
          defaultPorts: [3000, 5173, 4321, 8000],
          workdir: "/workspace",
          runtimeFamily: "custom"
        })
      });
      printProgress(`created template ${id}`);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("template_exists")) throw error;
    }

    const result = await api<{ build: TemplateBuildResult }>(`/v1/templates/${encodeURIComponent(id)}/builds`, {
      method: "POST",
      body: JSON.stringify({
        sourceType: "dockerfile",
        dockerfilePath: options.dockerfile,
        imageDestination: options.image,
        metadata: { localPath: contextPath }
      })
    });
    printProgress(`${result.build.status}. build=${result.build.id}`);
    console.log(result.build.id);
  });

template
  .command("builds")
  .description("List template builds")
  .option("--status <status>", "filter by build status")
  .option("--query <query>", "filter by build or template id")
  .action(async (options) => {
    const params = new URLSearchParams();
    if (options.status) params.set("status", options.status);
    if (options.query) params.set("q", options.query);
    const suffix = params.size ? `?${params.toString()}` : "";
    const result = await api<{ builds: TemplateBuildResult[] }>(`/v1/template-builds${suffix}`);
    for (const build of result.builds) {
      console.log(`${build.id}\t${build.status}\t${build.templateId}\t${build.createdAt}`);
    }
  });

template
  .command("logs")
  .argument("<build-id>", "template build id")
  .description("Read template build logs")
  .action(async (id) => {
    const result = await api<{ logs: TemplateBuildLog[] }>(`/v1/template-builds/${encodeURIComponent(id)}/logs`);
    for (const line of result.logs) console.log(`${line.lineNo}\t${line.stream}\t${line.message}`);
  });

template
  .command("promote")
  .argument("<template-id>", "template id, name, or alias")
  .requiredOption("--version-id <id>", "template version id")
  .option("--alias <alias>", "alias to promote", "stable")
  .description("Promote a template version")
  .action(async (id, options) => {
    const result = await api<{ template: TemplateResult }>(`/v1/templates/${encodeURIComponent(id)}/promote`, {
      method: "POST",
      body: JSON.stringify({ versionId: options.versionId, alias: options.alias })
    });
    printProgress(`promoted ${result.template.id} -> ${result.template.latestVersionId ?? options.versionId}`);
  });

program
  .command("create")
  .description("Create a sandbox")
  .requiredOption("--template <id>", "template id")
  .option("--name <name>", "sandbox name")
  .option("--ttl <seconds>", "idle TTL", "300")
  .action(async (options) => {
    printProgress("provisioning microVM...");
    const started = Date.now();
    const result = await api<{ sandbox: { id: string; name: string; template: string } }>("/v1/sandboxes", {
      method: "POST",
      body: JSON.stringify({ template: options.template, name: options.name, ttlSeconds: Number(options.ttl) })
    });
    const config = await loadConfig();
    await saveConfig({ ...config, lastSandboxId: result.sandbox.id });
    printProgress(`sealed. id=${result.sandbox.id}`);
    console.log(result.sandbox.id);
    printProgress(`provisioned in ${Date.now() - started}ms`);
  });

program
  .command("list")
  .description("List sandboxes")
  .action(async () => {
    const result = await api<{ sandboxes: Array<{ id: string; name: string; status: string; template: string }> }>("/v1/sandboxes");
    for (const sandbox of result.sandboxes) {
      console.log(`${sandbox.id}\t${sandbox.status}\t${sandbox.template}\t${sandbox.name}`);
    }
  });

program
  .command("status")
  .argument("<id>", "sandbox id")
  .description("Show sandbox status")
  .action(async (id) => {
    const result = await api<{ sandbox: { id: string; status: string; template: string; publicUrl: string | null } }>(`/v1/sandboxes/${id}`);
    console.log(`${result.sandbox.id} ${result.sandbox.status} ${result.sandbox.template} ${result.sandbox.publicUrl ?? ""}`.trim());
  });

program
  .command("expose")
  .argument("<id>", "sandbox id")
  .description("Expose a sandbox HTTP port")
  .requiredOption("--port <port>", "port inside the sandbox")
  .option("--protocol <protocol>", "route protocol", "http")
  .action(async (id, options) => {
    const port = Number(options.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("--port must be an integer from 1 to 65535");
    printProgress(`exposing port ${port}`);
    const result = await api<{ route: RouteResult }>(`/v1/sandboxes/${id}/routes`, {
      method: "POST",
      body: JSON.stringify({ port, protocol: options.protocol })
    });
    printProgress(`${result.route.state}. provider=${result.route.provider}`);
    console.log(result.route.url);
  });

program
  .command("routes")
  .argument("<id>", "sandbox id")
  .description("List exposed sandbox ports")
  .action(async (id) => {
    const result = await api<{ routes: RouteResult[] }>(`/v1/sandboxes/${id}/routes`);
    for (const route of result.routes) {
      console.log(`${route.port}\t${route.state}\t${route.provider}\t${route.url}`);
    }
  });

program
  .command("run")
  .argument("[id]", "sandbox id")
  .description("Run a command in a sandbox")
  .option("--stdin <file>", "read command input from file")
  .option("--cmd <command>", "command to run")
  .option("--template <id>", "create a temporary sandbox with this template", "python-3.12-data")
  .action(async (maybeId, options) => {
    const config = await loadConfig();
    let id = maybeId as string | undefined;
    let shouldTerminateAfterRun = false;
    if (!id && config.lastSandboxId) {
      id = config.lastSandboxId;
      shouldTerminateAfterRun = true;
    }
    if (!id) {
      const created = await api<{ sandbox: { id: string } }>("/v1/sandboxes", {
        method: "POST",
        body: JSON.stringify({ template: options.template, ttlSeconds: 300 })
      });
      id = created.sandbox.id;
      shouldTerminateAfterRun = true;
      printProgress(`sealed. id=${id}`);
    }

    const stdin = options.stdin ? await readFile(options.stdin, "utf8").catch(() => options.stdin) : undefined;
    const command = options.cmd ?? (options.stdin ? `python ${options.stdin}` : "ls");
    const started = Date.now();
    const result = await api<{ result: { stdout: string; stderr: string; exitCode: number; durationMs: number } }>(`/v1/sandboxes/${id}/run`, {
      method: "POST",
      body: JSON.stringify({ command, stdin })
    });
    process.stdout.write(result.result.stdout);
    if (result.result.stderr) process.stderr.write(result.result.stderr);
    if (result.result.exitCode === 0) {
      console.log(runtimeLine(result.result.durationMs));
    }
    if (shouldTerminateAfterRun) {
      await api(`/v1/sandboxes/${id}`, { method: "DELETE" });
      await saveConfig({ ...config, lastSandboxId: undefined });
      printProgress("sandbox terminated. disk zeroed.");
    }
    printProgress(`roundtrip ${Date.now() - started}ms`);
  });

program
  .command("logs")
  .argument("<id>", "sandbox id")
  .description("Read sandbox logs")
  .action(async (id) => {
    const result = await api<{ logs: Array<{ ts: string; lvl: string; msg: string }> }>(`/v1/sandboxes/${id}/logs`);
    for (const row of result.logs) console.log(`${row.ts} ${String(row.lvl).toUpperCase()} ${row.msg}`);
  });

program
  .command("files")
  .argument("<id>", "sandbox id")
  .description("List sandbox files")
  .action(async (id) => {
    const result = await api<{ files: Array<{ path: string; type: string; size: number }> }>(`/v1/sandboxes/${id}/files`);
    for (const file of result.files) console.log(`${file.type}\t${file.size}\t${file.path}`);
  });

program
  .command("kill")
  .argument("[id]", "sandbox id")
  .option("--idle", "kill idle sandboxes")
  .description("Terminate a sandbox")
  .action(async (id, options) => {
    if (options.idle) {
      const result = await api<{ sandboxes: Array<{ id: string; status: string }> }>("/v1/sandboxes?status=idle");
      for (const sandbox of result.sandboxes) {
        await api(`/v1/sandboxes/${sandbox.id}`, { method: "DELETE" });
        printProgress(`${sandbox.id} terminated. disk zeroed.`);
      }
      return;
    }
    if (!id) throw new Error("sandbox id is required unless --idle is set");
    await api(`/v1/sandboxes/${id}`, { method: "DELETE" });
    printProgress("sandbox terminated. disk zeroed.");
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
