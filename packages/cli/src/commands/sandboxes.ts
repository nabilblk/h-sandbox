import { readFile } from "node:fs/promises";
import type { Command } from "commander";
import { apiClient, loadConfig, saveConfig } from "../config.js";
import { runtimeLine } from "../format.js";
import { collectEnv, parsePositiveInt, printProgress } from "../utils.js";

export const registerSandboxCommands = (program: Command) => {
  program
    .command("create")
    .description("Create a sandbox")
    .requiredOption("--template <id>", "template id")
    .option("--name <name>", "sandbox name")
    .option("--ttl <seconds>", "idle TTL", "300")
    .option("--env <key=value>", "environment variable; can be repeated", collectEnv, {})
    .option("--no-wait", "enqueue sandbox creation and return before provider provisioning finishes")
    .option("--wait-timeout-ms <ms>", "maximum create wait before returning a pending sandbox", parsePositiveInt)
    .action(async (options) => {
      printProgress("provisioning microVM...");
      const started = Date.now();
      const body = {
        template: options.template,
        name: options.name,
        ttlSeconds: Number(options.ttl),
        env: options.env,
        ...(options.wait === false ? { wait: false } : {}),
        ...(options.waitTimeoutMs !== undefined ? { waitTimeoutMs: options.waitTimeoutMs } : {})
      };
      const client = await apiClient();
      const result = await client.createSandbox(body);
      const config = await loadConfig();
      await saveConfig({ ...config, lastSandboxId: result.sandbox.id });
      if (result.status === "pending" || result.operation?.state === "queued" || result.operation?.state === "running") {
        printProgress(`queued. id=${result.sandbox.id}${result.operation ? ` operation=${result.operation.id}` : ""}`);
        console.log(result.sandbox.id);
        printProgress(`accepted in ${Date.now() - started}ms`);
        return;
      }
      printProgress(`sealed. id=${result.sandbox.id}`);
      console.log(result.sandbox.id);
      printProgress(`provisioned in ${Date.now() - started}ms`);
    });

  program
    .command("list")
    .description("List sandboxes")
    .action(async () => {
      const client = await apiClient();
      const result = await client.listSandboxes();
      for (const sandbox of result.sandboxes) {
        console.log(`${sandbox.id}\t${sandbox.status}\t${sandbox.template}\t${sandbox.name}`);
      }
    });

  program
    .command("status")
    .argument("<id>", "sandbox id")
    .description("Show sandbox status")
    .action(async (id) => {
      const client = await apiClient();
      const result = await client.getSandbox(id);
      console.log(`${result.sandbox.id} ${result.sandbox.status} ${result.sandbox.template} ${result.sandbox.publicUrl ?? ""}`.trim());
    });

  program
    .command("run")
    .argument("[id]", "sandbox id")
    .description("Run a command in a sandbox")
    .option("--stdin <file>", "read command input from file")
    .option("--cmd <command>", "command to run")
    .option("--template <id>", "create a temporary sandbox with this template", "python-3.12-data")
    .option("--env <key=value>", "environment variable for temporary sandbox creation; can be repeated", collectEnv, {})
    .action(async (maybeId, options) => {
      const config = await loadConfig();
      const env = options.env as Record<string, string>;
      const hasEnv = Object.keys(env).length > 0;
      let id = maybeId as string | undefined;
      let shouldTerminateAfterRun = false;
      if (!id && config.lastSandboxId) {
        id = config.lastSandboxId;
        shouldTerminateAfterRun = true;
      }
      if (id && hasEnv) throw new Error("--env only applies when harakiri run creates a temporary sandbox");
      const client = await apiClient();
      if (!id) {
        const created = await client.createSandbox({ template: options.template, ttlSeconds: 300, env });
        if (created.status === "pending" || created.operation?.state === "queued" || created.operation?.state === "running") {
          throw new Error(`temporary sandbox ${created.sandbox.id} is still pending; run again after it reaches running`);
        }
        id = created.sandbox.id;
        shouldTerminateAfterRun = true;
        printProgress(`sealed. id=${id}`);
      }

      const stdin = options.stdin ? await readFile(options.stdin, "utf8").catch(() => options.stdin) : undefined;
      const command = options.cmd ?? (options.stdin ? `python ${options.stdin}` : "ls");
      const started = Date.now();
      const result = await client.runSandbox(id, { command, stdin });
      process.stdout.write(result.result.stdout);
      if (result.result.stderr) process.stderr.write(result.result.stderr);
      if (result.result.exitCode === 0) {
        console.log(runtimeLine(result.result.durationMs));
      }
      if (shouldTerminateAfterRun) {
        await client.killSandbox(id);
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
      const client = await apiClient();
      const result = await client.getSandboxLogs(id);
      for (const row of result.logs) console.log(`${row.ts} ${String(row.lvl).toUpperCase()} ${row.msg}`);
    });

  program
    .command("files")
    .argument("<id>", "sandbox id")
    .description("List sandbox files")
    .option("--path <path>", "path to list inside the sandbox")
    .action(async (id, options) => {
      const client = await apiClient();
      const result = await client.listSandboxFiles(id, options.path);
      for (const file of result.files) console.log(`${file.type}\t${file.size}\t${file.path}`);
    });

  program
    .command("kill")
    .argument("[id]", "sandbox id")
    .option("--idle", "kill idle sandboxes")
    .description("Terminate a sandbox")
    .action(async (id, options) => {
      const client = await apiClient();
      if (options.idle) {
        const result = await client.listSandboxes("?status=idle");
        for (const sandbox of result.sandboxes) {
          await client.killSandbox(sandbox.id);
          printProgress(`${sandbox.id} terminated. disk zeroed.`);
        }
        return;
      }
      if (!id) throw new Error("sandbox id is required unless --idle is set");
      await client.killSandbox(id);
      printProgress("sandbox terminated. disk zeroed.");
    });
};
