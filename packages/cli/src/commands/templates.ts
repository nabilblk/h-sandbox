import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Command } from "commander";
import type { HarakiriClient } from "@harakiri/sdk";
import type { TemplateBuildSummary } from "@harakiri/shared";
import { apiClient } from "../config.js";
import { createBuildContextArchive } from "../context.js";
import { templateBuildLogLine, templateBuildSuccessLines } from "../format.js";
import { commandToEntrypoint, parseHarakiriTemplateConfig } from "../template-config.js";
import {
  collectPort,
  collectString,
  parsePositiveInt,
  printProgress,
  sleep,
  templateIdFor,
  tomlArray,
  tomlString,
  uniqueStrings
} from "../utils.js";

type TemplateBuildResult = TemplateBuildSummary;

type TemplateInitOptions = {
  name: string;
  id?: string;
  dockerfile?: string;
  image?: string;
  visibility: "public" | "private" | "internal";
  cpuCount: number;
  memoryMb: number;
  workdir: string;
  ports: number[];
  tags: string[];
  aliases: string[];
  runtimeFamily: string;
  startCommand: string;
  readyCommand: string;
};

const templateConfig = (options: TemplateInitOptions) => {
  const id = templateIdFor(options.id ?? options.name);
  return `# Harakiri sandbox template.
# Build this as an OpenSandbox-compatible OCI image.

name = ${tomlString(options.name)}
id = ${tomlString(id)}
visibility = ${tomlString(options.visibility)}
runtime_family = ${tomlString(options.runtimeFamily)}
${options.image ? `image = ${tomlString(options.image)}` : `dockerfile = ${tomlString(options.dockerfile ?? "Dockerfile")}`}
cpu_count = ${options.cpuCount}
memory_mb = ${options.memoryMb}
workdir = ${tomlString(options.workdir)}
ports = ${tomlArray(options.ports)}
tags = ${tomlArray(options.tags)}
aliases = ${tomlArray(options.aliases)}
start_command = ${tomlString(options.startCommand)}
ready_command = ${tomlString(options.readyCommand)}
`;
};

const loadTemplateConfig = async (contextPath: string) => {
  const path = join(resolve(contextPath), "harakiri.toml");
  if (!existsSync(path)) return {};
  return parseHarakiriTemplateConfig(await readFile(path, "utf8"));
};

const terminalBuildStatuses = new Set(["success", "failed", "canceled"]);

const templateVersionIdFromBuild = (build: TemplateBuildResult) => {
  const value = build.metadata?.templateVersionId;
  return typeof value === "string" ? value : null;
};

const buildDurationMs = (build: TemplateBuildResult) => {
  const startedAt = build.startedAt ?? build.createdAt;
  const completedAt = build.completedAt ?? build.updatedAt;
  if (!startedAt || !completedAt) return null;
  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) return null;
  return completed - started;
};

const streamTemplateBuildLogs = async (client: HarakiriClient, buildId: string, lastLineNo: number) => {
  const result = await client.getTemplateBuildLogs(buildId);
  let nextLineNo = lastLineNo;
  for (const line of result.logs) {
    if (line.lineNo <= lastLineNo) continue;
    console.log(templateBuildLogLine(line.stream, line.message));
    nextLineNo = Math.max(nextLineNo, line.lineNo);
  }
  return nextLineNo;
};

const followTemplateBuild = async (
  client: HarakiriClient,
  build: TemplateBuildResult,
  options: { pollIntervalMs: number; timeoutSeconds: number }
) => {
  let lastLineNo = 0;
  let lastStatus = build.status;
  const deadline = Date.now() + options.timeoutSeconds * 1000;
  let current = build;
  while (true) {
    lastLineNo = await streamTemplateBuildLogs(client, build.id, lastLineNo);
    const refreshed = await client.getTemplateBuild(build.id);
    current = refreshed.build;
    if (current.status !== lastStatus) {
      if (!terminalBuildStatuses.has(current.status)) printProgress(`${current.status}. build=${current.id}`);
      lastStatus = current.status;
    }
    if (terminalBuildStatuses.has(current.status)) {
      lastLineNo = await streamTemplateBuildLogs(client, build.id, lastLineNo);
      return current;
    }
    if (Date.now() > deadline) throw new Error(`template build ${build.id} did not finish within ${options.timeoutSeconds}s`);
    await sleep(options.pollIntervalMs);
  }
};

const printTemplateBuildSuccess = (build: TemplateBuildResult) => {
  for (const line of templateBuildSuccessLines({
    buildId: build.id,
    templateId: build.templateId,
    templateVersionId: templateVersionIdFromBuild(build),
    imageDigest: build.imageDigest,
    durationMs: buildDurationMs(build)
  })) {
    printProgress(line);
  }
};

