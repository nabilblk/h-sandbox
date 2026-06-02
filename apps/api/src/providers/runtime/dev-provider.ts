import type { RunResult } from "@harakiri/shared";
import type { EgressNetworkPolicy, EgressNetworkRule } from "@harakiri/shared";
import type {
  RuntimeCreateSandboxInput,
  RuntimeCreateSandboxResult,
  RuntimeExposeRouteInput,
  RuntimeFileEntry,
  RuntimeFileListResult,
  RuntimeFilePathInput,
  RuntimeLogEntry,
  RuntimeMkdirInput,
  RuntimeMetricsSnapshot,
  RuntimeProvider,
  RuntimeReadFileInput,
  RuntimeRemoveFileInput,
  RuntimeRenameFileInput,
  RuntimeRouteTarget,
  RuntimeRunInput,
  RuntimeSandboxRef,
  RuntimeSandboxSummary,
  RuntimeStartCommandInput,
  RuntimeWriteFileInput
} from "./provider.js";
import { configuredRouteTarget } from "./route-targets.js";

type DevSandbox = RuntimeSandboxSummary & {
  name: string;
  defaultCwd: string;
  files: RuntimeFileEntry[];
  fileContents: Map<string, string>;
  logs: RuntimeLogEntry[];
  egressPolicy: EgressNetworkPolicy;
  commands: Map<string, { command: string; stdout: string; stderr: string; exitCode: number | null; running: boolean; startedAt: string; finishedAt: string | null }>;
  commandSessions: Map<string, { cwd: string }>;
};

const nowIso = () => new Date().toISOString();

