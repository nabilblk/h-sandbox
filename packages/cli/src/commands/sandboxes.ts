import { readFile, writeFile } from "node:fs/promises";
import type { Command } from "commander";
import WebSocket, { type RawData } from "ws";
import { apiClient, loadConfig, saveConfig } from "../config.js";
import { runtimeLine } from "../format.js";
import { collectEnv, collectString, parsePositiveInt, printProgress } from "../utils.js";

const stdinFramePrefix = 0x00;
const stdoutFramePrefix = 0x01;
const stderrFramePrefix = 0x02;
const replayFramePrefix = 0x03;

const rawDataToBuffer = (data: RawData): Buffer => {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
};

const terminalAttachUrl = (apiUrl: string, sandboxId: string, query: Record<string, string | number | boolean | string[] | undefined>) => {
  const url = new URL(`${apiUrl.replace(/\/+$/, "")}/v1/sandboxes/${encodeURIComponent(sandboxId)}/terminal/attach`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
    } else if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
};

const attachToSandbox = async (
  id: string,
  options: { cwd?: string; shell?: string; env?: Record<string, string>; sessionName?: string; raw?: boolean; cols?: number; rows?: number; since?: number; pty?: boolean }
) => {
  const config = await loadConfig();
  if (!config.apiKey) throw new Error(`missing API key. Run "harakiri login --api-url ${config.apiUrl} --api-key hk_live_..." first.`);
  const ws = new WebSocket(terminalAttachUrl(config.apiUrl, id, {
    cwd: options.cwd,
    shell: options.shell,
    sessionName: options.sessionName,
    env: Object.entries(options.env ?? {}).map(([key, value]) => `${key}=${value}`),
    cols: options.cols,
    rows: options.rows,
    since: options.since,
    pty: options.pty
  }), {
    headers: { "x-api-key": config.apiKey }
  });

  const stdin = process.stdin;
  const stdout = process.stdout;
  const stderr = process.stderr;
  const useRawMode = options.raw !== false && stdin.isTTY && typeof stdin.setRawMode === "function";
  const previousRawMode = stdin.isTTY ? Boolean(stdin.isRaw) : false;
  let connected = false;
  let exitCode = 0;
  let explicitError = false;
  const pendingFrames: Buffer[] = [];

  const sendJson = (payload: Record<string, unknown>) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  };
  const sendResize = () => {
    const cols = options.cols ?? stdout.columns;
    const rows = options.rows ?? stdout.rows;
    if (cols && rows) sendJson({ type: "resize", cols, rows });
  };
  const sendFrame = (frame: Buffer) => {
    if (connected && ws.readyState === WebSocket.OPEN) {
      ws.send(frame, { binary: true });
      return;
    }
    pendingFrames.push(frame);
  };
  const flushPendingFrames = () => {
    while (pendingFrames.length && ws.readyState === WebSocket.OPEN) {
      ws.send(pendingFrames.shift() as Buffer, { binary: true });
    }
  };
  const onStdinData = (chunk: Buffer) => {
    sendFrame(Buffer.concat([Buffer.from([stdinFramePrefix]), chunk]));
  };
  const onSigint = () => {
    sendJson({ type: "signal", signal: "SIGINT" });
  };
  const cleanup = () => {
    stdin.off("data", onStdinData);
    stdout.off("resize", sendResize);
    process.off("SIGINT", onSigint);
    if (useRawMode) stdin.setRawMode(previousRawMode);
    if (!previousRawMode) stdin.pause();
  };

  return await new Promise<number>((resolve, reject) => {
    ws.on("open", () => {
      if (useRawMode) stdin.setRawMode(true);
      stdin.resume();
      stdin.on("data", onStdinData);
      stdout.on("resize", sendResize);
      process.on("SIGINT", onSigint);
    });
    ws.on("message", (data, isBinary) => {
      if (!isBinary) {
        const text = rawDataToBuffer(data).toString("utf8");
        try {
          const frame = JSON.parse(text) as { type?: string; code?: string; error?: string; message?: string; exit_code?: number };
          if (frame.type === "connected") {
            connected = true;
            sendResize();
            flushPendingFrames();
            return;
          }
          if (frame.type === "exit") {
            exitCode = typeof frame.exit_code === "number" ? frame.exit_code : exitCode;
            return;
          }
          if (frame.type === "error") {
            exitCode = 1;
            explicitError = true;
            stderr.write(`harakiri attach: ${frame.code ?? "error"}${frame.error ? `: ${frame.error}` : ""}\n`);
            return;
          }
          if (frame.error) {
            exitCode = 1;
            explicitError = true;
            stderr.write(`harakiri attach: ${frame.error}${frame.message ? `: ${frame.message}` : ""}\n`);
            return;
          }
        } catch {
          stderr.write(text.endsWith("\n") ? text : `${text}\n`);
          return;
        }
        return;
      }

      const buffer = rawDataToBuffer(data);
      if (!buffer.length) return;
      const payload = buffer.subarray(1);
      if (buffer[0] === stdoutFramePrefix) stdout.write(payload);
      else if (buffer[0] === stderrFramePrefix) stderr.write(payload);
      else if (buffer[0] === replayFramePrefix) stdout.write(buffer.subarray(9));
      else stdout.write(buffer);
    });
    ws.on("error", (error) => {
      cleanup();
      reject(error);
    });
    ws.on("close", (code, reason) => {
      cleanup();
      const suffix = reason.length ? `: ${reason.toString("utf8")}` : "";
      if (code !== 1000 && !explicitError) {
        stderr.write(`harakiri attach: connection closed (${code})${suffix}\n`);
      }
      if (code === 1000 && !connected && !explicitError) {
        stderr.write(`harakiri attach: connection closed before the terminal was ready${suffix}\n`);
      } else if (code === 1000 && connected && !explicitError && stderr.isTTY) {
        stderr.write(`harakiri attach: session closed${suffix}\n`);
      }
      resolve(exitCode || (code === 1000 && connected ? 0 : 1));
    });
  });
};