export const registerTemplateCommands = (program: Command) => {
  const template = program
    .command("template")
    .description("Manage sandbox templates")
    .addHelpText("after", `
Examples:
  $ harakiri template init --name open-agents-dev --dockerfile Dockerfile
  $ harakiri template build --name open-agents-dev .
  $ harakiri template builds --query open-agents-dev
  $ harakiri template promote open-agents-dev --version-id tplv_... --alias stable
`);

  template
    .command("init")
    .description("Create a harakiri.toml template config")
    .option("--name <name>", "template name", "open-agents-dev")
    .option("--id <id>", "template id; defaults to a slug derived from --name")
    .option("--dockerfile <file>", "Dockerfile path")
    .option("--image <ref>", "existing OCI image reference for image-import templates")
    .option("--visibility <visibility>", "template visibility: public, private, or internal", "private")
    .option("--cpu-count <count>", "default vCPU count", parsePositiveInt, 2)
    .option("--memory-mb <mb>", "default memory in MiB", parsePositiveInt, 2048)
    .option("--workdir <path>", "default workdir", "/workspace")
    .option("--port <port>", "default exposed port; can be repeated", collectPort, [])
    .option("--tag <tag>", "template tag; can be repeated", collectString, [])
    .option("--alias <alias>", "template alias; can be repeated", collectString, [])
    .option("--runtime-family <family>", "runtime family label", "custom")
    .option("--start-command <command>", "default command to keep the sandbox alive", "sleep 3600")
    .option("--ready-command <command>", "readiness command stored in config", "true")
    .option("--force", "overwrite an existing harakiri.toml")
    .addHelpText("after", `
Examples:
  $ harakiri template init --name open-agents-dev --dockerfile Dockerfile
  $ harakiri template init --name browser-agent --dockerfile Containerfile --port 3000 --port 5173 --tag hot --force
  $ harakiri template init --name ubuntu-import --image ubuntu:24.04 --runtime-family linux
`)
    .action(async (options) => {
      if (!["public", "private", "internal"].includes(options.visibility)) throw new Error("--visibility must be public, private, or internal");
      const path = join(process.cwd(), "harakiri.toml");
      if (existsSync(path) && !options.force) throw new Error(`${path} already exists. Use --force to overwrite.`);
      const tags = uniqueStrings(options.tag.length ? options.tag : ["custom"]);
      const aliases = uniqueStrings(options.alias.length ? options.alias : [templateIdFor(options.id ?? options.name)]);
      await writeFile(path, templateConfig({
        name: options.name,
        id: options.id,
        dockerfile: options.dockerfile ?? (options.image ? undefined : "Dockerfile"),
        image: options.image,
        visibility: options.visibility,
        cpuCount: options.cpuCount,
        memoryMb: options.memoryMb,
        workdir: options.workdir,
        ports: options.port.length ? options.port : [3000, 5173, 4321, 8000],
        tags,
        aliases,
        runtimeFamily: options.runtimeFamily,
        startCommand: options.startCommand,
        readyCommand: options.readyCommand
      }));
      printProgress(`wrote ${path}`);
    });

  template
    .command("list")
    .description("List templates")
    .addHelpText("after", `
Examples:
  $ harakiri template list
  $ harakiri template inspect open-agents-dev
`)
    .action(async () => {
      const client = await apiClient();
      const result = await client.listTemplates();
      for (const item of result.templates) {
        console.log(`${item.id}\t${item.visibility}\t${item.cpuCount} CPU\t${item.memoryMb} MB\t${item.image}`);
      }
    });

  template
    .command("inspect")
    .argument("<id>", "template id, name, or alias")
    .description("Inspect a template")
    .addHelpText("after", `
Examples:
  $ harakiri template inspect open-agents-dev
  $ harakiri template inspect tplv_...
`)
    .action(async (id) => {
      const client = await apiClient();
      const result = await client.getTemplate(id);
      console.log(JSON.stringify(result.template, null, 2));
    });

  template
    .command("build")
    .argument("[path]", "template build context", ".")
    .description("Create a template build record")
    .option("--name <name>", "template name")
    .option("--dockerfile <file>", "Dockerfile path")
    .option("--image <ref>", "target image reference")
    .option("--visibility <visibility>", "template visibility: public, private, or internal")
    .option("--cpu-count <count>", "default vCPU count", Number)
    .option("--memory-mb <mb>", "default memory in MiB", Number)
    .option("--workdir <path>", "default workdir")
    .option("--port <port>", "default exposed port; can be repeated", collectPort, [])
    .option("--source <type>", "build source type: dockerfile, git, or image", "dockerfile")
    .option("--no-wait", "enqueue the build and return without following logs")
    .option("--poll-interval-ms <ms>", "build status polling interval while waiting", parsePositiveInt, 2000)
    .option("--timeout <seconds>", "maximum time to wait for build completion", parsePositiveInt, 900)
    .addHelpText("after", `
Examples:
  $ harakiri template build --name open-agents-dev .
  $ harakiri template build --name open-agents-dev examples/templates/open-agents-dev
  $ harakiri template build --name ubuntu-import --source image --image ubuntu:24.04
  $ harakiri template build --name open-agents-dev . --no-wait
`)
    .action(async (contextPath, options) => {
      const templateFile = await loadTemplateConfig(contextPath);
      if (!["dockerfile", "git", "image"].includes(options.source)) throw new Error("--source must be dockerfile, git, or image");
      const image = options.image ?? templateFile.image;
      if (options.source === "image" && !image) throw new Error("--source image requires --image <ref>");
      const name = options.name ?? templateFile.name ?? templateFile.id;
      if (!name) throw new Error("missing template name. Pass --name or add name to harakiri.toml.");
      const dockerfile = options.dockerfile ?? templateFile.dockerfile ?? "Dockerfile";
      const ports = options.port.length ? options.port : (templateFile.ports ?? [3000, 5173, 4321, 8000]);
      const aliases = Array.from(new Set([name, ...(templateFile.aliases ?? [])]));
      const id = templateIdFor(templateFile.id ?? name);
      const client = await apiClient();
      try {
        await client.createTemplate({
          id,
          name,
          description: templateFile.description,
          image: image ?? "ubuntu:24.04",
          aliases,
          visibility: options.visibility ?? templateFile.visibility,
          defaultEntrypoint: commandToEntrypoint(templateFile.startCommand),
          cpuCount: options.cpuCount ?? templateFile.cpuCount,
          memoryMb: options.memoryMb ?? templateFile.memoryMb,
          defaultPorts: ports,
          workdir: options.workdir ?? templateFile.workdir ?? "/workspace",
          runtimeFamily: templateFile.runtimeFamily ?? "custom",
          tags: templateFile.tags
        });
        printProgress(`created template ${id}`);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("template_exists")) throw error;
      }

      const result = await client.createTemplateBuild(id, {
        sourceType: options.source,
        dockerfilePath: dockerfile,
        imageDestination: image,
        metadata: { localPath: contextPath, templateConfig: templateFile }
      });
      if (options.source === "dockerfile") {
        const context = await createBuildContextArchive(contextPath);
        await client.uploadTemplateBuildContext(result.build.id, {
          archiveBase64: context.archiveBase64,
          sha256: context.sha256,
          sizeBytes: context.sizeBytes,
          format: context.format,
          fileCount: context.fileCount,
          metadata: { localPath: contextPath, dockerfilePath: dockerfile }
        });
        printProgress(`uploaded context ${context.sha256.slice(0, 19)} (${context.sizeBytes} bytes, ${context.fileCount} files)`);
      }
      printProgress(`${result.build.status}. build=${result.build.id}`);
      console.log(result.build.id);
      if (!options.wait) return;
      const finalBuild = await followTemplateBuild(client, result.build, {
        pollIntervalMs: options.pollIntervalMs,
        timeoutSeconds: options.timeout
      });
      if (finalBuild.status === "success") {
        printTemplateBuildSuccess(finalBuild);
        return;
      }
      printProgress(`${finalBuild.status}. build=${finalBuild.id}`);
      throw new Error(`template build ${finalBuild.id} ${finalBuild.status}: ${finalBuild.error ?? "see build logs"}`);
    });

  template
    .command("builds")
    .description("List template builds")
    .option("--status <status>", "filter by build status")
    .option("--query <query>", "filter by build or template id")
    .addHelpText("after", `
Examples:
  $ harakiri template builds --status failed
  $ harakiri template builds --query open-agents-dev
`)
    .action(async (options) => {
      const params = new URLSearchParams();
      if (options.status) params.set("status", options.status);
      if (options.query) params.set("q", options.query);
      const suffix = params.size ? `?${params.toString()}` : "";
      const client = await apiClient();
      const result = await client.listTemplateBuilds(suffix);
      for (const build of result.builds) {
        console.log(`${build.id}\t${build.status}\t${build.templateId}\t${build.createdAt}`);
      }
    });

  template
    .command("logs")
    .argument("<build-id>", "template build id")
    .description("Read template build logs")
    .addHelpText("after", `
Examples:
  $ harakiri template logs bld_...
`)
    .action(async (id) => {
      const client = await apiClient();
      const result = await client.getTemplateBuildLogs(id);
      for (const line of result.logs) console.log(`${line.lineNo}\t${line.stream}\t${line.message}`);
    });

  template
    .command("promote")
    .argument("<template-id>", "template id, name, or alias")
    .requiredOption("--version-id <id>", "template version id")
    .option("--alias <alias>", "alias to promote", "stable")
    .description("Promote a template version")
    .addHelpText("after", `
Examples:
  $ harakiri template promote open-agents-dev --version-id tplv_... --alias stable
`)
    .action(async (id, options) => {
      const client = await apiClient();
      const result = await client.promoteTemplateVersion(id, options.versionId, options.alias);
      printProgress(`promoted ${result.template.id} -> ${result.template.latestVersionId ?? options.versionId}`);
    });

  template
    .command("archive")
    .argument("<template-id>", "template id, name, or alias")
    .description("Archive a custom template")
    .addHelpText("after", `
Examples:
  $ harakiri template archive open-agents-dev
`)
    .action(async (id) => {
      const client = await apiClient();
      const result = await client.archiveTemplate(id);
      printProgress(`archived ${result.template.id}`);
    });
};