const devId = () => `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const fallbackFileSet = (cwd: string): RuntimeFileEntry[] => [
  {
    path: `${cwd.replace(/\/+$/, "") || "/"}/agent.py`.replace("//", "/"),
    name: "agent.py",
    type: "file",
    size: 128,
    mode: "0644",
    owner: "dev",
    group: "dev",
    modifiedAt: nowIso()
  },
  {
    path: `${cwd.replace(/\/+$/, "") || "/"}/tmp`.replace("//", "/"),
    name: "tmp",
    type: "directory",
    size: 0,
    mode: "0755",
    owner: "dev",
    group: "dev",
    modifiedAt: nowIso()
  }
];

const normalizeDevPath = (path: string) => {
  if (!path || path.includes("\0")) return "/";
  const safePath = path.startsWith("/") ? path : `/${path}`;
  const parts = safePath.split("/").reduce<string[]>((acc, part) => {
    if (!part || part === ".") return acc;
    if (part === "..") {
      acc.pop();
      return acc;
    }
    acc.push(part);
    return acc;
  }, []);
  return `/${parts.join("/")}` || "/";
};

const entryName = (path: string) => path.split("/").filter(Boolean).pop() ?? path;

const parentPath = (path: string) => {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return `/${parts.join("/")}` || "/";
};

const devFileEntry = (path: string, type: RuntimeFileEntry["type"], size = 0, mode = type === "directory" ? "0755" : "0644"): RuntimeFileEntry => ({
  path,
  name: entryName(path),
  type,
  size,
  mode,
  owner: "dev",
  group: "dev",
  modifiedAt: nowIso()
});

export class InMemoryRuntimeProvider implements RuntimeProvider {
  readonly kind = "dev";
  readonly capabilities = {
    terminal: true,
    sessionCommands: true,
    filesystem: true,
    logs: true,
    metrics: true,
    routes: true,
    egress: true
  };

  private readonly sandboxes = new Map<string, DevSandbox>();

  async create(input: RuntimeCreateSandboxInput): Promise<RuntimeCreateSandboxResult> {
    const providerSandboxId = devId();
    const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000).toISOString();
    const defaultCwd = input.template.workdir || "/";
    const sandbox: DevSandbox = {
      provider: this.kind,
      providerSandboxId,
      state: "running",
      expiresAt,
      metadata: input.metadata ?? {},
      name: input.name,
      defaultCwd,
      files: fallbackFileSet(defaultCwd),
      fileContents: new Map(fallbackFileSet(defaultCwd).filter((file) => file.type === "file").map((file) => [file.path, "print('hello from dev runtime')\n"])),
      logs: [{ ts: nowIso(), lvl: "created", msg: "created through in-memory runtime provider", source: "sandbox" }],
      egressPolicy: input.egressPolicy ?? { defaultAction: "allow", egress: [] },
      commands: new Map(),
      commandSessions: new Map()
    };
    this.sandboxes.set(providerSandboxId, sandbox);
    return {
      ...sandbox,
      runtimeRegistryCredentialId: null,
      runtimeImageAuthProvided: false
    };
  }

  async list(): Promise<RuntimeSandboxSummary[]> {
    return [...this.sandboxes.values()];
  }

  async get(ref: RuntimeSandboxRef): Promise<RuntimeSandboxSummary | null> {
    return this.sandboxes.get(ref.providerSandboxId) ?? null;
  }

  async delete(ref: RuntimeSandboxRef): Promise<void> {
    const sandbox = this.sandboxes.get(ref.providerSandboxId);
    if (!sandbox) return;
    sandbox.state = "terminated";
    sandbox.logs.push({ ts: nowIso(), lvl: "terminated", msg: "sandbox terminated", source: "sandbox" });
  }

  async renew(ref: RuntimeSandboxRef, input: { expiresAt: string }): Promise<void> {
    const sandbox = this.sandboxes.get(ref.providerSandboxId);
    if (!sandbox) return;
    sandbox.expiresAt = input.expiresAt;
    sandbox.logs.push({ ts: nowIso(), lvl: "renewed", msg: "ttl reset", source: "sandbox" });
  }

  async run(input: RuntimeRunInput): Promise<RunResult> {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    const command = input.command.trim() || "ls";
    const context = [input.cwd ? `cwd=${input.cwd}` : undefined, input.timeoutMs ? `timeout=${input.timeoutMs}ms` : undefined]
      .filter(Boolean)
      .join(" ");
    sandbox?.logs.push({ ts: nowIso(), lvl: "run", msg: `command: ${command}${context ? ` ${context}` : ""}`, source: "sandbox" });
    return {
      sandboxId: input.controlPlaneSandboxId,
      command,
      stdout: input.stdin ? `${input.stdin}\n` : `harakiri dev runtime: ${command}\n`,
      stderr: "",
      exitCode: 0,
      durationMs: 1
    };
  }

  async startCommand(input: RuntimeStartCommandInput) {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    const command = input.command.trim() || "ls";
    const providerCommandId = `cmd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const startedAt = nowIso();
    const stdout = input.stdin ? `${input.stdin}\n` : `harakiri dev runtime: ${command}\n`;
    const running = Boolean(input.detached);
    sandbox?.commands.set(providerCommandId, {
      command,
      stdout,
      stderr: "",
      exitCode: running ? null : 0,
      running,
      startedAt,
      finishedAt: running ? null : nowIso()
    });
    sandbox?.logs.push({ ts: startedAt, lvl: "command", msg: `command: ${command}`, source: "sandbox" });
    return {
      providerCommandId,
      status: running ? "running" as const : "succeeded" as const,
      stdout: running ? "" : stdout,
      stderr: "",
      exitCode: running ? null : 0,
      startedAt,
      finishedAt: running ? null : nowIso(),
      durationMs: 1
    };
  }

  async getCommand(input: RuntimeSandboxRef & { providerCommandId: string }) {
    const command = this.sandboxes.get(input.providerSandboxId)?.commands.get(input.providerCommandId);
    if (!command) throw new Error(`command ${input.providerCommandId} not found`);
    return {
      providerCommandId: input.providerCommandId,
      command: command.command,
      status: command.running ? "running" as const : command.exitCode === 0 ? "succeeded" as const : "failed" as const,
      exitCode: command.exitCode,
      error: null,
      startedAt: command.startedAt,
      finishedAt: command.finishedAt
    };
  }

  async commandLogs(input: RuntimeSandboxRef & { providerCommandId: string; cursor?: number }) {
    const command = this.sandboxes.get(input.providerSandboxId)?.commands.get(input.providerCommandId);
    if (!command) throw new Error(`command ${input.providerCommandId} not found`);
    return { stdout: command.stdout, stderr: command.stderr, cursor: input.cursor };
  }

  async interruptCommand(input: RuntimeSandboxRef & { providerCommandId: string }) {
    const command = this.sandboxes.get(input.providerSandboxId)?.commands.get(input.providerCommandId);
    if (!command) return;
    command.running = false;
    command.exitCode = 130;
    command.finishedAt = nowIso();
  }

  async createCommandSession(input: RuntimeSandboxRef & { cwd?: string }) {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    if (!sandbox) throw new Error(`sandbox ${input.providerSandboxId} not found`);
    const providerSessionId = `ses_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const cwd = normalizeDevPath(input.cwd ?? sandbox.defaultCwd);
    sandbox.commandSessions.set(providerSessionId, { cwd });
    sandbox.logs.push({ ts: nowIso(), lvl: "session", msg: `command session created cwd=${cwd}`, source: "sandbox" });
    return { providerSessionId, cwd };
  }

  async runCommandSession(input: RuntimeSandboxRef & { providerSessionId: string; command: string; cwd?: string; timeoutMs?: number }) {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    const session = sandbox?.commandSessions.get(input.providerSessionId);
    if (!sandbox || !session) throw new Error(`command session ${input.providerSessionId} not found`);
    if (input.cwd) session.cwd = normalizeDevPath(input.cwd);
    const command = input.command.trim();
    if (/^cd\s+/.test(command)) {
      session.cwd = normalizeDevPath(command.replace(/^cd\s+/, "").trim());
      return { command, stdout: "", stderr: "", exitCode: 0, durationMs: 1 };
    }
    const stdout = command === "pwd" ? `${session.cwd}\n` : `harakiri dev session ${input.providerSessionId}: ${command}\n`;
    sandbox.logs.push({ ts: nowIso(), lvl: "session", msg: `session command: ${command}`, source: "sandbox" });
    return { command, stdout, stderr: "", exitCode: 0, durationMs: 1 };
  }

  async deleteCommandSession(input: RuntimeSandboxRef & { providerSessionId: string }) {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    if (!sandbox?.commandSessions.delete(input.providerSessionId)) throw new Error(`command session ${input.providerSessionId} not found`);
    sandbox.logs.push({ ts: nowIso(), lvl: "session", msg: `command session deleted`, source: "sandbox" });
  }

  async files(input: RuntimeSandboxRef & { path?: string; defaultCwd: string }): Promise<RuntimeFileListResult> {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    const cwd = normalizeDevPath(input.path ?? sandbox?.defaultCwd ?? input.defaultCwd);
    const files = sandbox?.files ?? fallbackFileSet(cwd);
    return {
      ok: true,
      cwd,
      defaultCwd: input.defaultCwd,
      files: files.filter((file) => parentPath(file.path) === cwd),
      source: "in-memory"
    };
  }

  async statFile(input: RuntimeFilePathInput) {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    const path = normalizeDevPath(input.path);
    const file = sandbox?.files.find((entry) => entry.path === path);
    if (!file) return { ok: false as const, error: { code: "file_not_found", message: "file not found", recoverable: false, statusCode: 404 } };
    return { ok: true as const, file };
  }

  async readFile(input: RuntimeReadFileInput) {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    const path = normalizeDevPath(input.path);
    const file = sandbox?.files.find((entry) => entry.path === path && entry.type === "file");
    if (!file) return { ok: false as const, error: { code: "file_not_found", message: "file not found", recoverable: false, statusCode: 404 } };
    const content = sandbox?.fileContents.get(path) ?? "";
    return {
      ok: true as const,
      path,
      encoding: input.encoding,
      content: input.encoding === "base64" ? Buffer.from(content).toString("base64") : content
    };
  }

  async writeFile(input: RuntimeWriteFileInput) {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    if (!sandbox) return { ok: false as const, error: { code: "file_not_found", message: "sandbox not found", recoverable: false, statusCode: 404 } };
    const path = normalizeDevPath(input.path);
    const content = input.encoding === "base64" ? Buffer.from(input.content, "base64").toString("utf8") : input.content;
    if (input.createParents) {
      const parent = parentPath(path);
      if (!sandbox.files.some((entry) => entry.path === parent)) sandbox.files.push(devFileEntry(parent, "directory", 0));
    }
    const file = devFileEntry(path, "file", Buffer.byteLength(content), input.mode ?? "0644");
    sandbox.files = sandbox.files.filter((entry) => entry.path !== path).concat(file);
    sandbox.fileContents.set(path, content);
    return { ok: true as const, file };
  }

  async mkdir(input: RuntimeMkdirInput) {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    if (!sandbox) return { ok: false as const, error: { code: "file_not_found", message: "sandbox not found", recoverable: false, statusCode: 404 } };
    const path = normalizeDevPath(input.path);
    const file = devFileEntry(path, "directory", 0);
    sandbox.files = sandbox.files.filter((entry) => entry.path !== path).concat(file);
    return { ok: true as const, file };
  }

  async removeFile(input: RuntimeRemoveFileInput) {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    if (!sandbox) return { ok: false as const, error: { code: "file_not_found", message: "sandbox not found", recoverable: false, statusCode: 404 } };
    const path = normalizeDevPath(input.path);
    const found = sandbox.files.some((entry) => entry.path === path || (input.recursive && entry.path.startsWith(`${path}/`)));
    if (!found) return { ok: false as const, error: { code: "file_not_found", message: "file not found", recoverable: false, statusCode: 404 } };
    sandbox.files = sandbox.files.filter((entry) => entry.path !== path && !(input.recursive && entry.path.startsWith(`${path}/`)));
    sandbox.fileContents.delete(path);
    return { ok: true as const, path };
  }

  async renameFile(input: RuntimeRenameFileInput) {
    const sandbox = this.sandboxes.get(input.providerSandboxId);
    if (!sandbox) return { ok: false as const, error: { code: "file_not_found", message: "sandbox not found", recoverable: false, statusCode: 404 } };
    const fromPath = normalizeDevPath(input.fromPath);
    const toPath = normalizeDevPath(input.toPath);
    const file = sandbox.files.find((entry) => entry.path === fromPath);
    if (!file) return { ok: false as const, error: { code: "file_not_found", message: "file not found", recoverable: false, statusCode: 404 } };
    const renamed = { ...file, path: toPath, name: entryName(toPath), modifiedAt: nowIso() };
    sandbox.files = sandbox.files.filter((entry) => entry.path !== fromPath).concat(renamed);
    const content = sandbox.fileContents.get(fromPath);
    if (content !== undefined) {
      sandbox.fileContents.delete(fromPath);
      sandbox.fileContents.set(toPath, content);
    }
    return { ok: true as const, file: renamed };
  }

  async logs(ref: RuntimeSandboxRef): Promise<RuntimeLogEntry[]> {
    return this.sandboxes.get(ref.providerSandboxId)?.logs ?? [];
  }

  async metrics(ref: RuntimeSandboxRef): Promise<RuntimeMetricsSnapshot | null> {
    if (!this.sandboxes.has(ref.providerSandboxId)) return null;
    const ts = nowIso();
    return {
      current: { cpu: 3, mem: 128, diskIo: 0, networkOut: 0, cpuCount: 1, memTotal: 512 },
      series: [{ ts, cpu: 3, mem: 128 }]
    };
  }

  async exposeRoute(input: RuntimeExposeRouteInput): Promise<RuntimeRouteTarget> {
    return configuredRouteTarget({ sandboxId: input.providerSandboxId, port: input.port, provider: "dev" });
  }

  async getEgressPolicy(ref: RuntimeSandboxRef) {
    const sandbox = this.sandboxes.get(ref.providerSandboxId);
    return {
      status: sandbox ? "ok" : "missing",
      mode: sandbox?.egressPolicy.defaultAction === "deny" ? "deny_all" : "allow_all",
      enforcementMode: "dev",
      policy: sandbox?.egressPolicy ?? null
    };
  }

  async setEgressPolicy(ref: RuntimeSandboxRef, policy: EgressNetworkPolicy) {
    const sandbox = this.sandboxes.get(ref.providerSandboxId);
    if (sandbox) {
      sandbox.egressPolicy = policy;
      sandbox.logs.push({ ts: nowIso(), lvl: "egress", msg: `egress policy set to ${policy.defaultAction}`, source: "sandbox" });
    }
    return this.getEgressPolicy(ref);
  }

  async patchEgressRules(ref: RuntimeSandboxRef, rules: EgressNetworkRule[]) {
    const sandbox = this.sandboxes.get(ref.providerSandboxId);
    if (sandbox) {
      const seen = new Set<string>();
      const merged = [...rules, ...sandbox.egressPolicy.egress].filter((rule) => {
        if (seen.has(rule.target)) return false;
        seen.add(rule.target);
        return true;
      });
      sandbox.egressPolicy = { ...sandbox.egressPolicy, egress: merged };
    }
    return this.getEgressPolicy(ref);
  }
}

export const inMemoryRuntimeProvider = new InMemoryRuntimeProvider();