export const registerSandboxCommands = (program: Command) => {
  program
    .command("create")
    .description("Create a sandbox")
    .requiredOption("--template <id>", "template id")
    .option("--name <name>", "sandbox name")
    .option("--ttl <seconds>", "idle TTL", "300")
    .option("--env <key=value>", "environment variable; can be repeated", collectEnv, {})
    .option("--egress <mode>", "outbound access mode: open, restricted, blocked, custom")
    .option("--egress-preset <preset>", "outbound access preset; can be repeated", collectString, [])
    .option("--allow <domain>", "allow outbound domain; can be repeated", collectString, [])
    .option("--deny <domain>", "deny outbound domain; can be repeated", collectString, [])
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
        ...(
          options.egress || options.egressPreset.length || options.allow.length || options.deny.length
            ? {
                egress: {
                  mode: options.egress,
                  presets: options.egressPreset,
                  allow: options.allow,
                  deny: options.deny
                }
              }
            : {}
        ),
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
    .command("renew")
    .argument("<id>", "sandbox id")
    .description("Renew a sandbox TTL")
    .action(async (id) => {
      const client = await apiClient();
      await client.renewSandbox(id);
      printProgress("sandbox TTL renewed.");
    });

  program
    .command("capabilities")
    .description("Show runtime provider capabilities")
    .action(async () => {
      const client = await apiClient();
      const result = await client.getRuntimeCapabilities();
      console.log(`provider\t${result.provider}`);
      console.log("capability\tstate\tcontract\trequired\tsource\treason");
      for (const capability of result.capabilities) {
        console.log(`${capability.name}\t${capability.state}\t${capability.contract}\t${capability.required ? "yes" : "no"}\t${capability.source}\t${capability.reason ?? "-"}`);
      }
    });

  program
    .command("run")
    .argument("[id]", "sandbox id")
    .description("Run a command in a sandbox")
    .option("--stdin <file>", "read command input from file")
    .option("--cmd <command>", "command to run")
    .option("--cwd <path>", "working directory inside the sandbox")
    .option("--timeout-ms <ms>", "command timeout in milliseconds", parsePositiveInt)
    .option("--run-env <key=value>", "environment variable for this command; can be repeated", collectEnv, {})
    .option("--template <id>", "create a temporary sandbox with this template", "python-3.12-data")
    .option("--env <key=value>", "environment variable for temporary sandbox creation; can be repeated", collectEnv, {})
    .action(async (maybeId, options) => {
      const config = await loadConfig();
      const env = options.env as Record<string, string>;
      const runEnv = options.runEnv as Record<string, string>;
      const hasEnv = Object.keys(env).length > 0;
      const hasRunEnv = Object.keys(runEnv).length > 0;
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
      const result = await client.runSandbox(id, {
        command,
        stdin,
        cwd: options.cwd,
        env: hasRunEnv ? runEnv : undefined,
        timeoutMs: options.timeoutMs
      });
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
    .command("attach")
    .argument("<id>", "sandbox id")
    .description("Attach an interactive terminal to a running sandbox")
    .option("--cwd <path>", "working directory inside the sandbox")
    .option("--shell <path>", "shell to request for the terminal session")
    .option("--env <key=value>", "environment variable for the terminal session; can be repeated", collectEnv, {})
    .option("--session-name <name>", "client-visible terminal session name")
    .option("--cols <n>", "initial terminal columns", parsePositiveInt)
    .option("--rows <n>", "initial terminal rows", parsePositiveInt)
    .option("--since <offset>", "replay PTY output from an OpenSandbox output offset", parsePositiveInt)
    .option("--no-raw", "do not put the local terminal into raw mode")
    .action(async (id, options) => {
      process.exitCode = await attachToSandbox(id, {
        cwd: options.cwd,
        shell: options.shell,
        env: Object.keys(options.env).length ? options.env : undefined,
        sessionName: options.sessionName,
        cols: options.cols,
        rows: options.rows,
        since: options.since,
        raw: options.raw
      });
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
    .command("file-stat")
    .argument("<id>", "sandbox id")
    .requiredOption("--path <path>", "path inside the sandbox")
    .description("Read sandbox file metadata")
    .action(async (id, options) => {
      const client = await apiClient();
      const result = await client.statSandboxFile(id, options.path);
      console.log(`${result.file.type}\t${result.file.size}\t${result.file.path}`);
    });

  program
    .command("file-read")
    .argument("<id>", "sandbox id")
    .requiredOption("--path <path>", "path inside the sandbox")
    .option("--encoding <encoding>", "content encoding: utf8 or base64", "utf8")
    .description("Read a sandbox file")
    .action(async (id, options) => {
      const client = await apiClient();
      const encoding = options.encoding === "base64" ? "base64" : "utf8";
      const result = await client.readSandboxFile(id, options.path, { encoding });
      process.stdout.write(result.content);
      if (result.encoding === "utf8" && !result.content.endsWith("\n")) process.stdout.write("\n");
    });

  program
    .command("file-write")
    .argument("<id>", "sandbox id")
    .requiredOption("--path <path>", "path inside the sandbox")
    .option("--content <content>", "file content")
    .option("--from <file>", "read file content from a local file")
    .option("--encoding <encoding>", "content encoding: utf8 or base64", "utf8")
    .option("--mode <mode>", "file mode, for example 0644")
    .option("--parents", "create parent directories")
    .description("Write a sandbox file")
    .action(async (id, options) => {
      if (!options.content && !options.from) throw new Error("--content or --from is required");
      const content = options.from ? await readFile(options.from, "utf8") : options.content;
      const client = await apiClient();
      const encoding = options.encoding === "base64" ? "base64" : "utf8";
      const result = await client.writeSandboxFile(id, {
        path: options.path,
        content,
        encoding,
        mode: options.mode,
        createParents: options.parents
      });
      console.log(`${result.file.type}\t${result.file.size}\t${result.file.path}`);
    });

  program
    .command("file-upload")
    .argument("<id>", "sandbox id")
    .requiredOption("--path <path>", "destination path inside the sandbox")
    .requiredOption("--from <file>", "local file to upload")
    .option("--mode <mode>", "file mode, for example 0644")
    .option("--parents", "create parent directories")
    .description("Upload a local artifact into a sandbox")
    .action(async (id, options) => {
      const content = await readFile(options.from);
      const client = await apiClient();
      const result = await client.uploadSandboxFile(id, {
        path: options.path,
        contentBase64: content.toString("base64"),
        sizeBytes: content.byteLength,
        mode: options.mode,
        createParents: options.parents
      });
      console.log(`${result.file.type}\t${result.sizeBytes}\t${result.sha256}\t${result.file.path}`);
    });

  program
    .command("file-download")
    .argument("<id>", "sandbox id")
    .requiredOption("--path <path>", "source path inside the sandbox")
    .option("--to <file>", "local destination; stdout is used when omitted")
    .description("Download a sandbox artifact")
    .action(async (id, options) => {
      const client = await apiClient();
      const result = await client.downloadSandboxFile(id, options.path);
      const content = Buffer.from(result.contentBase64, "base64");
      if (options.to) {
        await writeFile(options.to, content);
        console.log(`${result.sizeBytes}\t${result.sha256}\t${options.to}`);
        return;
      }
      process.stdout.write(content);
    });

  program
    .command("file-mkdir")
    .argument("<id>", "sandbox id")
    .requiredOption("--path <path>", "path inside the sandbox")
    .option("--recursive", "create parent directories")
    .description("Create a sandbox directory")
    .action(async (id, options) => {
      const client = await apiClient();
      const result = await client.mkdirSandboxFile(id, { path: options.path, recursive: options.recursive });
      console.log(`${result.file.type}\t${result.file.size}\t${result.file.path}`);
    });

  program
    .command("file-rm")
    .argument("<id>", "sandbox id")
    .requiredOption("--path <path>", "path inside the sandbox")
    .option("--recursive", "remove directories recursively")
    .description("Remove a sandbox file or directory")
    .action(async (id, options) => {
      const client = await apiClient();
      const result = await client.removeSandboxFile(id, options.path, { recursive: options.recursive });
      printProgress(`removed ${result.path}`);
    });

  program
    .command("file-rename")
    .argument("<id>", "sandbox id")
    .requiredOption("--from <path>", "source path inside the sandbox")
    .requiredOption("--to <path>", "destination path inside the sandbox")
    .description("Rename a sandbox file")
    .action(async (id, options) => {
      const client = await apiClient();
      const result = await client.renameSandboxFile(id, { fromPath: options.from, toPath: options.to });
      console.log(`${result.file.type}\t${result.file.size}\t${result.file.path}`);
    });

  program
    .command("metrics")
    .argument("<id>", "sandbox id")
    .description("Read sandbox metrics")
    .action(async (id) => {
      const client = await apiClient();
      const result = await client.getSandboxMetrics(id);
      const current = result.current;
      console.log(`cpu\t${current.cpu}%`);
      console.log(`mem\t${current.mem} MB`);
      console.log(`disk_io\t${current.diskIo}`);
      console.log(`network_out\t${current.networkOut}`);
      if (current.cpuCount !== undefined) console.log(`cpu_count\t${current.cpuCount}`);
      if (current.memTotal !== undefined) console.log(`mem_total\t${current.memTotal} MB`);
      console.log(`series\t${result.series.length}`);
    });

  const command = program
    .command("command")
    .description("Manage tracked sandbox commands");

  command
    .command("run")
    .argument("<id>", "sandbox id")
    .requiredOption("--cmd <command>", "command to run")
    .option("--cwd <path>", "working directory inside the sandbox")
    .option("--timeout-ms <ms>", "command timeout in milliseconds", parsePositiveInt)
    .option("--run-env <key=value>", "environment variable for this command; can be repeated", collectEnv, {})
    .option("--detached", "start a background command and return its command id")
    .description("Start a tracked command")
    .action(async (id, options) => {
      const client = await apiClient();
      const runEnv = options.runEnv as Record<string, string>;
      const result = await client.startCommand(id, {
        command: options.cmd,
        cwd: options.cwd,
        timeoutMs: options.timeoutMs,
        env: Object.keys(runEnv).length ? runEnv : undefined,
        detached: options.detached
      });
      if (options.detached) {
        console.log(`${result.command.id}\t${result.command.status}\t${result.command.providerCommandId ?? ""}`.trim());
        return;
      }
      process.stdout.write(result.command.stdout);
      if (result.command.stderr) process.stderr.write(result.command.stderr);
      console.log(`${result.command.id}\t${result.command.status}\texit=${result.command.exitCode ?? "-"}`);
    });

  command
    .command("list")
    .argument("<id>", "sandbox id")
    .description("List tracked commands")
    .action(async (id) => {
      const client = await apiClient();
      const result = await client.listCommands(id);
      for (const row of result.commands) console.log(`${row.id}\t${row.status}\t${row.detached ? "detached" : "foreground"}\t${row.command}`);
    });

  command
    .command("status")
    .argument("<id>", "sandbox id")
    .argument("<command-id>", "command id")
    .description("Read tracked command status")
    .action(async (id, commandId) => {
      const client = await apiClient();
      const result = await client.getCommand(id, commandId);
      console.log(`${result.command.id}\t${result.command.status}\texit=${result.command.exitCode ?? "-"}\t${result.command.command}`);
    });

  command
    .command("logs")
    .argument("<id>", "sandbox id")
    .argument("<command-id>", "command id")
    .option("--cursor <line>", "line cursor for detached command logs", parsePositiveInt)
    .option("--tail <lines>", "return only the last N stdout/stderr lines", parsePositiveInt)
    .description("Read tracked command logs")
    .action(async (id, commandId, options) => {
      const client = await apiClient();
      const result = await client.getCommandLogs(id, commandId, { cursor: options.cursor, tail: options.tail });
      process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      if (result.stdoutTruncated || result.stderrTruncated) printProgress(`tail=${result.tail} truncated=${[result.stdoutTruncated ? "stdout" : "", result.stderrTruncated ? "stderr" : ""].filter(Boolean).join(",")}`);
      if (result.cursor !== undefined) printProgress(`cursor=${result.cursor}`);
    });

  command
    .command("kill")
    .argument("<id>", "sandbox id")
    .argument("<command-id>", "command id")
    .description("Interrupt a tracked command")
    .action(async (id, commandId) => {
      const client = await apiClient();
      const result = await client.killCommand(id, commandId);
      printProgress(`${result.command.id} ${result.command.status}`);
    });

  const session = command
    .command("session")
    .description("Manage persistent command sessions");

  session
    .command("create")
    .argument("<id>", "sandbox id")
    .option("--cwd <path>", "working directory inside the sandbox")
    .description("Create a persistent command session")
    .action(async (id, options) => {
      const client = await apiClient();
      const result = await client.commands.sessions.create(id, { cwd: options.cwd });
      console.log(result.session.id);
      printProgress(`${result.session.status} cwd=${result.session.cwd ?? "-"}`);
    });

  session
    .command("run")
    .argument("<id>", "sandbox id")
    .argument("<session-id>", "command session id")
    .requiredOption("--cmd <command>", "command to run")
    .option("--cwd <path>", "working directory override for this run")
    .option("--timeout-ms <ms>", "command timeout in milliseconds", parsePositiveInt)
    .description("Run a command in a persistent session")
    .action(async (id, sessionId, options) => {
      const client = await apiClient();
      const result = await client.commands.sessions.run(id, sessionId, {
        command: options.cmd,
        cwd: options.cwd,
        timeoutMs: options.timeoutMs
      });
      process.stdout.write(result.result.stdout);
      if (result.result.stderr) process.stderr.write(result.result.stderr);
      console.log(runtimeLine(result.result.durationMs));
      if (result.result.exitCode !== 0) process.exitCode = result.result.exitCode;
    });

  session
    .command("delete")
    .alias("rm")
    .argument("<id>", "sandbox id")
    .argument("<session-id>", "command session id")
    .description("Delete a persistent command session")
    .action(async (id, sessionId) => {
      const client = await apiClient();
      const result = await client.commands.sessions.delete(id, sessionId);
      printProgress(`${result.session.id} ${result.session.status}`);
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
